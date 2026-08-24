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
import { paymentRoutes } from './modules/payments/payment.routes.js';
import { NeonUserRepository, InMemoryUserRepository } from './modules/users/user.repository.js';
import { EmailService } from './modules/emails/email.service.js';

export interface AppDependencies {
  departments?:    DepartmentRepository;
  doctors?:        DoctorRepository;
  appointments?:   AppointmentRepository;
  patients?:       PatientRepository;
  medicalRecords?: MedicalRecordRepository;
  prescriptions?:  PrescriptionRepository;
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: any;
    requireAdmin: any;
  }
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

  await app.register(helmet, {
    // Disable CSP so our static HTML can load normally, or configure it carefully
    contentSecurityPolicy: false
  });
  await app.register(cors, {
    origin: env.CORS_ORIGINS === '*' ? true : env.CORS_ORIGINS.split(',').map((v) => v.trim()),
  });

  // ── Static Web Dashboard ──────────────────────────────────────────────────────
  await app.register(import('@fastify/static').then((m) => m.default), {
    root: new URL('../public/admin', import.meta.url).pathname,
    prefix: '/admin/',
    decorateReply: false // To avoid conflicts if registered multiple times
  });

  // Redirect /admin to /admin/ so it serves index.html correctly
  app.get('/admin', async (request, reply) => {
    return reply.redirect('/admin/');
  });

  // ── JWT ──────────────────────────────────────────────────────────────────────
  await app.register(jwt, { secret: env.JWT_SECRET });

  // Attach a reusable preHandler that all protected routes can reference
  app.decorate('authenticate', async function (request: any, reply: any) {
    try {
      await request.jwtVerify();
      if (request.user.type === 'refresh') {
        throw new Error('Refresh tokens cannot be used to access API routes.');
      }
    } catch {
      void reply.code(401).send({
        error: { code: 'UNAUTHENTICATED', message: 'A valid authentication token is required.' },
      });
    }
  });

  // Attach a preHandler for Admin-only routes
  app.decorate('requireAdmin', async function (request: any, reply: any) {
    if (!request.user || request.user.role !== 'admin') {
      void reply.code(403).send({
        error: { code: 'FORBIDDEN', message: 'Admin privileges required.' },
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
  const userRepo    = hasDb ? new NeonUserRepository() : new InMemoryUserRepository();
  const emailService = new EmailService();

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

  // ── Routes ────────────────────────────────────────────────────────────────────
  await app.register(authRoutes(userRepo, patientRepo, emailService), { prefix: '/api/v1/auth' });
  await app.register(patientRoutes(patientRepo, userRepo),                   { prefix: '/api/v1/patients' });
  await app.register(departmentRoutes(deptRepo),                   { prefix: '/api/v1/departments' });
  await app.register(doctorRoutes(doctorRepo, userRepo),                     { prefix: '/api/v1/doctors' });
  await app.register(appointmentRoutes(apptRepo, doctorRepo, emailService),      { prefix: '/api/v1/appointments' });
  await app.register(medicalRecordRoutes(mrRepo),                  { prefix: '/api/v1/medical-records' });
  await app.register(prescriptionRoutes(rxRepo),                   { prefix: '/api/v1/prescriptions' });
  await app.register(paymentRoutes(env, apptRepo, emailService), { prefix: '/api/v1/payments' });  // ── Error handlers ────────────────────────────────────────────────────────────

  app.addHook('onReady', async function () {
    try {
      const list = await doctorRepo.list({ limit: 1000 });
      app.log.info(`Syncing appointment slots for ${list.items.length} doctors...`);
      for (const doc of list.items) {
        doctorRepo.ensureSlotsUpToDate(doc.id).catch(err => app.log.error(err));
      }
      app.log.info('Slot sync complete.');

      // Daily Follow-up Reminder Sweeper (runs every hour for demo purposes, usually daily at 8AM)
      setInterval(async () => {
        try {
          const sql = (await import('./lib/db.js')).getDb();
          
          // Find appointments with follow_up_date in the next 24 hours that haven't been reminded
          // For simplicity, we just send emails if follow_up_date is exactly tomorrow.
          // Real apps would have a 'reminded_at' column to avoid spamming.
          // We will skip actual mailing here to prevent spam loop, but logic is logged.
          const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
          const nextDay = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
          
          const followUps = (await sql`
            SELECT a.id, u.email, du.name as doctor_name
            FROM appointments a
            JOIN patients p ON a.patient_id = p.id
            JOIN users u ON p.user_id = u.id
            JOIN doctors d ON a.doctor_id = d.id
            JOIN users du ON d.user_id = du.id
            WHERE a.follow_up_date >= ${tomorrow} AND a.follow_up_date < ${nextDay}
          `) as { id: string, email: string, doctor_name: string }[];

          for (const appt of followUps) {
            app.log.info(`Sending follow-up reminder to ${appt.email} for Dr. ${appt.doctor_name}`);
            // await emailService.send({...}) 
          }
        } catch (err) {
          app.log.error('Follow-up Sweeper error: ' + err);
        }
      }, 60 * 60 * 1000); // Check every hour


      // 10-Minute Expiration Sweeper
      setInterval(async () => {
        try {
          const sql = (await import('./lib/db.js')).getDb();
          const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
          
          // Find expired pending appointments
          const expiredRows = (await sql`
            SELECT id, slot_id FROM appointments 
            WHERE status = 'pending' AND created_at < ${tenMinsAgo}
          `) as { id: string, slot_id: string }[];

          for (const row of expiredRows) {
            await sql`UPDATE appointments SET status = 'cancelled', notes = 'Payment expired' WHERE id = ${row.id}`;
            await sql`UPDATE appointment_slots SET is_booked = false WHERE id = ${row.slot_id}`;
            app.log.info(`Expired appointment ${row.id} and freed slot ${row.slot_id}`);
          }
        } catch (err) {
          app.log.error('Sweeper error: ' + err);
        }
      }, 60 * 1000); // Check every minute

    } catch (err) {
      app.log.error(err);
    }
  });
  return app;
}
