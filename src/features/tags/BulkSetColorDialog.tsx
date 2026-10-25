import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BulkUpdateDialog } from '@/lib/bulk/BulkUpdateDialog';
import { TagColorPicker } from './TagColorPicker';

interface BulkSetColorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedTagNames: string[];
  onApply: (tags: string[], color: string) => Promise<void>;
}

export function BulkSetColorDialog({ open, onOpenChange, selectedTagNames, onApply }: BulkSetColorDialogProps) {
  const { t } = useTranslation('tags');
  const [color, setColor] = useState<string>('');

  return (
    <BulkUpdateDialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setColor('');
        onOpenChange(v);
      }}
      title={t('bulkSetColor.title', {
        count: selectedTagNames.length,
        defaultValue_one: 'Set color for {{count}} tag',
        defaultValue_other: 'Set color for {{count}} tags',
      })}
      description={t('bulkSetColor.description', { defaultValue: 'Pick a color to apply to every selected tag.' })}
      selectedIds={selectedTagNames}
      onApply={(tags) => onApply(tags, color)}
      applyDisabled={!color}
      applyLabel={t('bulkSetColor.apply', { defaultValue: 'Apply color' })}
      loadingLabel={t('bulkSetColor.applying', { defaultValue: 'Applying…' })}
    >
      <TagColorPicker
        currentColor={color}
        onColorChange={setColor}
        tagName={t('bulkSetColor.tagCount', {
          count: selectedTagNames.length,
          defaultValue_one: '{{count}} tag',
          defaultValue_other: '{{count}} tags',
        })}
        inline
      />
    </BulkUpdateDialog>
  );
}
