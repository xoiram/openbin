import type { Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../index.js';
import { createTestArea, createTestLocation, createTestUser } from './helpers.js';
import { addBinItems, addLoose, addMember, auth, itemNames, itemRow, listItems, setupLoose } from './looseItemsHelpers.js';

let app: Express;
beforeEach(() => {
  app = createApp();
});

describe('POST /api/locations/:id/items (loose items)', () => {
  it('creates an item in an area and an unassigned item', async () => {
    const s = await setupLoose(app);
    const inArea = await request(app).post(`/api/locations/${s.loc.id}/items`).set(auth(s.token))
      .send({ name: '  Tape  ', quantity: 3, areaId: s.areaA.id });
    expect(inArea.status).toBe(201);
    expect(inArea.body).toMatchObject({ name: 'Tape', quantity: 3, bin_id: null, area_id: s.areaA.id, area_name: 'Garage', location_id: s.loc.id });
    const row = await itemRow(inArea.body.id);
    expect(row).toMatchObject({ bin_id: null, area_id: s.areaA.id, location_id: s.loc.id });

    const loose = await request(app).post(`/api/locations/${s.loc.id}/items`).set(auth(s.token)).send({ name: 'Spare key' });
    expect(loose.status).toBe(201);
    expect(loose.body.area_id).toBeNull();
    expect(loose.body.quantity).toBeNull();
    expect(await itemRow(loose.body.id)).toMatchObject({ bin_id: null, area_id: null, location_id: s.loc.id });
  });

  it('validates input', async () => {
    const s = await setupLoose(app);
    const url = `/api/locations/${s.loc.id}/items`;
    expect((await request(app).post(url).set(auth(s.token)).send({})).status).toBe(422);
    expect((await request(app).post(url).set(auth(s.token)).send({ name: '   ' })).status).toBe(422);
    expect((await request(app).post(url).set(auth(s.token)).send({ name: 'x', quantity: 'many' })).status).toBe(422);
  });

  it('rejects an area from another location', async () => {
    const s = await setupLoose(app);
    const other = await createTestLocation(app, s.token, 'Other');
    const foreign = await createTestArea(app, s.token, other.id, 'Foreign');
    const res = await request(app).post(`/api/locations/${s.loc.id}/items`).set(auth(s.token)).send({ name: 'x', areaId: foreign.id });
    expect(res.status).toBe(422);
  });

  it('rejects viewers and non-members', async () => {
    const s = await setupLoose(app);
    const viewer = await addMember(app, s.token, s.loc.id, 'viewer');
    const stranger = await createTestUser(app);
    const url = `/api/locations/${s.loc.id}/items`;
    expect((await request(app).post(url).set(auth(viewer.token)).send({ name: 'x' })).status).toBe(403);
    expect((await request(app).post(url).set(auth(stranger.token)).send({ name: 'x' })).status).toBe(403);
  });

  it('lets a plain member create', async () => {
    const s = await setupLoose(app);
    const member = await addMember(app, s.token, s.loc.id, 'member');
    const res = await request(app).post(`/api/locations/${s.loc.id}/items`).set(auth(member.token)).send({ name: 'x', areaId: s.areaA.id });
    expect(res.status).toBe(201);
  });
});

describe('PUT/DELETE /api/locations/:id/items/:itemId', () => {
  it('edits name and quantity, and clears quantity with null', async () => {
    const s = await setupLoose(app);
    const item = await addLoose(app, s.token, s.loc.id, { name: 'Tape', quantity: 2, areaId: s.areaA.id });
    const url = `/api/locations/${s.loc.id}/items/${item.id}`;

    const r1 = await request(app).put(url).set(auth(s.token)).send({ name: 'Duct tape', quantity: 5 });
    expect(r1.status).toBe(200);
    expect(r1.body).toEqual({ id: item.id, name: 'Duct tape', quantity: 5 });

    const r2 = await request(app).put(url).set(auth(s.token)).send({ quantity: null });
    expect(r2.body).toEqual({ id: item.id, name: 'Duct tape', quantity: null });
    expect((await request(app).put(url).set(auth(s.token)).send({})).status).toBe(422);
    expect((await request(app).put(url).set(auth(s.token)).send({ name: '' })).status).toBe(422);
  });

  it('deletes a loose item', async () => {
    const s = await setupLoose(app);
    const item = await addLoose(app, s.token, s.loc.id, { name: 'Tape' });
    const res = await request(app).delete(`/api/locations/${s.loc.id}/items/${item.id}`).set(auth(s.token));
    expect(res.status).toBe(200);
    expect(await itemRow(item.id)).toBeUndefined();
    expect((await request(app).delete(`/api/locations/${s.loc.id}/items/${item.id}`).set(auth(s.token))).status).toBe(404);
  });

  it('rejects viewers, non-members and other locations', async () => {
    const s = await setupLoose(app);
    const item = await addLoose(app, s.token, s.loc.id, { name: 'Tape' });
    const viewer = await addMember(app, s.token, s.loc.id, 'viewer');
    const stranger = await createTestUser(app);
    const url = `/api/locations/${s.loc.id}/items/${item.id}`;
    expect((await request(app).put(url).set(auth(viewer.token)).send({ name: 'x' })).status).toBe(403);
    expect((await request(app).delete(url).set(auth(viewer.token))).status).toBe(403);
    expect((await request(app).put(url).set(auth(stranger.token)).send({ name: 'x' })).status).toBe(403);
    // the item id under a different location the owner belongs to is not found
    const other = await createTestLocation(app, s.token, 'Other');
    expect((await request(app).put(`/api/locations/${other.id}/items/${item.id}`).set(auth(s.token)).send({ name: 'x' })).status).toBe(404);
    expect((await itemRow(item.id)).location_id).toBe(s.loc.id);
  });

  it('refuses box items with a pointer to the bin route', async () => {
    const s = await setupLoose(app);
    const row = await request(app).get(`/api/bins/${s.bin.id}`).set(auth(s.token));
    const boxItemId = row.body.items[0].id;
    const put = await request(app).put(`/api/locations/${s.loc.id}/items/${boxItemId}`).set(auth(s.token)).send({ name: 'x' });
    expect(put.status).toBe(422);
    expect(put.body.message).toContain('/api/bins');
    expect((await request(app).delete(`/api/locations/${s.loc.id}/items/${boxItemId}`).set(auth(s.token))).status).toBe(422);
  });
});

describe('GET /api/items with loose items', () => {
  it('lists box, area and unassigned items; box rows keep their shape', async () => {
    const s = await setupLoose(app);
    await addLoose(app, s.token, s.loc.id, { name: 'Tape', areaId: s.areaA.id });
    await addLoose(app, s.token, s.loc.id, { name: 'Key' });

    const res = await listItems(app, s.token, s.loc.id);
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(4);
    const byName = Object.fromEntries((res.body.results as Array<Record<string, unknown>>).map((r) => [r.name, r]));
    expect(byName.Hammer).toMatchObject({ bin_id: s.bin.id, bin_name: 'Toolbox', area_id: null, area_name: null });
    expect(byName.Tape).toMatchObject({ bin_id: null, bin_name: null, bin_icon: null, bin_color: null, area_id: s.areaA.id, area_name: 'Garage' });
    expect(byName.Key).toMatchObject({ bin_id: null, area_id: null, area_name: null });
  });

  it('filters by area_id, areaId, unassigned and loose', async () => {
    const s = await setupLoose(app);
    await addLoose(app, s.token, s.loc.id, { name: 'Tape', areaId: s.areaA.id });
    await addLoose(app, s.token, s.loc.id, { name: 'Ladder', areaId: s.areaB.id });
    await addLoose(app, s.token, s.loc.id, { name: 'Key' });

    expect(await itemNames(app, s.token, s.loc.id, `area_id=${s.areaA.id}`)).toEqual(['Tape']);
    expect(await itemNames(app, s.token, s.loc.id, `areaId=${s.areaB.id}`)).toEqual(['Ladder']);
    // The box is unassigned, so its items count as having no area; loose=true narrows to bin-less items
    expect(await itemNames(app, s.token, s.loc.id, 'unassigned=true')).toEqual(['Hammer', 'Key', 'Saw']);
    expect(await itemNames(app, s.token, s.loc.id, 'unassigned=true&loose=true')).toEqual(['Key']);
    expect(await itemNames(app, s.token, s.loc.id, 'loose=true')).toEqual(['Key', 'Ladder', 'Tape']);
    expect((await listItems(app, s.token, s.loc.id, `area_id=${s.areaA.id}&unassigned=true`)).status).toBe(422);
  });

  it('area filter includes items in boxes located in that area', async () => {
    const s = await setupLoose(app);
    await request(app).put(`/api/bins/${s.bin.id}`).set(auth(s.token)).send({ areaId: s.areaA.id });
    await addLoose(app, s.token, s.loc.id, { name: 'Tape', areaId: s.areaA.id });
    expect(await itemNames(app, s.token, s.loc.id, `area_id=${s.areaA.id}`)).toEqual(['Hammer', 'Saw', 'Tape']);
    expect(await itemNames(app, s.token, s.loc.id, `area_id=${s.areaA.id}&loose=true`)).toEqual(['Tape']);
  });

  it('searches loose items by name and area name, with matching count and pagination', async () => {
    const s = await setupLoose(app);
    await addLoose(app, s.token, s.loc.id, { name: 'Tape', areaId: s.areaA.id });
    await addLoose(app, s.token, s.loc.id, { name: 'Tapestry' });
    const res = await listItems(app, s.token, s.loc.id, 'q=Tape');
    expect(res.body.count).toBe(res.body.results.length);
    expect((res.body.results as Array<{ name: string }>).map((r) => r.name)).toEqual(expect.arrayContaining(['Tape']));
    const byArea = await listItems(app, s.token, s.loc.id, 'q=Garage');
    expect((byArea.body.results as Array<{ name: string }>).map((r) => r.name)).toContain('Tape');

    const page = await listItems(app, s.token, s.loc.id, 'limit=2&offset=0');
    expect(page.body.count).toBe(4);
    expect(page.body.results).toHaveLength(2);
  });

  it('sorts by location (box or area name) and quantity with loose items present', async () => {
    const s = await setupLoose(app);
    await addLoose(app, s.token, s.loc.id, { name: 'Tape', quantity: 9, areaId: s.areaA.id });
    const res = await listItems(app, s.token, s.loc.id, 'sort=bin');
    expect(res.status).toBe(200);
    expect(res.body.results.map((r: { name: string }) => r.name)).toEqual(['Tape', 'Hammer', 'Saw']);
    const q = await listItems(app, s.token, s.loc.id, 'sort=qty&sort_dir=desc');
    expect(q.body.results[0].name).toBe('Tape');
  });

  it('hides box items of private boxes of others but not loose items', async () => {
    const s = await setupLoose(app);
    const member = await addMember(app, s.token, s.loc.id, 'member');
    const priv = await request(app).post('/api/bins').set(auth(member.token))
      .send({ locationId: s.loc.id, name: 'Secret', visibility: 'private' });
    expect(priv.status).toBe(201);
    await addBinItems(app, member.token, priv.body.id, ['Diary']);
    await addLoose(app, member.token, s.loc.id, { name: 'Shared tape' });
    const seen = await itemNames(app, s.token, s.loc.id);
    expect(seen).toContain('Shared tape');
    expect(seen).not.toContain('Diary');
    expect(await itemNames(app, member.token, s.loc.id)).toContain('Diary');
  });

  it('a deleted area leaves its items unassigned and still listed', async () => {
    const s = await setupLoose(app);
    const item = await addLoose(app, s.token, s.loc.id, { name: 'Tape', areaId: s.areaA.id });
    const del = await request(app).delete(`/api/locations/${s.loc.id}/areas/${s.areaA.id}`).set(auth(s.token));
    expect(del.status).toBe(200);
    expect(await itemRow(item.id)).toMatchObject({ bin_id: null, area_id: null });
    expect(await itemNames(app, s.token, s.loc.id, 'unassigned=true&loose=true')).toEqual(['Tape']);
  });

  it('rejects non-members', async () => {
    const s = await setupLoose(app);
    const stranger = await createTestUser(app);
    expect((await listItems(app, stranger.token, s.loc.id)).status).toBe(403);
  });
});
