import { getDb } from '../../lib/db.js';
import type { PaginatedResult, PaginationQuery } from '../../lib/pagination.js';
import { PAGINATION_DEFAULTS } from '../../lib/pagination.js';
import type { AppointmentSlot, Doctor, DoctorSummary } from './doctor.model.js';

export interface DoctorListQuery extends PaginationQuery {
  departmentId?: string;
  query?: string;
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  sortBy?: 'rating' | 'availability';
}

export interface DoctorRepository {
  list(query?: Partial<DoctorListQuery>): Promise<PaginatedResult<DoctorSummary>>;
  findById(id: string): Promise<Doctor | null>;
  create(data: { name: string; specialty: string; departmentId: string; bio: string; qualifications: string[]; consultationFee: number; imageUrl?: string | undefined; userId?: string }): Promise<DoctorSummary>;
  /** Atomically claim a slot only if it is unbooked and not in the past. */
  atomicClaimSlot(slotId: string): Promise<AppointmentSlot | null>;
  /** Compensating rollback: release a slot whose appointment creation subsequently failed. */
  releaseSlot(slotId: string): Promise<void>;
  softDelete(id: string): Promise<void>;
  ensureSlotsUpToDate(id: string): Promise<void>;
}

// ─── NeonDB implementation ────────────────────────────────────────────────────

export class NeonDoctorRepository implements DoctorRepository {
  
