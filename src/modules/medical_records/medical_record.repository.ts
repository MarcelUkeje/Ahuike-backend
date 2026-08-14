import { randomUUID } from 'node:crypto';
import { getDb } from '../../lib/db.js';
import type { PaginatedResult, PaginationQuery } from '../../lib/pagination.js';
import { PAGINATION_DEFAULTS } from '../../lib/pagination.js';
import type { MedicalRecord } from './medical_record.model.js';

export interface CreateMedicalRecordInput {
  patientId:     string;
  doctorId?:     string;
  appointmentId?: string;
  recordType:    string;
  title:         string;
  description:   string;
  diagnosis?:    string;
  treatmentPlan?: string;
}

export interface MedicalRecordRepository {
  listForPatient(patientId: string, query?: Partial<PaginationQuery>): Promise<PaginatedResult<MedicalRecord>>;
  findById(id: string, patientId: string): Promise<MedicalRecord | null>;
  create(input: CreateMedicalRecordInput): Promise<MedicalRecord>;
}

// ─── NeonDB implementation ────────────────────────────────────────────────────

export class NeonMedicalRecordRepository implements MedicalRecordRepository {
  async listForPatient(
    patientId: string,
    query: Partial<PaginationQuery> = {},
  ): Promise<PaginatedResult<MedicalRecord>> {
    const sql = getDb();
    const limit  = Math.min(query.limit  ?? PAGINATION_DEFAULTS.limit,  PAGINATION_DEFAULTS.maxLimit);
    const offset = query.offset ?? PAGINATION_DEFAULTS.offset;

    const countRows = (await sql`
      SELECT COUNT(*) AS total FROM medical_records WHERE patient_id = ${patientId}
    `) as { total: string }[];
    const total = Number(countRows[0]!.total);

    const rows = (await sql`
      SELECT id, patient_id, doctor_id, appointment_id, record_type,
             title, description, diagnosis, treatment_plan, created_at, updated_at
      FROM medical_records
      WHERE patient_id = ${patientId}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `) as Record<string, unknown>[];

    return buildResult(rows.map(toRecord), total, limit, offset);
  }

  async findById(id: string, patientId: string): Promise<MedicalRecord | null> {
    const sql = getDb();
    const rows = (await sql`
      SELECT id, patient_id, doctor_id, appointment_id, record_type,
             title, description, diagnosis, treatment_plan, created_at, updated_at
      FROM medical_records
      WHERE id = ${id} AND patient_id = ${patientId}
    `) as Record<string, unknown>[];
    return rows.length === 0 ? null : toRecord(rows[0]!);
  }

  async create(input: CreateMedicalRecordInput): Promise<MedicalRecord> {
    const sql = getDb();
    const id  = randomUUID();
    const now = new Date().toISOString();
    const doctorId      = input.doctorId      ?? null;
    const appointmentId = input.appointmentId ?? null;
    const diagnosis     = input.diagnosis     ?? null;
    const treatmentPlan = input.treatmentPlan ?? null;

    await sql`
      INSERT INTO medical_records
        (id, patient_id, doctor_id, appointment_id, record_type, title,
         description, diagnosis, treatment_plan, created_at, updated_at)
      VALUES
        (${id}, ${input.patientId}, ${doctorId}, ${appointmentId},
         ${input.recordType}, ${input.title}, ${input.description},
         ${diagnosis}, ${treatmentPlan}, ${now}, ${now})
    `;
    return {
      id, patientId: input.patientId,
      doctorId, appointmentId,
      recordType: input.recordType, title: input.title,
      description: input.description, diagnosis, treatmentPlan,
      createdAt: now, updatedAt: now,
    };
  }
}

// ─── In-memory implementation (tests / dev) ───────────────────────────────────

const _seed: MedicalRecord[] = [
  {
    id: 'mr-001', patientId: 'PLACEHOLDER',
    doctorId: 'dr-amaka-obi', appointmentId: null,
    recordType: 'diagnosis', title: 'Annual Health Check',
    description: 'Routine annual examination. Patient presents in good health.',
    diagnosis: 'No acute findings. Mild vitamin D deficiency noted.',
    treatmentPlan: 'Vitamin D supplement 1000 IU daily for 3 months. Follow-up in 6 months.',
    createdAt: '2026-02-14T09:30:00.000Z', updatedAt: '2026-02-14T09:30:00.000Z',
  },
  {
    id: 'mr-002', patientId: 'PLACEHOLDER',
    doctorId: 'dr-emeka-nwosu', appointmentId: null,
    recordType: 'lab_result', title: 'Lipid Panel Results',
    description: 'Full lipid panel blood test results.',
    diagnosis: 'Total cholesterol 185 mg/dL. LDL 110 mg/dL. HDL 55 mg/dL. Within normal limits.',
    treatmentPlan: 'Continue current diet. Retest in 12 months.',
    createdAt: '2026-05-20T14:00:00.000Z', updatedAt: '2026-05-20T14:00:00.000Z',
  },
];

export class InMemoryMedicalRecordRepository implements MedicalRecordRepository {
  private readonly store = new Map<string, MedicalRecord>();

  constructor(patientId: string = 'test') {
    for (const record of _seed) {
      this.store.set(record.id, { ...record, patientId });
    }
  }

  async listForPatient(
    patientId: string,
    query: Partial<PaginationQuery> = {},
  ): Promise<PaginatedResult<MedicalRecord>> {
    const limit  = Math.min(query.limit  ?? PAGINATION_DEFAULTS.limit,  PAGINATION_DEFAULTS.maxLimit);
    const offset = query.offset ?? PAGINATION_DEFAULTS.offset;
    const all = [...this.store.values()]
      .filter((r) => r.patientId === patientId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return buildResult(all.slice(offset, offset + limit), all.length, limit, offset);
  }

  async findById(id: string, patientId: string): Promise<MedicalRecord | null> {
    const r = this.store.get(id);
    return r && r.patientId === patientId ? r : null;
  }

  async create(input: CreateMedicalRecordInput): Promise<MedicalRecord> {
    const now    = new Date().toISOString();
    const record: MedicalRecord = {
      id: randomUUID(),
      patientId:     input.patientId,
      doctorId:      input.doctorId      ?? null,
      appointmentId: input.appointmentId ?? null,
      recordType:    input.recordType,
      title:         input.title,
      description:   input.description,
      diagnosis:     input.diagnosis     ?? null,
      treatmentPlan: input.treatmentPlan ?? null,
      createdAt: now, updatedAt: now,
    };
    this.store.set(record.id, record);
    return record;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildResult<T>(items: T[], total: number, limit: number, offset: number): PaginatedResult<T> {
  return { items, meta: { total, limit, offset, hasMore: offset + items.length < total } };
}

function toRecord(row: Record<string, unknown>): MedicalRecord {
  return {
    id:            row['id'] as string,
    patientId:     row['patient_id'] as string,
    doctorId:      (row['doctor_id'] as string | null | undefined) ?? null,
    appointmentId: (row['appointment_id'] as string | null | undefined) ?? null,
    recordType:    row['record_type'] as string,
    title:         row['title'] as string,
    description:   row['description'] as string,
    diagnosis:     (row['diagnosis'] as string | null | undefined) ?? null,
    treatmentPlan: (row['treatment_plan'] as string | null | undefined) ?? null,
    createdAt:     String(row['created_at']),
    updatedAt:     String(row['updated_at']),
  };
}
