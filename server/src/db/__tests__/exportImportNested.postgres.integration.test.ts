import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Exports a location with nested boxes, a trashed child, loose and unassigned items from one location and
// imports it into another on a real PostgreSQL (JSON, ZIP and CSV; merge, replace, dry run), so every new
// export/import SQL statement runs on Postgres. Skipped when DATABASE_URL is unset.

const url = process.env.DATABASE_URL;
const schema = `exnb_${Date.now()}_${process.pid}`;

type Json = Record<string, any>;
type App = import('express').Express;
let app: App;
let q: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
let findViolations: (q: any, locationId?: string) => Promise<string[]>;
let closeEngine: (() => Promise<void>) | undefined;
let owner: { token: string; id: string };

function withSearchPath(connectionString: string): string {
  const u = new URL(connectionString);
  u.searchParams.set('options', `-c search_path=${schema},public`);
  return u.toString();
}

async function call(method: 'get' | 'post' | 'put' | 'delete', path: string, body?: unknown) {
  const req = request(app)[method](path).set('Authorization', `Bearer ${owner.token}`);
  const res = await (body === undefined ? req : req.send(body as object));
  return { status: res.status, body: res.body as Json };
}

let counter = 0;
async function register(): Promise<{ token: string; id: string }> {
  counter++;
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email: `exnb${counter}_${Date.now()}@test.local`, password: 'TestPass123!', displayName: `PG ${counter}`, acceptedTos: true, acceptedPrivacy: true });
  expect(res.status).toBe(201);
  const cookies = ([] as string[]).concat(res.headers['set-cookie'] as unknown as string[]);
  const raw = cookies.find((c) => c.startsWith('openbin-access='));
  return { token: raw!.split(';')[0].slice('openbin-access='.length), id: res.body.user.id };
}

async function mkLocation(name: string): Promise<string> {
  const r = await call('post', '/api/locations', { name: `${name} ${Date.now()}_${counter++}` });
  expect(r.status).toBe(201);
  return r.body.id;
}
async function mkArea(loc: string, name: string, parentId?: string): Promise<string> {
  const r = await call('post', `/api/locations/${loc}/areas`, { name, parent_id: parentId });
  expect(r.status).toBe(201);
  return r.body.id;
}
async function mkBin(loc: string, name: string, extra: Json = {}): Promise<Json> {
  const r = await call('post', '/api/bins', { locationId: loc, name, ...extra });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r.body;
}
async function mkLoose(loc: string, name: string, extra: Json = {}): Promise<Json> {
  const r = await call('post', `/api/locations/${loc}/items`, { name, ...extra });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r.body;
}

/** Tool Chest (Garage) > Drill Bits, Old Bits (trashed); Gone Box (Attic, trashed) > Gone Kid; Safe (private) > Safe kid; loose items. */
async function buildSource() {
  const loc = await mkLocation('Source');
  const garage = await mkArea(loc, 'Garage');
  const attic = await mkArea(loc, 'Attic');
  const shelf = await mkArea(loc, 'Shelf', garage);
  const chest = await mkBin(loc, 'Tool Chest', { areaId: garage, items: ['Ratchet', { name: 'Hex keys', quantity: 2 }] });
  await mkBin(loc, 'Drill Bits', { parentBinId: chest.id, items: ['Spade bits'] });
  const old = await mkBin(loc, 'Old Bits', { parentBinId: chest.id });
  expect((await call('delete', `/api/bins/${old.id}`)).status).toBe(200);
  const gone = await mkBin(loc, 'Gone Box', { areaId: attic });
  await mkBin(loc, 'Gone Kid', { parentBinId: gone.id });
  expect((await call('delete', `/api/bins/${gone.id}`)).status).toBe(200);
  const safe = await mkBin(loc, 'Safe', { visibility: 'private' });
  await mkBin(loc, 'Safe kid', { parentBinId: safe.id });
  await mkLoose(loc, 'Tape', { quantity: 3, areaId: garage });
  const level = await mkLoose(loc, 'Level', { areaId: shelf });
  await mkLoose(loc, 'Batteries');
  return { loc, garage, attic, level };
}

