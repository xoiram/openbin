import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Boots the real Express app on a real PostgreSQL (DATABASE_URL) in an isolated schema and drives the
// nested-box / loose-item endpoints over HTTP, so every new SQL statement runs on Postgres.
// Skipped when DATABASE_URL is unset (the unit-test suite is SQLite-only).

const url = process.env.DATABASE_URL;
const schema = `nbapi_${Date.now()}_${process.pid}`;

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

describe.skipIf(!url)('nested boxes and loose items API on PostgreSQL', () => {
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

  it('boxes: create, read, list filters, nest and un-nest', async () => {
    const loc = await setup();
    const parent = await mkBin(loc, 'Toolbox');
    const child = await mkBin(loc, 'Screws', { parentBinId: parent.id });
    expect(child.parent_bin_id).toBe(parent.id);

    const p = await getBin(parent.id);
    expect(p.child_count).toBe(1);
    expect(typeof p.child_count).toBe('number');
    const c = await getBin(child.id);
    expect(c.parent_bin_id).toBe(parent.id);
    expect(c.parent_bin_name).toBe('Toolbox');
    expect(c.child_count).toBe(0);

    const byParent = await call('get', `/api/bins?location_id=${loc}&parent=${parent.id}`, owner.token);
    expect(byParent.body.results.map((b: Json) => b.id)).toEqual([child.id]);
    const top = await call('get', `/api/bins?location_id=${loc}&top_level=true`, owner.token);
    expect(top.body.results.map((b: Json) => b.id)).toEqual([parent.id]);
    expect(typeof top.body.count).toBe('number');
    const all = await call('get', `/api/bins?location_id=${loc}`, owner.token);
    expect(all.body.count).toBe(2);

    const other = await mkBin(loc, 'Other');
    expect((await call('put', `/api/bins/${other.id}`, owner.token, { parentBinId: parent.id })).status).toBe(200);
    expect((await getBin(parent.id)).child_count).toBe(2);
    expect((await call('put', `/api/bins/${other.id}`, owner.token, { parentBinId: null })).status).toBe(200);
    expect((await getBin(other.id)).parent_bin_id).toBeNull();
    expect((await getBin(parent.id)).child_count).toBe(1);
    await expectClean(loc);
  });

  it('boxes: area and privacy cascade, nesting rules return 422', async () => {
    const loc = await setup();
    const garage = await mkArea(loc, 'Garage');
    const attic = await mkArea(loc, 'Attic');
    const parent = await mkBin(loc, 'P', { areaId: garage });
    const child = await mkBin(loc, 'C', { parentBinId: parent.id });
    expect((await getBin(child.id)).area_id).toBe(garage);

    expect((await call('put', `/api/bins/${parent.id}`, owner.token, { areaId: attic })).status).toBe(200);
    expect((await getBin(child.id)).area_id).toBe(attic);
    expect((await call('put', `/api/bins/${child.id}`, owner.token, { areaId: garage })).status).toBe(422);

    expect((await call('put', `/api/bins/${parent.id}`, owner.token, { visibility: 'private' })).status).toBe(200);
    expect((await getBin(child.id)).visibility).toBe('private');
    expect((await call('put', `/api/bins/${child.id}`, owner.token, { visibility: 'location' })).status).toBe(422);

    // depth: grandchild, and nesting a parent under a child
    expect((await call('post', '/api/bins', owner.token, { locationId: loc, name: 'G', parentBinId: child.id })).status).toBe(422);
    const x = await mkBin(loc, 'X');
    expect((await call('put', `/api/bins/${parent.id}`, owner.token, { parentBinId: x.id })).status).toBe(422);
    // self-parent
    expect((await call('put', `/api/bins/${x.id}`, owner.token, { parentBinId: x.id })).status).toBe(422);

    // other location
    const loc2 = await setup();
    const far = await mkBin(loc2, 'Far');
    expect((await call('post', '/api/bins', owner.token, { locationId: loc, name: 'Y', parentBinId: far.id })).status).toBe(422);

    // trashed parent
    const t = await mkBin(loc, 'Trashed');
    expect((await call('delete', `/api/bins/${t.id}`, owner.token)).status).toBe(200);
    expect((await call('post', '/api/bins', owner.token, { locationId: loc, name: 'Z', parentBinId: t.id })).status).toBe(422);
    await expectClean(loc);
    await expectClean(loc2);
  });

  it('boxes: soft delete cascades, restore, permanent delete, duplicate, move location', async () => {
    const loc = await setup();
    const parent = await mkBin(loc, 'P', { items: ['hammer'] });
    const c1 = await mkBin(loc, 'C1', { parentBinId: parent.id, items: ['nail', 'screw'] });
    const c2 = await mkBin(loc, 'C2', { parentBinId: parent.id });
    // one child trashed on its own earlier: must not come back with the parent
    expect((await call('delete', `/api/bins/${c2.id}`, owner.token)).status).toBe(200);
    await new Promise((r) => setTimeout(r, 15));

    expect((await call('delete', `/api/bins/${parent.id}`, owner.token)).status).toBe(200);
    const trash = await call('get', `/api/bins/trash?location_id=${loc}`, owner.token);
    expect(trash.status).toBe(200);
    expect((await call('get', `/api/bins/${c1.id}`, owner.token)).status).toBe(404);
    const rows = await q('SELECT id, deleted_at FROM bins WHERE id IN ($1, $2, $3)', [parent.id, c1.id, c2.id]);
    const del = Object.fromEntries(rows.rows.map((r) => [r.id, String(r.deleted_at)]));
    expect(del[c1.id]).toBe(del[parent.id]);
    expect(del[c2.id]).not.toBe(del[parent.id]);

    // child can't be restored under a trashed parent
    expect((await call('post', `/api/bins/${c1.id}/restore`, owner.token)).status).toBe(422);

    expect((await call('post', `/api/bins/${parent.id}/restore`, owner.token)).status).toBe(200);
    expect((await getBin(c1.id)).id).toBe(c1.id);
    expect((await getBin(parent.id)).child_count).toBe(1); // c2 stays trashed
    expect((await call('get', `/api/bins/${c2.id}`, owner.token)).status).toBe(404);
    await expectClean(loc);

    // duplicate a child -> sibling
    const dup = await call('post', `/api/bins/${c1.id}/duplicate`, owner.token, {});
    expect(dup.status).toBe(201);
    expect(dup.body.parent_bin_id).toBe(parent.id);
    expect((await getBin(parent.id)).child_count).toBe(2);
    // duplicate a parent -> top level copy without children
    const dupP = await call('post', `/api/bins/${parent.id}/duplicate`, owner.token, {});
    expect(dupP.status).toBe(201);
    expect(dupP.body.parent_bin_id ?? null).toBeNull();
    expect((await getBin(dupP.body.id)).child_count).toBe(0);

    // move the parent to another location: child + items follow
    const loc2 = await setup();
    const moved = await call('post', `/api/bins/${parent.id}/move`, owner.token, { locationId: loc2 });
    expect(moved.status, JSON.stringify(moved.body)).toBe(200);
    expect((await getBin(c1.id)).location_id).toBe(loc2);
    const itemLocs = await q(
      'SELECT DISTINCT location_id FROM bin_items WHERE bin_id IN ($1, $2)', [parent.id, c1.id]);
    expect(itemLocs.rows.map((r) => r.location_id)).toEqual([loc2]);
    expect((await call('post', `/api/bins/${c1.id}/move`, owner.token, { locationId: loc })).status).toBe(422);
    await expectClean(loc);
    await expectClean(loc2);

    // permanent delete of the parent takes live children with it
    expect((await call('delete', `/api/bins/${parent.id}`, owner.token)).status).toBe(200);
    expect((await call('delete', `/api/bins/${parent.id}/permanent`, owner.token)).status).toBe(200);
    const gone = await q('SELECT COUNT(*) AS n FROM bins WHERE id = $1 OR parent_bin_id = $1', [parent.id]);
    expect(Number(gone.rows[0].n)).toBe(0);
    await expectClean(loc2);
  });

  it('loose items: create, edit, delete, list filters, sort, paging', async () => {
    const loc = await setup();
    const garage = await mkArea(loc, 'Garage');
    const box = await mkBin(loc, 'Box', { areaId: garage, items: ['Bolts'] });

    const a = await call('post', `/api/locations/${loc}/items`, owner.token, { name: 'Ladder', areaId: garage });
    expect(a.status).toBe(201);
    expect(a.body.area_id).toBe(garage);
    const u = await call('post', `/api/locations/${loc}/items`, owner.token, { name: 'Umbrella', quantity: 3 });
    expect(u.status).toBe(201);
    expect(u.body.area_id).toBeNull();
    const z = await call('post', `/api/locations/${loc}/items`, owner.token, { name: 'Zip ties', quantity: 50, areaId: garage });
    expect(z.status).toBe(201);

    expect((await call('put', `/api/locations/${loc}/items/${u.body.id}`, owner.token, { name: 'Big umbrella', quantity: 4 })).body)
      .toMatchObject({ name: 'Big umbrella', quantity: 4 });
    // a box item can't go through the loose-item routes
    const boxItem = (await getBin(box.id)).items[0];
    expect((await call('put', `/api/locations/${loc}/items/${boxItem.id}`, owner.token, { name: 'x' })).status).toBe(422);

    const list = async (qs: string) => {
      const r = await call('get', `/api/items?location_id=${loc}&${qs}`, owner.token);
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(typeof r.body.count).toBe('number');
      return r.body as { results: Json[]; count: number };
    };
    const names = (r: { results: Json[] }) => r.results.map((i) => i.name);

    expect((await list('')).count).toBe(4);
    expect(names(await list(`area_id=${garage}`)).sort()).toEqual(['Bolts', 'Ladder', 'Zip ties']);
    expect(names(await list('unassigned=true'))).toEqual(['Big umbrella']);
    expect(names(await list('loose=true')).sort()).toEqual(['Big umbrella', 'Ladder', 'Zip ties']);
    expect(names(await list(`area_id=${garage}&loose=true`)).sort()).toEqual(['Ladder', 'Zip ties']);
    expect(names(await list('q=ladder'))).toContain('Ladder');
    // search also matches the item's own area name and its box name
    expect(names(await list('q=Garage')).sort()).toEqual(['Ladder', 'Zip ties']);
    expect(names(await list('q=Box'))).toEqual(['Bolts']);
    expect(names(await list('sort=alpha'))).toEqual(['Big umbrella', 'Bolts', 'Ladder', 'Zip ties']);
    expect(names(await list('sort=alpha&sort_dir=desc'))).toEqual(['Zip ties', 'Ladder', 'Bolts', 'Big umbrella']);
    expect(names(await list('sort=qty&sort_dir=desc'))).toEqual(['Zip ties', 'Big umbrella', 'Bolts', 'Ladder']);
    expect(names(await list('sort=qty'))).toEqual(['Big umbrella', 'Zip ties', 'Bolts', 'Ladder']);
    const bySort = await list('sort=bin');
    expect(bySort.results).toHaveLength(4);
    const page = await list('sort=alpha&limit=2&offset=1');
    expect(names(page)).toEqual(['Bolts', 'Ladder']);
    expect(page.count).toBe(4);
    expect((await call('get', `/api/items?location_id=${loc}&area_id=${garage}&unassigned=true`, owner.token)).status).toBe(422);

    expect((await call('delete', `/api/locations/${loc}/items/${a.body.id}`, owner.token)).status).toBe(200);
    expect((await list('')).count).toBe(3);
    await expectClean(loc);
  });

  it('loose items: bulk delete, restore, checkout, move to bin/area/unassigned, quantity', async () => {
    const loc = await setup();
    const garage = await mkArea(loc, 'Garage');
    const attic = await mkArea(loc, 'Attic');
    const box = await mkBin(loc, 'Box', { items: ['Bolts'] });
    const mk = async (name: string, extra: Json = {}) =>
      (await call('post', `/api/locations/${loc}/items`, owner.token, { name, ...extra })).body.id as string;
    const i1 = await mk('One', { areaId: garage, quantity: 2 });
    const i2 = await mk('Two');
    const i3 = await mk('Three', { areaId: garage });

    expect((await call('post', '/api/items/bulk-quantity', owner.token, { ids: [i1, i2], op: 'inc', value: 5 })).body).toEqual({ updated: 2, removed: 0 });
    expect((await call('post', '/api/items/bulk-quantity', owner.token, { ids: [i1], op: 'set', value: 0 })).body).toEqual({ updated: 0, removed: 1 });
    expect((await call('post', '/api/items/bulk-quantity', owner.token, { ids: [i2], op: 'clear' })).body).toEqual({ updated: 1, removed: 0 });

    expect((await call('post', '/api/items/bulk-restore', owner.token, { ids: [i1] })).body).toEqual({ restored: 1 });
    expect((await call('post', '/api/items/bulk-delete', owner.token, { ids: [i1, i3] })).body).toEqual({ deleted: 2 });
    expect((await call('post', '/api/items/bulk-restore', owner.token, { ids: [i1, i3] })).body).toEqual({ restored: 2 });

    const co = await call('post', '/api/items/bulk-checkout', owner.token, { ids: [i1, i2, i3] });
    expect(co.body).toEqual({ checkedOut: 3, errors: [] });
    expect((await call('post', '/api/items/bulk-checkout', owner.token, { ids: [i1] })).body.errors).toEqual([{ id: i1, reason: 'ALREADY_CHECKED_OUT' }]);
    const active = await call('get', `/api/locations/${loc}/checkouts`, owner.token);
    expect(active.body.count).toBe(3);
    const areaRow = active.body.results.find((r: Json) => r.item_id === i1);
    expect(areaRow.origin_area_id).toBe(garage);
    expect(areaRow.origin_area_name).toBe('Garage');
    expect(areaRow.origin_bin_id).toBeNull();
    const ret = await call('post', `/api/locations/${loc}/checkouts/bulk-return`, owner.token, { checkoutIds: active.body.results.map((r: Json) => r.id) });
    expect(ret.status).toBe(200);
    expect((await call('get', `/api/locations/${loc}/checkouts`, owner.token)).body.count).toBe(0);

    expect((await call('post', '/api/items/bulk-move', owner.token, { ids: [i1, i2], targetBinId: box.id })).body).toEqual({ moved: 2 });
    expect((await getBin(box.id)).items).toHaveLength(3);
    expect((await call('post', '/api/items/bulk-move', owner.token, { ids: [i1], targetAreaId: attic })).body).toEqual({ moved: 1 });
    expect((await call('post', '/api/items/bulk-move', owner.token, { ids: [i3], unassigned: true })).body).toEqual({ moved: 1 });
    const rows = await q('SELECT id, bin_id, area_id FROM bin_items WHERE id IN ($1, $2, $3)', [i1, i2, i3]);
    const by = Object.fromEntries(rows.rows.map((r) => [r.id, r]));
    expect(by[i1]).toMatchObject({ bin_id: null, area_id: attic });
    expect(by[i2]).toMatchObject({ bin_id: box.id, area_id: null });
    expect(by[i3]).toMatchObject({ bin_id: null, area_id: null });
    await expectClean(loc);
  });

  it('checkouts: location-scoped loose and box-nested checkout and return', async () => {
    const loc = await setup();
    const garage = await mkArea(loc, 'Garage');
    const attic = await mkArea(loc, 'Attic');
    const parent = await mkBin(loc, 'P');
    const child = await mkBin(loc, 'C', { parentBinId: parent.id, items: ['Nut'] });
    const loose = (await call('post', `/api/locations/${loc}/items`, owner.token, { name: 'Saw', areaId: garage })).body.id as string;

    const out = await call('post', `/api/locations/${loc}/items/${loose}/checkout`, owner.token);
    expect(out.status).toBe(201);
    expect((await call('post', `/api/locations/${loc}/items/${loose}/checkout`, owner.token)).status).toBe(409);
    const list = await call('get', `/api/locations/${loc}/checkouts`, owner.token);
    expect(list.body.results[0]).toMatchObject({ origin_area_id: garage, origin_area_name: 'Garage' });
    // return to a different area
    const back = await call('post', `/api/locations/${loc}/items/${loose}/return`, owner.token, { targetAreaId: attic });
    expect(back.status, JSON.stringify(back.body)).toBe(200);
    expect(back.body.checkout.return_area_id).toBe(attic);
    expect((await q('SELECT area_id FROM bin_items WHERE id = $1', [loose])).rows[0].area_id).toBe(attic);

    // box item via the scoped route, return by default to its own box
    const nut = (await getBin(child.id)).items[0].id;
    expect((await call('post', `/api/locations/${loc}/items/${nut}/checkout`, owner.token)).status).toBe(201);
    expect((await call('post', `/api/locations/${loc}/items/${nut}/return`, owner.token, {})).status).toBe(200);
    // bin-scoped (legacy) routes on a child box
    expect((await call('post', `/api/bins/${child.id}/items/${nut}/checkout`, owner.token)).status).toBe(201);
    expect((await call('get', `/api/bins/${child.id}/checkouts`, owner.token)).body.count).toBe(1);
    expect((await call('post', `/api/bins/${child.id}/items/${nut}/return`, owner.token, {})).status).toBe(200);
    // return into a different box
    const other = await mkBin(loc, 'Other');
    expect((await call('post', `/api/locations/${loc}/items/${nut}/checkout`, owner.token)).status).toBe(201);
    expect((await call('post', `/api/locations/${loc}/items/${nut}/return`, owner.token, { targetBinId: other.id })).status).toBe(200);
    expect((await q('SELECT bin_id FROM bin_items WHERE id = $1', [nut])).rows[0].bin_id).toBe(other.id);

    // origin area deleted before return: item ends up unassigned
    expect((await call('post', `/api/locations/${loc}/items/${loose}/checkout`, owner.token)).status).toBe(201);
    expect((await call('delete', `/api/locations/${loc}/areas/${attic}`, owner.token)).status).toBe(200);
    const orphan = await call('post', `/api/locations/${loc}/items/${loose}/return`, owner.token, {});
    expect(orphan.status, JSON.stringify(orphan.body)).toBe(200);
    expect((await q('SELECT area_id, bin_id FROM bin_items WHERE id = $1', [loose])).rows[0]).toEqual({ area_id: null, bin_id: null });
    await expectClean(loc);
  });

  it('shopping list: area origin, list, purchase back to area and to a box', async () => {
    const loc = await setup();
    const garage = await mkArea(loc, 'Garage');
    const box = await mkBin(loc, 'Box');

    const a = await call('post', `/api/locations/${loc}/shopping-list`, owner.token, { name: 'Tape', originAreaId: garage });
    expect(a.status, JSON.stringify(a.body)).toBe(201);
    const b = await call('post', `/api/locations/${loc}/shopping-list`, owner.token, { name: 'Glue', originBinId: box.id });
    expect(b.status).toBe(201);
    const n = await call('post', `/api/locations/${loc}/shopping-list`, owner.token, { name: 'Milk' });
    expect(n.status).toBe(201);
    expect((await call('post', `/api/locations/${loc}/shopping-list`, owner.token, { name: 'X', originAreaId: garage, originBinId: box.id })).status).toBe(422);

    const list = await call('get', `/api/locations/${loc}/shopping-list`, owner.token);
    expect(list.body.count).toBe(3);

    const pa = await call('post', `/api/shopping-list/${a.body.entry.id}/purchase`, owner.token);
    expect(pa.status, JSON.stringify(pa.body)).toBe(200);
    expect(pa.body.restored.areaId).toBe(garage);
    const pb = await call('post', `/api/shopping-list/${b.body.entry.id}/purchase`, owner.token);
    expect(pb.body.restored.binId).toBe(box.id);
    expect((await call('post', `/api/shopping-list/${n.body.entry.id}/purchase`, owner.token)).body.restored).toBeNull();

    const items = await call('get', `/api/items?location_id=${loc}`, owner.token);
    expect(items.body.results.map((i: Json) => i.name).sort()).toEqual(['Glue', 'Tape']);
    expect(items.body.results.find((i: Json) => i.name === 'Tape').area_id).toBe(garage);
    expect(items.body.results.find((i: Json) => i.name === 'Glue').bin_id).toBe(box.id);
    expect((await call('get', `/api/locations/${loc}/shopping-list`, owner.token)).body.count).toBe(0);
    await expectClean(loc);
  });

  it('counts: location stats, area counts with nested areas, area delete leaves items unassigned', async () => {
    const loc = await setup();
    const root = await mkArea(loc, 'House');
    const sub = await mkArea(loc, 'Garage', root);
    const subsub = await mkArea(loc, 'Shelf', sub);
    const parent = await mkBin(loc, 'P', { areaId: sub, items: ['a', 'b'] });
    await mkBin(loc, 'C', { parentBinId: parent.id, items: ['c'] });
    await mkBin(loc, 'Free', { items: ['d'] });
    const mk = (name: string, areaId?: string) =>
      call('post', `/api/locations/${loc}/items`, owner.token, { name, areaId });
    await mk('L1', root);
    await mk('L2', subsub);
    await mk('L3', subsub);
    await mk('L4');

    const stats = (await call('get', `/api/locations/${loc}/stats`, owner.token)).body;
    expect(stats).toMatchObject({ total_bins: 3, total_items: 8, total_areas: 3, loose_item_count: 4 });
    for (const k of ['total_bins', 'total_items', 'total_areas', 'needs_organizing', 'loose_item_count']) {
      expect(typeof stats[k], k).toBe('number');
    }

    const areas = await call('get', `/api/locations/${loc}/areas`, owner.token);
    expect(typeof areas.body.unassigned_count).toBe('number');
    const byName = Object.fromEntries(areas.body.results.map((a: Json) => [a.name, a]));
    for (const a of areas.body.results) {
      for (const k of ['bin_count', 'descendant_bin_count', 'item_count', 'descendant_item_count']) {
        expect(typeof a[k], `${a.name}.${k}`).toBe('number');
      }
    }
    expect(byName.House).toMatchObject({ item_count: 1, descendant_item_count: 3, bin_count: 0, descendant_bin_count: 2 });
    expect(byName.Garage).toMatchObject({ item_count: 0, descendant_item_count: 2, bin_count: 2 });
    expect(byName.Shelf).toMatchObject({ item_count: 2, descendant_item_count: 2, bin_count: 0 });

    // deleting an area leaves its loose items unassigned (and unassigned count updates)
    expect((await call('delete', `/api/locations/${loc}/areas/${subsub}`, owner.token)).status).toBe(200);
    const after = await call('get', `/api/items?location_id=${loc}&unassigned=true&loose=true`, owner.token);
    expect(after.body.results.map((i: Json) => i.name).sort()).toEqual(['L2', 'L3', 'L4']);
    expect((await call('get', `/api/locations/${loc}/stats`, owner.token)).body.loose_item_count).toBe(4);

    // deleting the parent's area unassigns the boxes (child follows)
    expect((await call('delete', `/api/locations/${loc}/areas/${sub}`, owner.token)).status).toBe(200);
    expect((await getBin(parent.id)).area_id).toBeNull();
    await expectClean(loc);
  });
});
