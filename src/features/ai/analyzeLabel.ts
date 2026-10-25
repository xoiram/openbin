import { parseAnalysisItemCount } from '@/features/ai/parsePartialAnalysis';

type Translate = (key: string, options?: Record<string, unknown>) => string;

/** Used when no `t` is supplied — mirrors the pre-i18n hardcoded English text exactly. */
const englishFallback: Translate = (_key, options) => {
  const count = options?.count;
  const raw =
    typeof count === 'number'
      ? (options?.[count === 1 ? 'defaultValue_one' : 'defaultValue_other'] ?? options?.defaultValue)
      : options?.defaultValue;
  return String(raw ?? '').replace(/\{\{count\}\}/g, String(count));
};

export type AnalyzeStreamMode = 'analyze' | 'reanalyze' | 'correction' | 'locking' | 'idle';

export interface AnalyzeLabelState {
  /** Plain text label, no trailing ellipsis. */
  text: string;
  /** Whether the caller should render an animated ellipsis after the text. */
  showEllipsis: boolean;
  /** Number of complete items parsed from the partial JSON stream. */
  itemCount: number;
}

/**
 * Compute the streaming label state for the photo-bulk-add review step.
 *
 * Pure function — given the active stream mode, the partial JSON text, and
 * whether the stream has completed, returns the human-readable label and item
 * count. The component renders the ellipsis separately (animated dots).
 */
/** `t` (from useTranslation('ai')) is optional — falls back to plain English when omitted. */
export function computeAnalyzeLabel(
  opts: { mode: AnalyzeStreamMode; partialText: string; complete: boolean },
  t?: unknown,
): AnalyzeLabelState {
  const translate = (t as Translate | undefined) ?? englishFallback;

  if (opts.complete) {
    return { text: translate('analyzeLabel.done', { defaultValue: 'Done' }), showEllipsis: false, itemCount: 0 };
  }

  if (opts.mode === 'locking') {
    const itemCount = parseAnalysisItemCount(opts.partialText);
    const text =
      itemCount === 0
        ? translate('analyzeLabel.noItemsFound', { defaultValue: 'No items found' })
        : translate('analyzeLabel.itemsFound', {
            count: itemCount,
            defaultValue_one: '{{count}} item found',
            defaultValue_other: '{{count}} items found',
          });
    return { text, showEllipsis: false, itemCount };
  }

  if (opts.mode === 'idle') {
    return { text: '', showEllipsis: false, itemCount: 0 };
  }

  const itemCount = parseAnalysisItemCount(opts.partialText);

  if (itemCount === 0) {
    if (opts.mode === 'reanalyze') {
      return { text: translate('analyzeLabel.reanalyzing', { defaultValue: 'Reanalyzing' }), showEllipsis: true, itemCount: 0 };
    }
    if (opts.mode === 'correction') {
      return {
        text: translate('analyzeLabel.applyingCorrection', { defaultValue: 'Applying correction' }),
        showEllipsis: true,
        itemCount: 0,
      };
    }
    return { text: translate('analyzeLabel.scanning', { defaultValue: 'Scanning' }), showEllipsis: true, itemCount: 0 };
  }

  return {
    text: translate('analyzeLabel.foundItems', {
      count: itemCount,
      defaultValue_one: 'Found {{count}} item',
      defaultValue_other: 'Found {{count}} items',
    }),
    showEllipsis: true,
    itemCount,
  };
}
