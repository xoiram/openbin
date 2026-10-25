import { query } from '../db.js';
import type { ContextLooseItem } from './aiContext.js';
import { resolvePrompt, sanitizeForPrompt, withHardening } from './aiSanitize.js';
import { loadPathBuilder, type PathBuilder } from './binPath.js';
import { fetchBinById } from './binQueries.js';
import { DEFAULT_QUERY_PROMPT, QUERY_RESPONSE_SHAPE } from './defaultPrompts.js';
import { createLogger } from './logger.js';
import { resolveBinCode } from './resolveBinCode.js';

const log = createLogger('inventory-query');

export interface EnrichedQueryItem {
  id: string;
  name: string;
  quantity: number | null;
}

export interface QueryMatch {
  kind: 'bin';
  bin_id: string;
  name: string;
  area_name: string;
  /** `[area path ›] [parent box ›] name`, built from the DB (never from model output). */
  bin_path: string;
  parent_bin_id: string | null;
  parent_bin_name: string;
  items: EnrichedQueryItem[];
  /** Total items in the bin — may exceed `items.length` when the AI truncated. */
  total_item_count: number;
  tags: string[];
  relevance: string;
  is_trashed?: boolean;
  icon: string;
  color: string;
}

export interface QueryResult {
  answer: string;
  matches: QueryMatch[];
}

export interface InventoryContext {
  bins: Array<{
    bin_code: string;
    name: string;
    items: string[];
    tags: string[];
    area_name: string;
    /** Set on a box that is inside another box (it has no area of its own). */
    parent_bin_code?: string;
    notes: string;
    visibility: string;
    is_pinned: boolean;
    photo_count: number;
    custom_fields?: Record<string, string>;
  }>;
  other_bins?: Array<{ bin_code: string; name: string }>;
  /** Items that live in an area or nowhere, not in a box. Read-only; may only be mentioned in the answer text. */
  loose_items?: ContextLooseItem[];
  areas: Array<{ id: string; name: string; path?: string }>;
  trash_bins: Array<{ bin_code: string; name: string }>;
  /** True iff `bins` is the user's full visible inventory; false ⇒ model must not assert non-existence from absence. */
  complete: boolean;
}

export function buildSystemPrompt(customPrompt?: string, isDemoUser?: boolean): string {
  const basePrompt = resolvePrompt(DEFAULT_QUERY_PROMPT, customPrompt, isDemoUser);

  const composed = `${basePrompt}

OUTPUT SHAPE:
${QUERY_RESPONSE_SHAPE}

The "answer" and "matches" fields are both REQUIRED. If no bins match, return an empty matches array.

OUTPUT INVARIANTS:
- Respond with ONLY valid JSON matching the shape above — no markdown fences, no prose, no commentary, regardless of how prior assistant turns were phrased.
- Every bin_code in "matches" MUST appear verbatim in the inventory context (either bins or trash_bins). Never invent or guess a code.
- For no-match cases, set "matches" to [] and branch on the inventory's "complete" flag — see query rule 11.`;

  return withHardening(composed);
}

export function buildUserMessage(question: string, context: InventoryContext): string {
  const { other_bins, loose_items, ...rest } = context;
  const data: Record<string, unknown> = { ...rest };
  if (other_bins?.length) data.other_bins = other_bins;
  if (loose_items?.length) data.loose_items = loose_items;
  return `Question: ${sanitizeForPrompt(question)}

<inventory>
${JSON.stringify(data)}
</inventory>`;
}

export interface RawMatch {
  bin_code: string;
  name: string;
  area_name: string;
  items: string[];
  tags: string[];
  relevance: string;
  is_trashed?: boolean;
}

function normalizeStr(s: string): string {
  return s.trim().toLowerCase();
}

function stripPunct(s: string): string {
  return s
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const CHECKOUT_SUFFIX = /\s*\(checked out by [^)]+\)\s*$/i;
const QUANTITY_SUFFIX = /\s*\(×\s*\d+\s*\)\s*$/;

