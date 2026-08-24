import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { HttpError } from '../../lib/http-error.js';
import { parseInput } from '../../lib/validation.js';
import type { AppEnvironment } from '../../config/env.js';
import { initializePayment, verifyPayment } from './payment.service.js';
import crypto from 'node:crypto';
import type { AppointmentRepository } from '../appointments/appointment.repository.js';
import type { EmailService } from '../emails/email.service.js';

const initializeBodySchema = z.object({
  email: z.string().email(),
  amountInKobo: z.number().int().positive(),
  reference: z.string().min(1),
});

export function paymentRoutes(env: AppEnvironment, appointmentRepo: AppointmentRepository, emailService: EmailService): FastifyPluginAsync {
  return async (app) => {
    // All payment routes require a valid JWT
    

    
    // Webhook from Paystack (no JWT required)
    app.post('/webhook', async (request, reply) => {
      const signature = request.headers['x-paystack-signature'] as string;
      if (!signature) {
        return reply.code(400).send({ error: 'Missing signature' });
      }

      const hash = crypto.createHmac('sha512', env.PAYSTACK_SECRET_KEY)
                         .update(JSON.stringify(request.body))
                         .digest('hex');

      if (hash !== signature) {
        return reply.code(400).send({ error: 'Invalid signature' });
      }

      const event = request.body as any;
      if (event.event === 'charge.success') {
        const reference = event.data.reference as string;
        
        let appt = await appointmentRepo.findByIdempotencyKey(reference);
        if (!appt && reference.includes('_')) {
          const potentialId = reference.split('_')[0];
          const found = await appointmentRepo.findById(potentialId);
          if (found) appt = found;
        }

        if (appt && appt.status === 'pending') {
          await appointmentRepo.confirmPayment(appt.id);
          
          // Send HTML Receipt
          const sql = (await import('../../lib/db.js')).getDb();
          const details = await sql`
            SELECT 
              u.name as patient_name,
              d_user.name as doctor_name,
              d.specialty,
              s.slot_date,
              s.start_time
            FROM appointments a
            JOIN patients p ON a.patient_id = p.id
            JOIN users u ON p.user_id = u.id
            JOIN doctors d ON a.doctor_id = d.id
            JOIN users d_user ON d.user_id = d_user.id
            JOIN appointment_slots s ON a.slot_id = s.id
            WHERE a.id = ${appt.id}
          ` as any[];

          if (details.length > 0) {
            const data = details[0];
            const { sendAppointmentConfirmationEmail } = await import('../emails/email.service.js');
            await sendAppointmentConfirmationEmail(emailService, {
              to: event.data.customer.email,
              patientName: data.patient_name,
              doctorName: data.doctor_name,
              specialty: data.specialty,
              slotDate: data.slot_date instanceof Date ? data.slot_date.toISOString().substring(0,10) : data.slot_date,
              slotTime: data.start_time,
              consultationFee: appt.consultationFee,
              reasonForVisit: appt.reasonForVisit || 'General Consultation'
            }).catch((err) => app.log.error('Receipt Email failed: ' + err));
          }

        }
      }

      return reply.code(200).send();
    });

    // All endpoints below require a valid JWT
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
      
      if (success) {
        let appt = await appointmentRepo.findByIdempotencyKey(reference);
        if (!appt && reference.includes('_')) {
          const potentialId = reference.split('_')[0];
          const found = await appointmentRepo.findById(potentialId);
          if (found) appt = found;
        }

        if (appt && appt.status === 'pending') {
          await appointmentRepo.confirmPayment(appt.id);
        }
      }

      return reply.code(200).send({ data: { success } });
    });
  };
}
