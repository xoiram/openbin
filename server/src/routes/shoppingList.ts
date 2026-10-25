import { Router } from 'express';
import { generateUuid, query, withTransaction } from '../db.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { requireMemberOrAbove, verifyAreaInLocation, verifyBinAccess } from '../lib/binAccess.js';
import { NotFoundError, ValidationError } from '../lib/httpErrors.js';
import { logRouteActivity } from '../lib/routeHelpers.js';
import { authenticate } from '../middleware/auth.js';
import { requireLocationMember } from '../middleware/locationAccess.js';

const MAX_NAME_LEN = 200;
const MAX_BULK = 50;

interface EntryRow {
  id: string;
  location_id: string;
  name: string;
  origin_bin_id: string | null;
  origin_bin_name: string | null;
  origin_bin_icon: string | null;
  origin_bin_color: string | null;
  origin_bin_deleted_at: string | null;
  origin_area_id: string | null;
  origin_area_name: string | null;
  created_by: string;
  created_by_name: string;
  created_at: string;
}

// An entry's origin is a bin, an area, or nothing. Area/no origin entries are visible to every member.
const ENTRY_SELECT = `SELECT s.id, s.location_id, s.name, s.origin_bin_id,
            b.name AS origin_bin_name, b.icon AS origin_bin_icon, b.color AS origin_bin_color,
            b.deleted_at AS origin_bin_deleted_at,
            s.origin_area_id, ar.name AS origin_area_name,
            s.created_by, u.display_name AS created_by_name, s.created_at
     FROM shopping_list_items s
     LEFT JOIN bins b ON b.id = s.origin_bin_id
     LEFT JOIN areas ar ON ar.id = s.origin_area_id
     JOIN users u ON u.id = s.created_by`;

function mapEntry(r: EntryRow) {
  return {
    id: r.id,
    location_id: r.location_id,
    name: r.name,
    origin_bin_id: r.origin_bin_id,
    origin_bin_name: r.origin_bin_name,
    origin_bin_icon: r.origin_bin_icon,
    origin_bin_color: r.origin_bin_color,
    origin_bin_trashed: r.origin_bin_deleted_at !== null,
    origin_area_id: r.origin_area_id,
    origin_area_name: r.origin_area_name,
    created_by: r.created_by,
    created_by_name: r.created_by_name,
    created_at: r.created_at,
  };
}

// ── Bin-nested router (mounted at /api/bins) ─────────────────────────
export const binShoppingListRouter = Router();
binShoppingListRouter.use(authenticate);

