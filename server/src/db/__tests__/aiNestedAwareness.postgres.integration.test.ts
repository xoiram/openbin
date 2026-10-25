import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Runs the AI-awareness SQL (loose item matcher, planner executor, command/query context) on a real
// PostgreSQL (DATABASE_URL) in an isolated schema. Data is created over HTTP; no LLM is involved.
// Skipped when DATABASE_URL is unset (the unit-test suite is SQLite-only).

const url = process.env.DATABASE_URL;
const schema = `ainested_${Date.now()}_${process.pid}`;

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

async function mkLoose(loc: string, name: string, extra: Json = {}): Promise<Json> {
  const r = await call('post', `/api/locations/${loc}/items`, owner.token, { name, ...extra });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r.body;
}

describe.skipIf(!url)('AI nested-box awareness on PostgreSQL', () => {
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

  async function world() {
    const loc = await setup();
    const garage = await mkArea(loc, 'Garage');
    const shelf = await mkArea(loc, 'Shelf A', garage);
    const toolbox = await mkBin(loc, 'Toolbox', { areaId: shelf, items: ['Hammer'] });
    const parts = await mkBin(loc, 'Parts Tray', { parentBinId: toolbox.id, items: ['Screws'] });
    const ladder = await mkLoose(loc, 'Step Ladder', { areaId: shelf, quantity: 2 });
    const bracket = await mkLoose(loc, 'Ladder Bracket');
    const hammer = await mkLoose(loc, 'Hammer');
    return { loc, garage, shelf, toolbox, parts, ladder, bracket, hammer };
  }

  it('findLooseItemMatches / findCheckedOutLooseItems return typed rows', async () => {
    const { findLooseItemMatches, findCheckedOutLooseItems } = await import('../../lib/inventoryMatcher.js');
    const w = await world();
    const got = await findLooseItemMatches(w.loc, owner.id, ['ladder']);
    expect(got.map((g) => g.name).sort()).toEqual(['Ladder Bracket', 'Step Ladder']);
    const step = got.find((g) => g.name === 'Step Ladder')!;
    expect(step.quantity).toBe(2);
    expect(typeof step.quantity).toBe('number');
    expect(step).toMatchObject({ area_id: w.shelf, area_name: 'Shelf A' });
    expect(got.find((g) => g.name === 'Ladder Bracket')).toMatchObject({ area_id: null, area_name: '', quantity: null });
    expect(await findLooseItemMatches(w.loc, owner.id, ['ladder'], { fields: ['name'] })).toEqual([]);
    expect(await findLooseItemMatches(w.loc, owner.id, ['shelf'])).toEqual([]);
    expect(await findLooseItemMatches(w.loc, owner.id, ['%'])).toEqual([]);

    expect(await findCheckedOutLooseItems(w.loc, owner.id)).toEqual([]);
    expect((await call('post', `/api/locations/${w.loc}/items/${w.ladder.id}/checkout`, owner.token, {})).status).toBe(201);
    expect((await findCheckedOutLooseItems(w.loc, owner.id)).map((g) => g.name)).toEqual(['Step Ladder']);
    await expectClean(w.loc);
  });

  it('executeQueryPlan: content plan returns bins with paths and loose items; metadata checked_out includes loose', async () => {
    const { executeQueryPlan } = await import('../../lib/queryPlanExecutor.js');
    const w = await world();

    const hammer = await executeQueryPlan({ kind: 'content', terms: ['hammer'], answer: 'Here.' }, w.loc, owner.id);
    expect(hammer.matches).toHaveLength(2);
    const bin = hammer.matches.find((m) => m.kind === 'bin')!;
    const loose = hammer.matches.find((m) => m.kind === 'loose_item')!;
    expect(bin).toMatchObject({ name: 'Toolbox', bin_path: 'Garage › Shelf A › Toolbox', parent_bin_id: null, parent_bin_name: '' });
    expect(typeof bin.total_item_count).toBe('number');
    expect(loose).toMatchObject({ item_id: w.hammer.id, bin_id: null, bin_code: null, area_name: '', bin_path: '', total_item_count: 1 });

    const screws = await executeQueryPlan({ kind: 'content', terms: ['parts'], answer: 'Here.' }, w.loc, owner.id);
    expect(screws.matches[0]).toMatchObject({
      kind: 'bin',
      name: 'Parts Tray',
      bin_path: 'Garage › Shelf A › Toolbox › Parts Tray',
      parent_bin_id: w.toolbox.id,
      parent_bin_name: 'Toolbox',
    });

    const ladder = await executeQueryPlan({ kind: 'content', terms: ['ladder'], answer: 'Here.' }, w.loc, owner.id);
    const step = ladder.matches.find((m) => m.kind === 'loose_item' && m.name === 'Step Ladder')!;
    expect(step).toMatchObject({ bin_path: 'Garage › Shelf A', area_name: 'Shelf A', quantity: 2 });
    expect(typeof (step as { quantity: unknown }).quantity).toBe('number');

    await call('post', `/api/locations/${w.loc}/items/${w.ladder.id}/checkout`, owner.token, {});
    const out = await executeQueryPlan({ kind: 'metadata', metadata: 'checked_out', answer: 'Out:' }, w.loc, owner.id);
    expect(out.matches.map((m) => m.name)).toEqual(['Step Ladder']);
    expect(out.matches[0].kind).toBe('loose_item');
    await expectClean(w.loc);
  });

  it('command and query contexts: nested areas, child compaction, loose items, JSON types', async () => {
    const { buildCommandContext, buildInventoryContext } = await import('../../lib/aiContext.js');
    const w = await world();
    for (const ctx of [await buildCommandContext(w.loc, owner.id), await buildInventoryContext(w.loc, owner.id)]) {
      const child = ctx.bins.find((b) => b.name === 'Parts Tray') as Record<string, unknown>;
      expect(child.parent_bin_code).toBe(w.toolbox.short_code);
      expect(child.area_name).toBeUndefined();
      expect(ctx.areas.find((a) => a.name === 'Shelf A')?.path).toBe('Garage › Shelf A');
      expect(ctx.loose_items).toContainEqual({ name: 'Step Ladder', quantity: 2, area: 'Garage › Shelf A' });
      expect(typeof ctx.loose_items!.find((i) => i.name === 'Step Ladder')!.quantity).toBe('number');
      expect(ctx.loose_items).toContainEqual({ name: 'Ladder Bracket' });
      expect(ctx.complete).toBe(true);
    }
    // Scoped context: no loose items, never complete.
    const scoped = await buildCommandContext(w.loc, owner.id, [w.toolbox.id]);
    expect(scoped.loose_items).toBeUndefined();
    expect(scoped.complete).toBe(false);
    // Checked-out loose item shows who has it.
    await call('post', `/api/locations/${w.loc}/items/${w.hammer.id}/checkout`, owner.token, {});
    const after = await buildCommandContext(w.loc, owner.id);
    expect(after.loose_items!.find((i) => i.name === 'Hammer')!.checked_out_by).toBeTruthy();
    await expectClean(w.loc);
  });

  it('loose items beyond the cap mark the context incomplete', async () => {
    const { buildCommandContext, MAX_CONTEXT_LOOSE_ITEMS } = await import('../../lib/aiContext.js');
    const loc = await setup();
    for (let i = 0; i < MAX_CONTEXT_LOOSE_ITEMS + 3; i++) {
      await q('INSERT INTO bin_items (id, bin_id, area_id, location_id, name, quantity, position) VALUES ($1, NULL, NULL, $2, $3, NULL, 0)', [`pgli-${loc}-${i}`, loc, `Loose ${i}`]);
    }
    const ctx = await buildCommandContext(loc, owner.id);
    expect(ctx.loose_items).toHaveLength(MAX_CONTEXT_LOOSE_ITEMS);
    expect(ctx.complete).toBe(false);
  });

  it("a private parent's child and its context stay hidden from another member", async () => {
    const { executeQueryPlan } = await import('../../lib/queryPlanExecutor.js');
    const { buildCommandContext } = await import('../../lib/aiContext.js');
    const loc = await setup();
    const other = await register();
    const invite = (await q('SELECT invite_code FROM locations WHERE id = $1', [loc])).rows[0].invite_code;
    expect((await call('post', '/api/locations/join', other.token, { inviteCode: invite })).status).toBe(201);
    const priv = await mkBin(loc, 'Secret Box', { visibility: 'private' });
    await mkBin(loc, 'Secret Parts', { parentBinId: priv.id });

    const plan = await executeQueryPlan({ kind: 'content', terms: ['secret'], answer: 'x' }, loc, other.id);
    expect(plan.matches).toEqual([]);
    expect(JSON.stringify(await buildCommandContext(loc, other.id))).not.toContain('Secret');
    expect((await executeQueryPlan({ kind: 'content', terms: ['secret'], answer: 'x' }, loc, owner.id)).matches).toHaveLength(2);
    await expectClean(loc);
  });
});
