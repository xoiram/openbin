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
import { OptionGroup } from '@/components/ui/option-group';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toast';
import { useTerminology } from '@/lib/terminology';
import { getErrorMessage } from '@/lib/utils';
import type { Location } from '@/types';
import { updateLocation } from './useLocations';

interface LocationRetentionDialogProps {
  location: Location | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LocationRetentionDialog({ location, open, onOpenChange }: LocationRetentionDialogProps) {
  const { showToast } = useToast();
  const term = useTerminology();
  const { t } = useTranslation('locations');
  const joinRoleOptions = [
    { key: 'member' as const, label: t('roles.member', { defaultValue: 'Member' }) },
    { key: 'viewer' as const, label: t('roles.viewer', { defaultValue: 'Viewer' }) },
  ];
  const [activityRetention, setActivityRetention] = useState(90);
  const [trashRetention, setTrashRetention] = useState(30);
  const [defaultJoinRole, setDefaultJoinRole] = useState<'member' | 'viewer'>('member');
  const [publicQrAccess, setPublicQrAccess] = useState(false);
  const [publicQrPhotos, setPublicQrPhotos] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && location) {
      setActivityRetention(location.activity_retention_days ?? 90);
      setTrashRetention(location.trash_retention_days ?? 30);
      setDefaultJoinRole(location.default_join_role ?? 'member');
      setPublicQrAccess(location.public_qr_access ?? false);
      setPublicQrPhotos(location.public_qr_photos ?? true);
      setSaving(false);
    }
  }, [open, location]);

  async function handleSave() {
    if (!location) return;
    setSaving(true);
    try {
      await updateLocation(location.id, {
        activity_retention_days: activityRetention,
        trash_retention_days: trashRetention,
        default_join_role: defaultJoinRole,
        public_qr_access: publicQrAccess,
        public_qr_photos: publicQrPhotos,
      });
      onOpenChange(false);
      showToast({ message: t('retention.saved', { defaultValue: 'Retention settings saved' }), variant: 'success' });
    } catch (err) {
      showToast({ message: getErrorMessage(err, t('retention.saveFailed', { defaultValue: 'Failed to save retention settings' })), variant: 'error' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('retention.title', { defaultValue: '{{location}} Settings', location: term.Location })}</DialogTitle>
          <DialogDescription>
            {t('retention.description', {
              defaultValue: 'Configure data retention and membership defaults for this {{location}}.',
              location: term.location,
            })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="activity-retention">{t('retention.activityLabel', { defaultValue: 'Activity log retention (days)' })}</Label>
            <Input
              id="activity-retention"
              type="number"
              inputMode="numeric"
              pattern="[0-9]*"
              min={7}
              max={365}
              value={activityRetention}
              onChange={(e) => setActivityRetention(Number(e.target.value))}
            />
            <p className="text-[11px] text-[var(--text-tertiary)]">
              {t('retention.activityHint', { defaultValue: '7–365 days. Entries older than this are automatically pruned.' })}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="trash-retention">{t('retention.trashLabel', { defaultValue: 'Trash retention (days)' })}</Label>
            <Input
              id="trash-retention"
              type="number"
              inputMode="numeric"
              pattern="[0-9]*"
              min={7}
              max={365}
              value={trashRetention}
              onChange={(e) => setTrashRetention(Number(e.target.value))}
            />
            <p className="text-[11px] text-[var(--text-tertiary)]">
              {t('retention.trashHint', {
                defaultValue: '7–365 days. Deleted {{bins}} are permanently purged after this period.',
                bins: term.bins,
              })}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>{t('retention.defaultRoleLabel', { defaultValue: 'Default role for new members' })}</Label>
            <OptionGroup
              options={joinRoleOptions}
              value={defaultJoinRole}
              onChange={setDefaultJoinRole}
            />
            <p className="text-[11px] text-[var(--text-tertiary)]">
              {defaultJoinRole === 'viewer'
                ? t('retention.viewerHint', { defaultValue: 'New members will be read-only until promoted.' })
                : t('retention.memberHint', { defaultValue: 'New members can create and edit content.' })}
            </p>
          </div>
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <Label id="public-qr-access-label">{t('retention.publicQrLabel', { defaultValue: 'Public QR access' })}</Label>
                <p className="text-[11px] text-[var(--text-tertiary)]">
                  {t('retention.publicQrHint', {
                    defaultValue: "Anyone who scans a QR label can see its contents, read-only and without logging in. Private {{bins}} are never shown. Anyone who has a label or its link can see the contents, so only turn this on if that's fine.",
                    bins: term.bins,
                  })}
                </p>
              </div>
              <Switch checked={publicQrAccess} onCheckedChange={setPublicQrAccess} aria-labelledby="public-qr-access-label" />
            </div>
            {publicQrAccess && (
              <div className="flex items-start justify-between gap-3 pl-4 border-l border-[var(--border-subtle)]">
                <div className="space-y-1">
                  <Label id="public-qr-photos-label">{t('retention.publicQrPhotosLabel', { defaultValue: 'Include photos' })}</Label>
                  <p className="text-[11px] text-[var(--text-tertiary)]">
                    {t('retention.publicQrPhotosHint', {
                      defaultValue: "Photos can show more than the contents, such as what's around the {{bin}}.",
                      bin: term.bin,
                    })}
                  </p>
                </div>
                <Switch checked={publicQrPhotos} onCheckedChange={setPublicQrPhotos} aria-labelledby="public-qr-photos-label" />
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('common:actions.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || activityRetention < 7 || activityRetention > 365 || trashRetention < 7 || trashRetention > 365}
          >
            {saving ? t('saving', { defaultValue: 'Saving...' }) : t('common:actions.save', { defaultValue: 'Save' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
