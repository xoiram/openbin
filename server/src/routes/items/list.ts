import { Router } from 'express';
import { d, query } from '../../db.js';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { verifyLocationMembership } from '../../lib/binAccess.js';
import { ForbiddenError, ValidationError } from '../../lib/httpErrors.js';
import { ITEM_FROM, itemScopePredicate } from '../../lib/itemQueries.js';

const router = Router();

// GET /api/items?location_id=X&q=search&area_id=A&unassigned=true&loose=true&sort=alpha|bin&sort_dir=asc|desc&limit=40&offset=0
router.get('/', asyncHandler(async (req, res) => {
  const locationId = req.query.location_id as string | undefined;
  const searchQuery = req.query.q as string | undefined;
  const sortParam = req.query.sort as string | undefined;
  const limit = Math.min(Math.max(parseInt(req.query.limit as string, 10) || 40, 1), 100);
  const offset = Math.max(parseInt(req.query.offset as string, 10) || 0, 0);

  if (!locationId) {
    throw new ValidationError('location_id is required');
  }

  if (!await verifyLocationMembership(locationId, req.user!.id)) {
    throw new ForbiddenError('Not a member of this location');
  }

  const params: unknown[] = [locationId, req.user!.id];
  let whereClause = '';

  if (searchQuery?.trim()) {
    params.push(searchQuery.trim());
    whereClause += ` AND (${d.fuzzyMatch('bi.name', `$${params.length}`)} OR ${d.fuzzyMatch('b.name', `$${params.length}`)} OR ${d.fuzzyMatch('a.name', `$${params.length}`)})`;
  }

  // Filters (all optional, combinable):
  //   area_id / areaId  items whose effective area is X: loose items in X plus items in boxes in X
  //   unassigned=true   items with no effective area: unassigned loose items plus items in unassigned boxes
  //   loose=true        only items that are not in a box (bin_id IS NULL)
  const areaIdParam = (req.query.area_id ?? req.query.areaId) as string | undefined;
  const wantUnassigned = req.query.unassigned === 'true';
  if (areaIdParam && wantUnassigned) {
    throw new ValidationError('Provide only one of area_id or unassigned');
  }
  if (areaIdParam) {
    params.push(areaIdParam);
    whereClause += ` AND COALESCE(bi.area_id, b.area_id) = $${params.length}`;
  } else if (wantUnassigned) {
    whereClause += ' AND bi.area_id IS NULL AND (bi.bin_id IS NULL OR b.area_id IS NULL)';
  }
  if (req.query.loose === 'true') {
    whereClause += ' AND bi.bin_id IS NULL';
  }

  const baseQuery = `
    FROM ${ITEM_FROM}
    WHERE ${itemScopePredicate(1, 2)}${whereClause}`;

  // Count query
  const countResult = await query<{ total: number }>(
    `SELECT COUNT(*) AS total ${baseQuery}`,
    params,
  );
  const total = countResult.rows[0]?.total ?? 0;

  // Sort
  const orderParam = req.query.sort_dir as string | undefined;
  const desc = orderParam === 'desc';
  const dir = desc ? 'DESC' : 'ASC';
  let orderBy: string;
  if (sortParam === 'bin') {
    orderBy = `COALESCE(b.name, a.name, '') ${d.nocase()} ${dir}, bi.name ${d.nocase()} ${dir}`;
  } else if (sortParam === 'qty') {
    // NULLs sort last regardless of direction
    orderBy = `CASE WHEN bi.quantity IS NULL THEN 1 ELSE 0 END, bi.quantity ${dir}, bi.name ${d.nocase()} ASC`;
  } else {
    orderBy = `bi.name ${d.nocase()} ${dir}`;
  }

  // Data query
  params.push(limit, offset);
  const dataResult = await query<{
    id: string;
    name: string;
    quantity: number | null;
    bin_id: string | null;
    bin_name: string | null;
    bin_icon: string | null;
    bin_color: string | null;
    area_id: string | null;
    area_name: string | null;
  }>(
    `SELECT bi.id, bi.name, bi.quantity, bi.bin_id, b.name AS bin_name, b.icon AS bin_icon, b.color AS bin_color,
            bi.area_id, a.name AS area_name
     ${baseQuery}
     ORDER BY ${orderBy}
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  res.json({ results: dataResult.rows, count: total });
}));

export default router;
