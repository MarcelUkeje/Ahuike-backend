import { getDb } from '../../lib/db.js';
import type { Department, DepartmentSummary } from './department.model.js';

export interface DepartmentRepository {
  list(query?: string): Promise<DepartmentSummary[]>;
  findById(id: string): Promise<Department | null>;
}

// ─── NeonDB implementation ────────────────────────────────────────────────────

export class NeonDepartmentRepository implements DepartmentRepository {
  async list(query?: string): Promise<DepartmentSummary[]> {
    const sql = getDb();
    const normalized = query?.trim().toLowerCase() ?? '';
    const rows = (
      normalized
        ? await sql`
            SELECT id, name, slug, description, image_url, is_active
            FROM departments
            WHERE is_active = true
              AND (lower(name) LIKE ${'%' + normalized + '%'}
                OR lower(description) LIKE ${'%' + normalized + '%'})
            ORDER BY name
          `
        : await sql`
            SELECT id, name, slug, description, image_url, is_active
            FROM departments
            WHERE is_active = true
            ORDER BY name
          `
    ) as Record<string, unknown>[];
    return rows.map(toDepartmentSummary);
  }

  async findById(id: string): Promise<Department | null> {
    const sql = getDb();
    const rows = (await sql`
      SELECT id, name, slug, description, image_url, is_active
      FROM departments
      WHERE id = ${id} AND is_active = true
    `) as Record<string, unknown>[];
    if (rows.length === 0) return null;

    const doctors = (await sql`
      SELECT id, name, specialty, rating, consultation_fee, is_available
      FROM doctors
      WHERE department_id = ${id}
      ORDER BY name
    `) as Record<string, unknown>[];

    return {
      ...toDepartmentSummary(rows[0]!),
      doctors: doctors.map((d) => ({
        id: d['id'] as string,
        name: d['name'] as string,
        specialty: d['specialty'] as string,
        rating: Number(d['rating']),
        consultationFee: d['consultation_fee'] as number,
        isAvailable: d['is_available'] as boolean,
      })),
    };
  }
}

// ─── In-memory implementation (tests) ────────────────────────────────────────

const seedDepartments: DepartmentSummary[] = [
  { id: 'dept-general',     name: 'General Practice', slug: 'general-practice', description: 'Primary healthcare.',   imageUrl: null, isActive: true },
  { id: 'dept-cardiology',  name: 'Cardiology',       slug: 'cardiology',       description: 'Heart care.',           imageUrl: null, isActive: true },
  { id: 'dept-pediatrics',  name: 'Pediatrics',       slug: 'pediatrics',       description: 'Children care.',        imageUrl: null, isActive: true },
  { id: 'dept-orthopedics', name: 'Orthopedics',      slug: 'orthopedics',      description: 'Bone & joint care.',    imageUrl: null, isActive: true },
];

export class InMemoryDepartmentRepository implements DepartmentRepository {
  async list(query?: string): Promise<DepartmentSummary[]> {
    const q = query?.trim().toLowerCase() ?? '';
    return q
      ? seedDepartments.filter((d) =>
          d.name.toLowerCase().includes(q) || d.description.toLowerCase().includes(q),
        )
      : [...seedDepartments];
  }
  async findById(id: string): Promise<Department | null> {
    const dept = seedDepartments.find((d) => d.id === id);
    if (!dept) return null;
    return { ...dept, doctors: [] };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDepartmentSummary(row: Record<string, unknown>): DepartmentSummary {
  return {
    id: row['id'] as string,
    name: row['name'] as string,
    slug: row['slug'] as string,
    description: row['description'] as string,
    imageUrl: (row['image_url'] as string | null | undefined) ?? null,
    isActive: row['is_active'] as boolean,
  };
}
