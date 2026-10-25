import { loadPathBuilder, type PathBuilder } from './binPath.js';
import {
  type CandidateBin,
  findCheckedOutLooseItems,
  findCheckedOutMatches,
  findLiteralMatches,
  findLooseItemMatches,
  findNearMissBins,
  findPinnedMatches,
  findPrivateMatches,
  findTrashedMatches,
  type LooseItemCandidate,
  MAX_LOOSE_CANDIDATES,
} from './inventoryMatcher.js';
import type { QueryPlan } from './queryPlan.js';

export interface HydratedBinMatch {
  kind: 'bin';
  bin_id: string;
  bin_code: string;
  name: string;
  area_name: string;
  /** `[area path ›] [parent box ›] name`, built server-side from the DB. */
  bin_path: string;
  parent_bin_id: string | null;
  parent_bin_name: string;
  items: Array<{ id: string; name: string; quantity: number | null }>;
  tags: string[];
  relevance: string;
  is_trashed?: boolean;
  icon: string;
  color: string;
  total_item_count: number;
}

/** An item that lives in an area (or nowhere) rather than in a box. Planner path only. */
export interface HydratedLooseItemMatch {
  kind: 'loose_item';
  bin_id: null;
  bin_code: null;
  item_id: string;
  /** The item's name. */
  name: string;
  quantity: number | null;
  area_id: string | null;
  /** '' when unassigned. */
  area_name: string;
  /** The area path; '' when unassigned. */
  bin_path: string;
  items: [];
  total_item_count: 1;
  tags: [];
  relevance: string;
  is_trashed: false;
  icon: '';
  color: '';
}

export type HydratedMatch = HydratedBinMatch | HydratedLooseItemMatch;

/** Total candidate cap shared by bins and loose items; loose items take at most MAX_LOOSE_CANDIDATES of it. */
const MAX_TOTAL_MATCHES = 30;

/** Public projection of CandidateBin used for "did you mean?" suggestions. */
export type NearMiss = Pick<CandidateBin, 'bin_id' | 'bin_code' | 'name' | 'area_name' | 'icon' | 'color'>;

export interface ExecutedPlan {
  matches: HydratedMatch[];
  near_misses: NearMiss[];
  answer: string;
}

const METADATA_EMPTY_ANSWER: Record<'pinned' | 'private' | 'checked_out' | 'trashed', string> = {
  pinned: "You don't have any pinned bins yet.",
  private: "You don't have any private bins.",
  checked_out: 'Nothing is currently checked out.',
  trashed: 'Your trash is empty.',
};

function hydrate(c: CandidateBin, relevance: string, paths: PathBuilder): HydratedBinMatch {
  return {
    kind: 'bin',
    bin_id: c.bin_id,
    bin_code: c.bin_code,
    name: c.name,
    area_name: c.area_name,
    bin_path: paths.binPath({ area_id: c.area_id, name: c.name, parent_bin_name: c.parent_bin_name }),
    parent_bin_id: c.parent_bin_id,
    parent_bin_name: c.parent_bin_name,
    items: c.items,
    tags: c.tags,
    relevance,
    ...(c.is_trashed ? { is_trashed: true } : {}),
    icon: c.icon,
    color: c.color,
    total_item_count: c.items.length,
  };
}

function hydrateLoose(c: LooseItemCandidate, paths: PathBuilder): HydratedLooseItemMatch {
  return {
    kind: 'loose_item',
    bin_id: null,
    bin_code: null,
    item_id: c.item_id,
    name: c.name,
    quantity: c.quantity,
    area_id: c.area_id,
    area_name: c.area_name,
    bin_path: paths.areaPath(c.area_id),
    items: [],
    total_item_count: 1,
    tags: [],
    relevance: c.match_hint,
    is_trashed: false,
    icon: '',
    color: '',
  };
}

function projectNearMiss(c: CandidateBin): NearMiss {
  return {
    bin_id: c.bin_id,
    bin_code: c.bin_code,
    name: c.name,
    area_name: c.area_name,
    icon: c.icon,
    color: c.color,
  };
}

