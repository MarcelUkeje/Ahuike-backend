import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import Fastify, { LogController, type FastifyInstance } from 'fastify';
import type { AppEnvironment } from './config/env.js';
import { HttpError } from './lib/http-error.js';
import { NeonAppointmentRepository, InMemoryAppointmentRepository, type AppointmentRepository } from './modules/appointments/appointment.repository.js';
import { appointmentRoutes } from './modules/appointments/appointment.routes.js';
import { NeonDepartmentRepository, InMemoryDepartmentRepository, type DepartmentRepository } from './modules/departments/department.repository.js';
import { departmentRoutes } from './modules/departments/department.routes.js';
import { NeonDoctorRepository, InMemoryDoctorRepository, type DoctorRepository } from './modules/doctors/doctor.repository.js';
import { doctorRoutes } from './modules/doctors/doctor.routes.js';

/** Use NeonDB repositories only when DATABASE_URL is configured. */
const hasDb = Boolean(process.env.DATABASE_URL);

export interface AppDependencies {
  departments?: DepartmentRepository;
  doctors?: DoctorRepository;
  appointments?: AppointmentRepository;
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
    origin: env.CORS_ORIGINS === '*' ? true : env.CORS_ORIGINS.split(',').map((v) => v.trim()),
  });

  app.get('/health', async () => ({
    data: {
      service: 'ahuike-backend',
      status: 'ok',
      environment: env.NODE_ENV,
      timestamp: new Date().toISOString(),
    },
  }));

  // Prefer injected dependencies (tests); use NeonDB when DATABASE_URL is set, in-memory otherwise
  const deptRepo   = dependencies.departments  ?? (hasDb ? new NeonDepartmentRepository()  : new InMemoryDepartmentRepository());
  const doctorRepo = dependencies.doctors      ?? (hasDb ? new NeonDoctorRepository()      : new InMemoryDoctorRepository());
  const apptRepo   = dependencies.appointments ?? (hasDb ? new NeonAppointmentRepository() : new InMemoryAppointmentRepository());

  await app.register(departmentRoutes(deptRepo),            { prefix: '/api/v1/departments' });
  await app.register(doctorRoutes(doctorRepo),              { prefix: '/api/v1/doctors' });
  // Appointments need the doctor repo to validate slots and fetch authoritative fees
  await app.register(appointmentRoutes(apptRepo, doctorRepo), { prefix: '/api/v1/appointments' });

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
