import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { useAreaList } from '@/features/areas/useAreas';
import { addItemsToBin, useBin } from '@/features/bins/useBins';
import { useAuth } from '@/lib/auth';
import { useTerminology } from '@/lib/terminology';
import { getErrorMessage } from '@/lib/utils';
import { ItemPlacePicker, type PlaceKind } from './ItemPlacePicker';
import { createLooseItem } from './looseItems';

interface AddItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Open with "In an area" selected and this area chosen (deep link `?add=1&area_id=`). */
  initialAreaId?: string | null;
}

export function AddItemDialog({ open, onOpenChange, initialAreaId }: AddItemDialogProps) {
  const { t } = useTranslation('items');
  const term = useTerminology();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('looseItems.add.title', { defaultValue: 'Add item' })}</DialogTitle>
          <DialogDescription>
            {t('looseItems.add.description', {
              defaultValue: 'Put the item in a {{bin}} or in an {{area}}, or leave it unplaced.',
              bin: term.bin,
              area: term.area,
            })}
          </DialogDescription>
        </DialogHeader>
        {/* DialogContent unmounts its children when closed, so the form starts fresh on every open. */}
        <AddItemForm onClose={() => onOpenChange(false)} initialAreaId={initialAreaId ?? null} />
      </DialogContent>
    </Dialog>
  );
}

function AddItemForm({ onClose, initialAreaId }: { onClose: () => void; initialAreaId: string | null }) {
  const { t } = useTranslation(['items', 'common']);
  const term = useTerminology();
  const { activeLocationId } = useAuth();
  const { showToast } = useToast();
  const { areas } = useAreaList(activeLocationId);
  const nameRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [kind, setKind] = useState<PlaceKind>(initialAreaId ? 'area' : 'bin');
  const [binId, setBinId] = useState<string | null>(null);
  const [areaId, setAreaId] = useState<string | null>(initialAreaId);
  const [addAnother, setAddAnother] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const { bin } = useBin(kind === 'bin' ? (binId ?? undefined) : undefined);

  const trimmedName = name.trim();
  const qty = quantity.trim() === '' ? undefined : Number(quantity);
  const qtyInvalid = qty !== undefined && !(Number.isInteger(qty) && qty > 0);
  const placeMissing = (kind === 'bin' && !binId) || (kind === 'area' && !areaId);
  const nameError = submitted && !trimmedName
    ? t('looseItems.add.nameRequired', { defaultValue: 'Enter a name' })
    : undefined;
  const qtyError = qtyInvalid
    ? t('looseItems.add.quantityInvalid', { defaultValue: 'Quantity must be a whole number above zero' })
    : undefined;

  function placeName(): string | null {
    if (kind === 'bin') return (bin && bin.id === binId ? bin.name : '') || term.bin;
    if (kind === 'area') return areas.find((a) => a.id === areaId)?.name ?? term.area;
    return null;
  }

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    setSubmitted(true);
    if (!trimmedName || qtyInvalid || placeMissing || !activeLocationId) return;
    setSaving(true);
    try {
      if (kind === 'bin' && binId) {
        await addItemsToBin(binId, [{ name: trimmedName, quantity: qty ?? null }]);
      } else {
        await createLooseItem(activeLocationId, { name: trimmedName, quantity: qty, areaId: kind === 'area' ? areaId : null });
      }
      const place = placeName();
      showToast({
        message: place
          ? t('looseItems.add.addedTo', { defaultValue: 'Added {{name}} to {{place}}', name: trimmedName, place })
          : t('looseItems.add.added', { defaultValue: 'Added {{name}}', name: trimmedName }),
        variant: 'success',
      });
      if (addAnother) {
        setName('');
        setQuantity('');
        setSubmitted(false);
        nameRef.current?.focus();
      } else {
        onClose();
      }
    } catch (err) {
      showToast({
        message: getErrorMessage(err, t('actions.requestFailed', { defaultValue: 'Request failed' })),
        variant: 'error',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <FormField label={t('looseItems.add.name', { defaultValue: 'Name' })} htmlFor="add-item-name" error={nameError}>
        <Input
          id="add-item-name"
          ref={nameRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('looseItems.add.namePlaceholder', { defaultValue: 'Item name' })}
          autoFocus
        />
      </FormField>
      <FormField label={t('looseItems.add.quantity', { defaultValue: 'Quantity (optional)' })} htmlFor="add-item-qty" error={qtyError}>
        <Input
          id="add-item-qty"
          type="number"
          inputMode="numeric"
          min={1}
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
        />
      </FormField>
      <ItemPlacePicker
        locationId={activeLocationId ?? undefined}
        kind={kind}
        onKindChange={setKind}
        binId={binId}
        onBinChange={setBinId}
        areaId={areaId}
        onAreaChange={setAreaId}
        noneHint={t('looseItems.add.noneHint', {
          defaultValue: 'The item stays unassigned until you move it.',
        })}
      />
      <div className="flex items-center gap-2">
        <Checkbox id="add-item-another" checked={addAnother} onCheckedChange={setAddAnother} />
        <label htmlFor="add-item-another" className="text-[13px] text-[var(--text-secondary)]">
          {t('looseItems.add.addAnother', { defaultValue: 'Add another' })}
        </label>
      </div>
      <DialogFooter className="mt-3">
        <Button type="button" variant="ghost" onClick={onClose}>
          {t('common:actions.cancel', { defaultValue: 'Cancel' })}
        </Button>
        <Button type="submit" disabled={saving || qtyInvalid || placeMissing}>
          {saving
            ? t('looseItems.add.submitting', { defaultValue: 'Adding…' })
            : t('looseItems.add.submit', { defaultValue: 'Add item' })}
        </Button>
      </DialogFooter>
    </form>
  );
}
