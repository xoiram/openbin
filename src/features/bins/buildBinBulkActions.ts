import { ArrowRightLeft, Clipboard, ClipboardPaste, Copy, Eye, List, MapPin, Paintbrush, Pin, Printer, Shuffle, Sparkles, Tag, Trash2 } from 'lucide-react';
import type { BulkAction } from '@/lib/bulk/BulkActionBar';
import type { Terminology } from '@/lib/terminology';

export type Translate = (key: string, options?: Record<string, unknown>) => string;

export interface BuildBinBulkActionsArgs {
  /** Translate function (bins namespace). Optional so callers outside this folder keep working; falls back to English. */
  t?: Translate;
  term?: Terminology;
  isAdmin: boolean;
  pinLabel: string;
  aiEnabled?: boolean;
  aiGated?: boolean;
  canCopyStyle: boolean;
  canPasteStyle: boolean;
  showPrint?: boolean;
  showReorganize?: boolean;
  onTag: () => void;
  onMove: () => void;
  onDelete: () => void;
  onAppearance: () => void;
  onVisibility: () => void;
  onMoveLocation: () => void;
  onPin: () => void;
  onDuplicate: () => void;
  onCustomFields?: () => void;
  onCopyStyle?: () => void;
  onPasteStyle?: () => void;
  onAskAi?: () => void;
  onReorganize?: () => void;
  onPrint?: () => void;
}

export function buildBinBulkActions(args: BuildBinBulkActionsArgs): BulkAction[] {
  const t: Translate = args.t ?? ((_key, options) => String(options?.defaultValue ?? _key));
  const showStyleDivider = Boolean(args.canCopyStyle || args.canPasteStyle);
  return [
    { id: 'tag', icon: Tag, label: t('bulk.actions.tag', { defaultValue: 'Tag' }), onClick: args.onTag, group: 'primary', show: args.isAdmin },
    { id: 'move', icon: MapPin, label: t('bulk.actions.move', { defaultValue: 'Move' }), onClick: args.onMove, group: 'primary', show: args.isAdmin },
    { id: 'print', icon: Printer, label: t('bulk.actions.print', { defaultValue: 'Print' }), onClick: args.onPrint ?? (() => {}), group: 'primary', show: Boolean(args.showPrint && args.onPrint) },
    { id: 'delete', icon: Trash2, label: t('bulk.actions.delete', { defaultValue: 'Delete' }), onClick: args.onDelete, group: 'primary', show: args.isAdmin, danger: true },
    { id: 'ai', icon: Sparkles, label: t('bulk.actions.ai', { defaultValue: 'AI' }), onClick: args.onAskAi ?? (() => {}), group: 'primary', show: Boolean((args.aiEnabled || args.aiGated) && args.onAskAi) },
    { id: 'appearance', icon: Paintbrush, label: t('bulk.actions.appearance', { defaultValue: 'Appearance' }), onClick: args.onAppearance, group: 'more', show: args.isAdmin },
    { id: 'visibility', icon: Eye, label: t('bulk.actions.visibility', { defaultValue: 'Change Visibility' }), onClick: args.onVisibility, group: 'more', show: args.isAdmin },
    { id: 'moveLocation', icon: ArrowRightLeft, label: t('bulk.actions.moveLocation', { defaultValue: 'Move to {{Location}}', Location: args.term?.Location ?? 'Location' }), onClick: args.onMoveLocation, group: 'more', show: args.isAdmin },
    { id: 'pin', icon: Pin, label: args.pinLabel, onClick: args.onPin, group: 'more', show: args.isAdmin },
    { id: 'duplicate', icon: Copy, label: t('bulk.actions.duplicate', { defaultValue: 'Duplicate' }), onClick: args.onDuplicate, group: 'more', show: args.isAdmin },
    { id: 'reorganize', icon: Shuffle, label: t('bulk.actions.reorganize', { defaultValue: 'Reorganize' }), onClick: args.onReorganize ?? (() => {}), group: 'more', show: Boolean(args.aiEnabled && args.showReorganize && args.onReorganize) },
    { id: 'customFields', icon: List, label: t('bulk.actions.customFields', { defaultValue: 'Custom Fields' }), onClick: args.onCustomFields ?? (() => {}), group: 'more', show: Boolean(args.isAdmin && args.onCustomFields) },
    { id: 'copyStyle', icon: Clipboard, label: t('bulk.actions.copyStyle', { defaultValue: 'Copy Style' }), onClick: args.onCopyStyle ?? (() => {}), group: 'more', show: Boolean(args.canCopyStyle && args.onCopyStyle), dividerBefore: showStyleDivider },
    { id: 'pasteStyle', icon: ClipboardPaste, label: t('bulk.actions.pasteStyle', { defaultValue: 'Paste Style' }), onClick: args.onPasteStyle ?? (() => {}), group: 'more', show: Boolean(args.canPasteStyle && args.onPasteStyle), dividerBefore: showStyleDivider && !args.canCopyStyle },
  ];
}
