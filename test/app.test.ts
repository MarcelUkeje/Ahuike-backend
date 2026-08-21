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

  it('lists seeded restaurants', async () => {
    app = await buildApp(testEnv);
    const response = await app.inject({ method: 'GET', url: '/api/v1/restaurants' });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toHaveLength(2);
  });

  it('creates and returns a customer order', async () => {
    app = await buildApp(testEnv);
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: { 'x-customer-id': 'customer-1' },
      payload: {
        restaurantId: 'jollof-corner',
        deliveryAddress: '12 Adeola Odeku Street, Lagos',
        deliveryFee: 900,
        items: [{ menuItemId: 'party-jollof-chicken', name: 'Party Jollof & Chicken', unitPrice: 4800, quantity: 2 }],
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().data.total).toBe(10_500);

    const listed = await app.inject({ method: 'GET', url: '/api/v1/orders', headers: { 'x-customer-id': 'customer-1' } });
    expect(listed.json().data).toHaveLength(1);
  });

  it('preserves an order item note when supplied', async () => {
    app = await buildApp(testEnv);
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: { 'x-customer-id': 'customer-2' },
      payload: {
        restaurantId: 'jollof-corner',
        deliveryAddress: '8 Bourdillon Road, Lagos',
        deliveryFee: 900,
        items: [
          {
            menuItemId: 'party-jollof-chicken',
            name: 'Party Jollof & Chicken',
            unitPrice: 4800,
            quantity: 1,
            notes: 'No plantain, please',
          },
        ],
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().data.items[0].notes).toBe('No plantain, please');
  });
});
