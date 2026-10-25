import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Label } from '@/components/ui/label';
import { BulkUpdateDialog } from '@/lib/bulk/BulkUpdateDialog';
import { getSecondaryColorInfo, setSecondaryColor } from '@/lib/cardStyle';
import { ColorPicker } from './ColorPicker';
import { IconPicker } from './IconPicker';
import { StylePicker } from './StylePicker';
import { updateBin } from './useBins';
import { useSelectedBinsLabel } from './useSelectedBinsLabel';

interface BulkAppearanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  binIds: string[];
  onDone: () => void;
}

export function BulkAppearanceDialog({ open, onOpenChange, binIds, onDone }: BulkAppearanceDialogProps) {
  const { t } = useTranslation('bins');
  const selectedLabel = useSelectedBinsLabel(binIds.length);
  const [icon, setIcon] = useState('');
  const [color, setColor] = useState('');
  const [cardStyle, setCardStyle] = useState('');
  const [iconDirty, setIconDirty] = useState(false);
  const [colorDirty, setColorDirty] = useState(false);
  const [styleDirty, setStyleDirty] = useState(false);

  const anyDirty = iconDirty || colorDirty || styleDirty;

  useEffect(() => {
    if (!open) {
      setIcon('');
      setColor('');
      setCardStyle('');
      setIconDirty(false);
      setColorDirty(false);
      setStyleDirty(false);
    }
  }, [open]);

  async function apply(ids: string[]) {
    const changes: Record<string, string> = {};
    if (iconDirty) changes.icon = icon;
    if (colorDirty) changes.color = color;
    if (styleDirty) changes.cardStyle = cardStyle;
    await Promise.all(ids.map((id) => updateBin(id, changes)));
  }

  const sec = getSecondaryColorInfo(cardStyle);

  return (
    <BulkUpdateDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('bulk.appearance.title', { defaultValue: 'Appearance' })}
      description={t('bulk.appearance.description', {
        defaultValue: 'Customize {{selected}}. Only modified sections will be applied.',
        selected: selectedLabel,
      })}
      selectedIds={binIds}
      onApply={apply}
      onApplied={onDone}
      applyDisabled={!anyDirty}
    >
      <div className="space-y-5">
        <div className="space-y-2">
          <Label className="row-tight">
            {t('bulk.appearance.icon', { defaultValue: 'Icon' })}
            {iconDirty && <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />}
          </Label>
          <IconPicker value={icon} onChange={(v) => { setIcon(v); setIconDirty(true); }} />
        </div>
        <div className="space-y-2">
          <Label className="row-tight">
            {t('bulk.appearance.color', { defaultValue: 'Color' })}
            {colorDirty && <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />}
          </Label>
          <ColorPicker
            value={color}
            onChange={(v) => { setColor(v); setColorDirty(true); }}
            secondaryLabel={sec?.label}
            secondaryValue={sec?.value}
            onSecondaryChange={sec ? (c) => {
              setCardStyle(setSecondaryColor(cardStyle, c));
              setColorDirty(true);
              setStyleDirty(true);
            } : undefined}
          />
        </div>
        <div className="space-y-2">
          <Label className="row-tight">
            {t('bulk.appearance.style', { defaultValue: 'Style' })}
            {styleDirty && <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />}
          </Label>
          <StylePicker value={cardStyle} color={color} onChange={(v) => { setCardStyle(v); setStyleDirty(true); }} photos={[]} />
        </div>
      </div>
    </BulkUpdateDialog>
  );
}
