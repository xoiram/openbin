import { GripVertical, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { useTerminology } from '@/lib/terminology';
import { getErrorMessage } from '@/lib/utils';
import {
  addCustomField,
  deleteCustomField,
  updateCustomField,
  useCustomFields,
} from './useCustomFields';

interface CustomFieldsDialogProps {
  locationId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CustomFieldsDialog({ locationId, open, onOpenChange }: CustomFieldsDialogProps) {
  const { t } = useTranslation('bins');
  const term = useTerminology();
  const { fields } = useCustomFields(open ? locationId : null);
  const { showToast } = useToast();
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  useEffect(() => {
    if (open) {
      setNewName('');
      setEditingId(null);
    }
  }, [open]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!locationId || !newName.trim()) return;
    setAdding(true);
    try {
      await addCustomField(locationId, newName.trim());
      setNewName('');
    } catch (err) {
      showToast({ message: getErrorMessage(err, t('customFields.addFailed', { defaultValue: 'Failed to add field' })), variant: 'error' });
    } finally {
      setAdding(false);
    }
  }

  async function handleRename(fieldId: string) {
    if (!locationId || !editName.trim()) return;
    try {
      await updateCustomField(locationId, fieldId, { name: editName.trim() });
      setEditingId(null);
    } catch (err) {
      showToast({ message: getErrorMessage(err, t('customFields.renameFailed', { defaultValue: 'Failed to rename field' })), variant: 'error' });
    }
  }

  async function handleDelete(fieldId: string, fieldName: string) {
    if (!locationId) return;
    try {
      await deleteCustomField(locationId, fieldId);
      showToast({ message: t('customFields.deleted', { defaultValue: 'Deleted "{{name}}"', name: fieldName }), variant: 'success' });
    } catch (err) {
      showToast({ message: getErrorMessage(err, t('customFields.deleteFailed', { defaultValue: 'Failed to delete field' })), variant: 'error' });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('customFields.title', { defaultValue: 'Custom Fields' })}</DialogTitle>
          <DialogDescription>
            {t('customFields.description', { defaultValue: 'Define custom fields that appear on all {{bins}} in this {{location}}.', bins: term.bins, location: term.location })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {fields.length === 0 && (
            <p className="text-[13px] text-[var(--text-tertiary)] py-2">
              {t('customFields.empty', { defaultValue: 'No custom fields yet. Add one below.' })}
            </p>
          )}

          {fields.map((field) => (
            <div key={field.id} className="row">
              <GripVertical className="h-4 w-4 text-[var(--text-tertiary)] shrink-0 opacity-40" />
              {editingId === field.id ? (
                <form
                  className="flex-1 row"
                  onSubmit={(e) => { e.preventDefault(); handleRename(field.id); }}
                >
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    maxLength={100}
                    autoFocus
                    className="h-8 text-[14px]"
                  />
                  <Button type="submit" size="icon-sm" variant="ghost" className="shrink-0" disabled={!editName.trim()} aria-label={t('customFields.saveName', { defaultValue: 'Save name' })}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button type="button" size="icon-sm" variant="ghost" className="shrink-0" onClick={() => setEditingId(null)} aria-label={t('customFields.cancelEdit', { defaultValue: 'Cancel editing' })}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </form>
              ) : (
                <>
                  <span className="flex-1 text-[14px] text-[var(--text-primary)] truncate">
                    {field.name}
                  </span>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="shrink-0"
                    onClick={() => { setEditingId(field.id); setEditName(field.name); }}
                    aria-label={t('customFields.rename', { defaultValue: 'Rename {{name}}', name: field.name })}
                  >
                    <Pencil className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="shrink-0"
                    onClick={() => handleDelete(field.id, field.name)}
                    aria-label={t('customFields.delete', { defaultValue: 'Delete {{name}}', name: field.name })}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-[var(--destructive)]" />
                  </Button>
                </>
              )}
            </div>
          ))}

          <form onSubmit={handleAdd} className="row pt-2 border-t border-[var(--border-subtle)]">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t('customFields.newPlaceholder', { defaultValue: 'New field name' })}
              maxLength={100}
              className="h-8 text-[14px]"
            />
            <Button type="submit" size="sm" disabled={!newName.trim() || adding} className="shrink-0">
              <Plus className="h-3.5 w-3.5 mr-1" />
              {t('customFields.add', { defaultValue: 'Add' })}
            </Button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
