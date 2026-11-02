import type { Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '../db.js';
import { createApp } from '../index.js';
import {
  createTestBin,
  createTestLocation,
  createTestUser,
  joinTestLocation,
  setParentBinByDb,
  TEST_PNG,
} from './helpers.js';

let app: Express;
beforeEach(() => {
  app = createApp();
});

type Setup = Awaited<ReturnType<typeof setup>>;

async function setup(opts?: { publicAccess?: boolean }) {
  const user = await createTestUser(app);
  const location = await createTestLocation(app, user.token);
  const bin = await createTestBin(app, user.token, location.id, {
    name: 'Toolbox',
    items: ['Hammer', 'Nails'],
    tags: ['garage'],
    notes: 'Top shelf',
  });
  if (opts?.publicAccess !== false) await setLocation(user.token, location.id, { public_qr_access: true });
  return { user, location, bin };
}

function setLocation(token: string, locationId: string, body: Record<string, unknown>) {
  return request(app).put(`/api/locations/${locationId}`).set('Authorization', `Bearer ${token}`).send(body);
}

async function uploadPhoto(s: Setup, binId = s.bin.id): Promise<string> {
  const res = await request(app)
    .post(`/api/bins/${binId}/photos`)
    .set('Authorization', `Bearer ${s.user.token}`)
    .attach('photo', TEST_PNG, 'test.png');
  expect(res.status).toBe(201);
  return res.body.id as string;
}

async function createChild(s: Setup, name: string, visibility?: 'location' | 'private') {
  const child = await createTestBin(app, s.user.token, s.location.id, { name, items: ['Screw'], visibility });
  await setParentBinByDb(child.id, s.bin.id);
  return child;
}

const publicGet = (binId: string) => request(app).get(`/api/public/bins/${binId}`);

// ── GET /api/public/bins/:id ────────────────────────────────────────────

describe('GET /api/public/bins/:id', () => {
  it('returns the box without authentication when the location allows it', async () => {
    const { bin } = await setup();
    const res = await publicGet(bin.id);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(bin.id);
    expect(res.body.name).toBe('Toolbox');
    expect(res.body.notes).toBe('Top shelf');
    expect(res.body.tags).toEqual(['garage']);
    expect(res.body.items).toEqual([
      { name: 'Hammer', quantity: null },
      { name: 'Nails', quantity: null },
    ]);
    expect(res.body.photos).toEqual([]);
    expect(res.body.children).toEqual([]);
    expect(res.body.parent).toBeNull();
  });

  it('returns only allowlisted fields', async () => {
    const { bin } = await setup();
    const res = await publicGet(bin.id);
    expect(Object.keys(res.body).sort()).toEqual([
      'area_name', 'card_style', 'children', 'color', 'created_at', 'custom_fields', 'icon', 'id',
      'items', 'name', 'notes', 'parent', 'photos', 'tags', 'updated_at',
    ]);
    for (const leaked of ['location_id', 'area_id', 'created_by', 'created_by_name', 'visibility', 'short_code', 'public_view_count']) {
      expect(res.body[leaked]).toBeUndefined();
    }
  });

  it('sets the no-referrer and noindex headers', async () => {
    const { bin } = await setup();
    const res = await publicGet(bin.id);
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['x-robots-tag']).toBe('noindex, nofollow');
  });

  it('returns custom fields by name, in position order, skipping empty values', async () => {
    const { location, bin } = await setup();
    const db = getDb();
    db.prepare('INSERT INTO location_custom_fields (id, location_id, name, position) VALUES (?, ?, ?, ?)').run('f2', location.id, 'Owner', 1);
    db.prepare('INSERT INTO location_custom_fields (id, location_id, name, position) VALUES (?, ?, ?, ?)').run('f1', location.id, 'Shelf', 0);
    db.prepare('INSERT INTO location_custom_fields (id, location_id, name, position) VALUES (?, ?, ?, ?)').run('f3', location.id, 'Empty', 2);
    const insert = db.prepare('INSERT INTO bin_custom_field_values (id, bin_id, field_id, value) VALUES (?, ?, ?, ?)');
    insert.run('v1', bin.id, 'f1', 'A3');
    insert.run('v2', bin.id, 'f2', 'Ann');
    insert.run('v3', bin.id, 'f3', '');

    const res = await publicGet(bin.id);
    expect(res.body.custom_fields).toEqual([
      { name: 'Shelf', value: 'A3' },
      { name: 'Owner', value: 'Ann' },
    ]);
  });

  describe('refusals', () => {
    it('404s when the location has not enabled public access', async () => {
      const { bin } = await setup({ publicAccess: false });
      expect((await publicGet(bin.id)).status).toBe(404);
    });

    it('404s again once the switch is turned back off', async () => {
      const { user, location, bin } = await setup();
      expect((await publicGet(bin.id)).status).toBe(200);
      await setLocation(user.token, location.id, { public_qr_access: false });
      expect((await publicGet(bin.id)).status).toBe(404);
    });

    it('404s for a private box, a trashed box and an unknown id with an identical body', async () => {
      const s = await setup();
      const priv = await createTestBin(app, s.user.token, s.location.id, { name: 'Secret', visibility: 'private' });
      const trashed = await createTestBin(app, s.user.token, s.location.id, { name: 'Gone' });
      await request(app).delete(`/api/bins/${trashed.id}`).set('Authorization', `Bearer ${s.user.token}`);

      const refusals = await Promise.all([
        publicGet(priv.id),
        publicGet(trashed.id),
        publicGet('00000000-0000-4000-8000-000000000000'),
        publicGet('not-a-uuid'),
      ]);
      for (const r of refusals) expect(r.status).toBe(404);
      const bodies = new Set(refusals.map((r) => JSON.stringify(r.body)));
      expect(bodies.size).toBe(1);
    });

    it('does not look boxes up by short_code', async () => {
      const { bin } = await setup();
      expect((await publicGet(bin.short_code)).status).toBe(404);
    });

    it('rejects every mutating method', async () => {
      const { bin } = await setup();
      for (const method of ['post', 'put', 'patch', 'delete'] as const) {
        const res = await request(app)[method](`/api/public/bins/${bin.id}`).send({ name: 'Hacked' });
        expect(res.status, method).toBeGreaterThanOrEqual(400);
      }
      expect((await publicGet(bin.id)).body.name).toBe('Toolbox');
    });
  });

  describe('nested boxes', () => {
    it('lists public children and links to a public parent', async () => {
      const s = await setup();
      const child = await createChild(s, 'Drill bits');

      const parentView = await publicGet(s.bin.id);
      expect(parentView.body.children).toEqual([
        { id: child.id, name: 'Drill bits', icon: expect.any(String), color: expect.any(String), item_count: 1 },
      ]);

      const childView = await publicGet(child.id);
      expect(childView.status).toBe(200);
      expect(childView.body.parent).toEqual({ id: s.bin.id, name: 'Toolbox' });
    });

    it('hides a private child of a public parent, and 404s when asked for directly', async () => {
      const s = await setup();
      await createChild(s, 'Open child');
      const hidden = await createTestBin(app, s.user.token, s.location.id, { name: 'Hidden child', items: ['X'] });
      getDb().prepare("UPDATE bins SET parent_bin_id = ?, visibility = 'private' WHERE id = ?").run(s.bin.id, hidden.id);

      const view = await publicGet(s.bin.id);
      expect(view.body.children.map((c: { name: string }) => c.name)).toEqual(['Open child']);
      expect((await publicGet(hidden.id)).status).toBe(404);
    });

    it('omits a trashed child', async () => {
      const s = await setup();
      const child = await createChild(s, 'Soon gone');
      getDb().prepare("UPDATE bins SET deleted_at = datetime('now') WHERE id = ?").run(child.id);
      expect((await publicGet(s.bin.id)).body.children).toEqual([]);
    });
  });

  describe('view counter', () => {
    it('counts each public view and records when it happened', async () => {
      const { bin } = await setup();
      const count = () => getDb().prepare('SELECT public_view_count AS c, last_public_view_at AS t FROM bins WHERE id = ?').get(bin.id) as { c: number; t: string | null };
      expect(count()).toEqual({ c: 0, t: null });

      await publicGet(bin.id);
      await publicGet(bin.id);

      const after = count();
      expect(after.c).toBe(2);
      expect(after.t).not.toBeNull();
    });

    it('does not count refused requests or member views through the normal API', async () => {
      const { user, bin } = await setup({ publicAccess: false });
      await publicGet(bin.id);
      await request(app).get(`/api/bins/${bin.id}`).set('Authorization', `Bearer ${user.token}`);
      const row = getDb().prepare('SELECT public_view_count AS c FROM bins WHERE id = ?').get(bin.id) as { c: number };
      expect(row.c).toBe(0);
    });
  });
});

