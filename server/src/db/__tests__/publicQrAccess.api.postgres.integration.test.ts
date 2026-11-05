import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Boots the real Express app on a real PostgreSQL (DATABASE_URL) in an isolated schema and drives the
// public QR endpoints over HTTP, so the boolean columns and every new statement run on Postgres.
// Skipped when DATABASE_URL is unset (the unit-test suite is SQLite-only).

const url = process.env.DATABASE_URL;
const schema = `pqapi_${Date.now()}_${process.pid}`;

type Json = Record<string, any>;
type App = import('express').Express;
let app: App;
let q: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
let closeEngine: (() => Promise<void>) | undefined;
let owner: { token: string; id: string };

function withSearchPath(connectionString: string): string {
  const u = new URL(connectionString);
  u.searchParams.set('options', `-c search_path=${schema},public`);
  return u.toString();
}

async function call(method: 'get' | 'post' | 'put' | 'delete', path: string, token: string, body?: unknown) {
  const req = request(app)[method](path).set('Authorization', `Bearer ${token}`);
  const res = await (body === undefined ? req : req.send(body as object));
  return { status: res.status, body: res.body as Json };
}

async function register(): Promise<{ token: string; id: string }> {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email: `pq_${Date.now()}@test.local`, password: 'TestPass123!', displayName: 'PG Public', acceptedTos: true, acceptedPrivacy: true });
  expect(res.status).toBe(201);
  const cookies = ([] as string[]).concat(res.headers['set-cookie'] as unknown as string[]);
  const raw = cookies.find((c) => c.startsWith('openbin-access='));
  expect(raw).toBeTruthy();
  return { token: raw!.split(';')[0].slice('openbin-access='.length), id: res.body.user.id };
}

const publicGet = (binId: string) => request(app).get(`/api/public/bins/${binId}`);

describe.skipIf(!url)('public QR access API on PostgreSQL', () => {
  beforeAll(async () => {
    const admin = new pg.Pool({ connectionString: url });
    await admin.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.end();

    // Config is read at import time: set the env before any app module loads.
    process.env.DATABASE_URL = withSearchPath(url!);
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'test-secret';
    process.env.PHOTO_STORAGE_PATH = '/tmp/openbin-test-photos-pg';
    process.env.SELF_HOSTED = 'true';
    process.env.BCRYPT_ROUNDS ??= '4';

    const { initialize, getEngine } = await import('../init.js');
    const db = await import('../../db.js');
    await initialize();
    expect(getEngine().dialect).toBe('postgres');
    q = db.query;
    closeEngine = () => getEngine().close();
    const { createApp } = await import('../../index.js');
    app = createApp();
    owner = await register();
  }, 60_000);

  afterAll(async () => {
    try {
      const { closeThumbnailPool } = await import('../../lib/thumbnailPool.js');
      await closeThumbnailPool();
    } catch {}
    await closeEngine?.();
    const admin = new pg.Pool({ connectionString: url });
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  });

  it('serves a box only while the location allows it, and counts each public view', async () => {
    const loc = (await call('post', '/api/locations', owner.token, { name: 'Home' })).body;
    expect(loc).toMatchObject({ public_qr_access: false, public_qr_photos: true });

    const parent = (await call('post', '/api/bins', owner.token, { locationId: loc.id, name: 'Toolbox', items: ['Hammer'], tags: ['garage'] })).body;
    const child = (await call('post', '/api/bins', owner.token, { locationId: loc.id, name: 'Screws', items: ['M4'], parentBinId: parent.id })).body;
    const hidden = (await call('post', '/api/bins', owner.token, { locationId: loc.id, name: 'Secret', visibility: 'private' })).body;

    // off by default
    expect((await publicGet(parent.id)).status).toBe(404);

    const on = await call('put', `/api/locations/${loc.id}`, owner.token, { public_qr_access: true });
    expect(on.status).toBe(200);
    expect(on.body).toMatchObject({ public_qr_access: true, public_qr_photos: true });

    const view = await publicGet(parent.id);
    expect(view.status).toBe(200);
    expect(view.body.name).toBe('Toolbox');
    expect(view.body.tags).toEqual(['garage']);
    expect(view.body.items).toEqual([{ name: 'Hammer', quantity: null }]);
    expect(view.body.children).toEqual([expect.objectContaining({ id: child.id, name: 'Screws', item_count: 1 })]);
    expect(view.body.created_by).toBeUndefined();
    expect(view.body.area_id).toBeUndefined();

    expect((await publicGet(child.id)).body.parent).toEqual({ id: parent.id, name: 'Toolbox' });
    expect((await publicGet(hidden.id)).status).toBe(404);
    expect((await publicGet(parent.short_code)).status).toBe(404);

    const counted = await q('SELECT public_view_count, last_public_view_at FROM bins WHERE id = $1', [parent.id]);
    expect(counted.rows[0].public_view_count).toBe(1);
    expect(counted.rows[0].last_public_view_at).toBeTruthy();

    // switching it off closes every box at once
    await call('put', `/api/locations/${loc.id}`, owner.token, { public_qr_access: false });
    expect((await publicGet(parent.id)).status).toBe(404);
  });

  it('keeps the photos switch independent and logs setting changes', async () => {
    const loc = (await call('post', '/api/locations', owner.token, { name: 'Cabin' })).body;
    await call('put', `/api/locations/${loc.id}`, owner.token, { public_qr_access: true });
    const bin = (await call('post', '/api/bins', owner.token, { locationId: loc.id, name: 'Pots' })).body;

    const off = await call('put', `/api/locations/${loc.id}`, owner.token, { public_qr_photos: false });
    expect(off.body).toMatchObject({ public_qr_access: true, public_qr_photos: false });
    const view = await publicGet(bin.id);
    expect(view.status).toBe(200);
    expect(view.body.photos).toEqual([]);

    const bad = await call('put', `/api/locations/${loc.id}`, owner.token, { public_qr_access: 'yes' });
    expect(bad.status).toBe(422);

    const log = await call('get', `/api/locations/${loc.id}/activity`, owner.token);
    const changes = (log.body.results as Array<{ entity_type: string; action: string; changes: Json | null }>)
      .filter((e) => e.entity_type === 'location' && e.action === 'update')
      .map((e) => e.changes);
    expect(changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ public_qr_access: { old: false, new: true } }),
      expect.objectContaining({ public_qr_photos: { old: true, new: false } }),
    ]));
  });
});
