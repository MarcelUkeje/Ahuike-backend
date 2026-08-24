import { randomUUID } from 'node:crypto';
import { getDb } from '../../lib/db.js';
import type { User, OTPCode } from './user.model.js';

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  role: User['role'];
}

export interface UserRepository {
  create(input: CreateUserInput): Promise<User>;
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  markVerified(id: string): Promise<void>;
  softDelete(id: string): Promise<void>;
  hardDelete(id: string): Promise<void>;

  // OTP operations
  createOtp(userId: string, code: string, expiresAt: Date): Promise<void>;
  findOtp(userId: string, code: string): Promise<OTPCode | null>;
  deleteOtpsForUser(userId: string): Promise<void>;
}

export class NeonUserRepository implements UserRepository {
  async create(input: CreateUserInput): Promise<User> {
    const sql = getDb();
    const id = `user_${randomUUID()}`;
    const now = new Date().toISOString();

    await sql`
      INSERT INTO users (id, email, password_hash, role, is_verified, is_active, created_at, updated_at)
      VALUES (${id}, ${input.email}, ${input.passwordHash}, ${input.role}, false, true, ${now}, ${now})
    `;

    return {
      id,
      email: input.email,
      passwordHash: input.passwordHash,
      role: input.role,
      isVerified: false,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
  }

  async findByEmail(email: string): Promise<User | null> {
    const sql = getDb();
    const rows = (await sql`
      SELECT id, email, password_hash, role, is_verified, is_active, created_at, updated_at
      FROM users WHERE email = ${email}
    `) as Record<string, unknown>[];
    return rows.length === 0 ? null : toUser(rows[0]!);
  }

  async findById(id: string): Promise<User | null> {
    const sql = getDb();
    const rows = (await sql`
      SELECT id, email, password_hash, role, is_verified, is_active, created_at, updated_at
      FROM users WHERE id = ${id}
    `) as Record<string, unknown>[];
    return rows.length === 0 ? null : toUser(rows[0]!);
  }

  async markVerified(id: string): Promise<void> {
    const sql = getDb();
    await sql`UPDATE users SET is_verified = true, updated_at = now() WHERE id = ${id}`;
  }

  async softDelete(id: string): Promise<void> {
    const sql = getDb();
    await sql`UPDATE users SET is_active = false, updated_at = now() WHERE id = ${id}`;
  }

  async hardDelete(id: string): Promise<void> {
    const sql = getDb();
    await sql`DELETE FROM otp_codes WHERE user_id = ${id}`;
    await sql`DELETE FROM users WHERE id = ${id}`;
  }

  async createOtp(userId: string, code: string, expiresAt: Date): Promise<void> {
    const sql = getDb();
    const id = `otp_${randomUUID()}`;
    await sql`
      INSERT INTO otp_codes (id, user_id, code, expires_at, created_at)
      VALUES (${id}, ${userId}, ${code}, ${expiresAt.toISOString()}, now())
    `;
  }

  async findOtp(userId: string, code: string): Promise<OTPCode | null> {
    const sql = getDb();
    const rows = (await sql`
      SELECT id, user_id, code, expires_at, created_at
      FROM otp_codes
      WHERE user_id = ${userId} AND code = ${code}
    `) as Record<string, unknown>[];
    if (rows.length === 0) return null;
    return {
      id: rows[0]!['id'] as string,
      userId: rows[0]!['user_id'] as string,
      code: rows[0]!['code'] as string,
      expiresAt: (rows[0]!['expires_at'] as Date).toISOString(),
      createdAt: (rows[0]!['created_at'] as Date).toISOString(),
    };
  }

  async deleteOtpsForUser(userId: string): Promise<void> {
    const sql = getDb();
    await sql`DELETE FROM otp_codes WHERE user_id = ${userId}`;
  }
}

// ─── InMemory implementation for tests ────────────────────────────────────────

export class InMemoryUserRepository implements UserRepository {
  private users = new Map<string, User>();
  private otps = new Map<string, OTPCode>();

  async create(input: CreateUserInput): Promise<User> {
    const now = new Date().toISOString();
    const id = `user_${randomUUID()}`;
    const user: User = {
      id,
      ...input,
      isVerified: false,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    this.users.set(id, user);
    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return [...this.users.values()].find((u) => u.email === email) ?? null;
  }

  async findById(id: string): Promise<User | null> {
    return this.users.get(id) ?? null;
  }

  async markVerified(id: string): Promise<void> {
    const user = this.users.get(id);
    if (user) {
      user.isVerified = true;
      user.updatedAt = new Date().toISOString();
    }
  }

  async softDelete(id: string): Promise<void> {
    const user = this.users.get(id);
    if (user) {
      user.isActive = false;
      user.updatedAt = new Date().toISOString();
    }
  }

  async hardDelete(id: string): Promise<void> {
    this.users.delete(id);
    for (const [key, value] of this.otps.entries()) {
      if (value.userId === id) {
        this.otps.delete(key);
      }
    }
  }

  async createOtp(userId: string, code: string, expiresAt: Date): Promise<void> {
    const id = `otp_${randomUUID()}`;
    this.otps.set(id, { id, userId, code, expiresAt: expiresAt.toISOString(), createdAt: new Date().toISOString() });
  }

  async findOtp(userId: string, code: string): Promise<OTPCode | null> {
    return [...this.otps.values()].find((o) => o.userId === userId && o.code === code) ?? null;
  }

  async deleteOtpsForUser(userId: string): Promise<void> {
    for (const [id, otp] of this.otps.entries()) {
      if (otp.userId === userId) {
        this.otps.delete(id);
      }
    }
  }
}

function toUser(row: Record<string, unknown>): User {
  return {
    id: row['id'] as string,
    email: row['email'] as string,
    passwordHash: row['password_hash'] as string,
    role: row['role'] as User['role'],
    isVerified: row['is_verified'] as boolean,
    isActive: row['is_active'] as boolean,
    createdAt: row['created_at'] instanceof Date ? row['created_at'].toISOString() : String(row['created_at']),
    updatedAt: row['updated_at'] instanceof Date ? row['updated_at'].toISOString() : String(row['updated_at']),
  };
}

