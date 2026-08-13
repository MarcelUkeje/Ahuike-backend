import { randomUUID } from 'node:crypto';
import { getDb } from '../../lib/db.js';
import type { Appointment } from './appointment.model.js';

export interface CreateAppointmentInput {
  patientId: string;
  doctorId: string;
  departmentId: string;
  slotId: string;
  reasonForVisit: string;
  consultationFee: number;
}

export interface AppointmentRepository {
  create(input: CreateAppointmentInput): Promise<Appointment>;
  listForPatient(patientId: string): Promise<Appointment[]>;
  findById(id: string): Promise<Appointment | null>;
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
         reason_for_visit, consultation_fee, status, created_at, updated_at)
      VALUES
        (${id}, ${input.patientId}, ${input.doctorId}, ${input.departmentId},
         ${input.slotId}, ${input.reasonForVisit}, ${input.consultationFee},
         'pending', ${now}, ${now})
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
      createdAt: now,
      updatedAt: now,
    };
  }

  async listForPatient(patientId: string): Promise<Appointment[]> {
    const sql = getDb();
    const rows = (await sql`
      SELECT id, patient_id, doctor_id, department_id, slot_id,
             reason_for_visit, consultation_fee, status, notes, created_at, updated_at
      FROM appointments
      WHERE patient_id = ${patientId}
      ORDER BY created_at DESC
    `) as Record<string, unknown>[];
    return rows.map(toAppointment);
  }

  async findById(id: string): Promise<Appointment | null> {
    const sql = getDb();
    const rows = (await sql`
      SELECT id, patient_id, doctor_id, department_id, slot_id,
             reason_for_visit, consultation_fee, status, notes, created_at, updated_at
      FROM appointments
      WHERE id = ${id}
    `) as Record<string, unknown>[];
    return rows.length === 0 ? null : toAppointment(rows[0]!);
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
      createdAt: now,
      updatedAt: now,
    };
    this.store.set(appointment.id, appointment);
    return appointment;
  }

  async listForPatient(patientId: string): Promise<Appointment[]> {
    return [...this.store.values()]
      .filter((a) => a.patientId === patientId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async findById(id: string): Promise<Appointment | null> {
    return this.store.get(id) ?? null;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
    createdAt: String(row['created_at']),
    updatedAt: String(row['updated_at']),
  };
}