  async list(query: Partial<DoctorListQuery> = {}): Promise<PaginatedResult<DoctorSummary>> {
    const limit  = Math.min(query.limit ?? PAGINATION_DEFAULTS.limit, PAGINATION_DEFAULTS.maxLimit);
    const offset = query.offset ?? PAGINATION_DEFAULTS.offset;

    let dbQuery = `
      SELECT 
        d.id, d.name, d.slug, d.specialty, d.department_id, d.image_url, 
        d.rating, d.rating_count, d.consultation_fee, d.is_available
      FROM doctors d
      JOIN users u ON d.user_id = u.id
      WHERE d.is_available = true
    `;

    if (query.departmentId) {
      dbQuery += ` AND d.department_id = '${query.departmentId.replace(/'/g, "''")}'`;
    }
    if (query.query) {
      const q = query.query.replace(/'/g, "''");
      dbQuery += ` AND (d.name ILIKE '%${q}%' OR d.specialty ILIKE '%${q}%')`;
    }
    if (query.minPrice !== undefined) {
      dbQuery += ` AND d.consultation_fee >= ${query.minPrice}`;
    }
    if (query.maxPrice !== undefined) {
      dbQuery += ` AND d.consultation_fee <= ${query.maxPrice}`;
    }
    if (query.minRating !== undefined) {
      dbQuery += ` AND d.rating >= ${query.minRating}`;
    }

    if (query.sortBy === 'rating') {
      dbQuery += ` ORDER BY d.rating DESC NULLS LAST`;
    } else if (query.sortBy === 'availability') {
      dbQuery += ` ORDER BY d.rating DESC`; // fallback
    } else {
      dbQuery += ` ORDER BY d.name ASC`;
    }

    dbQuery += ` LIMIT ${limit} OFFSET ${offset}`;

    const sql = getDb();
    const rows = (await (sql as any).query(dbQuery)) as unknown as any[];
    
    let countQuery = `SELECT COUNT(*) FROM doctors d JOIN users u ON d.user_id = u.id WHERE d.is_available = true`;
    if (query.departmentId) countQuery += ` AND d.department_id = '${query.departmentId.replace(/'/g, "''")}'`;
    if (query.query) {
      const q = query.query.replace(/'/g, "''");
      countQuery += ` AND (d.name ILIKE '%${q}%' OR d.specialty ILIKE '%${q}%')`;
    }
    if (query.minPrice !== undefined) countQuery += ` AND d.consultation_fee >= ${query.minPrice}`;
    if (query.maxPrice !== undefined) countQuery += ` AND d.consultation_fee <= ${query.maxPrice}`;
    if (query.minRating !== undefined) countQuery += ` AND d.rating >= ${query.minRating}`;

    const countRows = (await (sql as any).query(countQuery)) as { count: string }[];
    const total = Number(countRows[0].count);

    const summaries = rows.map(toDoctorSummary);
    return buildResult(summaries, total, limit, offset);
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

    let slots = (await sql`
      SELECT id, doctor_id, slot_date, start_time, end_time, is_booked
      FROM appointment_slots
      WHERE doctor_id = ${id} AND slot_date >= CURRENT_DATE AND is_booked = false
      ORDER BY slot_date, start_time
    `) as Record<string, unknown>[];

    // MVP Auto-slot generator
    if (slots.length < 10) {
      const needed = 10 - slots.length;
      const newSlots: Record<string, unknown>[] = [];
      let currentGenDate = new Date();
      currentGenDate.setDate(currentGenDate.getDate() + 1); // Start from tomorrow
      let added = 0;
      
      while(added < needed) {
        const slotDate = currentGenDate.toISOString().substring(0, 10);
        const times = ['09:00', '11:00', '14:00', '16:00'];
        for (const t of times) {
          if (added >= needed) break;
          const endT = t.replace(':00', ':30');
          const slotId = `slot-${id}-${Date.now()}-${added}`;
          
          try {
             const inserted = await sql`
               INSERT INTO appointment_slots (id, doctor_id, slot_date, start_time, end_time, is_booked)
               VALUES (${slotId}, ${id}, ${slotDate}, ${t}, ${endT}, false)
               ON CONFLICT DO NOTHING
               RETURNING id, doctor_id, slot_date, start_time, end_time, is_booked
             ` as Record<string, unknown>[];
             if (inserted.length > 0) {
               newSlots.push(inserted[0]!);
               added++;
             }
          } catch(e) {
             // Ignore
          }
        }
        currentGenDate.setDate(currentGenDate.getDate() + 1);
      }
      
      slots = [...slots, ...newSlots].sort((a, b) => 
        `${a['slot_date']}${a['start_time']}`.localeCompare(`${b['slot_date']}${b['start_time']}`)
      );
    }

    return {
      ...toDoctorSummary(doc),
      bio: doc['bio'] as string,
      qualifications: doc['qualifications'] as string[],
      availableSlots: slots.map(toSlot),
    };
  }

  async create(data: { name: string; specialty: string; departmentId: string; bio: string; qualifications: string[]; consultationFee: number; imageUrl?: string | undefined; userId?: string }): Promise<DoctorSummary> {
    const sql = getDb();
    const id = `dr-${Date.now()}`;
    const slug = data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now();
    
    // For now, if userId is omitted, generate a dummy user
    const userId = data.userId ?? `dummy-user-${Date.now()}`;
    if (!data.userId) {
      await sql`INSERT INTO users (id, email, password_hash, role) VALUES (${userId}, ${id + '@ahuike.test'}, 'hash', 'doctor') ON CONFLICT DO NOTHING`;
    }

    const rows = (await sql`
      INSERT INTO doctors (id, user_id, name, slug, specialty, department_id, bio, qualifications, consultation_fee, image_url)
      VALUES (${id}, ${userId}, ${data.name}, ${slug}, ${data.specialty}, ${data.departmentId}, ${data.bio}, ${data.qualifications}, ${data.consultationFee}, ${data.imageUrl ?? null})
      RETURNING id, name, slug, specialty, department_id, image_url, rating, rating_count, consultation_fee, is_available
    `) as Record<string, unknown>[];
    
    await this.ensureSlotsUpToDate(id);
    return toDoctorSummary(rows[0]!);
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

  async softDelete(id: string): Promise<void> {
    const sql = getDb();
    
    const docRows = (await sql`SELECT user_id FROM doctors WHERE id = ${id}`) as { user_id: string }[];
    if (docRows.length === 0) return;
    const userId = docRows[0]!.user_id;

    // 1. Mark doctor as unavailable
    await sql`UPDATE doctors SET is_available = false WHERE id = ${id}`;

    // 2. Deactivate the user account
    await sql`UPDATE users SET is_active = false WHERE id = ${userId}`;

    // 3. Cancel upcoming appointments
    await sql`
      UPDATE appointments
      SET status = 'cancelled'
      WHERE doctor_id = ${id}
        AND status IN ('pending', 'confirmed')
        AND slot_id IN (
          SELECT id FROM appointment_slots WHERE slot_date >= CURRENT_DATE
        )
    `;

    // 4. Delete unbooked future slots
    await sql`
      DELETE FROM appointment_slots
      WHERE doctor_id = ${id}
        AND is_booked = false
        AND slot_date >= CURRENT_DATE
    `;
  }

  async ensureSlotsUpToDate(id: string): Promise<void> {
    const sql = getDb();
    
    // Check if the doctor is active
    const docRows = await sql`SELECT is_available FROM doctors WHERE id = ${id}` as { is_available: boolean }[];
    if (docRows.length === 0 || !docRows[0]!.is_available) return;

    // Find the max slot_date currently in the DB
    const maxDateRows = await sql`
      SELECT MAX(slot_date) as max_date 
      FROM appointment_slots 
      WHERE doctor_id = ${id}
    ` as { max_date: Date | null }[];

    let startDate = new Date(); // Start from today
    if (maxDateRows[0]?.max_date) {
      const maxDate = new Date(maxDateRows[0].max_date);
      startDate = new Date(maxDate);
      startDate.setDate(startDate.getDate() + 1); // start from the day after the last generated slot
    }

    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 30); // Generate up to 30 days out

    if (startDate > endDate) {
      return; // Already up to date
    }

    // Generate slots (Mon-Fri, 09:00 - 16:00, 30 min intervals)
    const slotsToInsert = [];
    let currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      const day = currentDate.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
      if (day >= 1 && day <= 5) {
        // Weekdays only
        const dateStr = currentDate.toISOString().substring(0, 10);
        // 9:00, 9:30, 10:00, 10:30 ... 15:30
        for (let hour = 9; hour < 16; hour++) {
          slotsToInsert.push({ id: `slot-${id}-${dateStr}-${hour}:00`, doctor_id: id, slot_date: dateStr, start_time: `${hour.toString().padStart(2, '0')}:00`, end_time: `${hour.toString().padStart(2, '0')}:30`, is_booked: false });
          slotsToInsert.push({ id: `slot-${id}-${dateStr}-${hour}:30`, doctor_id: id, slot_date: dateStr, start_time: `${hour.toString().padStart(2, '0')}:30`, end_time: `${(hour+1).toString().padStart(2, '0')}:00`, is_booked: false });
        }
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }

        if (slotsToInsert.length > 0) {
      const batchSize = 10;
      for (let i = 0; i < slotsToInsert.length; i += batchSize) {
        const batch = slotsToInsert.slice(i, i + batchSize);
        await Promise.all(batch.map(slot => sql`
          INSERT INTO appointment_slots (id, doctor_id, slot_date, start_time, end_time, is_booked)
          VALUES (${slot.id}, ${slot.doctor_id}, ${slot.slot_date}, ${slot.start_time}, ${slot.end_time}, ${slot.is_booked})
          ON CONFLICT DO NOTHING
        `));
      }
    }
  }
}

// ─── In-memory implementation (tests) ────────────────────────────────────────

const seedDoctors: Doctor[] = [
  {
    id: 'dr-amaka-obi', name: 'Dr. Amaka Obi', slug: 'dr-amaka-obi',
    specialty: 'General Practitioner', departmentId: 'dept-general',
    imageUrl: 'assets/images/dr_obi.jpeg', rating: 4.8, ratingCount: 312, consultationFee: 15000, isAvailable: true,
    bio: 'Dr. Amaka Obi is a compassionate GP with 10+ years of experience.',
    qualifications: ['MBBS (University of Lagos)', 'FMCGP'],
    availableSlots: [],
  },
  {
    id: 'dr-emeka-nwosu', name: 'Dr. Emeka Nwosu', slug: 'dr-emeka-nwosu',
    specialty: 'Cardiologist', departmentId: 'dept-cardiology',
    imageUrl: 'assets/images/dr_nwosu.jpeg', rating: 4.9, ratingCount: 187, consultationFee: 100, isAvailable: true,
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
    await this.ensureSlotsUpToDate(id);
    const availableSlots = [...this.slots.values()]
      .filter((s) => s.doctorId === id && !s.isBooked)
      .sort((a, b) => `${a.slotDate}${a.startTime}`.localeCompare(`${b.slotDate}${b.startTime}`));
    return { ...doctor, availableSlots };
  }

  async create(data: { name: string; specialty: string; departmentId: string; bio: string; qualifications: string[]; consultationFee: number; imageUrl?: string | undefined }): Promise<DoctorSummary> {
    const id = `dr-${Date.now()}`;
    const slug = data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now();
    const doc: Doctor = {
      id, name: data.name, slug, specialty: data.specialty, departmentId: data.departmentId,
      bio: data.bio, qualifications: data.qualifications, consultationFee: data.consultationFee,
      imageUrl: data.imageUrl ?? null, rating: 0, ratingCount: 0, isAvailable: true, availableSlots: []
    };
    seedDoctors.push(doc);
    const { bio: _b, qualifications: _q, availableSlots: _s, ...summary } = doc;
    await this.ensureSlotsUpToDate(id);
    return summary;
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

  async softDelete(id: string): Promise<void> {
    const idx = seedDoctors.findIndex((d) => d.id === id);
    if (idx !== -1) {
      seedDoctors[idx]!.isAvailable = false;
    }
  }

  async ensureSlotsUpToDate(id: string): Promise<void> {
    // Stub
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
