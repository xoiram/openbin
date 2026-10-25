import express, { Router } from 'express';
import { query } from '../../db.js';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { isLocationAdmin, requireMemberOrAbove } from '../../lib/binAccess.js';
import {
  assertSupportedExportVersion,
  buildAreaExportEntries,
  buildAreaPathMap,
  buildExportBinEntry,
  buildFieldIdToNameMap,
  buildParentShortCodeMap,
  EXPORT_FORMAT_VERSION,
  type ExportArea,
  type ExportBin,
  type ExportLocationSettings,
  type ExportMember,
  type ExportPinnedBin,
  type ExportSavedView,
  fetchLocationBins,
  fetchLocationFieldDefs,
  fetchLocationMembers,
  fetchLocationPinnedBins,
  fetchLocationSavedViews,
  fetchLocationSettings,
  fetchLocationTagColors,
  fetchLooseItems,
  fetchTrashedBins,
  loadBinPhotosBase64,
  MAX_EXPORT_BINS,
  MAX_EXPORT_PHOTOS_PER_BIN,
  MAX_EXPORT_TOTAL_PHOTOS,
} from '../../lib/exportHelpers.js';
import { NotFoundError, ValidationError } from '../../lib/httpErrors.js';
import { buildDryRunPreview, executeFullImportTransaction } from '../../lib/importTransaction.js';
import { importLimiter } from '../../lib/rateLimiters.js';
import { logImportActivity } from '../../lib/routeHelpers.js';
import { requireLocationMember } from '../../middleware/locationAccess.js';
import { requireExportAccess } from '../../middleware/requirePlan.js';

const router = Router();

