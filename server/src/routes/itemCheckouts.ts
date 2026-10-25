import { Router } from 'express';
import { d, generateUuid, query, type TxQueryFn, withTransaction } from '../db.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { requireMemberOrAbove, verifyBinAccess } from '../lib/binAccess.js';
import { validateBulkIds } from '../lib/bulkValidation.js';
import { ConflictError, NotFoundError } from '../lib/httpErrors.js';
import {
  describeHome,
  ITEM_FROM,
  type ItemTarget,
  itemScopePredicate,
  parseItemTarget,
  type ResolvedTarget,
  resolveDefaultReturnHome,
  resolveItemTarget,
  setItemHome,
  touchBins,
} from '../lib/itemQueries.js';
import { logRouteActivity } from '../lib/routeHelpers.js';
import { authenticate } from '../middleware/auth.js';
import { requireLocationMember } from '../middleware/locationAccess.js';

const router = Router();

router.use(authenticate);

// POST /api/bins/:id/items/:itemId/checkout — check out an item
router.post('/:id/items/:itemId/checkout', asyncHandler(async (req, res) => {
  const { id: binId, itemId } = req.params;
  const userId = req.user!.id;

  const access = await verifyBinAccess(binId, userId);
  if (!access) throw new NotFoundError('Bin not found');

  await requireMemberOrAbove(access.locationId, userId, 'check out items');

  // Verify item exists in this bin
  const itemResult = await query<{ name: string }>(
    'SELECT name FROM bin_items WHERE id = $1 AND bin_id = $2 AND deleted_at IS NULL',
    [itemId, binId]
  );
  if (itemResult.rows.length === 0) {
    throw new NotFoundError('Item not found');
  }

  // Check for active checkout
  const existing = await query(
    'SELECT id FROM item_checkouts WHERE item_id = $1 AND returned_at IS NULL',
    [itemId]
  );
  if (existing.rows.length > 0) {
    throw new ConflictError('Item is already checked out');
  }

  const checkoutId = generateUuid();
  await query(
    `INSERT INTO item_checkouts (id, item_id, origin_bin_id, location_id, checked_out_by, checked_out_at)
     VALUES ($1, $2, $3, $4, $5, ${d.now()})`,
    [checkoutId, itemId, binId, access.locationId, userId]
  );

  const checkout = await query<{
    id: string;
    item_id: string;
    origin_bin_id: string;
    location_id: string;
    checked_out_by: string;
    checked_out_at: string;
    returned_at: string | null;
    returned_by: string | null;
    return_bin_id: string | null;
  }>(
    'SELECT * FROM item_checkouts WHERE id = $1',
    [checkoutId]
  );

  logRouteActivity(req, {
    locationId: access.locationId,
    action: 'update',
    entityType: 'bin',
    entityId: binId,
    entityName: access.name,
    changes: { item_checked_out: { old: null, new: itemResult.rows[0].name } },
  });

  res.status(201).json({ checkout: checkout.rows[0] });
}));

