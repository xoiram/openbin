import type { Express } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { query } from '../db.js';
import { createApp } from '../index.js';
import { config } from '../lib/config.js';
import { CURRENT_PRIVACY_VERSION, CURRENT_TOS_VERSION } from '../lib/legalVersions.js';
import { createTestLocation, createTestUser, expectNoHierarchyViolations } from './helpers.js';

// The real config object is frozen; swap in a mutable copy so a test can switch the cloud plan rules on.
vi.mock('../lib/config.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../lib/config.js')>();
  return { ...mod, config: { ...mod.config } };
});

// Restoring a parent brings its trashed children back with it, so the plan's bin limit has to
// count them. (Self-hosted installs have no limit; these tests switch the cloud rules on.)

let app: Express;
let token: string;
let userId: string;
let locationId: string;
const cfg = config as { selfHosted: boolean };
const wasSelfHosted = cfg.selfHosted;

const auth = () => ({ Authorization: `Bearer ${token}` });
const post = (body: Record<string, unknown>) => request(app).post('/api/bins').set(auth()).send(body);
const batch = (operations: Record<string, unknown>[]) =>
  request(app).post('/api/batch').set(auth()).send({ locationId, operations });
const trashed = async (id: string) =>
  (await query<{ deleted_at: string | null }>('SELECT deleted_at FROM bins WHERE id = $1', [id])).rows[0].deleted_at !== null;

async function setMaxBins(max: number): Promise<void> {
  await query('INSERT INTO user_limit_overrides (id, user_id, max_bins) VALUES ($1, $2, $3)', [crypto.randomUUID(), userId, max]);
}

/** A trashed parent with two trashed children (3 bins come back on restore). */
async function trashedFamily(): Promise<{ parent: { id: string; name: string }; children: string[] }> {
  const parent = (await post({ locationId, name: 'Parent' })).body;
  const c1 = (await post({ locationId, name: 'Child 1', parentBinId: parent.id })).body;
  const c2 = (await post({ locationId, name: 'Child 2', parentBinId: parent.id })).body;
  await request(app).delete(`/api/bins/${parent.id}`).set(auth());
  return { parent, children: [c1.id, c2.id] };
}

beforeEach(async () => {
  app = createApp();
  const user = await createTestUser(app);
  token = user.token;
  userId = user.user.id;
  // cloud mode requires accepted terms on every request
  await query('UPDATE users SET current_tos_version = $1, current_privacy_version = $2 WHERE id = $3', [
    CURRENT_TOS_VERSION,
    CURRENT_PRIVACY_VERSION,
    userId,
  ]);
  locationId = (await createTestLocation(app, token)).id;
});

afterEach(() => {
  cfg.selfHosted = wasSelfHosted;
});

describe('plan limit when restoring a parent with children', () => {
  it('refuses to restore when the parent and its children would exceed the limit', async () => {
    const { parent, children } = await trashedFamily();
    cfg.selfHosted = false;
    await setMaxBins(2); // room for the parent alone, not for parent + 2 children

    const res = await request(app).post(`/api/bins/${parent.id}/restore`).set(auth());
    expect(res.body.error).toBe('PLAN_RESTRICTED');
    expect(await trashed(parent.id)).toBe(true);
    for (const id of children) expect(await trashed(id)).toBe(true);
    await expectNoHierarchyViolations();
  });

  it('restores the family when it fits exactly', async () => {
    const { parent, children } = await trashedFamily();
    cfg.selfHosted = false;
    await setMaxBins(3);

    const res = await request(app).post(`/api/bins/${parent.id}/restore`).set(auth());
    expect(res.status).toBe(200);
    expect(await trashed(parent.id)).toBe(false);
    for (const id of children) expect(await trashed(id)).toBe(false);
    await expectNoHierarchyViolations();
  });

  it('still restores a bin without children when only one slot is free', async () => {
    const single = (await post({ locationId, name: 'Single' })).body;
    await request(app).delete(`/api/bins/${single.id}`).set(auth());
    cfg.selfHosted = false;
    await setMaxBins(1);

    const res = await request(app).post(`/api/bins/${single.id}/restore`).set(auth());
    expect(res.status).toBe(200);
    expect(await trashed(single.id)).toBe(false);
  });

  it('applies the same rule to the batch restore_bin action', async () => {
    const { parent, children } = await trashedFamily();
    cfg.selfHosted = false;
    await setMaxBins(2);

    const refused = await batch([{ type: 'restore_bin', bin_id: parent.id, bin_name: parent.name }]);
    expect(refused.body.results?.[0]?.success).not.toBe(true);
    expect(await trashed(parent.id)).toBe(true);

    await query('UPDATE user_limit_overrides SET max_bins = 3 WHERE user_id = $1', [userId]);
    const ok = await batch([{ type: 'restore_bin', bin_id: parent.id, bin_name: parent.name }]);
    expect(ok.body.results[0].success).toBe(true);
    for (const id of [parent.id, ...children]) expect(await trashed(id)).toBe(false);
    await expectNoHierarchyViolations();
  });
});
