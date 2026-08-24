import bcrypt from 'bcrypt';
import { HttpError } from '../../lib/http-error.js';
import type { UserRepository } from '../users/user.repository.js';
import type { OTPService } from './otp.service.js';
import type { PatientRepository } from '../patients/patient.repository.js';
import type { AuthTokenPayload, AuthResponse } from './auth.model.js';

const BCRYPT_ROUNDS = 12;

export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly patients: PatientRepository,
    private readonly otpService: OTPService,
    private readonly generateTokens: (payload: AuthTokenPayload) => { accessToken: string, refreshToken: string },
  ) {}

  async register(input: { name: string; email: string; password: string; role: 'patient' }) {
    const existing = await this.users.findByEmail(input.email);
    if (existing) {
      if (existing.isVerified) {
        throw new HttpError(409, 'EMAIL_IN_USE', 'An account with this email already exists.');
      }
      // If unverified, we can resend OTP. We hard delete the old unverified user to prevent unique email constraint issues.
      await this.users.hardDelete(existing.id);
    }

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    
    // 1. Create the base User record (unverified)
    const user = await this.users.create({
      email: input.email,
      passwordHash,
      role: input.role,
    });

    // 2. Generate and send OTP
    await this.otpService.generateAndSendOTP(user.id, user.email);
    
    return { 
      message: 'OTP sent to email. Please verify to complete registration.', 
      userId: user.id 
    };
  }

  async verifyOtp(userId: string, code: string, name: string): Promise<AuthResponse> {
    const user = await this.users.findById(userId);
    if (!user) throw new HttpError(404, 'USER_NOT_FOUND', 'User not found.');
    if (user.isVerified) throw new HttpError(400, 'ALREADY_VERIFIED', 'User is already verified.');

    const isValid = await this.otpService.verifyOTP(userId, code);
    if (!isValid) throw new HttpError(400, 'INVALID_OTP', 'Invalid or expired OTP code.');

    // 3. Create the Patient profile since verification succeeded
    const patient = await this.patients.create({
      userId: user.id,
      name,
    });

    // 4. Issue JWT token
    const tokens = this.generateTokens({ sub: user.id, email: user.email, role: user.role });
    return { ...tokens, token: tokens.accessToken, patient };
  }

  async login(input: { email: string; password: string }) {
    const record = await this.users.findByEmail(input.email);
    
    // Constant-time compare guard
    const dummyHash = '$2b$12$invalidhashfortimingprotection000000000000000000000000';
    const hashToCompare = record?.passwordHash ?? dummyHash;
    const passwordMatches = await bcrypt.compare(input.password, hashToCompare);

    if (!record || !passwordMatches) {
      throw new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
    }
    
    if (!record.isActive) {
      throw new HttpError(403, 'ACCOUNT_DELETED', 'This account has been deleted.');
    }
    
    if (!record.isVerified) {
      throw new HttpError(403, 'UNVERIFIED', 'Please verify your email address first.');
    }

    // Based on role, fetch the appropriate profile
    let profile = null;
    if (record.role === 'patient') {
      profile = await this.patients.findByUserId(record.id);
    }
    // (Other roles like doctor, admin can be handled here later)

    const tokens = this.generateTokens({ sub: record.id, email: record.email, role: record.role });
    return { ...tokens, token: tokens.accessToken, user: { id: record.id, email: record.email, role: record.role }, profile };
  }
}
