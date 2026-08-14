import { randomUUID } from 'node:crypto';
import { getDb } from '../../lib/db.js';
import type { PaginatedResult, PaginationQuery } from '../../lib/pagination.js';
import { PAGINATION_DEFAULTS } from '../../lib/pagination.js';
import type { Prescription } from './prescription.model.js';

export interface CreatePrescriptionInput {
  patientId:      string;
  doctorId?:      string;
  appointmentId?: string;
  medicationName: string;
  dosage:         string;
  frequency:      string;
  duration:       string;
  instructions:   string;
  expiresAt?:     string;
}

export interface PrescriptionListQuery extends PaginationQuery {
  active?: boolean;
}

export interface PrescriptionRepository {
  listForPatient(patientId: string, query?: Partial<PrescriptionListQuery>): Promise<PaginatedResult<Prescription>>;
  findById(id: string, patientId: string): Promise<Prescription | null>;
  create(input: CreatePrescriptionInput): Promise<Prescription>;
}

// ─── NeonDB implementation ────────────────────────────────────────────────────

export class NeonPrescriptionRepository implements PrescriptionRepository {
  async listForPatient(
    patientId: string,
    query: Partial<PrescriptionListQuery> = {},
  ): Promise<PaginatedResult<Prescription>> {
    const sql   = getDb();
    const limit  = Math.min(query.limit ?? PAGINATION_DEFAULTS.limit, PAGINATION_DEFAULTS.maxLimit);
    const offset = query.offset ?? PAGINATION_DEFAULTS.offset;

    if (query.active !== undefined) {
      const countRows = (await sql`
        SELECT COUNT(*) AS total FROM prescriptions
        WHERE patient_id = ${patientId} AND is_active = ${query.active}
      `) as { total: string }[];
      const total = Number(countRows[0]!.total);

      const rows = (await sql`
        SELECT id, patient_id, doctor_id, appointment_id, medication_name,
               dosage, frequency, duration, instructions, is_active, issued_at, expires_at
        FROM prescriptions
        WHERE patient_id = ${patientId} AND is_active = ${query.active}
        ORDER BY issued_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `) as Record<string, unknown>[];
      return buildResult(rows.map(toPrescription), total, limit, offset);
    }

    const countRows = (await sql`
      SELECT COUNT(*) AS total FROM prescriptions WHERE patient_id = ${patientId}
    `) as { total: string }[];
    const total = Number(countRows[0]!.total);

    const rows = (await sql`
      SELECT id, patient_id, doctor_id, appointment_id, medication_name,
             dosage, frequency, duration, instructions, is_active, issued_at, expires_at
      FROM prescriptions
      WHERE patient_id = ${patientId}
      ORDER BY issued_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `) as Record<string, unknown>[];
    return buildResult(rows.map(toPrescription), total, limit, offset);
  }

  async findById(id: string, patientId: string): Promise<Prescription | null> {
    const sql = getDb();
    const rows = (await sql`
      SELECT id, patient_id, doctor_id, appointment_id, medication_name,
             dosage, frequency, duration, instructions, is_active, issued_at, expires_at
      FROM prescriptions
      WHERE id = ${id} AND patient_id = ${patientId}
    `) as Record<string, unknown>[];
    return rows.length === 0 ? null : toPrescription(rows[0]!);
  }

  async create(input: CreatePrescriptionInput): Promise<Prescription> {
    const sql = getDb();
    const id  = randomUUID();
    const now = new Date().toISOString();
    const doctorId      = input.doctorId      ?? null;
    const appointmentId = input.appointmentId ?? null;
    const expiresAt     = input.expiresAt     ?? null;

    await sql`
      INSERT INTO prescriptions
        (id, patient_id, doctor_id, appointment_id, medication_name,
         dosage, frequency, duration, instructions, is_active, issued_at, expires_at)
      VALUES
        (${id}, ${input.patientId}, ${doctorId}, ${appointmentId},
         ${input.medicationName}, ${input.dosage}, ${input.frequency},
         ${input.duration}, ${input.instructions}, true, ${now}, ${expiresAt})
    `;
    return {
      id, patientId: input.patientId,
      doctorId, appointmentId,
      medicationName: input.medicationName, dosage: input.dosage,
      frequency: input.frequency, duration: input.duration,
      instructions: input.instructions, isActive: true,
      issuedAt: now, expiresAt,
    };
  }
}

