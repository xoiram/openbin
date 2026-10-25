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
import { addLoose, auth } from './looseItemsHelpers.js';

let app: Express;

beforeEach(() => {
  app = createApp();
});

// ---------------------------------------------------------------------------
// Fixtures and helpers
// ---------------------------------------------------------------------------

async function addItems(binId: string, locationId: string, items: Array<[string, number | null]>) {
  for (let i = 0; i < items.length; i++) {
    await query(
      'INSERT INTO bin_items (id, bin_id, location_id, name, quantity, position) VALUES ($1, $2, $3, $4, $5, $6)',
      [generateUuid(), binId, locationId, items[i][0], items[i][1], i],
    );
  }
}

async function trash(binIds: string[], at: string) {
  for (const id of binIds) await query('UPDATE bins SET deleted_at = $1 WHERE id = $2', [at, id]);
}

/**
 * A source location with: Tool Chest (Garage, 2 items) holding a live child Drill Bits (1 item) and a
 * trashed child Old Bits; Shelf Box (Attic); a trashed parent Gone Box with a child Gone Kid trashed
 * together with it; one loose item in Garage (qty 3), one in Garage / Shelf, one unassigned item.
 */
async function buildSource(token: string, name = 'Source') {
  const loc = await createTestLocation(app, token, name);
  const garage = await createTestArea(app, token, loc.id, 'Garage');
  const attic = await createTestArea(app, token, loc.id, 'Attic');
  const shelf = (await request(app).post(`/api/locations/${loc.id}/areas`).set(auth(token)).send({ name: 'Shelf', parent_id: garage.id })).body as { id: string };

  const chest = await createTestBin(app, token, loc.id, { name: 'Tool Chest' });
  await query('UPDATE bins SET area_id = $1 WHERE id = $2', [garage.id, chest.id]);
  await addItems(chest.id, loc.id, [['Ratchet', null], ['Hex keys', 2]]);

  const bits = await createTestBin(app, token, loc.id, { name: 'Drill Bits' });
  await setParentBinByDb(bits.id, chest.id);
  await addItems(bits.id, loc.id, [['Spade bits', null]]);

  const oldBits = await createTestBin(app, token, loc.id, { name: 'Old Bits' });
  await setParentBinByDb(oldBits.id, chest.id);
  await trash([oldBits.id], '2026-01-02 03:04:05');

  const shelfBox = await createTestBin(app, token, loc.id, { name: 'Shelf Box' });
  await query('UPDATE bins SET area_id = $1 WHERE id = $2', [attic.id, shelfBox.id]);

  const gone = await createTestBin(app, token, loc.id, { name: 'Gone Box' });
  await query('UPDATE bins SET area_id = $1 WHERE id = $2', [attic.id, gone.id]);
  const goneKid = await createTestBin(app, token, loc.id, { name: 'Gone Kid' });
  await setParentBinByDb(goneKid.id, gone.id);
  await trash([gone.id, goneKid.id], '2026-02-03 04:05:06');

  await addLoose(app, token, loc.id, { name: 'Tape', quantity: 3, areaId: garage.id });
  await addLoose(app, token, loc.id, { name: 'Level', areaId: shelf.id });
  await addLoose(app, token, loc.id, { name: 'Batteries' });
  await expectNoHierarchyViolations(loc.id);
  return { loc, garage, attic, shelf, chest, bits, oldBits, shelfBox, gone, goneKid };
}

interface BinRow { name: string; parent: string | null; area: string | null; trashed: boolean; visibility: string; items: string[] }
interface LooseRow { name: string; quantity: number | null; area: string | null }

