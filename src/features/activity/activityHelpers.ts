import type { TFunction } from 'i18next';
import {
  ArrowRightLeft,
  Image,
  LogIn,
  LogOut,
  MapPin,
  Package,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  UserMinus,
  Users,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { createElement } from 'react';
import type { Terminology } from '@/lib/terminology';
import type { ActivityLogEntry } from '@/types';

export type EntityTypeFilter = '' | 'bin' | 'area' | 'member' | 'location';

/** Filter chips; `label` is resolved at render by the caller (terminology or translation). */
export const ENTITY_TYPE_FILTERS: { value: EntityTypeFilter; tKey?: keyof Terminology }[] = [
  { value: '' },
  { value: 'bin', tKey: 'Bins' },
  { value: 'area', tKey: 'Areas' },
  { value: 'member' },
  { value: 'location', tKey: 'Location' },
];

export function getActionIcon(entry: ActivityLogEntry): ReactNode {
  const cls = 'h-3 w-3';
  const { action, entity_type } = entry;
  if (action === 'create') return createElement(Plus, { className: cls });
  if (action === 'update') return createElement(Pencil, { className: cls });
  if (action === 'delete' || action === 'permanent_delete') return createElement(Trash2, { className: cls });
  if (action === 'restore') return createElement(RotateCcw, { className: cls });
  if (action === 'add_photo') return createElement(Image, { className: cls });
  if (action === 'delete_photo') return createElement(Image, { className: cls });
  if (action === 'move_in' || action === 'move_out') return createElement(ArrowRightLeft, { className: cls });
  if (action === 'join') return createElement(LogIn, { className: cls });
  if (action === 'leave') return createElement(LogOut, { className: cls });
  if (action === 'remove_member') return createElement(UserMinus, { className: cls });
  if (action === 'change_role') return createElement(Users, { className: cls });
  if (action === 'regenerate_invite') return createElement(RotateCcw, { className: cls });
  if (entity_type === 'area') return createElement(MapPin, { className: cls });
  if (entity_type === 'member') return createElement(Users, { className: cls });
  return createElement(Package, { className: cls });
}

export function getActionColor(action: string): string {
  if (action === 'create') return 'text-[var(--color-success)]';
  if (action === 'delete' || action === 'permanent_delete') return 'text-[var(--destructive)]';
  if (action === 'restore') return 'text-[var(--accent)]';
  if (action === 'update') return 'text-[var(--color-warning)]';
  if (action === 'move_in' || action === 'move_out') return 'text-[var(--color-info)]';
  return 'text-[var(--text-tertiary)]';
}

export function getActionBadgeLabel(action: string, t: TFunction<'activity'>): string {
  switch (action) {
    case 'create': return t('activity:badge.created', { defaultValue: 'Created' });
    case 'update': return t('activity:badge.updated', { defaultValue: 'Updated' });
    case 'delete':
    case 'permanent_delete': return t('activity:badge.deleted', { defaultValue: 'Deleted' });
    case 'restore': return t('activity:badge.restored', { defaultValue: 'Restored' });
    case 'add_photo':
    case 'delete_photo': return t('activity:badge.photo', { defaultValue: 'Photo' });
    case 'move_in':
    case 'move_out': return t('activity:badge.moved', { defaultValue: 'Moved' });
    case 'join': return t('activity:badge.joined', { defaultValue: 'Joined' });
    case 'leave': return t('activity:badge.left', { defaultValue: 'Left' });
    case 'remove_member': return t('activity:badge.removed', { defaultValue: 'Removed' });
    case 'change_role': return t('activity:badge.role', { defaultValue: 'Role' });
    case 'regenerate_invite': return t('activity:badge.invite', { defaultValue: 'Invite' });
    // Unknown server action ids: show the raw id, humanized.
    default: return action.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
  }
}

/** Display label for an activity entity type (terminology for bin/area/location). */
export function getEntityTypeLabel(entityType: string, term: Terminology, t: TFunction<'activity'>): string {
  if (entityType === 'bin') return term.bin;
  if (entityType === 'area') return term.area;
  if (entityType === 'location') return term.location;
  if (entityType === 'member') return t('activity:entityTypes.member', { defaultValue: 'member' });
  return entityType;
}

function quotedName(entry: ActivityLogEntry): string {
  return entry.entity_name ? `"${entry.entity_name}"` : '';
}

export function getActionLabel(entry: ActivityLogEntry, term: Terminology, t: TFunction<'activity'>): string {
  const name = quotedName(entry);
  const { action, entity_type } = entry;

  if (entity_type === 'bin') {
    const bin = term.bin;
    if (action === 'create') return t('activity:label.binCreated', { defaultValue: 'created {{bin}} {{name}}', bin, name });
    if (action === 'update') return t('activity:label.binUpdated', { defaultValue: 'updated {{bin}} {{name}}', bin, name });
    if (action === 'delete') return t('activity:label.binDeleted', { defaultValue: 'deleted {{bin}} {{name}}', bin, name });
    if (action === 'restore') return t('activity:label.binRestored', { defaultValue: 'restored {{bin}} {{name}}', bin, name });
    if (action === 'permanent_delete')
      return t('activity:label.binPermanentlyDeleted', { defaultValue: 'permanently deleted {{bin}} {{name}}', bin, name });
    if (action === 'move_in' || action === 'move_out') {
      const from = String(entry.changes?.location?.old ?? '?');
      const to = String(entry.changes?.location?.new ?? '?');
      return t('activity:label.binMoved', { defaultValue: 'moved {{bin}} {{name}} from {{from}} to {{to}}', bin, name, from, to });
    }
    if (action === 'add_photo') return t('activity:label.photoAdded', { defaultValue: 'added photo to {{bin}} {{name}}', bin, name });
    if (action === 'delete_photo')
      return t('activity:label.photoRemoved', { defaultValue: 'removed photo from {{bin}} {{name}}', bin, name });
  }
  if (entity_type === 'area') {
    const area = term.area;
    if (action === 'create') return t('activity:label.areaCreated', { defaultValue: 'created {{area}} {{name}}', area, name });
    if (action === 'update') return t('activity:label.areaRenamed', { defaultValue: 'renamed {{area}} to {{name}}', area, name });
    if (action === 'delete') return t('activity:label.areaDeleted', { defaultValue: 'deleted {{area}} {{name}}', area, name });
  }
  if (entity_type === 'member') {
    const location = term.location;
    if (action === 'join') return t('activity:label.memberJoined', { defaultValue: 'joined the {{location}}', location });
    if (action === 'leave') return t('activity:label.memberLeft', { defaultValue: 'left the {{location}}', location });
    if (action === 'remove_member') return t('activity:label.memberRemoved', { defaultValue: 'removed {{name}}', name });
    if (action === 'change_role') return t('activity:label.roleChanged', { defaultValue: 'changed role for {{name}}', name });
  }
  if (entity_type === 'location') {
    const location = term.location;
    if (action === 'create') return t('activity:label.locationCreated', { defaultValue: 'created {{location}} {{name}}', location, name });
    if (action === 'update') return t('activity:label.locationUpdated', { defaultValue: 'updated {{location}} {{name}}', location, name });
    if (action === 'regenerate_invite') return t('activity:label.inviteRegenerated', { defaultValue: 'regenerated invite code' });
  }

  // Unknown action/entity ids from the server: show them raw.
  return `${action} ${entity_type} ${name}`;
}
const ITEM_FIELDS = new Set(['items_added', 'items_removed', 'items_renamed', 'items']);
const SKIP_FIELDS = new Set(['location', 'area_id', 'items_quantity']);

function fieldLabel(field: string, t: TFunction<'activity'>, term: Terminology): string {
  switch (field) {
    case 'area': return t('activity:fields.area', { defaultValue: '{{area}}', area: term.area });
    case 'name': return t('activity:fields.name', { defaultValue: 'name' });
    case 'notes': return t('activity:fields.notes', { defaultValue: 'notes' });
    case 'tags': return t('activity:fields.tags', { defaultValue: 'tags' });
    case 'icon': return t('activity:fields.icon', { defaultValue: 'icon' });
    case 'color': return t('activity:fields.color', { defaultValue: 'color' });
    case 'visibility': return t('activity:fields.visibility', { defaultValue: 'visibility' });
    case 'card_style': return t('activity:fields.style', { defaultValue: 'style' });
    // Unknown field ids from the server: show them raw.
    default: return field;
  }
}

export function renderChangeDiff(entry: ActivityLogEntry, t: TFunction<'activity'>, term: Terminology): { field: string; old: string; new: string }[] | null {
  if (!entry.changes) return null;

  const fieldDiffs = Object.entries(entry.changes)
    .filter(([f]) => !ITEM_FIELDS.has(f) && !SKIP_FIELDS.has(f))
    .map(([field, diff]) => {
      const label = fieldLabel(field, t, term);
      const formatVal = (val: unknown) => {
        if (field === 'card_style') {
          const fallback = t('activity:values.defaultStyle', { defaultValue: 'default' });
          try {
            const parsed = typeof val === 'string' ? JSON.parse(val) : val;
            return (parsed?.variant as string) || fallback;
          } catch {
            return val ? String(val) : fallback;
          }
        }
        return val == null ? t('activity:values.none', { defaultValue: 'none' }) : String(val);
      };
      return { field: label, old: formatVal(diff.old), new: formatVal(diff.new) };
    });

  const itemDiffs: { field: string; old: string; new: string }[] = [];
  const c = entry.changes;

  if (c.items_added) {
    const added = c.items_added.new as string[] | null;
    if (added && added.length > 0) {
      itemDiffs.push({ field: t('activity:diff.itemsAdded', { defaultValue: '+ items' }), old: '', new: added.join(', ') });
    }
  }
  if (c.items_removed) {
    const removed = c.items_removed.old as string[] | null;
    if (removed && removed.length > 0) {
      itemDiffs.push({ field: t('activity:diff.itemsRemoved', { defaultValue: '− items' }), old: removed.join(', '), new: '' });
    }
  }
  if (c.items_renamed) {
    const renamed = c.items_renamed;
    const renamedLabel = t('activity:diff.renamed', { defaultValue: 'renamed' });
    if (Array.isArray(renamed.new)) {
      for (const pair of renamed.new as Array<{ old: string; new: string }>) {
        itemDiffs.push({ field: renamedLabel, old: String(pair.old), new: String(pair.new) });
      }
    } else {
      itemDiffs.push({
        field: renamedLabel,
        old: String(renamed.old ?? ''),
        new: String(renamed.new ?? ''),
      });
    }
  }

  const allDiffs = [...fieldDiffs, ...itemDiffs];
  return allDiffs.length > 0 ? allDiffs : null;
}

export function getEntityDescription(entry: ActivityLogEntry, term: Terminology, t: TFunction<'activity'>): string {
  const name = quotedName(entry);
  const { action, entity_type } = entry;

  if (entity_type === 'bin') {
    const bin = term.bin;
    if (action === 'move_in' || action === 'move_out') {
      const from = String(entry.changes?.location?.old ?? '?');
      const to = String(entry.changes?.location?.new ?? '?');
      return t('activity:description.binMoved', { defaultValue: '{{bin}} {{name}} from {{from}} to {{to}}', bin, name, from, to });
    }
    if (action === 'add_photo' || action === 'delete_photo') {
      return t('activity:description.photo', { defaultValue: 'photo on {{bin}} {{name}}', bin, name });
    }
    return t('activity:description.bin', { defaultValue: '{{bin}} {{name}}', bin, name });
  }
  if (entity_type === 'area') return t('activity:description.area', { defaultValue: '{{area}} {{name}}', area: term.area, name });
  if (entity_type === 'member') {
    if (action === 'join' || action === 'leave')
      return t('activity:description.theLocation', { defaultValue: 'the {{location}}', location: term.location });
    if (action === 'change_role') return t('activity:description.roleFor', { defaultValue: 'role for {{name}}', name });
    return name;
  }
  if (entity_type === 'location') {
    if (action === 'regenerate_invite') return t('activity:description.inviteCode', { defaultValue: 'invite code' });
    return t('activity:description.location', { defaultValue: '{{location}} {{name}}', location: term.location, name });
  }
  return `${entity_type} ${name}`;
}

const SCALAR_FIELDS = new Set(['name', 'notes', 'tags', 'icon', 'color', 'visibility', 'card_style']);

export function getChangedFieldLabels(entry: ActivityLogEntry, term: Terminology, t: TFunction<'activity'>): string[] {
  if (entry.action !== 'update' || entry.entity_type !== 'bin' || !entry.changes) {
    return [];
  }

  const labels: string[] = [];

  for (const [field, diff] of Object.entries(entry.changes)) {
    if (field === 'location' || field === 'area_id') continue;

    if (field === 'area') {
      labels.push(term.area);
      continue;
    }

    if (field === 'items_added') {
      const n = Array.isArray(diff.new) ? diff.new.length : 0;
      if (n > 0)
        labels.push(
          t('chips.itemsAdded', { ns: 'activity', count: n, defaultValue_one: '+{{count}} item', defaultValue_other: '+{{count}} items' }),
        );
      continue;
    }

    if (field === 'items_removed') {
      const n = Array.isArray(diff.old) ? (diff.old as unknown[]).length : 0;
      if (n > 0)
        labels.push(
          t('chips.itemsRemoved', {
            ns: 'activity',
            count: n,
            defaultValue_one: '−{{count}} item',
            defaultValue_other: '−{{count}} items',
          }),
        );
      continue;
    }

    if (field === 'items_renamed') {
      const n = Array.isArray(diff.new) ? diff.new.length : 1;
      if (n > 0)
        labels.push(
          t('chips.itemsRenamed', { ns: 'activity', count: n, defaultValue_one: 'renamed item', defaultValue_other: 'renamed {{count}} items' }),
        );
      continue;
    }

    if (field === 'items_quantity') {
      labels.push(t('activity:chips.quantity', { defaultValue: 'quantity' }));
      continue;
    }

    if (field === 'items') continue; // legacy reorder — no chip

    if (SCALAR_FIELDS.has(field)) labels.push(fieldLabel(field, t, term));
  }

  return labels;
}
