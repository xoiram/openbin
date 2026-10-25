import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { OVERRIDE_FIELDS, useAdminLabels } from './adminUserDetailConstants';
import type { AdminUserOverrides } from './useAdminUserOverrides';

interface AdminUserOverridesCardProps {
  overrides: AdminUserOverrides;
}

export function AdminUserOverridesCard({ overrides }: AdminUserOverridesCardProps) {
  const { t } = useTranslation('admin');
  const labels = useAdminLabels();
  return (
    <Card>
      <CardHeader><CardTitle>{t('detail.overrides.title', { defaultValue: 'Limit Overrides' })}</CardTitle></CardHeader>
      <CardContent>
        <p className="text-[13px] text-[var(--text-tertiary)] mb-3">
          {t('detail.overrides.description', { defaultValue: 'Override plan limits for this user. Leave blank to use plan defaults.' })}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {OVERRIDE_FIELDS.map(({ key, htmlId }) => (
            <FormField key={key} label={labels.overrideField[key]} htmlFor={htmlId}>
              <Input
                id={htmlId}
                type="number"
                min={0}
                placeholder={t('detail.overrides.placeholder', { defaultValue: 'Plan default' })}
                value={overrides.overrides[key] ?? ''}
                onChange={(e) =>
                  overrides.setOverrides((o) => ({ ...o, [key]: e.target.value ? Number(e.target.value) : null }))
                }
                className="h-8 text-[14px]"
              />
            </FormField>
          ))}
        </div>
        <div className="flex items-center gap-2 mt-4">
          <Button size="sm" onClick={overrides.handleSaveOverrides} disabled={overrides.savingOverrides}>
            {overrides.savingOverrides
              ? t('detail.overrides.saving', { defaultValue: 'Saving...' })
              : t('detail.overrides.save', { defaultValue: 'Save Overrides' })}
          </Button>
          <Button variant="outline" size="sm" onClick={overrides.handleClearOverrides}>{t('detail.overrides.clearAll', { defaultValue: 'Clear All' })}</Button>
        </div>
      </CardContent>
    </Card>
  );
}
