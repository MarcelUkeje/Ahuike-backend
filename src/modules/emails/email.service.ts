import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

export class EmailService {
  private transporter: Transporter;
  private defaultFrom: string;

  constructor() {
    const user = process.env.GMAIL_USER;
    const pass = process.env.GMAIL_APP_PASSWORD;

    if (!user || !pass) {
      console.warn('[EmailService] WARNING: GMAIL_USER or GMAIL_APP_PASSWORD not set. Emails will not send.');
    }

    this.defaultFrom = `Ahuike Hospital <${user}>`;
    this.transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user,
        pass,
      },
      tls: {
        rejectUnauthorized: false
      },
      // Force IPv4
      family: 4,
    } as any);
  }

  /** Send a generic email */
  async send(options: SendEmailOptions): Promise<void> {
    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
      console.log(`[EmailService STUB] To: ${options.to} | Subject: ${options.subject}`);
      return;
    }

    try {
      const info = await this.transporter.sendMail({
        from: this.defaultFrom,
        to: options.to,
        subject: options.subject,
        html: options.html,
      });
      console.log(`[EmailService] Sent email to ${options.to}. MessageId: ${info.messageId}`);
    } catch (error) {
      console.error(`[EmailService] Failed to send email to ${options.to}:`, error);
      throw error;
    }
  }
}

// ── Specific Email Templates ─────────────────────────────────────────────────

export interface SendConfirmationEmailInput {
  to: string;
  patientName: string;
  doctorName: string;
  specialty: string;
  slotDate: string;
  slotTime: string;
  consultationFee: number;
  reasonForVisit: string;
}

export async function sendAppointmentConfirmationEmail(
  emailService: EmailService,
  input: SendConfirmationEmailInput,
): Promise<void> {
  const formattedFee = new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
  }).format(input.consultationFee);

  await emailService.send({
    to: input.to,
    subject: 'Appointment Confirmed - Ahuike Hospital',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #0F766E; margin-top: 0;">Appointment Confirmed!</h2>
        <p>Dear <strong>${input.patientName}</strong>,</p>
        <p>Your payment has been verified, and your appointment has been successfully scheduled. Here are the details:</p>
        
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr style="background-color: #f8f9fa;">
            <td style="padding: 10px; border: 1px solid #dee2e6; font-weight: bold; width: 35%;">Doctor</td>
            <td style="padding: 10px; border: 1px solid #dee2e6;">${input.doctorName} (${input.specialty})</td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #dee2e6; font-weight: bold;">Date</td>
            <td style="padding: 10px; border: 1px solid #dee2e6;">${input.slotDate}</td>
          </tr>
          <tr style="background-color: #f8f9fa;">
            <td style="padding: 10px; border: 1px solid #dee2e6; font-weight: bold;">Time</td>
            <td style="padding: 10px; border: 1px solid #dee2e6;">${input.slotTime}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #dee2e6; font-weight: bold;">Fee Paid</td>
            <td style="padding: 10px; border: 1px solid #dee2e6; color: #198754; font-weight: bold;">${formattedFee}</td>
          </tr>
          <tr style="background-color: #f8f9fa;">
            <td style="padding: 10px; border: 1px solid #dee2e6; font-weight: bold;">Reason for Visit</td>
            <td style="padding: 10px; border: 1px solid #dee2e6;">${input.reasonForVisit}</td>
          </tr>
        </table>
        
        <p style="margin-top: 30px;">If you need to reschedule or cancel, please do so at least 24 hours before the appointment time.</p>
        <p>Thank you for choosing the Ahuike App.</p>
        <hr style="border: 0; border-top: 1px solid #e0e0e0; margin: 20px 0;">
        <p style="font-size: 12px; color: #6c757d; text-align: center;">This is an automated receipt. Please do not reply to this email.</p>
      </div>
    `,
  });
}
