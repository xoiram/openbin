import type { TFunction } from 'i18next';
import { ArrowRight, Loader2, Package, RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { resolveColor } from '@/lib/colorPalette';
import { resolveIcon } from '@/lib/iconMap';
import { useTerminology } from '@/lib/terminology';
import { cn } from '@/lib/utils';
import type { Area, Bin } from '@/types';
import { deriveMoveList, type MoveListItem, type SourceCard } from './deriveMoveList';
import { MoveListSheet } from './MoveListSheet';
import type { PartialReorgResult } from './parsePartialReorg';
import type { ReorgResponse } from './useReorganize';

const COLLAPSED_ITEM_LIMIT = 6;

interface ReorganizePreviewProps {
  inputBins: Bin[];
  result: ReorgResponse | null;
  partialResult: PartialReorgResult;
  isStreaming: boolean;
  isApplying: boolean;
  areas: Area[];
  onAccept: () => void;
  onCancel: () => void;
  onRegenerate: () => void;
  onPrint?: () => void;
}

export function ReorganizePreview({
  inputBins,
  result,
  partialResult,
  isStreaming,
  isApplying,
  areas,
  onAccept,
  onCancel,
  onRegenerate,
  onPrint,
}: ReorganizePreviewProps) {
  const { t } = useTranslation('reorganize');
  const term = useTerminology();
  const source = result ?? partialResult;
  const derivation = useMemo(() => deriveMoveList(inputBins, source), [inputBins, source]);
  const summary = result?.summary ?? partialResult.summary;
  const hasContent = derivation.sourceCards.some((s) => s.outgoingClusters.length > 0);

  if (!hasContent && !isStreaming) return null;

  const { sourceCards, totalDestinationBins, totalItems, totalMoves } = derivation;
  const originalCount = inputBins.length;
  const binsKept = sourceCards.filter((s) => s.preserved).length;
  const binsCreated = Math.max(0, totalDestinationBins - binsKept);
  const itemsMoving = sourceCards.reduce(
    (sum, s) => sum + s.outgoingClusters.reduce(
      (n, c) => n + (c.destinationKept ? 0 : c.items.length),
      0,
    ),
    0,
  );

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <Label className="text-[15px] font-semibold text-[var(--text-primary)]">
          {t('preview.proposal', { defaultValue: 'Proposal' })}
        </Label>
        <div className="flex items-center gap-2 text-[12px] text-[var(--text-tertiary)] tabular-nums flex-wrap">
          <span>
            <span className="font-medium text-[var(--text-secondary)]">{originalCount}</span>
            <ArrowRight className="inline h-3 w-3 mx-1 -mt-0.5" aria-hidden="true" />
            <span className="font-medium text-[var(--text-secondary)]">{totalDestinationBins}</span>
            {' '}
            {t('preview.binWord', {
              count: totalDestinationBins,
              defaultValue_one: '{{bin}}',
              defaultValue_other: '{{bins}}',
              bin: term.bin,
              bins: term.bins,
            })}
          </span>
          <span aria-hidden="true" className="text-[var(--text-quaternary)]">·</span>
          <span>
            <span className="font-medium text-[var(--text-secondary)]">{totalItems}</span>
            {' '}
            {t('preview.itemWord', { count: totalItems, defaultValue_one: 'item', defaultValue_other: 'items' })}
          </span>
          <span aria-hidden="true" className="text-[var(--text-quaternary)]">·</span>
          <span>
            <span className="font-medium text-[var(--text-secondary)]">{totalMoves}</span>
            {' '}
            {t('preview.moveWord', { count: totalMoves, defaultValue_one: 'move', defaultValue_other: 'moves' })}
          </span>
          {binsKept > 0 && (
            <>
              <span aria-hidden="true" className="text-[var(--text-quaternary)]">·</span>
              <span>
                <span className="font-medium text-[var(--text-secondary)]">{binsKept}</span>
                {' '}
                {t('preview.keptWord', { defaultValue: 'kept' })}
              </span>
            </>
          )}
        </div>
      </div>

      {summary && (
        <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">{summary}</p>
      )}

      <ul
        className="flex flex-col gap-3"
        aria-label={t('preview.sourceListLabel', { defaultValue: 'Source {{bins}} with outgoing moves', bins: term.bins })}
      >
        {sourceCards.map((card, idx) => (
          <SourceCardRow key={card.sourceBin.id} card={card} delay={idx * 40} />
        ))}
      </ul>

      {!isStreaming && result && (
        <div className="flex flex-col gap-3 pt-3 border-t border-[var(--border-subtle)]">
          <Button onClick={onAccept} disabled={isApplying} fullWidth>
            {isApplying ? (
              <>
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                {t('applying', { defaultValue: 'Applying…' })}
              </>
            ) : (
              buildAcceptLabel(t, itemsMoving, binsKept, binsCreated, term.bin, term.bins)
            )}
          </Button>
          <div className="flex gap-2 justify-center flex-wrap">
            {onPrint && (
              <Button variant="ghost" size="sm" onClick={onPrint} disabled={isApplying}>
                {t('preview.printMoveList', { defaultValue: 'Print move list' })}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={onRegenerate} disabled={isApplying}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              {t('regenerate', { defaultValue: 'Regenerate' })}
            </Button>
            <Button variant="ghost" size="sm" onClick={onCancel} disabled={isApplying}>
              {t('preview.startOver', { defaultValue: 'Start over' })}
            </Button>
          </div>
        </div>
      )}

      {typeof document !== 'undefined' &&
        createPortal(
          <div className="move-list-print-only" aria-hidden="true">
            <MoveListSheet
              sourceCards={sourceCards}
              areas={areas}
              totalItems={totalItems}
              totalMoves={totalMoves}
              totalDestinationBins={totalDestinationBins}
              summary={summary}
            />
          </div>,
          document.body,
        )}
    </div>
  );
}

function SourceCardRow({ card, delay }: { card: SourceCard; delay: number }) {
  const { t } = useTranslation('reorganize');
  const Icon = card.sourceBin.icon ? resolveIcon(card.sourceBin.icon) : Package;
  const colorPreset = card.sourceBin.color ? resolveColor(card.sourceBin.color) : undefined;
  const chipBg = colorPreset?.bg ?? 'var(--bg-hover)';
  const itemTotal = card.outgoingClusters.reduce((sum, c) => sum + c.items.length, 0);
  const destinationCount = card.outgoingClusters.length;
  const statusText = card.preserved
    ? t('willBeKept', { defaultValue: 'will be kept' })
    : t('willBeEmptied', { defaultValue: 'will be emptied' });

  return (
    <li
      aria-label={t('preview.sourceCardLabel', {
        count: itemTotal,
        name: card.sourceBin.name,
        status: statusText,
        defaultValue_one: '{{name}}: {{count}} item, {{status}}',
        defaultValue_other: '{{name}}: {{count}} items, {{status}}',
      })}
      className="ai-stagger-item rounded-[var(--radius-md)] border border-[var(--border-flat)] bg-[var(--bg-flat)] overflow-hidden"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-center gap-3 px-3.5 py-3 bg-[var(--bg-input)] border-b border-[var(--border-subtle)]">
        <span
          className="flex items-center justify-center rounded-[var(--radius-sm)] h-8 w-8 shrink-0"
          style={{ backgroundColor: chipBg }}
          aria-hidden="true"
        >
          <Icon className="h-4 w-4 text-[var(--text-primary)]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-[15px] text-[var(--text-primary)] truncate leading-tight">
            {card.sourceBin.name || '…'}
          </div>
          <div className="text-[12px] text-[var(--text-tertiary)] mt-0.5 tabular-nums">
            {t('itemCount', { count: itemTotal, defaultValue_one: '{{count}} item', defaultValue_other: '{{count}} items' })}
            {destinationCount > 1 &&
              t('preview.destinations', { defaultValue: ' → {{n}} destinations', n: destinationCount })}
          </div>
        </div>
        <span
          className={cn(
            'shrink-0 inline-flex items-center rounded-[var(--radius-xs)] px-2 py-0.5 text-[11px] font-medium',
            card.preserved
              ? 'bg-[var(--color-success-soft)] text-[var(--color-success)]'
              : 'bg-[var(--bg-hover)] text-[var(--text-tertiary)]',
          )}
        >
          {statusText}
        </span>
      </div>

      <ul className="flex flex-col divide-y divide-[var(--border-subtle)]">
        {card.outgoingClusters.map((cluster) => (
          <ClusterRow key={cluster.destinationName} cluster={cluster} />
        ))}
      </ul>
    </li>
  );
}

function ClusterRow({ cluster }: { cluster: SourceCard['outgoingClusters'][number] }) {
  const { t } = useTranslation('reorganize');
  const term = useTerminology();
  const [expanded, setExpanded] = useState(false);
  const hasOverflow = cluster.items.length > COLLAPSED_ITEM_LIMIT;
  const visibleItems = expanded ? cluster.items : cluster.items.slice(0, COLLAPSED_ITEM_LIMIT);
  const hiddenCount = cluster.items.length - COLLAPSED_ITEM_LIMIT;
  const itemCount = cluster.items.length;

  return (
    <li className="px-3.5 py-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <ArrowRight className="h-3.5 w-3.5 text-[var(--text-tertiary)] shrink-0" aria-hidden="true" />
        <span className="font-medium text-[14px] text-[var(--text-primary)] min-w-0 truncate">
          {cluster.destinationName || '…'}
        </span>
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-[var(--radius-xs)] px-1.5 py-0.5 text-[11px] font-medium shrink-0',
            cluster.destinationKept
              ? 'text-[var(--color-success)]'
              : 'text-[var(--text-tertiary)]',
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              cluster.destinationKept ? 'bg-[var(--color-success)]' : 'bg-[var(--text-tertiary)]',
            )}
          />
          {cluster.destinationKept
            ? t('preview.existingBin', { defaultValue: 'Existing {{bin}}', bin: term.bin })
            : t('preview.newBin', { defaultValue: 'New {{bin}}', bin: term.bin })}
        </span>
        <span className="ml-auto shrink-0 text-[11px] text-[var(--text-tertiary)] tabular-nums">
          {t('itemCount', { count: itemCount, defaultValue_one: '{{count}} item', defaultValue_other: '{{count}} items' })}
        </span>
      </div>

      {cluster.destinationTags.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap pl-5">
          {cluster.destinationTags.map((tag) => (
            <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0">
              {tag}
            </Badge>
          ))}
        </div>
      )}

      <ul
        className="pl-5 space-y-1"
        aria-label={t('preview.itemsMovingTo', { defaultValue: 'Items moving to {{name}}', name: cluster.destinationName })}
      >
        {visibleItems.map((item, idx) => (
          <ItemRow key={`${item.name}-${idx}`} item={item} />
        ))}
      </ul>

      {hasOverflow && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="ml-5 text-[12px] font-medium text-[var(--accent)] hover:opacity-80"
        >
          {expanded
            ? t('preview.showLess', { defaultValue: 'Show less' })
            : t('preview.showMore', { defaultValue: 'Show {{n}} more', n: hiddenCount })}
        </button>
      )}
    </li>
  );
}

