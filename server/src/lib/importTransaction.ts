import type { TxQueryFn } from '../db.js';
import { query, withTransaction } from '../db.js';
import { childFieldsFromParent, type Q } from './binHierarchy.js';
import { validateBinFields } from './binValidation.js';
import {
  assertSupportedExportVersion,
  type ExportArea,
  type ExportBin,
  type ExportLocationSettings,
  type ExportMember,
  type ExportPinnedBin,
  type ExportSavedView,
  importAreas,
  importLocationSettings,
  importMembers,
  importPhotos,
  importPinnedBins,
  importSavedViews,
  importTagColors,
  insertBinItems,
  insertBinWithShortCode,
  insertLooseItems,
  mapCustomFieldsToIds,
  normalizeItemList,
  replaceCleanup,
  resolveArea,
  resolveCreatedBy,
  resolveCustomFieldDefs,
} from './exportHelpers.js';
import { ForbiddenError, PlanRestrictedError } from './httpErrors.js';
import { getUserBinCount, getUserFeatures } from './planGate.js';
import { validateBinName } from './validation.js';

export { assertSupportedExportVersion };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The fields of an exported bin that the import planner reads (shared by the dry run and the real import). */
export interface PlanBin {
  id?: string;
  name: string;
  shortCode?: string;
  parentShortCode?: string;
  visibility?: 'location' | 'private';
  deletedAt?: string | null;
  items?: unknown[];
  tags?: string[];
  notes?: string;
  icon?: string;
  color?: string;
  cardStyle?: string;
  customFields?: Record<string, string>;
}

export type DryRunBin = PlanBin;

export interface FullImportParams {
  locationId: string;
  userId: string;
  isAdmin: boolean;
  importMode: 'merge' | 'replace';
  bins: ExportBin[];
  trashedBins?: ExportBin[];
  tagColors?: Array<{ tag: string; color: string }>;
  customFieldDefinitions?: Array<{ name: string; position: number }>;
  locationSettings?: ExportLocationSettings;
  areas?: ExportArea[];
  /** Loose items not in any area. */
  unassignedItems?: unknown;
  pinnedBins?: ExportPinnedBin[];
  savedViews?: ExportSavedView[];
  members?: ExportMember[];
}

export interface FullImportResult {
  /** Live bins imported (top-level and children). */
  binsImported: number;
  /** Live bins skipped because they already exist (merge mode). */
  binsSkipped: number;
  /** Bins imported into the trash (incl. live children of a trashed parent). */
  trashedBinsImported: number;
  /** Trashed bins skipped because they already exist (merge mode). */
  trashedBinsSkipped: number;
  /** Of the imported bins (live and trashed), how many are child boxes. */
  childBinsImported: number;
  /** Child boxes skipped because their parent can't be resolved (live or trashed). */
  binsSkippedUnresolvedParent: number;
  photosImported: number;
  photosSkipped: number;
  areasImported: number;
  pinsImported: number;
  viewsImported: number;
  membersImported: number;
  settingsApplied: boolean;
  /** Loose items (in an area or unassigned) inserted. */
  looseItemsImported: number;
  /** Loose items skipped because an item with the same name already exists in that place (merge mode). */
  looseItemsSkipped: number;
}

// ---------------------------------------------------------------------------
// Bin plan: ONE function decides what happens to every bin, for the dry run and the real import
// ---------------------------------------------------------------------------

interface ExistingBin {
  id: string;
  short_code: string;
  parent_bin_id: string | null;
  area_id: string | null;
  visibility: 'location' | 'private';
  deleted_at: string | null;
  created_by: string | null;
}

export type ParentRef =
  | { kind: 'payload'; shortCode: string }
  | { kind: 'db'; node: { id: string; area_id: string | null; visibility: 'location' | 'private' } };

export interface PlannedBin<B extends PlanBin> {
  bin: B;
  /** Which payload array the bin came from. */
  fromTrashed: boolean;
  isChild: boolean;
  status: 'create' | 'exists' | 'unresolved_parent';
  /** Final deleted_at when status is 'create' (non-null = imported into the trash). */
  deletedAt: string | null;
  parent?: ParentRef;
  /** Human reason when status is 'unresolved_parent'. */
  reason?: string;
}

