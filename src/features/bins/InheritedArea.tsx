import { useTranslation } from 'react-i18next';
import { useTerminology } from '@/lib/terminology';

interface InheritedAreaProps {
  areaName: string;
  /** Show the explanation that the area follows the parent box. */
  showNote?: boolean;
}

/** Read-only area value for a box that sits inside another box (it follows the parent's area). */
export function InheritedArea({ areaName, showNote = true }: InheritedAreaProps) {
  const { t } = useTranslation('bins');
  const term = useTerminology();
  return (
    <div className="space-y-1.5">
      <p className="flex h-11 items-center rounded-[var(--radius-sm)] border border-[var(--border-flat)] bg-[var(--bg-input)] px-3.5 text-[15px] opacity-60" data-testid="inherited-area">
        {areaName || <span className="text-[var(--text-tertiary)]">{t('detailRail.noArea', { defaultValue: 'No {{area}}', area: term.area })}</span>}
      </p>
      {showNote && (
        <p className="text-[11px] text-[var(--text-tertiary)]">
          {t('nesting.areaFollowsParent', { defaultValue: 'Follows the parent {{bin}}.', bin: term.bin })}
        </p>
      )}
    </div>
  );
}
