import { useTranslation } from 'react-i18next';
import { useTerminology } from '@/lib/terminology';

/** "1 selected bin" / "5 selected bins", using the location's configured terminology. */
export function useSelectedBinsLabel(count: number): string {
  const { t } = useTranslation('bins');
  const term = useTerminology();
  return t('bulk.selectedBins', {
    count,
    defaultValue_one: '{{count}} selected {{bin}}',
    defaultValue_other: '{{count}} selected {{bins}}',
    bin: term.bin,
    bins: term.bins,
  });
}