async function loadExistingBins(q: Q, locationId: string, shortCodes: string[]): Promise<Map<string, ExistingBin>> {
  const out = new Map<string, ExistingBin>();
  const unique = Array.from(new Set(shortCodes));
  const CHUNK = 400;
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    const placeholders = chunk.map((_, j) => `$${j + 2}`).join(', ');
    const rows = await q(
      `SELECT id, short_code, parent_bin_id, area_id, visibility, deleted_at, created_by
       FROM bins WHERE location_id = $1 AND short_code IN (${placeholders})`,
      [locationId, ...chunk],
    );
    for (const r of rows.rows as ExistingBin[]) out.set(r.short_code, r);
  }
  return out;
}

/**
 * Decide the fate of every bin in an import: create, skip because it exists (merge), or skip because
 * its parent can't be resolved. Order of the result is the execution order: top-level bins (active,
 * then trashed), then children (active, then trashed).
 *
 * Child parent resolution (parentShortCode): against top-level bins created by this request first,
 * then against existing bins matched by short code (merge mode; includes top-level bins that were
 * skipped because they exist). The parent must be top-level itself (depth <= 2), in the target
 * location and visible to the importing user. A live child under a trashed parent is imported
 * trashed with the parent's deletedAt. The child's area/visibility follow the parent at insert time.
 *
 * Validates every bin (throws ValidationError), exactly like the real import always did.
 */
export async function planBinImport<B extends PlanBin>(
  q: Q,
  opts: { locationId?: string; userId?: string; mode: 'merge' | 'replace'; bins: B[]; trashedBins?: B[] },
): Promise<PlannedBin<B>[]> {
  const { locationId, userId, mode } = opts;
  const all = [
    ...opts.bins.map(bin => ({ bin, fromTrashed: false })),
    ...(opts.trashedBins ?? []).map(bin => ({ bin, fromTrashed: true })),
  ];

  for (const { bin } of all) {
    validateBinName(bin.name);
    validateBinFields({
      items: bin.items,
      tags: bin.tags,
      notes: bin.notes,
      icon: bin.icon,
      color: bin.color,
      cardStyle: bin.cardStyle,
      visibility: bin.visibility,
      customFields: bin.customFields,
    });
  }

  let existing = new Map<string, ExistingBin>();
  if (mode === 'merge' && locationId) {
    const codes = all.flatMap(({ bin }) => [bin.shortCode, bin.parentShortCode]).filter((c): c is string => typeof c === 'string' && c.length > 0);
    existing = await loadExistingBins(q, locationId, codes);
  }

  const now = new Date().toISOString();
  const seen = new Set<string>();
  const plan: PlannedBin<B>[] = [];
  const createdTop = new Map<string, PlannedBin<B>>();
  const createdChildCodes = new Set<string>();

  const isChild = (bin: PlanBin) => typeof bin.parentShortCode === 'string' && bin.parentShortCode.length > 0;

  function existsAlready(bin: PlanBin): boolean {
    if (mode !== 'merge' || !bin.shortCode) return false;
    return existing.has(bin.shortCode) || seen.has(bin.shortCode);
  }

  // Pass 1: top-level bins
  for (const { bin, fromTrashed } of all) {
    if (isChild(bin)) continue;
    if (existsAlready(bin)) {
      plan.push({ bin, fromTrashed, isChild: false, status: 'exists', deletedAt: null });
      continue;
    }
    if (bin.shortCode) seen.add(bin.shortCode);
    const entry: PlannedBin<B> = {
      bin, fromTrashed, isChild: false, status: 'create',
      deletedAt: fromTrashed ? (bin.deletedAt || now) : null,
    };
    plan.push(entry);
    if (bin.shortCode && !createdTop.has(bin.shortCode)) createdTop.set(bin.shortCode, entry);
  }

  // Pass 2: children
  for (const { bin, fromTrashed } of all) {
    if (!isChild(bin)) continue;
    if (existsAlready(bin)) {
      plan.push({ bin, fromTrashed, isChild: true, status: 'exists', deletedAt: null });
      continue;
    }

    const parentCode = bin.parentShortCode as string;
    const unresolved = (reason: string): PlannedBin<B> => ({ bin, fromTrashed, isChild: true, status: 'unresolved_parent', deletedAt: null, reason });

    let parent: ParentRef | undefined;
    let parentDeletedAt: string | null = null;
    let reason: string | undefined;

    const inPayload = createdTop.get(parentCode);
    if (parentCode === bin.shortCode) {
      reason = "A bin can't be inside itself";
    } else if (inPayload) {
      parent = { kind: 'payload', shortCode: parentCode };
      parentDeletedAt = inPayload.deletedAt;
    } else if (createdChildCodes.has(parentCode)) {
      reason = "A bin that is inside another bin can't contain bins";
    } else {
      const row = existing.get(parentCode);
      if (!row) {
        reason = 'Parent bin not found';
      } else if (row.parent_bin_id) {
        reason = "A bin that is inside another bin can't contain bins";
      } else if (row.visibility === 'private' && userId && row.created_by !== userId) {
        reason = 'Parent bin not found';
      } else {
        parent = { kind: 'db', node: { id: row.id, area_id: row.area_id, visibility: row.visibility } };
        parentDeletedAt = row.deleted_at;
      }
    }
    if (!parent) {
      plan.push(unresolved(reason ?? 'Parent bin not found'));
      continue;
    }

    const own = fromTrashed ? (bin.deletedAt || null) : null;
    const deletedAt = own ?? parentDeletedAt ?? (fromTrashed ? now : null);
    if (bin.shortCode) {
      seen.add(bin.shortCode);
      createdChildCodes.add(bin.shortCode);
    }
    plan.push({ bin, fromTrashed, isChild: true, status: 'create', deletedAt, parent });
  }

  return plan;
}

