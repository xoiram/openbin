import { CornerDownRight } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { Bin } from '@/types';

interface ParentBinLabelProps {
  bin: Pick<Bin, 'parent_bin_id' | 'parent_bin_name'>;
  className?: string;
  style?: CSSProperties;
}

/** "inside {parent}" line for a nested box. Renders nothing for top-level boxes. */
export function ParentBinLabel({ bin, className, style }: ParentBinLabelProps) {
  const { t } = useTranslation('bins');
  if (!bin.parent_bin_id) return null;
  const text = t('nestedList.inside', { defaultValue: 'inside {{parent}}', parent: bin.parent_bin_name || '…' });
  return (
    <span
      data-testid="parent-bin-label"
      className={cn('flex items-center gap-1 min-w-0 text-[var(--text-tertiary)]', className)}
      style={style}
      title={text}
    >
      <CornerDownRight aria-hidden="true" className="h-3 w-3 shrink-0" />
      <span className="truncate">{text}</span>
    </span>
  );
}
