import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/lib/auth';
import { usePermissions } from '@/lib/usePermissions';
import { filterCategories, localizeCategory } from './settingsCategories';

export function useSettingsCategories() {
  const { user } = useAuth();
  const { isAdmin } = usePermissions();
  const { t } = useTranslation('settings');

  const isSiteAdmin = !!user?.isAdmin;
  const isEE = typeof __EE__ !== 'undefined' && __EE__;

  const categories = useMemo(
    () => filterCategories({ isAdmin, isEE, isSiteAdmin }).map((c) => localizeCategory(c, t)),
    [isAdmin, isEE, isSiteAdmin, t],
  );

  const mainCategories = useMemo(
    () => categories.filter((c) => !c.adminSection),
    [categories],
  );

  const adminCategories = useMemo(
    () => categories.filter((c) => c.adminSection),
    [categories],
  );

  return { categories, mainCategories, adminCategories };
}
