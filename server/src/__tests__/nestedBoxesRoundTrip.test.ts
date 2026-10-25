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

describe('export then import with nested boxes', () => {
  it('round-trips box items and nested boxes into another location with location_id set', async () => {
    const { token } = await createTestUser(app);
    const source = await createTestLocation(app, token, 'Source');
    const target = await createTestLocation(app, token, 'Target');
    const garage = await createTestArea(app, token, source.id, 'Garage');

    const parent = await createTestBin(app, token, source.id, { name: 'Tool Chest' });
    await query('UPDATE bins SET area_id = $1 WHERE id = $2', [garage.id, parent.id]);
    await query(
      'INSERT INTO bin_items (id, bin_id, location_id, name, position) VALUES ($1, $2, $3, $4, 0), ($5, $2, $3, $6, 1)',
      [generateUuid(), parent.id, source.id, 'Ratchet', generateUuid(), 'Hex keys'],
    );

    const child = await createTestBin(app, token, source.id, { name: 'Drill Bits' });
    await setParentBinByDb(child.id, parent.id);
    await query(
      'INSERT INTO bin_items (id, bin_id, location_id, name, position) VALUES ($1, $2, $3, $4, 0)',
      [generateUuid(), child.id, source.id, 'Spade bits'],
    );

    const exported = await request(app)
      .get(`/api/locations/${source.id}/export`)
      .set('Authorization', `Bearer ${token}`);
    expect(exported.status).toBe(200);
    expect(exported.body.bins.map((b: { name: string }) => b.name).sort()).toEqual(['Drill Bits', 'Tool Chest']);

    const imported = await request(app)
      .post(`/api/locations/${target.id}/import`)
      .set('Authorization', `Bearer ${token}`)
      .send({ bins: exported.body.bins, areas: exported.body.areas, mode: 'merge' });
    expect(imported.status).toBe(200);
    expect(imported.body.binsImported).toBe(2);

    const items = await query<{ name: string; location_id: string; bin_id: string | null }>(
      `SELECT bi.name, bi.location_id, bi.bin_id FROM bin_items bi
       JOIN bins b ON b.id = bi.bin_id WHERE b.location_id = $1 ORDER BY bi.name`,
      [target.id],
    );
    expect(items.rows.map((r) => r.name)).toEqual(['Hex keys', 'Ratchet', 'Spade bits']);
    expect(items.rows.every((r) => r.location_id === target.id)).toBe(true);

    await expectNoHierarchyViolations(target.id);
  });
});
