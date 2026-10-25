import type { TxQueryFn } from '../../db.js';
import { d, generateUuid } from '../../db.js';
import type { ActionResult } from '../commandExecutor.js';
import type { CommandAction } from '../commandParser.js';
import { NotFoundError } from '../httpErrors.js';
import {
  describeHome,
  type ResolvedTarget,
  resolveDefaultReturnHome,
  resolveItemTarget,
  setItemHome,
  touchBins,
} from '../itemQueries.js';
import { type ActionContext, assertBinVisible } from './types.js';

export async function handleCheckoutItem(action: Extract<CommandAction, { type: 'checkout_item' }>, ctx: ActionContext, tx: TxQueryFn): Promise<ActionResult> {
  const bin = await tx<{ id: string; name: string; visibility: string; created_by: string }>(
    'SELECT id, name, visibility, created_by FROM bins WHERE id = $1 AND location_id = $2 AND deleted_at IS NULL',
    [action.bin_id, ctx.locationId],
  );
  if (bin.rows.length === 0) throw new Error(`Bin not found: ${action.bin_name}`);
  assertBinVisible(bin.rows[0], ctx.userId);

  const item = await tx<{ id: string; name: string }>(
    'SELECT id, name FROM bin_items WHERE bin_id = $1 AND LOWER(name) = LOWER($2) AND deleted_at IS NULL',
    [action.bin_id, action.item_name],
  );
  if (item.rows.length === 0) throw new Error(`Item not found: ${action.item_name}`);

  const itemRow = item.rows[0];

  const existing = await tx(
    'SELECT id FROM item_checkouts WHERE item_id = $1 AND returned_at IS NULL',
    [itemRow.id],
  );
  if (existing.rows.length > 0) throw new Error(`Item "${itemRow.name}" is already checked out`);

  const checkoutId = generateUuid();
  await tx(
    `INSERT INTO item_checkouts (id, item_id, origin_bin_id, location_id, checked_out_by, checked_out_at)
     VALUES ($1, $2, $3, $4, $5, ${d.now()})`,
    [checkoutId, itemRow.id, action.bin_id, ctx.locationId, ctx.userId],
  );
  await tx(`UPDATE bins SET updated_at = ${d.now()} WHERE id = $1`, [action.bin_id]);

  ctx.pendingActivities.push({
    locationId: ctx.locationId, userId: ctx.userId, userName: ctx.userName, authMethod: ctx.authMethod, apiKeyId: ctx.apiKeyId,
    action: 'update', entityType: 'bin', entityId: action.bin_id, entityName: action.bin_name,
    changes: { item_checked_out: { old: null, new: itemRow.name } },
  });

  return { type: 'checkout_item', success: true, details: `Checked out "${itemRow.name}" from "${action.bin_name}"`, bin_id: action.bin_id, bin_name: action.bin_name };
}

export async function handleReturnItem(action: Extract<CommandAction, { type: 'return_item' }>, ctx: ActionContext, tx: TxQueryFn): Promise<ActionResult> {
  const bin = await tx<{ id: string; name: string; visibility: string; created_by: string }>(
    'SELECT id, name, visibility, created_by FROM bins WHERE id = $1 AND location_id = $2 AND deleted_at IS NULL',
    [action.bin_id, ctx.locationId],
  );
  if (bin.rows.length === 0) throw new Error(`Bin not found: ${action.bin_name}`);
  assertBinVisible(bin.rows[0], ctx.userId);

  const item = await tx<{ id: string; name: string }>(
    'SELECT id, name FROM bin_items WHERE bin_id = $1 AND LOWER(name) = LOWER($2) AND deleted_at IS NULL',
    [action.bin_id, action.item_name],
  );
  if (item.rows.length === 0) throw new Error(`Item not found: ${action.item_name}`);

  const itemRow = item.rows[0];

  const checkout = await tx<{ id: string; origin_bin_id: string | null; origin_area_id: string | null }>(
    'SELECT id, origin_bin_id, origin_area_id FROM item_checkouts WHERE item_id = $1 AND returned_at IS NULL',
    [itemRow.id],
  );
  if (checkout.rows.length === 0) throw new Error(`Item "${itemRow.name}" is not checked out`);
  const co = checkout.rows[0];

  // Explicit target bin, else the original place (bin or area); if that is gone the item becomes unassigned.
  let home: ResolvedTarget;
  if (action.target_bin_id) {
    try {
      home = await resolveItemTarget(tx, { kind: 'bin', id: action.target_bin_id }, ctx.userId, ctx.locationId);
    } catch (err) {
      if (err instanceof NotFoundError) throw new Error(`Target bin not found: ${action.target_bin_name ?? action.target_bin_id}`);
      throw err;
    }
  } else {
    home = await resolveDefaultReturnHome(tx, co, ctx.locationId, ctx.userId);
  }

  await tx(
    `UPDATE item_checkouts SET returned_at = ${d.now()}, returned_by = $1, return_bin_id = $2, return_area_id = $3 WHERE id = $4`,
    [ctx.userId, home.binId, home.areaId, co.id],
  );

  // The item is currently in action.bin_id (that is how it was found)
  const moved = home.binId !== action.bin_id;
  const base = { locationId: ctx.locationId, userId: ctx.userId, userName: ctx.userName, authMethod: ctx.authMethod, apiKeyId: ctx.apiKeyId };
  if (moved) {
    await setItemHome(tx, itemRow.id, home);
    await touchBins(tx, [co.origin_bin_id, action.bin_id, home.binId]);

    ctx.pendingActivities.push({
      ...base,
      action: 'update', entityType: 'bin', entityId: action.bin_id, entityName: action.bin_name,
      changes: { item_returned_to: { old: null, new: home.name } },
    });
    const dest = await describeHome(tx, home, ctx.locationId);
    ctx.pendingActivities.push({
      ...base,
      action: 'update', ...dest,
      changes: { item_received: { old: null, new: itemRow.name } },
    });
  } else {
    await touchBins(tx, [action.bin_id]);
    ctx.pendingActivities.push({
      ...base,
      action: 'update', entityType: 'bin', entityId: action.bin_id, entityName: action.bin_name,
      changes: { item_returned: { old: null, new: itemRow.name } },
    });
  }

  return { type: 'return_item', success: true, details: `Returned "${itemRow.name}" to "${action.target_bin_name ?? action.bin_name}"`, bin_id: action.bin_id, bin_name: action.bin_name };
}
