import { Package } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getMatchPath, type LooseItemQueryMatch } from './useInventoryQuery';

interface LooseItemRowProps {
  match: LooseItemQueryMatch;
}

/**
 * Read-only row for an item that lives in an area (or nowhere) rather than in
 * a box. Not selectable and has no actions: the checkout/remove/move actions
 * are box-item based and cannot address a loose item yet.
 */
export function LooseItemRow({ match }: LooseItemRowProps) {
  const { t } = useTranslation('ai');
  const path = getMatchPath(match);
  return (
    <div className="flex items-center gap-3 px-3 py-2.5" data-testid="loose-item-row">
      <Package className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden="true" />
      <span className="flex-1 min-w-0">
        <span className="block text-[15px] font-semibold text-[var(--text-primary)] truncate">
          {match.name}
          {match.quantity != null && (
            <span className="ml-1.5 text-[13px] font-normal text-[var(--text-tertiary)]">
              {`×${match.quantity}`}
            </span>
          )}
        </span>
        <span className="block text-[12px] text-[var(--text-tertiary)] mt-0.5">
          {path || t('itemQuery.unassigned', { defaultValue: 'Unassigned' })}
        </span>
      </span>
    </div>
  );
}
