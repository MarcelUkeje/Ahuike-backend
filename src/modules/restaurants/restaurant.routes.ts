import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { HttpError } from '../../lib/http-error.js';
import { parseInput } from '../../lib/validation.js';
import type { RestaurantRepository } from './restaurant.repository.js';

export function restaurantRoutes(repository: RestaurantRepository): FastifyPluginAsync {
  return async (app) => {
    app.get('/', async (request) => {
      const query = parseInput(z.object({ q: z.string().trim().max(100).optional() }), request.query);
      return { data: await repository.list(query.q) };
    });

    app.get('/:restaurantId', async (request) => {
      const params = parseInput(z.object({ restaurantId: z.string().min(1) }), request.params);
      const restaurant = await repository.findById(params.restaurantId);
      if (!restaurant) throw new HttpError(404, 'RESTAURANT_NOT_FOUND', 'Restaurant not found.');
      return { data: restaurant };
    });
  };
}