// ── Photos ──────────────────────────────────────────────────────────────

describe('public photos', () => {
  it('lists and serves photos by default', async () => {
    const s = await setup();
    const photoId = await uploadPhoto(s);

    const view = await publicGet(s.bin.id);
    expect(view.body.photos).toEqual([{ id: photoId, filename: expect.any(String) }]);

    const file = await request(app).get(`/api/public/bins/${s.bin.id}/photos/${photoId}/file`);
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toMatch(/image\//);
    expect(file.headers['cache-control']).toBe('private, max-age=3600');
    expect(file.headers['referrer-policy']).toBe('no-referrer');

    const thumb = await request(app).get(`/api/public/bins/${s.bin.id}/photos/${photoId}/thumb`);
    expect(thumb.status).toBe(200);
  });

  it('hides photos and 404s the photo routes when the photos switch is off, but keeps the page', async () => {
    const s = await setup();
    const photoId = await uploadPhoto(s);
    await setLocation(s.user.token, s.location.id, { public_qr_photos: false });

    const view = await publicGet(s.bin.id);
    expect(view.status).toBe(200);
    expect(view.body.name).toBe('Toolbox');
    expect(view.body.photos).toEqual([]);

    expect((await request(app).get(`/api/public/bins/${s.bin.id}/photos/${photoId}/file`)).status).toBe(404);
    expect((await request(app).get(`/api/public/bins/${s.bin.id}/photos/${photoId}/thumb`)).status).toBe(404);
  });

  it('404s a photo requested through a different box', async () => {
    const s = await setup();
    const photoId = await uploadPhoto(s);
    const other = await createTestBin(app, s.user.token, s.location.id, { name: 'Other' });

    expect((await request(app).get(`/api/public/bins/${other.id}/photos/${photoId}/file`)).status).toBe(404);
  });

  it('404s photos of a private box and when public access is off', async () => {
    const s = await setup();
    const photoId = await uploadPhoto(s);
    getDb().prepare("UPDATE bins SET visibility = 'private' WHERE id = ?").run(s.bin.id);
    expect((await request(app).get(`/api/public/bins/${s.bin.id}/photos/${photoId}/file`)).status).toBe(404);

    getDb().prepare("UPDATE bins SET visibility = 'location' WHERE id = ?").run(s.bin.id);
    await setLocation(s.user.token, s.location.id, { public_qr_access: false });
    expect((await request(app).get(`/api/public/bins/${s.bin.id}/photos/${photoId}/file`)).status).toBe(404);
  });

  it('does not count photo requests as views', async () => {
    const s = await setup();
    const photoId = await uploadPhoto(s);
    await request(app).get(`/api/public/bins/${s.bin.id}/photos/${photoId}/file`);
    const row = getDb().prepare('SELECT public_view_count AS c FROM bins WHERE id = ?').get(s.bin.id) as { c: number };
    expect(row.c).toBe(0);
  });
});

// ── Location settings ───────────────────────────────────────────────────

describe('public QR settings on PUT /api/locations/:id', () => {
  it('defaults to access off and photos on, and returns both in the location payload', async () => {
    const user = await createTestUser(app);
    const created = await createTestLocation(app, user.token);
    expect(created).toMatchObject({ public_qr_access: false, public_qr_photos: true });

    const list = await request(app).get('/api/locations').set('Authorization', `Bearer ${user.token}`);
    expect(list.body.results[0]).toMatchObject({ public_qr_access: false, public_qr_photos: true });
  });

  it('lets an admin change both switches independently', async () => {
    const user = await createTestUser(app);
    const location = await createTestLocation(app, user.token);

    const on = await setLocation(user.token, location.id, { public_qr_access: true });
    expect(on.status).toBe(200);
    expect(on.body).toMatchObject({ public_qr_access: true, public_qr_photos: true });

    const noPhotos = await setLocation(user.token, location.id, { public_qr_photos: false });
    expect(noPhotos.body).toMatchObject({ public_qr_access: true, public_qr_photos: false });
  });

  it('rejects non-boolean values', async () => {
    const user = await createTestUser(app);
    const location = await createTestLocation(app, user.token);
    for (const value of ['yes', 1, null]) {
      const res = await setLocation(user.token, location.id, { public_qr_access: value });
      expect(res.status, String(value)).toBe(422);
    }
  });

  it('forbids members and viewers', async () => {
    const admin = await createTestUser(app);
    const location = await createTestLocation(app, admin.token);
    const member = await createTestUser(app);
    await joinTestLocation(app, member.token, location.invite_code);
    const viewer = await createTestUser(app);
    await joinTestLocation(app, viewer.token, location.invite_code);
    getDb().prepare("UPDATE location_members SET role = 'viewer' WHERE user_id = ? AND location_id = ?").run(viewer.user.id, location.id);

    expect((await setLocation(member.token, location.id, { public_qr_access: true })).status).toBe(403);
    expect((await setLocation(viewer.token, location.id, { public_qr_access: true })).status).toBe(403);
  });

  it('logs the change in the activity log with old and new values', async () => {
    const user = await createTestUser(app);
    const location = await createTestLocation(app, user.token);
    await setLocation(user.token, location.id, { public_qr_access: true });

    const log = await request(app).get(`/api/locations/${location.id}/activity`).set('Authorization', `Bearer ${user.token}`);
    const entry = (log.body.results as Array<{ entity_type: string; action: string; changes: Record<string, { old: unknown; new: unknown }> | null }>)
      .find((e) => e.entity_type === 'location' && e.action === 'update');
    expect(entry?.changes?.public_qr_access).toEqual({ old: false, new: true });
  });

  it('does not log a change when the value is unchanged', async () => {
    const user = await createTestUser(app);
    const location = await createTestLocation(app, user.token);
    await setLocation(user.token, location.id, { public_qr_photos: true });

    const log = await request(app).get(`/api/locations/${location.id}/activity`).set('Authorization', `Bearer ${user.token}`);
    const updates = (log.body.results as Array<{ entity_type: string; action: string }>).filter((e) => e.entity_type === 'location' && e.action === 'update');
    expect(updates).toHaveLength(0);
  });
});
