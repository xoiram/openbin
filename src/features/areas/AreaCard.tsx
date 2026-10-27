import { Check, ChevronRight, Folder, Inbox, MoreHorizontal, Plus, X } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip } from '@/components/ui/tooltip';
import { useTerminology } from '@/lib/terminology';
import { usePopover } from '@/lib/usePopover';
import { cn } from '@/lib/utils';
import { AreaActionMenu } from './AreaActionMenu';
import { useInlineEdit } from './useInlineEdit';

interface AreaCardProps {
  id: string;
  name: string;
  binCount: number;
  descendantBinCount: number;
  /** Every item the area holds (loose + in its boxes). */
  itemCount: number;
  /** itemCount summed over the area and its sub-areas. */
  descendantItemCount: number;
  /** Items deleting the area leaves unassigned: loose items of the area and its sub-areas. */
  looseItemCount: number;
  depth: number;
  hasChildren: boolean;
  isAdmin: boolean;
  /** Whether the user may add items (members and admins). */
  canAddItem: boolean;
  onNavigate: (areaId: string) => void;
  onShowItems: (areaId: string) => void;
  onAddItem: (areaId: string) => void;
  onRename: (id: string, newName: string) => Promise<void>;
  onDelete: (
    id: string,
    name: string,
    binCount: number,
    descendantAreaCount?: number,
    descendantBinCount?: number,
    looseItemCount?: number,
  ) => void;
}

interface UnassignedCardProps {
  count: number;
  itemCount: number;
  onNavigate: () => void;
  onShowItems: () => void;
}

interface ItemCountLinkProps {
  count: number;
  /** Shown as "(N total)" when larger than count. */
  total?: number;
  /** Name used in the accessible label ("Show the 5 items in Garage"). */
  label: string;
  onClick: () => void;
}

/**
 * The item count as its own small button inside a card that is itself clickable.
 * Click and key events are stopped so they don't also trigger the card's navigation.
 */
function ItemCountLink({ count, total, label, onClick }: ItemCountLinkProps) {
  const { t } = useTranslation('areas');
  const showTotal = total != null && total > count;
  if (count === 0 && !showTotal) return null;
  return (
    <>
      <span aria-hidden="true"> &middot; </span>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        onKeyDown={(e) => e.stopPropagation()}
        aria-label={t('areaItems.show', {
          count,
          name: label,
          defaultValue_one: 'Show the {{count}} item in {{name}}',
          defaultValue_other: 'Show the {{count}} items in {{name}}',
        })}
        className="underline-offset-2 hover:underline hover:text-[var(--text-primary)] focus-visible:underline focus-visible:text-[var(--text-primary)] cursor-pointer transition-colors"
      >
        {t('areaItems.count', { count, defaultValue_one: '{{count}} item', defaultValue_other: '{{count}} items' })}
        {showTotal && ` ${t('card.total', { defaultValue: '({{n}} total)', n: total })}`}
      </button>
    </>
  );
}

interface CreateCardProps {
  onCreate: () => void;
}

