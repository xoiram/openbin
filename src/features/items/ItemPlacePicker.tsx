import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BinPickerList } from '@/components/ui/bin-picker-list';
import { OptionGroup } from '@/components/ui/option-group';
import { AreaPicker } from '@/features/areas/AreaPicker';
import { useTerminology } from '@/lib/terminology';

/** Where an item goes: in a box, in an area, or nowhere in particular ("unassigned"). */
export type PlaceKind = 'bin' | 'area' | 'none';

interface ItemPlacePickerProps {
  locationId: string | undefined;
  kind: PlaceKind;
  onKindChange: (kind: PlaceKind) => void;
  binId: string | null;
  onBinChange: (binId: string) => void;
  areaId: string | null;
  onAreaChange: (areaId: string | null) => void;
  /** Hint shown for the "none" choice. */
  noneHint?: string;
}

/**
 * Three-way place chooser shared by the Add item and Move dialogs. It renders inline (the box list is
 * server-searched, the area picker is a dropdown portalled into the enclosing dialog), so it opens no
 * dialog of its own.
 */
export function ItemPlacePicker({
  locationId,
  kind,
  onKindChange,
  binId,
  onBinChange,
  areaId,
  onAreaChange,
  noneHint,
}: ItemPlacePickerProps) {
  const { t } = useTranslation('items');
  const term = useTerminology();
  const [binSearch, setBinSearch] = useState('');

  return (
    <div className="flex flex-col gap-3">
      <OptionGroup<PlaceKind>
        aria-label={t('looseItems.place.label', { defaultValue: 'Where it goes' })}
        size="sm"
        value={kind}
        onChange={onKindChange}
        options={[
          { key: 'bin', label: t('looseItems.place.bin', { defaultValue: 'In a {{bin}}', bin: term.bin }) },
          { key: 'area', label: t('looseItems.place.area', { defaultValue: 'In an {{area}}', area: term.area }) },
          { key: 'none', label: t('looseItems.place.none', { defaultValue: 'Not placed' }) },
        ]}
      />
      {kind === 'bin' && (
        <BinPickerList
          selectedBinId={binId}
          onSelect={onBinChange}
          search={binSearch}
          onSearchChange={setBinSearch}
        />
      )}
      {kind === 'area' && <AreaPicker locationId={locationId} value={areaId} onChange={onAreaChange} />}
      {kind === 'none' && noneHint && (
        <p className="text-[13px] text-[var(--text-tertiary)]">{noneHint}</p>
      )}
    </div>
  );
}
