import type { Express } from 'express';
import request from 'supertest';
import { expect } from 'vitest';
import { getDb, query } from '../db.js';
import { findHierarchyViolations } from '../lib/binHierarchy.js';

/** Minimal 1x1 PNG for upload tests. */
export const TEST_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
  'base64',
);

export function makeAdmin(userId: string) {
  getDb().prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(userId);
}

export async function createShare(app: Express, token: string, binId: string) {
  return request(app)
    .post(`/api/bins/${binId}/share`)
    .set('Authorization', `Bearer ${token}`)
    .send({});
}

let userCounter = 0;

function extractAccessToken(res: request.Response): string {
  const setCookie = res.headers['set-cookie'];
  const arr = Array.isArray(setCookie) ? setCookie : [setCookie];
  for (const c of arr) {
    const [nameVal] = c.split(';');
    const [name, ...rest] = nameVal.split('=');
    if (name.trim() === 'openbin-access') return rest.join('=');
  }
  throw new Error('openbin-access cookie not found in response');
}

export async function createTestUser(app: Express, overrides?: { email?: string; password?: string; displayName?: string }) {
  userCounter++;
  const email = overrides?.email ?? `testuser${userCounter}_${Date.now()}@test.local`;
  const password = overrides?.password ?? 'TestPass123!';
  const displayName = overrides?.displayName ?? `Test User ${userCounter}`;

  // Always send consent flags. In the default self-hosted test environment
  // these are ignored; in tests that mock isSelfHosted() to false (plan
  // gating, downgrade flows, etc.) they satisfy the cloud-only ToS/Privacy
  // gate added in the consent flow.
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email, password, displayName, acceptedTos: true, acceptedPrivacy: true });

  return {
    token: extractAccessToken(res),
    user: res.body.user as { id: string; displayName: string; email: string },
    password,
  };
}

export async function createTestLocation(app: Express, token: string, name?: string) {
  const res = await request(app)
    .post('/api/locations')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: name ?? `Test Location ${Date.now()}` });

  return res.body as {
    id: string;
    name: string;
    invite_code: string;
    role: string;
    member_count: number;
  };
}

export async function createTestBin(
  app: Express,
  token: string,
  locationId: string,
  overrides?: {
    name?: string;
    items?: string[];
    tags?: string[];
    notes?: string;
    visibility?: 'location' | 'private';
  },
) {
  const res = await request(app)
    .post('/api/bins')
    .set('Authorization', `Bearer ${token}`)
    .send({
      locationId,
      name: overrides?.name ?? `Test Bin ${Date.now()}`,
      items: overrides?.items,
      tags: overrides?.tags,
      notes: overrides?.notes,
      visibility: overrides?.visibility,
    });

  return res.body as {
    id: string;
    short_code: string;
    name: string;
    location_id: string;
    tags: string[];
    notes: string;
  };
}

export async function joinTestLocation(app: Express, token: string, inviteCode: string) {
  const res = await request(app)
    .post('/api/locations/join')
    .set('Authorization', `Bearer ${token}`)
    .send({ inviteCode });
  if (res.status >= 400) throw new Error(`join failed: ${res.status} ${JSON.stringify(res.body)}`);
}

export async function getMemberRoleByDb(locationId: string, userId: string): Promise<string | undefined> {
  const result = await query<{ role: string }>(
    'SELECT role FROM location_members WHERE location_id = $1 AND user_id = $2',
    [locationId, userId],
  );
  return result.rows[0]?.role;
}

export async function createTestArea(app: Express, token: string, locationId: string, name?: string) {
  const res = await request(app)
    .post(`/api/locations/${locationId}/areas`)
    .set('Authorization', `Bearer ${token}`)
    .send({ name: name ?? `Test Area ${Date.now()}` });

  return res.body as {
    id: string;
    name: string;
    location_id: string;
  };
}

/** Asserts the nested-bin rules hold across the whole test database (or one location). See lib/binHierarchy.ts. */
export async function expectNoHierarchyViolations(locationId?: string): Promise<void> {
  expect(await findHierarchyViolations(query, locationId)).toEqual([]);
}

/** Direct fixture helpers: nest a bin / put an item in an area without going through the API under test. */
export async function setParentBinByDb(childId: string, parentId: string): Promise<void> {
  const parent = await query<{ area_id: string | null; visibility: string }>('SELECT area_id, visibility FROM bins WHERE id = $1', [parentId]);
  await query('UPDATE bins SET parent_bin_id = $1, area_id = $2, visibility = $3 WHERE id = $4', [
    parentId,
    parent.rows[0].area_id,
    parent.rows[0].visibility,
    childId,
  ]);
}