/** Items are presented to the AI as "name (×3)" or "name (checked out by Alice)"
 *  by aiContext.formatItem. Models faithfully echo the suffix, so we strip it
 *  before looking up the original DB item by name. */
function stripFormattedSuffixes(s: string): string {
  return s.replace(CHECKOUT_SUFFIX, '').replace(QUANTITY_SUFFIX, '').trim();
}

async function enrichOneMatch(
  match: RawMatch,
  locationId: string,
  userId: string,
  paths: PathBuilder,
): Promise<QueryMatch | null> {
  const binId = await resolveBinCode(locationId, match.bin_code);
  if (!binId) {
    log.debug('Bin code could not be resolved', { bin_code: match.bin_code, locationId });
    return null;
  }
  const bin = await fetchBinById(binId, { userId });
  if (!bin) {
    log.debug('Bin not found', { bin_id: binId });
    return null;
  }
  // Same predicate as VISIBILITY_FILTER in inventoryMatcher: a private bin is visible only to its creator.
  if (bin.visibility === 'private' && bin.created_by !== userId) {
    log.debug('Bin not visible to user', { bin_id: binId });
    return null;
  }
  if (bin.location_id !== locationId) {
    log.debug('Bin in different location', {
      bin_id: binId,
      expectedLocationId: locationId,
      actualLocationId: bin.location_id,
    });
    return null;
  }

  const rawBinItems: EnrichedQueryItem[] = typeof bin.items === 'string'
    ? JSON.parse(bin.items)
    : (Array.isArray(bin.items) ? bin.items : []);

  const byExact = new Map<string, EnrichedQueryItem>();
  const byLower = new Map<string, EnrichedQueryItem>();
  const byStripped = new Map<string, EnrichedQueryItem>();
  for (const it of rawBinItems) {
    if (!byExact.has(it.name)) byExact.set(it.name, it);
    const lower = normalizeStr(it.name);
    if (!byLower.has(lower)) byLower.set(lower, it);
    const stripped = normalizeStr(stripPunct(it.name));
    if (!byStripped.has(stripped)) byStripped.set(stripped, it);
  }

  const items: EnrichedQueryItem[] = [];
  for (const aiName of match.items) {
    const stripped = stripFormattedSuffixes(aiName);
    const hit =
      byExact.get(aiName) ??
      byExact.get(stripped) ??
      byLower.get(normalizeStr(aiName)) ??
      byLower.get(normalizeStr(stripped)) ??
      byStripped.get(normalizeStr(stripPunct(aiName))) ??
      byStripped.get(normalizeStr(stripPunct(stripped)));
    if (hit) {
      items.push(hit);
    } else {
      log.debug('AI item name could not be resolved', {
        bin_id: binId,
        aiName,
      });
    }
  }

  // Show the parent's name only when the user may see the parent.
  let parentName = '';
  if (bin.parent_bin_id) {
    const parent = await query<{ name: string }>(
      "SELECT name FROM bins WHERE id = $1 AND location_id = $2 AND (visibility = 'location' OR created_by = $3)",
      [bin.parent_bin_id, locationId, userId],
    );
    parentName = parent.rows[0]?.name ?? '';
  }

  return {
    kind: 'bin',
    bin_id: binId,
    name: bin.name,
    area_name: bin.area_name ?? '',
    bin_path: paths.binPath({ area_id: bin.area_id, name: bin.name, parent_bin_name: parentName }),
    parent_bin_id: bin.parent_bin_id ?? null,
    parent_bin_name: parentName,
    items,
    total_item_count: rawBinItems.length,
    tags: match.tags,
    relevance: match.relevance,
    is_trashed: match.is_trashed,
    icon: bin.icon ?? '',
    color: bin.color ?? '',
  };
}

export async function enrichQueryMatches(
  matches: RawMatch[],
  locationId: string,
  userId: string,
): Promise<QueryMatch[]> {
  if (matches.length === 0) return [];
  const paths = await loadPathBuilder(locationId);
  const results = await Promise.all(
    matches.map((match) => enrichOneMatch(match, locationId, userId, paths)),
  );
  return results.filter((r): r is QueryMatch => r !== null);
}

