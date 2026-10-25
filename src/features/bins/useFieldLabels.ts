import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { FieldKey } from './useColumnVisibility';

/** Localized display labels for the static bin field keys (see FIELD_LABELS for the English source). */
export function useFieldLabels(): Record<FieldKey, string> {
  const { t } = useTranslation('bins');
  return useMemo(
    () => ({
      icon: t('fields.icon', { defaultValue: 'Icon' }),
      area: t('fields.area', { defaultValue: 'Area' }),
      items: t('fields.items', { defaultValue: 'Items' }),
      tags: t('fields.tags', { defaultValue: 'Tags' }),
      updated: t('fields.updated', { defaultValue: 'Updated' }),
      created: t('fields.created', { defaultValue: 'Created' }),
      notes: t('fields.notes', { defaultValue: 'Notes' }),
      createdBy: t('fields.createdBy', { defaultValue: 'Created By' }),
      customFields: t('fields.customFields', { defaultValue: 'Custom Fields' }),
    }),
    [t],
  );
}
