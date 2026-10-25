import type { BinItem } from '@/types';

export type EnrichedQueryItem = BinItem;

interface QueryMatchBase {
  name: string;
  area_name: string;
  items: EnrichedQueryItem[];
  /** Total items in the bin — may exceed `items.length` when the AI truncated. */
  total_item_count: number;
  tags: string[];
  relevance: string;
  is_trashed?: boolean;
  icon: string;
  color: string;
  /**
   * `[area path ›] [parent box ›] name` for boxes; the area path (or '') for
   * loose items. Absent on older servers: fall back to `area_name`.
   */
  bin_path?: string;
}

/** A box. `kind` is absent on older servers/streams, which only returned boxes. */
export interface BinQueryMatch extends QueryMatchBase {
  kind?: 'bin';
  bin_id: string;
  bin_code?: string;
  parent_bin_id?: string | null;
  /** '' for top-level boxes or when the parent isn't visible to the user. */
  parent_bin_name?: string;
}

/** An item that lives in an area (or nowhere) rather than in a box. Display-only. */
export interface LooseItemQueryMatch extends QueryMatchBase {
  kind: 'loose_item';
  bin_id: null;
  bin_code?: null;
  item_id: string;
  quantity: number | null;
  area_id: string | null;
}

export type QueryMatch = BinQueryMatch | LooseItemQueryMatch;

export function isLooseItemMatch(m: QueryMatch): m is LooseItemQueryMatch {
  return m.kind === 'loose_item';
}

/** Stable identity of a match: loose items by `item_id`, boxes by `bin_id` (names can collide). */
export function getMatchKey(m: QueryMatch): string {
  return isLooseItemMatch(m) ? `item:${m.item_id}` : `bin:${m.bin_id}`;
}

const PATH_SEPARATOR = ' › ';

/**
 * Subtitle text under a box title: where the box lives (`area › parent box`).
 * The server's `bin_path` ends with the box's own name, which the title already
 * shows, so that last segment is dropped. Falls back to `area_name` for older
 * servers that don't send `bin_path`. For loose items `bin_path` is the area
 * path already ('' when unassigned).
 */
export function getMatchPath(m: QueryMatch): string {
  if (m.bin_path === undefined || m.bin_path === null) return m.area_name || '';
  if (isLooseItemMatch(m)) return m.bin_path;
  if (m.bin_path === m.name) return '';
  const suffix = `${PATH_SEPARATOR}${m.name}`;
  return m.bin_path.endsWith(suffix) ? m.bin_path.slice(0, -suffix.length) : m.bin_path;
}

export interface QueryResult {
  answer: string;
  matches: QueryMatch[];
}
