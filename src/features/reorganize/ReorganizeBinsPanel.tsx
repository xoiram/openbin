import { Sparkles } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import type { useBinSelection } from '@/features/print/useBinSelection';
import { CreditCost, reorganizeWeight } from '@/lib/aiCreditCost';
import { useTerminology } from '@/lib/terminology';
import { usePlan } from '@/lib/usePlan';
import type { Area } from '@/types';
import { buildReorganizePlan } from './deriveMoveList';
import { formatApplyDescription } from './formatApplyDescription';
import { ReorganizeConfirmDialog } from './ReorganizeConfirmDialog';
import { ReorganizePreview } from './ReorganizePreview';
import {
  ReorganizeEmptyState,
  ReorganizeErrorCard,
  ReorganizePlanCapCard,
  ReorganizeProgressCard,
} from './ReorganizeStatusCards';
import type { useReorganize } from './useReorganize';
import type { ReorganizeBinsForm } from './useReorganizeBinsForm';

const AiCreditEstimate = __EE__
  ? lazy(() => import('@/ee/AiCreditEstimate').then((m) => ({ default: m.AiCreditEstimate })))
  : ((() => null) as React.FC<{ cost: number; className?: string }>);

interface Props {
  selection: ReturnType<typeof useBinSelection>;
  areas: Area[];
  form: ReorganizeBinsForm;
  reorganize: ReturnType<typeof useReorganize>;
}

