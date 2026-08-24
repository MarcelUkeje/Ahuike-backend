import { randomUUID } from 'node:crypto';
import { getDb } from '../../lib/db.js';
import type { Patient, PatientProfile } from './patient.model.js';

export interface CreatePatientInput {
  userId: string;
  name: string;
  dob?: string;
  gender?: string;
  phone?: string;
  address?: string;
  medicalHistory?: string;
}

export interface UpdatePatientInput {
  name?: string | undefined;
  dob?: string | undefined;
  gender?: string | undefined;
  phone?: string | undefined;
  address?: string | undefined;
  medicalHistory?: string | undefined;
}

export interface PatientRepository {
  create(input: CreatePatientInput): Promise<Patient>;
  findByUserId(userId: string): Promise<PatientProfile | null>;
  update(userId: string, data: UpdatePatientInput): Promise<Patient>;
}

export class NeonPatientRepository implements PatientRepository {
  async create(input: CreatePatientInput): Promise<Patient> {
    const sql = getDb();
    const id = `pat_${randomUUID()}`;
    const now = new Date().toISOString();

    await sql`
      INSERT INTO patients (id, user_id, name, dob, gender, phone, address, medical_history, created_at, updated_at)
      VALUES (${id}, ${input.userId}, ${input.name}, ${input.dob ?? null}, ${input.gender ?? null}, ${input.phone ?? null}, ${input.address ?? null}, ${input.medicalHistory ?? ''}, ${now}, ${now})
    `;

    return {
      id,
      userId: input.userId,
      name: input.name,
      dob: input.dob ?? null,
      gender: input.gender ?? null,
      phone: input.phone ?? null,
      address: input.address ?? null,
      medicalHistory: input.medicalHistory ?? '',
      createdAt: now,
      updatedAt: now,
    };
  }

  async findByUserId(userId: string): Promise<PatientProfile | null> {
    const sql = getDb();
    const rows = (await sql`
      SELECT p.id, p.user_id, p.name, p.dob, p.gender, p.phone, p.address, p.medical_history, p.created_at, p.updated_at, u.email
      FROM patients p
      JOIN users u ON u.id = p.user_id
      WHERE p.user_id = ${userId}
    `) as Record<string, unknown>[];
    if (rows.length === 0) return null;

    const row = rows[0]!;
    return {
      id: row['id'] as string,
      userId: row['user_id'] as string,
      name: row['name'] as string,
      dob: row['dob'] ? String(row['dob']) : null,
      gender: row['gender'] as string | null,
      phone: row['phone'] as string | null,
      address: row['address'] as string | null,
      medicalHistory: row['medical_history'] as string,
      email: row['email'] as string,
      createdAt: String(row['created_at']),
      updatedAt: String(row['updated_at']),
    };
  }

  async update(userId: string, data: UpdatePatientInput): Promise<Patient> {
    const sql = getDb();
    const rows = (await sql`
      UPDATE patients
      SET 
        name = COALESCE(${data.name ?? null}, name),
        dob = COALESCE(${data.dob ?? null}, dob),
        gender = COALESCE(${data.gender ?? null}, gender),
        phone = COALESCE(${data.phone ?? null}, phone),
        address = COALESCE(${data.address ?? null}, address),
        medical_history = COALESCE(${data.medicalHistory ?? null}, medical_history),
        updated_at = now()
      WHERE user_id = ${userId}
      RETURNING id, user_id, name, dob, gender, phone, address, medical_history, created_at, updated_at
    `) as Record<string, unknown>[];
    
    if (rows.length === 0) throw new Error('Patient not found');
    const row = rows[0]!;
    
    return {
      id: row['id'] as string,
      userId: row['user_id'] as string,
      name: row['name'] as string,
      dob: row['dob'] ? String(row['dob']) : null,
      gender: row['gender'] as string | null,
      phone: row['phone'] as string | null,
      address: row['address'] as string | null,
      medicalHistory: row['medical_history'] as string,
      createdAt: String(row['created_at']),
      updatedAt: String(row['updated_at']),
    };
  }
}

export class InMemoryPatientRepository implements PatientRepository {
  private readonly store = new Map<string, Patient>();

  async create(input: CreatePatientInput): Promise<Patient> {
    const id = `pat_${randomUUID()}`;
    const now = new Date().toISOString();
    const p: Patient = {
      id,
      userId: input.userId,
      name: input.name,
      dob: input.dob ?? null,
      gender: input.gender ?? null,
      phone: input.phone ?? null,
      address: input.address ?? null,
      medicalHistory: input.medicalHistory ?? '',
      createdAt: now,
      updatedAt: now,
    };
    this.store.set(id, p);
    return p;
  }

  async findByUserId(userId: string): Promise<PatientProfile | null> {
    const p = [...this.store.values()].find((pat) => pat.userId === userId);
    if (!p) return null;
    return { ...p, email: 'mock@example.com' };
  }

  async update(userId: string, data: UpdatePatientInput): Promise<Patient> {
    const p = [...this.store.values()].find((pat) => pat.userId === userId);
    if (!p) throw new Error('Patient not found');
    
    if (data.name !== undefined) p.name = data.name;
    if (data.dob !== undefined) p.dob = data.dob;
    if (data.gender !== undefined) p.gender = data.gender;
    if (data.phone !== undefined) p.phone = data.phone;
    if (data.address !== undefined) p.address = data.address;
    if (data.medicalHistory !== undefined) p.medicalHistory = data.medicalHistory;
    p.updatedAt = new Date().toISOString();
    
    this.store.set(p.id, p);
    return p;
  }
}
