import type { FastifyPluginAsync } from 'fastify';
import { HttpError } from '../../lib/http-error.js';
import type { PatientRepository } from './patient.repository.js';

export function patientRoutes(patients: PatientRepository): FastifyPluginAsync {
  return async (app) => {
    /** GET /api/v1/patients/me — returns the authenticated patient's own profile */
    app.get('/me', { preHandler: [app.authenticate] }, async (request) => {
      const patientId = request.user.sub;
      const patient = await patients.findById(patientId);
      if (!patient) {
        throw new HttpError(404, 'PATIENT_NOT_FOUND', 'Patient profile not found.');
      }
      return { data: patient };
    });
  };
}
