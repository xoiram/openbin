import { Grid3x3, LayoutGrid, Table2 } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { OptionGroup, type OptionGroupOption } from '@/components/ui/option-group';
import type { ViewMode } from './useViewMode';

export function ViewModeToggle({ value, onChange }: { value: ViewMode; onChange: (v: ViewMode) => void }) {
  const { t } = useTranslation('bins');
  const options = useMemo<OptionGroupOption<ViewMode>[]>(
    () => [
      { key: 'grid', label: t('viewMode.grid', { defaultValue: 'Grid' }), icon: LayoutGrid },
      { key: 'compact', label: t('viewMode.compact', { defaultValue: 'Compact' }), icon: Grid3x3 },
      { key: 'table', label: t('viewMode.table', { defaultValue: 'Table' }), icon: Table2 },
    ],
    [t],
  );
  return (
    <OptionGroup
      options={options}
      value={value}
      onChange={onChange}
      iconOnly
      size="sm"
    />
  );
}
