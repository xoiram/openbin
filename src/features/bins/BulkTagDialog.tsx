import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Label } from '@/components/ui/label';
import { apiFetch } from '@/lib/api';
import { BulkUpdateDialog } from '@/lib/bulk/BulkUpdateDialog';
import { TagInput } from './TagInput';
import { notifyBinsChanged } from './useBins';
import { useSelectedBinsLabel } from './useSelectedBinsLabel';

interface BulkTagDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  binIds: string[];
  onDone: () => void;
  allTags: string[];
}

export function BulkTagDialog({ open, onOpenChange, binIds, onDone, allTags }: BulkTagDialogProps) {
  const { t } = useTranslation('bins');
  const selectedLabel = useSelectedBinsLabel(binIds.length);
  const [tags, setTags] = useState<string[]>([]);

  async function apply(ids: string[]) {
    if (tags.length === 0) return;
    await Promise.all(
      ids.map((id) =>
        apiFetch(`/api/bins/${id}/add-tags`, {
          method: 'PUT',
          body: { tags },
        }).catch(() =>
          apiFetch<{ tags: string[] }>(`/api/bins/${id}`).then((bin) => {
            const merged = [...new Set([...bin.tags, ...tags])];
            return apiFetch(`/api/bins/${id}`, {
              method: 'PUT',
              body: { tags: merged },
            });
          }),
        ),
      ),
    );
    setTags([]);
    notifyBinsChanged();
  }

  return (
    <BulkUpdateDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('bulk.tag.title', { defaultValue: 'Add Tags' })}
      description={t('bulk.tag.description', { defaultValue: 'Add tags to {{selected}}.', selected: selectedLabel })}
      selectedIds={binIds}
      onApply={apply}
      onApplied={onDone}
      applyDisabled={tags.length === 0}
    >
      <div className="space-y-2">
        <Label>{t('bulk.tag.label', { defaultValue: 'Tags' })}</Label>
        <TagInput tags={tags} onChange={setTags} suggestions={allTags} />
      </div>
    </BulkUpdateDialog>
  );
}
