import { useTranslation } from 'react-i18next';
import type { ProgressTone } from '@/components/ui/progress-bar';
import type { PlanInfo, SubscriptionStatus } from '@/types';
import { usePlan } from './usePlan';
import { cn } from './utils';

// Mirror of the server-side weights. Kept as a small duplicate (instead
// of a shared package) because the cost is ~10 lines of arithmetic and
// adding a workspace package would dwarf the savings. If you change a
// value here, change the matching constant in
// `server/src/lib/aiCreditWeights.ts` too — the UI hint and the actual
// debit must agree.

// Structural stand-in for i18next's TFunction. The suffix helpers take their
// translator as `unknown` and cast it to a local named `t` (so the extractor
// still sees the literal keys) — see src/features/ai/aiConstants.ts for why a
// branded TFunction<Ns> parameter type doesn't work here.
type Translate = (key: string, options?: Record<string, unknown>) => string;

const PER_PHOTO = 5;
const PER_BIN = 2;

export function visionWeight(imageCount: number): number {
  const n = Math.max(1, Math.ceil(imageCount));
  return PER_PHOTO * n;
}

export function reorganizeWeight(binCount: number): number {
  const n = Math.max(0, Math.ceil(binCount));
  return PER_BIN * n;
}

export type CreditTone = ProgressTone;

export interface CreditEstimate {
  percent: number;
  projected: number;
  overLimit: boolean;
  tone: CreditTone;
  isTrial: boolean;
}

/** Pure math: derive the percent / threshold tone for a cost against the
 *  user's current `aiCredits` snapshot. Returns null when there is no
 *  meaningful limit to compare against (self-host, Pro/unlimited, Free
 *  with no AI), which lets callers fall back to plain "Uses N credits"
 *  copy. The display itself is cloud-only, but the arithmetic is data
 *  transformation — no cloud business logic. */
export function computeCreditEstimate(
  cost: number,
  aiCredits: PlanInfo['aiCredits'],
  status: SubscriptionStatus,
): CreditEstimate | null {
  if (cost <= 0) return null;
  if (!aiCredits || aiCredits.limit <= 0) return null;

  const { used, limit, resetsAt } = aiCredits;
  const projected = used + cost;
  const percent = Math.min(100, Math.round((cost / limit) * 100));
  const overLimit = projected > limit;
  const nearLimit = !overLimit && projected > limit * 0.8;
  const tone: CreditTone = overLimit ? 'red' : nearLimit ? 'amber' : 'neutral';
  // Plus trials have no monthly reset, so `resetsAt` stays null even when
  // limit > 0. Either signal flips the copy to "trial credits".
  const isTrial = status === 'trial' || resetsAt === null;

  return { percent, projected, overLimit, tone, isTrial };
}

/** Inline tooltip suffix: ` (12%)` or ` (would exceed monthly limit)`.
 *  Returns '' when there's no estimate to surface, so callers can
 *  unconditionally concat without an extra null check. */
export function formatCreditSuffix(estimate: CreditEstimate | null, translate: unknown): string {
  const t = translate as Translate;
  if (!estimate) return '';
  if (estimate.overLimit) {
    const reason = estimate.isTrial
      ? t('creditCost.wouldExceedTrial', { defaultValue: 'would exceed trial credits' })
      : t('creditCost.wouldExceedMonthly', { defaultValue: 'would exceed monthly limit' });
    return ` (${reason})`;
  }
  return ` (${estimate.percent}%)`;
}

/** Compact mobile suffix: ` · 12%` or ` · over`. */
export function formatCreditCompactSuffix(estimate: CreditEstimate | null, translate: unknown): string {
  const t = translate as Translate;
  if (!estimate) return '';
  return estimate.overLimit
    ? ` · ${t('creditCost.over', { defaultValue: 'over' })}`
    : ` · ${estimate.percent}%`;
}

/** Compose a "${baseLabel} · N credits (X%)" tooltip label plus a
 *  compact mobile suffix from the user's current plan info. Self-host
 *  has `aiCredits === null` and unlimited plans have `limit === 0`, so
 *  `computeCreditEstimate` returns null and the suffixes collapse to ''
 *  — the label degrades to "baseLabel · N credits" without a gate. */
export function useCreditCostLabel(baseLabel: string, cost: number): { label: string; compactSuffix: string } {
  const { t } = useTranslation('common');
  const { planInfo } = usePlan();
  const estimate = computeCreditEstimate(cost, planInfo.aiCredits, planInfo.status);
  const credits = t('creditCost.credits', {
    count: cost,
    defaultValue_one: '{{count}} credit',
    defaultValue_other: '{{count}} credits',
  });
  return {
    label: `${baseLabel} · ${credits}${formatCreditSuffix(estimate, t)}`,
    compactSuffix: formatCreditCompactSuffix(estimate, t),
  };
}

interface CreditCostProps {
  cost: number;
  className?: string;
}

export function CreditCost({ cost, className }: CreditCostProps): React.JSX.Element | null {
  const { t } = useTranslation('common');
  if (cost <= 0) return null;
  return (
    <span className={cn('text-xs text-zinc-500 dark:text-zinc-400', className)}>
      {t('creditCost.uses', {
        count: cost,
        defaultValue_one: 'Uses {{count}} credit',
        defaultValue_other: 'Uses {{count}} credits',
      })}
    </span>
  );
}
