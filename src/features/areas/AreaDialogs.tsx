import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import { ApiError } from '@/lib/api';
import { useTerminology } from '@/lib/terminology';
import { cn, inputBase } from '@/lib/utils';
import type { Area } from '@/types';
import { buildAreaTree, createArea, deleteArea, flattenAreaTree } from './useAreas';

/* ------------------------------------------------------------------ */
/*  Create Area Dialog                                                 */
/* ------------------------------------------------------------------ */

interface CreateAreaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locationId: string | null;
  areas: Area[];
  defaultParentId?: string | null;
  /** Called with the newly created area – use to auto-select in pickers */
  onCreated?: (area: Area) => void;
}

export function CreateAreaDialog({ open, onOpenChange, locationId, areas, defaultParentId, onCreated }: CreateAreaDialogProps) {
  const term = useTerminology();
  const { t } = useTranslation('areas');
  const { showToast } = useToast();
  const [newAreaName, setNewAreaName] = useState('');
  const [parentId, setParentId] = useState<string | null>(defaultParentId ?? null);
  const [creatingArea, setCreatingArea] = useState(false);

  const flatAreas = useMemo(() => flattenAreaTree(buildAreaTree(areas)), [areas]);

  // Reset parent when dialog opens
  const [lastOpen, setLastOpen] = useState(false);
  if (open && !lastOpen) {
    setParentId(defaultParentId ?? null);
  }
  if (open !== lastOpen) setLastOpen(open);

  async function handleCreateArea(e: React.FormEvent) {
    e.preventDefault();
    if (!newAreaName.trim() || !locationId) return;
    setCreatingArea(true);
    try {
      const area = await createArea(locationId, newAreaName.trim(), parentId);
      onCreated?.(area);
      setNewAreaName('');
      setParentId(null);
      onOpenChange(false);
    } catch (err) {
      showToast({
        message:
          err instanceof ApiError && err.status === 409
            ? t('create.nameExists', { defaultValue: '{{area}} name already exists', area: term.Area })
            : t('genericError', { defaultValue: 'Something went wrong' }),
        variant: 'error',
      });
    } finally {
      setCreatingArea(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('create.title', { defaultValue: 'Create {{area}}', area: term.Area })}</DialogTitle>
          <DialogDescription>
            {t('create.description', {
              defaultValue: '{{areas}} help organize {{bins}} by zone (e.g. Garage, Kitchen, Closet).',
              areas: term.Areas,
              bins: term.bins,
            })}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleCreateArea} className="space-y-5">
          <div className="space-y-2">
            <Input
              value={newAreaName}
              onChange={(e) => setNewAreaName(e.target.value)}
              placeholder={t('create.namePlaceholder', { defaultValue: '{{area}} name...', area: term.Area })}
              maxLength={255}
              autoFocus
              required
            />
          </div>
          {flatAreas.length > 0 && (
            <div className="space-y-2">
              <Label className="text-[13px]">{t('create.parentLabel', { defaultValue: 'Parent {{area}}', area: term.Area })}</Label>
              <select
                value={parentId ?? ''}
                onChange={(e) => setParentId(e.target.value || null)}
                className={cn(inputBase, 'h-10 focus-visible:ring-2 focus-visible:ring-[var(--accent)]')}
              >
                <option value="">{t('create.noParent', { defaultValue: 'No parent (root {{area}})', area: term.area })}</option>
                {flatAreas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {'\u00A0\u00A0'.repeat(a.depth)}{a.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t('common:actions.cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button type="submit" disabled={!newAreaName.trim() || creatingArea}>
              {creatingArea ? t('create.creating', { defaultValue: 'Creating...' }) : t('create.submit', { defaultValue: 'Create' })}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  Delete Area Dialog                                                 */
/* ------------------------------------------------------------------ */

interface DeleteAreaTarget {
  id: string;
  name: string;
  binCount: number;
  descendantAreaCount?: number;
  descendantBinCount?: number;
  /** Items placed directly in the area (and its sub-areas) that become unassigned. */
  looseItemCount?: number;
}

interface DeleteAreaDialogProps {
  target: DeleteAreaTarget | null;
  onOpenChange: (open: boolean) => void;
  locationId: string | null;
}

export function DeleteAreaDialog({ target, onOpenChange, locationId }: DeleteAreaDialogProps) {
  const term = useTerminology();
  const { t } = useTranslation('areas');
  const { showToast } = useToast();
  const [deletingArea, setDeletingArea] = useState(false);

  async function handleDeleteArea() {
    if (!target || !locationId) return;
    setDeletingArea(true);
    try {
      await deleteArea(locationId, target.id);
      onOpenChange(false);
    } catch {
      showToast({ message: t('genericError', { defaultValue: 'Something went wrong' }), variant: 'error' });
    } finally {
      setDeletingArea(false);
    }
  }

  function getDescription(): string {
    if (!target) return '';
    const base = getBaseDescription(target);
    const looseItems = target.looseItemCount ?? 0;
    if (looseItems <= 0) return base;
    const looseNote = t('areaItems.deleteLoose', {
      count: looseItems,
      defaultValue_one: '{{count}} item placed directly in it will become unassigned.',
      defaultValue_other: '{{count}} items placed directly in it will become unassigned.',
    });
    return `${base} ${looseNote}`;
  }

  function getBaseDescription(target: DeleteAreaTarget): string {
    const hasDescendantAreas = target.descendantAreaCount && target.descendantAreaCount > 0;
    const totalBins = target.descendantBinCount ?? target.binCount;

    const binPhrase = (count: number) =>
      t('delete.binCount', {
        count,
        bin: term.bin,
        bins: term.bins,
        defaultValue_one: '{{count}} {{bin}}',
        defaultValue_other: '{{count}} {{bins}}',
      });

    if (hasDescendantAreas) {
      const subAreas = t('delete.subAreaCount', {
        count: target.descendantAreaCount,
        area: term.area,
        areas: term.areas,
        defaultValue_one: '{{count}} sub-{{area}}',
        defaultValue_other: '{{count}} sub-{{areas}}',
      });
      const parts =
        totalBins > 0
          ? t('delete.and', { defaultValue: '{{first}} and {{second}}', first: subAreas, second: binPhrase(totalBins) })
          : subAreas;
      return t('delete.withDescendants', {
        defaultValue: 'This will also delete {{parts}}. {{bins}} will become unassigned.',
        parts,
        bins: term.Bins,
      });
    }

    if (target.binCount > 0) {
      return t('delete.withBins', {
        defaultValue: '"{{name}}" has {{bins}}. They will become unassigned.',
        name: target.name,
        bins: binPhrase(target.binCount),
      });
    }

    return t('delete.confirmName', { defaultValue: 'Delete "{{name}}"?', name: target.name });
  }

  return (
    <Dialog open={!!target} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('delete.title', { defaultValue: 'Delete {{area}}?', area: term.area })}</DialogTitle>
          <DialogDescription>{getDescription()}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('common:actions.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button
            variant="destructive"
            onClick={handleDeleteArea}
            disabled={deletingArea}
          >
            {deletingArea ? t('delete.deleting', { defaultValue: 'Deleting...' }) : t('common:actions.delete', { defaultValue: 'Delete' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