export function AreaCard({
  id, name, binCount, descendantBinCount, itemCount, descendantItemCount, looseItemCount, depth, hasChildren,
  isAdmin, canAddItem, onNavigate, onShowItems, onAddItem, onRename, onDelete,
}: AreaCardProps) {
  const term = useTerminology();
  const { t } = useTranslation('areas');
  const { visible, animating, close, toggle } = usePopover();
  const menuRef = useRef<HTMLDivElement>(null);

  const { editing, editValue, saving, startEdit: _startEdit, cancelEdit, setEditValue, handleSave, handleKeyDown } = useInlineEdit({
    currentName: name,
    onSave: (newName) => onRename(id, newName),
  });

  function startEdit() {
    _startEdit();
    close();
  }

  if (editing) {
    return (
      <div className="flat-card rounded-[var(--radius-lg)] p-4 flex flex-col gap-2">
        <Input
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={saving}
          autoFocus
          className="h-8 text-[14px]"
        />
        <div className="flex gap-1.5 justify-end">
          <Tooltip content={t('common:actions.save', { defaultValue: 'Save' })}>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleSave}
              disabled={!editValue.trim() || saving}
              className="shrink-0 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0"
              aria-label={t('common:actions.save', { defaultValue: 'Save' })}
            >
              <Check className="h-4 w-4 text-[var(--accent)]" />
            </Button>
          </Tooltip>
          <Tooltip content={t('common:actions.cancel', { defaultValue: 'Cancel' })}>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={cancelEdit}
              className="shrink-0 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0"
              aria-label={t('common:actions.cancel', { defaultValue: 'Cancel' })}
            >
              <X className="h-4 w-4" />
            </Button>
          </Tooltip>
        </div>
      </div>
    );
  }

  const indentPx = depth * 24;
  const showMenu = isAdmin || canAddItem;

  return (
    // biome-ignore lint/a11y/useSemanticElements: custom card with contextual menu cannot be a plain button
    <div
      role="button"
      tabIndex={0}
      aria-label={name}
      onClick={() => onNavigate(id)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNavigate(id); } }}
      className="flat-card rounded-[var(--radius-lg)] p-4 cursor-pointer hover:bg-[var(--bg-hover)] transition-colors duration-150 active:bg-[var(--bg-active)] text-left relative group"
      style={indentPx > 0 ? { marginLeft: indentPx } : undefined}
    >
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-[var(--radius-sm)] bg-[var(--accent)]/10 flex items-center justify-center shrink-0">
          <Folder className="h-4.5 w-4.5 text-[var(--accent)]" />
        </div>
        <div className={cn("flex-1 min-w-0", showMenu && "pr-7")}>
          <span className="text-[15px] font-semibold text-[var(--text-primary)] truncate block">
            {name}
          </span>
          <span className="text-[13px] text-[var(--text-tertiary)] mt-0.5 block">
{t('binCount', {
              count: binCount,
              bin: term.bin,
              bins: term.bins,
              defaultValue_one: '{{count}} {{bin}}',
              defaultValue_other: '{{count}} {{bins}}',
            })}
            {hasChildren && descendantBinCount > binCount && (
              <span className="text-[var(--text-tertiary)]">
                {' '}
                {t('card.total', { defaultValue: '({{n}} total)', n: descendantBinCount })}
              </span>
            )}
            <ItemCountLink
              count={itemCount}
              total={hasChildren ? descendantItemCount : undefined}
              label={name}
              onClick={() => onShowItems(id)}
            />
          </span>
        </div>
        {!showMenu && <ChevronRight className="h-4 w-4 text-[var(--text-tertiary)] opacity-40 shrink-0" />}
      </div>

      {showMenu && (
        <div
          className="absolute top-2.5 right-2.5"
          ref={menuRef}
        >
          <Tooltip content={t('menu.moreActions', { defaultValue: 'More actions' })} side="bottom">
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => { e.stopPropagation(); toggle(); }}
              className="[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus:opacity-100 transition-opacity"
              aria-label={t('menu.moreActions', { defaultValue: 'More actions' })}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </Tooltip>
          <AreaActionMenu
            visible={visible}
            animating={animating}
            triggerRef={menuRef}
            onClose={close}
            onAddItem={canAddItem ? () => { close(); onAddItem(id); } : undefined}
            onRename={isAdmin ? startEdit : undefined}
            onDelete={isAdmin ? () => { close(); onDelete(id, name, binCount, undefined, hasChildren ? descendantBinCount : undefined, looseItemCount); } : undefined}
          />
        </div>
      )}
    </div>
  );
}

export function UnassignedAreaCard({ count, itemCount, onNavigate, onShowItems }: UnassignedCardProps) {
  const term = useTerminology();
  const { t } = useTranslation('areas');
  const label = t('card.unassigned', { defaultValue: 'Unassigned' });
  return (
    // biome-ignore lint/a11y/useSemanticElements: contains the item count button, which cannot nest in a <button>
    <div
      role="button"
      tabIndex={0}
      onClick={onNavigate}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNavigate(); } }}
      className="flat-card rounded-[var(--radius-lg)] p-4 cursor-pointer hover:bg-[var(--bg-hover)] transition-colors duration-150 active:bg-[var(--bg-active)] text-left"
    >
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-[var(--radius-sm)] bg-[var(--bg-input)] flex items-center justify-center shrink-0">
          <Inbox className="h-4.5 w-4.5 text-[var(--text-tertiary)]" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-[15px] font-semibold text-[var(--text-secondary)] truncate block">
            {label}
          </span>
          <span className="text-[13px] text-[var(--text-tertiary)] mt-0.5 block">
            {t('binCount', {
              count: count,
              bin: term.bin,
              bins: term.bins,
              defaultValue_one: '{{count}} {{bin}}',
              defaultValue_other: '{{count}} {{bins}}',
            })}
            <ItemCountLink count={itemCount} label={label} onClick={onShowItems} />
          </span>
        </div>
        <ChevronRight className="h-4 w-4 text-[var(--text-tertiary)] opacity-40 shrink-0" />
      </div>
    </div>
  );
}

export function CreateAreaCard({ onCreate }: CreateCardProps) {
  const term = useTerminology();
  const { t } = useTranslation('areas');
  return (
    <button
      type="button"
      onClick={onCreate}
      className="rounded-[var(--radius-lg)] p-4 cursor-pointer hover:bg-[var(--bg-hover)] transition-colors duration-150 active:bg-[var(--bg-active)] border border-dashed border-[var(--border-flat)] bg-transparent flex items-center gap-3 text-[var(--text-tertiary)]"
    >
      <div className="h-9 w-9 rounded-[var(--radius-sm)] border border-dashed border-[var(--border-flat)] flex items-center justify-center shrink-0">
        <Plus className="h-4 w-4" />
      </div>
      <span className="text-[13px] font-medium">{t('create.title', { defaultValue: 'Create {{area}}', area: term.Area })}</span>
    </button>
  );
}