// GET /api/locations/:id/export — export all bins + photos for a location
// Streams JSON to avoid OOM: only one bin's photos are in memory at a time.
router.get('/locations/:id/export', requireLocationMember(), requireExportAccess(), asyncHandler(async (req, res) => {
  const locationId = req.params.id;
  await requireMemberOrAbove(locationId, req.user!.id, 'export location data');

  const locationResult = await query('SELECT name FROM locations WHERE id = $1', [locationId]);
  if (locationResult.rows.length === 0) {
    throw new NotFoundError('Location not found');
  }

  const locationName = locationResult.rows[0].name;
  const userId = req.user!.id;
  const [bins, trashedBinsRaw, tagColors, fieldDefs, fieldIdToName, areaPathMap, locationSettings, pinnedBins, savedViews, members, looseItems] = await Promise.all([
    fetchLocationBins(locationId, userId),
    fetchTrashedBins(locationId, userId),
    fetchLocationTagColors(locationId),
    fetchLocationFieldDefs(locationId),
    buildFieldIdToNameMap(locationId),
    buildAreaPathMap(locationId),
    fetchLocationSettings(locationId),
    fetchLocationPinnedBins(locationId, userId),
    fetchLocationSavedViews(locationId, userId),
    fetchLocationMembers(locationId),
    fetchLooseItems(locationId, userId),
  ]);
  const parentShortCodes = buildParentShortCodeMap(bins, trashedBinsRaw);

  if (bins.length + trashedBinsRaw.length > MAX_EXPORT_BINS) {
    throw new ValidationError(`Export limited to ${MAX_EXPORT_BINS} bins. Use filters or export in batches.`);
  }

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="openbin-export-${locationId}.json"`);

  // Write opening fields
  res.write(`{"version":${EXPORT_FORMAT_VERSION},"exportedAt":${JSON.stringify(new Date().toISOString())},"locationName":${JSON.stringify(locationName)}`);
  if (locationSettings) {
    res.write(`,"locationSettings":${JSON.stringify(locationSettings)}`);
  }

  // Track total photos across all bins to enforce global cap
  let totalPhotosStreamed = 0;

  // Stream bins array one entry at a time so only one bin's photos are buffered
  async function streamBins(key: string, rows: typeof bins, opts?: { includeTrashed: boolean }) {
    res.write(`,"${key}":[`);
    for (let i = 0; i < rows.length; i++) {
      if (i > 0) res.write(',');
      const entry = buildExportBinEntry(rows[i], fieldIdToName, areaPathMap, { ...opts, parentShortCodes });
      if (totalPhotosStreamed < MAX_EXPORT_TOTAL_PHOTOS) {
        let photos = await loadBinPhotosBase64(rows[i].id);
        if (photos.length > MAX_EXPORT_PHOTOS_PER_BIN) {
          photos = photos.slice(0, MAX_EXPORT_PHOTOS_PER_BIN);
        }
        const remaining = MAX_EXPORT_TOTAL_PHOTOS - totalPhotosStreamed;
        if (photos.length > remaining) {
          photos = photos.slice(0, remaining);
        }
        totalPhotosStreamed += photos.length;
        entry.photos = photos;
      } else {
        entry.photos = [];
      }
      res.write(JSON.stringify(entry));
    }
    res.write(']');
  }

  await streamBins('bins', bins);
  if (trashedBinsRaw.length > 0) {
    await streamBins('trashedBins', trashedBinsRaw, { includeTrashed: true });
  }

  // Remaining fields are small metadata — safe to buffer
  const allAreaPaths: ExportArea[] = buildAreaExportEntries(areaPathMap, looseItems);
  if (allAreaPaths.length > 0) res.write(`,"areas":${JSON.stringify(allAreaPaths)}`);
  if (looseItems.unassigned.length > 0) res.write(`,"unassignedItems":${JSON.stringify(looseItems.unassigned)}`);
  if (tagColors.length > 0) res.write(`,"tagColors":${JSON.stringify(tagColors)}`);
  if (fieldDefs.length > 0) res.write(`,"customFieldDefinitions":${JSON.stringify(fieldDefs)}`);
  if (pinnedBins.length > 0) res.write(`,"pinnedBins":${JSON.stringify(pinnedBins)}`);
  if (savedViews.length > 0) res.write(`,"savedViews":${JSON.stringify(savedViews)}`);
  if (members.length > 0) res.write(`,"members":${JSON.stringify(members)}`);

  res.end('}');
}));

// POST /api/locations/:id/import — import bins + photos
router.post('/locations/:id/import', importLimiter, express.json({ limit: '50mb' }), requireLocationMember(), asyncHandler(async (req, res) => {
  const locationId = req.params.id;
  await requireMemberOrAbove(locationId, req.user!.id, 'import JSON');
  const {
    version, bins, trashedBins, mode, tagColors, customFieldDefinitions,
    locationSettings, areas, unassignedItems, pinnedBins, savedViews, members, dryRun,
  } = req.body as {
    version?: unknown;
    bins: ExportBin[];
    trashedBins?: ExportBin[];
    mode: 'merge' | 'replace';
    tagColors?: Array<{ tag: string; color: string }>;
    customFieldDefinitions?: Array<{ name: string; position: number }>;
    locationSettings?: ExportLocationSettings;
    areas?: ExportArea[];
    unassignedItems?: unknown;
    pinnedBins?: ExportPinnedBin[];
    savedViews?: ExportSavedView[];
    members?: ExportMember[];
    dryRun?: boolean;
  };

  assertSupportedExportVersion(version);

  if (!bins || !Array.isArray(bins)) {
    throw new ValidationError('bins array is required');
  }
  if (trashedBins !== undefined && trashedBins !== null && !Array.isArray(trashedBins)) {
    throw new ValidationError('trashedBins must be an array');
  }
  const totalBins = bins.length + (trashedBins?.length || 0);
  if (totalBins > 2000) {
    throw new ValidationError('Too many bins in import (max 2000)');
  }

  const importMode = mode || 'merge';
  const userId = req.user!.id;

  if (dryRun) {
    res.json(await buildDryRunPreview(bins, importMode, locationId, { trashedBins: trashedBins ?? [], areas, unassignedItems, userId }));
    return;
  }

  const result = await executeFullImportTransaction({
    locationId,
    userId,
    isAdmin: await isLocationAdmin(locationId, userId),
    importMode,
    bins,
    trashedBins,
    tagColors,
    customFieldDefinitions,
    locationSettings,
    areas,
    unassignedItems,
    pinnedBins,
    savedViews,
    members,
  });

  logImportActivity(req, locationId, importMode, result.binsImported);

  res.json(result);
}));

export default router;
