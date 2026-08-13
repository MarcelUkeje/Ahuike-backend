import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { HttpError } from '../../lib/http-error.js';
import { parseInput } from '../../lib/validation.js';
import type { AppointmentRepository } from './appointment.repository.js';
import type { DoctorRepository } from '../doctors/doctor.repository.js';

const createAppointmentSchema = z.object({
  doctorId:        z.string().min(1),
  departmentId:    z.string().min(1),
  slotId:          z.string().min(1),
  reasonForVisit:  z.string().trim().min(3).max(500),
});

/** Extract and validate the X-Patient-Id development header. */
function requirePatientId(headers: Record<string, unknown>): string {
  const id = headers['x-patient-id'];
  if (typeof id !== 'string' || !id.trim()) {
    throw new HttpError(401, 'UNAUTHENTICATED', 'A patient session is required.');
  }
  return id.trim();
}

export function appointmentRoutes(
  appointments: AppointmentRepository,
  doctors: DoctorRepository,
): FastifyPluginAsync {
  return async (app) => {
    // GET /api/v1/appointments
    app.get('/', async (request) => {
      const patientId = requirePatientId(request.headers);
      return { data: await appointments.listForPatient(patientId) };
    });

    // GET /api/v1/appointments/:appointmentId
    app.get('/:appointmentId', async (request) => {
      const patientId = requirePatientId(request.headers);
      const { appointmentId } = parseInput(
        z.object({ appointmentId: z.uuid() }),
        request.params,
      );
      const appointment = await appointments.findById(appointmentId);
      if (!appointment || appointment.patientId !== patientId) {
        throw new HttpError(404, 'APPOINTMENT_NOT_FOUND', 'Appointment not found.');
      }
      return { data: appointment };
    });

    // POST /api/v1/appointments
    app.post('/', async (request, reply) => {
      const patientId = requirePatientId(request.headers);
      const input = parseInput(createAppointmentSchema, request.body);

      // 1. Verify the slot exists and is still available
      const slot = await doctors.findSlotById(input.slotId);
      if (!slot) {
        throw new HttpError(404, 'SLOT_NOT_FOUND', 'Appointment slot not found.');
      }
      if (slot.isBooked) {
        throw new HttpError(409, 'SLOT_UNAVAILABLE', 'This appointment slot is no longer available.');
      }
      if (slot.doctorId !== input.doctorId) {
        throw new HttpError(422, 'SLOT_MISMATCH', 'The slot does not belong to the specified doctor.');
      }

      // 2. Fetch the doctor to get the server-authoritative consultation fee
      const doctor = await doctors.findById(input.doctorId);
      if (!doctor) {
        throw new HttpError(404, 'DOCTOR_NOT_FOUND', 'Doctor not found.');
      }

      // 3. Mark slot as booked, then create the appointment
      await doctors.markSlotBooked(input.slotId);
      const appointment = await appointments.create({
        patientId,
        doctorId: input.doctorId,
        departmentId: input.departmentId,
        slotId: input.slotId,
        reasonForVisit: input.reasonForVisit,
        consultationFee: doctor.consultationFee, // server-side authoritative value
      });

      return reply.code(201).send({ data: appointment });
    });
  };
}
