import { parseAnalysisItemCount } from '@/features/ai/parsePartialAnalysis';
import { plural } from '@/lib/utils';

type Translate = (key: string, options?: Record<string, unknown>) => string;

/** Used when no `t` is supplied — mirrors the pre-i18n hardcoded English text exactly. */
const englishFallback: Translate = (_key, options) => (options?.defaultValue as string) ?? '';

function itemWord(count: number, translate: Translate): string {
  return plural(
    count,
    translate('itemQuery.item', { defaultValue: 'item' }),
    translate('itemQuery.items', { defaultValue: 'items' }),
  );
}

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
        : `${itemCount} ${itemWord(itemCount, translate)} ${translate('analyzeLabel.foundSuffix', { defaultValue: 'found' })}`;
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
    text: `${translate('analyzeLabel.foundPrefix', { defaultValue: 'Found' })} ${itemCount} ${itemWord(itemCount, translate)}`,
    showEllipsis: true,
    itemCount,
  };
}
