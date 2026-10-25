import type { TxQueryFn } from '../db.js';
import { d } from '../db.js';
import { NotFoundError, ValidationError } from './httpErrors.js';

/**
 * Shared helpers for queries over `bin_items`.
 *
 * An item lives in a bin (`bin_id`), in an area (`area_id`), or in neither
 * ("unassigned in the location"). It always has `location_id`. Never `JOIN bins`
 * for item queries: that silently drops loose items. Use `ITEM_FROM` instead.
 */

/** FROM fragment: aliases `bi` (item), `b` (its bin, may be NULL), `a` (its own area, may be NULL). */
export const ITEM_FROM = `bin_items bi
    LEFT JOIN bins b ON b.id = bi.bin_id
    LEFT JOIN areas a ON a.id = bi.area_id`;

/**
 * Visibility predicate (no location, no trash state of the item itself): loose items are
 * visible to every member; box items follow the box's trash/visibility rules.
 * `userParam` is the 1-based index of the user id placeholder.
 */
export function itemVisibilityPredicate(userParam: number): string {
  return `(bi.bin_id IS NULL OR (b.deleted_at IS NULL AND (b.visibility = 'location' OR b.created_by = $${userParam})))`;
}

/** Live (non-deleted) items of a location that the user may see. */
export function itemScopePredicate(locationParam: number, userParam: number): string {
  return `bi.location_id = $${locationParam} AND bi.deleted_at IS NULL AND ${itemVisibilityPredicate(userParam)}`;
}

export type ItemHome = { binId: string } | { areaId: string } | Record<string, never>;

/** Where an item currently lives. `{}` means unassigned. */
export function resolveItemHome(row: { bin_id?: string | null; area_id?: string | null }): ItemHome {
  if (row.bin_id) return { binId: row.bin_id };
  if (row.area_id) return { areaId: row.area_id };
  return {};
}

/** Touch `updated_at` on the given bins, ignoring null/undefined ids and duplicates. */
export async function touchBins(tx: TxQueryFn, ids: Iterable<string | null | undefined>): Promise<void> {
  const unique = [...new Set([...ids].filter((id): id is string => typeof id === 'string' && id.length > 0))];
  if (unique.length === 0) return;
  const ph = unique.map((_, i) => `$${i + 1}`).join(', ');
  await tx(`UPDATE bins SET updated_at = ${d.now()} WHERE id IN (${ph})`, unique);
}

/** A destination for an item. */
export type ItemTarget =
  | { kind: 'bin'; id: string }
  | { kind: 'area'; id: string }
  | { kind: 'unassigned' };

/**
 * Parse `targetBinId` / `targetAreaId` / `unassigned: true` from a request body.
 * At most one may be given. Returns null when none is given.
 */
export function parseItemTarget(body: Record<string, unknown> | undefined | null): ItemTarget | null {
  const b = body ?? {};
  const bin = b.targetBinId;
  const area = b.targetAreaId;
  const unassigned = b.unassigned;
  const hasBin = bin !== undefined && bin !== null;
  const hasArea = area !== undefined && area !== null;
  const hasUnassigned = unassigned !== undefined && unassigned !== null && unassigned !== false;
  if ([hasBin, hasArea, hasUnassigned].filter(Boolean).length > 1) {
    throw new ValidationError('Provide only one of targetBinId, targetAreaId or unassigned');
  }
  if (hasBin) {
    if (typeof bin !== 'string' || bin.length === 0) throw new ValidationError('targetBinId must be a non-empty string');
    return { kind: 'bin', id: bin };
  }
  if (hasArea) {
    if (typeof area !== 'string' || area.length === 0) throw new ValidationError('targetAreaId must be a non-empty string');
    return { kind: 'area', id: area };
  }
  if (hasUnassigned) {
    if (unassigned !== true) throw new ValidationError('unassigned must be true when provided');
    return { kind: 'unassigned' };
  }
  return null;
}

export interface ResolvedTarget {
  kind: 'bin' | 'area' | 'unassigned';
  binId: string | null;
  areaId: string | null;
  name: string | null;
  /** Location of the target bin/area; null for unassigned. */
  locationId: string | null;
}

/**
 * Resolve a target to its row. Bins must be live and visible to the user; areas must exist.
 * When `locationId` is given the target must belong to it.
 */
