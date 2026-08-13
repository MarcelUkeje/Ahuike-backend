import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import Fastify, { LogController, type FastifyInstance } from 'fastify';
import type { AppEnvironment } from './config/env.js';
import { HttpError } from './lib/http-error.js';
import { InMemoryOrderRepository, type OrderRepository } from './modules/orders/order.repository.js';
import { orderRoutes } from './modules/orders/order.routes.js';
import { InMemoryRestaurantRepository, type RestaurantRepository } from './modules/restaurants/restaurant.repository.js';
import { restaurantRoutes } from './modules/restaurants/restaurant.routes.js';

export interface AppDependencies {
  restaurants?: RestaurantRepository;
  orders?: OrderRepository;
}

export async function buildApp(
  env: AppEnvironment,
  dependencies: AppDependencies = {},
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: env.NODE_ENV === 'test' ? false : { level: env.LOG_LEVEL },
    logController: new LogController({
      disableRequestLogging: env.NODE_ENV === 'test',
    }),
  });

  await app.register(helmet);
  await app.register(cors, {
    origin: env.CORS_ORIGINS === '*' ? true : env.CORS_ORIGINS.split(',').map((value) => value.trim()),
  });

  app.get('/health', async () => ({
    data: {
      service: 'ndichow-backend',
      status: 'ok',
      environment: env.NODE_ENV,
      timestamp: new Date().toISOString(),
    },
  }));

  const restaurants = dependencies.restaurants ?? new InMemoryRestaurantRepository();
  const orders = dependencies.orders ?? new InMemoryOrderRepository();
  await app.register(restaurantRoutes(restaurants), { prefix: '/api/v1/restaurants' });
  await app.register(orderRoutes(orders), { prefix: '/api/v1/orders' });

  app.setNotFoundHandler((_request, reply) => {
    void reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Route not found.' } });
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof HttpError) {
      return reply.code(error.statusCode).send({
        error: { code: error.code, message: error.message, details: error.details },
      });
    }
    app.log.error(error);
    return reply.code(500).send({
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.' },
    });
  });

  return app;
}
