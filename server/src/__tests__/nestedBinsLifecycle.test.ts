import fs from 'node:fs';
import path from 'node:path';
import type { Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { query } from '../db.js';
import { createApp } from '../index.js';
import { purgeExpiredTrash } from '../lib/trashPurge.js';
import { PHOTO_STORAGE_PATH } from '../lib/uploadConfig.js';
import { createTestArea, createTestLocation, createTestUser, expectNoHierarchyViolations, TEST_PNG } from './helpers.js';

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
const del = (id: string) => request(app).delete(`/api/bins/${id}`).set(auth());
const restore = (id: string) => request(app).post(`/api/bins/${id}/restore`).set(auth());
const get = (id: string) => request(app).get(`/api/bins/${id}`).set(auth());
const mkPair = async () => {
  const parent = (await post({ locationId, name: 'Parent' })).body;
  const child = (await post({ locationId, name: 'Child', parentBinId: parent.id })).body;
  return { parent, child };
};
const deletedAt = async (id: string) => (await query('SELECT deleted_at FROM bins WHERE id = $1', [id])).rows[0]?.deleted_at as string | null;
const uploadPhoto = async (binId: string) => {
  const res = await request(app).post(`/api/bins/${binId}/photos`).set(auth()).attach('photo', TEST_PNG, 'test.png');
  expect(res.status).toBe(201);
  const row = await query('SELECT storage_path FROM photos WHERE bin_id = $1', [binId]);
  return path.join(PHOTO_STORAGE_PATH, row.rows[0].storage_path as string);
};

describe('soft delete and restore', () => {
  it('trashing a parent trashes its children with the same timestamp', async () => {
    const { parent, child } = await mkPair();
    expect((await del(parent.id)).status).toBe(200);
    const p = await deletedAt(parent.id);
    expect(p).toBeTruthy();
    expect(await deletedAt(child.id)).toBe(p);
    expect((await get(child.id)).status).toBe(404);

    const trash = await request(app).get('/api/bins/trash').query({ location_id: locationId }).set(auth());
    expect(trash.body.results.map((b: { id: string }) => b.id).sort()).toEqual([parent.id, child.id].sort());
    const trashedChild = trash.body.results.find((b: { id: string }) => b.id === child.id);
    expect(trashedChild.parent_bin_id).toBe(parent.id);
    expect(trashedChild.parent_bin_name).toBe('Parent');
    await expectNoHierarchyViolations();
  });

  it('restoring the parent restores the children trashed with it', async () => {
    const { parent, child } = await mkPair();
    await del(parent.id);
    expect((await restore(parent.id)).status).toBe(200);
    expect((await get(child.id)).status).toBe(200);
    expect((await get(parent.id)).body.child_count).toBe(1);
    await expectNoHierarchyViolations();
  });

  it('a child trashed earlier on its own stays trashed when the parent is restored', async () => {
    const { parent, child } = await mkPair();
    const sibling = (await post({ locationId, name: 'Sibling', parentBinId: parent.id })).body;
    await del(child.id);
    await query("UPDATE bins SET deleted_at = datetime('now', '-1 hour') WHERE id = $1", [child.id]);
    await del(parent.id);
    expect(await deletedAt(sibling.id)).toBe(await deletedAt(parent.id));

    expect((await restore(parent.id)).status).toBe(200);
    expect((await get(sibling.id)).status).toBe(200);
    expect((await get(child.id)).status).toBe(404);
    expect(await deletedAt(child.id)).toBeTruthy();
    await expectNoHierarchyViolations();
  });

  it('a child cannot be restored while its parent is trashed', async () => {
    const { parent, child } = await mkPair();
    await del(parent.id);
    const res = await restore(child.id);
    expect(res.status).toBe(422);
    expect(await deletedAt(child.id)).toBeTruthy();
    await restore(parent.id);
    await expectNoHierarchyViolations();
  });

  it('a child can be trashed and restored on its own while the parent lives', async () => {
    const { parent, child } = await mkPair();
    await del(child.id);
    expect((await get(parent.id)).body.child_count).toBe(0);
    expect((await restore(child.id)).status).toBe(200);
    expect((await get(parent.id)).body.child_count).toBe(1);
    await expectNoHierarchyViolations();
  });

  it('a child restored after its parent moved area follows the parent', async () => {
    const area = await createTestArea(app, token, locationId, 'A');
    const { parent, child } = await mkPair();
    await del(child.id);
    await request(app).put(`/api/bins/${parent.id}`).set(auth()).send({ areaId: area.id });
    await restore(child.id);
    expect((await get(child.id)).body.area_id).toBe(area.id);
    await expectNoHierarchyViolations();
  });
});

describe('permanent delete', () => {
  it('removes children rows and deletes their photo files', async () => {
    const { parent, child } = await mkPair();
    const parentFile = await uploadPhoto(parent.id);
    const childFile = await uploadPhoto(child.id);
    expect(fs.existsSync(parentFile)).toBe(true);
    expect(fs.existsSync(childFile)).toBe(true);

    await del(parent.id);
    const res = await request(app).delete(`/api/bins/${parent.id}/permanent`).set(auth());
    expect(res.status).toBe(200);

    expect((await query('SELECT id FROM bins WHERE id IN ($1, $2)', [parent.id, child.id])).rows).toHaveLength(0);
    expect((await query('SELECT id FROM photos WHERE bin_id IN ($1, $2)', [parent.id, child.id])).rows).toHaveLength(0);
    expect(fs.existsSync(parentFile)).toBe(false);
    expect(fs.existsSync(childFile)).toBe(false);
    await expectNoHierarchyViolations();
  });
});

describe('trash purge job', () => {
  it('purges expired parents together with their children and files', async () => {
    const { parent, child } = await mkPair();
    const keep = (await post({ locationId, name: 'Recent' })).body;
    const childFile = await uploadPhoto(child.id);
    await del(parent.id);
    await del(keep.id);
    await query("UPDATE bins SET deleted_at = datetime('now', '-400 days') WHERE id IN ($1, $2)", [parent.id, child.id]);

    await purgeExpiredTrash(locationId);

    expect((await query('SELECT id FROM bins WHERE id IN ($1, $2)', [parent.id, child.id])).rows).toHaveLength(0);
    expect(fs.existsSync(childFile)).toBe(false);
    expect(await deletedAt(keep.id)).toBeTruthy();
    await expectNoHierarchyViolations();
  });

  it('purges children even if only the parent row is listed as expired', async () => {
    const { parent, child } = await mkPair();
    const childFile = await uploadPhoto(child.id);
    await del(parent.id);
    // child kept a recent timestamp, parent is expired: the FK cascade still removes the child, files must go too
    await query("UPDATE bins SET deleted_at = datetime('now', '-400 days') WHERE id = $1", [parent.id]);
    await purgeExpiredTrash(locationId);
    expect((await query('SELECT id FROM bins WHERE id = $1', [child.id])).rows).toHaveLength(0);
    expect(fs.existsSync(childFile)).toBe(false);
  });
});
