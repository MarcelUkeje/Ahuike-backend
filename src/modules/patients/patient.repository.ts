import { getDb } from '../../lib/db.js';
import { randomUUID } from 'node:crypto';
import type { Patient, PatientRecord } from './patient.model.js';

export interface PatientRepository {
  findByEmail(email: string): Promise<PatientRecord | null>;
  findById(id: string): Promise<Patient | null>;
  create(data: { name: string; email: string; passwordHash: string }): Promise<Patient>;
}

// ─── NeonDB implementation ────────────────────────────────────────────────────

export class NeonPatientRepository implements PatientRepository {
  async findByEmail(email: string): Promise<PatientRecord | null> {
    const sql = getDb();
    const rows = (await sql`
      SELECT id, name, email, password_hash, created_at
      FROM patients
      WHERE email = ${email.toLowerCase()}
    `) as Record<string, unknown>[];
    return rows.length === 0 ? null : toRecord(rows[0]!);
  }

  async findById(id: string): Promise<Patient | null> {
    const sql = getDb();
    const rows = (await sql`
      SELECT id, name, email, created_at
      FROM patients
      WHERE id = ${id}
    `) as Record<string, unknown>[];
    return rows.length === 0 ? null : toPatient(rows[0]!);
  }

  async create(data: { name: string; email: string; passwordHash: string }): Promise<Patient> {
    const sql = getDb();
    const id = randomUUID();
    const rows = (await sql`
      INSERT INTO patients (id, name, email, password_hash)
      VALUES (${id}, ${data.name}, ${data.email.toLowerCase()}, ${data.passwordHash})
      RETURNING id, name, email, created_at
    `) as Record<string, unknown>[];
    return toPatient(rows[0]!);
  }
}

// ─── In-memory implementation (dev / test without DB) ────────────────────────

export class InMemoryPatientRepository implements PatientRepository {
  private readonly store = new Map<string, PatientRecord>();

  async findByEmail(email: string): Promise<PatientRecord | null> {
    return [...this.store.values()].find((p) => p.email === email.toLowerCase()) ?? null;
  }
  async findById(id: string): Promise<Patient | null> {
    const p = this.store.get(id);
    if (!p) return null;
    const { passwordHash: _, ...patient } = p;
    return patient;
  }
  async create(data: { name: string; email: string; passwordHash: string }): Promise<Patient> {
    const id = randomUUID();
    const record: PatientRecord = {
      id,
      name: data.name,
      email: data.email.toLowerCase(),
      passwordHash: data.passwordHash,
      createdAt: new Date().toISOString(),
    };
    this.store.set(id, record);
    const { passwordHash: _, ...patient } = record;
    return patient;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toPatient(row: Record<string, unknown>): Patient {
  return {
    id: row['id'] as string,
    name: row['name'] as string,
    email: row['email'] as string,
    createdAt: String(row['created_at']),
  };
}

function toRecord(row: Record<string, unknown>): PatientRecord {
  return {
    ...toPatient(row),
    passwordHash: row['password_hash'] as string,
  };
}
