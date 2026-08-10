import { plural, pluralize } from '@/lib/utils';
import type { QueryMatch } from './useInventoryQuery';

type Translate = (key: string, options?: Record<string, unknown>) => string;

export type DisplayMode = 'header-only' | 'inline-disclosure' | 'nav-disclosure';
export type RelevanceKind = 'item' | 'name' | 'tag' | 'metadata' | 'fuzzy' | 'unknown';

export interface MatchDisplay {
  mode: DisplayMode;
  defaultExpanded: boolean;
  countLabel: string;
}

const METADATA_HINTS = new Set([
  'pinned',
  'private',
  'in trash',
  'has checked-out items',
]);

/**
 * Maps the server-side `relevance` string (from `describeMatchHint` and the
 * metadata matchers in server/src/lib/inventoryMatcher.ts) to a typed kind.
 *
 * If those server strings ever change format, the test suite for this file
 * will fail loudly.
 */
export function parseRelevanceKind(relevance: string): RelevanceKind {
  if (!relevance) return 'unknown';
  if (relevance.startsWith('contains "')) return 'item';
  if (relevance.startsWith('name contains "')) return 'name';
  if (relevance.startsWith('tagged "')) return 'tag';
  if (METADATA_HINTS.has(relevance)) return 'metadata';
  if (relevance === 'name similar to query') return 'fuzzy';
  return 'unknown';
}

/** Optional `t` (from useTranslation('ai')) — falls back to plain English pluralize when omitted. */
function itemCountLabel(count: number, t?: unknown): string {
  if (!t) return pluralize(count, 'item');
  const translate = t as Translate;
  const word = plural(
    count,
    translate('itemQuery.item', { defaultValue: 'item' }),
    translate('itemQuery.items', { defaultValue: 'items' }),
  );
  return `${count} ${word}`;
}

export function getMatchDisplay(match: QueryMatch, t?: unknown): MatchDisplay {
  const itemsCount = match.items.length;
  const totalCount = match.total_item_count;

  if (itemsCount === 0 && totalCount === 0) {
    return { mode: 'header-only', defaultExpanded: false, countLabel: '' };
  }
  if (itemsCount === 0) {
    return {
      mode: 'nav-disclosure',
      defaultExpanded: false,
      countLabel: itemCountLabel(totalCount, t),
    };
  }
  const kind = parseRelevanceKind(match.relevance);
  return {
    mode: 'inline-disclosure',
    defaultExpanded: kind === 'item' && itemsCount === 1,
    // Pill shows MATCHED item count; BinItemGroup's "+N more" footer covers the delta to total.
    countLabel: itemCountLabel(itemsCount, t),
  };
}
