import { randomUUID } from 'node:crypto';
import { getDb } from '../../lib/db.js';
import type { PaginatedResult, PaginationQuery } from '../../lib/pagination.js';
import { PAGINATION_DEFAULTS } from '../../lib/pagination.js';
import type { Appointment } from './appointment.model.js';

export interface CreateAppointmentInput {
  patientId: string;
  doctorId: string;
  departmentId: string;
  slotId: string;
  reasonForVisit: string;
  consultationFee: number;
  idempotencyKey?: string;
  paymentUrl?: string;
}

export interface AppointmentListQuery extends PaginationQuery {
  status?: Appointment['status'];
}

export interface AppointmentRepository {
  create(input: CreateAppointmentInput): Promise<Appointment>;
  listForPatient(patientId: string, query?: Partial<AppointmentListQuery>): Promise<PaginatedResult<Appointment>>;
  findById(id: string): Promise<Appointment | null>;
  findByIdempotencyKey(key: string): Promise<Appointment | null>;
  confirmPayment(id: string): Promise<void>;
  complete(id: string): Promise<void>;
  delete(id: string): Promise<void>;
}

// ─── NeonDB implementation ────────────────────────────────────────────────────

export class NeonAppointmentRepository implements AppointmentRepository {
  async create(input: CreateAppointmentInput): Promise<Appointment> {
    const sql = getDb();
    const id = randomUUID();
    const now = new Date().toISOString();

    await sql`
      INSERT INTO appointments
        (id, patient_id, doctor_id, department_id, slot_id,
         reason_for_visit, consultation_fee, status, idempotency_key, payment_url, created_at, updated_at)
      VALUES
        (${id}, ${input.patientId}, ${input.doctorId}, ${input.departmentId},
         ${input.slotId}, ${input.reasonForVisit}, ${input.consultationFee},
         'pending', ${input.idempotencyKey ?? null}, ${input.paymentUrl ?? null}, ${now}, ${now})
    `;

    await sql`
      INSERT INTO appointment_status_events (id, appointment_id, status, created_at)
      VALUES (${randomUUID()}, ${id}, 'pending', ${now})
    `;

    return {
      id,
      patientId: input.patientId,
      doctorId: input.doctorId,
      departmentId: input.departmentId,
      slotId: input.slotId,
      reasonForVisit: input.reasonForVisit,
      consultationFee: input.consultationFee,
      status: 'pending',
      notes: null,
      idempotencyKey: input.idempotencyKey ?? null,
      paymentUrl: input.paymentUrl ?? null,
      doctorInstructions: null,
      followUpDate: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  async listForPatient(
    patientId: string,
    query: Partial<AppointmentListQuery> = {},
  ): Promise<PaginatedResult<Appointment>> {
    const sql = getDb();
    const limit = Math.min(query.limit ?? PAGINATION_DEFAULTS.limit, PAGINATION_DEFAULTS.maxLimit);
    const offset = query.offset ?? PAGINATION_DEFAULTS.offset;
    const { status } = query;

    if (status) {
      const countRows = (await sql`
        SELECT COUNT(*) AS total FROM appointments
        WHERE patient_id = ${patientId} AND status = ${status}
      `) as { total: string }[];
      const total = Number(countRows[0]!.total);

      const rows = (await sql`
        SELECT id, patient_id, doctor_id, department_id, slot_id,
               reason_for_visit, consultation_fee, status, notes, idempotency_key, payment_url, created_at, updated_at
        FROM appointments
        WHERE patient_id = ${patientId} AND status = ${status}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `) as Record<string, unknown>[];

      return buildResult(rows.map(toAppointment), total, limit, offset);
    }

    const countRows = (await sql`
      SELECT COUNT(*) AS total FROM appointments WHERE patient_id = ${patientId}
    `) as { total: string }[];
    const total = Number(countRows[0]!.total);

    const rows = (await sql`
      SELECT id, patient_id, doctor_id, department_id, slot_id,
             reason_for_visit, consultation_fee, status, notes, idempotency_key, payment_url, created_at, updated_at
      FROM appointments
      WHERE patient_id = ${patientId}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `) as Record<string, unknown>[];

    return buildResult(rows.map(toAppointment), total, limit, offset);
  }

  async findByIdempotencyKey(key: string): Promise<Appointment | null> {
    const sql = getDb();
    const rows = (await sql`
      SELECT id, patient_id, doctor_id, department_id, slot_id,
             reason_for_visit, consultation_fee, status, notes, idempotency_key, payment_url, created_at, updated_at
      FROM appointments
      WHERE idempotency_key = ${key}
    `) as Record<string, unknown>[];
    return rows.length === 0 ? null : toAppointment(rows[0]!);
  }

  async findById(id: string): Promise<Appointment | null> {
    const sql = getDb();
    const rows = (await sql`
      SELECT id, patient_id, doctor_id, department_id, slot_id,
             reason_for_visit, consultation_fee, status, notes, idempotency_key, payment_url, created_at, updated_at
      FROM appointments
      WHERE id = ${id}
    `) as Record<string, unknown>[];
    return rows.length === 0 ? null : toAppointment(rows[0]!);
  }

  async confirmPayment(id: string): Promise<void> {
    const sql = getDb();
    const now = new Date().toISOString();
    await sql`UPDATE appointments SET status = 'confirmed', updated_at = ${now} WHERE id = ${id}`;
    await sql`INSERT INTO appointment_status_events (id, appointment_id, status, created_at) VALUES (${randomUUID()}, ${id}, 'confirmed', ${now})`;
  }

  async complete(id: string): Promise<void> {
    const sql = getDb();
    const now = new Date().toISOString();
    await sql`UPDATE appointments SET status = 'completed', updated_at = ${now} WHERE id = ${id}`;
    await sql`INSERT INTO appointment_status_events (id, appointment_id, status, created_at) VALUES (${randomUUID()}, ${id}, 'completed', ${now})`;
  }

  async delete(id: string): Promise<void> {
    const sql = getDb();
    await sql`DELETE FROM appointment_status_events WHERE appointment_id = ${id}`;
    await sql`DELETE FROM appointments WHERE id = ${id}`;
  }
}

// ─── In-memory implementation (tests) ────────────────────────────────────────

export class InMemoryAppointmentRepository implements AppointmentRepository {
  private readonly store = new Map<string, Appointment>();

  async create(input: CreateAppointmentInput): Promise<Appointment> {
    const now = new Date().toISOString();
    const appointment: Appointment = {
      id: randomUUID(),
      ...input,
      status: 'pending',
      notes: null,
      idempotencyKey: input.idempotencyKey ?? null,
      paymentUrl: input.paymentUrl ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.store.set(appointment.id, appointment);
    return appointment;
  }

  async listForPatient(
    patientId: string,
    query: Partial<AppointmentListQuery> = {},
  ): Promise<PaginatedResult<Appointment>> {
    const limit = Math.min(query.limit ?? PAGINATION_DEFAULTS.limit, PAGINATION_DEFAULTS.maxLimit);
    const offset = query.offset ?? PAGINATION_DEFAULTS.offset;
    const { status } = query;

    const all = [...this.store.values()]
      .filter((a) => a.patientId === patientId && (!status || a.status === status))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const page = all.slice(offset, offset + limit);
    return buildResult(page, all.length, limit, offset);
  }

  async findByIdempotencyKey(key: string): Promise<Appointment | null> {
    for (const appt of this.store.values()) {
      if (appt.idempotencyKey === key) return appt;
    }
    return null;
  }

  async findById(id: string): Promise<Appointment | null> {
    return this.store.get(id) ?? null;
  }

  async confirmPayment(id: string): Promise<void> {
    const appointment = this.store.get(id);
    if (appointment) {
      appointment.status = 'confirmed';
      appointment.updatedAt = new Date().toISOString();
      this.store.set(id, appointment);
    }
  }

  async complete(id: string): Promise<void> {
    const appointment = this.store.get(id);
    if (appointment) {
      appointment.status = 'completed';
      appointment.updatedAt = new Date().toISOString();
      this.store.set(id, appointment);
    }
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildResult<T>(items: T[], total: number, limit: number, offset: number): PaginatedResult<T> {
  return { items, meta: { total, limit, offset, hasMore: offset + items.length < total } };
}

function toAppointment(row: Record<string, unknown>): Appointment {
  return {
    id: row['id'] as string,
    patientId: row['patient_id'] as string,
    doctorId: row['doctor_id'] as string,
    departmentId: row['department_id'] as string,
    slotId: row['slot_id'] as string,
    reasonForVisit: row['reason_for_visit'] as string,
    consultationFee: row['consultation_fee'] as number,
    status: row['status'] as Appointment['status'],
    notes: (row['notes'] as string | null | undefined) ?? null,
    idempotencyKey: (row['idempotency_key'] as string | null | undefined) ?? null,
    paymentUrl: (row['payment_url'] as string | null | undefined) ?? null,
    createdAt: row['created_at'] instanceof Date ? row['created_at'].toISOString() : String(row['created_at']),
    updatedAt: row['updated_at'] instanceof Date ? row['updated_at'].toISOString() : String(row['updated_at']),
  };
}
