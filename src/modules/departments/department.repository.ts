import { getDb } from '../../lib/db.js';
import type { PaginatedResult, PaginationQuery } from '../../lib/pagination.js';
import { PAGINATION_DEFAULTS } from '../../lib/pagination.js';
import type { Department, DepartmentSummary } from './department.model.js';

export interface DepartmentListQuery extends PaginationQuery {
  q?: string;
}

export interface DepartmentRepository {
  list(query?: Partial<DepartmentListQuery>): Promise<PaginatedResult<DepartmentSummary>>;
  findById(id: string): Promise<Department | null>;
}

// ─── NeonDB implementation ────────────────────────────────────────────────────

export class NeonDepartmentRepository implements DepartmentRepository {
  async list(query: Partial<DepartmentListQuery> = {}): Promise<PaginatedResult<DepartmentSummary>> {
    const sql = getDb();
    const limit  = Math.min(query.limit  ?? PAGINATION_DEFAULTS.limit,  PAGINATION_DEFAULTS.maxLimit);
    const offset = query.offset ?? PAGINATION_DEFAULTS.offset;
    const normalized = query.q?.trim().toLowerCase() ?? '';

    // Use parameterised fragment pattern — neon tagged-template handles escaping
    if (normalized) {
      const like = `%${normalized}%`;
      const countRows = (await sql`
        SELECT COUNT(*) AS total FROM departments
        WHERE is_active = true
          AND (lower(name) LIKE ${like} OR lower(description) LIKE ${like})
      `) as { total: string }[];
      const total = Number(countRows[0]!.total);

      const rows = (await sql`
        SELECT id, name, slug, description, image_url, is_active
        FROM departments
        WHERE is_active = true
          AND (lower(name) LIKE ${like} OR lower(description) LIKE ${like})
        ORDER BY name
        LIMIT ${limit} OFFSET ${offset}
      `) as Record<string, unknown>[];

      return buildResult(rows.map(toDepartmentSummary), total, limit, offset);
    }

    const countRows = (await sql`
      SELECT COUNT(*) AS total FROM departments WHERE is_active = true
    `) as { total: string }[];
    const total = Number(countRows[0]!.total);

    const rows = (await sql`
      SELECT id, name, slug, description, image_url, is_active
      FROM departments
      WHERE is_active = true
      ORDER BY name
      LIMIT ${limit} OFFSET ${offset}
    `) as Record<string, unknown>[];

    return buildResult(rows.map(toDepartmentSummary), total, limit, offset);
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
  { id: 'dept-general-medicine',     name: 'General Practice', slug: 'general-practice', description: 'Primary healthcare.',   imageUrl: null, isActive: true },
  { id: 'dept-cardiology',  name: 'Cardiology',       slug: 'cardiology',       description: 'Heart care.',           imageUrl: null, isActive: true },
  { id: 'dept-pediatrics',  name: 'Pediatrics',       slug: 'pediatrics',       description: 'Children care.',        imageUrl: null, isActive: true },
  { id: 'dept-orthopedics', name: 'Orthopedics',      slug: 'orthopedics',      description: 'Bone & joint care.',    imageUrl: null, isActive: true },
];

export class InMemoryDepartmentRepository implements DepartmentRepository {
  async list(query: Partial<DepartmentListQuery> = {}): Promise<PaginatedResult<DepartmentSummary>> {
    const limit  = Math.min(query.limit  ?? PAGINATION_DEFAULTS.limit,  PAGINATION_DEFAULTS.maxLimit);
    const offset = query.offset ?? PAGINATION_DEFAULTS.offset;
    const q = query.q?.trim().toLowerCase() ?? '';

    const filtered = q
      ? seedDepartments.filter(
          (d) => d.name.toLowerCase().includes(q) || d.description.toLowerCase().includes(q),
        )
      : [...seedDepartments];

    const page = filtered.slice(offset, offset + limit);
    return buildResult(page, filtered.length, limit, offset);
  }

  async findById(id: string): Promise<Department | null> {
    const dept = seedDepartments.find((d) => d.id === id);
    if (!dept) return null;
    return { ...dept, doctors: [] };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildResult<T>(items: T[], total: number, limit: number, offset: number): PaginatedResult<T> {
  return { items, meta: { total, limit, offset, hasMore: offset + items.length < total } };
}

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
