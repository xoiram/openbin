import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTerminology } from '@/lib/terminology';
import { plural } from '@/lib/utils';

interface ConversationScopePillProps {
  binCount: number;
  onClear: () => void;
}

export function ConversationScopePill({ binCount, onClear }: ConversationScopePillProps) {
  const term = useTerminology();
  const { t } = useTranslation('ai');
  return (
    <span className="inline-flex items-center gap-1 max-w-full min-w-0 bg-[var(--tab-pill-bg)] text-[var(--ai-accent)] px-2.5 py-0.5 rounded-full text-[12px]">
      <span className="truncate">
        {t('scopePill.focusedOn', {
          defaultValue: 'Focused on {{n}} {{unit}}',
          n: binCount,
          unit: plural(binCount, term.bin, term.bins),
        })}
      </span>
      <button
        type="button"
        onClick={onClear}
        className="shrink-0 inline-flex items-center justify-center size-4 text-[var(--ai-accent)] hover:bg-[var(--ai-accent)]/10 rounded-full transition-colors"
        aria-label={t('scopePill.clearScope', { defaultValue: 'Clear scope' })}
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}
