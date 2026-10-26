import { Check, ChevronDown } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BinPickerList } from '@/components/ui/bin-picker-list';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useTerminology } from '@/lib/terminology';
import { cn, focusRing } from '@/lib/utils';
import type { Bin } from '@/types';
import { useBinList } from './useBins';

interface ParentBinPickerProps {
  /** Id of the bin this one is inside, or null for a top-level bin. */
  value: string | null;
  onChange: (parentBinId: string | null) => void;
  /** The bin being edited (never offered as its own parent). Omit when creating. */
  binId?: string;
  /** The bin contains other bins, so it can't be placed inside one (a child can't have children). */
  hasChildren?: boolean;
  disabled?: boolean;
  id?: string;
}

/**
 * Field for choosing which bin a bin sits inside. Only top-level bins are offered: bins nest one
 * level deep. The server enforces the same rule; this keeps invalid choices out of the UI.
 */
export function ParentBinPicker({ value, onChange, binId, hasChildren, disabled, id }: ParentBinPickerProps) {
  const { t } = useTranslation(['bins', 'common']);
  const term = useTerminology();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { bins } = useBinList(undefined, 'name', undefined, !value && !open);

  const selected = value ? bins.find((b) => b.id === value) : undefined;
  const isDisabled = disabled || hasChildren;
  const candidates = useCallback((b: Bin) => !b.parent_bin_id && b.id !== binId, [binId]);

  const noneLabel = t('parentPicker.none', { defaultValue: 'Not inside another {{bin}}', bin: term.bin });

  function handleOpenChange(next: boolean) {
    if (!next) setSearch('');
    setOpen(next);
  }

  function choose(parentId: string | null) {
    onChange(parentId);
    handleOpenChange(false);
  }

  return (
    <div className="space-y-1.5">
      <button
        id={id}
        type="button"
        disabled={isDisabled}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className={cn(
          'row-spread w-full h-11 rounded-[var(--radius-sm)] border border-[var(--border-flat)] bg-[var(--bg-input)] px-3.5 text-[15px] text-left transition-colors',
          focusRing,
          'disabled:cursor-not-allowed disabled:opacity-60',
          !value && 'text-[var(--text-tertiary)]',
        )}
      >
        <span className="truncate">{value ? (selected?.name ?? '…') : noneLabel}</span>
        <ChevronDown className="h-4 w-4 text-[var(--text-tertiary)] shrink-0" />
      </button>

      {hasChildren && (
        <p className="text-[11px] text-[var(--text-tertiary)]">
          {t('parentPicker.hasChildren', {
            defaultValue: "Can't be placed inside anything else because it contains other {{bins}}.",
            bins: term.bins,
          })}
        </p>
      )}

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('parentPicker.title', { defaultValue: 'Place inside another {{bin}}', bin: term.bin })}</DialogTitle>
            <DialogDescription>
              {t('parentPicker.description', {
                defaultValue: 'It follows the {{area}} and visibility of the one you choose.',
                area: term.area,
              })}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 py-2">
            <button
              type="button"
              aria-pressed={!value}
              onClick={() => choose(null)}
              className={cn(
                'w-full text-left px-3 py-2.5 rounded-[var(--radius-sm)] transition-colors duration-150 flex items-center gap-2 border text-[14px]',
                focusRing,
                !value ? 'bg-[var(--accent)]/10 border-[var(--accent)]' : 'border-transparent hover:bg-[var(--bg-hover)]',
              )}
            >
              <span className="flex-1 truncate">{noneLabel}</span>
              {!value && <Check className="h-4 w-4 shrink-0 text-[var(--accent)]" />}
            </button>
            <BinPickerList
              selectedBinId={value}
              onSelect={(parentId) => choose(parentId)}
              search={search}
              onSearchChange={setSearch}
              paused={!open}
              filter={candidates}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
