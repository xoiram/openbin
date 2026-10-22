import { PackageMinus, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { plural } from '@/lib/utils';

interface ItemSelectionBarProps {
  selectionCount: number;
  onCheckout: () => void;
  onRemove: () => void;
  onClear: () => void;
  isBusy?: boolean;
}

export function ItemSelectionBar({
  selectionCount,
  onCheckout,
  onRemove,
  onClear,
  isBusy,
}: ItemSelectionBarProps) {
  const { t } = useTranslation('ai');
  if (selectionCount === 0) return null;
  return (
    <section
      aria-label={t('itemQuery.bulkActionsAriaLabel', { defaultValue: 'Bulk actions' })}
      aria-live="polite"
      className="flat-heavy sticky bottom-2 mt-3 px-3 py-2.5 flex items-center gap-2 rounded-[var(--radius-md)]"
    >
      <button
        type="button"
        onClick={onClear}
        aria-label={t('itemQuery.clearSelectionAriaLabel', { defaultValue: 'Clear selection' })}
        className="shrink-0 inline-flex items-center justify-center h-8 w-8 -ml-1 rounded-[var(--radius-xs)] text-[var(--text-tertiary)] hover:bg-[var(--bg-active)] hover:text-[var(--text-primary)] transition-colors"
      >
        <X className="h-4 w-4" />
      </button>
      <span className="text-[13px] font-medium text-[var(--text-primary)]">
        {selectionCount}{' '}
        {plural(
          selectionCount,
          t('itemQuery.item', { defaultValue: 'item' }),
          t('itemQuery.items', { defaultValue: 'items' }),
        )}{' '}
        {t('itemQuery.selectedSuffix', { defaultValue: 'selected' })}
      </span>
      <span className="flex-1" />
      <Button size="sm" variant="secondary" onClick={onCheckout} disabled={isBusy}>
        <PackageMinus className="h-4 w-4 mr-1" /> {t('itemQuery.checkout', { defaultValue: 'Checkout' })}
      </Button>
      <Button size="sm" variant="destructive" onClick={onRemove} disabled={isBusy}>
        <Trash2 className="h-4 w-4 mr-1" /> {t('itemQuery.remove', { defaultValue: 'Remove' })}
      </Button>
    </section>
  );
}
