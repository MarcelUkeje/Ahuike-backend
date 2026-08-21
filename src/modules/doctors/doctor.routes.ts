import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { cacheGet, cacheSet } from '../../lib/cache.js';
import { HttpError } from '../../lib/http-error.js';
import { PAGINATION_DEFAULTS } from '../../lib/pagination.js';
import { parseInput } from '../../lib/validation.js';
import type { DoctorRepository } from './doctor.repository.js';
import { getDb } from '../../lib/db.js';

const CACHE_TTL = 300; // 5 minutes

const listQuerySchema = z.object({
  departmentId: z.string().min(1).optional(),
  limit:        z.coerce.number().int().min(1).max(PAGINATION_DEFAULTS.maxLimit).default(PAGINATION_DEFAULTS.limit),
  offset:       z.coerce.number().int().min(0).default(PAGINATION_DEFAULTS.offset),
});

export function doctorRoutes(repository: DoctorRepository): FastifyPluginAsync {
  return async (app) => {
    // GET /api/v1/doctors[?departmentId=&limit=&offset=]
    app.get('/', async (request) => {
      const query = parseInput(listQuerySchema, request.query);
      const cacheKey = `doctors:list:${query.departmentId ?? ''}:${query.limit}:${query.offset}`;
      const cached = await cacheGet(cacheKey);
      if (cached) return cached;

      const { departmentId, ...page } = query;
      const result = await repository.list(departmentId !== undefined ? { departmentId, ...page } : page);
      const response = { data: result.items, meta: result.meta };
      await cacheSet(cacheKey, response, CACHE_TTL);
      return response;
    });

    // POST /api/v1/doctors
    app.post('/', async (request) => {
      const adminPass = request.headers['x-admin-password'];
      if (adminPass !== 'admin123') throw new HttpError(401, 'UNAUTHORIZED', 'Admin access required.');

      const bodySchema = z.object({
        name: z.string().min(1),
        specialty: z.string().min(1),
        departmentId: z.string().min(1),
        bio: z.string().min(1),
        qualifications: z.array(z.string()).min(1),
        consultationFee: z.number().int().min(0),
        imageUrl: z.string().optional(),
      });

      const input = parseInput(bodySchema, request.body);
      const doctor = await repository.create(input);
      return { data: doctor };
    });

    // TEMPORARY: Endpoint to update Dr. Nwosu fee to 100 on NeonDB
    app.get('/debug-update-nwosu-fee', async (request, reply) => {
      const sql = getDb();
      await sql`UPDATE doctors SET consultation_fee = 100 WHERE id = 'dr-emeka-nwosu'`;
      return { status: 'success', message: 'Dr. Nwosu fee updated to 100 in database!' };
    });

    // GET /api/v1/doctors/:doctorId
    app.get('/:doctorId', async (request) => {
      const { doctorId } = parseInput(
        z.object({ doctorId: z.string().min(1) }),
        request.params,
      );

      const doctor = await repository.findById(doctorId);
      if (!doctor) throw new HttpError(404, 'DOCTOR_NOT_FOUND', 'Doctor not found.');
      
      return { data: doctor };
    });
  };
}
