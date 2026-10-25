import { Router } from 'express';
import { query } from '../../db.js';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { verifyLocationMembership } from '../../lib/binAccess.js';
import { ForbiddenError } from '../../lib/httpErrors.js';

const router = Router();

// GET /api/locations/:id/stats — dashboard aggregate stats
router.get('/:id/stats', asyncHandler(async (req, res) => {
  const locationId = req.params.id;

  if (!await verifyLocationMembership(locationId, req.user!.id)) {
    throw new ForbiddenError('Not a member of this location');
  }

  const result = await query<{
    total_bins: number;
    total_items: number;
    total_areas: number;
    needs_organizing: number;
    loose_item_count: number;
  }>(
    `SELECT
      (SELECT COUNT(*) FROM bins WHERE location_id = $1 AND deleted_at IS NULL) AS total_bins,
      (SELECT COUNT(*) FROM bin_items bi
        WHERE bi.location_id = $1 AND bi.deleted_at IS NULL
          AND (bi.bin_id IS NULL OR bi.bin_id IN (SELECT id FROM bins WHERE deleted_at IS NULL))
      ) AS total_items,
      (SELECT COUNT(*) FROM areas WHERE location_id = $1) AS total_areas,
      (SELECT COUNT(*) FROM bins b WHERE b.location_id = $1 AND b.deleted_at IS NULL
        AND b.area_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM bin_items bi WHERE bi.bin_id = b.id AND bi.deleted_at IS NULL)
        AND (b.tags IS NULL OR b.tags = '[]')
      ) AS needs_organizing,
      (SELECT COUNT(*) FROM bin_items WHERE location_id = $1 AND bin_id IS NULL AND deleted_at IS NULL) AS loose_item_count`,
    [locationId],
  );

  res.json(result.rows[0]);
}));

export default router;
