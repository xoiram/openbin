import { Router } from 'express';
import { d, generateUuid, withTransaction } from '../../db.js';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { requireMemberOrAbove } from '../../lib/binAccess.js';
import { validateBulkIds } from '../../lib/bulkValidation.js';
import { ValidationError } from '../../lib/httpErrors.js';
import {
  ITEM_FROM,
  itemVisibilityPredicate,
  parseItemTarget,
  resolveItemTarget,
  touchBins,
} from '../../lib/itemQueries.js';
import { logRouteActivity } from '../../lib/routeHelpers.js';

const router = Router();

// POST /api/items/bulk-delete — soft-delete N items
router.post('/bulk-delete', asyncHandler(async (req, res) => {
  const { ids } = req.body ?? {};
  const validIds = validateBulkIds(ids);

  const { deleted, locationId } = await withTransaction(async (txQuery) => {
    const placeholders = validIds.map((_, i) => `$${i + 2}`).join(', ');
    // Find items the user can see; group by location for activity log
    const visible = await txQuery<{ id: string; location_id: string }>(
      `SELECT bi.id, bi.location_id
         FROM ${ITEM_FROM}
        WHERE bi.deleted_at IS NULL
          AND ${itemVisibilityPredicate(1)}
          AND bi.id IN (${placeholders})`,
      [req.user!.id, ...validIds],
    );
    if (visible.rows.length === 0) {
      return { deleted: 0, locationId: null as string | null };
    }

    // All items in this call must come from the same location
    const locId = visible.rows[0].location_id;
    if (visible.rows.some((r) => r.location_id !== locId)) {
      throw new ValidationError('All items must belong to the same location');
    }
    await requireMemberOrAbove(locId, req.user!.id, 'bulk-delete items');

    const visibleIds = visible.rows.map((r) => r.id);
    const updPlaceholders = visibleIds.map((_, i) => `$${i + 1}`).join(', ');
    const upd = await txQuery<{ id: string; bin_id: string | null }>(
      `UPDATE bin_items SET deleted_at = ${d.now()}
         WHERE id IN (${updPlaceholders}) AND deleted_at IS NULL
         RETURNING id, bin_id`,
      visibleIds,
    );

    // Touch each affected bin's updated_at (loose items have no bin)
    await touchBins(txQuery, upd.rows.map((r) => r.bin_id));

    return { deleted: upd.rows.length, locationId: locId as string | null };
  });

  if (locationId) {
    logRouteActivity(req, {
      entityType: 'item',
      locationId,
      action: 'bulk_delete',
      entityId: undefined,
      entityName: undefined,
      changes: { counts: { old: null, new: { affected: deleted } } },
    });
  }

  res.json({ deleted });
}));

// POST /api/items/bulk-restore — undo a recent soft-delete
router.post('/bulk-restore', asyncHandler(async (req, res) => {
  const { ids } = req.body ?? {};
  const validIds = validateBulkIds(ids);

  const { restored, locationId } = await withTransaction(async (txQuery) => {
    const placeholders = validIds.map((_, i) => `$${i + 2}`).join(', ');
    const visible = await txQuery<{ id: string; location_id: string }>(
      `SELECT bi.id, bi.location_id
         FROM ${ITEM_FROM}
        WHERE bi.deleted_at IS NOT NULL
          AND ${itemVisibilityPredicate(1)}
          AND bi.id IN (${placeholders})`,
      [req.user!.id, ...validIds],
    );
    if (visible.rows.length === 0) {
      return { restored: 0, locationId: null as string | null };
    }

    const locId = visible.rows[0].location_id;
    if (visible.rows.some((r) => r.location_id !== locId)) {
      throw new ValidationError('All items must belong to the same location');
    }
    await requireMemberOrAbove(locId, req.user!.id, 'bulk-restore items');

    const visibleIds = visible.rows.map((r) => r.id);
    const updPh = visibleIds.map((_, i) => `$${i + 1}`).join(', ');
    const upd = await txQuery<{ id: string; bin_id: string | null }>(
      `UPDATE bin_items SET deleted_at = NULL
         WHERE id IN (${updPh}) AND deleted_at IS NOT NULL
         RETURNING id, bin_id`,
      visibleIds,
    );

    await touchBins(txQuery, upd.rows.map((r) => r.bin_id));

    return { restored: upd.rows.length, locationId: locId as string | null };
  });

  if (locationId) {
    logRouteActivity(req, {
      entityType: 'item',
      locationId,
      action: 'bulk_restore',
      entityId: undefined,
      entityName: undefined,
      changes: { counts: { old: null, new: { affected: restored } } },
    });
  }

  res.json({ restored });
}));