// POST /api/bins/:id/items/:itemId/return — return a checked-out item
router.post('/:id/items/:itemId/return', asyncHandler(async (req, res) => {
  const { id: binId, itemId } = req.params;
  const { targetBinId } = req.body ?? {};
  const userId = req.user!.id;

  const access = await verifyBinAccess(binId, userId);
  if (!access) throw new NotFoundError('Bin not found');

  await requireMemberOrAbove(access.locationId, userId, 'return items');

  // Find active checkout
  const activeCheckout = await query<{
    id: string;
    origin_bin_id: string;
  }>(
    'SELECT id, origin_bin_id FROM item_checkouts WHERE item_id = $1 AND returned_at IS NULL',
    [itemId]
  );
  if (activeCheckout.rows.length === 0) {
    throw new NotFoundError('Item is not checked out');
  }

  const checkoutRow = activeCheckout.rows[0];

  // Verify checkout belongs to the bin in the URL (access was checked via verifyBinAccess above)
  if (checkoutRow.origin_bin_id !== binId) {
    throw new NotFoundError('Item is not checked out');
  }

  // Validate targetBinId belongs to same location and user has access
  let returnBinId = checkoutRow.origin_bin_id;
  if (targetBinId && targetBinId !== checkoutRow.origin_bin_id) {
    const targetAccess = await verifyBinAccess(targetBinId, userId);
    if (!targetAccess || targetAccess.locationId !== access.locationId) {
      throw new NotFoundError('Target bin not found in this location');
    }
    await requireMemberOrAbove(targetAccess.locationId, userId, 'return items to target bin');
    returnBinId = targetBinId;
  }

  // Close the checkout
  await query(
    `UPDATE item_checkouts SET returned_at = ${d.now()}, returned_by = $1, return_bin_id = $2, return_area_id = NULL WHERE id = $3`,
    [userId, returnBinId, checkoutRow.id]
  );

  // The item may have been moved (e.g. bulk move into an area) while it was checked out:
  // compare the target with where it is NOW, not with the origin.
  const current = await query<{ bin_id: string | null }>('SELECT bin_id FROM bin_items WHERE id = $1', [itemId]);
  const currentBinId = current.rows[0]?.bin_id ?? null;

  // Get item name for activity logging (used in both branches)
  const itemResult = await query<{ name: string }>('SELECT name FROM bin_items WHERE id = $1 AND deleted_at IS NULL', [itemId]);
  const itemName = itemResult.rows[0]?.name ?? 'Unknown item';

  // If the item is not already in the return bin, move it there
  if (returnBinId !== currentBinId) {
    await setItemHome(query, itemId, { binId: returnBinId, areaId: null });
    await touchBins(query, [checkoutRow.origin_bin_id, currentBinId, returnBinId]);
    const targetBinResult = await query<{ name: string }>('SELECT name FROM bins WHERE id = $1', [returnBinId]);

    logRouteActivity(req, {
      locationId: access.locationId,
      action: 'update',
      entityType: 'bin',
      entityId: checkoutRow.origin_bin_id,
      entityName: access.name,
      changes: { item_returned_to: { old: null, new: targetBinResult.rows[0]?.name } },
    });
    logRouteActivity(req, {
      locationId: access.locationId,
      action: 'update',
      entityType: 'bin',
      entityId: returnBinId,
      entityName: targetBinResult.rows[0]?.name,
      changes: { item_received: { old: null, new: itemName } },
    });
  } else {
    logRouteActivity(req, {
      locationId: access.locationId,
      action: 'update',
      entityType: 'bin',
      entityId: binId,
      entityName: access.name,
      changes: { item_returned: { old: null, new: itemName } },
    });
  }

  // Fetch updated checkout record
  const updated = await query<{
    id: string;
    item_id: string;
    origin_bin_id: string;
    location_id: string;
    checked_out_by: string;
    checked_out_at: string;
    returned_at: string | null;
    returned_by: string | null;
    return_bin_id: string | null;
  }>(
    'SELECT * FROM item_checkouts WHERE id = $1',
    [checkoutRow.id]
  );

  res.json({ checkout: updated.rows[0] });
}));

// GET /api/bins/:id/checkouts — list active checkouts for a bin
router.get('/:id/checkouts', asyncHandler(async (req, res) => {
  const { id: binId } = req.params;
  const userId = req.user!.id;

  const access = await verifyBinAccess(binId, userId);
  if (!access) throw new NotFoundError('Bin not found');

  const result = await query<{
    id: string;
    item_id: string;
    item_name: string;
    origin_bin_id: string;
    location_id: string;
    checked_out_by: string;
    checked_out_by_name: string;
    checked_out_at: string;
  }>(
    `SELECT ic.*, bi.name AS item_name, u.display_name AS checked_out_by_name
     FROM item_checkouts ic
     JOIN bin_items bi ON bi.id = ic.item_id
     JOIN users u ON u.id = ic.checked_out_by
     WHERE ic.origin_bin_id = $1 AND ic.returned_at IS NULL AND bi.deleted_at IS NULL
     ORDER BY ic.checked_out_at DESC`,
    [binId]
  );

  res.json({ results: result.rows, count: result.rows.length });
}));

export default router;

// Location-wide checkouts router
export const locationCheckoutsRouter = Router();

locationCheckoutsRouter.use(authenticate);

/** Shape returned by the location checkouts list: bin and area origin fields are nullable. */
const CHECKOUT_LIST_SELECT = `SELECT ic.*, bi.name AS item_name,
       b.name AS origin_bin_name, b.icon AS origin_bin_icon, b.color AS origin_bin_color,
       a.name AS origin_area_name,
       u.display_name AS checked_out_by_name
     FROM item_checkouts ic
     JOIN bin_items bi ON bi.id = ic.item_id
     LEFT JOIN bins b ON b.id = ic.origin_bin_id
     LEFT JOIN areas a ON a.id = ic.origin_area_id
     JOIN users u ON u.id = ic.checked_out_by`;

