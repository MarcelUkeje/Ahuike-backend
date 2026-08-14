import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { HttpError } from '../../lib/http-error.js';
import { PAGINATION_DEFAULTS } from '../../lib/pagination.js';
import { parseInput } from '../../lib/validation.js';
import type { MedicalRecordRepository } from './medical_record.repository.js';

const listQuerySchema = z.object({
  limit:  z.coerce.number().int().min(1).max(PAGINATION_DEFAULTS.maxLimit).default(PAGINATION_DEFAULTS.limit),
  offset: z.coerce.number().int().min(0).default(PAGINATION_DEFAULTS.offset),
});

const createSchema = z.object({
  recordType:    z.string().min(1).max(50),
  title:         z.string().trim().min(2).max(200),
  description:   z.string().trim().min(0).max(2000).default(''),
  diagnosis:     z.string().trim().max(1000).optional(),
  treatmentPlan: z.string().trim().max(2000).optional(),
  doctorId:      z.string().min(1).optional(),
  appointmentId: z.string().min(1).optional(),
});

export function medicalRecordRoutes(repository: MedicalRecordRepository): FastifyPluginAsync {
  return async (app) => {
    // All routes require a valid JWT
    app.addHook('preHandler', app.authenticate);

    // GET /api/v1/medical-records[?limit=&offset=]
    app.get('/', async (request) => {
      const patientId = request.user.sub;
      const { limit, offset } = parseInput(listQuerySchema, request.query);
      const result = await repository.listForPatient(patientId, { limit, offset });
      return { data: result.items, meta: result.meta };
    });

    // GET /api/v1/medical-records/:recordId
    app.get('/:recordId', async (request) => {
      const patientId = request.user.sub;
      const { recordId } = parseInput(
        z.object({ recordId: z.string().min(1) }),
        request.params,
      );
      const record = await repository.findById(recordId, patientId);
      if (!record) throw new HttpError(404, 'MEDICAL_RECORD_NOT_FOUND', 'Medical record not found.');
      return { data: record };
    });

    // POST /api/v1/medical-records
    app.post('/', async (request, reply) => {
      const patientId = request.user.sub;
      const input = parseInput(createSchema, request.body);
      const record = await repository.create({
        patientId,
        recordType:    input.recordType,
        title:         input.title,
        description:   input.description,
        ...(input.diagnosis     && { diagnosis:     input.diagnosis }),
        ...(input.treatmentPlan && { treatmentPlan: input.treatmentPlan }),
        ...(input.doctorId      && { doctorId:      input.doctorId }),
        ...(input.appointmentId && { appointmentId: input.appointmentId }),
      });
      return reply.code(201).send({ data: record });
    });
  };
}
