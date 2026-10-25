import type { TFunction } from 'i18next';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioOption } from '@/components/ui/radio-option';
import { BulkUpdateDialog } from '@/lib/bulk/BulkUpdateDialog';
import type { QuantityOp } from './useItemBulkActions';

const OPTIONS: Array<{ value: QuantityOp; needsValue: boolean }> = [
  { value: 'set', needsValue: true },
  { value: 'inc', needsValue: true },
  { value: 'dec', needsValue: true },
  { value: 'clear', needsValue: false },
];

function opLabel(op: QuantityOp, t: TFunction<'items'>): string {
  switch (op) {
    case 'set': return t('bulkQuantity.ops.set.label', { defaultValue: 'Set to' });
    case 'inc': return t('bulkQuantity.ops.inc.label', { defaultValue: 'Increment by' });
    case 'dec': return t('bulkQuantity.ops.dec.label', { defaultValue: 'Decrement by' });
    case 'clear': return t('bulkQuantity.ops.clear.label', { defaultValue: 'Clear quantity' });
  }
}

function opDescription(op: QuantityOp, t: TFunction<'items'>): string {
  switch (op) {
    case 'set': return t('bulkQuantity.ops.set.description', { defaultValue: 'Sets the quantity on every selected item.' });
    case 'inc': return t('bulkQuantity.ops.inc.description', { defaultValue: 'Adds to the existing quantity on every selected item.' });
    case 'dec': return t('bulkQuantity.ops.dec.description', { defaultValue: 'Subtracts from the existing quantity. Items reaching zero will have their quantity cleared.' });
    case 'clear': return t('bulkQuantity.ops.clear.description', { defaultValue: 'Removes the quantity from every selected item.' });
  }
}

interface BulkQuantityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedIds: string[];
  onApply: (ids: string[], op: QuantityOp, value?: number) => Promise<void>;
}

export function BulkQuantityDialog({ open, onOpenChange, selectedIds, onApply }: BulkQuantityDialogProps) {
  const { t } = useTranslation('items');
  const [op, setOp] = useState<QuantityOp>('set');
  const [value, setValue] = useState('1');
  const needsValue = OPTIONS.find((o) => o.value === op)?.needsValue ?? true;
  const numValue = Number.parseInt(value, 10);
  const valueValid = !needsValue || (Number.isFinite(numValue) && numValue >= 0);

  return (
    <BulkUpdateDialog
      open={open}
      onOpenChange={(v) => {
        if (!v) { setOp('set'); setValue('1'); }
        onOpenChange(v);
      }}
      title={t('bulkQuantity.title', {
        count: selectedIds.length,
        defaultValue_one: 'Update quantity for {{count}} item',
        defaultValue_other: 'Update quantity for {{count}} items',
      })}
      description={opDescription(op, t)}
      selectedIds={selectedIds}
      onApply={async (ids) => onApply(ids, op, needsValue ? numValue : undefined)}
      applyDisabled={!valueValid}
      applyLabel={t('bulkQuantity.submit', { defaultValue: 'Apply' })}
      loadingLabel={t('bulkQuantity.submitting', { defaultValue: 'Applying…' })}
    >
      <div className="flex flex-col gap-2">
        {OPTIONS.map((o) => (
          <RadioOption
            key={o.value}
            selected={op === o.value}
            onClick={() => setOp(o.value)}
            label={opLabel(o.value, t)}
          />
        ))}
      </div>

      {needsValue && (
        <div className="flex flex-col gap-1.5 mt-3 animate-fade-in">
          <Label htmlFor="bulk-qty-input">
            {op === 'set'
              ? t('bulkQuantity.newQuantity', { defaultValue: 'New quantity' })
              : t('bulkQuantity.amount', { defaultValue: 'Amount' })}
          </Label>
          <Input
            id="bulk-qty-input"
            type="number"
            min={0}
            step={1}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
        </div>
      )}
    </BulkUpdateDialog>
  );
}
