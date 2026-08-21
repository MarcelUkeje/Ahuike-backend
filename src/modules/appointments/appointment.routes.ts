import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { HttpError } from '../../lib/http-error.js';
import { PAGINATION_DEFAULTS } from '../../lib/pagination.js';
import { parseInput } from '../../lib/validation.js';
import type { AppointmentRepository } from './appointment.repository.js';
import type { DoctorRepository } from '../doctors/doctor.repository.js';
import { getDb } from '../../lib/db.js';
import { sendAppointmentConfirmationEmail } from '../emails/email.service.js';

const createAppointmentSchema = z.object({
  doctorId:       z.string().min(1),
  departmentId:   z.string().min(1),
  slotId:         z.string().min(1),
  reasonForVisit: z.string().trim().min(3).max(500),
});

const listQuerySchema = z.object({
  status: z.enum(['pending', 'confirmed', 'completed', 'cancelled', 'no_show']).optional(),
  limit:  z.coerce.number().int().min(1).max(PAGINATION_DEFAULTS.maxLimit).default(PAGINATION_DEFAULTS.limit),
  offset: z.coerce.number().int().min(0).default(PAGINATION_DEFAULTS.offset),
});

export function appointmentRoutes(
  appointmentRepo: AppointmentRepository,
  doctors: DoctorRepository,
): FastifyPluginAsync {
  return async (app) => {
    // All appointment routes require a valid JWT
    app.addHook('preHandler', app.authenticate);

    // GET /api/v1/appointments[?status=&limit=&offset=]
    app.get('/', async (request) => {
      const patientId = request.user.sub;
      const query = parseInput(listQuerySchema, request.query);
      const { status, ...page } = query;
      const result = await appointmentRepo.listForPatient(
        patientId,
        status !== undefined ? { status, ...page } : page,
      );
      return { data: result.items, meta: result.meta };
    });

    // GET /api/v1/appointments/:appointmentId
    app.get('/:appointmentId', async (request) => {
      const patientId = request.user.sub;
      const { appointmentId } = parseInput(
        z.object({ appointmentId: z.string().uuid() }),
        request.params,
      );
      const appointment = await appointmentRepo.findById(appointmentId);
      if (!appointment || appointment.patientId !== patientId) {
        throw new HttpError(404, 'APPOINTMENT_NOT_FOUND', 'Appointment not found.');
      }
      return { data: appointment };
    });

    // POST /api/v1/appointments
    app.post('/', async (request, reply) => {
      const patientId = request.user.sub;
      const input = parseInput(createAppointmentSchema, request.body);

      // ── 1. Atomically claim the slot (one round-trip; rejects past slots too) ──
      const slot = await doctors.atomicClaimSlot(input.slotId);
      if (!slot) {
        throw new HttpError(
          409,
          'SLOT_UNAVAILABLE',
          'This appointment slot is no longer available or has already passed.',
        );
      }

      // ── 2. Cross-validate: slot → doctor → department ─────────────────────────
      if (slot.doctorId !== input.doctorId) {
        await doctors.releaseSlot(input.slotId);
        throw new HttpError(422, 'SLOT_MISMATCH', 'The slot does not belong to the specified doctor.');
      }

      const doctor = await doctors.findById(input.doctorId);
      if (!doctor) {
        await doctors.releaseSlot(input.slotId);
        throw new HttpError(404, 'DOCTOR_NOT_FOUND', 'Doctor not found.');
      }

      if (doctor.departmentId !== input.departmentId) {
        await doctors.releaseSlot(input.slotId);
        throw new HttpError(422, 'DEPARTMENT_MISMATCH', 'Doctor does not belong to the specified department.');
      }

      // ── 3. Create the appointment (compensate on failure) ─────────────────────
      try {
        const appointment = await appointmentRepo.create({
          patientId,
          doctorId: input.doctorId,
          departmentId: input.departmentId,
          slotId: input.slotId,
          reasonForVisit: input.reasonForVisit,
          consultationFee: doctor.consultationFee,
        });

        return reply.code(201).send({ data: appointment });
      } catch (err) {
        await doctors.releaseSlot(input.slotId);
        throw err;
      }
    });

    // POST /api/v1/appointments/:appointmentId/confirm
    app.post('/:appointmentId/confirm', async (request, reply) => {
      const patientId = request.user.sub;
      const { appointmentId } = parseInput(
        z.object({ appointmentId: z.string().uuid() }),
        request.params,
      );

      const appointment = await appointmentRepo.findById(appointmentId);
      if (!appointment || appointment.patientId !== patientId) {
        throw new HttpError(404, 'APPOINTMENT_NOT_FOUND', 'Appointment not found.');
      }

      await appointmentRepo.confirmPayment(appointmentId);

      const dbUrl = process.env.DATABASE_URL;
      const resendApiKey = process.env.RESEND_API_KEY;

      if (dbUrl && resendApiKey && resendApiKey !== 're_REPLACE_WITH_YOUR_RESEND_API_KEY') {
        // Run email delivery asynchronously in the background so it does not block the response
        (async () => {
          try {
            const sql = getDb();
            const rows = (await sql`
              SELECT 
                p.name AS patient_name,
                p.email AS patient_email,
                d.name AS doctor_name,
                d.specialty,
                s.slot_date,
                s.start_time
              FROM appointments a
              JOIN patients p ON a.patient_id = p.id
              JOIN doctors d ON a.doctor_id = d.id
              JOIN appointment_slots s ON a.slot_id = s.id
              WHERE a.id = ${appointmentId}
            `) as Record<string, unknown>[];

            if (rows.length > 0) {
              const row = rows[0]!;
              await sendAppointmentConfirmationEmail(resendApiKey, {
                to: row.patient_email as string,
                patientName: row.patient_name as string,
                doctorName: row.doctor_name as string,
                specialty: row.specialty as string,
                slotDate: String(row.slot_date).substring(0, 10),
                slotTime: String(row.start_time).substring(0, 5),
                consultationFee: appointment.consultationFee,
                reasonForVisit: appointment.reasonForVisit,
              });
              request.log.info(`Appointment confirmation email sent to ${row.patient_email}`);
            }
          } catch (emailErr) {
            request.log.error(emailErr, `Failed to send appointment confirmation email for ${appointmentId}`);
          }
        })();
      }

      return reply.code(200).send({ data: { status: 'confirmed' } });
    });


    // DELETE /api/v1/appointments/:appointmentId
    app.delete('/:appointmentId', async (request, reply) => {
      const patientId = request.user.sub;
      const { appointmentId } = parseInput(
        z.object({ appointmentId: z.string().uuid() }),
        request.params,
      );

      const appointment = await appointmentRepo.findById(appointmentId);
      if (!appointment || appointment.patientId !== patientId) {
        throw new HttpError(404, 'APPOINTMENT_NOT_FOUND', 'Appointment not found.');
      }

      await appointmentRepo.delete(appointmentId);
      return reply.code(204).send();
    });
  };
}
