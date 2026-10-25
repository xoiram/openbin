import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

const sizeClasses = {
  xs: 'h-5 w-5 text-[10px]',
  sm: 'h-8 w-8 text-[13px]',
  md: 'h-9 w-9 text-[14px]',
  lg: 'h-24 w-24 text-[32px]',
  xl: 'h-28 w-28 text-[36px]',
} as const;

interface UserAvatarProps {
  avatarUrl?: string | null;
  displayName?: string;
  size?: keyof typeof sizeClasses;
  className?: string;
}

export function UserAvatar({ avatarUrl, displayName, size = 'sm', className }: UserAvatarProps) {
  const { t } = useTranslation('common');
  const initial = displayName?.[0]?.toUpperCase() ?? '?';
  const fallbackLabel = t('avatar.fallback', { defaultValue: 'User avatar' });

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={displayName ? t('avatar.alt', { defaultValue: "{{name}}'s avatar", name: displayName }) : fallbackLabel}
        className={cn('rounded-full object-cover shrink-0', sizeClasses[size], className)}
      />
    );
  }

  return (
    <div
      role="img"
      aria-label={displayName ?? fallbackLabel}
      className={cn(
        'rounded-full bg-[var(--bg-active)] flex items-center justify-center font-semibold text-[var(--text-secondary)] shrink-0',
        sizeClasses[size],
        className,
      )}
    >
      <span aria-hidden="true">{initial}</span>
    </div>
  );
}
