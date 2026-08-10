import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useTerminology } from '@/lib/terminology';
import { categoryHeader, cn, flatCard } from '@/lib/utils';

interface EmptyConversationStateProps {
  isScoped: boolean;
  onPickExample: (text: string) => void;
}

export function EmptyConversationState({ isScoped, onPickExample }: EmptyConversationStateProps) {
  const term = useTerminology();
  const { t } = useTranslation('ai');

  const examples = useMemo(
    () =>
      isScoped
        ? [
            t('emptyState.scopedExample1', { defaultValue: 'Auto-tag these based on their contents' }),
            t('emptyState.scopedExample2', { defaultValue: 'What do these have in common?' }),
            t('emptyState.scopedExample3', { defaultValue: 'Move all of these to the Garage {{area}}', area: term.area }),
            t('emptyState.scopedExample4', { defaultValue: 'Suggest better names for these' }),
            t('emptyState.scopedExample5', { defaultValue: 'Which of these contain electronics?' }),
          ]
        : [
            t('emptyState.unscopedExample1', { defaultValue: 'Where is the cordless drill?' }),
            t('emptyState.unscopedExample2', { defaultValue: "What's in the Camping Gear {{bin}}?", bin: term.bin }),
            t('emptyState.unscopedExample3', { defaultValue: 'Which {{bins}} have batteries?', bins: term.bins }),
            t('emptyState.unscopedExample4', { defaultValue: 'Add bungee cords to the Car Supplies {{bin}}', bin: term.bin }),
            t('emptyState.unscopedExample5', { defaultValue: 'Create a {{bin}} called Pool Floats in the Garage', bin: term.bin }),
            t('emptyState.unscopedExample6', { defaultValue: 'Duplicate the Power Tools {{bin}}', bin: term.bin }),
            t('emptyState.unscopedExample7', { defaultValue: "What's in my trash?" }),
          ],
    [isScoped, t, term],
  );

  return (
    <div className="pt-6 pb-4 space-y-4 animate-fade-in">
      <p className={categoryHeader}>{t('emptyState.tryAsking', { defaultValue: 'Try asking' })}</p>
      <div className="space-y-1.5">
        {examples.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => onPickExample(example)}
            className={cn(
              flatCard,
              'block w-full text-left px-3 py-2 text-[13px] text-[var(--text-secondary)] hover:bg-[var(--bg-active)] transition-colors rounded-[var(--radius-sm)] [overflow-wrap:anywhere]',
            )}
          >
            {example}
          </button>
        ))}
      </div>
    </div>
  );
}
