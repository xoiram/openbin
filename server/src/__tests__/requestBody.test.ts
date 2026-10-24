import type { Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../index.js';
import { createTestUser } from './helpers.js';

let app: Express;

beforeEach(() => {
  app = createApp();
});

describe('JSON request body errors', () => {
  it('returns 413 when the body exceeds the JSON limit', async () => {
    const { token } = await createTestUser(app);

    const res = await request(app)
      .post('/api/locations')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'x'.repeat(2 * 1024 * 1024) });

    expect(res.status).toBe(413);
    expect(res.body.error).toBe('PAYLOAD_TOO_LARGE');
  });

  it('returns 400 for malformed JSON', async () => {
    const { token } = await createTestUser(app);

    const res = await request(app)
      .post('/api/locations')
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'application/json')
      .send('{"name": oops');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });
});
