import { useEffect, useMemo, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { HueGradientPicker } from '@/features/bins/ColorPicker';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { getTagTextColor, resolveColor } from '@/lib/colorPalette';
import { Events, notify } from '@/lib/eventBus';
import { useTheme } from '@/lib/theme';
import { categoryHeader, cn, inputBase } from '@/lib/utils';

interface CreateTagDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When non-empty the name is fixed; when empty an input field is shown */
  tagName?: string;
  onConfirm: (createdTag?: string) => void;
  suggestions?: string[];
  tagParents?: Map<string, string>;
  defaultParent?: string | null;
}

export function CreateTagDialog({ open, onOpenChange, tagName, onConfirm, suggestions, tagParents, defaultParent }: CreateTagDialogProps) {
  const { t } = useTranslation(['tags', 'common']);
  const { activeLocationId } = useAuth();
  const { theme } = useTheme();
  const [name, setName] = useState('');
  const [color, setColor] = useState('');
  const [parent, setParent] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);

  const isNameEditable = !tagName;
  const effectiveName = isNameEditable ? name.trim().toLowerCase() : tagName;

  useEffect(() => {
    if (open) {
      setName('');
      setColor('');
      setParent(defaultParent || '');
      setSaving(false);
      setError('');
      if (isNameEditable) {
        requestAnimationFrame(() => nameInputRef.current?.focus());
      }
    }
  }, [open, defaultParent, isNameEditable]);

  // Parent-eligible: tags that are NOT children of another tag
  const parentOptions = useMemo(() => {
    if (!suggestions || !tagParents) return [];
    return suggestions.filter((tag) => !tagParents.has(tag) && tag !== effectiveName);
  }, [suggestions, tagParents, effectiveName]);

  const currentPreset = color ? resolveColor(color) : undefined;
  const previewStyle = currentPreset
    ? { backgroundColor: currentPreset.bgCss, color: getTagTextColor(currentPreset, theme) }
    : undefined;

  const canSubmit = effectiveName.length > 0 && effectiveName.length <= 100 && !saving;

  async function handleConfirm() {
    if (!activeLocationId || !effectiveName) return;
    setError('');
    const effectiveColor = color || '';
    const effectiveParent = parent || null;
    if (effectiveColor || effectiveParent || isNameEditable) {
      setSaving(true);
      try {
        await apiFetch('/api/tag-colors', {
          method: 'PUT',
          body: { locationId: activeLocationId, tag: effectiveName, color: effectiveColor, parentTag: effectiveParent },
        });
        notify(Events.TAG_COLORS);
      } catch (err) {
        setSaving(false);
        setError(err instanceof Error ? err.message : t('create.failed', { defaultValue: 'Failed to create tag' }));
        return;
      }
      setSaving(false);
    }
    onConfirm(isNameEditable ? effectiveName : undefined);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('create.title', { defaultValue: 'Create new tag' })}</DialogTitle>
          <DialogDescription>
            {isNameEditable
              ? t('create.descriptionNew', { defaultValue: 'Set up a tag with a color and optional parent grouping.' })
              : t('create.descriptionExisting', { defaultValue: 'Choose a color and optional parent for this tag.' })}
          </DialogDescription>
        </DialogHeader>

        {isNameEditable ? (
          <div className="space-y-2">
            <Label htmlFor="create-tag-name">{t('create.name', { defaultValue: 'Name' })}</Label>
            <Input
              ref={nameInputRef}
              id="create-tag-name"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter' && canSubmit) handleConfirm(); }}
              placeholder={t('create.namePlaceholder', { defaultValue: 'e.g. electronics' })}
              maxLength={100}
              autoFocus
            />
            {effectiveName ? (
              <div className="flex items-center gap-2">
                <span className={categoryHeader}>{t('create.preview', { defaultValue: 'Preview' })}</span>
                <Badge variant="secondary" className="text-[13px]" style={previewStyle}>
                  {effectiveName}
                </Badge>
              </div>
            ) : (
              <p className="text-[12px] text-[var(--text-tertiary)]">
                {t('create.lowercaseHint', { defaultValue: 'Tag names are stored in lowercase.' })}
              </p>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className={categoryHeader}>{t('create.preview', { defaultValue: 'Preview' })}</span>
            <Badge variant="secondary" className="text-[13px]" style={previewStyle}>
              {tagName}
            </Badge>
          </div>
        )}

        <div className="space-y-2">
          <Label>{t('create.color', { defaultValue: 'Color' })}</Label>
          <HueGradientPicker value={color} onChange={setColor} />
        </div>

        {parentOptions.length > 0 && (
          <div className="space-y-2">
            <Label>{t('create.parent', { defaultValue: 'Parent' })}</Label>
            <select
              value={parent}
              onChange={(e) => setParent(e.target.value)}
              className={cn(inputBase, 'h-10 focus-visible:ring-2 focus-visible:ring-[var(--accent)]')}
            >
              <option value="">{t('create.none', { defaultValue: 'None' })}</option>
              {parentOptions.map((tag) => (
                <option key={tag} value={tag}>{tag}</option>
              ))}
            </select>
            {parent && (
              <p className="text-[12px] text-[var(--text-tertiary)]">
                <Trans
                  t={t}
                  i18nKey="create.groupedUnder"
                  defaults="Will be grouped under: <strong>{{parent}}</strong>"
                  values={{ parent }}
                  components={{ strong: <span className="font-medium text-[var(--text-secondary)]" /> }}
                />
              </p>
            )}
          </div>
        )}

        {error && (
          <p className="text-[13px] text-[var(--destructive)]">{error}</p>
        )}

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>{t('common:actions.cancel', { defaultValue: 'Cancel' })}</Button>
          <Button onClick={handleConfirm} disabled={!canSubmit}>
            {saving ? t('create.creating', { defaultValue: 'Creating…' }) : t('create.create', { defaultValue: 'Create' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
