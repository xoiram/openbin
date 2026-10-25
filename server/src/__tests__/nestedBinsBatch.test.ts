import type { Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { query } from '../db.js';
import { createApp } from '../index.js';
import { createTestArea, createTestLocation, createTestUser, expectNoHierarchyViolations } from './helpers.js';

let app: Express;
let token: string;
let locationId: string;

beforeEach(async () => {
  app = createApp();
  token = (await createTestUser(app)).token;
  locationId = (await createTestLocation(app, token)).id;
});

const auth = () => ({ Authorization: `Bearer ${token}` });
const post = (body: Record<string, unknown>) => request(app).post('/api/bins').set(auth()).send(body);
const get = (id: string) => request(app).get(`/api/bins/${id}`).set(auth());
const batch = (operations: Record<string, unknown>[], loc = locationId) =>
  request(app).post('/api/batch').set(auth()).send({ locationId: loc, operations });
const mkPair = async (parentExtra: Record<string, unknown> = {}) => {
  const parent = (await post({ locationId, name: 'Parent', ...parentExtra })).body;
  const child = (await post({ locationId, name: 'Child', parentBinId: parent.id, items: ['x'] })).body;
  return { parent, child };
};

describe('batch set_area', () => {
  it('rejects a child', async () => {
    const area = await createTestArea(app, token, locationId, 'A');
    const { child } = await mkPair();
    const res = await batch([{ type: 'set_area', bin_id: child.id, area_id: area.id, area_name: 'A' }]);
    expect(res.body.results?.[0]?.success).not.toBe(true);
    expect((await get(child.id)).body.area_id).toBeNull();
    await expectNoHierarchyViolations();
  });

  it('rejects an area from another location', async () => {
    const other = await createTestLocation(app, token, 'Other');
    const foreignArea = await createTestArea(app, token, other.id, 'Foreign');
    const bin = (await post({ locationId, name: 'B' })).body;
    const res = await batch([{ type: 'set_area', bin_id: bin.id, area_id: foreignArea.id, area_name: 'Foreign' }]);
    expect(res.body.results?.[0]?.success).not.toBe(true);
    expect((await get(bin.id)).body.area_id).toBeNull();
  });

  it("moves the children along with a parent's area", async () => {
    const area = await createTestArea(app, token, locationId, 'A');
    const { parent, child } = await mkPair();
    const res = await batch([{ type: 'set_area', bin_id: parent.id, area_id: area.id, area_name: 'A' }]);
    expect(res.body.results[0].success).toBe(true);
    expect((await get(child.id)).body.area_id).toBe(area.id);
    await batch([{ type: 'set_area', bin_id: parent.id, area_id: null, area_name: '' }]);
    expect((await get(child.id)).body.area_id).toBeNull();
    await expectNoHierarchyViolations();
  });
});

describe('batch update_bin', () => {
  it('rejects an area change on a child but accepts one on a parent (children follow)', async () => {
    const { parent, child } = await mkPair();
    const bad = await batch([{ type: 'update_bin', bin_id: child.id, area_name: 'Somewhere' }]);
    expect(bad.body.results?.[0]?.success).not.toBe(true);
    expect((await get(child.id)).body.area_id).toBeNull();

    const ok = await batch([{ type: 'update_bin', bin_id: parent.id, area_name: 'Somewhere' }]);
    expect(ok.body.results[0].success).toBe(true);
    const p = (await get(parent.id)).body;
    expect(p.area_id).toBeTruthy();
    expect((await get(child.id)).body.area_id).toBe(p.area_id);
    await expectNoHierarchyViolations();
  });

  it('visibility: parent private cascades; child cannot be made public under a private parent', async () => {
    const { parent, child } = await mkPair();
    const res = await batch([{ type: 'update_bin', bin_id: parent.id, visibility: 'private' }]);
    expect(res.body.results[0].success).toBe(true);
    expect((await get(child.id)).body.visibility).toBe('private');
    const bad = await batch([{ type: 'update_bin', bin_id: child.id, visibility: 'location' }]);
    expect(bad.body.results?.[0]?.success).not.toBe(true);
    expect((await get(child.id)).body.visibility).toBe('private');
    await expectNoHierarchyViolations();
  });
});

describe('batch delete/restore/create/duplicate', () => {
  it('delete_bin cascades to children, restore_bin restores only those', async () => {
    const { parent, child } = await mkPair();
    const old = (await post({ locationId, name: 'Old', parentBinId: parent.id })).body;
    await batch([{ type: 'delete_bin', bin_id: old.id }]);
    await query("UPDATE bins SET deleted_at = datetime('now', '-1 hour') WHERE id = $1", [old.id]);

    const del = await batch([{ type: 'delete_bin', bin_id: parent.id }]);
    expect(del.body.results[0].success).toBe(true);
    const rows = await query('SELECT id, deleted_at FROM bins WHERE id IN ($1, $2)', [parent.id, child.id]);
    expect(rows.rows[0].deleted_at).toBe(rows.rows[1].deleted_at);
    expect(rows.rows[0].deleted_at).toBeTruthy();

    const blocked = await batch([{ type: 'restore_bin', bin_id: child.id }]);
    expect(blocked.body.results?.[0]?.success).not.toBe(true);
    expect((await get(child.id)).status).toBe(404);

    const res = await batch([{ type: 'restore_bin', bin_id: parent.id }]);
    expect(res.body.results[0].success).toBe(true);
    expect((await get(child.id)).status).toBe(200);
    expect((await get(old.id)).status).toBe(404);
    await expectNoHierarchyViolations();
  });

  it('create_bin and duplicate_bin write item location_id; duplicating a child yields a sibling', async () => {
    const created = await batch([{ type: 'create_bin', name: 'Made', items: ['a', 'b'] }]);
    const madeId = created.body.results[0].bin_id;
    const items = await query('SELECT location_id FROM bin_items WHERE bin_id = $1', [madeId]);
    expect(items.rows).toHaveLength(2);
    expect(items.rows.every((r) => r.location_id === locationId)).toBe(true);

    const area = await createTestArea(app, token, locationId, 'A');
    const { parent, child } = await mkPair({ areaId: area.id });
    const dup = await batch([{ type: 'duplicate_bin', bin_id: child.id }]);
    const copyId = dup.body.results[0].bin_id;
    const copy = (await get(copyId)).body;
    expect(copy.parent_bin_id).toBe(parent.id);
    expect(copy.area_id).toBe(area.id);
    const copyItems = await query('SELECT location_id FROM bin_items WHERE bin_id = $1', [copyId]);
    expect(copyItems.rows[0].location_id).toBe(locationId);

    const dupParent = await batch([{ type: 'duplicate_bin', bin_id: parent.id }]);
    const top = (await get(dupParent.body.results[0].bin_id)).body;
    expect(top.parent_bin_id).toBeNull();
    expect(top.child_count).toBe(0);
    await expectNoHierarchyViolations();
  });
});

describe('batch delete_area', () => {
  it('leaves parents and children consistently unassigned', async () => {
    const area = await createTestArea(app, token, locationId, 'A');
    const { parent, child } = await mkPair({ areaId: area.id });
    expect((await get(child.id)).body.area_id).toBe(area.id);
    const res = await batch([{ type: 'delete_area', area_id: area.id, area_name: 'A' }]);
    expect(res.body.results[0].success).toBe(true);
    expect((await get(parent.id)).body.area_id).toBeNull();
    expect((await get(child.id)).body.area_id).toBeNull();
    await expectNoHierarchyViolations();
  });
});
