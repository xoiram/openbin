import { Router } from 'express';
import { d, generateUuid, query } from '../db.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { requireMemberOrAbove, verifyAreaInLocation } from '../lib/binAccess.js';
import { NotFoundError, ValidationError } from '../lib/httpErrors.js';
import { describeHome, ITEM_FROM, itemScopePredicate } from '../lib/itemQueries.js';
import { assertLocationWritable } from '../lib/planGate.js';
import { logRouteActivity } from '../lib/routeHelpers.js';
import { authenticate } from '../middleware/auth.js';
import { requireLocationMember } from '../middleware/locationAccess.js';

const MAX_NAME_LEN = 200;

/**
 * Location-scoped endpoints for LOOSE items: items that live in an area or are unassigned
 * (no box). Mounted at /api/locations.
 *
 * Decision: create / edit / delete work on loose items only. An item inside a box gets 422 with a
 * pointer to the bin route (`/api/bins/:id/items/...`), which keeps its creator-or-admin rule.
 * (Checkout/return are location-scoped for every item; see itemCheckouts.ts.)
 * Permission: location member who is not a viewer (loose items have no creator).
 */
const router = Router();
router.use(authenticate);

function parseQuantity(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.max(1, Math.floor(raw));
  return null;
}

// POST /api/locations/:locationId/items — create a loose item { name, quantity?, areaId? }
router.post('/:locationId/items', requireLocationMember('locationId'), asyncHandler(async (req, res) => {
  const { locationId } = req.params;
  const userId = req.user!.id;
  const { name, quantity, areaId } = req.body ?? {};

  if (typeof name !== 'string' || !name.trim()) throw new ValidationError('name is required');
  if (name.trim().length > MAX_NAME_LEN) throw new ValidationError(`name too long (max ${MAX_NAME_LEN})`);
  if (quantity !== undefined && quantity !== null && (typeof quantity !== 'number' || !Number.isFinite(quantity))) {
    throw new ValidationError('quantity must be a number');
  }
  if (areaId !== undefined && areaId !== null && (typeof areaId !== 'string' || areaId.length === 0)) {
    throw new ValidationError('areaId must be a non-empty string');
  }

  await requireMemberOrAbove(locationId, userId, 'add items');
  await assertLocationWritable(locationId);

  const targetAreaId: string | null = typeof areaId === 'string' ? areaId : null;
  if (targetAreaId) await verifyAreaInLocation(targetAreaId, locationId);

  const itemId = generateUuid();
  const qty = parseQuantity(quantity);
  await query(
    'INSERT INTO bin_items (id, bin_id, area_id, location_id, name, quantity, position) VALUES ($1, NULL, $2, $3, $4, $5, 0)',
    [itemId, targetAreaId, locationId, name.trim(), qty],
  );

  const entity = await describeHome(query, { binId: null, areaId: targetAreaId }, locationId);
  logRouteActivity(req, {
    locationId,
    action: 'update',
    ...entity,
    changes: { items_added: { old: null, new: [name.trim()] } },
  });

  res.status(201).json({
    id: itemId,
    name: name.trim(),
    quantity: qty,
    location_id: locationId,
    bin_id: null,
    area_id: targetAreaId,
    area_name: targetAreaId ? entity.entityName ?? null : null,
  });
}));

interface LooseItemRow {
  id: string;
  name: string;
  quantity: number | null;
  bin_id: string | null;
  area_id: string | null;
}

async function loadLooseItem(locationId: string, itemId: string, userId: string): Promise<LooseItemRow> {
  const r = await query<LooseItemRow>(
    `SELECT bi.id, bi.name, bi.quantity, bi.bin_id, bi.area_id
       FROM ${ITEM_FROM}
      WHERE bi.id = $1 AND ${itemScopePredicate(2, 3)}`,
    [itemId, locationId, userId],
  );
  if (r.rows.length === 0) throw new NotFoundError('Item not found');
  if (r.rows[0].bin_id) {
    throw new ValidationError('Item is inside a bin; use the bin item routes (/api/bins/:id/items/:itemId)');
  }
  return r.rows[0];
}

// PUT /api/locations/:locationId/items/:itemId — edit a loose item { name?, quantity? }
router.put('/:locationId/items/:itemId', requireLocationMember('locationId'), asyncHandler(async (req, res) => {
  const { locationId, itemId } = req.params;
  const userId = req.user!.id;
  const { name, quantity } = req.body ?? {};

  if (name === undefined && quantity === undefined) throw new ValidationError('name or quantity is required');
  if (name !== undefined && (typeof name !== 'string' || !name.trim())) throw new ValidationError('name must be a non-empty string');
  if (typeof name === 'string' && name.trim().length > MAX_NAME_LEN) throw new ValidationError(`name too long (max ${MAX_NAME_LEN})`);
  if (quantity !== undefined && quantity !== null && (typeof quantity !== 'number' || !Number.isFinite(quantity))) {
    throw new ValidationError('quantity must be a number or null');
  }

  await requireMemberOrAbove(locationId, userId, 'modify items');
  await assertLocationWritable(locationId);

  const item = await loadLooseItem(locationId, itemId, userId);
  const newName = typeof name === 'string' ? name.trim() : item.name;
  const newQuantity = quantity === undefined ? item.quantity : parseQuantity(quantity);

  await query(
    `UPDATE bin_items SET name = $1, quantity = $2, updated_at = ${d.now()} WHERE id = $3`,
    [newName, newQuantity, itemId],
  );

  const changes: Record<string, { old: unknown; new: unknown }> = {};
  if (item.name !== newName) changes.items_renamed = { old: item.name, new: newName };
  if (item.quantity !== newQuantity) {
    changes.items_quantity = { old: { name: newName, qty: item.quantity }, new: { name: newName, qty: newQuantity } };
  }
  if (Object.keys(changes).length > 0) {
    const entity = await describeHome(query, { binId: null, areaId: item.area_id }, locationId);
    logRouteActivity(req, { locationId, action: 'update', ...entity, changes });
  }

  res.json({ id: itemId, name: newName, quantity: newQuantity });
}));

// DELETE /api/locations/:locationId/items/:itemId — remove a loose item (hard delete, like box items)
router.delete('/:locationId/items/:itemId', requireLocationMember('locationId'), asyncHandler(async (req, res) => {
  const { locationId, itemId } = req.params;
  const userId = req.user!.id;

  await requireMemberOrAbove(locationId, userId, 'remove items');
  await assertLocationWritable(locationId);

  const item = await loadLooseItem(locationId, itemId, userId);
  await query('DELETE FROM bin_items WHERE id = $1 AND bin_id IS NULL', [itemId]);

  const entity = await describeHome(query, { binId: null, areaId: item.area_id }, locationId);
  logRouteActivity(req, {
    locationId,
    action: 'update',
    ...entity,
    changes: { items_removed: { old: [item.name], new: null } },
  });

  res.json({ success: true });
}));

export default router;
