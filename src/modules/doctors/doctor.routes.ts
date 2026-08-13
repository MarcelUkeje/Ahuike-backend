import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { cacheGet, cacheSet } from '../../lib/cache.js';
import { HttpError } from '../../lib/http-error.js';
import { parseInput } from '../../lib/validation.js';
import type { DoctorRepository } from './doctor.repository.js';

const CACHE_TTL = 300; // 5 minutes

export function doctorRoutes(repository: DoctorRepository): FastifyPluginAsync {
  return async (app) => {
    // GET /api/v1/doctors[?departmentId=...]
    app.get('/', async (request) => {
      const { departmentId } = parseInput(
        z.object({ departmentId: z.string().min(1).optional() }),
        request.query,
      );
      const cacheKey = `doctors:list:${departmentId ?? ''}`;
      const cached = await cacheGet(cacheKey);
      if (cached) return { data: cached };

      const doctors = await repository.list(departmentId);
      await cacheSet(cacheKey, doctors, CACHE_TTL);
      return { data: doctors };
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
      // Only cache the summary without slots (slots change frequently)
      const { availableSlots: _slots, ...summary } = doctor;
      await cacheSet(cacheKey, summary, CACHE_TTL);
      return { data: doctor };
    });
  };
}
