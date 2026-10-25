import { beforeEach, describe, expect, it } from 'vitest';
import { generateUuid, getDb, query, querySync } from '../../db.js';
import type { ExportBin } from '../exportHelpers.js';
import {
  buildDryRunPreview,
  collectLooseGroups,
  executeFullImportTransaction,
  lookupArea,
  planBinImport,
  planLooseItems,
} from '../importTransaction.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createUser(id: string, displayName: string) {
  await query(
    'INSERT INTO users (id, email, password_hash, display_name) VALUES ($1, $2, $3, $4)',
    [id, `${id}@test.local`, 'hash', displayName],
  );
}

async function createLocation(id: string, name: string, createdBy: string) {
  const inviteCode = generateUuid().slice(0, 8);
  await query(
    'INSERT INTO locations (id, name, created_by, invite_code) VALUES ($1, $2, $3, $4)',
    [id, name, createdBy, inviteCode],
  );
  await query(
    "INSERT INTO location_members (id, location_id, user_id, role) VALUES ($1, $2, $3, 'admin')",
    [generateUuid(), id, createdBy],
  );
}

function makeBin(overrides: Partial<ExportBin> & { id: string; name: string }): ExportBin {
  return {
    location: '',
    items: [],
    notes: '',
    tags: [],
    icon: '',
    color: '',
    photos: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

const USER_ID = 'user-1';
const LOCATION_ID = 'loc-1';

beforeEach(async () => {
  await createUser(USER_ID, 'testuser');
  await createLocation(LOCATION_ID, 'Test Location', USER_ID);
});

// ---------------------------------------------------------------------------
// buildDryRunPreview
// ---------------------------------------------------------------------------

describe('buildDryRunPreview', () => {
  it('replace mode puts all bins in toCreate', async () => {
    const bins = [
      { name: 'Bin A', id: 'aaa', items: [{ name: 'wrench' }], tags: ['tool'] },
      { name: 'Bin B', id: 'bbb', items: [], tags: [] },
    ];
    const result = await buildDryRunPreview(bins, 'replace');
    expect(result.preview).toBe(true);
    expect(result.toCreate).toHaveLength(2);
    expect(result.toSkip).toHaveLength(0);
    expect(result.totalBins).toBe(2);
    expect(result.totalItems).toBe(1);
  });

  it('merge mode skips existing bin IDs', async () => {
    // Insert a bin into DB so it exists
    const db = getDb();
    db.prepare(
      'INSERT INTO bins (id, short_code, location_id, name, area_id, notes, icon, color, created_by) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?)',
    ).run('existid', 'EXTBIN', LOCATION_ID, 'Existing', '', '', '', USER_ID);

    const bins = [
      { name: 'Existing', id: 'existid', shortCode: 'EXTBIN', items: [], tags: [] },
      { name: 'New Bin', id: 'newbin', shortCode: 'NEWBIN', items: [{ name: 'item1' }, { name: 'item2' }], tags: ['a'] },
    ];
    const result = await buildDryRunPreview(bins, 'merge', LOCATION_ID);
    expect(result.toSkip).toHaveLength(1);
    expect(result.toSkip[0].name).toBe('Existing');
    expect(result.toSkip[0].reason).toBe('already exists');
    expect(result.toCreate).toHaveLength(1);
    expect(result.toCreate[0].name).toBe('New Bin');
  });

  it('returns empty arrays for empty bins input', async () => {
    const result = await buildDryRunPreview([], 'merge');
    expect(result.toCreate).toEqual([]);
    expect(result.toSkip).toEqual([]);
    expect(result.totalBins).toBe(0);
    expect(result.totalItems).toBe(0);
  });

  it('counts totalItems across all bins', async () => {
    const bins = [
      { name: 'A', id: 'a1', items: [{ name: 'x' }, { name: 'y' }], tags: [] },
      { name: 'B', id: 'b1', items: [{ name: 'z' }], tags: [] },
      { name: 'C', id: 'c1', items: [], tags: [] },
    ];
    const result = await buildDryRunPreview(bins, 'replace');
    expect(result.totalItems).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// lookupArea
// ---------------------------------------------------------------------------

describe('lookupArea', () => {
  it('returns null for non-existent area', async () => {
    expect(await lookupArea(LOCATION_ID, 'NoSuchArea')).toBeNull();
  });

  it('returns area ID for existing top-level area', async () => {
    const areaId = generateUuid();
    const db = getDb();
    db.prepare(
      'INSERT INTO areas (id, location_id, name, parent_id, created_by) VALUES (?, ?, ?, NULL, ?)',
    ).run(areaId, LOCATION_ID, 'Garage', USER_ID);

    expect(await lookupArea(LOCATION_ID, 'Garage')).toBe(areaId);
  });

  it('handles nested path "Parent / Child"', async () => {
    const db = getDb();
    const parentId = generateUuid();
    const childId = generateUuid();
    db.prepare(
      'INSERT INTO areas (id, location_id, name, parent_id, created_by) VALUES (?, ?, ?, NULL, ?)',
    ).run(parentId, LOCATION_ID, 'Garage', USER_ID);
    db.prepare(
      'INSERT INTO areas (id, location_id, name, parent_id, created_by) VALUES (?, ?, ?, ?, ?)',
    ).run(childId, LOCATION_ID, 'Shelf A', parentId, USER_ID);

    expect(await lookupArea(LOCATION_ID, 'Garage / Shelf A')).toBe(childId);
  });

  it('returns null if any path segment is missing', async () => {
    const db = getDb();
    const parentId = generateUuid();
    db.prepare(
      'INSERT INTO areas (id, location_id, name, parent_id, created_by) VALUES (?, ?, ?, NULL, ?)',
    ).run(parentId, LOCATION_ID, 'Garage', USER_ID);

    // "Garage" exists but "Shelf B" does not
    expect(await lookupArea(LOCATION_ID, 'Garage / Shelf B')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// executeFullImportTransaction
// ---------------------------------------------------------------------------

describe('executeFullImportTransaction', () => {
  it('merge mode imports new bins and skips existing', async () => {
    const db = getDb();
    db.prepare(
      'INSERT INTO bins (id, short_code, location_id, name, area_id, notes, icon, color, created_by) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?)',
    ).run('exist1', 'EXT001', LOCATION_ID, 'Existing Bin', '', '', '', USER_ID);

    const result = await executeFullImportTransaction({
      locationId: LOCATION_ID,
      userId: USER_ID,
      isAdmin: true,
      importMode: 'merge',
      bins: [
        makeBin({ id: 'exist1', name: 'Existing Bin', shortCode: 'EXT001' }),
        makeBin({ id: 'new111', name: 'New Bin', items: ['screwdriver'] }),
      ],
    });

    expect(result.binsImported).toBe(1);
    expect(result.binsSkipped).toBe(1);
    // The new bin should exist in DB
    const rows = querySync('SELECT name FROM bins WHERE location_id = $1', [LOCATION_ID]);
    const names = rows.rows.map((r) => r.name);
    expect(names).toContain('Existing Bin');
    expect(names).toContain('New Bin');
  });

  it('replace mode clears existing bins and imports all', async () => {
    const db = getDb();
    db.prepare(
      'INSERT INTO bins (id, short_code, location_id, name, area_id, notes, icon, color, created_by) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?)',
    ).run('old111', 'OLD111', LOCATION_ID, 'Old Bin', '', '', '', USER_ID);

    const result = await executeFullImportTransaction({
      locationId: LOCATION_ID,
      userId: USER_ID,
      isAdmin: true,
      importMode: 'replace',
      bins: [
        makeBin({ id: 'imp111', name: 'Imported Bin' }),
      ],
    });

    expect(result.binsImported).toBe(1);
    expect(result.binsSkipped).toBe(0);
    // Old bin should be gone
    const rows = querySync('SELECT name FROM bins WHERE location_id = $1 AND deleted_at IS NULL', [LOCATION_ID]);
    const names = rows.rows.map((r) => r.name);
    expect(names).not.toContain('Old Bin');
    expect(names).toContain('Imported Bin');
  });

  it('imports tag colors', async () => {
    await executeFullImportTransaction({
      locationId: LOCATION_ID,
      userId: USER_ID,
      isAdmin: false,
      importMode: 'merge',
      bins: [],
      tagColors: [
        { tag: 'urgent', color: '#ff0000' },
        { tag: 'low', color: '#00ff00' },
      ],
    });

    const rows = querySync('SELECT tag, color FROM tag_colors WHERE location_id = $1', [LOCATION_ID]);
    expect(rows.rows).toHaveLength(2);
    const tags = rows.rows.map((r) => r.tag);
    expect(tags).toContain('urgent');
    expect(tags).toContain('low');
  });

  it('imports areas hierarchy', async () => {
    const result = await executeFullImportTransaction({
      locationId: LOCATION_ID,
      userId: USER_ID,
      isAdmin: false,
      importMode: 'merge',
      bins: [],
      areas: [
        { path: 'Garage' },
        { path: 'Garage / Shelf A' },
        { path: 'Kitchen' },
      ],
    });

    expect(result.areasImported).toBe(3);
    // Verify hierarchy
    const garage = querySync(
      'SELECT id FROM areas WHERE location_id = $1 AND name = $2 AND parent_id IS NULL',
      [LOCATION_ID, 'Garage'],
    );
    expect(garage.rows).toHaveLength(1);
    const shelfA = querySync(
      'SELECT id FROM areas WHERE location_id = $1 AND name = $2 AND parent_id = $3',
      [LOCATION_ID, 'Shelf A', (garage.rows[0] as { id: string }).id],
    );
    expect(shelfA.rows).toHaveLength(1);
  });

  it('imports custom field definitions and maps to bin values', async () => {
    const result = await executeFullImportTransaction({
      locationId: LOCATION_ID,
      userId: USER_ID,
      isAdmin: false,
      importMode: 'merge',
      bins: [
        makeBin({
          id: 'cf1111',
          name: 'Bin With Fields',
          customFields: { Weight: '5kg', Color: 'Red' },
        }),
      ],
      customFieldDefinitions: [
        { name: 'Weight', position: 0 },
        { name: 'Color', position: 1 },
      ],
    });

    expect(result.binsImported).toBe(1);

    // Custom field definitions should exist
    const defs = querySync(
      'SELECT id, name FROM location_custom_fields WHERE location_id = $1 ORDER BY position',
      [LOCATION_ID],
    );
    expect(defs.rows).toHaveLength(2);
    const defNames = defs.rows.map((r) => r.name);
    expect(defNames).toContain('Weight');
    expect(defNames).toContain('Color');

    // Bin should have custom field values (mapped by field ID, not name)
    const binRow = querySync("SELECT id FROM bins WHERE location_id = $1 AND name = 'Bin With Fields'", [LOCATION_ID]);
    expect(binRow.rows).toHaveLength(1);
    const binId = (binRow.rows[0] as { id: string }).id;
    const vals = querySync(
      'SELECT field_id, value FROM bin_custom_field_values WHERE bin_id = $1',
      [binId],
    );
    expect(vals.rows).toHaveLength(2);
  });

  it('imports trashed bins with deleted_at set', async () => {
    const deletedAt = '2025-01-15T00:00:00.000Z';
    const result = await executeFullImportTransaction({
      locationId: LOCATION_ID,
      userId: USER_ID,
      isAdmin: false,
      importMode: 'merge',
      bins: [makeBin({ id: 'act111', name: 'Active Bin' })],
      trashedBins: [
        makeBin({ id: 'trsh11', name: 'Trashed Bin', deletedAt }),
        makeBin({ id: 'trsh22', name: 'Trashed Bin 2', deletedAt: '2025-02-01T00:00:00.000Z' }),
      ],
    });

    expect(result.binsImported).toBe(1);
    expect(result.trashedBinsImported).toBe(2);

    // Trashed bins should have deleted_at set
    const trashed = querySync(
      'SELECT name, deleted_at FROM bins WHERE location_id = $1 AND deleted_at IS NOT NULL',
      [LOCATION_ID],
    );
    expect(trashed.rows).toHaveLength(2);
    const trashedNames = trashed.rows.map((r) => r.name);
    expect(trashedNames).toContain('Trashed Bin');
    expect(trashedNames).toContain('Trashed Bin 2');

    // Active bin should NOT have deleted_at
    const active = querySync(
      "SELECT deleted_at FROM bins WHERE location_id = $1 AND name = 'Active Bin'",
      [LOCATION_ID],
    );
    expect(active.rows).toHaveLength(1);
    expect((active.rows[0] as { deleted_at: string | null }).deleted_at).toBeNull();
  });

  it('imports pinned bins', async () => {
    const result = await executeFullImportTransaction({
      locationId: LOCATION_ID,
      userId: USER_ID,
      isAdmin: false,
      importMode: 'merge',
      bins: [
        makeBin({ id: 'pin111', name: 'Pinned Bin' }),
        makeBin({ id: 'pin222', name: 'Also Pinned' }),
      ],
      pinnedBins: [
        { userId: USER_ID, binId: 'pin111', position: 0 },
        { userId: USER_ID, binId: 'pin222', position: 1 },
      ],
    });

    expect(result.binsImported).toBe(2);
    expect(result.pinsImported).toBe(2);

    // Verify pinned_bins table has entries with the new bin IDs
    const pins = querySync(
      'SELECT bin_id, position FROM pinned_bins WHERE user_id = $1 ORDER BY position',
      [USER_ID],
    );
    expect(pins.rows).toHaveLength(2);
    expect((pins.rows[0] as { position: number }).position).toBe(0);
    expect((pins.rows[1] as { position: number }).position).toBe(1);
  });

  it('imports location settings in replace mode as admin', async () => {
    const settings = {
      activityRetentionDays: 60,
      trashRetentionDays: 14,
      appName: 'My Custom App',
      termBin: 'Container',
      termLocation: 'Warehouse',
      termArea: 'Zone',
      defaultJoinRole: 'viewer' as const,
    };

    const result = await executeFullImportTransaction({
      locationId: LOCATION_ID,
      userId: USER_ID,
      isAdmin: true,
      importMode: 'replace',
      bins: [],
      locationSettings: settings,
    });

    expect(result.settingsApplied).toBe(true);

    // Verify settings were applied to the location
    const loc = querySync('SELECT activity_retention_days, trash_retention_days, app_name, term_bin, term_location, term_area, default_join_role FROM locations WHERE id = $1', [LOCATION_ID]);
    expect(loc.rows).toHaveLength(1);
    const row = loc.rows[0] as Record<string, unknown>;
    expect(row.activity_retention_days).toBe(60);
    expect(row.trash_retention_days).toBe(14);
    expect(row.app_name).toBe('My Custom App');
    expect(row.term_bin).toBe('Container');
    expect(row.term_location).toBe('Warehouse');
    expect(row.term_area).toBe('Zone');
    expect(row.default_join_role).toBe('viewer');
  });

  it('does NOT apply location settings when not admin (replace mode blocked)', async () => {
    await expect(executeFullImportTransaction({
      locationId: LOCATION_ID,
      userId: USER_ID,
      isAdmin: false,
      importMode: 'replace',
      bins: [],
      locationSettings: {
        activityRetentionDays: 99,
        trashRetentionDays: 99,
        appName: 'Should Not Apply',
        termBin: 'X',
        termLocation: 'X',
        termArea: 'X',
        defaultJoinRole: 'viewer',
      },
    })).rejects.toThrow('Only admins can use replace mode');
  });

  it('does NOT apply location settings in merge mode', async () => {
    const result = await executeFullImportTransaction({
      locationId: LOCATION_ID,
      userId: USER_ID,
      isAdmin: true,
      importMode: 'merge',
      bins: [],
      locationSettings: {
        activityRetentionDays: 99,
        trashRetentionDays: 99,
        appName: 'Should Not Apply',
        termBin: 'X',
        termLocation: 'X',
        termArea: 'X',
        defaultJoinRole: 'viewer',
      },
    });

    expect(result.settingsApplied).toBe(false);
  });

  it('transaction is atomic: partial failure rolls back', async () => {
    const db = getDb();
    // Insert a bin so we can verify it survives a failed replace import
    db.prepare(
      'INSERT INTO bins (id, short_code, location_id, name, area_id, notes, icon, color, created_by) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?)',
    ).run('keep11', 'KEP011', LOCATION_ID, 'Keep Me', '', '', '', USER_ID);

    // Create a bin with a name that will trigger an error inside the transaction
    // by making the DB throw (e.g., violate a NOT NULL constraint on a required field)
    const badBin = makeBin({ id: 'bad111', name: null as unknown as string });

    try {
      await executeFullImportTransaction({
        locationId: LOCATION_ID,
        userId: USER_ID,
          isAdmin: true,
        importMode: 'replace',
        bins: [badBin],
      });
    } catch {
      // Expected to throw
    }

    // The original bin should still exist because replace cleanup was rolled back
    const rows = querySync("SELECT id FROM bins WHERE id = 'keep11'", []);
    expect(rows.rows).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Nested boxes and loose items
// ---------------------------------------------------------------------------

function insertBinRow(id: string, shortCode: string, name: string, extra: { parent?: string; visibility?: string; createdBy?: string; deletedAt?: string; areaId?: string } = {}) {
  getDb().prepare(
    'INSERT INTO bins (id, short_code, location_id, name, area_id, notes, icon, color, created_by, parent_bin_id, visibility, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(id, shortCode, LOCATION_ID, name, extra.areaId ?? null, '', '', '', extra.createdBy ?? USER_ID, extra.parent ?? null, extra.visibility ?? 'location', extra.deletedAt ?? null);
}

describe('planBinImport', () => {
  const top = (shortCode: string, name = shortCode, extra: Partial<ExportBin> = {}) => makeBin({ id: shortCode, name, shortCode, ...extra });

  it('orders top-level bins before children and resolves a payload parent', async () => {
    const plan = await planBinImport(query, {
      locationId: LOCATION_ID, userId: USER_ID, mode: 'merge',
      bins: [top('KID111', 'Kid', { parentShortCode: 'PAR111' }), top('PAR111', 'Parent')],
    });
    expect(plan.map((e) => [e.bin.name, e.status, e.isChild])).toEqual([['Parent', 'create', false], ['Kid', 'create', true]]);
    expect(plan[1].parent).toEqual({ kind: 'payload', shortCode: 'PAR111' });
  });

  it('flags unresolved parents: missing, self, grandchild, and a child of a child', async () => {
    const plan = await planBinImport(query, {
      locationId: LOCATION_ID, userId: USER_ID, mode: 'merge',
      bins: [
        top('PAR111', 'Parent'),
        top('KID111', 'Kid', { parentShortCode: 'PAR111' }),
        top('GRK111', 'Grandkid', { parentShortCode: 'KID111' }),
        top('ORP111', 'Orphan', { parentShortCode: 'NOPE11' }),
        top('SLF111', 'Self', { parentShortCode: 'SLF111' }),
      ],
    });
    expect(plan.filter((e) => e.status === 'unresolved_parent').map((e) => e.bin.name).sort()).toEqual(['Grandkid', 'Orphan', 'Self']);
    expect(plan.find((e) => e.bin.name === 'Grandkid')?.reason).toMatch(/can't contain bins/);
  });

  it('resolves against an existing bin when the payload parent is skipped in merge mode', async () => {
    insertBinRow('exist1', 'PAR111', 'Existing parent');
    const plan = await planBinImport(query, {
      locationId: LOCATION_ID, userId: USER_ID, mode: 'merge',
      bins: [top('PAR111', 'Parent'), top('KID111', 'Kid', { parentShortCode: 'PAR111' })],
    });
    expect(plan[0].status).toBe('exists');
    expect(plan[1].status).toBe('create');
    expect(plan[1].parent).toEqual({ kind: 'db', node: { id: 'exist1', area_id: null, visibility: 'location' } });
  });

  it('in replace mode existing bins are ignored (they are about to be deleted)', async () => {
    insertBinRow('exist1', 'PAR111', 'Existing parent');
    const plan = await planBinImport(query, {
      locationId: LOCATION_ID, userId: USER_ID, mode: 'replace',
      bins: [top('KID111', 'Kid', { parentShortCode: 'PAR111' })],
    });
    expect(plan[0].status).toBe('unresolved_parent');
  });

  it('an existing parent that is itself a child, or private to someone else, is unresolvable', async () => {
    await createUser('user-2', 'other');
    insertBinRow('top1', 'TOP111', 'Top');
    insertBinRow('kid1', 'KID111', 'Kid', { parent: 'top1' });
    insertBinRow('priv1', 'PRV111', 'Private', { visibility: 'private', createdBy: 'user-2' });
    insertBinRow('mine1', 'MIN111', 'Mine', { visibility: 'private' });
    const plan = await planBinImport(query, {
      locationId: LOCATION_ID, userId: USER_ID, mode: 'merge',
      bins: [
        top('A11111', 'Under child', { parentShortCode: 'KID111' }),
        top('B11111', 'Under foreign private', { parentShortCode: 'PRV111' }),
        top('C11111', 'Under my private', { parentShortCode: 'MIN111' }),
      ],
    });
    expect(plan.map((e) => [e.bin.name, e.status])).toEqual([
      ['Under child', 'unresolved_parent'],
      ['Under foreign private', 'unresolved_parent'],
      ['Under my private', 'create'],
    ]);
  });

  it('a live child under a trashed parent (payload or existing) is planned as trashed with the parent deletedAt', async () => {
    insertBinRow('tp1', 'TPA111', 'Trashed existing', { deletedAt: '2025-05-05 05:05:05' });
    const plan = await planBinImport(query, {
      locationId: LOCATION_ID, userId: USER_ID, mode: 'merge',
      bins: [top('L11111', 'Under existing', { parentShortCode: 'TPA111' }), top('L22222', 'Under payload', { parentShortCode: 'TPB111' })],
      trashedBins: [top('TPB111', 'Trashed payload', { deletedAt: '2025-06-06T06:06:06.000Z' })],
    });
    const byName = Object.fromEntries(plan.map((e) => [e.bin.name, e]));
    expect(byName['Under existing'].deletedAt).toBe('2025-05-05 05:05:05');
    expect(byName['Under payload'].deletedAt).toBe('2025-06-06T06:06:06.000Z');
  });

  it('a trashed bin without deletedAt is still imported trashed', async () => {
    const plan = await planBinImport(query, { locationId: LOCATION_ID, mode: 'merge', bins: [], trashedBins: [top('T11111')] });
    expect(plan[0].deletedAt).not.toBeNull();
  });

  it('merge treats a repeated short code in the payload as already existing, like the real insert does', async () => {
    const plan = await planBinImport(query, { locationId: LOCATION_ID, mode: 'merge', bins: [top('DUP111', 'One'), top('DUP111', 'Two')] });
    expect(plan.map((e) => e.status)).toEqual(['create', 'exists']);
  });

  it('validates every bin', async () => {
    await expect(planBinImport(query, { locationId: LOCATION_ID, mode: 'merge', bins: [makeBin({ id: 'x', name: '' })] })).rejects.toThrow(/name is required/i);
  });
});

describe('dry run equals import', () => {
  it('has the same skip counts as the real import, including children and loose items', async () => {
    insertBinRow('exist1', 'EXI111', 'Existing');
    const bins = [
      makeBin({ id: 'a', name: 'Existing', shortCode: 'EXI111' }),
      makeBin({ id: 'b', name: 'Under existing', shortCode: 'UND111', parentShortCode: 'EXI111' }),
      makeBin({ id: 'c', name: 'Orphan', shortCode: 'ORP111', parentShortCode: 'NOPE11' }),
      makeBin({ id: 'd', name: 'Fresh', shortCode: 'FRE111' }),
    ];
    const trashedBins = [makeBin({ id: 'e', name: 'Trashed kid', shortCode: 'TKD111', parentShortCode: 'FRE111', deletedAt: '2025-01-01T00:00:00.000Z' })];
    const areas = [{ path: 'Garage', items: ['Tape', 'Saw'] }];
    const unassignedItems = ['Rope'];

    const dry = await buildDryRunPreview(bins, 'merge', LOCATION_ID, { trashedBins, areas, unassignedItems, userId: USER_ID });
    const real = await executeFullImportTransaction({ locationId: LOCATION_ID, userId: USER_ID, isAdmin: true, importMode: 'merge', bins, trashedBins, areas, unassignedItems });

    expect(dry.binsSkippedUnresolvedParent).toBe(real.binsSkippedUnresolvedParent);
    expect(dry.binsSkippedUnresolvedParent).toBe(1);
    expect(dry.toCreate).toHaveLength(real.binsImported + real.trashedBinsImported);
    expect(dry.toSkip).toHaveLength(real.binsSkipped + real.trashedBinsSkipped + real.binsSkippedUnresolvedParent);
    expect(dry.looseItemsToCreate).toBe(real.looseItemsImported);
    expect(dry.looseItemsToSkip).toBe(real.looseItemsSkipped);
    expect(dry.toCreate.filter((c) => c.trashed)).toHaveLength(real.trashedBinsImported);
  });
});

describe('loose items', () => {
  async function insertLoose(name: string, areaId: string | null) {
    await query('INSERT INTO bin_items (id, bin_id, area_id, location_id, name, position) VALUES ($1, NULL, $2, $3, $4, 0)', [generateUuid(), areaId, LOCATION_ID, name]);
  }

  it('collectLooseGroups merges entries of the same area, normalises paths and drops junk', () => {
    const groups = collectLooseGroups(
      [{ path: ' Garage/ Shelf ', items: ['A', { name: 'B', quantity: 2.9 }] }, { path: 'Garage / Shelf', items: ['C', ' ', { name: 'D', quantity: 0 }] }, { path: 'NoItems' }],
      ['U1'],
    );
    expect(groups).toEqual([
      { path: 'Garage / Shelf', items: [
        { name: 'A', quantity: null, position: 0 },
        { name: 'B', quantity: 2, position: 1 },
        { name: 'C', quantity: null, position: 2 },
        { name: 'D', quantity: 1, position: 3 },
      ] },
      { path: '', items: [{ name: 'U1', quantity: null, position: 0 }] },
    ]);
    expect(() => collectLooseGroups(undefined, 'nope')).toThrow(/array/);
  });

  it('merge: an area that does not exist yet has nothing to match; unassigned matches unassigned only', async () => {
    const garage = generateUuid();
    await query('INSERT INTO areas (id, location_id, name, parent_id, created_by) VALUES ($1, $2, $3, NULL, $4)', [garage, LOCATION_ID, 'Garage', USER_ID]);
    await insertLoose('Tape', garage);
    await insertLoose('Rope', null);
    const plan = await planLooseItems(query, {
      locationId: LOCATION_ID, mode: 'merge',
      groups: collectLooseGroups([{ path: 'Garage', items: ['Rope', 'Tape'] }, { path: 'Attic', items: ['Tape'] }], ['Tape', 'Rope']),
    });
    expect(plan.groups.map((g) => [g.path, g.create.map((i) => i.name), g.skipped])).toEqual([
      ['Garage', ['Rope'], 1],
      ['Attic', ['Tape'], 0],
      ['', ['Tape'], 1],
    ]);
  });

  it('replace never skips and import deletes the old loose items first', async () => {
    await insertLoose('Old', null);
    const result = await executeFullImportTransaction({
      locationId: LOCATION_ID, userId: USER_ID, isAdmin: true, importMode: 'replace', bins: [], unassignedItems: ['Old', 'New'],
    });
    expect(result.looseItemsImported).toBe(2);
    expect(result.looseItemsSkipped).toBe(0);
    const rows = querySync('SELECT name, bin_id, area_id, location_id FROM bin_items WHERE location_id = $1 ORDER BY position', [LOCATION_ID]);
    expect(rows.rows).toEqual([
      { name: 'Old', bin_id: null, area_id: null, location_id: LOCATION_ID },
      { name: 'New', bin_id: null, area_id: null, location_id: LOCATION_ID },
    ]);
  });

  it('replace is admin only and leaves nothing behind when refused', async () => {
    await insertLoose('Keep', null);
    await expect(executeFullImportTransaction({
      locationId: LOCATION_ID, userId: USER_ID, isAdmin: false, importMode: 'replace', bins: [], unassignedItems: ['X'],
    })).rejects.toThrow(/admin/i);
    expect(querySync('SELECT name FROM bin_items WHERE location_id = $1', [LOCATION_ID]).rows).toEqual([{ name: 'Keep' }]);
  });

  it('an area that only holds loose items is created', async () => {
    await executeFullImportTransaction({
      locationId: LOCATION_ID, userId: USER_ID, isAdmin: false, importMode: 'merge', bins: [], areas: [{ path: 'Only / Loose', items: ['Thing'] }],
    });
    expect(await lookupArea(LOCATION_ID, 'Only / Loose')).not.toBeNull();
    const row = querySync('SELECT area_id FROM bin_items WHERE location_id = $1', [LOCATION_ID]).rows[0] as { area_id: string };
    expect(row.area_id).toBe(await lookupArea(LOCATION_ID, 'Only / Loose'));
  });

  it('clamps bin item quantities to positive integers', async () => {
    await executeFullImportTransaction({
      locationId: LOCATION_ID, userId: USER_ID, isAdmin: false, importMode: 'merge',
      bins: [makeBin({ id: 'q1', name: 'Q', items: [{ name: 'neg', quantity: -3 }, { name: 'frac', quantity: 2.8 }, { name: 'ok', quantity: 4 }, 'none'] })],
    });
    const rows = querySync('SELECT name, quantity FROM bin_items WHERE location_id = $1 ORDER BY position', [LOCATION_ID]);
    expect(rows.rows).toEqual([{ name: 'neg', quantity: 1 }, { name: 'frac', quantity: 2 }, { name: 'ok', quantity: 4 }, { name: 'none', quantity: null }]);
  });
});
