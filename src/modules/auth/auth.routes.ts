import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { parseInput } from '../../lib/validation.js';
import { HttpError } from '../../lib/http-error.js';
import type { UserRepository } from '../users/user.repository.js';
import type { PatientRepository } from '../patients/patient.repository.js';
import { OTPService } from './otp.service.js';
import { AuthService } from './auth.service.js';
import type { EmailService } from '../emails/email.service.js';

const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().email().toLowerCase(),
  password: z.string().min(8).max(128),
});

const verifyOtpSchema = z.object({
  userId: z.string().min(1),
  code: z.string().length(6),
  name: z.string().trim().min(2).max(100), // pass name again to create profile
});

const loginSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1),
});

export function authRoutes(
  users: UserRepository,
  patients: PatientRepository,
  emailService: EmailService
): FastifyPluginAsync {
  return async (app) => {
    const otpService = new OTPService(users, emailService);
    const service = new AuthService(users, patients, otpService, (payload) => {
      const jwt = (app as any).jwt;
      const accessToken = jwt.sign(payload, { expiresIn: '15m' });
      const refreshToken = jwt.sign({ ...payload, type: 'refresh' }, { expiresIn: '7d' });
      return { accessToken, refreshToken };
    });

    /** POST /api/v1/auth/register */
    app.post('/register', async (request, reply) => {
      const input = parseInput(registerSchema, request.body);
      const result = await service.register({ ...input, role: 'patient' });
      return reply.code(201).send({ data: result });
    });

    /** POST /api/v1/auth/verify-otp */
    app.post('/verify-otp', async (request, reply) => {
      const input = parseInput(verifyOtpSchema, request.body);
      const result = await service.verifyOtp(input.userId, input.code, input.name);
      return reply.code(200).send({ data: result });
    });

    /** POST /api/v1/auth/login */
    app.post('/login', async (request) => {
      const input = parseInput(loginSchema, request.body);
      const result = await service.login(input);
      return { data: result };
    });

    /** POST /api/v1/auth/refresh */
    app.post('/refresh', async (request, reply) => {
      const schema = z.object({ refreshToken: z.string().min(1) });
      const { refreshToken } = parseInput(schema, request.body);
      
      try {
        const decoded = (app as any).jwt.verify(refreshToken);
        if (decoded.type !== 'refresh') {
          throw new Error('Invalid token type');
        }
        
        const payload = { sub: decoded.sub, email: decoded.email, role: decoded.role };
        const accessToken = (app as any).jwt.sign(payload, { expiresIn: '15m' });
        // Optional: rotate refresh token too
        const newRefreshToken = (app as any).jwt.sign({ ...payload, type: 'refresh' }, { expiresIn: '7d' });
        
        return reply.code(200).send({ data: { accessToken, refreshToken: newRefreshToken, token: accessToken } });
      } catch (err) {
        throw new HttpError(401, 'UNAUTHORIZED', 'Invalid or expired refresh token.');
      }
    });

  };
}
