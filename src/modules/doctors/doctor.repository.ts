import { getDb } from '../../lib/db.js';
import type { AppointmentSlot, Doctor, DoctorSummary } from './doctor.model.js';

export interface DoctorRepository {
  list(departmentId?: string): Promise<DoctorSummary[]>;
  findById(id: string): Promise<Doctor | null>;
  findSlotById(slotId: string): Promise<AppointmentSlot | null>;
  markSlotBooked(slotId: string): Promise<void>;
}

// ─── NeonDB implementation ────────────────────────────────────────────────────

export class NeonDoctorRepository implements DoctorRepository {
  async list(departmentId?: string): Promise<DoctorSummary[]> {
    const sql = getDb();
    const rows = (
      departmentId
        ? await sql`
            SELECT id, name, slug, specialty, department_id, image_url,
                   rating, rating_count, consultation_fee, is_available
            FROM doctors
            WHERE department_id = ${departmentId}
            ORDER BY name
          `
        : await sql`
            SELECT id, name, slug, specialty, department_id, image_url,
                   rating, rating_count, consultation_fee, is_available
            FROM doctors
            ORDER BY name
          `
    ) as Record<string, unknown>[];
    return rows.map(toDoctorSummary);
  }

  async findById(id: string): Promise<Doctor | null> {
    const sql = getDb();
    const rows = (await sql`
      SELECT id, name, slug, specialty, department_id, bio, qualifications,
             image_url, rating, rating_count, consultation_fee, is_available
      FROM doctors
      WHERE id = ${id}
    `) as Record<string, unknown>[];
    if (rows.length === 0) return null;
    const doc = rows[0]!;

    const slots = (await sql`
      SELECT id, doctor_id, slot_date, start_time, end_time, is_booked
      FROM appointment_slots
      WHERE doctor_id = ${id} AND slot_date >= CURRENT_DATE AND is_booked = false
      ORDER BY slot_date, start_time
    `) as Record<string, unknown>[];

    return {
      ...toDoctorSummary(doc),
      bio: doc['bio'] as string,
      qualifications: doc['qualifications'] as string[],
      availableSlots: slots.map(toSlot),
    };
  }

  async findSlotById(slotId: string): Promise<AppointmentSlot | null> {
    const sql = getDb();
    const rows = (await sql`
      SELECT id, doctor_id, slot_date, start_time, end_time, is_booked
      FROM appointment_slots
      WHERE id = ${slotId}
    `) as Record<string, unknown>[];
    return rows.length === 0 ? null : toSlot(rows[0]!);
  }

  async markSlotBooked(slotId: string): Promise<void> {
    const sql = getDb();
    await sql`UPDATE appointment_slots SET is_booked = true WHERE id = ${slotId}`;
  }
}

// ─── In-memory implementation (tests) ────────────────────────────────────────

const seedDoctors: Doctor[] = [
  {
    id: 'dr-amaka-obi', name: 'Dr. Amaka Obi', slug: 'dr-amaka-obi',
    specialty: 'General Practitioner', departmentId: 'dept-general',
    imageUrl: null, rating: 4.8, ratingCount: 312, consultationFee: 15000, isAvailable: true,
    bio: 'Dr. Amaka Obi is a compassionate GP with 10+ years of experience.',
    qualifications: ['MBBS (University of Lagos)', 'FMCGP'],
    availableSlots: [],
  },
  {
    id: 'dr-emeka-nwosu', name: 'Dr. Emeka Nwosu', slug: 'dr-emeka-nwosu',
    specialty: 'Cardiologist', departmentId: 'dept-cardiology',
    imageUrl: null, rating: 4.9, ratingCount: 187, consultationFee: 25000, isAvailable: true,
    bio: 'Dr. Emeka Nwosu specialises in interventional cardiology.',
    qualifications: ['MBBS (UNILAG)', 'FMCP (Cardiology)'],
    availableSlots: [],
  },
];

export class InMemoryDoctorRepository implements DoctorRepository {
  private readonly slots = new Map<string, AppointmentSlot>();

  async list(departmentId?: string): Promise<DoctorSummary[]> {
    const source = departmentId
      ? seedDoctors.filter((d) => d.departmentId === departmentId)
      : seedDoctors;
    return source.map(({ bio: _b, qualifications: _q, availableSlots: _s, ...summary }) => summary);
  }
  async findById(id: string): Promise<Doctor | null> {
    return seedDoctors.find((d) => d.id === id) ?? null;
  }
  async findSlotById(slotId: string): Promise<AppointmentSlot | null> {
    return this.slots.get(slotId) ?? null;
  }
  async markSlotBooked(slotId: string): Promise<void> {
    const slot = this.slots.get(slotId);
    if (slot) this.slots.set(slotId, { ...slot, isBooked: true });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDoctorSummary(row: Record<string, unknown>): DoctorSummary {
  return {
    id: row['id'] as string,
    name: row['name'] as string,
    slug: row['slug'] as string,
    specialty: row['specialty'] as string,
    departmentId: row['department_id'] as string,
    imageUrl: (row['image_url'] as string | null | undefined) ?? null,
    rating: Number(row['rating']),
    ratingCount: row['rating_count'] as number,
    consultationFee: row['consultation_fee'] as number,
    isAvailable: row['is_available'] as boolean,
  };
}

function toSlot(row: Record<string, unknown>): AppointmentSlot {
  return {
    id: row['id'] as string,
    doctorId: row['doctor_id'] as string,
    slotDate: String(row['slot_date']).substring(0, 10),
    startTime: String(row['start_time']).substring(0, 5),
    endTime: String(row['end_time']).substring(0, 5),
    isBooked: row['is_booked'] as boolean,
  };
}