// POST /api/items/bulk-checkout — check out N items in one call
router.post('/bulk-checkout', asyncHandler(async (req, res) => {
  const { ids } = req.body ?? {};
  const validIds = validateBulkIds(ids);

  const result = await withTransaction(async (txQuery) => {
    const placeholders = validIds.map((_, i) => `$${i + 2}`).join(', ');
    const visible = await txQuery<{
      id: string; bin_id: string | null; area_id: string | null; name: string; location_id: string; active_checkout: string | null;
    }>(
      `SELECT bi.id, bi.bin_id, bi.area_id, bi.name, bi.location_id,
              (SELECT id FROM item_checkouts WHERE item_id = bi.id AND returned_at IS NULL LIMIT 1) AS active_checkout
         FROM ${ITEM_FROM}
        WHERE bi.deleted_at IS NULL
          AND ${itemVisibilityPredicate(1)}
          AND bi.id IN (${placeholders})`,
      [req.user!.id, ...validIds],
    );

    const errors: Array<{ id: string; reason: string }> = [];
    const visibleSet = new Set(visible.rows.map((r) => r.id));
    for (const id of validIds) if (!visibleSet.has(id)) errors.push({ id, reason: 'NOT_FOUND' });

    const checkoutable = visible.rows.filter((r) => r.active_checkout === null);
    for (const r of visible.rows) if (r.active_checkout) errors.push({ id: r.id, reason: 'ALREADY_CHECKED_OUT' });

    if (checkoutable.length === 0) return { checkedOut: 0, errors, locationId: null };

    const locId = checkoutable[0].location_id;
    if (checkoutable.some((r) => r.location_id !== locId)) {
      throw new ValidationError('All items must belong to the same location');
    }
    await requireMemberOrAbove(locId, req.user!.id, 'bulk-checkout items');

    // Build a multi-row INSERT
    const valuesClauses: string[] = [];
    const params: unknown[] = [];
    for (const item of checkoutable) {
      const idx = params.length;
      // origin = the item's home: bin, area, or neither (unassigned)
      params.push(generateUuid(), item.id, item.bin_id, item.area_id, locId, req.user!.id);
      valuesClauses.push(`($${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4}, $${idx + 5}, $${idx + 6}, ${d.now()})`);
    }
    await txQuery(
      `INSERT INTO item_checkouts (id, item_id, origin_bin_id, origin_area_id, location_id, checked_out_by, checked_out_at)
       VALUES ${valuesClauses.join(', ')}`,
      params,
    );

    return { checkedOut: checkoutable.length, errors, locationId: locId };
  });

  if (result.locationId) {
    logRouteActivity(req, {
      entityType: 'item',
      locationId: result.locationId,
      action: 'bulk_checkout',
      entityId: undefined,
      entityName: undefined,
      changes: { counts: { old: null, new: { affected: result.checkedOut } } },
    });
  }

  res.json({ checkedOut: result.checkedOut, errors: result.errors });
}));

// POST /api/items/bulk-move — move N items into a target bin, a target area, or "unassigned"
// Body: { ids, targetBinId } | { ids, targetAreaId } | { ids, unassigned: true } (exactly one)
router.post('/bulk-move', asyncHandler(async (req, res) => {
  const { ids } = req.body ?? {};
  const validIds = validateBulkIds(ids);
  const target = parseItemTarget(req.body);
  if (!target) {
    throw new ValidationError('One of targetBinId, targetAreaId or unassigned is required');
  }

  const { moved, locationId, targetName, targetId } = await withTransaction(async (txQuery) => {
    // 1. Resolve and validate the target (bins live+visible, areas exist). Location comes from
    //    the target; for "unassigned" it comes from the items.
    const resolved = await resolveItemTarget(txQuery, target, req.user!.id);

    // 2. Resolve visible items (loose items included)
    const placeholders = validIds.map((_, i) => `$${i + 2}`).join(', ');
    const visible = await txQuery<{ id: string; bin_id: string | null; location_id: string }>(
      `SELECT bi.id, bi.bin_id, bi.location_id
         FROM ${ITEM_FROM}
        WHERE bi.deleted_at IS NULL
          AND ${itemVisibilityPredicate(1)}
          AND bi.id IN (${placeholders})`,
      [req.user!.id, ...validIds],
    );

    let targetLocation = resolved.locationId;
    if (!targetLocation) {
      if (visible.rows.length === 0) {
        return { moved: 0, locationId: null as string | null, targetName: null as string | null, targetId: null as string | null };
      }
      targetLocation = visible.rows[0].location_id;
      if (visible.rows.some((r) => r.location_id !== targetLocation)) {
        throw new ValidationError('All items must belong to the same location');
      }
    }
    await requireMemberOrAbove(targetLocation, req.user!.id, 'bulk-move items');

    // All items must share the target's location
    const sameLocation = visible.rows.filter((r) => r.location_id === targetLocation);
    if (sameLocation.length === 0) {
      return { moved: 0, locationId: targetLocation, targetName: resolved.name, targetId: resolved.binId ?? resolved.areaId };
    }

    // 3. Compute next position for a bin target
    let nextPos = 0;
    if (resolved.binId) {
      const maxRes = await txQuery<{ max_pos: number | null }>(
        `SELECT MAX(position) AS max_pos FROM bin_items WHERE bin_id = $1`,
        [resolved.binId],
      );
      nextPos = (maxRes.rows[0]?.max_pos ?? -1) + 1;
    }

    // 4. Move items one-by-one (bin: sequential positions; area/unassigned: clears the bin)
    const movedRows: Array<{ id: string; bin_id: string | null }> = [];
    for (const item of sameLocation) {
      const upd = await txQuery<{ id: string }>(
        `UPDATE bin_items SET bin_id = $1, area_id = $2, position = $3
           WHERE id = $4
         RETURNING id`,
        [resolved.binId, resolved.areaId, resolved.binId ? nextPos++ : 0, item.id],
      );
      if (upd.rows.length > 0) movedRows.push({ id: item.id, bin_id: item.bin_id });
    }

    // 5. Touch all affected bins (origin bins + target bin); null bin ids are ignored
    await touchBins(txQuery, [resolved.binId, ...movedRows.map((r) => r.bin_id)]);

    return { moved: movedRows.length, locationId: targetLocation, targetName: resolved.name, targetId: resolved.binId ?? resolved.areaId };
  });

  if (locationId) {
    logRouteActivity(req, {
      entityType: 'item',
      locationId,
      action: 'bulk_move',
      entityId: targetId ?? undefined,
      entityName: targetName ?? undefined,
      changes: { counts: { old: null, new: { affected: moved, target: target.kind } } },
    });
  }

  res.json({ moved });
}));

