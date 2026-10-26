import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BulkUpdateDialog } from '@/lib/bulk/BulkUpdateDialog';
import { useTerminology } from '@/lib/terminology';
import type { Bin } from '@/types';
import { runEach, useBulkResultToast } from './bulkNesting';
import { ParentBinPicker } from './ParentBinPicker';
import { updateBin } from './useBins';
import { useSelectedBinsLabel } from './useSelectedBinsLabel';

interface BulkParentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  binIds: string[];
  /** Loaded boxes, used to filter out selections that can't be nested before calling the API. */
  bins?: Bin[];
  onDone: () => void;
}

interface Plan {
  /** Boxes the update will be attempted for. */
  apply: string[];
  /** Boxes left alone, with the reason. */
  hasChildren: number;
  isTarget: number;
  alreadyThere: number;
}

/** Decide which selected boxes can take part: a box with children can't be nested, nothing nests into itself, no-ops are skipped. */
export function planParentChange(ids: string[], bins: Bin[] | undefined, parentId: string | null): Plan {
  const byId = new Map((bins ?? []).map((b) => [b.id, b]));
  const plan: Plan = { apply: [], hasChildren: 0, isTarget: 0, alreadyThere: 0 };
  for (const id of ids) {
    const bin = byId.get(id);
    if (parentId) {
      if (id === parentId) plan.isTarget++;
      else if ((bin?.child_count ?? 0) > 0) plan.hasChildren++;
      else if (bin && bin.parent_bin_id === parentId) plan.alreadyThere++;
      else plan.apply.push(id);
    } else if (bin && !bin.parent_bin_id) {
      plan.alreadyThere++;
    } else {
      plan.apply.push(id);
    }
  }
  return plan;
}

export function BulkParentDialog({ open, onOpenChange, binIds, bins, onDone }: BulkParentDialogProps) {
  const { t } = useTranslation('bins');
  const term = useTerminology();
  const selectedLabel = useSelectedBinsLabel(binIds.length);
  const report = useBulkResultToast();
  const [parentId, setParentId] = useState<string | null>(null);
  const [chosen, setChosen] = useState(false);

  useEffect(() => {
    if (open) {
      setParentId(null);
      setChosen(false);
    }
  }, [open]);

  const plan = planParentChange(binIds, bins, chosen ? parentId : null);
  const skipped = plan.hasChildren + plan.isTarget + plan.alreadyThere;

  async function apply(ids: string[]) {
    const p = planParentChange(ids, bins, parentId);
    const result = await runEach(p.apply, (id) => updateBin(id, { parentBinId: parentId }));
    report(result, p.hasChildren + p.isTarget + p.alreadyThere, { alwaysShow: true });
  }

  return (
    <BulkUpdateDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('nestedList.bulkParent.title', { defaultValue: 'Move into {{bin}}', bin: term.bin })}
      description={t('nestedList.bulkParent.description', {
        defaultValue: 'Place {{selected}} inside another {{bin}}, or take them out. They follow the {{area}} and visibility of the one you choose.',
        selected: selectedLabel,
        bin: term.bin,
        area: term.area,
      })}
      selectedIds={binIds}
      onApply={apply}
      onApplied={onDone}
      applyDisabled={!chosen || plan.apply.length === 0}
      applyLabel={t('nestedList.bulkParent.apply', { defaultValue: 'Move' })}
      loadingLabel={t('bulk.moving', { defaultValue: 'Moving...' })}
    >
      <div className="space-y-2">
        <ParentBinPicker
          value={parentId}
          onChange={(id) => {
            setParentId(id);
            setChosen(true);
          }}
        />
        {chosen && (
          <div className="space-y-1 text-[13px] text-[var(--text-tertiary)]" role="note">
            {plan.hasChildren > 0 && (
              <p>
                {t('nestedList.bulkParent.skipHasChildren', {
                  count: plan.hasChildren,
                  defaultValue_one: '{{count}} {{bin}} contains other {{bins}} and can’t be placed inside one, so it will be skipped',
                  defaultValue_other: '{{count}} {{bins}} contain other {{bins}} and can’t be placed inside one, so they will be skipped',
                  bin: term.bin,
                  bins: term.bins,
                })}
              </p>
            )}
            {plan.isTarget > 0 && (
              <p>{t('nestedList.bulkParent.skipSelf', { defaultValue: 'The chosen {{bin}} can’t be placed inside itself and will be skipped', bin: term.bin })}</p>
            )}
            {plan.alreadyThere > 0 && (
              <p>
                {t('nestedList.bulkParent.skipAlready', {
                  count: plan.alreadyThere,
                  defaultValue_one: '{{count}} {{bin}} is already there and will be skipped',
                  defaultValue_other: '{{count}} {{bins}} are already there and will be skipped',
                  bin: term.bin,
                  bins: term.bins,
                })}
              </p>
            )}
            {skipped > 0 && plan.apply.length === 0 && (
              <p>{t('nestedList.bulkParent.nothingToMove', { defaultValue: 'Nothing left to move with this choice' })}</p>
            )}
          </div>
        )}
      </div>
    </BulkUpdateDialog>
  );
}
