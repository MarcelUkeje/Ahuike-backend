import 'dotenv/config';
import { sendAppointmentConfirmationEmail } from './src/modules/emails/email.service.js';

async function test() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('RESEND_API_KEY is not defined in .env');
    process.exit(1);
  }
  
  console.log('Using API Key:', apiKey.substring(0, 10) + '...');
  
  try {
    await sendAppointmentConfirmationEmail(apiKey, {
      to: 'ukejemarcel@gmail.com',
      patientName: 'Marcel Ukeje',
      doctorName: 'Dr. Emeka Nwosu',
      specialty: 'Cardiologist',
      slotDate: '2026-08-22',
      slotTime: '14:00',
      consultationFee: 100,
      reasonForVisit: 'Routine Heart Checkup',
    });
    console.log('SUCCESS: Email sent successfully!');
  } catch (err) {
    console.error('FAILURE: Error sending email:', err);
  }
}

test();
