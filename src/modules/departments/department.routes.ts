import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { cacheGet, cacheSet } from '../../lib/cache.js';
import { HttpError } from '../../lib/http-error.js';
import { parseInput } from '../../lib/validation.js';
import type { DepartmentRepository } from './department.repository.js';

const CACHE_TTL = 300; // 5 minutes

export function departmentRoutes(repository: DepartmentRepository): FastifyPluginAsync {
  return async (app) => {
    // GET /api/v1/departments[?q=...]
    app.get('/', async (request) => {
      const { q } = parseInput(
        z.object({ q: z.string().trim().max(100).optional() }),
        request.query,
      );
      const cacheKey = `departments:list:${q ?? ''}`;
      const cached = await cacheGet(cacheKey);
      if (cached) return { data: cached };

      const departments = await repository.list(q);
      await cacheSet(cacheKey, departments, CACHE_TTL);
      return { data: departments };
    });

    // GET /api/v1/departments/:departmentId
    app.get('/:departmentId', async (request) => {
      const { departmentId } = parseInput(
        z.object({ departmentId: z.string().min(1) }),
        request.params,
      );
      const cacheKey = `departments:detail:${departmentId}`;
      const cached = await cacheGet(cacheKey);
      if (cached) return { data: cached };

      const department = await repository.findById(departmentId);
      if (!department) throw new HttpError(404, 'DEPARTMENT_NOT_FOUND', 'Department not found.');
      await cacheSet(cacheKey, department, CACHE_TTL);
      return { data: department };
    });
  };
}
