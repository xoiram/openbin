import type { Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { query } from '../db.js';
import { createApp } from '../index.js';
import { createTestBin, expectNoHierarchyViolations } from './helpers.js';
import { addLoose, addMember, auth, binItemId, itemRow, setupLoose } from './looseItemsHelpers.js';

let app: Express;
beforeEach(() => {
  app = createApp();
});

const checkout = (token: string, loc: string, item: string) =>
  request(app).post(`/api/locations/${loc}/items/${item}/checkout`).set(auth(token));
const ret = (token: string, loc: string, item: string, body: object = {}) =>
  request(app).post(`/api/locations/${loc}/items/${item}/return`).set(auth(token)).send(body);

async function looseInArea() {
  const s = await setupLoose(app);
  const item = await addLoose(app, s.token, s.loc.id, { name: 'Tape', areaId: s.areaA.id });
  return { ...s, itemId: item.id };
}

describe('location-scoped checkout for loose items', () => {
  it('records origin_area_id for an area item and nulls for an unassigned item', async () => {
    const s = await looseInArea();
    const free = await addLoose(app, s.token, s.loc.id, { name: 'Key' });
    const a = await checkout(s.token, s.loc.id, s.itemId);
    expect(a.status).toBe(201);
    expect(a.body.checkout).toMatchObject({ origin_bin_id: null, origin_area_id: s.areaA.id, returned_at: null });
    const b = await checkout(s.token, s.loc.id, free.id);
    expect(b.body.checkout).toMatchObject({ origin_bin_id: null, origin_area_id: null });
    expect((await checkout(s.token, s.loc.id, s.itemId)).status).toBe(409);
  });

  it('also checks out box items via the location route', async () => {
    const s = await setupLoose(app);
    const id = await binItemId(app, s.token, s.bin.id, 'Hammer');
    const res = await checkout(s.token, s.loc.id, id);
    expect(res.status).toBe(201);
    expect(res.body.checkout.origin_bin_id).toBe(s.bin.id);
  });

  it('rejects viewers, non-members and unknown items', async () => {
    const s = await looseInArea();
    const viewer = await addMember(app, s.token, s.loc.id, 'viewer');
    expect((await checkout(viewer.token, s.loc.id, s.itemId)).status).toBe(403);
    expect((await checkout(s.token, s.loc.id, 'nope')).status).toBe(404);
  });

  it('lists area origins with nullable bin fields next to box origins', async () => {
    const s = await looseInArea();
    const boxItem = await binItemId(app, s.token, s.bin.id, 'Hammer');
    await checkout(s.token, s.loc.id, s.itemId);
    await checkout(s.token, s.loc.id, boxItem);
    const res = await request(app).get(`/api/locations/${s.loc.id}/checkouts`).set(auth(s.token));
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
    const by = Object.fromEntries(res.body.results.map((r: { item_name: string }) => [r.item_name, r]));
    expect(by.Tape).toMatchObject({ origin_bin_id: null, origin_bin_name: null, origin_area_id: s.areaA.id, origin_area_name: 'Garage' });
    expect(by.Hammer).toMatchObject({ origin_bin_id: s.bin.id, origin_bin_name: 'Toolbox', origin_area_id: null, origin_area_name: null });
  });
});

describe('location-scoped return for loose items', () => {
  it('returns to the original area by default', async () => {
    const s = await looseInArea();
    await checkout(s.token, s.loc.id, s.itemId);
    const res = await ret(s.token, s.loc.id, s.itemId);
    expect(res.status).toBe(200);
    expect(res.body.checkout).toMatchObject({ return_bin_id: null, return_area_id: s.areaA.id });
    expect(res.body.checkout.returned_at).not.toBeNull();
    expect(await itemRow(s.itemId)).toMatchObject({ bin_id: null, area_id: s.areaA.id });
    expect((await ret(s.token, s.loc.id, s.itemId)).status).toBe(404);
  });

  it('returns to another area, to a bin, or to unassigned', async () => {
    const s = await looseInArea();
    await checkout(s.token, s.loc.id, s.itemId);
    const toArea = await ret(s.token, s.loc.id, s.itemId, { targetAreaId: s.areaB.id });
    expect(toArea.body.checkout).toMatchObject({ return_area_id: s.areaB.id, return_bin_id: null });
    expect(await itemRow(s.itemId)).toMatchObject({ bin_id: null, area_id: s.areaB.id });

    await checkout(s.token, s.loc.id, s.itemId);
    const toBin = await ret(s.token, s.loc.id, s.itemId, { targetBinId: s.bin.id });
    expect(toBin.body.checkout).toMatchObject({ return_bin_id: s.bin.id, return_area_id: null });
    expect(await itemRow(s.itemId)).toMatchObject({ bin_id: s.bin.id, area_id: null });

    await checkout(s.token, s.loc.id, s.itemId);
    const toNone = await ret(s.token, s.loc.id, s.itemId, { unassigned: true });
    expect(toNone.body.checkout).toMatchObject({ return_bin_id: null, return_area_id: null });
    expect(await itemRow(s.itemId)).toMatchObject({ bin_id: null, area_id: null });
  });

  it('falls back to unassigned when the original area was deleted', async () => {
    const s = await looseInArea();
    await checkout(s.token, s.loc.id, s.itemId);
    await request(app).delete(`/api/locations/${s.loc.id}/areas/${s.areaA.id}`).set(auth(s.token));
    const res = await ret(s.token, s.loc.id, s.itemId);
    expect(res.status).toBe(200);
    expect(res.body.checkout).toMatchObject({ return_bin_id: null, return_area_id: null });
    expect(await itemRow(s.itemId)).toMatchObject({ bin_id: null, area_id: null });
  });

  it('falls back to unassigned when the original box is trashed', async () => {
    const s = await setupLoose(app);
    const id = await binItemId(app, s.token, s.bin.id, 'Hammer');
    await checkout(s.token, s.loc.id, id);
    // while checked out the item is moved to an area, then its original box is trashed
    await request(app).post('/api/items/bulk-move').set(auth(s.token)).send({ ids: [id], targetAreaId: s.areaB.id });
    await request(app).delete(`/api/bins/${s.bin.id}`).set(auth(s.token));
    const res = await ret(s.token, s.loc.id, id);
    expect(res.status).toBe(200);
    expect(res.body.checkout).toMatchObject({ return_bin_id: null, return_area_id: null });
    expect(await itemRow(id)).toMatchObject({ bin_id: null, area_id: null });
  });

  it('returns a box item to its box by default', async () => {
    const s = await setupLoose(app);
    const id = await binItemId(app, s.token, s.bin.id, 'Hammer');
    await checkout(s.token, s.loc.id, id);
    const res = await ret(s.token, s.loc.id, id);
    expect(res.body.checkout).toMatchObject({ return_bin_id: s.bin.id, return_area_id: null });
    expect(await itemRow(id)).toMatchObject({ bin_id: s.bin.id, area_id: null });
  });

  it('validates the target', async () => {
    const s = await looseInArea();
    await checkout(s.token, s.loc.id, s.itemId);
    expect((await ret(s.token, s.loc.id, s.itemId, { targetBinId: s.bin.id, targetAreaId: s.areaB.id })).status).toBe(422);
    expect((await ret(s.token, s.loc.id, s.itemId, { targetAreaId: 'nope' })).status).toBe(404);
    expect((await ret(s.token, s.loc.id, s.itemId, { targetBinId: 'nope' })).status).toBe(404);
    const viewer = await addMember(app, s.token, s.loc.id, 'viewer');
    expect((await ret(viewer.token, s.loc.id, s.itemId)).status).toBe(403);
    expect(await itemRow(s.itemId)).toMatchObject({ area_id: s.areaA.id });
  });
});

describe('bulk return with loose items', () => {
  async function checkedOutMix() {
    const s = await looseInArea();
    const boxItem = await binItemId(app, s.token, s.bin.id, 'Hammer');
    const free = await addLoose(app, s.token, s.loc.id, { name: 'Key' });
    const ids: string[] = [];
    for (const item of [s.itemId, boxItem, free.id]) {
      const r = await checkout(s.token, s.loc.id, item);
      ids.push(r.body.checkout.id);
    }
    return { ...s, boxItem, freeId: free.id, checkoutIds: ids };
  }
  const bulk = (token: string, loc: string, body: object) =>
    request(app).post(`/api/locations/${loc}/checkouts/bulk-return`).set(auth(token)).send(body);

  it('returns each item to its own original place by default', async () => {
    const s = await checkedOutMix();
    const res = await bulk(s.token, s.loc.id, { checkoutIds: s.checkoutIds });
    expect(res.status).toBe(200);
    expect(res.body.returned).toBe(3);
    expect(await itemRow(s.itemId)).toMatchObject({ bin_id: null, area_id: s.areaA.id });
    expect(await itemRow(s.boxItem)).toMatchObject({ bin_id: s.bin.id, area_id: null });
    expect(await itemRow(s.freeId)).toMatchObject({ bin_id: null, area_id: null });
    const rows = await query<{ return_bin_id: string | null; return_area_id: string | null }>(
      'SELECT return_bin_id, return_area_id FROM item_checkouts WHERE location_id = $1', [s.loc.id]);
    expect(rows.rows.filter((r) => r.return_area_id === s.areaA.id)).toHaveLength(1);
    expect(rows.rows.filter((r) => r.return_bin_id === s.bin.id)).toHaveLength(1);
    expect(rows.rows.filter((r) => r.return_bin_id === null && r.return_area_id === null)).toHaveLength(1);
  });

  it('returns everything to a bin, an area or unassigned', async () => {
    const s = await checkedOutMix();
    const target = await createTestBin(app, s.token, s.loc.id, { name: 'Target' });
    expect((await bulk(s.token, s.loc.id, { checkoutIds: [s.checkoutIds[0]], targetBinId: target.id })).body.returned).toBe(1);
    expect(await itemRow(s.itemId)).toMatchObject({ bin_id: target.id, area_id: null });
    expect((await bulk(s.token, s.loc.id, { checkoutIds: [s.checkoutIds[1]], targetAreaId: s.areaB.id })).body.returned).toBe(1);
    expect(await itemRow(s.boxItem)).toMatchObject({ bin_id: null, area_id: s.areaB.id });
    expect((await bulk(s.token, s.loc.id, { checkoutIds: [s.checkoutIds[2]], unassigned: true })).body.returned).toBe(1);
    expect(await itemRow(s.freeId)).toMatchObject({ bin_id: null, area_id: null });
  });

  it('handles a deleted original area and rejects bad targets', async () => {
    const s = await checkedOutMix();
    await request(app).delete(`/api/locations/${s.loc.id}/areas/${s.areaA.id}`).set(auth(s.token));
    const res = await bulk(s.token, s.loc.id, { checkoutIds: s.checkoutIds });
    expect(res.body.returned).toBe(3);
    expect(await itemRow(s.itemId)).toMatchObject({ bin_id: null, area_id: null });
    expect((await bulk(s.token, s.loc.id, { checkoutIds: s.checkoutIds, targetBinId: s.bin.id, unassigned: true })).status).toBe(422);
    expect((await bulk(s.token, s.loc.id, { checkoutIds: s.checkoutIds, targetAreaId: 'nope' })).status).toBe(404);
    expect((await bulk(s.token, s.loc.id, { checkoutIds: ['nope'] })).body.errors).toEqual([{ id: 'nope', reason: 'NOT_FOUND' }]);
  });

  it('rejects viewers', async () => {
    const s = await checkedOutMix();
    const viewer = await addMember(app, s.token, s.loc.id, 'viewer');
    expect((await bulk(viewer.token, s.loc.id, { checkoutIds: s.checkoutIds })).status).toBe(403);
  });
});

describe('regression: bin-nested checkout/return still work', () => {
  it('checks out and returns a box item through the bin routes', async () => {
    const s = await setupLoose(app);
    const id = await binItemId(app, s.token, s.bin.id, 'Saw');
    const out = await request(app).post(`/api/bins/${s.bin.id}/items/${id}/checkout`).set(auth(s.token));
    expect(out.status).toBe(201);
    const other = await createTestBin(app, s.token, s.loc.id, { name: 'Other' });
    const back = await request(app).post(`/api/bins/${s.bin.id}/items/${id}/return`).set(auth(s.token)).send({ targetBinId: other.id });
    expect(back.status).toBe(200);
    expect(await itemRow(id)).toMatchObject({ bin_id: other.id });
  });
});

describe('regression: bin-nested return after the item changed home while checked out', () => {
  async function movedWhileOut() {
    const s = await setupLoose(app);
    const id = await binItemId(app, s.token, s.bin.id, 'Saw');
    await request(app).post(`/api/bins/${s.bin.id}/items/${id}/checkout`).set(auth(s.token));
    const mv = await request(app).post('/api/items/bulk-move').set(auth(s.token)).send({ ids: [id], targetAreaId: s.areaA.id });
    expect(mv.body.moved).toBe(1);
    return { ...s, id };
  }

  it('default target puts it back in the origin bin', async () => {
    const s = await movedWhileOut();
    const res = await request(app).post(`/api/bins/${s.bin.id}/items/${s.id}/return`).set(auth(s.token)).send({});
    expect(res.status).toBe(200);
    expect(await itemRow(s.id)).toMatchObject({ bin_id: s.bin.id, area_id: null });
    await expectNoHierarchyViolations(s.loc.id);
  });

  it('another target bin works too', async () => {
    const s = await movedWhileOut();
    const other = await createTestBin(app, s.token, s.loc.id, { name: 'Other' });
    const res = await request(app).post(`/api/bins/${s.bin.id}/items/${s.id}/return`).set(auth(s.token)).send({ targetBinId: other.id });
    expect(res.status).toBe(200);
    expect(await itemRow(s.id)).toMatchObject({ bin_id: other.id, area_id: null });
    await expectNoHierarchyViolations(s.loc.id);
  });
});
