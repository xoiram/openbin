import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { STORAGE_KEYS } from '@/lib/storageKeys';

export type AdminFieldKey =
  | 'email' | 'role' | 'plan' | 'status'
  | 'bins' | 'locations' | 'storage' | 'created'
  | 'lastActive' | 'items' | 'photos' | 'scans30d'
  | 'aiCredits' | 'apiKeys' | 'apiRequests7d'
  | 'binPct' | 'storagePct' | 'binsCreated7d' | 'accountAge';

const DEFAULT_VISIBILITY: Record<AdminFieldKey, boolean> = {
  email: true, role: true, plan: true, status: true,
  bins: true, locations: true, storage: true, created: true,
  lastActive: false, items: false, photos: false, scans30d: false,
  aiCredits: false, apiKeys: false, apiRequests7d: false,
  binPct: false, storagePct: false, binsCreated7d: false, accountAge: false,
};

/** Localized labels for the column-visibility menu. */
export function useAdminFieldLabels(): Record<AdminFieldKey, string> {
  const { t } = useTranslation('admin');
  return useMemo(() => ({
    email: t('columns.email', { defaultValue: 'Email' }),
    role: t('columns.role', { defaultValue: 'Role' }),
    plan: t('columns.plan', { defaultValue: 'Plan' }),
    status: t('columns.status', { defaultValue: 'Status' }),
    bins: t('columns.bins', { defaultValue: 'Bins' }),
    locations: t('columns.locations', { defaultValue: 'Locations' }),
    storage: t('columns.storage', { defaultValue: 'Storage' }),
    created: t('columns.created', { defaultValue: 'Created' }),
    lastActive: t('columns.lastActive', { defaultValue: 'Last Active' }),
    items: t('columns.items', { defaultValue: 'Items' }),
    photos: t('columns.photos', { defaultValue: 'Photos' }),
    scans30d: t('columns.scans30d', { defaultValue: 'Scans (30d)' }),
    aiCredits: t('columns.aiCredits', { defaultValue: 'AI Credits' }),
    apiKeys: t('columns.apiKeys', { defaultValue: 'API Keys' }),
    apiRequests7d: t('columns.apiRequests7d', { defaultValue: 'API Reqs (7d)' }),
    binPct: t('columns.binPct', { defaultValue: 'Bin %' }),
    storagePct: t('columns.storagePct', { defaultValue: 'Storage %' }),
    binsCreated7d: t('columns.binsCreated7d', { defaultValue: 'New Bins (7d)' }),
    accountAge: t('columns.accountAge', { defaultValue: 'Age' }),
  }), [t]);
}

export const TOGGLEABLE_FIELDS: AdminFieldKey[] = [
  'email', 'role', 'bins', 'locations', 'storage', 'created',
  'lastActive', 'items', 'photos', 'scans30d',
  'aiCredits', 'apiKeys', 'apiRequests7d',
  'binPct', 'storagePct', 'binsCreated7d', 'accountAge',
];

function readStored(): Record<AdminFieldKey, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ADMIN_COLUMN_VISIBILITY);
    if (!raw) return { ...DEFAULT_VISIBILITY };
    return { ...DEFAULT_VISIBILITY, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_VISIBILITY };
  }
}

export function useAdminColumnVisibility() {
  const [visibility, setVisibility] = useState<Record<AdminFieldKey, boolean>>(readStored);

  const toggleField = useCallback((field: AdminFieldKey) => {
    setVisibility((prev) => {
      const next = { ...prev, [field]: !prev[field] };
      localStorage.setItem(STORAGE_KEYS.ADMIN_COLUMN_VISIBILITY, JSON.stringify(next));
      return next;
    });
  }, []);

  const isVisible = useCallback(
    (field: AdminFieldKey): boolean => visibility[field],
    [visibility],
  );

  const visibleCount = useMemo(
    () => TOGGLEABLE_FIELDS.filter((f) => visibility[f]).length,
    [visibility],
  );

  return { visibility, toggleField, isVisible, visibleCount };
}
