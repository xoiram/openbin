import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PASSWORD_CHECKS, type PasswordCheckKey, type PasswordCheckResult } from '@/lib/passwordStrength';
import { cn } from '@/lib/utils';

interface PasswordChecklistProps {
  checks: PasswordCheckResult;
}

export function PasswordChecklist({ checks }: PasswordChecklistProps) {
  const { t } = useTranslation('common');
  const labels: Record<PasswordCheckKey, string> = {
    length: t('password.checks.length', { defaultValue: 'At least 8 characters' }),
    uppercase: t('password.checks.uppercase', { defaultValue: 'Uppercase letter' }),
    lowercase: t('password.checks.lowercase', { defaultValue: 'Lowercase letter' }),
    digit: t('password.checks.digit', { defaultValue: 'Number' }),
  };
  return (
    <ul className="flex flex-col gap-1 text-[13px]" aria-label={t('password.requirements', { defaultValue: 'Password requirements' })}>
      {PASSWORD_CHECKS.map(({ key }) => (

        <li
          key={key}
          className="row-tight"
          aria-label={checks[key]
            ? t('password.checkMet', { defaultValue: '{{label}} — met', label: labels[key] })
            : t('password.checkNotMet', { defaultValue: '{{label}} — not met', label: labels[key] })}
        >
          {checks[key] ? (
            <Check className="h-3.5 w-3.5 text-[var(--accent)] shrink-0 animate-check-pop" aria-hidden="true" />
          ) : (
            <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-[var(--border-flat)]" aria-hidden="true" />
          )}
          <span className={cn(
            'transition-colors duration-200',
            checks[key] ? 'text-[var(--accent)]' : 'text-[var(--text-tertiary)]'
          )}>
            {labels[key]}
          </span>
        </li>
      ))}
    </ul>
  );
}
