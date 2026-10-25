import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BinPickerList } from '@/components/ui/bin-picker-list';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RadioOption } from '@/components/ui/radio-option';
import { useToast } from '@/components/ui/toast';
import { useTerminology } from '@/lib/terminology';
import { returnItem, returnItemInLocation } from './useCheckouts';

interface ReturnItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemName: string;
  /** Origin box of the checkout; null when the item had no box (area or unassigned). */
  binId: string | null;
  locationId: string;
  itemId: string;
  originBinName?: string;
}

export function ReturnItemDialog({ open, onOpenChange, itemName, binId, locationId, itemId, originBinName }: ReturnItemDialogProps) {
  const { t } = useTranslation(['checkouts', 'common']);
  const term = useTerminology();
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'origin' | 'different'>('origin');
  const [targetId, setTargetId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const { showToast } = useToast();

  function handleOpenChange(next: boolean) {
    if (!next) {
      setMode('origin');
      setTargetId(null);
      setSearch('');
    }
    onOpenChange(next);
  }

  async function handleReturn() {
    setLoading(true);
    try {
      const target = mode === 'different' && targetId ? targetId : undefined;
      if (binId) await returnItem(binId, itemId, target);
      else await returnItemInLocation(locationId, itemId, target);
      handleOpenChange(false);
      showToast({ message: t('returnItem.returned', { defaultValue: '{{name}} returned', name: itemName }) });
    } catch {
      showToast({ message: t('returnItem.failed', { defaultValue: 'Failed to return item' }) });
    } finally {
      setLoading(false);
    }
  }

  const canSubmit = mode === 'origin' || targetId != null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t('returnItem.title', { defaultValue: 'Return “{{name}}”', name: itemName })}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <RadioOption
            selected={mode === 'origin'}
            onClick={() => { setMode('origin'); setTargetId(null); }}
            label={binId
              ? t('returnItem.originalBin', { defaultValue: 'Original {{bin}}', bin: term.bin })
              : t('returnItem.originalPlace', { defaultValue: 'Original place' })}
            description={originBinName}
          />
          <RadioOption
            selected={mode === 'different'}
            onClick={() => setMode('different')}
            label={t('returnItem.differentBin', { defaultValue: 'Different {{bin}}', bin: term.bin })}
          />
        </div>

        {mode === 'different' && (
          <div className="mt-3 animate-fade-in">
            <BinPickerList
              excludeBinId={binId ?? undefined}
              selectedBinId={targetId}
              onSelect={setTargetId}
              search={search}
              onSearchChange={setSearch}
              paused={!open}
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => handleOpenChange(false)}>
            {t('common:actions.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button onClick={handleReturn} disabled={loading || !canSubmit}>
            {loading
              ? t('return.submitting', { defaultValue: 'Returning…' })
              : t('return.submit', { defaultValue: 'Return' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