async function snapshot(loc: string) {
  const bins = await q(
    `SELECT b.id, b.name, p.name AS parent, a.name AS area, b.deleted_at IS NOT NULL AS trashed, b.visibility
     FROM bins b LEFT JOIN bins p ON p.id = b.parent_bin_id LEFT JOIN areas a ON a.id = b.area_id
     WHERE b.location_id = $1 ORDER BY b.name`,
    [loc],
  );
  const out: Json[] = [];
  for (const b of bins.rows) {
    const items = await q('SELECT name, quantity FROM bin_items WHERE bin_id = $1 ORDER BY position', [b.id]);
    out.push({ name: b.name, parent: b.parent, area: b.area, trashed: b.trashed, visibility: b.visibility, items: items.rows.map((i: Json) => (i.quantity ? `${i.name} x${i.quantity}` : i.name)) });
  }
  const loose = await q(
    `SELECT bi.name, bi.quantity, a.name AS area FROM bin_items bi LEFT JOIN areas a ON a.id = bi.area_id
     WHERE bi.location_id = $1 AND bi.bin_id IS NULL ORDER BY bi.name`,
    [loc],
  );
  return { bins: out, loose: loose.rows.map((r: Json) => ({ name: r.name, quantity: r.quantity === null ? null : Number(r.quantity), area: r.area })) };
}

const binary = (res: request.Response, cb: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};
const authed = () => ({ Authorization: `Bearer ${owner.token}` });

