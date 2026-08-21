import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import type { AppEnvironment } from '../src/config/env.js';

const testEnv: AppEnvironment = {
  NODE_ENV: 'test',
  HOST: '127.0.0.1',
  PORT: 4000,
  LOG_LEVEL: 'silent',
  CORS_ORIGINS: '*',
  JWT_SECRET: 'test-secret-at-least-32-characters-long-for-test-use-only',
  PAYSTACK_SECRET_KEY: 'sk_test_dummy_key_for_unit_tests_only',
  RESEND_API_KEY: 're_test_key_for_unit_tests_only',
};

describe('Ahuike API', () => {
  let app: FastifyInstance | undefined;
  afterEach(async () => app?.close());

  it('reports service health', async () => {
    app = await buildApp(testEnv);
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.status).toBe('ok');
  });

  it('lists seeded departments', async () => {
    app = await buildApp(testEnv);
    const response = await app.inject({ method: 'GET', url: '/api/v1/departments' });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toHaveLength(4); // 4 seeded departments
  });

  it('lists seeded doctors', async () => {
    app = await buildApp(testEnv);
    const response = await app.inject({ method: 'GET', url: '/api/v1/doctors' });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toHaveLength(2); // 2 seeded doctors in InMemory repo
  });
});
