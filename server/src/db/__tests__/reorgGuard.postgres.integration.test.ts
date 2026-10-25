import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Boots the real Express app on a real PostgreSQL (DATABASE_URL) in an isolated schema and drives the
// nested-box / loose-item endpoints over HTTP, so every new SQL statement runs on Postgres.
// Skipped when DATABASE_URL is unset (the unit-test suite is SQLite-only).

const url = process.env.DATABASE_URL;
const schema = `reorgguard_${Date.now()}_${process.pid}`;

type Json = Record<string, any>;
type App = import('express').Express;
let app: App;
let q: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
let findViolations: (q: any, locationId?: string) => Promise<string[]>;
let closeEngine: (() => Promise<void>) | undefined;

function withSearchPath(connectionString: string): string {
  const u = new URL(connectionString);
  u.searchParams.set('options', `-c search_path=${schema},public`);
  return u.toString();
}

async function call(method: 'get' | 'post' | 'put' | 'delete' | 'patch', path: string, token: string, body?: unknown) {
  const req = request(app)[method](path).set('Authorization', `Bearer ${token}`);
  const res = await (body === undefined ? req : req.send(body as object));
  return { status: res.status, body: res.body as Json };
}

let counter = 0;
async function register(): Promise<{ token: string; id: string }> {
  counter++;
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email: `pg${counter}_${Date.now()}@test.local`, password: 'TestPass123!', displayName: `PG ${counter}`, acceptedTos: true, acceptedPrivacy: true });
  expect(res.status).toBe(201);
  const cookies = ([] as string[]).concat(res.headers['set-cookie'] as unknown as string[]);
  const raw = cookies.find((c) => c.startsWith('openbin-access='));
  expect(raw).toBeTruthy();
  return { token: raw!.split(';')[0].slice('openbin-access='.length), id: res.body.user.id };
}

async function setup() {
  const loc = (await call('post', '/api/locations', owner.token, { name: `Loc ${Date.now()}_${counter++}` })).body;
  expect(loc.id).toBeTruthy();
  return loc.id as string;
}

let owner: { token: string; id: string };

async function mkArea(loc: string, name: string, parentId?: string): Promise<string> {
  const r = await call('post', `/api/locations/${loc}/areas`, owner.token, { name, parent_id: parentId });
  expect(r.status).toBe(201);
  return r.body.id;
}

async function mkBin(loc: string, name: string, extra: Json = {}): Promise<Json> {
  const r = await call('post', '/api/bins', owner.token, { locationId: loc, name, ...extra });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r.body;
}

async function getBin(id: string): Promise<Json> {
  const r = await call('get', `/api/bins/${id}`, owner.token);
  expect(r.status).toBe(200);
  return r.body;
}

async function expectClean(loc: string) {
  expect(await findViolations(q, loc)).toEqual([]);
}

describe.skipIf(!url)('reorganize guard + enrichment visibility on PostgreSQL', () => {
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
    findViolations = (await import('../../lib/binHierarchy.js')).findHierarchyViolations;
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

  it('assertTopLevelIds accepts live top-level bins and rejects children, trashed, foreign and unknown ids', async () => {
    const { assertTopLevelIds } = await import('../../lib/binHierarchy.js');
    const loc = await setup();
    const parent = await mkBin(loc, 'Parent');
    const child = await mkBin(loc, 'Child', { parentBinId: parent.id });
    const top = await mkBin(loc, 'Top');
    const trashed = await mkBin(loc, 'Trashed');
    expect((await call('delete', `/api/bins/${trashed.id}`, owner.token)).status).toBe(200);
    const loc2 = await setup();
    const foreign = await mkBin(loc2, 'Foreign');

    await expect(assertTopLevelIds(q, loc, [parent.id, top.id])).resolves.toBeUndefined();
    for (const bad of [child.id, trashed.id, foreign.id, 'no-such-id']) {
      await expect(assertTopLevelIds(q, loc, [top.id, bad])).rejects.toMatchObject({ statusCode: 422 });
    }
    await expectClean(loc);
  });

  it('reorganize routes answer 422 for a child over HTTP', async () => {
    const loc = await setup();
    const parent = await mkBin(loc, 'Parent', { items: ['a'] });
    const child = await mkBin(loc, 'Child', { parentBinId: parent.id, items: ['b'] });
    const b = (x: Json) => ({ id: x.id, name: x.name, items: ['x'], tags: [] });
    const r1 = await call('post', '/api/ai/reorganize/stream', owner.token, { locationId: loc, bins: [b(parent), b(child)] });
    expect(r1.status).toBe(422);
    const r2 = await call('post', '/api/ai/reorganize-tags/stream', owner.token, {
      locationId: loc, bins: [b(parent), b(child)], changeLevel: 'additive', granularity: 'medium',
    });
    expect(r2.status).toBe(422);
    await expectClean(loc);
  });

  it('enrichQueryMatches drops private bins of other members, keeps own and shared, takes name from the DB', async () => {
    const { enrichQueryMatches } = await import('../../lib/inventoryQuery.js');
    const created = (await call('post', '/api/locations', owner.token, { name: `Shared ${Date.now()}` })).body;
    const loc = created.id as string;
    const other = await register();
    const join = await call('post', '/api/locations/join', other.token, { inviteCode: created.invite_code });
    expect(join.status, JSON.stringify(join.body)).toBeLessThan(300);

    const priv = await mkBin(loc, 'Private', { visibility: 'private', items: ['Secret'] });
    const shared = await mkBin(loc, 'Shared', { items: ['Secret'] });
    const parent = await mkBin(loc, 'PrivParent', { visibility: 'private' });
    const child = await mkBin(loc, 'PrivChild', { parentBinId: parent.id, items: ['Secret'] });
    const raw = (code: string) => [{ bin_code: code, name: 'Invented', area_name: 'Invented', items: ['Secret'], tags: [], relevance: 'high' }];

    expect(await enrichQueryMatches(raw(priv.short_code), loc, other.id)).toEqual([]);
    expect(await enrichQueryMatches(raw(child.short_code), loc, other.id)).toEqual([]);
    const own = await enrichQueryMatches(raw(priv.short_code), loc, owner.id);
    expect(own).toHaveLength(1);
    expect(own[0].name).toBe('Private');
    expect(own[0].area_name).toBe('');
    expect(own[0].total_item_count).toBe(1);
    const sh = await enrichQueryMatches(raw(shared.short_code), loc, other.id);
    expect(sh).toHaveLength(1);
    expect(sh[0].name).toBe('Shared');
    expect(await enrichQueryMatches(raw(child.short_code), loc, owner.id)).toHaveLength(1);
    await expectClean(loc);
  });
});
