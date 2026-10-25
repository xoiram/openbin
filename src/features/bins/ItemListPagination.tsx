import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getPageNumbers } from '@/lib/paginationUtil';
import { cn } from '@/lib/utils';

interface ItemListPaginationProps {
  page: number;
  totalPages: number;
  totalCount: number;
  rangeStart: number;
  rangeEnd: number;
  onPageChange: (p: number) => void;
}

/**
 * Compact in-card pagination footer for ItemList: summary left, pager right,
 * single horizontal row. The page-size preference lives in Settings → Preferences → Display.
 */
export function ItemListPagination({
  page,
  totalPages,
  totalCount,
  rangeStart,
  rangeEnd,
  onPageChange,
}: ItemListPaginationProps) {
  const { t } = useTranslation('bins');
  if (totalPages <= 1) return null;

  const pages = getPageNumbers(page, totalPages);

  const navBtn =
    'flex items-center justify-center h-7 w-7 rounded-[var(--radius-xs)] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]';

  return (
    <nav
      aria-label={t('itemPagination.label', { defaultValue: 'Pagination' })}
      className="flex items-center justify-between gap-3 px-3.5 py-1.5 border-t border-[var(--border-subtle)] bg-[var(--bg-hover)]"
    >
      <span className="text-[12px] text-[var(--text-tertiary)] tabular-nums">
        {t('itemPagination.summary', {
          count: totalCount,
          start: rangeStart,
          end: rangeEnd,
          defaultValue_one: '{{start}}–{{end}} of {{count}} item',
          defaultValue_other: '{{start}}–{{end}} of {{count}} items',
        })}
      </span>

      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label={t('itemPagination.previous', { defaultValue: 'Previous page' })}
          className={cn(
            navBtn,
            page <= 1
              ? 'text-[var(--text-tertiary)] cursor-not-allowed opacity-40'
              : 'text-[var(--text-secondary)] hover:bg-[var(--bg-active)]',
          )}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>

        <div className="hidden sm:flex items-center gap-0.5">
          {pages.map((p, i) =>
            p === 'ellipsis' ? (
              // biome-ignore lint/suspicious/noArrayIndexKey: ellipsis separators have no stable identity
              <span key={`e${i}`} aria-hidden="true" className="flex items-center justify-center h-7 w-7 text-[12px] text-[var(--text-tertiary)]">
                &hellip;
              </span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => onPageChange(p)}
                aria-label={t('itemPagination.page', { defaultValue: 'Page {{page}}', page: p })}
                aria-current={p === page ? 'page' : undefined}
                className={cn(
                  'flex items-center justify-center h-7 min-w-7 px-1.5 rounded-[var(--radius-xs)] text-[12px] font-medium tabular-nums transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]',
                  p === page
                    ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-flat)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-active)]',
                )}
              >
                {p}
              </button>
            ),
          )}
        </div>

        <span className="sm:hidden px-2 text-[12px] text-[var(--text-tertiary)] tabular-nums">
          <span className="sr-only">
            {t('itemPagination.pageOf', { defaultValue: 'Page {{page}} of {{total}}', page, total: totalPages })}
          </span>
          <span aria-hidden="true">{page} / {totalPages}</span>
        </span>

        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          aria-label={t('itemPagination.next', { defaultValue: 'Next page' })}
          className={cn(
            navBtn,
            page >= totalPages
              ? 'text-[var(--text-tertiary)] cursor-not-allowed opacity-40'
              : 'text-[var(--text-secondary)] hover:bg-[var(--bg-active)]',
          )}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </nav>
  );
}