// GET /api/locations/:locationId/checkouts — active checkouts across location
locationCheckoutsRouter.get('/:locationId/checkouts', requireLocationMember('locationId'), asyncHandler(async (req, res) => {
  const { locationId } = req.params;

  const result = await query<{
    id: string;
    item_id: string;
    item_name: string;
    origin_bin_id: string | null;
    origin_bin_name: string | null;
    origin_bin_icon: string | null;
    origin_bin_color: string | null;
    origin_area_id: string | null;
    origin_area_name: string | null;
    location_id: string;
    checked_out_by: string;
    checked_out_by_name: string;
    checked_out_at: string;
  }>(
    `${CHECKOUT_LIST_SELECT}
     WHERE ic.location_id = $1 AND ic.returned_at IS NULL AND bi.deleted_at IS NULL
     ORDER BY ic.checked_out_at DESC`,
    [locationId]
  );

  res.json({ results: result.rows, count: result.rows.length });
}));

interface ScopedItem {
  id: string;
  name: string;
  bin_id: string | null;
  area_id: string | null;
}

async function loadScopedItem(txQuery: TxQueryFn, locationId: string, itemId: string, userId: string): Promise<ScopedItem> {
  const r = await txQuery<ScopedItem>(
    `SELECT bi.id, bi.name, bi.bin_id, bi.area_id
       FROM ${ITEM_FROM}
      WHERE bi.id = $1 AND ${itemScopePredicate(2, 3)}`,
    [itemId, locationId, userId],
  );
  if (r.rows.length === 0) throw new NotFoundError('Item not found');
  return r.rows[0];
}

// POST /api/locations/:locationId/items/:itemId/checkout — check out any item (box or loose)
locationCheckoutsRouter.post(
  '/:locationId/items/:itemId/checkout',
  requireLocationMember('locationId'),
  asyncHandler(async (req, res) => {
    const { locationId, itemId } = req.params;
    const userId = req.user!.id;
    await requireMemberOrAbove(locationId, userId, 'check out items');

    const item = await loadScopedItem(query, locationId, itemId, userId);

    const existing = await query('SELECT id FROM item_checkouts WHERE item_id = $1 AND returned_at IS NULL', [itemId]);
    if (existing.rows.length > 0) throw new ConflictError('Item is already checked out');

    const checkoutId = generateUuid();
    await query(
      `INSERT INTO item_checkouts (id, item_id, origin_bin_id, origin_area_id, location_id, checked_out_by, checked_out_at)
       VALUES ($1, $2, $3, $4, $5, $6, ${d.now()})`,
      [checkoutId, itemId, item.bin_id, item.area_id, locationId, userId],
    );
    const checkout = await query('SELECT * FROM item_checkouts WHERE id = $1', [checkoutId]);

    const entity = await describeHome(query, { binId: item.bin_id, areaId: item.area_id }, locationId);
    logRouteActivity(req, {
      locationId,
      action: 'update',
      ...entity,
      changes: { item_checked_out: { old: null, new: item.name } },
    });

    res.status(201).json({ checkout: checkout.rows[0] });
  }),
);

/**
 * Close one active checkout and put the item in its return place (moving it when that differs
 * from where it is now). Returns the resolved place and whether the item moved.
 */
async function closeCheckout(
  txQuery: TxQueryFn,
  co: { id: string; item_id: string; origin_bin_id: string | null; origin_area_id: string | null },
  cur: { bin_id: string | null; area_id: string | null },
  home: ResolvedTarget,
  userId: string,
): Promise<{ moved: boolean } | null> {
  const upd = await txQuery<{ id: string }>(
    `UPDATE item_checkouts
        SET returned_at = ${d.now()}, returned_by = $1, return_bin_id = $2, return_area_id = $3
      WHERE id = $4 AND returned_at IS NULL
    RETURNING id`,
    [userId, home.binId, home.areaId, co.id],
  );
  if (upd.rows.length === 0) return null;
  const moved = (cur.bin_id ?? null) !== home.binId || (cur.area_id ?? null) !== home.areaId;
  if (moved) await setItemHome(txQuery, co.item_id, home);
  await touchBins(txQuery, [co.origin_bin_id, cur.bin_id, home.binId]);
  return { moved };
}

