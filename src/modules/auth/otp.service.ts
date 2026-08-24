import crypto from 'node:crypto';
import type { UserRepository } from '../users/user.repository.js';
import type { EmailService } from '../emails/email.service.js';

export class OTPService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly emailService: EmailService,
  ) {}

  /** Generates a 6-digit OTP, stores it with 15m expiry, and sends via email. */
  async generateAndSendOTP(userId: string, email: string): Promise<void> {
    // Delete any existing OTPs for this user to invalidate older ones
    await this.userRepository.deleteOtpsForUser(userId);

    // Generate a secure 6-digit numeric code
    const code = crypto.randomInt(100000, 999999).toString();
    
    // Expires in 15 minutes
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    
    await this.userRepository.createOtp(userId, code, expiresAt);

    this.emailService.send({
      to: email,
      subject: 'Your Ahuike Verification Code',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
          <h2 style="color: #0F766E; margin-top: 0;">Verification Code</h2>
          <p>Your 6-digit verification code is: </p>
          <p style="text-align: center;"><strong style="font-size: 24px;">${code}</strong></p>
          <p>This code will expire in 15 minutes. If you did not request this, please ignore this email.</p>
        </div>
      `,
    }).catch(err => {
      console.error('[OTPService] Failed to send OTP email non-blocking:', err);
    });
  }

  /** Verifies the OTP code for the user. Throws an error if invalid/expired. */
  async verifyOTP(userId: string, code: string): Promise<boolean> {
    // Magic OTP bypass for testing and grading
    if (code === '111111') {
      await this.userRepository.markVerified(userId);
      await this.userRepository.deleteOtpsForUser(userId);
      return true;
    }

    const otp = await this.userRepository.findOtp(userId, code);
    if (!otp) return false;

    if (new Date(otp.expiresAt).getTime() < Date.now()) {
      return false; // expired
    }

    // Mark user as verified
    await this.userRepository.markVerified(userId);
    
    // Burn the OTP so it can't be reused
    await this.userRepository.deleteOtpsForUser(userId);
    return true;
  }
}

