import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { AdminUserDetail } from './useAdminUsers';

// Mirror of server/src/lib/planGate.ts — client can't import server code.
export const PLAN_CODE = { free: 2, plus: 0, pro: 1 } as const;
export const SUB_STATUS_CODE = { inactive: 0, active: 1, trial: 2 } as const;

export type PlanKey = keyof typeof PLAN_CODE;
export type SubStatusKey = keyof typeof SUB_STATUS_CODE;

const PLAN_KEYS: PlanKey[] = ['free', 'plus', 'pro'];
const SUB_STATUS_KEYS: SubStatusKey[] = ['inactive', 'trial', 'active'];

export type NumericOverrideKey =
  | 'maxBins'
  | 'maxLocations'
  | 'maxPhotoStorageMb'
  | 'maxMembersPerLocation'
  | 'aiCreditsPerMonth'
  | 'activityRetentionDays';

export const OVERRIDE_FIELDS: Array<{ key: NumericOverrideKey; htmlId: string }> = [
  { key: 'maxBins', htmlId: 'ov-bins' },
  { key: 'maxLocations', htmlId: 'ov-locs' },
  { key: 'maxPhotoStorageMb', htmlId: 'ov-storage' },
  { key: 'maxMembersPerLocation', htmlId: 'ov-members' },
  { key: 'aiCreditsPerMonth', htmlId: 'ov-ai' },
  { key: 'activityRetentionDays', htmlId: 'ov-retention' },
];

/** Localized display labels for plan tiers, subscription statuses and limit-override fields. */
export function useAdminLabels() {
  const { t } = useTranslation('admin');
  return useMemo(() => {
    const plan: Record<PlanKey, string> = {
      free: t('plans.free', { defaultValue: 'Free' }),
      plus: t('plans.plus', { defaultValue: 'Plus' }),
      pro: t('plans.pro', { defaultValue: 'Pro' }),
    };
    const status: Record<SubStatusKey, string> = {
      inactive: t('statuses.inactive', { defaultValue: 'Inactive' }),
      trial: t('statuses.trial', { defaultValue: 'Trial' }),
      active: t('statuses.active', { defaultValue: 'Active' }),
    };
    const overrideField: Record<NumericOverrideKey, string> = {
      maxBins: t('detail.overrides.fields.maxBins', { defaultValue: 'Max Bins' }),
      maxLocations: t('detail.overrides.fields.maxLocations', { defaultValue: 'Max Locations' }),
      maxPhotoStorageMb: t('detail.overrides.fields.maxPhotoStorageMb', { defaultValue: 'Photo Storage (MB)' }),
      maxMembersPerLocation: t('detail.overrides.fields.maxMembersPerLocation', { defaultValue: 'Members/Location' }),
      aiCreditsPerMonth: t('detail.overrides.fields.aiCreditsPerMonth', { defaultValue: 'AI Credits/Month' }),
      activityRetentionDays: t('detail.overrides.fields.activityRetentionDays', { defaultValue: 'Retention (days)' }),
    };
    return {
      plan,
      status,
      overrideField,
      planOptions: PLAN_KEYS.map((key) => ({ key, label: plan[key] })),
      statusOptions: SUB_STATUS_KEYS.map((key) => ({ key, label: status[key] })),
    };
  }, [t]);
}

export function isPendingDeletion(detail: Pick<AdminUserDetail, 'deletionScheduledAt'>): boolean {
  const scheduled = detail.deletionScheduledAt;
  return !!scheduled && new Date(scheduled).getTime() > Date.now();
}
