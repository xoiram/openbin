import type { Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { query } from '../db.js';
import { createApp } from '../index.js';
import {
  createTestArea,
  createTestBin,
  createTestLocation,
  createTestUser,
  expectNoHierarchyViolations,
  joinTestLocation,
  setParentBinByDb,
} from './helpers.js';

let app: Express;
let token: string;
let userId: string;
let locationId: string;

beforeEach(async () => {
  app = createApp();
  const u = await createTestUser(app);
  token = u.token;
  userId = u.user.id;
  locationId = (await createTestLocation(app, token)).id;
});

const auth = (t = token) => ({ Authorization: `Bearer ${t}` });
const post = (body: Record<string, unknown>, t = token) => request(app).post('/api/bins').set(auth(t)).send(body);
const put = (id: string, body: Record<string, unknown>, t = token) => request(app).put(`/api/bins/${id}`).set(auth(t)).send(body);
const get = (id: string, t = token) => request(app).get(`/api/bins/${id}`).set(auth(t));
const mkChild = async (parentBinId: string, extra: Record<string, unknown> = {}) => {
  const res = await post({ locationId, name: 'Child', parentBinId, ...extra });
  expect(res.status).toBe(201);
  return res.body;
};

describe('create a child bin (POST /api/bins)', () => {
  it('creates a child that follows the parent area and reports nesting fields', async () => {
    const area = await createTestArea(app, token, locationId, 'Garage');
    const parent = await post({ locationId, name: 'Toolbox', areaId: area.id });
    const child = await mkChild(parent.body.id, { items: ['screws', { name: 'nuts', quantity: 3 }] });

    expect(child.parent_bin_id).toBe(parent.body.id);
    expect(child.parent_bin_name).toBe('Toolbox');
    expect(child.area_id).toBe(area.id);
    expect(child.area_name).toBe('Garage');
    expect(child.child_count).toBe(0);
    expect(child.items.map((i: { name: string }) => i.name)).toEqual(['screws', 'nuts']);

    const reread = await get(parent.body.id);
    expect(reread.body.child_count).toBe(1);
    expect(reread.body.parent_bin_id).toBeNull();
    expect(reread.body.parent_bin_name).toBe('');

    const items = await query('SELECT location_id FROM bin_items WHERE bin_id = $1', [child.id]);
    expect(items.rows.every((r) => r.location_id === locationId)).toBe(true);
    await expectNoHierarchyViolations();
  });

  it('accepts a matching areaId and rejects a conflicting one with 422', async () => {
    const a1 = await createTestArea(app, token, locationId, 'A1');
    const a2 = await createTestArea(app, token, locationId, 'A2');
    const parent = (await post({ locationId, name: 'P', areaId: a1.id })).body;
    expect((await post({ locationId, name: 'ok', parentBinId: parent.id, areaId: a1.id })).status).toBe(201);
    const bad = await post({ locationId, name: 'bad', parentBinId: parent.id, areaId: a2.id });
    expect(bad.status).toBe(422);
    const noArea = (await post({ locationId, name: 'P2' })).body;
    expect((await post({ locationId, name: 'bad', parentBinId: noArea.id, areaId: a1.id })).status).toBe(422);
    await expectNoHierarchyViolations();
  });

  it('rejects nesting into a child (depth rule)', async () => {
    const parent = (await post({ locationId, name: 'P' })).body;
    const child = await mkChild(parent.id);
    const res = await post({ locationId, name: 'grandchild', parentBinId: child.id });
    expect(res.status).toBe(422);
    await expectNoHierarchyViolations();
  });

  it('rejects missing, trashed and foreign-location parents', async () => {
    expect((await post({ locationId, name: 'x', parentBinId: 'nope' })).status).toBe(422);

    const trashed = (await post({ locationId, name: 'T' })).body;
    await request(app).delete(`/api/bins/${trashed.id}`).set(auth());
    expect((await post({ locationId, name: 'x', parentBinId: trashed.id })).status).toBe(422);

    const other = await createTestLocation(app, token, 'Other');
    const foreign = (await post({ locationId: other.id, name: 'F' })).body;
    expect((await post({ locationId, name: 'x', parentBinId: foreign.id })).status).toBe(422);
    expect((await get(foreign.id)).status).toBe(200);
    await expectNoHierarchyViolations();
  });

  it('rejects a non-string parentBinId', async () => {
    expect((await post({ locationId, name: 'x', parentBinId: 5 })).status).toBe(422);
  });

  it('a child of a private parent is private', async () => {
    const parent = (await post({ locationId, name: 'P', visibility: 'private' })).body;
    const child = await mkChild(parent.id, { visibility: 'location' });
    expect(child.visibility).toBe('private');
    await expectNoHierarchyViolations();
  });

  it('a child of a public parent can be private', async () => {
    const parent = (await post({ locationId, name: 'P' })).body;
    const child = await mkChild(parent.id, { visibility: 'private' });
    expect(child.visibility).toBe('private');
    await expectNoHierarchyViolations();
  });

  it("cannot nest under someone else's private parent", async () => {
    const parent = (await post({ locationId, name: 'P', visibility: 'private' })).body;
    const other = await createTestUser(app);
    const loc = await request(app).get(`/api/locations`).set(auth());
    const invite = loc.body.results.find((l: { id: string }) => l.id === locationId).invite_code;
    await joinTestLocation(app, other.token, invite);
    const res = await post({ locationId, name: 'sneaky', parentBinId: parent.id }, other.token);
    expect(res.status).toBe(422);
  });

  it('children count toward the bin plan limit path unchanged (plain create still works)', async () => {
    const plain = await post({ locationId, name: 'Plain', items: ['a'] });
    expect(plain.status).toBe(201);
    expect(plain.body.parent_bin_id).toBeNull();
    expect(plain.body.child_count).toBe(0);
  });
});

describe('nest and un-nest (PUT /api/bins/:id)', () => {
  it('nests a bin: area follows the parent', async () => {
    const area = await createTestArea(app, token, locationId, 'Shed');
    const parent = (await post({ locationId, name: 'P', areaId: area.id })).body;
    const bin = (await post({ locationId, name: 'B' })).body;
    const res = await put(bin.id, { parentBinId: parent.id });
    expect(res.status).toBe(200);
    expect(res.body.parent_bin_id).toBe(parent.id);
    expect(res.body.area_id).toBe(area.id);
    await expectNoHierarchyViolations();
  });

  it('rejects nesting with a conflicting areaId', async () => {
    const a1 = await createTestArea(app, token, locationId, 'A1');
    const a2 = await createTestArea(app, token, locationId, 'A2');
    const parent = (await post({ locationId, name: 'P', areaId: a1.id })).body;
    const bin = (await post({ locationId, name: 'B', areaId: a2.id })).body;
    expect((await put(bin.id, { parentBinId: parent.id, areaId: a2.id })).status).toBe(422);
    expect((await get(bin.id)).body.parent_bin_id).toBeNull();
    expect((await put(bin.id, { parentBinId: parent.id, areaId: a1.id })).status).toBe(200);
    await expectNoHierarchyViolations();
  });

  it('rejects nesting into a child, a bin that has children, itself and a trashed parent', async () => {
    const p = (await post({ locationId, name: 'P' })).body;
    const c = await mkChild(p.id);
    const other = (await post({ locationId, name: 'O' })).body;

    expect((await put(other.id, { parentBinId: c.id })).status).toBe(422); // nest into a child
    expect((await put(p.id, { parentBinId: other.id })).status).toBe(422); // bin with children
    expect((await put(other.id, { parentBinId: other.id })).status).toBe(422); // itself

    const trashed = (await post({ locationId, name: 'T' })).body;
    await request(app).delete(`/api/bins/${trashed.id}`).set(auth());
    expect((await put(other.id, { parentBinId: trashed.id })).status).toBe(422);
    expect((await put(other.id, { parentBinId: 'missing' })).status).toBe(422);
    await expectNoHierarchyViolations();
  });

  it('rejects nesting across locations', async () => {
    const other = await createTestLocation(app, token, 'Other');
    const foreign = (await post({ locationId: other.id, name: 'F' })).body;
    const bin = (await post({ locationId, name: 'B' })).body;
    expect((await put(bin.id, { parentBinId: foreign.id })).status).toBe(422);
  });

  it('takes a child out with parentBinId null, keeping area and visibility', async () => {
    const area = await createTestArea(app, token, locationId, 'Shed');
    const parent = (await post({ locationId, name: 'P', areaId: area.id, visibility: 'private' })).body;
    const child = await mkChild(parent.id);
    const res = await put(child.id, { parentBinId: null });
    expect(res.status).toBe(200);
    expect(res.body.parent_bin_id).toBeNull();
    expect(res.body.area_id).toBe(area.id);
    expect(res.body.visibility).toBe('private');
    expect((await get(parent.id)).body.child_count).toBe(0);
    // now free: area can be changed
    expect((await put(child.id, { areaId: null })).status).toBe(200);
    await expectNoHierarchyViolations();
  });

  it('parentBinId null on a top-level bin is a no-op', async () => {
    const bin = (await post({ locationId, name: 'B' })).body;
    const res = await put(bin.id, { parentBinId: null, name: 'B2' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('B2');
  });

  it('rejects changing a child area directly, but allows resending the same area', async () => {
    const a1 = await createTestArea(app, token, locationId, 'A1');
    const a2 = await createTestArea(app, token, locationId, 'A2');
    const parent = (await post({ locationId, name: 'P', areaId: a1.id })).body;
    const child = await mkChild(parent.id);
    expect((await put(child.id, { areaId: a2.id })).status).toBe(422);
    expect((await put(child.id, { areaId: null })).status).toBe(422);
    expect((await put(child.id, { areaId: a1.id, name: 'renamed' })).status).toBe(200);
    expect((await get(child.id)).body.area_id).toBe(a1.id);
    await expectNoHierarchyViolations();
  });

  it("changing a parent's area moves its children (also trashed ones)", async () => {
    const a1 = await createTestArea(app, token, locationId, 'A1');
    const a2 = await createTestArea(app, token, locationId, 'A2');
    const parent = (await post({ locationId, name: 'P', areaId: a1.id })).body;
    const c1 = await mkChild(parent.id);
    const c2 = await mkChild(parent.id, { name: 'C2' });
    await request(app).delete(`/api/bins/${c2.id}`).set(auth());

    const res = await put(parent.id, { areaId: a2.id });
    expect(res.status).toBe(200);
    expect((await get(c1.id)).body.area_id).toBe(a2.id);
    const row = await query('SELECT area_id FROM bins WHERE id = $1', [c2.id]);
    expect(row.rows[0].area_id).toBe(a2.id);

    await put(parent.id, { areaId: null });
    expect((await get(c1.id)).body.area_id).toBeNull();
    await expectNoHierarchyViolations();
  });

  it('making a parent private makes its children private', async () => {
    const parent = (await post({ locationId, name: 'P' })).body;
    const child = await mkChild(parent.id);
    expect((await put(parent.id, { visibility: 'private' })).status).toBe(200);
    expect((await get(child.id)).body.visibility).toBe('private');
    await expectNoHierarchyViolations();
  });

  it('a child of a private parent cannot be made public; a child of a public parent can toggle', async () => {
    const parent = (await post({ locationId, name: 'P', visibility: 'private' })).body;
    const child = await mkChild(parent.id);
    expect((await put(child.id, { visibility: 'location' })).status).toBe(422);
    expect((await put(child.id, { visibility: 'private' })).status).toBe(200);

    const pub = (await post({ locationId, name: 'Pub' })).body;
    const pc = await mkChild(pub.id);
    expect((await put(pc.id, { visibility: 'private' })).status).toBe(200);
    expect((await put(pc.id, { visibility: 'location' })).status).toBe(200);
    await expectNoHierarchyViolations();
  });

  it('nesting under a private parent makes the bin private', async () => {
    const parent = (await post({ locationId, name: 'P', visibility: 'private' })).body;
    const bin = (await post({ locationId, name: 'B' })).body;
    const res = await put(bin.id, { parentBinId: parent.id, visibility: 'location' });
    expect(res.status).toBe(200);
    expect(res.body.visibility).toBe('private');
    await expectNoHierarchyViolations();
  });

  it('keeps the existing rule that only the creator can set private', async () => {
    const other = await createTestUser(app);
    const loc = await request(app).get('/api/locations').set(auth());
    const invite = loc.body.results.find((l: { id: string }) => l.id === locationId).invite_code;
    await joinTestLocation(app, other.token, invite);
    const bin = (await post({ locationId, name: 'B' })).body;
    expect((await put(bin.id, { visibility: 'private' }, other.token)).status).toBe(403);
  });

  it('an invalid update is rolled back as a whole', async () => {
    const p = (await post({ locationId, name: 'P' })).body;
    const c = await mkChild(p.id);
    const o = (await post({ locationId, name: 'O', items: ['keep'] })).body;
    const res = await put(o.id, { name: 'changed', items: ['new'], parentBinId: c.id });
    expect(res.status).toBe(422);
    const after = (await get(o.id)).body;
    expect(after.name).toBe('O');
    expect(after.items.map((i: { name: string }) => i.name)).toEqual(['keep']);
  });

  it('an old-style update without new fields behaves as before', async () => {
    const area = await createTestArea(app, token, locationId, 'A');
    const bin = (await post({ locationId, name: 'B', items: ['x'] })).body;
    const res = await put(bin.id, { name: 'B2', areaId: area.id, items: ['x', 'y'], tags: ['t'] });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('B2');
    expect(res.body.area_id).toBe(area.id);
    expect(res.body.items).toHaveLength(2);
    const items = await query('SELECT location_id FROM bin_items WHERE bin_id = $1', [bin.id]);
    expect(items.rows.every((r) => r.location_id === locationId)).toBe(true);
    const log = await request(app).get(`/api/locations/${locationId}/activity`).set(auth());
    expect(log.status).toBe(200);
    await expectNoHierarchyViolations();
  });
});

describe('list filters', () => {
  it('filters by parent and top_level, and keeps other filters working', async () => {
    const p = (await post({ locationId, name: 'Parent' })).body;
    const other = (await post({ locationId, name: 'Other' })).body;
    const c1 = await mkChild(p.id, { name: 'C1', items: ['bolt'] });
    await mkChild(p.id, { name: 'C2' });
    await mkChild(other.id, { name: 'C3' });

    const list = (qs: Record<string, string>) =>
      request(app).get('/api/bins').set(auth()).query({ location_id: locationId, ...qs });

    const children = await list({ parent: p.id });
    expect(children.body.results.map((b: { name: string }) => b.name).sort()).toEqual(['C1', 'C2']);
    expect(children.body.count).toBe(2);

    const top = await list({ top_level: 'true' });
    expect(top.body.results.map((b: { name: string }) => b.name).sort()).toEqual(['Other', 'Parent']);
    const parentRow = top.body.results.find((b: { id: string }) => b.id === p.id);
    expect(parentRow.child_count).toBe(2);

    const all = await list({});
    expect(all.body.count).toBe(5);
    const row = all.body.results.find((b: { id: string }) => b.id === c1.id);
    expect(row.parent_bin_name).toBe('Parent');

    const withItems = await list({ has_items: 'true' });
    expect(withItems.body.results.map((b: { id: string }) => b.id)).toEqual([c1.id]);
    const empty = await list({ needs_organizing: 'true', top_level: 'true' });
    expect(empty.body.results.map((b: { name: string }) => b.name).sort()).toEqual(['Other', 'Parent']);
  });

  it('child_count ignores trashed children', async () => {
    const p = (await post({ locationId, name: 'P' })).body;
    const c = await mkChild(p.id);
    await request(app).delete(`/api/bins/${c.id}`).set(auth());
    expect((await get(p.id)).body.child_count).toBe(0);
  });
});

describe('move to another location', () => {
  it('rejects moving a child', async () => {
    const other = await createTestLocation(app, token, 'Other');
    const p = (await post({ locationId, name: 'P' })).body;
    const c = await mkChild(p.id);
    const res = await request(app).post(`/api/bins/${c.id}/move`).set(auth()).send({ locationId: other.id });
    expect(res.status).toBe(422);
    expect((await get(c.id)).body.location_id).toBe(locationId);
    await expectNoHierarchyViolations();
  });

  it('moving a parent takes its children (and items) along and clears areas', async () => {
    const other = await createTestLocation(app, token, 'Other');
    const area = await createTestArea(app, token, locationId, 'A');
    const p = (await post({ locationId, name: 'P', areaId: area.id, items: ['pi'] })).body;
    const c = await mkChild(p.id, { items: ['ci'] });
    const res = await request(app).post(`/api/bins/${p.id}/move`).set(auth()).send({ locationId: other.id });
    expect(res.status).toBe(200);
    const child = (await get(c.id)).body;
    expect(child.location_id).toBe(other.id);
    expect(child.area_id).toBeNull();
    expect(child.parent_bin_id).toBe(p.id);
    const items = await query('SELECT location_id FROM bin_items WHERE bin_id IN ($1, $2)', [p.id, c.id]);
    expect(items.rows).toHaveLength(2);
    expect(items.rows.every((r) => r.location_id === other.id)).toBe(true);
    await expectNoHierarchyViolations();
  });
});

describe('duplicate', () => {
  it('duplicating a parent gives a top-level copy without children, items with location', async () => {
    const p = (await post({ locationId, name: 'P', items: ['a'] })).body;
    await mkChild(p.id);
    const res = await request(app).post(`/api/bins/${p.id}/duplicate`).set(auth()).send({});
    expect(res.status).toBe(201);
    expect(res.body.parent_bin_id).toBeNull();
    expect(res.body.child_count).toBe(0);
    expect(res.body.items).toHaveLength(1);
    const items = await query('SELECT location_id FROM bin_items WHERE bin_id = $1', [res.body.id]);
    expect(items.rows[0].location_id).toBe(locationId);
    await expectNoHierarchyViolations();
  });

  it('duplicating a child gives a sibling in the same parent and area', async () => {
    const area = await createTestArea(app, token, locationId, 'A');
    const p = (await post({ locationId, name: 'P', areaId: area.id, visibility: 'private' })).body;
    const c = await mkChild(p.id, { items: ['x'] });
    const res = await request(app).post(`/api/bins/${c.id}/duplicate`).set(auth()).send({});
    expect(res.status).toBe(201);
    expect(res.body.parent_bin_id).toBe(p.id);
    expect(res.body.area_id).toBe(area.id);
    expect(res.body.visibility).toBe('private');
    expect((await get(p.id)).body.child_count).toBe(2);
    await expectNoHierarchyViolations();
  });
});

describe('fixtures sanity', () => {
  it('setParentBinByDb produces consistent data', async () => {
    const p = (await post({ locationId, name: 'P' })).body;
    const c = (await post({ locationId, name: 'C' })).body;
    await setParentBinByDb(c.id, p.id);
    expect(userId).toBeTruthy();
    await expectNoHierarchyViolations();
  });
});
