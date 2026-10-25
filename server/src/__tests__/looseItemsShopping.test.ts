import type { Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { query } from '../db.js';
import { createApp } from '../index.js';
import { createTestArea, createTestLocation } from './helpers.js';
import { addMember, auth, setupLoose } from './looseItemsHelpers.js';

let app: Express;
beforeEach(() => {
  app = createApp();
});

const add = (token: string, loc: string, body: object) =>
  request(app).post(`/api/locations/${loc}/shopping-list`).set(auth(token)).send(body);

describe('shopping list with area origins', () => {
  it('adds an entry with an area origin and lists it with area fields', async () => {
    const s = await setupLoose(app);
    const res = await add(s.token, s.loc.id, { name: 'Tape', originAreaId: s.areaA.id });
    expect(res.status).toBe(201);
    expect(res.body.entry).toMatchObject({
      name: 'Tape', origin_bin_id: null, origin_bin_name: null, origin_bin_trashed: false,
      origin_area_id: s.areaA.id, origin_area_name: 'Garage',
    });

    const binEntry = await add(s.token, s.loc.id, { name: 'Nails', originBinId: s.bin.id });
    expect(binEntry.body.entry).toMatchObject({ origin_bin_id: s.bin.id, origin_area_id: null, origin_area_name: null });

    const list = await request(app).get(`/api/locations/${s.loc.id}/shopping-list`).set(auth(s.token));
    expect(list.body.count).toBe(2);
    expect(list.body.results.find((r: { name: string }) => r.name === 'Tape').origin_area_name).toBe('Garage');
  });

  it('validates the area origin', async () => {
    const s = await setupLoose(app);
    const other = await createTestLocation(app, s.token, 'Other');
    const foreign = await createTestArea(app, s.token, other.id, 'Foreign');
    expect((await add(s.token, s.loc.id, { name: 'x', originAreaId: foreign.id })).status).toBe(422);
    expect((await add(s.token, s.loc.id, { name: 'x', originAreaId: s.areaA.id, originBinId: s.bin.id })).status).toBe(422);
    expect((await add(s.token, s.loc.id, { name: 'x', originAreaId: 5 })).status).toBe(422);
  });

  it('shows area-origin entries to every member, while private bin origins stay hidden', async () => {
    const s = await setupLoose(app);
    const member = await addMember(app, s.token, s.loc.id, 'member');
    const priv = await request(app).post('/api/bins').set(auth(member.token))
      .send({ locationId: s.loc.id, name: 'Secret', visibility: 'private' });
    await add(member.token, s.loc.id, { name: 'Secret thing', originBinId: priv.body.id });
    await add(member.token, s.loc.id, { name: 'Area thing', originAreaId: s.areaA.id });
    const list = await request(app).get(`/api/locations/${s.loc.id}/shopping-list`).set(auth(s.token));
    expect(list.body.results.map((r: { name: string }) => r.name)).toEqual(['Area thing']);
  });

  it('viewers cannot add', async () => {
    const s = await setupLoose(app);
    const viewer = await addMember(app, s.token, s.loc.id, 'viewer');
    expect((await add(viewer.token, s.loc.id, { name: 'x', originAreaId: s.areaA.id })).status).toBe(403);
  });

  it('purchase re-adds the item to the origin area as a loose item', async () => {
    const s = await setupLoose(app);
    const entry = (await add(s.token, s.loc.id, { name: 'Tape', originAreaId: s.areaA.id })).body.entry;
    const res = await request(app).post(`/api/shopping-list/${entry.id}/purchase`).set(auth(s.token));
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);
    expect(res.body.restored).toMatchObject({ binId: null, areaId: s.areaA.id, name: 'Tape' });
    const row = await query<{ bin_id: string | null; area_id: string | null; location_id: string; name: string }>(
      'SELECT bin_id, area_id, location_id, name FROM bin_items WHERE id = $1', [res.body.restored.itemId]);
    expect(row.rows[0]).toMatchObject({ bin_id: null, area_id: s.areaA.id, location_id: s.loc.id, name: 'Tape' });
    const gone = await query('SELECT id FROM shopping_list_items WHERE id = $1', [entry.id]);
    expect(gone.rows).toHaveLength(0);
    const items = await request(app).get(`/api/items?location_id=${s.loc.id}&area_id=${s.areaA.id}`).set(auth(s.token));
    expect(items.body.results.map((r: { name: string }) => r.name)).toEqual(['Tape']);
  });

  it('purchase re-adds to the origin bin with location_id', async () => {
    const s = await setupLoose(app);
    const entry = (await add(s.token, s.loc.id, { name: 'Nails', originBinId: s.bin.id })).body.entry;
    const res = await request(app).post(`/api/shopping-list/${entry.id}/purchase`).set(auth(s.token));
    expect(res.body.restored).toMatchObject({ binId: s.bin.id, name: 'Nails' });
    const row = await query<{ location_id: string }>('SELECT location_id FROM bin_items WHERE id = $1', [res.body.restored.itemId]);
    expect(row.rows[0].location_id).toBe(s.loc.id);
  });

  it('purchase puts the item in the unassigned pool when the entry names an area outside the location', async () => {
    const s = await setupLoose(app);
    const other = await createTestLocation(app, s.token, 'Other');
    const foreign = await createTestArea(app, s.token, other.id, 'Foreign');
    const entry = (await add(s.token, s.loc.id, { name: 'Tape', originAreaId: s.areaA.id })).body.entry;
    // Simulate a stale reference (the API itself never allows this)
    await query('UPDATE shopping_list_items SET origin_area_id = $1 WHERE id = $2', [foreign.id, entry.id]);
    const res = await request(app).post(`/api/shopping-list/${entry.id}/purchase`).set(auth(s.token));
    expect(res.status).toBe(200);
    expect(res.body.restored).toMatchObject({ binId: null, areaId: null, name: 'Tape' });
    const row = await query<{ bin_id: string | null; area_id: string | null; location_id: string }>(
      'SELECT bin_id, area_id, location_id FROM bin_items WHERE id = $1', [res.body.restored.itemId]);
    expect(row.rows[0]).toMatchObject({ bin_id: null, area_id: null, location_id: s.loc.id });
  });

  it('deleting the area first turns the entry into a plain one: purchase just removes it', async () => {
    const s = await setupLoose(app);
    const entry = (await add(s.token, s.loc.id, { name: 'Tape', originAreaId: s.areaA.id })).body.entry;
    await request(app).delete(`/api/locations/${s.loc.id}/areas/${s.areaA.id}`).set(auth(s.token));
    const res = await request(app).post(`/api/shopping-list/${entry.id}/purchase`).set(auth(s.token));
    expect(res.status).toBe(200);
    expect(res.body.restored).toBeNull();
  });

  it('bin-nested bulk add returns the area fields too', async () => {
    const s = await setupLoose(app);
    const res = await request(app).post(`/api/bins/${s.bin.id}/shopping-list`).set(auth(s.token)).send({ names: ['Glue'] });
    expect(res.status).toBe(201);
    expect(res.body.entries[0]).toMatchObject({ origin_bin_id: s.bin.id, origin_area_id: null, origin_area_name: null });
  });
});
