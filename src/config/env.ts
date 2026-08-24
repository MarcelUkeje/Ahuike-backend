import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  CORS_ORIGINS: z.string().default('*'),
  // NeonDB — required in production, optional in test (in-memory adapters used)
  DATABASE_URL: z.string().min(1).optional(),
  // JWT signing secret — generate with: openssl rand -hex 64
  // Required in production; defaults to an insecure dev value when absent.
  JWT_SECRET: z.string().min(32).default('dev-secret-please-replace-in-production-use-openssl-rand-hex-64'),
  // Upstash Redis — optional; caching is skipped gracefully when absent
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
  // Paystack — secret key for server-side payment operations
  PAYSTACK_SECRET_KEY: z.string().min(1),
  // Resend — API key for transactional emails
  RESEND_API_KEY: z.string().min(1).optional(),
});

export type AppEnvironment = z.infer<typeof envSchema>;

export function loadEnvironment(source: NodeJS.ProcessEnv = process.env): AppEnvironment {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const details = z.prettifyError(result.error);
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  return result.data;
}