async function gatherNearMisses(
  locationId: string,
  userId: string,
  terms: string[],
): Promise<CandidateBin[]> {
  const perTerm = await Promise.all(terms.map((term) => findNearMissBins(locationId, userId, term)));
  const seen = new Set<string>();
  const out: CandidateBin[] = [];
  for (const hits of perTerm) {
    for (const h of hits) {
      if (seen.has(h.bin_id)) continue;
      seen.add(h.bin_id);
      out.push(h);
    }
  }
  return out;
}

async function executeContent(
  plan: Extract<QueryPlan, { kind: 'content' }>,
  locationId: string,
  userId: string,
  scopedBinIds: string[] | undefined,
): Promise<ExecutedPlan> {
  const scoped = !!scopedBinIds && scopedBinIds.length > 0;
  const [binCandidates, looseCandidates] = await Promise.all([
    findLiteralMatches(locationId, userId, plan.terms, { scopedBinIds, fields: plan.fields }),
    // A selection scope is a set of boxes; loose items are never in it.
    scoped ? Promise.resolve([]) : findLooseItemMatches(locationId, userId, plan.terms, { fields: plan.fields }),
  ]);
  const loose = looseCandidates.slice(0, MAX_LOOSE_CANDIDATES);
  const bins = binCandidates.slice(0, MAX_TOTAL_MATCHES - loose.length);

  if (bins.length + loose.length > 0) {
    const paths = await loadPathBuilder(locationId);
    return {
      matches: [
        ...bins.map((c) => hydrate(c, c.match_hint, paths)),
        ...loose.map((c) => hydrateLoose(c, paths)),
      ],
      near_misses: [],
      answer: plan.answer,
    };
  }

  // No matches — try fuzzy bin-name "did you mean?" suggestions.
  const allFuzzy = await gatherNearMisses(locationId, userId, plan.terms);
  const fuzzy = scopedBinIds && scopedBinIds.length > 0
    ? allFuzzy.filter((m) => scopedBinIds.includes(m.bin_id)).slice(0, 3)
    : allFuzzy.slice(0, 3);
  const answer = fuzzy.length > 0
    ? `I couldn't find any bins matching that. Did you mean ${fuzzy.map((m) => m.name).join(', ')}?`
    : "I couldn't find any bins matching that.";

  return { matches: [], near_misses: fuzzy.map(projectNearMiss), answer };
}

const METADATA_MATCHERS: Record<
  'pinned' | 'private' | 'checked_out' | 'trashed',
  (locationId: string, userId: string, opts: { scopedBinIds?: string[] }) => Promise<CandidateBin[]>
> = {
  pinned: findPinnedMatches,
  private: findPrivateMatches,
  checked_out: findCheckedOutMatches,
  trashed: findTrashedMatches,
};

async function executeMetadata(
  plan: Extract<QueryPlan, { kind: 'metadata' }>,
  locationId: string,
  userId: string,
  scopedBinIds: string[] | undefined,
): Promise<ExecutedPlan> {
  const candidates = await METADATA_MATCHERS[plan.metadata](locationId, userId, { scopedBinIds });
  const wantsLoose = plan.metadata === 'checked_out' && !(scopedBinIds && scopedBinIds.length > 0);
  const loose = wantsLoose ? await findCheckedOutLooseItems(locationId, userId) : [];
  const paths = await loadPathBuilder(locationId);
  const matches: HydratedMatch[] = [
    ...candidates.slice(0, MAX_TOTAL_MATCHES - loose.length).map((c) => hydrate(c, c.match_hint, paths)),
    ...loose.map((c) => hydrateLoose(c, paths)),
  ];
  return {
    matches,
    near_misses: [],
    answer: matches.length === 0 ? METADATA_EMPTY_ANSWER[plan.metadata] : plan.answer,
  };
}

export async function executeQueryPlan(
  plan: QueryPlan,
  locationId: string,
  userId: string,
  scopedBinIds?: string[],
): Promise<ExecutedPlan> {
  if (plan.kind === 'refusal') {
    return { matches: [], near_misses: [], answer: plan.reason };
  }
  if (plan.kind === 'metadata') {
    return executeMetadata(plan, locationId, userId, scopedBinIds);
  }
  return executeContent(plan, locationId, userId, scopedBinIds);
}
