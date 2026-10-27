import type { Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { generateUuid, query } from '../db.js';
import { createApp } from '../index.js';
import {
  createTestArea,
  createTestBin,
  createTestLocation,
  createTestUser,
  expectNoHierarchyViolations,
  setParentBinByDb,
} from './helpers.js';

let app: Express;

beforeEach(() => {
  app = createApp();
});

/** Insert a bin item directly. Loose items have binId null and an areaId; unassigned items have neither. */
async function addItem(
  locationId: string,
  target: { binId?: string; areaId?: string; deleted?: boolean },
  name: string,
): Promise<void> {
  await query(
    'INSERT INTO bin_items (id, bin_id, area_id, location_id, name, position, deleted_at) VALUES ($1, $2, $3, $4, $5, 0, $6)',
    [
      generateUuid(),
      target.binId ?? null,
      target.areaId ?? null,
      locationId,
      name,
      target.deleted ? new Date().toISOString() : null,
    ],
  );
}

async function createBinInArea(token: string, locationId: string, name: string, areaId?: string) {
  const res = await request(app)
    .post('/api/bins')
    .set('Authorization', `Bearer ${token}`)
    .send({ locationId, name, areaId });
  expect(res.status).toBe(201);
  return res.body as { id: string };
}

describe('GET /api/locations/:id/stats with nested boxes and loose items', () => {
  it('counts box items by location, loose items separately, and excludes trashed boxes', async () => {
    const { token } = await createTestUser(app);
    const location = await createTestLocation(app, token);
    const garage = await createTestArea(app, token, location.id, 'Garage');

    const shelf = await createTestBin(app, token, location.id, { name: 'Shelf' });
    await addItem(location.id, { binId: shelf.id }, 'Screws');
    await addItem(location.id, { binId: shelf.id }, 'Nails');
    await addItem(location.id, { binId: shelf.id, deleted: true }, 'Old nails');

    // Child box inside the shelf: live, its item counts.
    const child = await createTestBin(app, token, location.id, { name: 'Child' });
    await setParentBinByDb(child.id, shelf.id);
    await addItem(location.id, { binId: child.id }, 'Washers');

    // Child box that is trashed: its item must not count.
    const trashedChild = await createTestBin(app, token, location.id, { name: 'Trashed child' });
    await setParentBinByDb(trashedChild.id, shelf.id);
    await addItem(location.id, { binId: trashedChild.id }, 'Bolts');
    await query('UPDATE bins SET deleted_at = $1 WHERE id = $2', [new Date().toISOString(), trashedChild.id]);

    // Top-level box that is trashed through the API: its items must not count.
    const gone = await createTestBin(app, token, location.id, { name: 'Gone' });
    await addItem(location.id, { binId: gone.id }, 'Rags');
    await addItem(location.id, { binId: gone.id }, 'Tape');
    await request(app).delete(`/api/bins/${gone.id}`).set('Authorization', `Bearer ${token}`);

    // Loose items in an area, one deleted, plus one unassigned item.
    await addItem(location.id, { areaId: garage.id }, 'Ladder');
    await addItem(location.id, { areaId: garage.id }, 'Rope');
    await addItem(location.id, { areaId: garage.id, deleted: true }, 'Broken rope');
    await addItem(location.id, {}, 'Spare keys');

    const res = await request(app)
      .get(`/api/locations/${location.id}/stats`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    // Live boxes: Shelf and Child. Items: Screws, Nails, Washers (boxes) + Ladder, Rope (loose) + Spare keys (unassigned).
    expect(Number(res.body.total_bins)).toBe(2);
    expect(Number(res.body.total_items)).toBe(6);
    expect(Number(res.body.loose_item_count)).toBe(3);
    expect(Number(res.body.total_areas)).toBe(1);
    await expectNoHierarchyViolations(location.id);
  });

  it('keeps the empty-bin count unchanged by loose items', async () => {
    const { token } = await createTestUser(app);
    const location = await createTestLocation(app, token);
    const garage = await createTestArea(app, token, location.id, 'Garage');
    const empty = await createBinInArea(token, location.id, 'Empty box');
    await addItem(location.id, { areaId: garage.id }, 'Loose item');

    const res = await request(app)
      .get(`/api/locations/${location.id}/stats`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(empty.id).toBeTruthy();
    expect(Number(res.body.total_items)).toBe(1);
    expect(Number(res.body.loose_item_count)).toBe(1);
  });
});

describe('GET /api/locations/:locationId/areas item counts', () => {
  it('counts every item an area holds (loose and in its boxes) per area and across the subtree', async () => {
    const { token } = await createTestUser(app);
    const location = await createTestLocation(app, token);
    const garage = await createTestArea(app, token, location.id, 'Garage');
    const kitchen = await createTestArea(app, token, location.id, 'Kitchen');
    const workbenchRes = await request(app)
      .post(`/api/locations/${location.id}/areas`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Workbench', parent_id: garage.id });
    expect(workbenchRes.status).toBe(201);
    const workbench = workbenchRes.body as { id: string };

    await addItem(location.id, { areaId: garage.id }, 'Extension cord');
    await addItem(location.id, { areaId: garage.id }, 'Shop vac');
    await addItem(location.id, { areaId: garage.id, deleted: true }, 'Old cord');
    await addItem(location.id, { areaId: workbench.id }, 'Drill press');
    await addItem(location.id, { areaId: kitchen.id }, 'Spare batteries');

    // A box in the workbench area: its items count toward the area too, but they are not loose items.
    const box = await createBinInArea(token, location.id, 'Tool Chest', workbench.id);
    await addItem(location.id, { binId: box.id }, 'Ratchet');

    const res = await request(app)
      .get(`/api/locations/${location.id}/areas`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const byName = Object.fromEntries((res.body.results as Array<Record<string, unknown>>).map((a) => [a.name, a]));
    // Ordering by name is unchanged.
    expect((res.body.results as Array<{ name: string }>).map((a) => a.name)).toEqual(['Garage', 'Kitchen', 'Workbench']);

    expect(Number(byName.Garage.item_count)).toBe(2);
    expect(Number(byName.Garage.loose_item_count)).toBe(2);
    expect(Number(byName.Garage.descendant_item_count)).toBe(4); // its own 2 + Workbench's loose + boxed item
    expect(Number(byName.Garage.bin_count)).toBe(0);
    expect(Number(byName.Garage.descendant_bin_count)).toBe(1);

    expect(Number(byName.Workbench.item_count)).toBe(2); // Drill press (loose) + Ratchet (in Tool Chest)
    expect(Number(byName.Workbench.loose_item_count)).toBe(1);
    expect(Number(byName.Workbench.descendant_item_count)).toBe(2);
    expect(Number(byName.Workbench.bin_count)).toBe(1);

    expect(Number(byName.Kitchen.item_count)).toBe(1);
    expect(Number(byName.Kitchen.loose_item_count)).toBe(1);
    expect(Number(byName.Kitchen.descendant_item_count)).toBe(1);
  });

  it('counts items in child boxes toward the area, but not items in trashed boxes or other people\'s private boxes', async () => {
    const owner = await createTestUser(app);
    const location = await createTestLocation(app, owner.token);
    const garage = await createTestArea(app, owner.token, location.id, 'Garage');

    const parent = await createBinInArea(owner.token, location.id, 'Toolbox', garage.id);
    const child = (await request(app).post('/api/bins').set('Authorization', `Bearer ${owner.token}`)
      .send({ locationId: location.id, name: 'Drill bits', parentBinId: parent.id })).body as { id: string };
    await addItem(location.id, { binId: parent.id }, 'Hammer');
    await addItem(location.id, { binId: child.id }, 'Masonry bit');
    await addItem(location.id, { areaId: garage.id }, 'Ladder');

    // a trashed box: its items are gone from the count
    const trashed = await createBinInArea(owner.token, location.id, 'Old crate', garage.id);
    await addItem(location.id, { binId: trashed.id }, 'Rusty nails');
    await request(app).delete(`/api/bins/${trashed.id}`).set('Authorization', `Bearer ${owner.token}`);

    // a private box of the owner, and a second member who must not see its items counted
    const secret = (await request(app).post('/api/bins').set('Authorization', `Bearer ${owner.token}`)
      .send({ locationId: location.id, name: 'Private', areaId: garage.id, visibility: 'private' })).body as { id: string };
    await addItem(location.id, { binId: secret.id }, 'Diary');

    const other = await createTestUser(app);
    const join = await request(app).post('/api/locations/join').set('Authorization', `Bearer ${other.token}`)
      .send({ inviteCode: (await query<{ invite_code: string }>('SELECT invite_code FROM locations WHERE id = $1', [location.id])).rows[0].invite_code });
    expect(join.status).toBeLessThan(300);

    const garageRow = async (token: string) => {
      const res = await request(app).get(`/api/locations/${location.id}/areas`).set('Authorization', `Bearer ${token}`);
      return (res.body.results as Array<Record<string, unknown>>).find((a) => a.name === 'Garage') as Record<string, unknown>;
    };
    // owner sees Hammer, Masonry bit (child box), Ladder (loose) and Diary (own private box)
    expect(Number((await garageRow(owner.token)).item_count)).toBe(4);
    // the other member sees everything but the private box's Diary
    expect(Number((await garageRow(other.token)).item_count)).toBe(3);
    await expectNoHierarchyViolations();
  });

  it('counts unassigned items: loose ones with no area, and items in boxes that have no area', async () => {
    const { token } = await createTestUser(app);
    const location = await createTestLocation(app, token);
    const garage = await createTestArea(app, token, location.id, 'Garage');
    const looseBox = await createBinInArea(token, location.id, 'No area box');
    const garageBox = await createBinInArea(token, location.id, 'Garage box', garage.id);

    await addItem(location.id, {}, 'Floating item'); // neither box nor area
    await addItem(location.id, { binId: looseBox.id }, 'In area-less box');
    await addItem(location.id, { binId: garageBox.id }, 'In garage box'); // has an area: not counted
    await addItem(location.id, { areaId: garage.id }, 'Loose in garage'); // has an area: not counted
    await addItem(location.id, { deleted: true }, 'Deleted floating'); // trashed: not counted

    const res = await request(app).get(`/api/locations/${location.id}/areas`).set('Authorization', `Bearer ${token}`);
    expect(Number(res.body.unassigned_item_count)).toBe(2);
    expect(Number(res.body.unassigned_count)).toBe(1); // the area-less box
  });

  it('reports a deleted area\'s loose items as unassigned, not on the parent', async () => {
    const { token } = await createTestUser(app);
    const location = await createTestLocation(app, token);
    const garage = await createTestArea(app, token, location.id, 'Garage');
    const shed = await request(app)
      .post(`/api/locations/${location.id}/areas`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Shed', parent_id: garage.id });
    await addItem(location.id, { areaId: shed.body.id }, 'Mower');

    await request(app)
      .delete(`/api/locations/${location.id}/areas/${shed.body.id}`)
      .set('Authorization', `Bearer ${token}`);

    const res = await request(app)
      .get(`/api/locations/${location.id}/areas`)
      .set('Authorization', `Bearer ${token}`);
    const garageRow = (res.body.results as Array<{ name: string; item_count: unknown; descendant_item_count: unknown }>)
      .find((a) => a.name === 'Garage');
    expect(Number(garageRow?.item_count)).toBe(0);
    expect(Number(garageRow?.descendant_item_count)).toBe(0);

    const orphan = await query<{ area_id: string | null }>('SELECT area_id FROM bin_items WHERE name = $1', ['Mower']);
    expect(orphan.rows[0].area_id).toBeNull();
  });
  it('leaves loose items of a deleted area and of its sub-areas unassigned', async () => {
    const { token } = await createTestUser(app);
    const location = await createTestLocation(app, token);
    const garage = await createTestArea(app, token, location.id, 'Garage');
    const shed = await request(app)
      .post(`/api/locations/${location.id}/areas`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Shed', parent_id: garage.id });
    await addItem(location.id, { areaId: garage.id }, 'Ladder');
    await addItem(location.id, { areaId: shed.body.id }, 'Mower');

    const del = await request(app)
      .delete(`/api/locations/${location.id}/areas/${garage.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(200);

    const rows = await query<{ name: string; area_id: string | null }>('SELECT name, area_id FROM bin_items ORDER BY name');
    expect(rows.rows).toEqual([
      { name: 'Ladder', area_id: null },
      { name: 'Mower', area_id: null },
    ]);
    const res = await request(app).get(`/api/locations/${location.id}/areas`).set('Authorization', `Bearer ${token}`);
    expect(res.body.unassigned_item_count).toBe(2);
  });
});