function ItemRow({ item }: { item: MoveListItem }) {
  const { t } = useTranslation('reorganize');
  const hasQty = item.quantity != null && item.quantity !== 1;
  const multi = item.multiDestinationCount && item.multiDestinationCount > 1;
  return (
    <li className="flex items-baseline gap-2 text-[13px] text-[var(--text-secondary)] leading-snug">
      <span aria-hidden="true" className="text-[var(--text-quaternary)] shrink-0 select-none leading-none">·</span>
      {hasQty && (
        <span className="tabular-nums text-[var(--text-tertiary)] font-medium text-[12px] shrink-0 select-none">
          {item.quantity}×
        </span>
      )}
      <span className="min-w-0 break-words">
        {item.name}
        {multi && (
          <span className="text-[var(--text-tertiary)] ml-1 text-[12px]">
            {t('preview.multiDestination', {
              defaultValue: '(×{{n}} destinations)',
              n: item.multiDestinationCount,
            })}
          </span>
        )}
      </span>
    </li>
  );
}

function buildAcceptLabel(
  t: TFunction<'reorganize'>,
  itemsMoving: number,
  binsKept: number,
  binsCreated: number,
  binWord: string,
  binsWord: string,
): string {
  const terms = { bin: binWord, bins: binsWord };
  const parts: string[] = [];
  parts.push(
    t('preview.accept.move', {
      count: itemsMoving,
      defaultValue_one: 'Move {{count}} item',
      defaultValue_other: 'Move {{count}} items',
    }),
  );
  if (binsKept > 0) {
    parts.push(
      t('preview.accept.keep', {
        count: binsKept,
        ...terms,
        defaultValue_one: 'keep {{count}} {{bin}}',
        defaultValue_other: 'keep {{count}} {{bins}}',
      }),
    );
  }
  if (binsCreated > 0) {
    parts.push(
      t('preview.accept.create', {
        count: binsCreated,
        ...terms,
        defaultValue_one: 'create {{count}} {{bin}}',
        defaultValue_other: 'create {{count}} {{bins}}',
      }),
    );
  }
  return t('preview.accept.label', { defaultValue: 'Accept — {{parts}}', parts: parts.join(', ') });
}
