import type { Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { query } from '../db.js';
import { createApp } from '../index.js';
import { createTestBin, createTestLocation } from './helpers.js';
import { addBinItems, addLoose, addMember, auth, binItemId, itemRow, setupLoose } from './looseItemsHelpers.js';

let app: Express;
beforeEach(() => {
  app = createApp();
});

/** A box item, a loose item in an area, and an unassigned item. */
async function mixed() {
  const s = await setupLoose(app);
  const boxItem = await binItemId(app, s.token, s.bin.id, 'Hammer');
  const areaItem = await addLoose(app, s.token, s.loc.id, { name: 'Tape', quantity: 4, areaId: s.areaA.id });
  const freeItem = await addLoose(app, s.token, s.loc.id, { name: 'Key', quantity: 1 });
  return { ...s, boxItem, areaItem: areaItem.id, freeItem: freeItem.id, ids: [boxItem, areaItem.id, freeItem.id] };
}

const post = (token: string, path: string, body: unknown) => request(app).post(path).set(auth(token)).send(body as object);

describe('bulk delete / restore with loose items', () => {
  it('soft-deletes and restores box, area and unassigned items', async () => {
    const m = await mixed();
    const del = await post(m.token, '/api/items/bulk-delete', { ids: m.ids });
    expect(del.status).toBe(200);
    expect(del.body.deleted).toBe(3);
    for (const id of m.ids) expect((await itemRow(id)).deleted_at).not.toBeNull();

    const res = await post(m.token, '/api/items/bulk-restore', { ids: m.ids });
    expect(res.body.restored).toBe(3);
    for (const id of m.ids) expect((await itemRow(id)).deleted_at).toBeNull();
  });

  it('works with only loose items (no bins to touch)', async () => {
    const m = await mixed();
    const res = await post(m.token, '/api/items/bulk-delete', { ids: [m.areaItem, m.freeItem] });
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(2);
  });

  it('rejects viewers', async () => {
    const m = await mixed();
    const viewer = await addMember(app, m.token, m.loc.id, 'viewer');
    expect((await post(viewer.token, '/api/items/bulk-delete', { ids: [m.areaItem] })).status).toBe(403);
  });
});

describe('bulk quantity with loose items', () => {
  it('sets, increments and removes at zero', async () => {
    const m = await mixed();
    const set = await post(m.token, '/api/items/bulk-quantity', { ids: m.ids, op: 'set', value: 7 });
    expect(set.body).toEqual({ updated: 3, removed: 0 });
    expect((await itemRow(m.areaItem)).quantity).toBe(7);
    const inc = await post(m.token, '/api/items/bulk-quantity', { ids: [m.areaItem, m.freeItem], op: 'inc', value: 3 });
    expect(inc.body.updated).toBe(2);
    expect((await itemRow(m.freeItem)).quantity).toBe(10);
    const clear = await post(m.token, '/api/items/bulk-quantity', { ids: [m.freeItem], op: 'clear' });
    expect(clear.body.updated).toBe(1);
    const rm = await post(m.token, '/api/items/bulk-quantity', { ids: m.ids, op: 'set', value: 0 });
    expect(rm.body).toEqual({ updated: 0, removed: 3 });
    expect((await itemRow(m.areaItem)).deleted_at).not.toBeNull();
  });
});

describe('bulk checkout with loose items', () => {
  it('records the origin according to the item home', async () => {
    const m = await mixed();
    const res = await post(m.token, '/api/items/bulk-checkout', { ids: m.ids });
    expect(res.body.checkedOut).toBe(3);
    const rows = await query<{ item_id: string; origin_bin_id: string | null; origin_area_id: string | null }>(
      'SELECT item_id, origin_bin_id, origin_area_id FROM item_checkouts WHERE location_id = $1',
      [m.loc.id],
    );
    const by = Object.fromEntries(rows.rows.map((r) => [r.item_id, r]));
    expect(by[m.boxItem]).toMatchObject({ origin_bin_id: m.bin.id, origin_area_id: null });
    expect(by[m.areaItem]).toMatchObject({ origin_bin_id: null, origin_area_id: m.areaA.id });
    expect(by[m.freeItem]).toMatchObject({ origin_bin_id: null, origin_area_id: null });

    const again = await post(m.token, '/api/items/bulk-checkout', { ids: m.ids });
    expect(again.body.checkedOut).toBe(0);
    expect(again.body.errors.map((e: { reason: string }) => e.reason)).toEqual(['ALREADY_CHECKED_OUT', 'ALREADY_CHECKED_OUT', 'ALREADY_CHECKED_OUT']);
  });
});

describe('bulk move with loose items', () => {
  it('moves a mix into a bin: sets bin_id, clears area_id, appends positions', async () => {
    const m = await mixed();
    const target = await createTestBin(app, m.token, m.loc.id, { name: 'Target' });
    await addBinItems(app, m.token, target.id, ['Existing']);
    const res = await post(m.token, '/api/items/bulk-move', { ids: [m.areaItem, m.freeItem, m.boxItem], targetBinId: target.id });
    expect(res.status).toBe(200);
    expect(res.body.moved).toBe(3);
    for (const id of [m.areaItem, m.freeItem, m.boxItem]) {
      expect(await itemRow(id)).toMatchObject({ bin_id: target.id, area_id: null });
    }
    const pos = await query<{ position: number }>('SELECT position FROM bin_items WHERE bin_id = $1 ORDER BY position', [target.id]);
    expect(pos.rows.map((r) => r.position)).toEqual([0, 1, 2, 3]);
  });

  it('moves a mix into an area: sets area_id, clears bin_id', async () => {
    const m = await mixed();
    const res = await post(m.token, '/api/items/bulk-move', { ids: m.ids, targetAreaId: m.areaB.id });
    expect(res.body.moved).toBe(3);
    for (const id of m.ids) expect(await itemRow(id)).toMatchObject({ bin_id: null, area_id: m.areaB.id });
  });

  it('moves a mix to unassigned: clears both', async () => {
    const m = await mixed();
    const res = await post(m.token, '/api/items/bulk-move', { ids: m.ids, unassigned: true });
    expect(res.status).toBe(200);
    expect(res.body.moved).toBe(3);
    for (const id of m.ids) expect(await itemRow(id)).toMatchObject({ bin_id: null, area_id: null });
  });

  it('requires exactly one target', async () => {
    const m = await mixed();
    expect((await post(m.token, '/api/items/bulk-move', { ids: m.ids })).status).toBe(422);
    expect((await post(m.token, '/api/items/bulk-move', { ids: m.ids, targetBinId: m.bin.id, targetAreaId: m.areaA.id })).status).toBe(422);
    expect((await post(m.token, '/api/items/bulk-move', { ids: m.ids, targetAreaId: m.areaA.id, unassigned: true })).status).toBe(422);
    expect((await post(m.token, '/api/items/bulk-move', { ids: m.ids, targetBinId: m.bin.id, unassigned: true })).status).toBe(422);
    expect((await post(m.token, '/api/items/bulk-move', { ids: m.ids, unassigned: 'yes' })).status).toBe(422);
    expect(await itemRow(m.areaItem)).toMatchObject({ bin_id: null, area_id: m.areaA.id });
  });

  it('rejects unknown, foreign-location, trashed and private targets', async () => {
    const m = await mixed();
    expect((await post(m.token, '/api/items/bulk-move', { ids: m.ids, targetBinId: 'nope' })).status).toBe(404);
    expect((await post(m.token, '/api/items/bulk-move', { ids: m.ids, targetAreaId: 'nope' })).status).toBe(404);

    const other = await createTestLocation(app, m.token, 'Other');
    const foreignBin = await createTestBin(app, m.token, other.id, { name: 'Foreign' });
    const moved = await post(m.token, '/api/items/bulk-move', { ids: m.ids, targetBinId: foreignBin.id });
    expect(moved.body.moved).toBe(0);
    expect(await itemRow(m.areaItem)).toMatchObject({ location_id: m.loc.id, area_id: m.areaA.id });

    const trashed = await createTestBin(app, m.token, m.loc.id, { name: 'Trashed' });
    await request(app).delete(`/api/bins/${trashed.id}`).set(auth(m.token));
    expect((await post(m.token, '/api/items/bulk-move', { ids: m.ids, targetBinId: trashed.id })).status).toBe(404);

    const member = await addMember(app, m.token, m.loc.id, 'member');
    const priv = await createTestBin(app, member.token, m.loc.id, { name: 'Private', visibility: 'private' });
    expect((await post(m.token, '/api/items/bulk-move', { ids: m.ids, targetBinId: priv.id })).status).toBe(404);
  });

  it('rejects viewers', async () => {
    const m = await mixed();
    const viewer = await addMember(app, m.token, m.loc.id, 'viewer');
    expect((await post(viewer.token, '/api/items/bulk-move', { ids: [m.areaItem], targetAreaId: m.areaB.id })).status).toBe(403);
    expect((await post(viewer.token, '/api/items/bulk-move', { ids: [m.areaItem], unassigned: true })).status).toBe(403);
  });
});