// POST /api/items/bulk-quantity — set/clear/inc/dec quantity for N items
router.post('/bulk-quantity', asyncHandler(async (req, res) => {
  const { ids, op, value } = req.body ?? {};
  const validIds = validateBulkIds(ids);

  if (op !== 'set' && op !== 'clear' && op !== 'inc' && op !== 'dec') {
    throw new ValidationError('op must be one of: set, clear, inc, dec');
  }
  let n: number | null = null;
  if (op !== 'clear') {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
      throw new ValidationError('value must be a non-negative integer');
    }
    n = value;
  }

  const { updated, removed, locationId } = await withTransaction(async (txQuery) => {
    const placeholders = validIds.map((_, i) => `$${i + 2}`).join(', ');
    const visible = await txQuery<{
      id: string; bin_id: string | null; location_id: string; quantity: number | null;
    }>(
      `SELECT bi.id, bi.bin_id, bi.location_id, bi.quantity
         FROM ${ITEM_FROM}
        WHERE bi.deleted_at IS NULL
          AND ${itemVisibilityPredicate(1)}
          AND bi.id IN (${placeholders})`,
      [req.user!.id, ...validIds],
    );

    if (visible.rows.length === 0) {
      return { updated: 0, removed: 0, locationId: null };
    }
    const locId = visible.rows[0].location_id;
    if (visible.rows.some((r) => r.location_id !== locId)) {
      throw new ValidationError('All items must belong to the same location');
    }
    await requireMemberOrAbove(locId, req.user!.id, 'bulk-update item quantity');

    let updatedCount = 0;
    let removedCount = 0;
    for (const item of visible.rows) {
      let newQty: number | null;
      if (op === 'set') newQty = n;
      else if (op === 'clear') newQty = null;
      else {
        const cur = item.quantity ?? 0;
        const delta = op === 'inc' ? n! : -n!;
        newQty = Math.max(0, cur + delta);
      }

      if (op !== 'clear' && newQty === 0) {
        // Soft-delete the row
        const upd = await txQuery<{ id: string }>(
          `UPDATE bin_items SET deleted_at = ${d.now()} WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
          [item.id],
        );
        if (upd.rows.length > 0) removedCount += 1;
      } else {
        const upd = await txQuery<{ id: string }>(
          `UPDATE bin_items SET quantity = $1, updated_at = ${d.now()} WHERE id = $2 AND deleted_at IS NULL RETURNING id`,
          [newQty, item.id],
        );
        if (upd.rows.length > 0) updatedCount += 1;
      }
    }

    await touchBins(txQuery, visible.rows.map((r) => r.bin_id));

    return { updated: updatedCount, removed: removedCount, locationId: locId };
  });

  if (locationId) {
    logRouteActivity(req, {
      entityType: 'item',
      locationId,
      action: 'bulk_quantity',
      entityId: undefined,
      entityName: undefined,
      changes: { counts: { old: null, new: { op, value: n, updated, removed } } },
    });
  }

  res.json({ updated, removed });
}));

export default router;
