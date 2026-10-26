import { useTranslation } from 'react-i18next';
import { useToast } from '@/components/ui/toast';
import { useTerminology } from '@/lib/terminology';
import { getErrorMessage } from '@/lib/utils';
import type { Bin } from '@/types';

export interface BulkFailure {
  id: string;
  message: string;
}

export interface BulkRunResult {
  moved: string[];
  failed: BulkFailure[];
}

/** Split selected ids into boxes that can be changed on their own and boxes inside another box (children). */
export function splitChildren(ids: string[], bins: Bin[] | undefined): { eligible: string[]; childCount: number } {
  if (!bins) return { eligible: ids, childCount: 0 };
  const childIds = new Set(bins.filter((b) => b.parent_bin_id).map((b) => b.id));
  const eligible = ids.filter((id) => !childIds.has(id));
  return { eligible, childCount: ids.length - eligible.length };
}

/** Run one request per id; a failure never aborts the others. */
export async function runEach(ids: string[], fn: (id: string) => Promise<unknown>): Promise<BulkRunResult> {
  const settled = await Promise.allSettled(ids.map((id) => fn(id)));
  const moved: string[] = [];
  const failed: BulkFailure[] = [];
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') moved.push(ids[i]);
    else failed.push({ id: ids[i], message: getErrorMessage(r.reason) });
  });
  return { moved, failed };
}

/** Note shown in a bulk dialog when some selected boxes sit inside other boxes and are skipped. */
export function SkippedChildrenNote({ count }: { count: number }) {
  const { t } = useTranslation('bins');
  const term = useTerminology();
  if (count <= 0) return null;
  return (
    <p className="text-[13px] text-[var(--text-tertiary)]" role="note">
      {t('nestedList.skippedChildren', {
        count,
        defaultValue_one: '{{count}} {{bin}} inside another {{bin}} follows its parent and was skipped',
        defaultValue_other: '{{count}} {{bins}} inside other {{bins}} follow their parent and were skipped',
        bin: term.bin,
        bins: term.bins,
      })}
    </p>
  );
}

/** Reports "N moved, M skipped, K failed" (with the first server message) as a toast. */
export function useBulkResultToast() {
  const { t } = useTranslation('bins');
  const { showToast } = useToast();
  return function report(result: BulkRunResult, skipped: number, options?: { alwaysShow?: boolean }) {
    const { moved, failed } = result;
    if (!options?.alwaysShow && skipped === 0 && failed.length === 0) return;
    const parts: string[] = [];
    if (moved.length > 0) parts.push(t('nestedList.result.moved', { count: moved.length, defaultValue: '{{count}} moved' }));
    if (skipped > 0) parts.push(t('nestedList.result.skipped', { count: skipped, defaultValue: '{{count}} skipped' }));
    if (failed.length > 0) parts.push(t('nestedList.result.failed', { count: failed.length, defaultValue: '{{count}} failed' }));
    let message = parts.join(', ');
    if (failed.length > 0) message += `: ${failed[0].message}`;
    showToast({ message, variant: failed.length > 0 || skipped > 0 ? 'warning' : 'success' });
  };
}
