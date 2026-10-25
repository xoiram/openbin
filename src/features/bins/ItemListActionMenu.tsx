import { PackageMinus, Trash2, Undo2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ActionMenu, MenuDivider, MenuItem } from '@/components/ui/action-menu';

interface ItemListActionMenuProps {
  onCheckout?: () => void;
  onReturn?: () => void;
  onDelete: () => void;
}

export function ItemListActionMenu({ onCheckout, onReturn, onDelete }: ItemListActionMenuProps) {
  const { t } = useTranslation(['bins', 'common']);
  return (
    <ActionMenu
      triggerAriaLabel={t('itemActions.menuLabel', { defaultValue: 'Item actions' })}
      triggerClassName="shrink-0 flex items-center justify-center size-11 text-[var(--text-tertiary)] transition-opacity opacity-30 lg:opacity-0 lg:group-hover:opacity-100 aria-expanded:opacity-100"
      menuClassName="min-w-[160px]"
    >
      {onCheckout && <MenuItem icon={PackageMinus} label={t('itemActions.checkOut', { defaultValue: 'Check out' })} onClick={onCheckout} />}
      {onReturn && <MenuItem icon={Undo2} label={t('itemActions.return', { defaultValue: 'Return' })} onClick={onReturn} />}
      {(onCheckout || onReturn) && <MenuDivider />}
      <MenuItem icon={Trash2} label={t('common:actions.delete', { defaultValue: 'Delete' })} onClick={onDelete} destructive />
    </ActionMenu>
  );
}