// POST /api/bins/:id/shopping-list — bulk-add from a bin (undo-toast path)
binShoppingListRouter.post('/:id/shopping-list', asyncHandler(async (req, res) => {
  const { id: binId } = req.params;
  const userId = req.user!.id;
  const rawNames: unknown = req.body?.names;

  if (!Array.isArray(rawNames)) {
    throw new ValidationError('names must be an array');
  }
  if (rawNames.length === 0) {
    throw new ValidationError('names must not be empty');
  }
  if (rawNames.length > MAX_BULK) {
    throw new ValidationError(`names must contain at most ${MAX_BULK} items`);
  }
  const names: string[] = [];
  for (const n of rawNames) {
    if (typeof n !== 'string') throw new ValidationError('each name must be a string');
    const trimmed = n.trim();
    if (!trimmed) throw new ValidationError('names cannot be empty strings');
    if (trimmed.length > MAX_NAME_LEN) throw new ValidationError(`name too long (max ${MAX_NAME_LEN})`);
    names.push(trimmed);
  }

  const access = await verifyBinAccess(binId, userId);
  if (!access) throw new NotFoundError('Bin not found');

  await requireMemberOrAbove(access.locationId, userId, 'add to shopping list');

  const inserted = await withTransaction(async (txQuery) => {
    const rows: Array<{ id: string; name: string }> = [];
    for (const name of names) {
      const id = generateUuid();
      await txQuery(
        `INSERT INTO shopping_list_items (id, location_id, name, origin_bin_id, created_by, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, access.locationId, name, binId, userId, new Date().toISOString()],
      );
      rows.push({ id, name });
    }
    return rows;
  });

  // Fetch with JOIN so the client gets the full entry shape in one shot.
  const placeholders = inserted.map((_, i) => `$${i + 1}`).join(', ');
  const entries = await query<EntryRow>(
    `${ENTRY_SELECT}
     WHERE s.id IN (${placeholders})
     ORDER BY s.created_at ASC, s.id ASC`,
    inserted.map((e) => e.id),
  );

  logRouteActivity(req, {
    locationId: access.locationId,
    action: 'create',
    entityType: 'shopping_list',
    entityId: binId,
    entityName: access.name,
    changes: { added: { old: null, new: names } },
  });

  const mapped = entries.rows.map(mapEntry);

  res.status(201).json({ entries: mapped, count: mapped.length });
}));

export default binShoppingListRouter;

// ── Location-nested router (mounted at /api/locations) ────────────────
export const locationShoppingListRouter = Router();
locationShoppingListRouter.use(authenticate);

// GET /api/locations/:locationId/shopping-list
locationShoppingListRouter.get(
  '/:locationId/shopping-list',
  requireLocationMember('locationId'),
  asyncHandler(async (req, res) => {
    const { locationId } = req.params;
    const userId = req.user!.id;

    const result = await query<EntryRow>(
      `${ENTRY_SELECT}
       WHERE s.location_id = $1
         AND (
           s.origin_bin_id IS NULL
           OR b.visibility = 'location'
           OR (b.visibility = 'private' AND b.created_by = $2)
         )
       ORDER BY s.created_at DESC`,
      [locationId, userId],
    );

    const rows = result.rows.map(mapEntry);

    res.json({ results: rows, count: rows.length });
  }),
);

// ── Flat router for entry-level ops (mounted at /api/shopping-list) ──
export const shoppingListRouter = Router();
shoppingListRouter.use(authenticate);

// POST /api/shopping-list/:id/purchase — mark bought (+ re-add to origin)
shoppingListRouter.post('/:id/purchase', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user!.id;

  const entry = await query<{
    id: string;
    location_id: string;
    name: string;
    origin_bin_id: string | null;
    origin_area_id: string | null;
  }>(
    'SELECT id, location_id, name, origin_bin_id, origin_area_id FROM shopping_list_items WHERE id = $1',
    [id],
  );
  if (entry.rows.length === 0) throw new NotFoundError('Shopping list entry not found');

  const row = entry.rows[0];

  await requireMemberOrAbove(row.location_id, userId, 'mark shopping list item as bought');

  // Re-add the bought item to its origin: the origin bin, or the origin area. If the entry names an
  // area that no longer exists the item goes to the unassigned pool. An entry with no origin, or whose
  // origin bin is trashed/invisible, is just deleted.
  let restored: { binId: string | null; areaId?: string | null; itemId: string; name: string } | null = null;
  let restoredName: string | null = null;
  let home: { binId: string | null; areaId: string | null } | null = null;
  if (row.origin_bin_id) {
    const bin = await query<{ id: string; name: string; deleted_at: string | null; visibility: string; created_by: string | null }>(
      'SELECT id, name, deleted_at, visibility, created_by FROM bins WHERE id = $1',
      [row.origin_bin_id],
    );
    const b = bin.rows[0];
    if (b && b.deleted_at === null && (b.visibility === 'location' || b.created_by === userId)) {
      restoredName = b.name;
      home = { binId: row.origin_bin_id, areaId: null };
    }
  } else if (row.origin_area_id) {
    const area = await query<{ id: string; name: string; location_id: string }>(
      'SELECT id, name, location_id FROM areas WHERE id = $1',
      [row.origin_area_id],
    );
    const ar = area.rows[0];
    if (ar && ar.location_id === row.location_id) {
      restoredName = ar.name;
      home = { binId: null, areaId: ar.id };
    } else {
      home = { binId: null, areaId: null };
    }
  }

  if (home) {
    const newItemId = generateUuid();
    const nowIso = new Date().toISOString();
    const target = home;
    await withTransaction(async (txQuery) => {
      let nextPos = 0;
      if (target.binId) {
        const posResult = await txQuery<{ max_pos: number | null }>(
          'SELECT MAX(position) AS max_pos FROM bin_items WHERE bin_id = $1',
          [target.binId],
        );
        nextPos = (posResult.rows[0]?.max_pos ?? -1) + 1;
      }
      await txQuery(
        `INSERT INTO bin_items (id, bin_id, area_id, location_id, name, quantity, position, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NULL, $6, $7, $8)`,
        [newItemId, target.binId, target.areaId, row.location_id, row.name, nextPos, nowIso, nowIso],
      );
      if (target.binId) {
        await txQuery(`UPDATE bins SET updated_at = $1 WHERE id = $2`, [nowIso, target.binId]);
      }
      await txQuery('DELETE FROM shopping_list_items WHERE id = $1', [id]);
    });
    restored = target.binId
      ? { binId: target.binId, itemId: newItemId, name: row.name }
      : { binId: null, areaId: target.areaId, itemId: newItemId, name: row.name };
  } else {
    await query('DELETE FROM shopping_list_items WHERE id = $1', [id]);
  }
  const restoredBinName = restoredName;

  logRouteActivity(req, {
    locationId: row.location_id,
    action: 'delete',
    entityType: 'shopping_list',
    entityId: id,
    entityName: row.name,
    changes: {
      purchased: {
        old: row.name,
        new: restoredBinName ? `→ ${restoredBinName}` : null,
      },
    },
  });

  if (restored) {
    const entity = restored.binId
      ? { entityType: 'bin', entityId: restored.binId }
      : restored.areaId
        ? { entityType: 'area', entityId: restored.areaId }
        : { entityType: 'location', entityId: row.location_id };
    logRouteActivity(req, {
      locationId: row.location_id,
      action: 'update',
      ...entity,
      entityName: restored.binId || restored.areaId ? (restoredName ?? row.name) : row.name,
      changes: { items_added: { old: null, new: [row.name] } },
    });
  }

  res.json({ deleted: true, restored });
}));

// DELETE /api/shopping-list/:id — remove without purchase
shoppingListRouter.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user!.id;

  const entry = await query<{ id: string; location_id: string; name: string }>(
    'SELECT id, location_id, name FROM shopping_list_items WHERE id = $1',
    [id],
  );
  if (entry.rows.length === 0) throw new NotFoundError('Shopping list entry not found');

  const row = entry.rows[0];
  await requireMemberOrAbove(row.location_id, userId, 'remove shopping list item');

  await query('DELETE FROM shopping_list_items WHERE id = $1', [id]);

  logRouteActivity(req, {
    locationId: row.location_id,
    action: 'delete',
    entityType: 'shopping_list',
    entityId: id,
    entityName: row.name,
    changes: { removed: { old: row.name, new: null } },
  });

  res.json({ ok: true });
}));

// POST /api/locations/:locationId/shopping-list — manual add
locationShoppingListRouter.post(
  '/:locationId/shopping-list',
  requireLocationMember('locationId'),
  asyncHandler(async (req, res) => {
    const { locationId } = req.params;
    const userId = req.user!.id;
    const rawName: unknown = req.body?.name;
    const rawOriginBinId: unknown = req.body?.originBinId;
    const rawOriginAreaId: unknown = req.body?.originAreaId;

    if (typeof rawName !== 'string') throw new ValidationError('name is required');
    const name = rawName.trim();
    if (!name) throw new ValidationError('name cannot be empty');
    if (name.length > MAX_NAME_LEN) throw new ValidationError(`name too long (max ${MAX_NAME_LEN})`);

    let originBinId: string | null = null;
    if (rawOriginBinId != null && rawOriginBinId !== '') {
      if (typeof rawOriginBinId !== 'string') throw new ValidationError('originBinId must be a string');
      const access = await verifyBinAccess(rawOriginBinId, userId);
      if (!access || access.locationId !== locationId) {
        throw new NotFoundError('Bin not found');
      }
      originBinId = rawOriginBinId;
    }

    let originAreaId: string | null = null;
    if (rawOriginAreaId != null && rawOriginAreaId !== '') {
      if (typeof rawOriginAreaId !== 'string') throw new ValidationError('originAreaId must be a string');
      if (originBinId) throw new ValidationError('Provide only one of originBinId or originAreaId');
      await verifyAreaInLocation(rawOriginAreaId, locationId);
      originAreaId = rawOriginAreaId;
    }

    await requireMemberOrAbove(locationId, userId, 'add to shopping list');

    const id = generateUuid();
    await query(
      `INSERT INTO shopping_list_items (id, location_id, name, origin_bin_id, origin_area_id, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, locationId, name, originBinId, originAreaId, userId, new Date().toISOString()],
    );

    const result = await query<EntryRow>(
      `${ENTRY_SELECT}
       WHERE s.id = $1`,
      [id],
    );

    const entry = mapEntry(result.rows[0]);

    logRouteActivity(req, {
      locationId,
      action: 'create',
      entityType: 'shopping_list',
      entityId: id,
      entityName: name,
      changes: { added: { old: null, new: name } },
    });

    res.status(201).json({ entry });
  }),
);
