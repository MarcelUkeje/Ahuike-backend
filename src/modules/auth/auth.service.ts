import bcrypt from 'bcrypt';
import { HttpError } from '../../lib/http-error.js';
import type { PatientRepository } from '../patients/patient.repository.js';
import type { AuthTokenPayload, RegisterInput, LoginInput, AuthResponse } from './auth.model.js';

const BCRYPT_ROUNDS = 12;

export class AuthService {
  constructor(
    private readonly patients: PatientRepository,
    private readonly signToken: (payload: AuthTokenPayload) => string,
  ) {}

  async register(input: RegisterInput): Promise<AuthResponse> {
    const existing = await this.patients.findByEmail(input.email);
    if (existing) {
      throw new HttpError(409, 'EMAIL_IN_USE', 'An account with this email already exists.');
    }

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    const patient = await this.patients.create({
      name: input.name,
      email: input.email,
      passwordHash,
    });

    const token = this.signToken({ sub: patient.id, email: patient.email });
    return { token, patient };
  }

  async login(input: LoginInput): Promise<AuthResponse> {
    const record = await this.patients.findByEmail(input.email);
    // Use constant-time compare even when user not found (guard against timing attacks)
    const dummyHash = '$2b$12$invalidhashfortimingprotection000000000000000000000000';
    const hashToCompare = record?.passwordHash ?? dummyHash;

    const passwordMatches = await bcrypt.compare(input.password, hashToCompare);
    if (!record || !passwordMatches) {
      throw new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
    }

    const { passwordHash: _, ...patient } = record;
    const token = this.signToken({ sub: patient.id, email: patient.email });
    return { token, patient };
  }
}
