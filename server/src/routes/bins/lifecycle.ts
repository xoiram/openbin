import { Router } from 'express';
import { d, query, withTransaction } from '../../db.js';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { cleanupBinAttachments } from '../../lib/attachmentsCleanup.js';
import { requireAdmin, requireCreatorOrAdmin, verifyBinAccess, verifyDeletedBinAccess, verifyLocationMembership } from '../../lib/binAccess.js';
import { assertParentNotTrashed, countTrashedWithParent, loadBinNode, restoreChildBins, trashChildBins } from '../../lib/binHierarchy.js';
import { BIN_SELECT_COLS, fetchBinById } from '../../lib/binQueries.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../../lib/httpErrors.js';
import { cleanupBinPhotos } from '../../lib/photoCleanup.js';
import { assertLocationWritable } from '../../lib/planGate.js';
import { logRouteActivity } from '../../lib/routeHelpers.js';
import { purgeExpiredTrash } from '../../lib/trashPurge.js';

const router = Router();

// GET /api/bins/trash — list soft-deleted bins for a location
router.get('/trash', asyncHandler(async (req, res) => {
  // Accept both camelCase (canonical) and snake_case (legacy) for backward compatibility.
  const locationId = (req.query.locationId ?? req.query.location_id) as string | undefined;

  if (!locationId) {
    throw new ValidationError('locationId query parameter is required');
  }

  if (!await verifyLocationMembership(locationId, req.user!.id)) {
    throw new ForbiddenError('Not a member of this location');
  }

  // Fire-and-forget: purge bins past retention period
  purgeExpiredTrash(locationId).catch(() => {});

  const result = await query(
    `SELECT ${BIN_SELECT_COLS()}, b.deleted_at
     FROM bins b LEFT JOIN areas a ON a.id = b.area_id
     WHERE b.location_id = $1 AND b.deleted_at IS NOT NULL AND (b.visibility = 'location' OR b.created_by = $2) ORDER BY b.deleted_at DESC LIMIT 500`,
    [locationId, req.user!.id]
  );

  res.json({ results: result.rows, count: result.rows.length });
}));

// DELETE /api/bins/:id — soft-delete bin (admin only)
router.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const access = await verifyBinAccess(id, req.user!.id);
  if (!access) {
    throw new NotFoundError('Bin not found');
  }

  await assertLocationWritable(access.locationId);

  await requireCreatorOrAdmin(access.locationId, req.user!.id, access.createdBy, 'delete bins');

  // Fetch bin before soft-deleting for response
  const bin = await fetchBinById(id, { excludeDeleted: true });
  if (!bin) {
    throw new NotFoundError('Bin not found');
  }

  // Soft delete: children go to the trash with the same timestamp so they restore together
  await withTransaction(async (tx) => {
    await tx(`UPDATE bins SET deleted_at = ${d.now()}, updated_at = ${d.now()} WHERE id = $1`, [id]);
    const row = await loadBinNode(tx, id);
    await trashChildBins(tx, id, row!.deleted_at!);
  });

  logRouteActivity(req, { entityType: 'bin', locationId: access.locationId, action: 'delete', entityId: id, entityName: bin.name });

  res.json(bin);
}));

// POST /api/bins/:id/restore — restore a soft-deleted bin (admin only)
router.post('/:id/restore', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const deletedAccess = await verifyDeletedBinAccess(id, req.user!.id);
  if (!deletedAccess) {
    throw new NotFoundError('Deleted bin not found');
  }

  const { locationId } = deletedAccess;
  await requireAdmin(locationId, req.user!.id, 'restore bins');

  // Enforce bin limit inside a transaction with row lock to prevent concurrent bypass
  await withTransaction(async (tx) => {
    const { assertBinCreationAllowedTx: assertLimitTx } = await import('../../lib/planGate.js');
    const node = await loadBinNode(tx, id);
    if (!node?.deleted_at) throw new NotFoundError('Deleted bin not found');
    await assertParentNotTrashed(tx, node);
    // children trashed with this bin come back with it, so they count against the plan limit too
    const restoring = await countTrashedWithParent(tx, id, node.deleted_at);
    await assertLimitTx(req.user!.id, tx, 1 + restoring);
    await tx(
      `UPDATE bins SET deleted_at = NULL, updated_at = ${d.now()} WHERE id = $1`,
      [id],
    );
    await restoreChildBins(tx, id, node.deleted_at);
  });

  const bin = (await fetchBinById(id))!;

  logRouteActivity(req, { entityType: 'bin', locationId, action: 'restore', entityId: id, entityName: bin.name });

  res.json(bin);
}));

// DELETE /api/bins/:id/permanent — permanently delete a soft-deleted bin (admin only)
router.delete('/:id/permanent', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const deletedAccess = await verifyDeletedBinAccess(id, req.user!.id);
  if (!deletedAccess) {
    throw new NotFoundError('Deleted bin not found');
  }

  const { locationId, name: binName } = deletedAccess;
  await requireAdmin(locationId, req.user!.id, 'permanently delete bins');

  // Snapshot disk paths (this bin and its children) before the DB delete cascades the rows away.
  const childRows = await query<{ id: string }>('SELECT id FROM bins WHERE parent_bin_id = $1', [id]);
  const binIds = [id, ...childRows.rows.map((r) => r.id)];
  const snapshots = await Promise.all(
    binIds.map(async (binId) => {
      const [photosResult, attachmentsResult] = await Promise.all([
        query<{ storage_path: string; thumb_path: string | null }>(
          'SELECT storage_path, thumb_path FROM photos WHERE bin_id = $1',
          [binId],
        ),
        query<{ storage_path: string }>(
          'SELECT storage_path FROM attachments WHERE bin_id = $1',
          [binId],
        ),
      ]);
      return { binId, photos: photosResult.rows, attachments: attachmentsResult.rows };
    }),
  );

  // Children are removed by the parent_bin_id ON DELETE CASCADE
  await query('DELETE FROM bins WHERE id = $1', [id]);

  await Promise.all(
    snapshots.flatMap((s) => [
      cleanupBinPhotos(s.binId, s.photos),
      cleanupBinAttachments(s.binId, s.attachments),
    ]),
  );

  logRouteActivity(req, { entityType: 'bin', locationId, action: 'permanent_delete', entityId: id, entityName: binName });

  res.json({ message: 'Bin permanently deleted' });
}));

export default router;
