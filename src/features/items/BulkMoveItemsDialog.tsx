import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAreaList } from '@/features/areas/useAreas';
import { useBin } from '@/features/bins/useBins';
import { useAuth } from '@/lib/auth';
import { BulkUpdateDialog } from '@/lib/bulk/BulkUpdateDialog';
import { useTerminology } from '@/lib/terminology';
import { ItemPlacePicker, type PlaceKind } from './ItemPlacePicker';
import type { ItemMoveTarget } from './useItemBulkActions';

interface BulkMoveItemsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedIds: string[];
  /** `targetName` is what the success toast shows (box name, area name or "Unassigned"). */
  onApply: (ids: string[], target: ItemMoveTarget, targetName: string) => Promise<void>;
}

export function BulkMoveItemsDialog({ open, onOpenChange, selectedIds, onApply }: BulkMoveItemsDialogProps) {
  const { t } = useTranslation('items');
  const term = useTerminology();
  const { activeLocationId } = useAuth();
  const [kind, setKind] = useState<PlaceKind>('bin');
  const [binId, setBinId] = useState<string | null>(null);
  const [areaId, setAreaId] = useState<string | null>(null);
  const { areas } = useAreaList(open ? activeLocationId : null);
  const { bin } = useBin(open && kind === 'bin' ? (binId ?? undefined) : undefined);

  const target: ItemMoveTarget | null =
    kind === 'bin' ? (binId ? { binId } : null) : kind === 'area' ? (areaId ? { areaId } : null) : { unassigned: true };

  function targetName(): string {
    // useBin keeps the previous box until the new one loads; fall back to the noun if it hasn't yet.
    if (kind === 'bin') return (bin && bin.id === binId ? bin.name : '') || term.bin;
    if (kind === 'area') return areas.find((a) => a.id === areaId)?.name ?? term.area;
    return t('table.unassigned', { defaultValue: 'Unassigned' });
  }

  return (
    <BulkUpdateDialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          setKind('bin');
          setBinId(null);
          setAreaId(null);
        }
        onOpenChange(v);
      }}
      title={t('bulkMove.title', {
        count: selectedIds.length,
        defaultValue_one: 'Move {{count}} item',
        defaultValue_other: 'Move {{count}} items',
      })}
      description={t('looseItems.move.description', {
        defaultValue: 'Choose where to put the items: in a {{bin}}, in an {{area}}, or unassigned.',
        bin: term.bin,
        area: term.area,
      })}
      selectedIds={selectedIds}
      onApply={async (ids) => {
        if (!target) return;
        await onApply(ids, target, targetName());
      }}
      applyDisabled={!target}
      applyLabel={t('bulkMove.submit', { defaultValue: 'Move' })}
      loadingLabel={t('bulkMove.submitting', { defaultValue: 'Moving…' })}
    >
      <ItemPlacePicker
        locationId={activeLocationId ?? undefined}
        kind={kind}
        onKindChange={setKind}
        binId={binId}
        onBinChange={setBinId}
        areaId={areaId}
        onAreaChange={setAreaId}
        noneHint={t('looseItems.move.noneHint', {
          defaultValue: 'The items will be in no {{bin}} and no {{area}}.',
          bin: term.bin,
          area: term.area,
        })}
      />
    </BulkUpdateDialog>
  );
}
