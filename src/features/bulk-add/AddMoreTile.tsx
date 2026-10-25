import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { BinSizes } from './photoGridTypes';

interface AddMoreTileProps {
  sizes: BinSizes;
  onClick: () => void;
}

export function AddMoreTile({ sizes, onClick }: AddMoreTileProps) {
  const { t } = useTranslation('bulkAdd');
  return (
    <div className="flex flex-col items-center">
      <button
        type="button"
        onClick={onClick}
        aria-label={t('grid.addMorePhotos', { defaultValue: 'Add more photos' })}
        className="flex flex-col items-center justify-center gap-1 rounded-[6px] border-2 border-dashed border-[var(--border-flat)] text-[var(--text-tertiary)] transition-colors hover:border-[var(--accent)] hover:bg-[var(--bg-input)] hover:text-[var(--accent)]"
        style={{ width: sizes.binSize, height: sizes.binSize }}
      >
        <Plus className="h-5 w-5" />
        <span className="text-[11px] leading-tight">{t('grid.add', { defaultValue: 'Add' })}</span>
      </button>
    </div>
  );
}
