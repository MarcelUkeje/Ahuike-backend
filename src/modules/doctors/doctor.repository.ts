import { getDb } from '../../lib/db.js';
import type { AppointmentSlot, Doctor, DoctorSummary } from './doctor.model.js';

export interface DoctorRepository {
  list(departmentId?: string): Promise<DoctorSummary[]>;
  findById(id: string): Promise<Doctor | null>;
  /** Atomically claim a slot only if it is unbooked and not in the past. Returns the slot, or null if already taken / expired. */
  atomicClaimSlot(slotId: string): Promise<AppointmentSlot | null>;
  /** Compensating rollback: release a slot that was claimed but whose appointment creation subsequently failed. */
  releaseSlot(slotId: string): Promise<void>;
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

  async atomicClaimSlot(slotId: string): Promise<AppointmentSlot | null> {
    const sql = getDb();
    // Single atomic UPDATE that only succeeds if the slot is both unbooked AND in the future.
    // If 0 rows are returned another concurrent request already claimed it, or the slot is past.
    const rows = (await sql`
      UPDATE appointment_slots
      SET is_booked = true
      WHERE id = ${slotId}
        AND is_booked = false
        AND slot_date >= CURRENT_DATE
      RETURNING id, doctor_id, slot_date, start_time, end_time, is_booked
    `) as Record<string, unknown>[];
    return rows.length === 0 ? null : toSlot(rows[0]!);
  }

  async releaseSlot(slotId: string): Promise<void> {
    const sql = getDb();
    await sql`UPDATE appointment_slots SET is_booked = false WHERE id = ${slotId}`;
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
    availableSlots: [], // populated dynamically by InMemoryDoctorRepository
  },
  {
    id: 'dr-emeka-nwosu', name: 'Dr. Emeka Nwosu', slug: 'dr-emeka-nwosu',
    specialty: 'Cardiologist', departmentId: 'dept-cardiology',
    imageUrl: null, rating: 4.9, ratingCount: 187, consultationFee: 25000, isAvailable: true,
    bio: 'Dr. Emeka Nwosu specialises in interventional cardiology.',
    qualifications: ['MBBS (UNILAG)', 'FMCP (Cardiology)'],
    availableSlots: [], // populated dynamically by InMemoryDoctorRepository
  },
];

export class InMemoryDoctorRepository implements DoctorRepository {
  private readonly slots = new Map<string, AppointmentSlot>();

  constructor() {
    // Seed realistic future-dated slots so booking works without a DB connection.
    const day = (offset: number): string => {
      const d = new Date();
      d.setDate(d.getDate() + offset);
      return d.toISOString().substring(0, 10);
    };
    const seed: AppointmentSlot[] = [
      { id: 'slot-amaka-001', doctorId: 'dr-amaka-obi',   slotDate: day(1), startTime: '09:00', endTime: '09:30', isBooked: false },
      { id: 'slot-amaka-002', doctorId: 'dr-amaka-obi',   slotDate: day(1), startTime: '09:30', endTime: '10:00', isBooked: false },
      { id: 'slot-amaka-003', doctorId: 'dr-amaka-obi',   slotDate: day(2), startTime: '09:00', endTime: '09:30', isBooked: false },
      { id: 'slot-amaka-004', doctorId: 'dr-amaka-obi',   slotDate: day(3), startTime: '10:00', endTime: '10:30', isBooked: false },
      { id: 'slot-emeka-001', doctorId: 'dr-emeka-nwosu', slotDate: day(1), startTime: '14:00', endTime: '14:30', isBooked: false },
      { id: 'slot-emeka-002', doctorId: 'dr-emeka-nwosu', slotDate: day(1), startTime: '14:30', endTime: '15:00', isBooked: false },
      { id: 'slot-emeka-003', doctorId: 'dr-emeka-nwosu', slotDate: day(2), startTime: '14:00', endTime: '14:30', isBooked: false },
    ];
    for (const slot of seed) this.slots.set(slot.id, slot);
  }

  async list(departmentId?: string): Promise<DoctorSummary[]> {
    const source = departmentId
      ? seedDoctors.filter((d) => d.departmentId === departmentId)
      : seedDoctors;
    return source.map(({ bio: _b, qualifications: _q, availableSlots: _s, ...summary }) => summary);
  }
  async findById(id: string): Promise<Doctor | null> {
    const doctor = seedDoctors.find((d) => d.id === id);
    if (!doctor) return null;
    // Return real slots from the live map so booking works end-to-end in dev
    const availableSlots = [...this.slots.values()]
      .filter((s) => s.doctorId === id && !s.isBooked)
      .sort((a, b) => `${a.slotDate}${a.startTime}`.localeCompare(`${b.slotDate}${b.startTime}`));
    return { ...doctor, availableSlots };
  }
  async atomicClaimSlot(slotId: string): Promise<AppointmentSlot | null> {
    const slot = this.slots.get(slotId);
    if (!slot || slot.isBooked) return null;
    // Reject past slots
    if (new Date(slot.slotDate) < new Date(new Date().toDateString())) return null;
    const claimed = { ...slot, isBooked: true };
    this.slots.set(slotId, claimed);
    return claimed;
  }
  async releaseSlot(slotId: string): Promise<void> {
    const slot = this.slots.get(slotId);
    if (slot) this.slots.set(slotId, { ...slot, isBooked: false });
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
