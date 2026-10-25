import { Sparkles, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { getCommandInputRef } from '@/features/tour/TourProvider';
import { cn, flatCard } from '@/lib/utils';
import { ChecklistItem } from './ChecklistItem';
import { type ChecklistStepId, checklistStepText } from './checklistSteps';
import { useChecklist } from './useChecklist';

interface DashboardChecklistProps {
  totalBins: number;
  setCreateOpen: (open: boolean) => void;
  onUpgradeClick?: () => void;
}

export function DashboardChecklist({ totalBins, setCreateOpen, onUpgradeClick }: DashboardChecklistProps) {
  const { t } = useTranslation('checklist');
  const navigate = useNavigate();
  const { steps, completedCount, isHidden, dismiss } = useChecklist({ totalBins });

  if (isHidden) return null;

  function buildActions(stepId: ChecklistStepId, gated?: boolean) {
    if (stepId === 'create-bin') {
      return {
        primary: { label: t('actions.takePhoto', { defaultValue: 'Take a photo' }), onClick: () => setCreateOpen(true) },
        secondary: { label: t('actions.addManually', { defaultValue: 'Add manually' }), onClick: () => setCreateOpen(true) },
      };
    }
    if (stepId === 'add-three-bins') {
      return { primary: { label: t('actions.addAnother', { defaultValue: 'Add another' }), onClick: () => setCreateOpen(true) } };
    }
    if (stepId === 'ask-ai') {
      return {
        primary: {
          label: t('actions.tryIt', { defaultValue: 'Try it' }),
          onClick: () => {
            if (gated && onUpgradeClick) onUpgradeClick();
            else getCommandInputRef().current?.open();
          },
        },
      };
    }
    if (stepId === 'print-label') {
      return { primary: { label: t('actions.openPrint', { defaultValue: 'Open print' }), onClick: () => navigate('/print') } };
    }
    return {};
  }

  return (
    <section aria-labelledby="dash-checklist" className={cn(flatCard, 'p-4')}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[var(--accent)]" />
          <h2 id="dash-checklist" className="text-[15px] font-semibold text-[var(--text-primary)]">
            {t('title', { defaultValue: 'Get started' })}
          </h2>
          <span className="text-[12px] text-[var(--text-tertiary)]">
            {t('progress', { defaultValue: '{{completed}} of {{total}}', completed: completedCount, total: steps.length })}
          </span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={dismiss}
          aria-label={t('dismiss', { defaultValue: 'Dismiss checklist' })}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex flex-col gap-1">
        {steps.map((step) => {
          const { primary, secondary } = buildActions(step.id, step.gated);
          const { title, description } = checklistStepText(step.id, t);
          return (
            <ChecklistItem
              key={step.id}
              icon={step.icon}
              title={title}
              description={description}
              complete={step.complete}
              primary={primary}
              secondary={secondary}
            />
          );
        })}
      </div>
    </section>
  );
}
