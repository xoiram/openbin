import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BulkUpdateDialog } from '@/lib/bulk/BulkUpdateDialog';
import { useTerminology } from '@/lib/terminology';
import { cn, inputBase } from '@/lib/utils';
import type { TagEntry } from './useTags';

interface BulkMergeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedTagNames: string[];
  allTags: TagEntry[];
  binsAffected: number;
  onApply: (fromTags: string[], toTag: string) => Promise<void>;
}

export function BulkMergeDialog({
  open,
  onOpenChange,
  selectedTagNames,
  allTags,
  binsAffected,
  onApply,
}: BulkMergeDialogProps) {
  const { t } = useTranslation('tags');
  const term = useTerminology();
  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [existingTarget, setExistingTarget] = useState('');
  const [newTarget, setNewTarget] = useState('');

  const candidates = useMemo(
    () => allTags.map((entry) => entry.tag),
    [allTags],
  );

  const target = mode === 'existing' ? existingTarget : newTarget.trim().toLowerCase();
  const targetValid =
    target.length > 0 &&
    /^[a-z0-9][a-z0-9-]{0,99}$/.test(target) &&
    selectedTagNames.some((tag) => tag !== target);

  return (
    <BulkUpdateDialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          setMode('existing');
          setExistingTarget('');
          setNewTarget('');
        }
        onOpenChange(v);
      }}
      title={t('bulkMerge.title', {
        count: selectedTagNames.length,
        defaultValue_one: 'Merge {{count}} tag',
        defaultValue_other: 'Merge {{count}} tags',
      })}
      description={t('bulkMerge.description', {
        count: binsAffected,
        defaultValue_one: 'Merge into a single canonical tag across ~{{count}} {{bin}}. The originals will be deleted.',
        defaultValue_other: 'Merge into a single canonical tag across ~{{count}} {{bins}}. The originals will be deleted.',
        bin: term.bin,
        bins: term.bins,
      })}
      selectedIds={selectedTagNames}
      onApply={(tags) => onApply(tags, target)}
      applyDisabled={!targetValid}
      applyLabel={t('bulkMerge.apply', { defaultValue: 'Merge' })}
      loadingLabel={t('bulkMerge.applying', { defaultValue: 'Merging…' })}
    >
      <div className="flex flex-col gap-3">
        <div className="flex gap-1">
          <button
            type="button"
            className={cn(
              'flex-1 px-3 py-2 rounded-[var(--radius-sm)] text-[13px]',
              mode === 'existing'
                ? 'bg-[var(--accent)] text-white'
                : 'bg-[var(--bg-hover)] text-[var(--text-primary)]',
            )}
            onClick={() => setMode('existing')}
          >
            {t('bulkMerge.useExisting', { defaultValue: 'Use existing' })}
          </button>
          <button
            type="button"
            className={cn(
              'flex-1 px-3 py-2 rounded-[var(--radius-sm)] text-[13px]',
              mode === 'new'
                ? 'bg-[var(--accent)] text-white'
                : 'bg-[var(--bg-hover)] text-[var(--text-primary)]',
            )}
            onClick={() => setMode('new')}
          >
            {t('bulkMerge.createNew', { defaultValue: 'Create new' })}
          </button>
        </div>
        {mode === 'existing' ? (
          <div className="space-y-1">
            <Label htmlFor="bulk-merge-existing">{t('bulkMerge.mergeInto', { defaultValue: 'Merge into' })}</Label>
            <select
              id="bulk-merge-existing"
              value={existingTarget}
              onChange={(e) => setExistingTarget(e.target.value)}
              className={cn(inputBase, 'h-10')}
            >
              <option value="">{t('bulkMerge.selectTag', { defaultValue: 'Select a tag…' })}</option>
              {candidates.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="space-y-1">
            <Label htmlFor="bulk-merge-new">{t('bulkMerge.newTagName', { defaultValue: 'New tag name' })}</Label>
            <Input
              id="bulk-merge-new"
              value={newTarget}
              onChange={(e) => setNewTarget(e.target.value)}
              placeholder={t('bulkMerge.newTagPlaceholder', { defaultValue: 'electronics' })}
              maxLength={100}
            />
          </div>
        )}
      </div>
    </BulkUpdateDialog>
  );
}