// ---------------------------------------------------------------------------
// Loose items plan (shared by the dry run, the real import and the CSV import)
// ---------------------------------------------------------------------------

export interface LooseItem {
  name: string;
  quantity: number | null;
  /** Position as given in the file (index within its area). */
  position: number;
}

export interface LooseGroup {
  /** Normalised area path ("A / B"), or '' for unassigned items. */
  path: string;
  items: LooseItem[];
}

export interface LooseGroupPlan {
  path: string;
  create: LooseItem[];
  skipped: number;
}

export interface LoosePlan {
  groups: LooseGroupPlan[];
  total: number;
  toCreate: number;
  toSkip: number;
}

export function normalizeAreaPath(path: string): string {
  return path.split('/').map(p => p.trim()).filter(Boolean).join(' / ');
}

/** Build loose-item groups from the `areas[].items` and `unassignedItems` of a JSON/ZIP payload. */
export function collectLooseGroups(areas: ExportArea[] | undefined, unassignedItems: unknown): LooseGroup[] {
  const byPath = new Map<string, LooseGroup>();
  function add(path: string, raw: unknown, label: string) {
    const items = normalizeItemList(raw, label);
    if (items.length === 0) return;
    let group = byPath.get(path);
    if (!group) {
      group = { path, items: [] };
      byPath.set(path, group);
    }
    for (const item of items) group.items.push({ ...item, position: group.items.length });
  }
  if (Array.isArray(areas)) {
    for (const area of areas) {
      if (!area || typeof area.path !== 'string' || area.items === undefined) continue;
      add(normalizeAreaPath(area.path), area.items, 'Area items');
    }
  }
  add('', unassignedItems, 'unassignedItems');
  return Array.from(byPath.values());
}

/**
 * Decide which loose items are created or skipped. Merge: an item is skipped when an item with the
 * same name already exists in the same area (or both are unassigned) in the location, or appeared
 * earlier in the payload. Replace: nothing is skipped (existing items are deleted first).
 */
export async function planLooseItems(
  q: Q,
  opts: { locationId: string; mode: 'merge' | 'replace'; groups: LooseGroup[] },
): Promise<LoosePlan> {
  const { locationId, mode, groups } = opts;
  const existingNames = new Map<string, Set<string>>();
  if (mode === 'merge' && groups.length > 0) {
    const rows = await q(
      'SELECT area_id, name FROM bin_items WHERE location_id = $1 AND bin_id IS NULL AND deleted_at IS NULL',
      [locationId],
    );
    for (const r of rows.rows as Array<{ area_id: string | null; name: string }>) {
      const key = r.area_id ?? '';
      const set = existingNames.get(key) ?? new Set<string>();
      set.add(r.name);
      existingNames.set(key, set);
    }
  }

  const plan: LoosePlan = { groups: [], total: 0, toCreate: 0, toSkip: 0 };
  for (const group of groups) {
    let known = new Set<string>();
    if (mode === 'merge') {
      const areaId = group.path ? await lookupArea(locationId, group.path, q) : null;
      // A path that doesn't exist yet has no items; '' (unassigned) matches items with a NULL area.
      if (!group.path || areaId) known = new Set(existingNames.get(areaId ?? '') ?? []);
    }
    const create: LooseItem[] = [];
    let skipped = 0;
    for (const item of group.items) {
      if (mode === 'merge' && known.has(item.name)) {
        skipped++;
        continue;
      }
      if (mode === 'merge') known.add(item.name);
      create.push(item);
    }
    plan.groups.push({ path: group.path, create, skipped });
    plan.total += group.items.length;
    plan.toCreate += create.length;
    plan.toSkip += skipped;
  }
  return plan;
}

