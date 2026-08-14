import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { cacheGet, cacheSet } from '../../lib/cache.js';
import { HttpError } from '../../lib/http-error.js';
import { PAGINATION_DEFAULTS } from '../../lib/pagination.js';
import { parseInput } from '../../lib/validation.js';
import type { DepartmentRepository } from './department.repository.js';

const CACHE_TTL = 300; // 5 minutes

const listQuerySchema = z.object({
  q:      z.string().trim().max(100).optional(),
  limit:  z.coerce.number().int().min(1).max(PAGINATION_DEFAULTS.maxLimit).default(PAGINATION_DEFAULTS.limit),
  offset: z.coerce.number().int().min(0).default(PAGINATION_DEFAULTS.offset),
});

export function departmentRoutes(repository: DepartmentRepository): FastifyPluginAsync {
  return async (app) => {
    // GET /api/v1/departments[?q=&limit=&offset=]
    app.get('/', async (request) => {
      const query = parseInput(listQuerySchema, request.query);
      const cacheKey = `departments:list:${query.q ?? ''}:${query.limit}:${query.offset}`;
      const cached = await cacheGet(cacheKey);
      if (cached) return cached;

      const { q, ...page } = query;
      const result = await repository.list(q !== undefined ? { q, ...page } : page);
      const response = { data: result.items, meta: result.meta };
      await cacheSet(cacheKey, response, CACHE_TTL);
      return response;
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