export async function resolveItemTarget(
  tx: TxQueryFn,
  target: ItemTarget,
  userId: string,
  locationId?: string,
): Promise<ResolvedTarget> {
  if (target.kind === 'unassigned') {
    return { kind: 'unassigned', binId: null, areaId: null, name: null, locationId: locationId ?? null };
  }
  if (target.kind === 'bin') {
    const r = await tx<{ id: string; location_id: string; name: string; visibility: string; created_by: string }>(
      'SELECT id, location_id, name, visibility, created_by FROM bins WHERE id = $1 AND deleted_at IS NULL',
      [target.id],
    );
    const row = r.rows[0];
    if (!row || (locationId && row.location_id !== locationId)
      || (row.visibility === 'private' && row.created_by !== userId)) {
      throw new NotFoundError('Target bin not found');
    }
    return { kind: 'bin', binId: row.id, areaId: null, name: row.name, locationId: row.location_id };
  }
  const r = await tx<{ id: string; location_id: string; name: string }>(
    'SELECT id, location_id, name FROM areas WHERE id = $1',
    [target.id],
  );
  const row = r.rows[0];
  if (!row || (locationId && row.location_id !== locationId)) {
    throw new NotFoundError('Target area not found');
  }
  return { kind: 'area', binId: null, areaId: row.id, name: row.name, locationId: row.location_id };
}

/** Write an item's home: bin (appended last), area, or unassigned. Keeps the bin-xor-area invariant. */
export async function setItemHome(
  tx: TxQueryFn,
  itemId: string,
  home: { binId: string | null; areaId: string | null },
  position?: number,
): Promise<number | null> {
  if (home.binId) {
    let pos = position;
    if (pos === undefined) {
      const max = await tx<{ max_pos: number | null }>(
        'SELECT MAX(position) AS max_pos FROM bin_items WHERE bin_id = $1 AND deleted_at IS NULL',
        [home.binId],
      );
      pos = (max.rows[0]?.max_pos ?? -1) + 1;
    }
    await tx('UPDATE bin_items SET bin_id = $1, area_id = NULL, position = $2 WHERE id = $3', [home.binId, pos, itemId]);
    return pos;
  }
  await tx('UPDATE bin_items SET bin_id = NULL, area_id = $1, position = 0 WHERE id = $2', [home.areaId ?? null, itemId]);
  return null;
}

export interface HomeEntity {
  entityType: 'bin' | 'area' | 'location';
  entityId: string;
  entityName: string | undefined;
}

/** Activity-log entity for an item's home: its bin, else its area, else the location (unassigned). */
export async function describeHome(
  tx: TxQueryFn,
  home: { binId: string | null; areaId: string | null },
  locationId: string,
): Promise<HomeEntity> {
  if (home.binId) {
    const r = await tx<{ name: string }>('SELECT name FROM bins WHERE id = $1', [home.binId]);
    return { entityType: 'bin', entityId: home.binId, entityName: r.rows[0]?.name };
  }
  if (home.areaId) {
    const r = await tx<{ name: string }>('SELECT name FROM areas WHERE id = $1', [home.areaId]);
    return { entityType: 'area', entityId: home.areaId, entityName: r.rows[0]?.name };
  }
  const r = await tx<{ name: string }>('SELECT name FROM locations WHERE id = $1', [locationId]);
  return { entityType: 'location', entityId: locationId, entityName: r.rows[0]?.name };
}

/**
 * Where a checked-out item should go back to when the caller gives no target: its origin bin or
 * origin area if that still exists in the location (bin: live and visible to the user), otherwise
 * unassigned. Never returns an invalid place.
 */
export async function resolveDefaultReturnHome(
  tx: TxQueryFn,
  origin: { origin_bin_id: string | null; origin_area_id: string | null },
  locationId: string,
  userId: string,
): Promise<ResolvedTarget> {
  const candidate: ItemTarget | null = origin.origin_bin_id
    ? { kind: 'bin', id: origin.origin_bin_id }
    : origin.origin_area_id
      ? { kind: 'area', id: origin.origin_area_id }
      : null;
  if (candidate) {
    try {
      return await resolveItemTarget(tx, candidate, userId, locationId);
    } catch (err) {
      if (!(err instanceof NotFoundError)) throw err;
    }
  }
  return { kind: 'unassigned', binId: null, areaId: null, name: null, locationId };
}
