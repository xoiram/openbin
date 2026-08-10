import {ArrowUpDown, CircleHelp,
  Copy, FileText, FolderMinus, FolderPen, Hash, Image as ImageIcon, LogIn, LogOut, MapPin, Minus, Package, Palette, PenLine, Pin, PinOff,
  Plus, Tag, Trash2, Undo2,
} from 'lucide-react';
import type { Terminology } from '@/lib/terminology';
import type { CommandAction } from './useCommand';

type Translate = (key: string, options?: Record<string, unknown>) => string;

export function isBinCreatingAction(action: CommandAction): boolean {
  return action.type === 'create_bin' || action.type === 'duplicate_bin';
}

/**
 * Fill in missing `bin_name` (and `target_bin_name` for return_item) on AI
 * command actions using a local bin_id → bin name map. Providers (notably
 * Gemini) sometimes omit these optional fields even though the system prompt
 * and few-shot examples require them — the raw JSON is otherwise shown to the
 * user as `Delete "undefined"`. Pure function: does not mutate input.
 */
export function enrichActionsWithNames(
  actions: CommandAction[],
  binMap: Map<string, { name: string }>,
): CommandAction[] {
  return actions.map((action) => {
    let next = action;
    if ('bin_id' in action && typeof action.bin_id === 'string') {
      const hasName = 'bin_name' in action && typeof (action as { bin_name?: unknown }).bin_name === 'string' && (action as { bin_name: string }).bin_name.length > 0;
      if (!hasName) {
        const name = binMap.get(action.bin_id)?.name;
        if (name) next = { ...action, bin_name: name } as CommandAction;
      }
    }
    if (next.type === 'return_item' && next.target_bin_id && !next.target_bin_name) {
      const target = binMap.get(next.target_bin_id)?.name;
      if (target) next = { ...next, target_bin_name: target };
    }
    return next;
  });
}

/** Read bin_name from action, falling back to a readable placeholder. */
function resolveBinName(action: CommandAction, translate: Translate): string {
  const name = (action as { bin_name?: unknown }).bin_name;
  if (typeof name === 'string' && name.length > 0) return name;
  return translate('commandActions.unknownBin', { defaultValue: 'a bin' });
}

export function isDestructiveAction(action: CommandAction): boolean {
  return action.type === 'delete_bin' || action.type === 'remove_items' || action.type === 'remove_tags'
    || action.type === 'delete_area' || action.type === 'unpin_bin';
}

export function getActionIcon(action: CommandAction) {
  switch (action.type) {
    case 'add_items': return Plus;
    case 'remove_items': return Minus;
    case 'modify_item': return FileText;
    case 'set_item_quantity': return Hash;
    case 'create_bin': return Package;
    case 'delete_bin': return Trash2;
    case 'add_tags': return Tag;
    case 'remove_tags': return Tag;
    case 'modify_tag': return Tag;
    case 'set_area': return MapPin;
    case 'set_notes': return FileText;
    case 'set_icon': return ImageIcon;
    case 'set_color': return Palette;
    case 'update_bin': return PenLine;
    case 'restore_bin': return Undo2;
    case 'duplicate_bin': return Copy;
    case 'pin_bin': return Pin;
    case 'unpin_bin': return PinOff;
    case 'rename_area': return FolderPen;
    case 'delete_area': return FolderMinus;
    case 'set_tag_color': return Palette;
    case 'reorder_items': return ArrowUpDown;
    case 'checkout_item': return LogOut;
    case 'return_item': return LogIn;
    default: return CircleHelp;
  }
}