/** Everything about a location that an export/import must preserve, with ids replaced by names. */
async function snapshot(locationId: string): Promise<{ bins: BinRow[]; loose: LooseRow[] }> {
  const bins = await query<{ id: string; name: string; parent: string | null; area: string | null; deleted_at: string | null; visibility: string }>(
    `SELECT b.id, b.name, p.name AS parent, a.name AS area, b.deleted_at, b.visibility
     FROM bins b LEFT JOIN bins p ON p.id = b.parent_bin_id LEFT JOIN areas a ON a.id = b.area_id
     WHERE b.location_id = $1 ORDER BY b.name`,
    [locationId],
  );
  const out: BinRow[] = [];
  for (const b of bins.rows) {
    const items = await query<{ name: string; quantity: number | null }>(
      'SELECT name, quantity FROM bin_items WHERE bin_id = $1 ORDER BY position',
      [b.id],
    );
    out.push({
      name: b.name, parent: b.parent, area: b.area, trashed: b.deleted_at !== null, visibility: b.visibility,
      items: items.rows.map((i) => (i.quantity ? `${i.name} x${i.quantity}` : i.name)),
    });
  }
  const loose = await query<{ name: string; quantity: number | null; area: string | null }>(
    `SELECT bi.name, bi.quantity, a.name AS area FROM bin_items bi LEFT JOIN areas a ON a.id = bi.area_id
     WHERE bi.location_id = $1 AND bi.bin_id IS NULL ORDER BY bi.name`,
    [locationId],
  );
  return { bins: out, loose: loose.rows.map((r) => ({ name: r.name, quantity: r.quantity, area: r.area })) };
}

async function deletedAtByName(locationId: string): Promise<Record<string, string | null>> {
  const r = await query<{ name: string; deleted_at: string | null }>('SELECT name, deleted_at FROM bins WHERE location_id = $1', [locationId]);
  return Object.fromEntries(r.rows.map((x) => [x.name, x.deleted_at]));
}