export function ReorganizeBinsActionPanel({ selection, areas, form, reorganize }: Props) {
  const { t } = useTranslation('reorganize');
  const navigate = useNavigate();
  const term = useTerminology();
  const { showToast } = useToast();
  const { isPlus, planInfo } = usePlan();

  const {
    result,
    partialResult,
    isStreaming,
    error,
    applyError,
    isApplying,
    retryCount,
    startReorg,
    apply,
    cancel,
    clear,
  } = reorganize;

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [showProgress, setShowProgress] = useState(false);
  const reorgRef = useRef<HTMLDivElement>(null);

  const progressComplete = !isStreaming && !!result;

  useEffect(() => {
    if (isStreaming) {
      setShowProgress(true);
      return;
    }
    if (!progressComplete) {
      setShowProgress(false);
      return;
    }
    const id = setTimeout(() => setShowProgress(false), 800);
    return () => clearTimeout(id);
  }, [isStreaming, progressComplete]);

  const selectedAreaId = useMemo(() => {
    if (selection.selectedBins.length === 0) return undefined;
    const first = selection.selectedBins[0].area_id;
    return selection.selectedBins.every((b) => b.area_id === first) ? first : undefined;
  }, [selection.selectedBins]);

  const selectedAreaName = useMemo(
    () => areas.find((a) => a.id === selectedAreaId)?.name,
    [areas, selectedAreaId],
  );

  const itemCount = useMemo(
    () => selection.selectedBins.reduce((sum, b) => sum + b.items.length, 0),
    [selection.selectedBins],
  );

  const planCounts = useMemo(() => {
    if (!result) return { kept: 0, deleted: 0, created: 0, emptied: 0 };
    const plan = buildReorganizePlan(selection.selectedBins, result);
    return {
      kept: plan.preservations.length,
      deleted: plan.deletions.length,
      emptied: plan.emptied.length,
      created: plan.creations.length,
    };
  }, [result, selection.selectedBins]);

  const reorgBinCap = planInfo.features.reorganizeMaxBins;
  const overCap = reorgBinCap != null && selection.selectedIds.size > reorgBinCap;
  const canSubmit =
    selection.selectedIds.size >= 2 && !isStreaming && !form.hasValidationError && !overCap;
  const hasProposal = result || partialResult.bins.length > 0;

  const handleReorganize = useCallback(() => {
    if (selection.selectedBins.length < 2 || form.hasValidationError) return;
    startReorg(
      selection.selectedBins,
      form.maxBinsVal,
      selectedAreaId ?? undefined,
      selectedAreaName,
      form.options,
    );
    reorgRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [
    selection.selectedBins,
    form.hasValidationError,
    form.maxBinsVal,
    form.options,
    startReorg,
    selectedAreaId,
    selectedAreaName,
  ]);

  const handleAccept = useCallback(() => {
    apply(selection.selectedBins, selectedAreaId ?? undefined).then((outcome) => {
      if (!outcome.success) return;
      const parts: string[] = [];
      if (planCounts.kept > 0) {
        parts.push(t('binsPanel.appliedKept', { defaultValue: '{{n}} kept', n: planCounts.kept }));
      }
      if (planCounts.created > 0) {
        parts.push(t('binsPanel.appliedCreated', { defaultValue: '{{n}} created', n: planCounts.created }));
      }
      if (outcome.emptiedCount > 0) {
        parts.push(
          t('binsPanel.appliedEmptied', {
            count: outcome.emptiedCount,
            bins: term.bins,
            defaultValue_one: '{{count}} emptied but kept (contains other {{bins}})',
            defaultValue_other: '{{count}} emptied but kept (contain other {{bins}})',
          }),
        );
      }
      showToast({
        message:
          parts.length > 0
            ? t('binsPanel.appliedWithSummary', {
                defaultValue: 'Reorganization applied — {{summary}}',
                summary: parts.join(', '),
              })
            : t('binsPanel.applied', { defaultValue: 'Reorganization applied' }),
        variant: 'success',
        action:
          outcome.newBinIds.length > 0
            ? {
                label: t('binsPanel.printLabels', { defaultValue: 'Print labels' }),
                onClick: () => navigate(`/print?ids=${outcome.newBinIds.join(',')}`),
              }
            : undefined,
      });
      navigate('/bins');
    });
  }, [apply, selection.selectedBins, selectedAreaId, navigate, showToast, planCounts, term.bins, t]);

  const handleCancel = useCallback(() => {
    if (isStreaming) cancel();
    clear();
  }, [isStreaming, cancel, clear]);

  const handlePrintMoveList = useCallback(() => {
    document.body.classList.add('printing-move-list');
    const cleanup = () => document.body.classList.remove('printing-move-list');
    window.addEventListener('afterprint', cleanup, { once: true });
    window.print();
  }, []);

  return (
    <div ref={reorgRef} className="lg:sticky lg:top-6 flex flex-col gap-4">
      <Button
        data-tour="reorganize-submit"
        onClick={handleReorganize}
        disabled={!canSubmit}
        className="h-12 text-[17px] rounded-[var(--radius-md)]"
        fullWidth
      >
        <Sparkles className="h-5 w-5 mr-2.5" />
        {t('binsPanel.submit', {
          count: selection.selectedIds.size,
          bin: term.bin,
          bins: term.bins,
          defaultValue_one: 'Reorganize {{count}} {{bin}}',
          defaultValue_other: 'Reorganize {{count}} {{bins}}',
        })}
      </Button>

      {selection.selectedIds.size >= 2 && !overCap && (
        <div className="text-[12px] text-[var(--text-tertiary)] text-center -mt-2 flex flex-col items-center gap-0.5">
          <span>
            {t('itemsAcross', {
              count: itemCount,
              binCount: selection.selectedIds.size,
              bins: term.bins,
              defaultValue_one: '{{count}} item across {{binCount}} {{bins}}',
              defaultValue_other: '{{count}} items across {{binCount}} {{bins}}',
            })}
          </span>
          {__EE__ ? (
            <Suspense fallback={<CreditCost cost={reorganizeWeight(selection.selectedIds.size)} />}>
              <AiCreditEstimate cost={reorganizeWeight(selection.selectedIds.size)} />
            </Suspense>
          ) : (
            <CreditCost cost={reorganizeWeight(selection.selectedIds.size)} />
          )}
        </div>
      )}

      {overCap && reorgBinCap != null && (
        <ReorganizePlanCapCard
          binCap={reorgBinCap}
          selectedCount={selection.selectedIds.size}
          isPlus={isPlus}
          upgradeProAction={planInfo.upgradeProAction}
        />
      )}

      {(error || applyError) && (
        <ReorganizeErrorCard
          message={error || applyError || ''}
          onDismiss={clear}
          onRetry={handleReorganize}
          retryDisabled={!canSubmit}
        />
      )}

      {showProgress && (
        <ReorganizeProgressCard
          active={isStreaming}
          complete={progressComplete}
          label={
            isStreaming
              ? retryCount > 0
                ? t('retrying', { defaultValue: 'Retrying (attempt {{attempt}} of 3)', attempt: retryCount + 1 })
                : t('binsPanel.progress', { defaultValue: 'Reorganizing {{bins}}', bins: term.bins })
              : t('binsPanel.complete', { defaultValue: 'Complete' })
          }
          onCancel={isStreaming ? handleCancel : undefined}
        />
      )}

      {!showProgress && !error && (hasProposal || isStreaming) ? (
        <Card>
          <CardContent>
            <ReorganizePreview
              inputBins={selection.selectedBins}
              result={result}
              partialResult={partialResult}
              isStreaming={isStreaming}
              isApplying={isApplying}
              areas={areas}
              onAccept={() => setConfirmOpen(true)}
              onCancel={handleCancel}
              onRegenerate={handleReorganize}
              onPrint={handlePrintMoveList}
            />
          </CardContent>
        </Card>
      ) : !showProgress && !error && !applyError ? (
        <ReorganizeEmptyState
          message={t('binsPanel.emptyState', {
            defaultValue: 'Select at least 2 {{bins}} and click Reorganize to let AI suggest a better organization.',
            bins: term.bins,
          })}
        />
      ) : null}

      <ReorganizeConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('binsPanel.confirmTitle', { defaultValue: 'Apply reorganization?' })}
        description={t('binsPanel.confirmDescription', {
          defaultValue: '{{summary}} This cannot be undone.',
          summary: formatApplyDescription(planCounts, term.bin, term.bins, t),
        })}
        confirmLabel={t('binsPanel.confirmLabel', { defaultValue: 'Apply reorganization' })}
        confirmVariant="destructive"
        isApplying={isApplying}
        onConfirm={() => {
          setConfirmOpen(false);
          handleAccept();
        }}
      />
    </div>
  );
}
