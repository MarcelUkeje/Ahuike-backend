import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { parseInput } from '../../lib/validation.js';
import type { PatientRepository } from '../patients/patient.repository.js';
import { AuthService } from './auth.service.js';

const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().email().toLowerCase(),
  password: z.string().min(8).max(128),
});

const loginSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1),
});

export function authRoutes(patients: PatientRepository): FastifyPluginAsync {
  return async (app) => {
    const service = new AuthService(patients, (payload) =>
      // app.jwt is provided by @fastify/jwt registered in app.ts
      (app as any).jwt.sign(payload, { expiresIn: '7d' }),
    );

    /** POST /api/v1/auth/register */
    app.post('/register', async (request, reply) => {
      const input = parseInput(registerSchema, request.body);
      const result = await service.register(input);
      return reply.code(201).send({ data: result });
    });

    /** POST /api/v1/auth/login */
    app.post('/login', async (request) => {
      const input = parseInput(loginSchema, request.body);
      const result = await service.login(input);
      return { data: result };
    });
  };
}