export function describeAction(action: CommandAction, term: Terminology, t: unknown): string {
  const translate = t as Translate;
  const binName = resolveBinName(action, translate);
  switch (action.type) {
    case 'add_items': {
      const items = action.items
        .map((i) => (typeof i === 'string' ? i : i.quantity ? `${i.name} (×${i.quantity})` : i.name))
        .join(', ');
      return translate('commandActions.addItems', { defaultValue: 'Add {{items}} to "{{bin}}"', items, bin: binName });
    }
    case 'remove_items':
      return translate('commandActions.removeItems', {
        defaultValue: 'Remove {{items}} from "{{bin}}"',
        items: action.items.join(', '),
        bin: binName,
      });
    case 'modify_item':
      return translate('commandActions.modifyItem', {
        defaultValue: 'Rename "{{oldItem}}" to "{{newItem}}" in "{{bin}}"',
        oldItem: action.old_item,
        newItem: action.new_item,
        bin: binName,
      });
    case 'set_item_quantity':
      return action.quantity <= 0
        ? translate('commandActions.removeItemZeroQuantity', {
            defaultValue: 'Remove "{{item}}" from "{{bin}}"',
            item: action.item_name,
            bin: binName,
          })
        : translate('commandActions.setItemQuantity', {
            defaultValue: 'Set quantity of "{{item}}" to {{quantity}} in "{{bin}}"',
            item: action.item_name,
            quantity: action.quantity,
            bin: binName,
          });
    case 'create_bin': {
      let desc = translate('commandActions.createBin', {
        defaultValue: 'Create {{binTerm}} "{{name}}"',
        binTerm: term.bin,
        name: action.name,
      });
      if (action.area_name) {
        desc += translate('commandActions.createBinInArea', { defaultValue: ' in {{area}}', area: action.area_name });
      }
      if (action.items?.length) {
        desc += translate('commandActions.createBinWithItems', {
          defaultValue: ' with {{count}} item',
          count: action.items.length,
        });
      }
      return desc;
    }
    case 'delete_bin':
      return translate('commandActions.deleteBin', { defaultValue: 'Delete "{{bin}}"', bin: binName });
    case 'add_tags':
      return translate('commandActions.addTags', {
        defaultValue: 'Add tag {{tags}} to "{{bin}}"',
        count: action.tags.length,
        tags: action.tags.join(', '),
        bin: binName,
      });
    case 'remove_tags':
      return translate('commandActions.removeTags', {
        defaultValue: 'Remove tag {{tags}} from "{{bin}}"',
        count: action.tags.length,
        tags: action.tags.join(', '),
        bin: binName,
      });
    case 'modify_tag':
      return translate('commandActions.modifyTag', {
        defaultValue: 'Rename tag "{{oldTag}}" to "{{newTag}}" on "{{bin}}"',
        oldTag: action.old_tag,
        newTag: action.new_tag,
        bin: binName,
      });
    case 'set_area':
      return translate('commandActions.setArea', {
        defaultValue: 'Move "{{bin}}" to {{areaTerm}} "{{area}}"',
        bin: binName,
        areaTerm: term.area,
        area: action.area_name,
      });
    case 'set_notes':
      if (action.mode === 'clear') {
        return translate('commandActions.clearNotes', { defaultValue: 'Clear notes on "{{bin}}"', bin: binName });
      }
      if (action.mode === 'append') {
        return translate('commandActions.appendNotes', { defaultValue: 'Append to notes on "{{bin}}"', bin: binName });
      }
      return translate('commandActions.setNotes', { defaultValue: 'Set notes on "{{bin}}"', bin: binName });
    case 'set_icon':
      return translate('commandActions.setIcon', {
        defaultValue: 'Set icon on "{{bin}}" to {{icon}}',
        bin: binName,
        icon: action.icon,
      });
    case 'set_color':
      return translate('commandActions.setColor', {
        defaultValue: 'Set color on "{{bin}}" to {{color}}',
        bin: binName,
        color: action.color,
      });
    case 'update_bin': {
      const fields = ['name', 'notes', 'tags', 'area_name', 'icon', 'color', 'visibility'].filter(
        (f) => (action as Record<string, unknown>)[f] !== undefined,
      );
      return translate('commandActions.updateBin', {
        defaultValue: 'Update "{{bin}}": {{fields}}',
        bin: binName,
        fields: fields.join(', '),
      });
    }
    case 'restore_bin':
      return translate('commandActions.restoreBin', { defaultValue: 'Restore "{{bin}}" from trash', bin: binName });
    case 'duplicate_bin':
      return action.new_name
        ? translate('commandActions.duplicateBinAs', {
            defaultValue: 'Duplicate "{{bin}}" as "{{newName}}"',
            bin: binName,
            newName: action.new_name,
          })
        : translate('commandActions.duplicateBin', { defaultValue: 'Duplicate "{{bin}}"', bin: binName });
    case 'pin_bin':
      return translate('commandActions.pinBin', { defaultValue: 'Pin "{{bin}}"', bin: binName });
    case 'unpin_bin':
      return translate('commandActions.unpinBin', { defaultValue: 'Unpin "{{bin}}"', bin: binName });
    case 'rename_area':
      return translate('commandActions.renameArea', {
        defaultValue: 'Rename {{areaTerm}} "{{area}}" to "{{newName}}"',
        areaTerm: term.area,
        area: action.area_name,
        newName: action.new_name,
      });
    case 'delete_area':
      return translate('commandActions.deleteArea', {
        defaultValue: 'Delete {{areaTerm}} "{{area}}"',
        areaTerm: term.area,
        area: action.area_name,
      });
    case 'set_tag_color':
      return translate('commandActions.setTagColor', {
        defaultValue: 'Set color of tag "{{tag}}" to {{color}}',
        tag: action.tag,
        color: action.color,
      });
    case 'reorder_items':
      return translate('commandActions.reorderItems', { defaultValue: 'Reorder items in "{{bin}}"', bin: binName });
    case 'checkout_item':
      return translate('commandActions.checkoutItem', {
        defaultValue: 'Check out "{{item}}" from "{{bin}}"',
        item: action.item_name,
        bin: binName,
      });
    case 'return_item':
      return action.target_bin_name
        ? translate('commandActions.returnItemTo', {
            defaultValue: 'Return "{{item}}" to "{{bin}}"',
            item: action.item_name,
            bin: action.target_bin_name,
          })
        : translate('commandActions.returnItem', {
            defaultValue: 'Return "{{item}}" to "{{bin}}"',
            item: action.item_name,
            bin: binName,
          });
    default:
      return translate('commandActions.unknownAction', {
        defaultValue: 'Unknown action: {{type}}',
        type: (action as Record<string, unknown>).type,
      });
  }
}
