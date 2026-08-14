import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { HttpError } from '../../lib/http-error.js';
import { PAGINATION_DEFAULTS } from '../../lib/pagination.js';
import { parseInput } from '../../lib/validation.js';
import type { PrescriptionRepository } from './prescription.repository.js';

const listQuerySchema = z.object({
  active: z.coerce.boolean().optional(),
  limit:  z.coerce.number().int().min(1).max(PAGINATION_DEFAULTS.maxLimit).default(PAGINATION_DEFAULTS.limit),
  offset: z.coerce.number().int().min(0).default(PAGINATION_DEFAULTS.offset),
});

const createSchema = z.object({
  medicationName: z.string().trim().min(1).max(200),
  dosage:         z.string().trim().min(1).max(100),
  frequency:      z.string().trim().min(1).max(100),
  duration:       z.string().trim().min(1).max(100),
  instructions:   z.string().trim().max(1000).default(''),
  expiresAt:      z.string().datetime().optional(),
  doctorId:       z.string().min(1).optional(),
  appointmentId:  z.string().min(1).optional(),
});

export function prescriptionRoutes(repository: PrescriptionRepository): FastifyPluginAsync {
  return async (app) => {
    // All routes require a valid JWT
    app.addHook('preHandler', app.authenticate);

    // GET /api/v1/prescriptions[?active=&limit=&offset=]
    app.get('/', async (request) => {
      const patientId = request.user.sub;
      const query = parseInput(listQuerySchema, request.query);
      const { active, ...page } = query;
      const result = await repository.listForPatient(
        patientId,
        active !== undefined ? { active, ...page } : page,
      );
      return { data: result.items, meta: result.meta };
    });

    // GET /api/v1/prescriptions/:prescriptionId
    app.get('/:prescriptionId', async (request) => {
      const patientId = request.user.sub;
      const { prescriptionId } = parseInput(
        z.object({ prescriptionId: z.string().min(1) }),
        request.params,
      );
      const rx = await repository.findById(prescriptionId, patientId);
      if (!rx) throw new HttpError(404, 'PRESCRIPTION_NOT_FOUND', 'Prescription not found.');
      return { data: rx };
    });

    // POST /api/v1/prescriptions
    app.post('/', async (request, reply) => {
      const patientId = request.user.sub;
      const input = parseInput(createSchema, request.body);
      const rx = await repository.create({
        patientId,
        medicationName: input.medicationName,
        dosage:         input.dosage,
        frequency:      input.frequency,
        duration:       input.duration,
        instructions:   input.instructions,
        ...(input.expiresAt     && { expiresAt:     input.expiresAt }),
        ...(input.doctorId      && { doctorId:      input.doctorId }),
        ...(input.appointmentId && { appointmentId: input.appointmentId }),
      });
      return reply.code(201).send({ data: rx });
    });
  };
}
