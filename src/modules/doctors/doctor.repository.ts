import { getDb } from '../../lib/db.js';
import type { PaginatedResult, PaginationQuery } from '../../lib/pagination.js';
import { PAGINATION_DEFAULTS } from '../../lib/pagination.js';
import type { AppointmentSlot, Doctor, DoctorSummary } from './doctor.model.js';

export interface DoctorListQuery extends PaginationQuery {
  departmentId?: string;
}

export interface DoctorRepository {
  list(query?: Partial<DoctorListQuery>): Promise<PaginatedResult<DoctorSummary>>;
  findById(id: string): Promise<Doctor | null>;
  /** Atomically claim a slot only if it is unbooked and not in the past. */
  atomicClaimSlot(slotId: string): Promise<AppointmentSlot | null>;
  /** Compensating rollback: release a slot whose appointment creation subsequently failed. */
  releaseSlot(slotId: string): Promise<void>;
}

// ─── NeonDB implementation ────────────────────────────────────────────────────

export class NeonDoctorRepository implements DoctorRepository {
  async list(query: Partial<DoctorListQuery> = {}): Promise<PaginatedResult<DoctorSummary>> {
    const sql = getDb();
    const limit       = Math.min(query.limit ?? PAGINATION_DEFAULTS.limit, PAGINATION_DEFAULTS.maxLimit);
    const offset      = query.offset ?? PAGINATION_DEFAULTS.offset;
    const { departmentId } = query;

    if (departmentId) {
      const countRows = (await sql`
        SELECT COUNT(*) AS total FROM doctors WHERE department_id = ${departmentId}
      `) as { total: string }[];
      const total = Number(countRows[0]!.total);

      const rows = (await sql`
        SELECT id, name, slug, specialty, department_id, image_url,
               rating, rating_count, consultation_fee, is_available
        FROM doctors
        WHERE department_id = ${departmentId}
        ORDER BY name
        LIMIT ${limit} OFFSET ${offset}
      `) as Record<string, unknown>[];

      return buildResult(rows.map(toDoctorSummary), total, limit, offset);
    }

    const countRows = (await sql`SELECT COUNT(*) AS total FROM doctors`) as { total: string }[];
    const total = Number(countRows[0]!.total);

    const rows = (await sql`
      SELECT id, name, slug, specialty, department_id, image_url,
             rating, rating_count, consultation_fee, is_available
      FROM doctors
      ORDER BY name
      LIMIT ${limit} OFFSET ${offset}
    `) as Record<string, unknown>[];

    return buildResult(rows.map(toDoctorSummary), total, limit, offset);
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

  constructor() {
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

  async list(query: Partial<DoctorListQuery> = {}): Promise<PaginatedResult<DoctorSummary>> {
    const limit  = Math.min(query.limit ?? PAGINATION_DEFAULTS.limit, PAGINATION_DEFAULTS.maxLimit);
    const offset = query.offset ?? PAGINATION_DEFAULTS.offset;
    const { departmentId } = query;

    const source = departmentId
      ? seedDoctors.filter((d) => d.departmentId === departmentId)
      : seedDoctors;

    const summaries = source.map(({ bio: _b, qualifications: _q, availableSlots: _s, ...summary }) => summary);
    const page = summaries.slice(offset, offset + limit);
    return buildResult(page, summaries.length, limit, offset);
  }

  async findById(id: string): Promise<Doctor | null> {
    const doctor = seedDoctors.find((d) => d.id === id);
    if (!doctor) return null;
    const availableSlots = [...this.slots.values()]
      .filter((s) => s.doctorId === id && !s.isBooked)
      .sort((a, b) => `${a.slotDate}${a.startTime}`.localeCompare(`${b.slotDate}${b.startTime}`));
    return { ...doctor, availableSlots };
  }

  async atomicClaimSlot(slotId: string): Promise<AppointmentSlot | null> {
    const slot = this.slots.get(slotId);
    if (!slot || slot.isBooked) return null;
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

function buildResult<T>(items: T[], total: number, limit: number, offset: number): PaginatedResult<T> {
  return { items, meta: { total, limit, offset, hasMore: offset + items.length < total } };
}

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
