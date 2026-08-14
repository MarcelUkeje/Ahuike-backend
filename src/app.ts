import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import Fastify, { LogController, type FastifyInstance } from 'fastify';
import type { AppEnvironment } from './config/env.js';
import { HttpError } from './lib/http-error.js';
import {
  NeonAppointmentRepository,
  InMemoryAppointmentRepository,
  type AppointmentRepository,
} from './modules/appointments/appointment.repository.js';
import { appointmentRoutes } from './modules/appointments/appointment.routes.js';
import {
  NeonDepartmentRepository,
  InMemoryDepartmentRepository,
  type DepartmentRepository,
} from './modules/departments/department.repository.js';
import { departmentRoutes } from './modules/departments/department.routes.js';
import {
  NeonDoctorRepository,
  InMemoryDoctorRepository,
  type DoctorRepository,
} from './modules/doctors/doctor.repository.js';
import { doctorRoutes } from './modules/doctors/doctor.routes.js';
import {
  NeonPatientRepository,
  InMemoryPatientRepository,
  type PatientRepository,
} from './modules/patients/patient.repository.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { patientRoutes } from './modules/patients/patient.routes.js';
import {
  NeonMedicalRecordRepository,
  InMemoryMedicalRecordRepository,
  type MedicalRecordRepository,
} from './modules/medical_records/medical_record.repository.js';
import { medicalRecordRoutes } from './modules/medical_records/medical_record.routes.js';
import {
  NeonPrescriptionRepository,
  InMemoryPrescriptionRepository,
  type PrescriptionRepository,
} from './modules/prescriptions/prescription.repository.js';
import { prescriptionRoutes } from './modules/prescriptions/prescription.routes.js';

export interface AppDependencies {
  departments?:    DepartmentRepository;
  doctors?:        DoctorRepository;
  appointments?:   AppointmentRepository;
  patients?:       PatientRepository;
  medicalRecords?: MedicalRecordRepository;
  prescriptions?:  PrescriptionRepository;
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

  // ── JWT ──────────────────────────────────────────────────────────────────────
  await app.register(jwt, { secret: env.JWT_SECRET });

  // Attach a reusable preHandler that all protected routes can reference
  app.decorate('authenticate', async function (request: any, reply: any) {
    try {
      await request.jwtVerify();
    } catch {
      void reply.code(401).send({
        error: { code: 'UNAUTHENTICATED', message: 'A valid authentication token is required.' },
      });
    }
  });

  // ── Health ────────────────────────────────────────────────────────────────────
  app.get('/health', async () => ({
    data: {
      service: 'ahuike-backend',
      status: 'ok',
      environment: env.NODE_ENV,
      timestamp: new Date().toISOString(),
    },
  }));

  // ── Repositories ──────────────────────────────────────────────────────────────
  // Evaluate after env is validated — not at module import time
  const hasDb = Boolean(env.DATABASE_URL);

  const deptRepo    = dependencies.departments  ?? (hasDb ? new NeonDepartmentRepository()  : new InMemoryDepartmentRepository());
  const doctorRepo  = dependencies.doctors      ?? (hasDb ? new NeonDoctorRepository()      : new InMemoryDoctorRepository());
  const apptRepo    = dependencies.appointments ?? (hasDb ? new NeonAppointmentRepository() : new InMemoryAppointmentRepository());
  const patientRepo = dependencies.patients     ?? (hasDb ? new NeonPatientRepository()     : new InMemoryPatientRepository());
  const mrRepo      = dependencies.medicalRecords ?? (hasDb ? new NeonMedicalRecordRepository() : new InMemoryMedicalRecordRepository());
  const rxRepo      = dependencies.prescriptions  ?? (hasDb ? new NeonPrescriptionRepository()  : new InMemoryPrescriptionRepository());

  // ── Routes ────────────────────────────────────────────────────────────────────
  await app.register(authRoutes(patientRepo),                      { prefix: '/api/v1/auth' });
  await app.register(patientRoutes(patientRepo),                   { prefix: '/api/v1/patients' });
  await app.register(departmentRoutes(deptRepo),                   { prefix: '/api/v1/departments' });
  await app.register(doctorRoutes(doctorRepo),                     { prefix: '/api/v1/doctors' });
  await app.register(appointmentRoutes(apptRepo, doctorRepo),      { prefix: '/api/v1/appointments' });
  await app.register(medicalRecordRoutes(mrRepo),                  { prefix: '/api/v1/medical-records' });
  await app.register(prescriptionRoutes(rxRepo),                   { prefix: '/api/v1/prescriptions' });

  // ── Error handlers ────────────────────────────────────────────────────────────
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