describe.skipIf(!url)('export/import of nested boxes and loose items on PostgreSQL', () => {
  beforeAll(async () => {
    const admin = new pg.Pool({ connectionString: url });
    await admin.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.end();

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

  it('JSON: round trip, dry run parity, merge twice, replace over a checked-out loose item', async () => {
    const src = await buildSource();
    const exported = await call('get', `/api/locations/${src.loc}/export`);
    expect(exported.status).toBe(200);
    expect(exported.body.version).toBe(4);
    expect(exported.body.unassignedItems).toEqual(['Batteries']);
    const kid = exported.body.bins.find((b: Json) => b.name === 'Drill Bits');
    expect(kid.parentShortCode).toBe(exported.body.bins.find((b: Json) => b.name === 'Tool Chest').shortCode);

    const target = await mkLocation('Target');
    const dry = await call('post', `/api/locations/${target}/import`, { ...exported.body, mode: 'merge', dryRun: true });
    expect(dry.status).toBe(200);
    expect(dry.body.binsSkippedUnresolvedParent).toBe(0);
    expect(typeof dry.body.looseItemsToCreate).toBe('number');

    const res = await call('post', `/api/locations/${target}/import`, { ...exported.body, mode: 'merge' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.looseItemsImported).toBe(dry.body.looseItemsToCreate);
    expect(res.body.binsImported + res.body.trashedBinsImported).toBe(dry.body.toCreate.length);
    expect(res.body.childBinsImported).toBe(4);
    expect(await snapshot(target)).toEqual(await snapshot(src.loc));
    expect(await findViolations(q, target)).toEqual([]);

    const again = await call('post', `/api/locations/${target}/import`, { ...exported.body, mode: 'merge' });
    expect(again.body.looseItemsImported).toBe(0);
    expect(again.body.looseItemsSkipped).toBe(3);
    expect(await snapshot(target)).toEqual(await snapshot(src.loc));

    // Replace into a location that has a checked-out loose item (item_checkouts must not block the delete)
    const stale = await mkLoose(target, 'Stale');
    expect((await call('post', `/api/locations/${target}/items/${stale.id}/checkout`)).status).toBe(201);
    const replaced = await call('post', `/api/locations/${target}/import`, { ...exported.body, mode: 'replace' });
    expect(replaced.status, JSON.stringify(replaced.body)).toBe(200);
    expect(await snapshot(target)).toEqual(await snapshot(src.loc));
    const left = await q("SELECT 1 FROM bin_items WHERE location_id = $1 AND name = 'Stale'", [target]);
    expect(left.rows).toHaveLength(0);
    expect(await findViolations(q, target)).toEqual([]);

    // Unsupported version
    expect((await call('post', `/api/locations/${target}/import`, { ...exported.body, version: 5 })).status).toBe(422);
  }, 60_000);

  it('JSON: merge into a location where the parent already exists; private parent stays private', async () => {
    const src = await buildSource();
    const exported = (await call('get', `/api/locations/${src.loc}/export`)).body;
    const target = await mkLocation('Target');
    const chest = exported.bins.find((b: Json) => b.name === 'Tool Chest');
    const safe = exported.bins.find((b: Json) => b.name === 'Safe');
    expect((await call('post', `/api/locations/${target}/import`, { bins: [chest, safe], mode: 'merge' })).status).toBe(200);
    const merged = await call('post', `/api/locations/${target}/import`, { ...exported, mode: 'merge' });
    expect(merged.status).toBe(200);
    expect(merged.body.binsSkipped).toBe(2);
    expect(merged.body.binsSkippedUnresolvedParent).toBe(0);
    const rows = (await snapshot(target)).bins;
    expect(rows.find((b) => b.name === 'Drill Bits')).toMatchObject({ parent: 'Tool Chest', area: 'Garage' });
    expect(rows.find((b) => b.name === 'Safe kid')).toMatchObject({ parent: 'Safe', visibility: 'private' });
    expect(await findViolations(q, target)).toEqual([]);
  }, 60_000);

  it('ZIP and CSV round trips', async () => {
    const src = await buildSource();
    const zip = await request(app).get(`/api/locations/${src.loc}/export/zip`).set(authed()).buffer(true).parse(binary);
    expect(zip.status).toBe(200);
    const t1 = await mkLocation('ZipTarget');
    const zres = await request(app).post(`/api/locations/${t1}/import/zip`).set(authed()).field('mode', 'merge').attach('file', zip.body as Buffer, 'e.zip');
    expect(zres.status, JSON.stringify(zres.body)).toBe(200);
    expect(await snapshot(t1)).toEqual(await snapshot(src.loc));
    const zdry = await request(app).post(`/api/locations/${t1}/import/zip`).set(authed()).field('dryRun', 'true').attach('file', zip.body as Buffer, 'e.zip');
    expect(zdry.status).toBe(200);
    expect(zdry.body.looseItemsToSkip).toBe(3);
    expect(await findViolations(q, t1)).toEqual([]);

    const csv = await request(app).get(`/api/locations/${src.loc}/export/csv`).set(authed());
    expect(csv.status).toBe(200);
    const t2 = await mkLocation('CsvTarget');
    const cres = await request(app).post(`/api/locations/${t2}/import/csv`).set(authed()).attach('file', Buffer.from(csv.text), 'i.csv');
    expect(cres.status, JSON.stringify(cres.body)).toBe(200);
    expect(cres.body.looseItemsImported).toBe(3);
    expect((await snapshot(t2)).loose).toEqual((await snapshot(src.loc)).loose);
    const again = await request(app).post(`/api/locations/${t2}/import/csv`).set(authed()).attach('file', Buffer.from(csv.text), 'i.csv');
    expect(again.body.looseItemsImported).toBe(0);
    const replaced = await request(app).post(`/api/locations/${t2}/import/csv`).set(authed()).field('mode', 'replace').attach('file', Buffer.from(csv.text), 'i.csv');
    expect(replaced.status).toBe(200);
    expect(replaced.body.looseItemsImported).toBe(3);
    expect((await snapshot(t2)).loose).toEqual((await snapshot(src.loc)).loose);
  }, 60_000);
});
