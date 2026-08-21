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

/**
 * Sends an appointment confirmation email via the Resend.com API.
 */
export async function sendAppointmentConfirmationEmail(
  apiKey: string,
  input: SendConfirmationEmailInput,
): Promise<void> {
  const formattedFee = new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
  }).format(input.consultationFee);

  console.log(`[EmailService] Attempting to send confirmation email to: ${input.to}`);
  console.log(`[EmailService] Payload: Doctor = ${input.doctorName}, Fee = ${formattedFee}, Slot = ${input.slotDate} ${input.slotTime}`);

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Ahuike Hospital <onboarding@resend.dev>',
      to: [input.to],
      subject: 'Appointment Confirmed - Ahuike Hospital',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
          <h2 style="color: #0d6efd; margin-top: 0;">Appointment Confirmed!</h2>
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
    }),
  });

  const statusCode = response.statusCode ?? response.status;
  console.log(`[EmailService] Resend API responded with status: ${statusCode}`);
  const body = (await response.json()) as any;
  console.log(`[EmailService] Resend API response body:`, JSON.stringify(body, null, 2));

  if (!response.ok) {
    throw new Error(`Resend email delivery failed: ${JSON.stringify(body)}`);
  }

}
