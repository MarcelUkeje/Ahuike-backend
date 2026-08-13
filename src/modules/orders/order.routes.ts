import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { HttpError } from '../../lib/http-error.js';
import { parseInput } from '../../lib/validation.js';
import type { OrderRepository } from './order.repository.js';

const orderItemSchema = z.object({
  menuItemId: z.string().min(1),
  name: z.string().min(1).max(160),
  unitPrice: z.number().int().nonnegative(),
  quantity: z.number().int().min(1).max(50),
  notes: z.string().trim().max(300).optional(),
});

const createOrderSchema = z.object({
  restaurantId: z.string().min(1),
  deliveryAddress: z.string().trim().min(5).max(500),
  deliveryFee: z.number().int().nonnegative(),
  items: z.array(orderItemSchema).min(1).max(50),
});

export function orderRoutes(repository: OrderRepository): FastifyPluginAsync {
  return async (app) => {
    app.get('/', async (request) => {
      const customerId = request.headers['x-customer-id'];
      if (typeof customerId !== 'string' || !customerId) {
        throw new HttpError(401, 'UNAUTHENTICATED', 'A customer session is required.');
      }
      return { data: await repository.listForCustomer(customerId) };
    });

    app.get('/:orderId', async (request) => {
      const customerId = request.headers['x-customer-id'];
      if (typeof customerId !== 'string' || !customerId) {
        throw new HttpError(401, 'UNAUTHENTICATED', 'A customer session is required.');
      }
      const params = parseInput(z.object({ orderId: z.uuid() }), request.params);
      const order = await repository.findById(params.orderId);
      if (!order || order.customerId !== customerId) {
        throw new HttpError(404, 'ORDER_NOT_FOUND', 'Order not found.');
      }
      return { data: order };
    });

    app.post('/', async (request, reply) => {
      const customerId = request.headers['x-customer-id'];
      if (typeof customerId !== 'string' || !customerId) {
        throw new HttpError(401, 'UNAUTHENTICATED', 'A customer session is required.');
      }
      const input = parseInput(createOrderSchema, request.body);
      const items = input.items.map(({ notes, ...item }) => ({
        ...item,
        ...(notes === undefined ? {} : { notes }),
      }));
      const order = await repository.create({
        customerId,
        restaurantId: input.restaurantId,
        deliveryAddress: input.deliveryAddress,
        deliveryFee: input.deliveryFee,
        items,
      });
      return reply.code(201).send({ data: order });
    });
  };
}
