import { useEffect, useState } from 'react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/lib/auth';
import { useTerminology } from '@/lib/terminology';
import { createLocation, deleteLocation, joinLocation, updateLocation, useLocationList } from './useLocations';

interface LocationCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LocationCreateDialog({ open, onOpenChange }: LocationCreateDialogProps) {
  const { setActiveLocationId } = useAuth();
  const term = useTerminology();
  const { t } = useTranslation('locations');
  const { showToast } = useToast();
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (open) {
      setName('');
      setCreating(false);
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      const location = await createLocation(name.trim());
      setActiveLocationId(location.id);
      onOpenChange(false);
      showToast({ message: t('create.success', { defaultValue: 'Created "{{name}}"', name: location.name }), variant: 'success' });
    } catch (err) {
      showToast({ message: err instanceof Error ? err.message : t('create.failed', { defaultValue: 'Failed to create {{location}}', location: term.location }), variant: 'error' });
    } finally {
      setCreating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('create.title', { defaultValue: 'Create {{location}}', location: term.Location })}</DialogTitle>
          <DialogDescription>
            {t('create.description', {
              defaultValue: 'A {{location}} is a shared space where members can manage {{bins}} together.',
              location: term.location,
              bins: term.bins,
            })}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="location-name">{t('nameLabel', { defaultValue: 'Name' })}</Label>
            <Input
              id="location-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('create.namePlaceholder', { defaultValue: 'e.g., My House, Office' })}
              maxLength={255}
              autoFocus
              required
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t('common:actions.cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button type="submit" disabled={!name.trim() || creating}>
              {creating ? t('create.creating', { defaultValue: 'Creating...' }) : t('create.submit', { defaultValue: 'Create' })}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface LocationJoinDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LocationJoinDialog({ open, onOpenChange }: LocationJoinDialogProps) {
  const { setActiveLocationId } = useAuth();
  const term = useTerminology();
  const { t } = useTranslation('locations');
  const { showToast } = useToast();
  const [inviteCode, setInviteCode] = useState('');
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (open) {
      setInviteCode('');
      setJoining(false);
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteCode.trim()) return;
    setJoining(true);
    try {
      const location = await joinLocation(inviteCode.trim());
      setActiveLocationId(location.id);
      onOpenChange(false);
      showToast({ message: t('join.success', { defaultValue: 'Joined "{{name}}"', name: location.name }), variant: 'success' });
    } catch (err) {
      showToast({ message: err instanceof Error ? err.message : t('join.failed', { defaultValue: 'Failed to join {{location}}', location: term.location }), variant: 'error' });
    } finally {
      setJoining(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('join.title', { defaultValue: 'Join {{location}}', location: term.Location })}</DialogTitle>
          <DialogDescription>
            {t('join.description', {
              defaultValue: 'Enter the invite code shared by a {{location}} owner to join.',
              location: term.location,
            })}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="invite-code">{t('join.codeLabel', { defaultValue: 'Invite Code' })}</Label>
            <Input
              id="invite-code"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              placeholder={t('join.codePlaceholder', { defaultValue: 'Enter invite code' })}
              autoFocus
              required
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t('common:actions.cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button type="submit" disabled={!inviteCode.trim() || joining}>
              {joining ? t('join.joining', { defaultValue: 'Joining...' }) : t('join.submit', { defaultValue: 'Join' })}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface LocationRenameDialogProps {
  locationId: string | null;
  currentName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LocationRenameDialog({ locationId, currentName, open, onOpenChange }: LocationRenameDialogProps) {
  const { showToast } = useToast();
  const term = useTerminology();
  const { t } = useTranslation('locations');
  const [name, setName] = useState(currentName);
  const [renaming, setRenaming] = useState(false);

  useEffect(() => {
    if (open) {
      setName(currentName);
      setRenaming(false);
    }
  }, [open, currentName]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!locationId || !name.trim()) return;
    setRenaming(true);
    try {
      await updateLocation(locationId, { name: name.trim() });
      onOpenChange(false);
      showToast({ message: t('rename.success', { defaultValue: '{{location}} renamed', location: term.Location }), variant: 'success' });
    } catch (err) {
      showToast({ message: err instanceof Error ? err.message : t('rename.failed', { defaultValue: 'Failed to rename {{location}}', location: term.location }), variant: 'error' });
    } finally {
      setRenaming(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('rename.title', { defaultValue: 'Rename {{location}}', location: term.Location })}</DialogTitle>
          <DialogDescription>
            {t('rename.description', { defaultValue: 'Enter a new name for this {{location}}.', location: term.location })}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="rename-location">{t('nameLabel', { defaultValue: 'Name' })}</Label>
            <Input
              id="rename-location"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={255}
              autoFocus
              required
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t('common:actions.cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button type="submit" disabled={!name.trim() || renaming}>
              {renaming ? t('saving', { defaultValue: 'Saving...' }) : t('common:actions.save', { defaultValue: 'Save' })}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface LocationDeleteDialogProps {
  locationId: string | null;
  locationName: string;
  binCount?: number;
  areaCount?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LocationDeleteDialog({ locationId, locationName, binCount, areaCount, open, onOpenChange }: LocationDeleteDialogProps) {
  const { activeLocationId, setActiveLocationId } = useAuth();
  const { locations } = useLocationList();
  const term = useTerminology();
  const { t } = useTranslation('locations');
  const { showToast } = useToast();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!locationId) return;
    setDeleting(true);
    try {
      await deleteLocation(locationId);
      if (activeLocationId === locationId) {
        const remaining = locations.filter((h) => h.id !== locationId);
        setActiveLocationId(remaining.length > 0 ? remaining[0].id : null);
      }
      onOpenChange(false);
      showToast({ message: t('delete.success', { defaultValue: '{{location}} deleted', location: term.Location }), variant: 'success' });
    } catch (err) {
      showToast({ message: err instanceof Error ? err.message : t('delete.failed', { defaultValue: 'Failed to delete {{location}}', location: term.location }), variant: 'error' });
    } finally {
      setDeleting(false);
    }
  }

  const binPart =
    binCount != null && binCount > 0
      ? t('delete.binCount', {
          count: binCount,
          bin: term.bin,
          bins: term.bins,
          defaultValue_one: '{{count}} {{bin}}',
          defaultValue_other: '{{count}} {{bins}}',
        })
      : null;
  const areaPart =
    areaCount != null && areaCount > 0
      ? t('delete.areaCount', {
          count: areaCount,
          area: term.area,
          areas: term.areas,
          defaultValue_one: '{{count}} {{area}}',
          defaultValue_other: '{{count}} {{areas}}',
        })
      : null;
  const assets =
    binPart && areaPart
      ? t('delete.assetsBoth', { defaultValue: '{{first}} and {{second}}', first: binPart, second: areaPart })
      : (binPart ?? areaPart);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('delete.title', { defaultValue: 'Delete {{location}}?', location: term.Location })}</DialogTitle>
          <DialogDescription>
            {assets
              ? t('delete.descriptionWithAssets', {
                  defaultValue:
                    'This will permanently delete "{{name}}" including {{assets}}, along with all photos. This cannot be undone.',
                  name: locationName,
                  assets,
                })
              : t('delete.description', {
                  defaultValue: 'This will permanently delete "{{name}}" and all its data. This cannot be undone.',
                  name: locationName,
                })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('common:actions.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? t('delete.deleting', { defaultValue: 'Deleting...' }) : t('common:actions.delete', { defaultValue: 'Delete' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
