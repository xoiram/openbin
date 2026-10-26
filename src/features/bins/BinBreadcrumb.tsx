import { ChevronRight } from 'lucide-react';
import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { focusRing } from '@/lib/utils';
import type { Bin } from '@/types';

interface BinBreadcrumbProps {
  bin: Pick<Bin, 'name' | 'area_name' | 'parent_bin_id' | 'parent_bin_name'>;
}

/** `Area › Parent box › This box`. Segments that don't exist are left out; nothing renders without a path. */
export function BinBreadcrumb({ bin }: BinBreadcrumbProps) {
  const { t } = useTranslation('bins');
  const hasParent = !!bin.parent_bin_id;
  if (!bin.area_name && !hasParent) return null;

  const segments: { key: string; node: React.ReactNode }[] = [];
  if (bin.area_name) {
    segments.push({ key: 'area', node: <span>{bin.area_name}</span> });
  }
  if (hasParent) {
    segments.push({
      key: 'parent',
      node: (
        <Link
          to={`/bin/${bin.parent_bin_id}`}
          className={`rounded-[var(--radius-xs)] text-[var(--text-secondary)] underline-offset-2 hover:text-[var(--text-primary)] hover:underline ${focusRing}`}
        >
          {bin.parent_bin_name || '…'}
        </Link>
      ),
    });
  }
  segments.push({ key: 'self', node: <span aria-current="page" className="text-[var(--text-primary)]">{bin.name}</span> });

  return (
    <nav aria-label={t('nesting.breadcrumb', { defaultValue: 'Location path' })} className="mt-1 mb-2">
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-[13px] text-[var(--text-tertiary)]">
        {segments.map((s, i) => (
          <Fragment key={s.key}>
            {i > 0 && <ChevronRight className="h-3 w-3 shrink-0" aria-hidden="true" />}
            <li className="min-w-0 truncate">{s.node}</li>
          </Fragment>
        ))}
      </ol>
    </nav>
  );
}
