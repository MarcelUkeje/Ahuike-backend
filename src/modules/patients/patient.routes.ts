import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { parseInput } from '../../lib/validation.js';
import { HttpError } from '../../lib/http-error.js';
import type { PatientRepository } from './patient.repository.js';
import type { UserRepository } from '../users/user.repository.js';

const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  dob: z.string().optional(),
  gender: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  medicalHistory: z.string().optional(),
});

export function patientRoutes(
  patients: PatientRepository,
  users?: UserRepository // Optional for backwards compatibility, ideally injected from app.ts
): FastifyPluginAsync {
  return async (app) => {

    /** GET /api/v1/patients/me/recent-doctors — returns doctors the patient has seen recently */
    app.get('/me/recent-doctors', { preHandler: [app.authenticate] }, async (request) => {
      const userId = request.user.sub;
      const sql = (await import('../../lib/db.js')).getDb();
      
      const rows = await sql`
        SELECT 
          d.id, u.name, d.slug, d.specialty, d.image_url, d.rating, d.consultation_fee,
          (
            SELECT json_build_object('id', s.id, 'slot_date', s.slot_date, 'start_time', s.start_time)
            FROM appointment_slots s
            WHERE s.doctor_id = d.id AND s.is_booked = false AND (s.slot_date > CURRENT_DATE OR (s.slot_date = CURRENT_DATE AND s.start_time > CURRENT_TIME))
            ORDER BY s.slot_date ASC, s.start_time ASC
            LIMIT 1
          ) as next_slot,
          MAX(a.created_at) as last_appointment_date
        FROM doctors d
        JOIN users u ON d.user_id = u.id
        JOIN appointments a ON a.doctor_id = d.id
        JOIN patients p ON a.patient_id = p.id
        WHERE p.user_id = ${userId} AND a.status IN ('completed', 'confirmed')
        GROUP BY d.id, u.name, d.slug, d.specialty, d.image_url, d.rating, d.consultation_fee
        ORDER BY last_appointment_date DESC
        LIMIT 5
      ` as any[];

      const doctors = rows.map(row => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        specialty: row.specialty,
        imageUrl: row.image_url,
        rating: Number(row.rating),
        consultationFee: row.consultation_fee,
        lastAppointmentDate: row.last_appointment_date,
        nextAvailableSlot: row.next_slot ? (typeof row.next_slot === 'string' ? JSON.parse(row.next_slot) : row.next_slot) : null
      }));

      return { data: doctors };
    });

    
    /** GET /api/v1/patients/me — returns the authenticated patient's own profile */
    app.get('/me', { preHandler: [app.authenticate] }, async (request) => {
      const userId = request.user.sub;
      const profile = await patients.findByUserId(userId);
      if (!profile) {
        throw new HttpError(404, 'PATIENT_NOT_FOUND', 'Patient profile not found.');
      }
      return { data: profile };
    });

    /** PUT /api/v1/patients/me — updates the patient profile */
    app.put('/me', { preHandler: [app.authenticate] }, async (request) => {
      const userId = request.user.sub;
      const input = parseInput(updateProfileSchema, request.body);
      
      const updated = await patients.update(userId, input);
      return { data: updated };
    });

    /** DELETE /api/v1/patients/me — soft-deletes the user account */
    app.delete('/me', { preHandler: [app.authenticate] }, async (request, reply) => {
      if (!users) {
        throw new HttpError(500, 'INTERNAL_ERROR', 'UserRepository not injected');
      }
      
      const userId = request.user.sub;
      await users.softDelete(userId);
      return reply.code(204).send();
    });

  };
}
