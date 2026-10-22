import { useTranslation } from 'react-i18next';

interface AiTurnThinkingProps {
  phase: 'parsing' | 'querying' | 'executing';
}

export function AiTurnThinking({ phase }: AiTurnThinkingProps) {
  const { t } = useTranslation('ai');
  const labels: Record<AiTurnThinkingProps['phase'], string> = {
    parsing: t('turnThinking.parsing', { defaultValue: 'Thinking' }),
    querying: t('turnThinking.querying', { defaultValue: 'Searching' }),
    executing: t('turnThinking.executing', { defaultValue: 'Applying' }),
  };

  return (
    <output
      className="ai-turn-enter flex items-center gap-2 text-[13px] text-[var(--text-secondary)] px-1"
      aria-busy="true"
      aria-label={t('turnThinking.ariaLabel', { defaultValue: 'AI is thinking' })}
    >
      <span className="inline-flex gap-1 items-center">
        <span
          className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] ai-thinking-pulse"
          style={{ animationDelay: '0ms' }}
        />
        <span
          className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] ai-thinking-pulse"
          style={{ animationDelay: '200ms' }}
        />
        <span
          className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] ai-thinking-pulse"
          style={{ animationDelay: '400ms' }}
        />
      </span>
      <span className="ai-thinking-label">{labels[phase]}…</span>
    </output>
  );
}
