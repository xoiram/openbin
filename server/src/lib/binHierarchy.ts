import { d } from '../db.js';
import { ValidationError } from './httpErrors.js';

// ---------------------------------------------------------------------------
// Nested bins (see docs/nested-boxes.md).
//
// A bin can sit inside one other bin (depth 2 at most). A child is a full bin
// with its own QR code, photos, items and so on, but it follows its parent for:
//   - area         always equal to the parent's area_id
//   - visibility   never more public than the parent
//   - trash        trashed and restored together with the parent
//
// Every code path that writes bins.area_id / visibility / deleted_at /
// parent_bin_id must go through this module so those rules hold. Run
// findHierarchyViolations() after a write in tests to check all of them.
// ---------------------------------------------------------------------------

/** Anything that can run a parameterised query: the top-level `query` or a transaction's query function. */
export type Q = (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;

export type Visibility = 'location' | 'private';

export interface BinNode {
  id: string;
  location_id: string;
  parent_bin_id: string | null;
  area_id: string | null;
  visibility: Visibility;
  deleted_at: string | null;
  created_by: string | null;
}

export async function loadBinNode(q: Q, binId: string): Promise<BinNode | null> {
  const result = await q(
    'SELECT id, location_id, parent_bin_id, area_id, visibility, deleted_at, created_by FROM bins WHERE id = $1',
    [binId],
  );
  return result.rows[0] ?? null;
}

/** Number of bins directly inside `binId`. Trashed children count by default: they come back on restore. */
export async function countChildBins(q: Q, binId: string, opts?: { liveOnly?: boolean }): Promise<number> {
  const liveOnly = opts?.liveOnly ? ' AND deleted_at IS NULL' : '';
  const result = await q(`SELECT COUNT(*) AS n FROM bins WHERE parent_bin_id = $1${liveOnly}`, [binId]);
  return Number(result.rows[0]?.n ?? 0);
}

/**
 * Validate that a bin may be placed inside `parentId` and return the parent.
 *
 * `binId` is null when the bin is being created. Throws a ValidationError (422) when the parent is
 * missing, trashed, in another location, itself a child, or when the bin already contains bins.
 */
export async function assertValidParent(
  q: Q,
  opts: { binId: string | null; parentId: string; locationId: string },
): Promise<BinNode> {
  const { binId, parentId, locationId } = opts;
  if (binId && binId === parentId) throw new ValidationError("A bin can't be inside itself");

  const parent = await loadBinNode(q, parentId);
  if (!parent || parent.deleted_at || parent.location_id !== locationId) {
    throw new ValidationError('Parent bin not found');
  }
  if (parent.parent_bin_id) {
    throw new ValidationError("A bin that is inside another bin can't contain bins");
  }
  if (binId && (await countChildBins(q, binId)) > 0) {
    throw new ValidationError("A bin that contains bins can't be moved inside another bin");
  }
  return parent;
}

/** area_id and visibility a child must carry given its parent (a child can be more private than its parent, never less). */
export function childFieldsFromParent(
  parent: Pick<BinNode, 'area_id' | 'visibility'>,
  requestedVisibility?: Visibility,
): { area_id: string | null; visibility: Visibility } {
  return {
    area_id: parent.area_id,
    visibility: parent.visibility === 'private' ? 'private' : (requestedVisibility ?? 'location'),
  };
}

/** A child's area is its parent's: it can't be set directly. */
export function assertAreaSettable(bin: Pick<BinNode, 'parent_bin_id'>): void {
  if (bin.parent_bin_id) throw new ValidationError("The area of a bin inside another bin follows its parent");
}

/** A child can't change location on its own; take it out of its parent first. */
export function assertNotChild(bin: Pick<BinNode, 'parent_bin_id'>, what: string): void {
  if (bin.parent_bin_id) throw new ValidationError(`A bin inside another bin can't be ${what}: take it out of its parent first`);
}

/** A child can't be made public while its parent is private. */
export async function assertVisibilityAllowed(q: Q, bin: Pick<BinNode, 'parent_bin_id'>, visibility: Visibility): Promise<void> {
  if (visibility !== 'location' || !bin.parent_bin_id) return;
  const parent = await loadBinNode(q, bin.parent_bin_id);
  if (parent?.visibility === 'private') {
    throw new ValidationError("A bin inside a private bin can't be made visible to the location");
  }
}

/** Parent changed area: its children follow. */
export async function syncChildrenArea(q: Q, parentId: string, areaId: string | null): Promise<void> {
  await q(`UPDATE bins SET area_id = $1, updated_at = ${d.now()} WHERE parent_bin_id = $2`, [areaId, parentId]);
}

/** Parent became private: its children do too. */
export async function syncChildrenVisibility(q: Q, parentId: string, visibility: Visibility): Promise<void> {
  if (visibility !== 'private') return;
  await q(
    `UPDATE bins SET visibility = 'private', updated_at = ${d.now()} WHERE parent_bin_id = $1 AND visibility <> 'private'`,
    [parentId],
  );
}

/** Parent moved to another location (area cleared): children move along. */
export async function syncChildrenLocation(q: Q, parentId: string, locationId: string): Promise<void> {
  await q(
    `UPDATE bins SET location_id = $1, area_id = NULL, updated_at = ${d.now()} WHERE parent_bin_id = $2`,
    [locationId, parentId],
  );
}

/** Trash a parent's live children with the same timestamp as the parent, so they restore together. */
export async function trashChildBins(q: Q, parentId: string, deletedAt: string): Promise<void> {
  await q(
    `UPDATE bins SET deleted_at = $1, updated_at = ${d.now()} WHERE parent_bin_id = $2 AND deleted_at IS NULL`,
    [deletedAt, parentId],
  );
}

/** How many children were trashed together with their parent (same deleted_at): what restoring it brings back. */
export async function countTrashedWithParent(q: Q, parentId: string, parentDeletedAt: string): Promise<number> {
  const result = await q('SELECT COUNT(*) AS n FROM bins WHERE parent_bin_id = $1 AND deleted_at = $2', [parentId, parentDeletedAt]);
  return Number(result.rows[0]?.n ?? 0);
}

/** Restore the children that were trashed together with their parent (same deleted_at). */
export async function restoreChildBins(q: Q, parentId: string, parentDeletedAt: string): Promise<void> {
  await q(
    `UPDATE bins SET deleted_at = NULL, updated_at = ${d.now()} WHERE parent_bin_id = $1 AND deleted_at = $2`,
    [parentId, parentDeletedAt],
  );
}

/** A child can't be restored while its parent is still in the trash. */
export async function assertParentNotTrashed(q: Q, bin: Pick<BinNode, 'parent_bin_id'>): Promise<void> {
  if (!bin.parent_bin_id) return;
  const parent = await loadBinNode(q, bin.parent_bin_id);
  if (parent?.deleted_at) {
    throw new ValidationError('Restore the parent bin first: it is still in the trash');
  }
}

/**
 * Check every nesting rule across the database (or one location). Returns one message per violation;
 * an empty array means the data is consistent. Used by tests after write paths; cheap enough to use in
 * admin tooling too.
 */
export async function findHierarchyViolations(q: Q, locationId?: string): Promise<string[]> {
  const scope = locationId ? 'AND c.location_id = $1' : '';
  const params = locationId ? [locationId] : [];
  const out: string[] = [];

  const run = async (label: string, where: string): Promise<void> => {
    const result = await q(
      `SELECT c.id AS child, p.id AS parent FROM bins c JOIN bins p ON p.id = c.parent_bin_id WHERE (${where}) ${scope}`,
      params,
    );
    for (const row of result.rows) out.push(`${label}: child ${row.child} / parent ${row.parent}`);
  };

  await run('depth: parent is itself a child', 'p.parent_bin_id IS NOT NULL');
  await run(
    "area: child's area differs from its parent's",
    '(c.area_id IS NULL AND p.area_id IS NOT NULL) OR (c.area_id IS NOT NULL AND (p.area_id IS NULL OR c.area_id <> p.area_id))',
  );
  await run('visibility: public child of a private parent', "c.visibility = 'location' AND p.visibility = 'private'");
  await run('trash: live child of a trashed parent', 'c.deleted_at IS NULL AND p.deleted_at IS NOT NULL');
  await run('location: child and parent are in different locations', 'c.location_id <> p.location_id');

  const itemScope = locationId ? 'AND bi.location_id = $1' : '';
  const badBinItems = await q(
    `SELECT bi.id FROM bin_items bi JOIN bins b ON b.id = bi.bin_id WHERE bi.location_id <> b.location_id ${itemScope}`,
    params,
  );
  for (const row of badBinItems.rows) out.push(`item location: item ${row.id} is in a bin of another location`);
  const badAreaItems = await q(
    `SELECT bi.id FROM bin_items bi JOIN areas a ON a.id = bi.area_id WHERE bi.location_id <> a.location_id ${itemScope}`,
    params,
  );
  for (const row of badAreaItems.rows) out.push(`item location: item ${row.id} is in an area of another location`);

  return out;
}