// ─── In-memory implementation (tests / dev) ───────────────────────────────────

const _seed: Prescription[] = [
  {
    id: 'rx-001', patientId: 'PLACEHOLDER',
    doctorId: 'dr-amaka-obi', appointmentId: null,
    medicationName: 'Vitamin D3',
    dosage: '1000 IU', frequency: 'Once daily', duration: '3 months',
    instructions: 'Take with food in the morning.',
    isActive: true,
    issuedAt:  '2026-02-14T09:30:00.000Z',
    expiresAt: '2026-05-14T09:30:00.000Z',
  },
  {
    id: 'rx-002', patientId: 'PLACEHOLDER',
    doctorId: 'dr-emeka-nwosu', appointmentId: null,
    medicationName: 'Metformin',
    dosage: '500mg', frequency: 'Twice daily', duration: '30 days',
    instructions: 'Take with meals. Monitor blood glucose regularly.',
    isActive: false,
    issuedAt:  '2025-11-01T10:00:00.000Z',
    expiresAt: '2025-12-01T10:00:00.000Z',
  },
];

export class InMemoryPrescriptionRepository implements PrescriptionRepository {
  private readonly store = new Map<string, Prescription>();

  constructor(patientId: string = 'test') {
    for (const rx of _seed) {
      this.store.set(rx.id, { ...rx, patientId });
    }
  }

  async listForPatient(
    patientId: string,
    query: Partial<PrescriptionListQuery> = {},
  ): Promise<PaginatedResult<Prescription>> {
    const limit  = Math.min(query.limit ?? PAGINATION_DEFAULTS.limit, PAGINATION_DEFAULTS.maxLimit);
    const offset = query.offset ?? PAGINATION_DEFAULTS.offset;
    const all = [...this.store.values()]
      .filter((r) => r.patientId === patientId &&
        (query.active === undefined || r.isActive === query.active))
      .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
    return buildResult(all.slice(offset, offset + limit), all.length, limit, offset);
  }

  async findById(id: string, patientId: string): Promise<Prescription | null> {
    const r = this.store.get(id);
    return r && r.patientId === patientId ? r : null;
  }

  async create(input: CreatePrescriptionInput): Promise<Prescription> {
    const now = new Date().toISOString();
    const rx: Prescription = {
      id: randomUUID(),
      patientId:      input.patientId,
      doctorId:       input.doctorId      ?? null,
      appointmentId:  input.appointmentId ?? null,
      medicationName: input.medicationName,
      dosage:         input.dosage,
      frequency:      input.frequency,
      duration:       input.duration,
      instructions:   input.instructions,
      isActive:       true,
      issuedAt:       now,
      expiresAt:      input.expiresAt ?? null,
    };
    this.store.set(rx.id, rx);
    return rx;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildResult<T>(items: T[], total: number, limit: number, offset: number): PaginatedResult<T> {
  return { items, meta: { total, limit, offset, hasMore: offset + items.length < total } };
}

function toPrescription(row: Record<string, unknown>): Prescription {
  return {
    id:             row['id'] as string,
    patientId:      row['patient_id'] as string,
    doctorId:       (row['doctor_id']      as string | null | undefined) ?? null,
    appointmentId:  (row['appointment_id'] as string | null | undefined) ?? null,
    medicationName: row['medication_name'] as string,
    dosage:         row['dosage']          as string,
    frequency:      row['frequency']       as string,
    duration:       row['duration']        as string,
    instructions:   row['instructions']    as string,
    isActive:       row['is_active']       as boolean,
    issuedAt:       String(row['issued_at']),
    expiresAt:      row['expires_at'] ? String(row['expires_at']) : null,
  };
}
