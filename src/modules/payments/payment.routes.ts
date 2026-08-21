import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { HttpError } from '../../lib/http-error.js';
import { parseInput } from '../../lib/validation.js';
import type { AppEnvironment } from '../../config/env.js';
import { initializePayment, verifyPayment } from './payment.service.js';

const initializeBodySchema = z.object({
  email: z.string().email(),
  amountInKobo: z.number().int().positive(),
  reference: z.string().min(1),
});

export function paymentRoutes(env: AppEnvironment): FastifyPluginAsync {
  return async (app) => {
    // All payment routes require a valid JWT
    app.addHook('preHandler', app.authenticate);

    // POST /api/v1/payments/initialize
    // Body: { email, amountInKobo, reference }
    // Returns: { authorization_url, access_code, reference }
    app.post('/initialize', async (request, reply) => {
      const input = parseInput(initializeBodySchema, request.body);

      try {
        const result = await initializePayment(env, input);
        return reply.code(200).send({ data: result });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Payment initialization failed';
        throw new HttpError(502, 'PAYMENT_INIT_FAILED', message);
      }
    });

    // GET /api/v1/payments/verify/:reference
    // Returns: { success: boolean }
    app.get('/verify/:reference', async (request, reply) => {
      const { reference } = parseInput(
        z.object({ reference: z.string().min(1) }),
        request.params,
      );

      const success = await verifyPayment(env, reference);
      return reply.code(200).send({ data: { success } });
    });
  };
}
