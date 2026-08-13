import type { Patient } from '../patients/patient.model.js';

// ── Input / Output DTOs ──────────────────────────────────────────────────────

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthTokenPayload {
  sub: string; // patientId
  email: string;
}

export interface AuthResponse {
  token: string;
  patient: Patient;
}
