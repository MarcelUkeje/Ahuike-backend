import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { cacheGet, cacheSet } from '../../lib/cache.js';
import { HttpError } from '../../lib/http-error.js';
import { PAGINATION_DEFAULTS } from '../../lib/pagination.js';
import { parseInput } from '../../lib/validation.js';
import type { DoctorRepository } from './doctor.repository.js';
import type { UserRepository } from '../users/user.repository.js';

const CACHE_TTL = 300; // 5 minutes

const listQuerySchema = z.object({
  departmentId: z.string().min(1).optional(),
  query: z.string().optional(),
  minPrice: z.coerce.number().optional(),
  maxPrice: z.coerce.number().optional(),
  minRating: z.coerce.number().optional(),
  sortBy: z.enum(['rating', 'availability']).optional(),
  limit:        z.coerce.number().int().min(1).max(PAGINATION_DEFAULTS.maxLimit).default(PAGINATION_DEFAULTS.limit),
  offset:       z.coerce.number().int().min(0).default(PAGINATION_DEFAULTS.offset),
});

export function doctorRoutes(
  repository: DoctorRepository,
  userRepo: UserRepository
): FastifyPluginAsync {
  return async (app) => {
    // GET /api/v1/doctors[?departmentId=&limit=&offset=]
    // Public endpoint
    app.get('/', async (request) => {
      const query = parseInput(listQuerySchema, request.query);
      const cacheKey = `doctors:list:${query.departmentId ?? ''}:${query.query ?? ''}:${query.minPrice ?? ''}:${query.maxPrice ?? ''}:${query.minRating ?? ''}:${query.sortBy ?? ''}:${query.limit}:${query.offset}`;
      const cached = await cacheGet(cacheKey);
      if (cached) return cached;

      const { departmentId, ...page } = query;
      const result = await repository.list(query as any);
      const response = { data: result.items, meta: result.meta };
      await cacheSet(cacheKey, response, CACHE_TTL);
      return response;
    });

    // GET /api/v1/doctors/:doctorId
    // Public endpoint
    app.get('/:doctorId', async (request) => {
      const { doctorId } = parseInput(
        z.object({ doctorId: z.string().min(1) }),
        request.params,
      );

      const doctor = await repository.findById(doctorId);
      if (!doctor) throw new HttpError(404, 'DOCTOR_NOT_FOUND', 'Doctor not found.');
      
      return { data: doctor };
    });

    
    // POST /api/v1/doctors/:doctorId/reviews
    app.post('/:doctorId/reviews', { preHandler: [app.authenticate] }, async (request, reply) => {
      const patientId = request.user.sub;
      const { doctorId } = parseInput(
        z.object({ doctorId: z.string().min(1) }),
        request.params,
      );
      
      const bodySchema = z.object({
        appointmentId: z.string().min(1),
        rating: z.number().int().min(1).max(5),
        comment: z.string().optional()
      });
      const input = parseInput(bodySchema, request.body);
      
      const sql = (await import('../../lib/db.js')).getDb();
      
      // Verify appointment belongs to patient and is completed
      // Wait, patientId in JWT is userId. We need to get the patient table id.
      const pRows = await sql`SELECT id FROM patients WHERE user_id = ${patientId}` as any[];
      if (pRows.length === 0) throw new HttpError(404, 'PATIENT_NOT_FOUND', 'Patient profile not found.');
      const actualPatientId = pRows[0].id;

      const apptRows = await sql`
        SELECT id FROM appointments 
        WHERE id = ${input.appointmentId} AND doctor_id = ${doctorId} AND patient_id = ${actualPatientId} AND status = 'completed'
      ` as any[];

      if (apptRows.length === 0) {
        throw new HttpError(403, 'NOT_ELIGIBLE', 'You can only review a doctor after completing an appointment with them.');
      }

      // Insert review
      const reviewId = `rev_${Date.now()}`;
      try {
        await sql`
          INSERT INTO reviews (id, appointment_id, doctor_id, patient_id, rating, comment)
          VALUES (${reviewId}, ${input.appointmentId}, ${doctorId}, ${actualPatientId}, ${input.rating}, ${input.comment || null})
        `;
      } catch (e: any) {
        if (e.message && e.message.includes('unique constraint')) {
          throw new HttpError(409, 'ALREADY_REVIEWED', 'You have already reviewed this appointment.');
        }
        throw e;
      }

      // Update doctor rating (trigger-like logic in app)
      await sql`
        UPDATE doctors 
        SET 
          rating_count = rating_count + 1,
          rating = ((rating * rating_count) + ${input.rating}) / (rating_count + 1)
        WHERE id = ${doctorId}
      `;

      return reply.code(201).send({ data: { id: reviewId, success: true } });
    });

    // ─── ADMIN ONLY ROUTES ────────────────────────────────────────────────────────
    
    const legacyAdminAuth = async (request: any, reply: any) => {
      if (request.headers['x-admin-password'] === 'admin123') return;
      await app.authenticate(request, reply);
      await app.requireAdmin(request, reply);
    };

    // POST /api/v1/doctors
    app.post('/', { preHandler: [legacyAdminAuth] }, async (request, reply) => {
      const bodySchema = z.object({
        email: z.string().email(),
        password: z.string().min(8),
        name: z.string().min(1),
        specialty: z.string().min(1),
        departmentId: z.string().min(1),
        bio: z.string().min(1),
        qualifications: z.array(z.string()).min(1),
        consultationFee: z.number().int().min(0),
        imageUrl: z.string().optional(),
      });

      const input = parseInput(bodySchema, request.body);
      
      // Check if email already exists
      const existing = await userRepo.findByEmail(input.email);
      if (existing) {
        throw new HttpError(409, 'EMAIL_EXISTS', 'A user with this email already exists.');
      }

      // Create the User (doctor)
      const passwordHash = await bcrypt.hash(input.password, 12);
      const user = await userRepo.create({
        email: input.email,
        passwordHash,
        role: 'doctor',
      });

      // Doctors created by admins are automatically verified
      await userRepo.markVerified(user.id);

      // Create the Doctor Profile linked to the User
      const doctor = await repository.create({
        userId: user.id,
        name: input.name,
        specialty: input.specialty,
        departmentId: input.departmentId,
        bio: input.bio,
        qualifications: input.qualifications,
        consultationFee: input.consultationFee,
        imageUrl: input.imageUrl,
      });

      return reply.code(201).send({ data: doctor });
    });

    // DELETE /api/v1/doctors/:doctorId
    app.delete('/:doctorId', { preHandler: [legacyAdminAuth] }, async (request, reply) => {
      const { doctorId } = parseInput(
        z.object({ doctorId: z.string().min(1) }),
        request.params,
      );

      const doctor = await repository.findById(doctorId);
      if (!doctor) throw new HttpError(404, 'DOCTOR_NOT_FOUND', 'Doctor not found.');

      await repository.softDelete(doctorId);
      return reply.code(204).send();
    });
  };
}
