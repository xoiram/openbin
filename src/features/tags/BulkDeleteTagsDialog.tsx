import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useTerminology } from '@/lib/terminology';
import type { TagEntry } from './useTags';

interface BulkDeleteTagsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tags: string[];
  binsAffected: number;
  onConfirm: () => Promise<void>;
}

export function BulkDeleteTagsDialog({ open, onOpenChange, tags, binsAffected, onConfirm }: BulkDeleteTagsDialogProps) {
  const { t } = useTranslation(['tags', 'common']);
  const term = useTerminology();
  const [loading, setLoading] = useState(false);
  async function handle() {
    setLoading(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  }
  const quoted = tags.slice(0, 5).map((tag) => `"${tag}"`).join(', ');
  const preview =
    tags.length > 5
      ? t('bulkDelete.previewMore', { defaultValue: '{{tags}}, +{{count}} more', tags: quoted, count: tags.length - 5 })
      : quoted;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t('bulkDelete.title', {
              count: tags.length,
              defaultValue_one: 'Delete {{count}} tag?',
              defaultValue_other: 'Delete {{count}} tags?',
            })}
          </DialogTitle>
          <DialogDescription>
            {t('bulkDelete.description', {
              count: binsAffected,
              defaultValue_one: 'Removes {{tags}} from this {{location}}. ~{{count}} {{bin}} will be updated. Children become top-level.',
              defaultValue_other: 'Removes {{tags}} from this {{location}}. ~{{count}} {{bins}} will be updated. Children become top-level.',
              tags: preview,
              location: term.location,
              bin: term.bin,
              bins: term.bins,
            })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
            {t('common:actions.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button variant="destructive" onClick={handle} disabled={loading}>
            {loading ? t('bulkDelete.deleting', { defaultValue: 'Deleting…' }) : t('common:actions.delete', { defaultValue: 'Delete' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Caller passes the tag list — sums their bin counts to a single number for the dialog copy. */
export function sumBinCounts(allTags: TagEntry[], selectedTagNames: string[]): number {
  const sel = new Set(selectedTagNames);
  return allTags.reduce((sum, t) => (sel.has(t.tag) ? sum + t.count : sum), 0);
}
