import type { Express } from 'express';
import request from 'supertest';
import { query } from '../db.js';
import { createTestArea, createTestBin, createTestLocation, createTestUser, joinTestLocation } from './helpers.js';

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Owner + location + two areas + one box with two items. */
export async function setupLoose(app: Express) {
  const owner = await createTestUser(app);
  const loc = await createTestLocation(app, owner.token);
  const areaA = await createTestArea(app, owner.token, loc.id, 'Garage');
  const areaB = await createTestArea(app, owner.token, loc.id, 'Attic');
  const bin = await createTestBin(app, owner.token, loc.id, { name: 'Toolbox' });
  await addBinItems(app, owner.token, bin.id, ['Hammer', 'Saw']);
  return { token: owner.token, userId: owner.user.id, loc, areaA, areaB, bin };
}

/** Add box items through POST /api/bins/:id/items (independent of the bin create path). */
export async function addBinItems(app: Express, token: string, binId: string, names: string[]) {
  const res = await request(app).post(`/api/bins/${binId}/items`).set(auth(token)).send({ items: names });
  if (res.status !== 201) throw new Error(`addBinItems failed ${res.status} ${JSON.stringify(res.body)}`);
}

export async function addLoose(
  app: Express,
  token: string,
  locationId: string,
  body: { name: string; quantity?: number | null; areaId?: string },
) {
  const res = await request(app).post(`/api/locations/${locationId}/items`).set(auth(token)).send(body);
  if (res.status !== 201) throw new Error(`addLoose failed ${res.status} ${JSON.stringify(res.body)}`);
  return res.body as { id: string; name: string; quantity: number | null; area_id: string | null; bin_id: string | null };
}

export async function addMember(app: Express, ownerToken: string, locationId: string, role: 'member' | 'viewer') {
  void ownerToken;
  const u = await createTestUser(app);
  const invite = await query<{ invite_code: string }>('SELECT invite_code FROM locations WHERE id = $1', [locationId]);
  await joinTestLocation(app, u.token, invite.rows[0].invite_code);
  if (role === 'viewer') {
    await query('UPDATE location_members SET role = $1 WHERE location_id = $2 AND user_id = $3', ['viewer', locationId, u.user.id]);
  }
  return u;
}

export async function listItems(app: Express, token: string, locationId: string, qs = '') {
  const res = await request(app).get(`/api/items?location_id=${locationId}${qs ? `&${qs}` : ''}`).set(auth(token));
  return res;
}

export async function itemNames(app: Express, token: string, locationId: string, qs = '') {
  const res = await listItems(app, token, locationId, qs);
  return (res.body.results as Array<{ name: string }>).map((r) => r.name).sort();
}

export async function binItemId(app: Express, token: string, binId: string, name: string): Promise<string> {
  const res = await request(app).get(`/api/bins/${binId}`).set(auth(token));
  return (res.body.items as Array<{ id: string; name: string }>).find((i) => i.name === name)!.id;
}

export async function itemRow(id: string) {
  const r = await query<{ bin_id: string | null; area_id: string | null; location_id: string; deleted_at: string | null; quantity: number | null }>(
    'SELECT bin_id, area_id, location_id, deleted_at, quantity FROM bin_items WHERE id = $1',
    [id],
  );
  return r.rows[0];
}