// POST /api/locations/:locationId/items/:itemId/return — return a checked-out item
// Body (all optional, at most one): { targetBinId } | { targetAreaId } | { unassigned: true }.
// Default: back to the original bin/area; if that no longer exists (or is trashed) the item becomes unassigned.
locationCheckoutsRouter.post(
  '/:locationId/items/:itemId/return',
  requireLocationMember('locationId'),
  asyncHandler(async (req, res) => {
    const { locationId, itemId } = req.params;
    const userId = req.user!.id;
    const target: ItemTarget | null = parseItemTarget(req.body);
    await requireMemberOrAbove(locationId, userId, 'return items');

    const out = await withTransaction(async (txQuery) => {
      const item = await loadScopedItem(txQuery, locationId, itemId, userId);
      const active = await txQuery<{ id: string; item_id: string; origin_bin_id: string | null; origin_area_id: string | null }>(
        'SELECT id, item_id, origin_bin_id, origin_area_id FROM item_checkouts WHERE item_id = $1 AND returned_at IS NULL',
        [itemId],
      );
      if (active.rows.length === 0) throw new NotFoundError('Item is not checked out');
      const co = active.rows[0];

      const home = target
        ? await resolveItemTarget(txQuery, target, userId, locationId)
        : await resolveDefaultReturnHome(txQuery, co, locationId, userId);

      const result = await closeCheckout(txQuery, co, item, home, userId);
      const updated = await txQuery('SELECT * FROM item_checkouts WHERE id = $1', [co.id]);
      const homeEntity = await describeHome(txQuery, home, locationId);
      const fromEntity = result?.moved
        ? await describeHome(txQuery, { binId: item.bin_id, areaId: item.area_id }, locationId)
        : null;
      return { checkout: updated.rows[0], moved: result?.moved ?? false, item, homeEntity, fromEntity };
    });

    if (out.moved && out.fromEntity) {
      logRouteActivity(req, {
        locationId,
        action: 'update',
        ...out.fromEntity,
        changes: { item_returned_to: { old: null, new: out.homeEntity.entityName ?? null } },
      });
      logRouteActivity(req, {
        locationId,
        action: 'update',
        ...out.homeEntity,
        changes: { item_received: { old: null, new: out.item.name } },
      });
    } else {
      logRouteActivity(req, {
        locationId,
        action: 'update',
        ...out.homeEntity,
        changes: { item_returned: { old: null, new: out.item.name } },
      });
    }

    res.json({ checkout: out.checkout });
  }),
);

// POST /api/locations/:locationId/checkouts/bulk-return — return N items
// Body: { checkoutIds, targetBinId? | targetAreaId? | unassigned? } (at most one target; default = original place)
locationCheckoutsRouter.post(
  '/:locationId/checkouts/bulk-return',
  requireLocationMember('locationId'),
  asyncHandler(async (req, res) => {
    const { locationId } = req.params;
    const { checkoutIds } = req.body ?? {};
    const validIds = validateBulkIds(checkoutIds, 'checkoutIds');
    const target = parseItemTarget(req.body);
    await requireMemberOrAbove(locationId, req.user!.id, 'bulk-return checkouts');

    const { returned, errors } = await withTransaction(async (txQuery) => {
      const explicit = target ? await resolveItemTarget(txQuery, target, req.user!.id, locationId) : null;

      // Find active checkouts in this location matching the requested IDs
      const placeholders = validIds.map((_, i) => `$${i + 2}`).join(', ');
      const active = await txQuery<{
        id: string; item_id: string; origin_bin_id: string | null; origin_area_id: string | null;
        cur_bin_id: string | null; cur_area_id: string | null;
      }>(
        `SELECT ic.id, ic.item_id, ic.origin_bin_id, ic.origin_area_id,
                bi.bin_id AS cur_bin_id, bi.area_id AS cur_area_id
           FROM item_checkouts ic
           JOIN bin_items bi ON bi.id = ic.item_id
          WHERE ic.returned_at IS NULL
            AND ic.location_id = $1
            AND ic.id IN (${placeholders})`,
        [locationId, ...validIds],
      );
      const activeSet = new Set(active.rows.map((r) => r.id));
      const errs: Array<{ id: string; reason: string }> = [];
      for (const id of validIds) if (!activeSet.has(id)) errs.push({ id, reason: 'NOT_FOUND' });

      if (active.rows.length === 0) return { returned: 0, errors: errs };

      const defaults = new Map<string, ResolvedTarget>();
      let returnedCount = 0;
      for (const co of active.rows) {
        let home = explicit;
        if (!home) {
          const key = `${co.origin_bin_id ?? ''}|${co.origin_area_id ?? ''}`;
          let cached = defaults.get(key);
          if (!cached) {
            cached = await resolveDefaultReturnHome(txQuery, co, locationId, req.user!.id);
            defaults.set(key, cached);
          }
          home = cached;
        }
        const done = await closeCheckout(txQuery, co, { bin_id: co.cur_bin_id, area_id: co.cur_area_id }, home, req.user!.id);
        if (done) returnedCount += 1;
      }

      return { returned: returnedCount, errors: errs };
    });

    logRouteActivity(req, {
      entityType: 'checkout',
      locationId,
      action: 'bulk_return',
      entityId: undefined,
      entityName: undefined,
      changes: {
        counts: {
          old: null,
          new: {
            affected: returned,
            targetBinId: target?.kind === 'bin' ? target.id : null,
            targetAreaId: target?.kind === 'area' ? target.id : null,
            unassigned: target?.kind === 'unassigned',
          },
        },
      },
    });

    res.json({ returned, errors });
  }),
);
