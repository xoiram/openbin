import { Check, Mic, Square } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LabelThreshold } from '@/components/ui/ai-progress-bar';
import { AiProgressBar } from '@/components/ui/ai-progress-bar';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import { useCreditCostLabel } from '@/lib/aiCreditCost';
import type { useDictation } from '@/lib/useDictation';
import { cn, formatElapsed } from '@/lib/utils';

// Dictation chains transcribe (1 credit) + structure-text (1 credit) per
// gesture, so the entry-point tooltip surfaces 2.
const DICTATION_COST = 2;


interface DictationButtonProps {
  dictation: ReturnType<typeof useDictation>;
}

export function DictationButton({ dictation }: DictationButtonProps) {
  const { t } = useTranslation(['bins', 'common']);
  const transcribeLabels = useMemo<LabelThreshold[]>(
    () => [
      [0, t('dictation.sendingAudio', { defaultValue: 'Sending audio...' })],
      [30, t('dictation.transcribing', { defaultValue: 'Transcribing...' })],
      [70, t('dictation.almostDone', { defaultValue: 'Almost done...' })],
    ],
    [t],
  );
  const structureLabels = useMemo<LabelThreshold[]>(
    () => [
      [0, t('dictation.parsingItems', { defaultValue: 'Parsing items...' })],
      [30, t('dictation.extractingItems', { defaultValue: 'Extracting items...' })],
      [70, t('dictation.almostDone', { defaultValue: 'Almost done...' })],
    ],
    [t],
  );
  const {
    state,
    transcript,
    duration,
    structuredItems,
    start,
    stop,
    cancel,
    confirm,
    editTranscript,
    submitEditedTranscript,
  } = dictation;

  const [editing, setEditing] = useState(false);
  const [checked, setChecked] = useState<Map<number, boolean>>(new Map());
  const editRef = useRef<HTMLTextAreaElement>(null);

  // Reset local state when dictation returns to idle
  useEffect(() => {
    if (state === 'idle' || state === 'recording') {
      setEditing(false);
      setChecked(new Map());
    }
  }, [state]);

  function toggleChecked(index: number) {
    setChecked((prev) => {
      const next = new Map(prev);
      next.set(index, !(prev.get(index) ?? true));
      return next;
    });
  }

  function handleEditClick() {
    setEditing(true);
    editTranscript(transcript ?? '');
    setTimeout(() => editRef.current?.focus(), 0);
  }

  function handleConfirm() {
    if (!structuredItems) return;
    const selected = structuredItems.filter((_, i) => checked.get(i) !== false);
    confirm(selected);
    setChecked(new Map());
  }

  const elapsed = formatElapsed(duration);
  const { label: dictateLabel } = useCreditCostLabel(t('dictation.dictateItems', { defaultValue: 'Dictate items' }), DICTATION_COST);

  if (state === 'idle') {
    return (
      <Tooltip content={dictateLabel}>
        <button
          type="button"
          onClick={start}
          className="shrink-0 flex items-center justify-center size-11 rounded-[var(--radius-lg)] text-[var(--text-tertiary)] hover:bg-[var(--bg-active)] transition-colors"
          aria-label={dictateLabel}
        >
          <Mic className="h-4 w-4" />
        </button>
      </Tooltip>
    );
  }

  if (state === 'recording') {
    return (
      <output className="shrink-0 flex items-center gap-1.5" aria-label={t('dictation.recording', { defaultValue: 'Recording: {{elapsed}}', elapsed })}>
        <span className="text-[11px] text-[var(--text-tertiary)] tabular-nums">{elapsed}</span>
        <Tooltip content={t('dictation.stopRecording', { defaultValue: 'Stop recording' })}>
          <button
            type="button"
            onClick={stop}
            className="relative flex items-center justify-center size-11 rounded-full bg-[var(--destructive)] text-[var(--text-on-accent)] hover:bg-[var(--destructive-hover)] active:bg-[var(--destructive-active)] transition-colors"
            aria-label={t('dictation.stopRecording', { defaultValue: 'Stop recording' })}
          >
            <span className="absolute inset-[-3px] rounded-full bg-[var(--destructive)]/25 animate-pulse motion-reduce:animate-none" />
            <Square className="h-3.5 w-3.5 fill-current" />
          </button>
        </Tooltip>
      </output>
    );
  }

  if (state === 'transcribing') {
    return (
      <output className="w-full" aria-live="polite" aria-label={t('dictation.transcribingAudio', { defaultValue: 'Transcribing audio' })}>
        <AiProgressBar active compact labels={transcribeLabels} />
      </output>
    );
  }

  if (state === 'previewing-transcript') {
    return (
      <output className="w-full space-y-2" aria-live="polite">
        <div className="rounded-[var(--radius-sm)] bg-[var(--bg-elevated)] border border-[var(--border-subtle)] p-3">
          <div className="flex items-center gap-2 mb-1.5">
            <Check className="h-3.5 w-3.5 text-emerald-500" />
            <span className="text-xs font-medium text-emerald-500">{t('dictation.heard', { defaultValue: 'Heard:' })}</span>
            <div className="flex-1" />
            {!editing && (
              <button
                type="button"
                onClick={handleEditClick}
                className="text-[11px] text-[var(--text-quaternary)] underline hover:text-[var(--text-tertiary)]"
              >
                {t('dictation.edit', { defaultValue: 'edit' })}
              </button>
            )}
          </div>
          {editing ? (
            <div className="space-y-2">
              <textarea
                ref={editRef}
                value={transcript ?? ''}
                onChange={(e) => editTranscript(e.target.value)}
                className="w-full min-h-[60px] bg-[var(--bg-input)] rounded-[var(--radius-xs)] px-2.5 py-2 text-sm text-[var(--text-primary)] outline-none resize-none border border-[var(--border-flat)]"
                rows={2}
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={cancel}
                  className="text-[13px] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                >
                  {t('common:actions.cancel', { defaultValue: 'Cancel' })}
                </button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    setEditing(false);
                    submitEditedTranscript();
                  }}
                  disabled={!transcript?.trim()}
                >
                  {t('dictation.useThis', { defaultValue: 'Use this' })}
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-[var(--text-secondary)] italic">
              {t('dictation.transcriptQuote', { defaultValue: '“{{transcript}}”', transcript: transcript ?? '' })}
            </p>
          )}
        </div>
        {!editing && (
          <div className="flex items-center gap-2">
            <div className="flex-1 h-0.5 rounded-full bg-[var(--border-subtle)] overflow-hidden">
              <div className="h-full bg-[var(--accent)] rounded-full animate-[dictation-progress_1.5s_linear]" />
            </div>
            <span className="text-[11px] text-[var(--text-quaternary)]">{t('dictation.parsingItems', { defaultValue: 'Parsing items...' })}</span>
          </div>
        )}
      </output>
    );
  }

  if (state === 'structuring') {
    return (
      <output className="w-full" aria-live="polite" aria-label={t('dictation.parsingItemsAria', { defaultValue: 'Parsing items' })}>
        <AiProgressBar active compact labels={structureLabels} />
      </output>
    );
  }

  if (state === 'preview' && structuredItems) {
    const selectedCount = structuredItems.filter((_, i) => checked.get(i) !== false).length;
    return (
      <output className="w-full space-y-2" aria-live="polite">
        <div className="text-xs text-[var(--text-quaternary)]">
          {t('dictation.parsedCount', {
            count: structuredItems.length,
            defaultValue_one: '{{count}} item parsed from dictation',
            defaultValue_other: '{{count}} items parsed from dictation',
          })}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {structuredItems.map((item, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: items identified by stable index for toggle state
            <button key={i}
              type="button"
              onClick={() => toggleChecked(i)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full min-h-[44px] px-3 py-2 text-[13px] transition-all',
                checked.get(i) !== false
                  ? 'bg-[var(--accent)] text-white'
                  : 'bg-[var(--bg-secondary)] text-[var(--text-tertiary)] line-through',
              )}
            >
              {checked.get(i) !== false && <Check className="h-3 w-3" />}
              {item.quantity ? `${item.name} (\u00d7${item.quantity})` : item.name}
            </button>
          ))}
        </div>
        <div className="row pt-1">
          <Button type="button" variant="ghost" size="sm" onClick={cancel} className="gap-0.5">
            {t('common:actions.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <div className="flex-1" />
          <Button type="button" size="sm" onClick={handleConfirm} disabled={selectedCount === 0}>
            {t('dictation.addCount', { defaultValue: 'Add {{selected}}', selected: selectedCount })}
          </Button>
        </div>
      </output>
    );
  }

  return null;
}
