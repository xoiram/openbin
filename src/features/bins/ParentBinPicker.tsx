import { Check, ChevronDown } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { BinPickerList } from '@/components/ui/bin-picker-list';
import { useDialogPortal } from '@/components/ui/dialog';
import { useTerminology } from '@/lib/terminology';
import { useAnchoredDropdown } from '@/lib/useAnchoredDropdown';
import { cn, focusRing } from '@/lib/utils';
import type { Bin } from '@/types';
import { useBin } from './useBins';

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
 *
 * The choices are a dropdown, not a dialog: this field is used inside dialogs (create, bulk move), and
 * every open Dialog listens for Escape on its own, so a nested dialog would close its parent too. The
 * panel is portalled to the surrounding dialog's portal node (or the body), and Escape only closes it.
 */
export function ParentBinPicker({ value, onChange, binId, hasChildren, disabled, id }: ParentBinPickerProps) {
  const { t } = useTranslation(['bins', 'common']);
  const term = useTerminology();
  const dialogPortal = useDialogPortal();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { bin: selected } = useBin(value ?? undefined);

  const isDisabled = disabled || hasChildren;
  const candidates = useCallback((b: Bin) => !b.parent_bin_id && b.id !== binId, [binId]);
  const close = useCallback(() => setOpen(false), []);
  const { containerRef, menuRef, pos } = useAnchoredDropdown(open, close);

  const noneLabel = t('parentPicker.none', { defaultValue: 'Not inside another {{bin}}', bin: term.bin });

  useEffect(() => {
    if (!open) return;
    setSearch('');
    requestAnimationFrame(() => menuRef.current?.querySelector('input')?.focus());
  }, [open, menuRef]);

  function choose(parentId: string | null) {
    onChange(parentId);
    setOpen(false);
  }

  function handleMenuKeyDown(e: React.KeyboardEvent) {
    if (e.key !== 'Escape') return;
    // Close only this dropdown: an enclosing dialog listens for Escape on the document.
    e.stopPropagation();
    setOpen(false);
    containerRef.current?.querySelector('button')?.focus();
  }

  return (
    <div ref={containerRef} className="space-y-1.5">
      <button
        id={id}
        type="button"
        disabled={isDisabled}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          'row-spread w-full h-11 rounded-[var(--radius-sm)] border border-[var(--border-flat)] bg-[var(--bg-input)] px-3.5 text-[15px] text-left transition-colors',
          focusRing,
          'disabled:cursor-not-allowed disabled:opacity-60',
          !value && 'text-[var(--text-tertiary)]',
        )}
      >
        <span className="truncate">{value ? (selected?.name ?? '…') : noneLabel}</span>
        <ChevronDown className={cn('h-4 w-4 text-[var(--text-tertiary)] shrink-0 transition-transform', open && 'rotate-180')} />
      </button>

      {hasChildren && (
        <p className="text-[11px] text-[var(--text-tertiary)]">
          {t('parentPicker.hasChildren', {
            defaultValue: "Can't be placed inside anything else because it contains other {{bins}}.",
            bins: term.bins,
          })}
        </p>
      )}

      {open &&
        pos &&
        createPortal(
          // biome-ignore lint/a11y/noStaticElementInteractions: handles Escape for the dropdown; the controls inside are real buttons/inputs
          <div
            ref={menuRef}
            onKeyDown={handleMenuKeyDown}
            style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width }}
            className="z-[80] flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--border-flat)] bg-[var(--bg-elevated,var(--bg-input))] p-2 shadow-lg"
          >
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
              filter={candidates}
              topLevelOnly
            />
          </div>,
          dialogPortal ?? document.body,
        )}
    </div>
  );
}
