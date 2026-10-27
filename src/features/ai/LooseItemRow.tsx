import { Package } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/lib/auth';
import { ItemRow } from './ItemRow';
import { getMatchPath, type LooseItemQueryMatch } from './useInventoryQuery';

interface LooseItemRowProps {
  match: LooseItemQueryMatch;
  canWrite?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  /** External removal signal (e.g. from bulk remove). Hides the row. */
  externallyRemoved?: boolean;
}

/**
 * Row for an item that lives in an area (or nowhere) rather than in a box. It behaves like a box item row
 * (rename, quantity, remove, check out, selection) through the location-scoped item routes; it has no box
 * to open, so the location text shows the area path instead.
 */
export function LooseItemRow({ match, canWrite = false, selected, onToggleSelect, externallyRemoved }: LooseItemRowProps) {
  const { t } = useTranslation('ai');
  const { activeLocationId } = useAuth();
  const path = getMatchPath(match);
  return (
    <ItemRow
      item={{ id: match.item_id, name: match.name, quantity: match.quantity }}
      binId={null}
      locationId={activeLocationId ?? undefined}
      locationText={path || t('itemQuery.unassigned', { defaultValue: 'Unassigned' })}
      leading={<Package className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden="true" />}
      testId="loose-item-row"
      canWrite={canWrite}
      selected={selected}
      onToggleSelect={onToggleSelect}
      externallyRemoved={externallyRemoved}
    />
  );
}
