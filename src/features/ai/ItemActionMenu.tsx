import { ExternalLink, Hash, PackageMinus, Pencil, Trash2, Undo2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ActionMenu, MenuDivider, MenuItem } from '@/components/ui/action-menu';

interface ItemActionMenuProps {
  onOpenBin: () => void;
  onCheckout?: () => void;
  onAdjustQuantity?: () => void;
  onRename?: () => void;
  onRemove?: () => void;
  onRestoreBin?: () => void;
  canWrite: boolean;
  isTrashed: boolean;
}

export function ItemActionMenu({
  onOpenBin, onCheckout, onAdjustQuantity, onRename, onRemove, onRestoreBin,
  canWrite, isTrashed,
}: ItemActionMenuProps) {
  const { t } = useTranslation('ai');
  return (
    <ActionMenu
      triggerAriaLabel={t('itemQuery.actionsAriaLabel', { defaultValue: 'Item actions' })}
      triggerClassName="shrink-0 inline-flex items-center justify-center h-8 w-8 -mr-1 rounded-[var(--radius-xs)] text-[var(--text-tertiary)] hover:bg-[var(--bg-active)] hover:text-[var(--text-primary)] transition-colors"
      menuClassName="min-w-[180px]"
    >
      {isTrashed ? (
        <MenuItem
          icon={Undo2}
          label={t('itemQuery.restoreAndOpen', { defaultValue: 'Restore & open' })}
          onClick={onRestoreBin ?? onOpenBin}
        />
      ) : (
        <>
          <MenuItem icon={ExternalLink} label={t('itemQuery.openBin', { defaultValue: 'Open bin' })} onClick={onOpenBin} />
          {canWrite && (
            <>
              <MenuDivider />
              <MenuItem icon={PackageMinus} label={t('itemQuery.checkout', { defaultValue: 'Checkout' })} onClick={onCheckout} />
              <MenuItem icon={Hash} label={t('itemQuery.adjustQuantity', { defaultValue: 'Adjust quantity' })} onClick={onAdjustQuantity} />
              <MenuItem icon={Pencil} label={t('itemQuery.rename', { defaultValue: 'Rename' })} onClick={onRename} />
              <MenuDivider />
              <MenuItem icon={Trash2} label={t('itemQuery.remove', { defaultValue: 'Remove' })} onClick={onRemove} destructive />
            </>
          )}
        </>
      )}
    </ActionMenu>
  );
}