const binary = (res: request.Response, cb: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

async function exportJson(token: string, locationId: string) {
  const res = await request(app).get(`/api/locations/${locationId}/export`).set(auth(token));
  expect(res.status).toBe(200);
  return res.body;
}

async function exportZip(token: string, locationId: string): Promise<Buffer> {
  const res = await request(app).get(`/api/locations/${locationId}/export/zip`).set(auth(token)).buffer(true).parse(binary);
  expect(res.status).toBe(200);
  return res.body as Buffer;
}

async function importJson(token: string, locationId: string, body: Record<string, unknown>) {
  return request(app).post(`/api/locations/${locationId}/import`).set(auth(token)).send(body);
}

async function importZip(token: string, locationId: string, zip: Buffer, mode: 'merge' | 'replace' = 'merge', dryRun = false) {
  const req = request(app).post(`/api/locations/${locationId}/import/zip`).set(auth(token)).field('mode', mode);
  if (dryRun) req.field('dryRun', 'true');
  return req.attach('file', zip, 'export.zip');
}

// ---------------------------------------------------------------------------
// Round trips
// ---------------------------------------------------------------------------

describe('export then import with nested boxes and loose items', () => {
  it('JSON: children, trashed children, loose and unassigned items survive into another location', async () => {
    const { token } = await createTestUser(app);
    const src = await buildSource(token);
    const target = await createTestLocation(app, token, 'Target');

    const exported = await exportJson(token, src.loc.id);
    expect(exported.version).toBe(4);
    const chestEntry = exported.bins.find((b: { name: string }) => b.name === 'Tool Chest');
    const bitsEntry = exported.bins.find((b: { name: string }) => b.name === 'Drill Bits');
    expect(bitsEntry.parentShortCode).toBe(chestEntry.shortCode);
    expect(bitsEntry.location).toBe('Garage');
    expect(chestEntry.parentShortCode).toBeUndefined();

    const imported = await importJson(token, target.id, { ...exported, mode: 'merge' });
    expect(imported.status).toBe(200);
    expect(imported.body.binsSkippedUnresolvedParent).toBe(0);
    expect(imported.body.looseItemsImported).toBe(3);

    expect(await snapshot(target.id)).toEqual(await snapshot(src.loc.id));

    // The link is real: parent_bin_id points at the new parent, in the same area, in the target location
    const rows = await query<{ name: string; parent_bin_id: string | null; area_id: string | null; location_id: string }>(
      'SELECT name, parent_bin_id, area_id, location_id FROM bins WHERE location_id = $1',
      [target.id],
    );
    const byName = Object.fromEntries(rows.rows.map((r) => [r.name, r]));
    const chest = (await query<{ id: string }>("SELECT id FROM bins WHERE location_id = $1 AND name = 'Tool Chest'", [target.id])).rows[0];
    expect(byName['Drill Bits'].parent_bin_id).toBe(chest.id);
    expect(byName['Drill Bits'].area_id).toBe(byName['Tool Chest'].area_id);
    expect(byName['Drill Bits'].area_id).not.toBeNull();
    expect(byName['Old Bits'].parent_bin_id).toBe(chest.id);

    // Trashed child under a live parent stays trashed; the live parent stays live
    const deleted = await deletedAtByName(target.id);
    expect(deleted['Old Bits']).not.toBeNull();
    expect(deleted['Tool Chest']).toBeNull();
    expect(deleted['Drill Bits']).toBeNull();
    // A child trashed together with its parent keeps the parent's timestamp (so they restore together)
    expect(deleted['Gone Kid']).toBe(deleted['Gone Box']);

    // Loose items landed in the target location's own areas
    const loose = await query<{ location_id: string; area_id: string | null; area_loc: string | null }>(
      `SELECT bi.location_id, bi.area_id, a.location_id AS area_loc FROM bin_items bi
       LEFT JOIN areas a ON a.id = bi.area_id WHERE bi.bin_id IS NULL AND bi.location_id = $1`,
      [target.id],
    );
    expect(loose.rows).toHaveLength(3);
    for (const r of loose.rows) {
      expect(r.location_id).toBe(target.id);
      if (r.area_id) expect(r.area_loc).toBe(target.id);
    }
    await expectNoHierarchyViolations(target.id);
  });

  it('ZIP: same round trip', async () => {
    const { token } = await createTestUser(app);
    const src = await buildSource(token);
    const target = await createTestLocation(app, token, 'Target');

    const zip = await exportZip(token, src.loc.id);
    const res = await importZip(token, target.id, zip);
    expect(res.status).toBe(200);
    expect(res.body.binsSkippedUnresolvedParent).toBe(0);
    expect(res.body.childBinsImported).toBe(3);
    expect(await snapshot(target.id)).toEqual(await snapshot(src.loc.id));
    const deleted = await deletedAtByName(target.id);
    expect(deleted['Gone Kid']).toBe(deleted['Gone Box']);
    await expectNoHierarchyViolations(target.id);
  });

  it('CSV: loose and unassigned items round-trip; boxes stay flat', async () => {
    const { token } = await createTestUser(app);
    const src = await buildSource(token);
    const target = await createTestLocation(app, token, 'Target');

    const csv = await request(app).get(`/api/locations/${src.loc.id}/export/csv`).set(auth(token));
    expect(csv.status).toBe(200);
    expect(csv.text).toContain(',Garage,Tape,3,');
    expect(csv.text).toContain(',,Batteries,,');

    const res = await request(app)
      .post(`/api/locations/${target.id}/import/csv`)
      .set(auth(token))
      .attach('file', Buffer.from(csv.text), 'inventory.csv');
    expect(res.status).toBe(200);
    expect(res.body.looseItemsImported).toBe(3);

    const snap = await snapshot(target.id);
    expect(snap.loose).toEqual((await snapshot(src.loc.id)).loose);
    // Live boxes come across (trashed boxes are not in the CSV); the parent link does not
    expect(snap.bins.map((b) => b.name)).toEqual(['Drill Bits', 'Shelf Box', 'Tool Chest']);
    expect(snap.bins.every((b) => b.parent === null)).toBe(true);
    await expectNoHierarchyViolations(target.id);
  });

  it('merge into a location where the parent already exists attaches the child to it', async () => {
    const { token } = await createTestUser(app);
    const src = await buildSource(token);
    const target = await createTestLocation(app, token, 'Target');

    const exported = await exportJson(token, src.loc.id);
    // First put only the top-level boxes in, then merge the whole export on top
    const chestEntry = exported.bins.find((b: { name: string }) => b.name === 'Tool Chest');
    const first = await importJson(token, target.id, { bins: [chestEntry], mode: 'merge' });
    expect(first.status).toBe(200);
    const existingChest = (await query<{ id: string; area_id: string }>("SELECT id, area_id FROM bins WHERE location_id = $1 AND name = 'Tool Chest'", [target.id])).rows[0];

    const merged = await importJson(token, target.id, { ...exported, mode: 'merge' });
    expect(merged.status).toBe(200);
    expect(merged.body.binsSkipped).toBe(1); // Tool Chest already there
    expect(merged.body.binsSkippedUnresolvedParent).toBe(0);

    const drill = (await query<{ parent_bin_id: string; area_id: string }>("SELECT parent_bin_id, area_id FROM bins WHERE location_id = $1 AND name = 'Drill Bits'", [target.id])).rows[0];
    expect(drill.parent_bin_id).toBe(existingChest.id);
    expect(drill.area_id).toBe(existingChest.area_id);
    const count = await query<{ n: number }>("SELECT COUNT(*) AS n FROM bins WHERE location_id = $1 AND name = 'Tool Chest'", [target.id]);
    expect(Number(count.rows[0].n)).toBe(1);
    await expectNoHierarchyViolations(target.id);
  });

  it('merge into a location where the parent exists in a different area still follows the existing parent', async () => {
    const { token } = await createTestUser(app);
    const src = await buildSource(token);
    const target = await createTestLocation(app, token, 'Target');
    const elsewhere = await createTestArea(app, token, target.id, 'Elsewhere');

    const exported = await exportJson(token, src.loc.id);
    const chestEntry = exported.bins.find((b: { name: string }) => b.name === 'Tool Chest');
    await importJson(token, target.id, { bins: [chestEntry], mode: 'merge' });
    await query("UPDATE bins SET area_id = $1 WHERE location_id = $2 AND name = 'Tool Chest'", [elsewhere.id, target.id]);

    const merged = await importJson(token, target.id, { ...exported, mode: 'merge' });
    expect(merged.status).toBe(200);
    const drill = (await query<{ area_id: string }>("SELECT area_id FROM bins WHERE location_id = $1 AND name = 'Drill Bits'", [target.id])).rows[0];
    expect(drill.area_id).toBe(elsewhere.id);
    await expectNoHierarchyViolations(target.id);
  });

  it('merging the same export twice does not duplicate boxes or loose items', async () => {
    const { token } = await createTestUser(app);
    const src = await buildSource(token);
    const target = await createTestLocation(app, token, 'Target');
    const exported = await exportJson(token, src.loc.id);

    const first = await importJson(token, target.id, { ...exported, mode: 'merge' });
    expect(first.body.looseItemsImported).toBe(3);
    const before = await snapshot(target.id);

    const second = await importJson(token, target.id, { ...exported, mode: 'merge' });
    expect(second.status).toBe(200);
    expect(second.body.looseItemsImported).toBe(0);
    expect(second.body.looseItemsSkipped).toBe(3);
    expect(second.body.binsImported).toBe(0);
    expect(second.body.trashedBinsImported).toBe(0);
    expect(await snapshot(target.id)).toEqual(before);
  });

  it('replace removes the existing loose, unassigned and box items before importing', async () => {
    const { token } = await createTestUser(app);
    const src = await buildSource(token);
    const target = await createTestLocation(app, token, 'Target');
    const old = await createTestArea(app, token, target.id, 'OldArea');
    await addLoose(app, token, target.id, { name: 'Stale loose', areaId: old.id });
    await addLoose(app, token, target.id, { name: 'Stale unassigned' });
    await createTestBin(app, token, target.id, { name: 'Stale box', items: ['Stale item'] });

    const exported = await exportJson(token, src.loc.id);
    const res = await importJson(token, target.id, { ...exported, mode: 'replace' });
    expect(res.status).toBe(200);
    expect(await snapshot(target.id)).toEqual(await snapshot(src.loc.id));
    const stale = await query("SELECT id FROM bin_items WHERE location_id = $1 AND name LIKE 'Stale%'", [target.id]);
    expect(stale.rows).toHaveLength(0);
  });

  it('a child of a private parent is private after import', async () => {
    const { token } = await createTestUser(app);
    const src = await createTestLocation(app, token, 'Source');
    const target = await createTestLocation(app, token, 'Target');
    const parent = await createTestBin(app, token, src.id, { name: 'Safe', visibility: 'private' });
    const kid = await createTestBin(app, token, src.id, { name: 'Safe kid' });
    await setParentBinByDb(kid.id, parent.id);

    const exported = await exportJson(token, src.id);
    // An old-style importer-visible payload that does not repeat the child's visibility
    const payload = {
      ...exported,
      mode: 'merge',
      bins: exported.bins.map((b: Record<string, unknown>) => (b.name === 'Safe kid' ? { ...b, visibility: undefined } : b)),
    };
    const res = await importJson(token, target.id, payload);
    expect(res.status).toBe(200);
    const snap = await snapshot(target.id);
    expect(snap.bins.map((b) => [b.name, b.parent, b.visibility])).toEqual([
      ['Safe', null, 'private'],
      ['Safe kid', 'Safe', 'private'],
    ]);
    await expectNoHierarchyViolations(target.id);
  });

  it('omits parentShortCode when the parent is not part of the export (private to someone else)', async () => {
    const owner = await createTestUser(app);
    const src = await createTestLocation(app, owner.token, 'Source');
    const garage = await createTestArea(app, owner.token, src.id, 'Garage');
    const other = await createTestUser(app);
    await query('INSERT INTO location_members (id, location_id, user_id, role) VALUES ($1, $2, $3, $4)', [generateUuid(), src.id, other.user.id, 'member']);
    const parent = await createTestBin(app, other.token, src.id, { name: 'Their private', visibility: 'private' });
    await query('UPDATE bins SET area_id = $1 WHERE id = $2', [garage.id, parent.id]);
    const kid = await createTestBin(app, owner.token, src.id, { name: 'My kid', visibility: 'private' });
    await setParentBinByDb(kid.id, parent.id);
    await query('UPDATE bins SET visibility = $1 WHERE id = $2', ['private', kid.id]);

    const exported = await exportJson(owner.token, src.id);
    expect(exported.bins.map((b: { name: string }) => b.name)).toEqual(['My kid']);
    expect(exported.bins[0].parentShortCode).toBeUndefined();
    expect(exported.bins[0].location).toBe('Garage');

    const target = await createTestLocation(app, owner.token, 'Target');
    const res = await importJson(owner.token, target.id, { ...exported, mode: 'merge' });
    expect(res.status).toBe(200);
    expect(res.body.binsImported).toBe(1);
    expect(res.body.binsSkippedUnresolvedParent).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Parent resolution rules, dry run == import
// ---------------------------------------------------------------------------

describe('import parent resolution', () => {
  const now = new Date().toISOString();
  const bin = (over: Record<string, unknown>) => ({ items: [], notes: '', tags: [], icon: '', color: '', createdAt: now, updatedAt: now, photos: [], ...over });

  it('skips and counts children whose parent cannot be resolved, never flattens, and the dry run agrees', async () => {
    const { token } = await createTestUser(app);
    const target = await createTestLocation(app, token, 'Target');
    const payload = {
      mode: 'merge',
      bins: [
        bin({ id: 'a', name: 'Top', shortCode: 'TOP111' }),
        bin({ id: 'b', name: 'Kid', shortCode: 'KID111', parentShortCode: 'TOP111' }),
        bin({ id: 'c', name: 'Orphan', shortCode: 'ORP111', parentShortCode: 'NOPE11' }),
        bin({ id: 'd', name: 'Grandkid', shortCode: 'GRK111', parentShortCode: 'KID111' }),
        bin({ id: 'e', name: 'Selfie', shortCode: 'SLF111', parentShortCode: 'SLF111' }),
      ],
    };
    const dry = await importJson(token, target.id, { ...payload, dryRun: true });
    expect(dry.status).toBe(200);
    expect(dry.body.binsSkippedUnresolvedParent).toBe(3);
    expect(dry.body.toSkip.filter((s: { code: string }) => s.code === 'unresolved_parent').map((s: { name: string }) => s.name).sort()).toEqual(['Grandkid', 'Orphan', 'Selfie']);
    expect(dry.body.toCreate.map((c: { name: string }) => c.name)).toEqual(['Top', 'Kid']);
    expect(dry.body.totalChildBins).toBe(4);

    const res = await importJson(token, target.id, payload);
    expect(res.status).toBe(200);
    expect(res.body.binsSkippedUnresolvedParent).toBe(dry.body.binsSkippedUnresolvedParent);
    expect(res.body.binsImported).toBe(dry.body.toCreate.length);
    expect(res.body.childBinsImported).toBe(1);
    const names = (await snapshot(target.id)).bins.map((b) => b.name);
    expect(names).toEqual(['Kid', 'Top']);
    await expectNoHierarchyViolations(target.id);
  });

  it('a live child under a trashed parent is imported trashed with the parent deletedAt', async () => {
    const { token } = await createTestUser(app);
    const target = await createTestLocation(app, token, 'Target');
    const res = await importJson(token, target.id, {
      mode: 'merge',
      bins: [bin({ id: 'k', name: 'Live kid', shortCode: 'LKD111', parentShortCode: 'TRP111' })],
      trashedBins: [bin({ id: 'p', name: 'Trashed parent', shortCode: 'TRP111', deletedAt: '2026-03-04 05:06:07' })],
    });
    expect(res.status).toBe(200);
    expect(res.body.trashedBinsImported).toBe(2);
    expect(res.body.binsImported).toBe(0);
    const deleted = await deletedAtByName(target.id);
    expect(deleted['Live kid']).toBe(deleted['Trashed parent']);
    expect(deleted['Live kid']).not.toBeNull();
    await expectNoHierarchyViolations(target.id);
  });

  it('resolves a merge-skipped parent through the existing bin and applies the depth rule', async () => {
    const { token } = await createTestUser(app);
    const target = await createTestLocation(app, token, 'Target');
    const existing = await createTestBin(app, token, target.id, { name: 'Existing' });
    await query('UPDATE bins SET short_code = $1 WHERE id = $2', ['EXI111', existing.id]);
    const payload = {
      mode: 'merge',
      bins: [
        bin({ id: 'x', name: 'Existing again', shortCode: 'EXI111' }),
        bin({ id: 'y', name: 'Under existing', shortCode: 'UND111', parentShortCode: 'EXI111' }),
      ],
    };
    const dry = await importJson(token, target.id, { ...payload, dryRun: true });
    const res = await importJson(token, target.id, payload);
    expect(dry.body.toCreate.map((c: { name: string }) => c.name)).toEqual(['Under existing']);
    expect(res.body.binsImported).toBe(1);
    expect(res.body.binsSkipped).toBe(1);
    expect(res.body.childBinsImported).toBe(1);
    const kid = (await query<{ parent_bin_id: string }>("SELECT parent_bin_id FROM bins WHERE name = 'Under existing' AND location_id = $1", [target.id])).rows[0];
    expect(kid.parent_bin_id).toBe(existing.id);

    // Existing parent that is itself a child: depth rule, skipped
    const deeper = await importJson(token, target.id, {
      mode: 'merge',
      bins: [bin({ id: 'z', name: 'Too deep', shortCode: 'DEP111', parentShortCode: 'UND111' })],
    });
    expect(deeper.body.binsSkippedUnresolvedParent).toBe(1);
    expect(deeper.body.binsImported).toBe(0);
    await expectNoHierarchyViolations(target.id);
  });

  it('dry run and import agree on loose items in merge mode', async () => {
    const { token } = await createTestUser(app);
    const target = await createTestLocation(app, token, 'Target');
    const garage = await createTestArea(app, token, target.id, 'Garage');
    await addLoose(app, token, target.id, { name: 'Tape', areaId: garage.id });
    await addLoose(app, token, target.id, { name: 'Glue' });
    const payload = {
      mode: 'merge',
      bins: [],
      areas: [
        { path: 'Garage', items: ['Tape', { name: 'Saw', quantity: 2.7 }, 'Saw'] },
        { path: 'Brand new area', items: ['Tape'] },
      ],
      unassignedItems: ['Glue', 'Rope'],
    };
    const dry = await importJson(token, target.id, { ...payload, dryRun: true });
    const res = await importJson(token, target.id, payload);
    expect(dry.body.looseItemsTotal).toBe(6);
    expect(dry.body.looseItemsToCreate).toBe(res.body.looseItemsImported);
    expect(dry.body.looseItemsToSkip).toBe(res.body.looseItemsSkipped);
    expect(res.body.looseItemsImported).toBe(3); // Saw (Garage), Tape (new area), Rope
    expect(res.body.looseItemsSkipped).toBe(3); // Tape (Garage), duplicate Saw, Glue
    const saw = await query<{ quantity: number }>("SELECT quantity FROM bin_items WHERE name = 'Saw' AND location_id = $1", [target.id]);
    expect(saw.rows.map((r) => r.quantity)).toEqual([2]); // clamped to a positive integer
  });
});