/** Insert the planned loose items. Returns how many were inserted. */
export async function executeLoosePlan(
  plan: LoosePlan,
  locationId: string,
  userId: string,
  tx: TxQueryFn,
): Promise<number> {
  let inserted = 0;
  for (const group of plan.groups) {
    if (group.create.length === 0) continue;
    const areaId = group.path ? await resolveArea(locationId, group.path, userId, tx) : null;
    await insertLooseItems(locationId, areaId, group.create, tx);
    inserted += group.create.length;
  }
  return inserted;
}

// ---------------------------------------------------------------------------
// Dry-run preview (no mutations)
// ---------------------------------------------------------------------------

export interface DryRunExtras {
  trashedBins?: DryRunBin[];
  areas?: ExportArea[];
  unassignedItems?: unknown;
  userId?: string;
}

export async function buildDryRunPreview(
  bins: DryRunBin[],
  importMode: 'merge' | 'replace',
  locationId?: string,
  extras: DryRunExtras = {},
) {
  const trashedBins = extras.trashedBins ?? [];
  const plan = await planBinImport(query, { locationId, userId: extras.userId, mode: importMode, bins, trashedBins });

  const toCreate: { name: string; itemCount: number; tags: string[]; trashed: boolean; isChild: boolean; parentShortCode?: string }[] = [];
  const toSkip: { name: string; reason: string; code: 'exists' | 'unresolved_parent' }[] = [];
  let totalItems = 0;
  let binsSkippedUnresolvedParent = 0;
  let totalChildBins = 0;

  for (const entry of plan) {
    const items = entry.bin.items || [];
    totalItems += items.length;
    if (entry.isChild) totalChildBins++;
    if (entry.status === 'exists') {
      toSkip.push({ name: entry.bin.name, reason: 'already exists', code: 'exists' });
    } else if (entry.status === 'unresolved_parent') {
      binsSkippedUnresolvedParent++;
      toSkip.push({ name: entry.bin.name, reason: 'parent not found', code: 'unresolved_parent' });
    } else {
      toCreate.push({
        name: entry.bin.name,
        itemCount: items.length,
        tags: entry.bin.tags || [],
        trashed: entry.deletedAt !== null,
        isChild: entry.isChild,
        ...(entry.isChild ? { parentShortCode: entry.bin.parentShortCode } : {}),
      });
    }
  }

  const loose: LoosePlan = locationId
    ? await planLooseItems(query, { locationId, mode: importMode, groups: collectLooseGroups(extras.areas, extras.unassignedItems) })
    : (() => {
        const groups = collectLooseGroups(extras.areas, extras.unassignedItems);
        const total = groups.reduce((n, g) => n + g.items.length, 0);
        return { groups: [], total, toCreate: total, toSkip: 0 } as LoosePlan;
      })();

  return {
    preview: true as const,
    toCreate,
    toSkip,
    /** Number of entries in the active `bins` array (unchanged meaning). */
    totalBins: bins.length,
    /** Number of entries in `trashedBins`. */
    totalTrashedBins: trashedBins.length,
    /** Child boxes (entries with parentShortCode) across bins and trashedBins. */
    totalChildBins,
    /** Child boxes that would be skipped because their parent can't be resolved. */
    binsSkippedUnresolvedParent,
    /** Items inside bins (active, trashed and child), including skipped ones. */
    totalItems,
    /** Loose items (areas[].items + unassignedItems / CSV rows without a bin), incl. skipped ones. */
    looseItemsTotal: loose.total,
    looseItemsToCreate: loose.toCreate,
    looseItemsToSkip: loose.toSkip,
  };
}

