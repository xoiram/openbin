import { Router } from 'express';
import { d, query } from '../db.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { NotFoundError } from '../lib/httpErrors.js';
import { type PhotoFileRow, type PhotoThumbRow, sendPhotoFile, sendPhotoThumb, setSharedHeaders } from '../lib/publicPhotoResponse.js';

// Unauthenticated, read-only view of a box, reached by scanning its QR code.
// See docs/public-qr-access.md. The bin UUID is the capability: look up by `id`
// only, never by short_code (name-derived, enumerable). Every refusal is the same
// 404 so the endpoint can't be used to probe which ids exist.
// Read-only on purpose: never add a mutating method to this router.

const router = Router();

const NOT_FOUND_MESSAGE = 'Not found';

/** A box is public when its location allows it, it isn't trashed and it isn't private. */
const PUBLIC_BIN_WHERE = `b.deleted_at IS NULL AND b.visibility != 'private' AND l.public_qr_access = TRUE`;

interface PublicBinRow {
  id: string;
  name: string;
  notes: string;
  tags: unknown;
  icon: string;
  color: string;
  card_style: string;
  created_at: string;
  updated_at: string;
  parent_bin_id: string | null;
  area_name: string;
  photos_enabled: unknown;
}

/** SQLite hands JSON columns back as strings, Postgres as parsed values. */
function asArray(value: unknown): string[] {
  if (Array.isArray(value)) return value as string[];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

// GET /api/public/bins/:id — public view of a box
router.get('/bins/:id', asyncHandler(async (req, res) => {
  const binResult = await query<PublicBinRow>(
    `SELECT b.id, b.name, b.notes, b.tags, b.icon, b.color, b.card_style, b.created_at, b.updated_at,
            b.parent_bin_id, COALESCE(a.name, '') AS area_name, l.public_qr_photos AS photos_enabled
     FROM bins b
     JOIN locations l ON l.id = b.location_id
     LEFT JOIN areas a ON a.id = b.area_id
     WHERE b.id = $1 AND ${PUBLIC_BIN_WHERE}`,
    [req.params.id],
  );
  if (binResult.rows.length === 0) throw new NotFoundError(NOT_FOUND_MESSAGE);
  const bin = binResult.rows[0];

  const [itemsResult, fieldsResult, childrenResult, parentResult, photosResult] = await Promise.all([
    query<{ name: string; quantity: number | null }>(
      'SELECT name, quantity FROM bin_items WHERE bin_id = $1 AND deleted_at IS NULL ORDER BY position',
      [bin.id],
    ),
    query<{ name: string; value: string }>(
      `SELECT cf.name, v.value
       FROM bin_custom_field_values v
       JOIN location_custom_fields cf ON cf.id = v.field_id
       WHERE v.bin_id = $1 AND v.value != ''
       ORDER BY cf.position`,
      [bin.id],
    ),
    query<{ id: string; name: string; icon: string; color: string; item_count: number | string }>(
      `SELECT c.id, c.name, c.icon, c.color,
              (SELECT COUNT(*) FROM bin_items bi WHERE bi.bin_id = c.id AND bi.deleted_at IS NULL) AS item_count
       FROM bins c
       WHERE c.parent_bin_id = $1 AND c.deleted_at IS NULL AND c.visibility != 'private'
       ORDER BY c.name ${d.nocase()}`,
      [bin.id],
    ),
    bin.parent_bin_id
      ? query<{ id: string; name: string }>(
        `SELECT id, name FROM bins WHERE id = $1 AND deleted_at IS NULL AND visibility != 'private'`,
        [bin.parent_bin_id],
      )
      : Promise.resolve({ rows: [] as { id: string; name: string }[] }),
    bin.photos_enabled
      ? query<{ id: string; filename: string }>(
        'SELECT id, filename FROM photos WHERE bin_id = $1 ORDER BY created_at',
        [bin.id],
      )
      : Promise.resolve({ rows: [] as { id: string; filename: string }[] }),
  ]);

  await query(
    `UPDATE bins SET public_view_count = public_view_count + 1, last_public_view_at = ${d.now()} WHERE id = $1`,
    [bin.id],
  );

  setSharedHeaders(res);
  // Allowlist: build the response field by field. Never spread the row (it would leak
  // area_id, location_id, created_by, visibility, short_code or the counter).
  res.json({
    id: bin.id,
    name: bin.name,
    area_name: bin.area_name,
    notes: bin.notes,
    tags: asArray(bin.tags),
    icon: bin.icon,
    color: bin.color,
    card_style: bin.card_style,
    created_at: bin.created_at,
    updated_at: bin.updated_at,
    items: itemsResult.rows.map((i) => ({ name: i.name, quantity: i.quantity })),
    custom_fields: fieldsResult.rows.map((f) => ({ name: f.name, value: f.value })),
    photos: photosResult.rows.map((p) => ({ id: p.id, filename: p.filename })),
    parent: parentResult.rows[0] ? { id: parentResult.rows[0].id, name: parentResult.rows[0].name } : null,
    children: childrenResult.rows.map((c) => ({
      id: c.id,
      name: c.name,
      icon: c.icon,
      color: c.color,
      item_count: Number(c.item_count),
    })),
  });
}));

/** Look up a photo of a public box, only while the location also allows public photos. */
async function findPublicPhoto<T>(binId: string, photoId: string, columns: string): Promise<T> {
  const result = await query<T>(
    `SELECT ${columns}
     FROM photos p
     JOIN bins b ON b.id = p.bin_id
     JOIN locations l ON l.id = b.location_id
     WHERE p.id = $1 AND p.bin_id = $2 AND ${PUBLIC_BIN_WHERE} AND l.public_qr_photos = TRUE`,
    [photoId, binId],
  );
  if (result.rows.length === 0) throw new NotFoundError(NOT_FOUND_MESSAGE);
  return result.rows[0];
}

// GET /api/public/bins/:id/photos/:photoId/file
router.get('/bins/:id/photos/:photoId/file', asyncHandler(async (req, res) => {
  const photo = await findPublicPhoto<PhotoFileRow>(req.params.id, req.params.photoId, 'p.storage_path, p.mime_type');
  await sendPhotoFile(res, photo);
}));

// GET /api/public/bins/:id/photos/:photoId/thumb
router.get('/bins/:id/photos/:photoId/thumb', asyncHandler(async (req, res) => {
  const photo = await findPublicPhoto<PhotoThumbRow>(req.params.id, req.params.photoId, 'p.storage_path, p.thumb_path');
  await sendPhotoThumb(res, req.params.photoId, photo);
}));

export { router as publicBinsRoutes };
