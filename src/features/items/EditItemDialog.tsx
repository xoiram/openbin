import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import type { ItemEntry } from './useItems';

interface EditItemDialogProps {
  entry: ItemEntry | null;
  onOpenChange: (open: boolean) => void;
  /** Resolves true when saved (the dialog then closes). */
  onSave: (entry: ItemEntry, name: string, quantity: number | null) => Promise<boolean>;
}

export function EditItemDialog({ entry, onOpenChange, onSave }: EditItemDialogProps) {
  const { t } = useTranslation('items');
  return (
    <Dialog open={entry !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('looseItems.edit.title', { defaultValue: 'Edit item' })}</DialogTitle>
        </DialogHeader>
        {entry && <EditItemForm key={entry.id} entry={entry} onClose={() => onOpenChange(false)} onSave={onSave} />}
      </DialogContent>
    </Dialog>
  );
}

function EditItemForm({ entry, onClose, onSave }: { entry: ItemEntry; onClose: () => void; onSave: EditItemDialogProps['onSave'] }) {
  const { t } = useTranslation(['items', 'common']);
  const [name, setName] = useState(entry.name);
  const [quantity, setQuantity] = useState(entry.quantity != null ? String(entry.quantity) : '');
  const [saving, setSaving] = useState(false);
  const trimmed = name.trim();
  const qty = quantity.trim() === '' ? null : Number(quantity);
  const qtyInvalid = qty !== null && !(Number.isInteger(qty) && qty > 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!trimmed || qtyInvalid) return;
    setSaving(true);
    try {
      if (await onSave(entry, trimmed, qty)) onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <FormField label={t('looseItems.add.name', { defaultValue: 'Name' })} htmlFor="edit-item-name">
        <Input id="edit-item-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </FormField>
      <FormField
        label={t('looseItems.edit.quantity', { defaultValue: 'Quantity' })}
        htmlFor="edit-item-qty"
        error={qtyInvalid ? t('looseItems.add.quantityInvalid', { defaultValue: 'Quantity must be a whole number above zero' }) : undefined}
      >
        <Input id="edit-item-qty" type="number" inputMode="numeric" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
      </FormField>
      <DialogFooter className="mt-3">
        <Button type="button" variant="ghost" onClick={onClose}>
          {t('common:actions.cancel', { defaultValue: 'Cancel' })}
        </Button>
        <Button type="submit" disabled={saving || !trimmed || qtyInvalid}>
          {t('looseItems.edit.save', { defaultValue: 'Save' })}
        </Button>
      </DialogFooter>
    </form>
  );
}