// ---------------------------------------------------------------------------
// Query-only area lookup (no creation) — used for CSV dry-run and the loose-item plan
// ---------------------------------------------------------------------------

export async function lookupArea(locationId: string, areaPath: string, q: Q = query): Promise<string | null> {
  const parts = areaPath.trim().split('/').map(p => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;

  let parentId: string | null = null;
  let lastId: string | null = null;

  for (const part of parts) {
    const sql = parentId === null
      ? 'SELECT id FROM areas WHERE location_id = $1 AND name = $2 AND parent_id IS NULL'
      : 'SELECT id FROM areas WHERE location_id = $1 AND name = $2 AND parent_id = $3';
    const params = parentId === null ? [locationId, part] : [locationId, part, parentId];
    const found = await q(sql, params);
    if (found.rows.length > 0) {
      lastId = found.rows[0].id as string;
      parentId = lastId;
    } else {
      return null;
    }
  }

  return lastId;
}

// ---------------------------------------------------------------------------
// Unified full import transaction (JSON and ZIP)
// ---------------------------------------------------------------------------

export async function executeFullImportTransaction(params: FullImportParams): Promise<FullImportResult> {
  const {
    locationId, userId, isAdmin, importMode,
    bins, trashedBins, tagColors, customFieldDefinitions,
    locationSettings, areas, unassignedItems, pinnedBins, savedViews, members,
  } = params;

  return withTransaction(async (tx: TxQueryFn) => {
    // Enforce plan limits before importing
    const features = await getUserFeatures(userId);
    if (features.maxBins !== null) {
      const currentCount = await getUserBinCount(userId);
      const toImport = bins.length + (trashedBins?.length ?? 0);
      if (currentCount + toImport > features.maxBins) {
        throw new PlanRestrictedError(
          'Import would exceed your plan\'s bin limit. Remove bins or upgrade your plan.',
        );
      }
    }
    if (features.maxPhotoStorageMb !== null) {
      const allPhotos = [...bins, ...(trashedBins ?? [])].flatMap(b => b.photos ?? []);
      // Estimate decoded size from base64 length without allocating buffers
      const importPhotoBytes = allPhotos.reduce((sum, p) => sum + (p.data ? Math.ceil(p.data.length * 3 / 4) : 0), 0);
      const importPhotoMb = importPhotoBytes / (1024 * 1024);
      const currentMb = await query<{ total: number }>('SELECT COALESCE(SUM(size), 0) as total FROM photos WHERE created_by = $1', [userId]);
      const currentPhotoMb = (currentMb.rows[0]?.total ?? 0) / (1024 * 1024);
      if (currentPhotoMb + importPhotoMb > features.maxPhotoStorageMb) {
        throw new PlanRestrictedError(
          'Import would exceed your plan\'s photo storage limit. Remove photos or upgrade your plan.',
        );
      }
    }

    // 1. Replace-mode cleanup (admin only)
    if (importMode === 'replace') {
      if (!isAdmin) {
        throw new ForbiddenError('Only admins can use replace mode');
      }
      await replaceCleanup(locationId, tx);
    }

    // 2. Location settings (replace mode only, admin only)
    let settingsApplied = false;
    if (locationSettings && importMode === 'replace' && isAdmin) {
      await importLocationSettings(locationId, locationSettings, tx);
      settingsApplied = true;
    }

    // 3. Members (admin only)
    let membersImported = 0;
    if (members && Array.isArray(members) && isAdmin) {
      membersImported = await importMembers(locationId, members, tx);
    }

    // 4. Tag colors
    if (tagColors && Array.isArray(tagColors)) {
      await importTagColors(locationId, tagColors, tx);
    }

    // 5. Custom field definitions
    let fieldNameToId: Map<string, string> | undefined;
    if (customFieldDefinitions && Array.isArray(customFieldDefinitions)) {
      fieldNameToId = await resolveCustomFieldDefs(locationId, customFieldDefinitions, tx);
    }

    // 6. Areas (before bins so paths exist)
    let areasImported = 0;
    if (areas && Array.isArray(areas)) {
      areasImported = await importAreas(locationId, areas, userId, tx);
    }

    // 7. Bins: one plan (shared with the dry run) decides create / exists / unresolved parent
    const oldToNewBinId = new Map<string, string>();
    const plan = await planBinImport(tx, { locationId, userId, mode: importMode, bins, trashedBins });
    const looseGroups = collectLooseGroups(areas, unassignedItems);
    const loosePlan = await planLooseItems(tx, { locationId, mode: importMode, groups: looseGroups });

    // exported short code -> the row created for it in this request (children resolve their parent here)
    const createdByShortCode = new Map<string, { id: string; areaId: string | null; visibility: 'location' | 'private' }>();

    let binsImported = 0;
    let binsSkipped = 0;
    let trashedBinsImported = 0;
    let trashedBinsSkipped = 0;
    let childBinsImported = 0;
    let binsSkippedUnresolvedParent = 0;
    let photosImported = 0;
    let photosSkipped = 0;

    for (const entry of plan) {
      const bin = entry.bin;
      if (entry.status === 'exists') {
        if (entry.fromTrashed) trashedBinsSkipped++;
        else binsSkipped++;
        continue;
      }
      if (entry.status === 'unresolved_parent') {
        binsSkippedUnresolvedParent++;
        continue;
      }

      let areaId: string | null;
      let visibility = bin.visibility;
      let parentBinId: string | null = null;
      if (entry.isChild) {
        const ref = entry.parent!;
        const parentRow = ref.kind === 'payload'
          ? createdByShortCode.get(ref.shortCode)!
          : { id: ref.node.id, areaId: ref.node.area_id, visibility: ref.node.visibility };
        const fields = childFieldsFromParent({ area_id: parentRow.areaId, visibility: parentRow.visibility }, bin.visibility);
        parentBinId = parentRow.id;
        areaId = fields.area_id;
        visibility = fields.visibility;
      } else {
        areaId = await resolveArea(locationId, bin.location || '', userId, tx);
      }

      let resolvedCustomFields = bin.customFields;
      if (resolvedCustomFields && fieldNameToId && fieldNameToId.size > 0) {
        resolvedCustomFields = mapCustomFieldsToIds(resolvedCustomFields, fieldNameToId);
      }

      const resolvedCreatedBy = await resolveCreatedBy(bin.createdBy, locationId, userId, tx);
      const newBinId = await insertBinWithShortCode(locationId, {
        name: bin.name,
        notes: bin.notes || '',
        tags: bin.tags || [],
        icon: bin.icon || '',
        color: bin.color || '',
        cardStyle: bin.cardStyle,
        visibility,
        customFields: resolvedCustomFields,
        shortCode: bin.shortCode,
        parentBinId,
        deletedAt: entry.deletedAt,
        createdAt: bin.createdAt || new Date().toISOString(),
        updatedAt: bin.updatedAt || new Date().toISOString(),
      }, areaId, resolvedCreatedBy, tx);

      oldToNewBinId.set(bin.id, newBinId);
      if (bin.shortCode && !entry.isChild && !createdByShortCode.has(bin.shortCode)) {
        createdByShortCode.set(bin.shortCode, { id: newBinId, areaId, visibility: visibility || 'location' });
      }
      await insertBinItems(newBinId, locationId, bin.items || [], tx);

      if (bin.photos && Array.isArray(bin.photos)) {
        const photoResult = await importPhotos(newBinId, locationId, bin.photos, userId, tx);
        photosImported += photoResult.imported;
        photosSkipped += photoResult.skipped;
      }

      if (entry.deletedAt) trashedBinsImported++;
      else binsImported++;
      if (entry.isChild) childBinsImported++;
    }

    // 8. Loose items (in an area or unassigned)
    const looseItemsImported = await executeLoosePlan(loosePlan, locationId, userId, tx);
    const looseItemsSkipped = loosePlan.toSkip;

    // 9. Pinned bins (after all bins are imported)
    let pinsImported = 0;
    if (pinnedBins && Array.isArray(pinnedBins)) {
      pinsImported = await importPinnedBins(pinnedBins, oldToNewBinId, tx);
    }

    // 10. Saved views
    let viewsImported = 0;
    if (savedViews && Array.isArray(savedViews)) {
      viewsImported = await importSavedViews(savedViews, tx);
    }

    return {
      binsImported, binsSkipped, trashedBinsImported, trashedBinsSkipped, childBinsImported, binsSkippedUnresolvedParent,
      photosImported, photosSkipped, areasImported, pinsImported, viewsImported, membersImported, settingsApplied,
      looseItemsImported, looseItemsSkipped,
    };
  });
}
