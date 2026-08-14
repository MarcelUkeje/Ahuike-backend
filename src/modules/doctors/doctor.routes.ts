import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { cacheGet, cacheSet } from '../../lib/cache.js';
import { HttpError } from '../../lib/http-error.js';
import { PAGINATION_DEFAULTS } from '../../lib/pagination.js';
import { parseInput } from '../../lib/validation.js';
import type { DoctorRepository } from './doctor.repository.js';

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

    // GET /api/v1/doctors/:doctorId
    app.get('/:doctorId', async (request) => {
      const { doctorId } = parseInput(
        z.object({ doctorId: z.string().min(1) }),
        request.params,
      );
      const cacheKey = `doctors:detail:${doctorId}`;
      const cached = await cacheGet(cacheKey);
      if (cached) return { data: cached };

      const doctor = await repository.findById(doctorId);
      if (!doctor) throw new HttpError(404, 'DOCTOR_NOT_FOUND', 'Doctor not found.');
      // Cache summary without slots (slots change on every booking)
      const { availableSlots: _slots, ...summary } = doctor;
      await cacheSet(cacheKey, summary, CACHE_TTL);
      return { data: doctor };
    });
  };
}
