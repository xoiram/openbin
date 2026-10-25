import { Check, ChevronLeft, ChevronRight, ChevronsUpDown } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '@/components/ui/tooltip';
import { getPageNumbers } from '@/lib/paginationUtil';
import { useClickOutside } from '@/lib/useClickOutside';
import { usePopover } from '@/lib/usePopover';
import { cn } from '@/lib/utils';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalCount?: number;
  pageSize?: number;
  /** Label for the item type, e.g. "bins" */
  itemLabel?: string;
  /** When provided with onPageSizeChange, renders a page-size dropdown */
  pageSizeOptions?: number[];
  onPageSizeChange?: (size: number) => void;
}

function PageSizeSelect({ value, options, onChange }: { value: number; options: number[]; onChange: (size: number) => void }) {
  const { visible, animating, close, toggle } = usePopover();
  const ref = useRef<HTMLDivElement>(null);
  const { t } = useTranslation('common');
  useClickOutside(ref, close);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={toggle}
        className="flex items-center gap-1 px-2.5 py-1.5 rounded-[var(--radius-sm)] text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
        aria-haspopup="listbox"
        aria-expanded={visible}
        aria-label={t('pagination.itemsPerPage', { defaultValue: 'Items per page' })}
      >
        {t('pagination.perPage', { defaultValue: '{{size}} per page', size: value })}
        <ChevronsUpDown className="h-3 w-3 text-[var(--text-tertiary)]" />
      </button>
      {visible && (
        <div
          role="listbox"
          className={cn(
            animating === 'exit' ? 'animate-popover-exit' : 'animate-popover-enter',
            'absolute bottom-full mb-1.5 right-0 z-50 rounded-[var(--radius-md)] flat-popover min-w-[100px] overflow-hidden',
          )}
        >
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              role="option"
              aria-selected={opt === value}
              onClick={() => { onChange(opt); close(); }}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors',
                opt === value
                  ? 'text-[var(--text-primary)] bg-[var(--bg-hover)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]',
              )}
            >
              <Check className={cn('h-3 w-3 shrink-0', opt === value ? 'text-[var(--accent)]' : 'invisible')} />
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  totalCount,
  pageSize,
  itemLabel,
  pageSizeOptions,
  onPageSizeChange,
}: PaginationProps) {
  const { t } = useTranslation('common');
  const pages = getPageNumbers(currentPage, totalPages);
  const previousLabel = t('pagination.previous', { defaultValue: 'Previous page' });
  const nextLabel = t('pagination.next', { defaultValue: 'Next page' });
  const showNav = totalPages > 1;

  const showSummary = totalCount != null && pageSize != null;
  const rangeStart = showSummary ? (currentPage - 1) * pageSize + 1 : 0;
  const rangeEnd = showSummary ? Math.min(currentPage * pageSize, totalCount as number) : 0;
  const showFooter = showSummary || (pageSizeOptions && onPageSizeChange);

  if (!showNav && !showFooter) return null;

  return (
    <nav aria-label={t('pagination.label', { defaultValue: 'Pagination' })} className="flex flex-col items-center gap-2 pt-4 pb-2">
      {showNav && (
        <div className="flex items-center gap-1">
          {/* Previous */}
          <Tooltip content={previousLabel}>
            <button
              type="button"
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage <= 1}
              aria-label={previousLabel}
              className={cn(
                'flex items-center justify-center h-11 w-11 rounded-[var(--radius-md)] text-sm transition-colors',
                currentPage <= 1
                  ? 'text-[var(--text-tertiary)] cursor-not-allowed opacity-40'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] active:bg-[var(--bg-active)]',
              )}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </Tooltip>

          {/* Page numbers — full on md+, simplified on mobile */}
          <div className="hidden sm:flex items-center gap-1">
            {pages.map((p, i) =>
              p === 'ellipsis' ? (
                // biome-ignore lint/suspicious/noArrayIndexKey: ellipsis separators have no stable identity
                <span key={`e${i}`} aria-hidden="true" className="flex items-center justify-center h-11 w-11 text-sm text-[var(--text-tertiary)]">
                  &hellip;
                </span>
              ) : (
                <button
                  key={p}
                  type="button"
                  onClick={() => onPageChange(p)}
                  aria-label={t('pagination.page', { defaultValue: 'Page {{page}}', page: p })}
                  aria-current={p === currentPage ? 'page' : undefined}
                  className={cn(
                    'flex items-center justify-center h-11 min-w-11 px-2 rounded-[var(--radius-md)] text-sm font-medium transition-colors',
                    p === currentPage
                      ? 'bg-[var(--bg-elevated)] dark:bg-[var(--bg-active)] border border-[var(--border-flat)] text-[var(--text-primary)] font-semibold'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] active:bg-[var(--bg-active)]',
                  )}
                >
                  {p}
                </button>
              ),
            )}
          </div>

          {/* Mobile: page X of Y */}
          <span className="flex sm:hidden items-center px-3 text-sm text-[var(--text-secondary)]">
            <span className="sr-only">
              {t('pagination.pageOf', { defaultValue: 'Page {{page}} of {{total}}', page: currentPage, total: totalPages })}
            </span>
            <span aria-hidden="true">{currentPage} / {totalPages}</span>
          </span>

          {/* Next */}
          <Tooltip content={nextLabel}>
            <button
              type="button"
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage >= totalPages}
              aria-label={nextLabel}
              className={cn(
                'flex items-center justify-center h-11 w-11 rounded-[var(--radius-md)] text-sm transition-colors',
                currentPage >= totalPages
                  ? 'text-[var(--text-tertiary)] cursor-not-allowed opacity-40'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] active:bg-[var(--bg-active)]',
              )}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </Tooltip>
        </div>
      )}

      {/* Summary + page size */}
      {showFooter && (
        <div className="flex items-center gap-3 text-xs text-[var(--text-tertiary)]">
          {showSummary && (
            <span>
              {t('pagination.summary', {
                defaultValue: 'Showing {{start}}–{{end}} of {{total}} {{label}}',
                start: rangeStart,
                end: rangeEnd,
                total: totalCount,
                label: itemLabel ?? t('pagination.defaultItemLabel', { defaultValue: 'items' }),
              })}
            </span>
          )}
          {pageSizeOptions && onPageSizeChange && pageSize != null && (
            <PageSizeSelect value={pageSize} options={pageSizeOptions} onChange={onPageSizeChange} />
          )}
        </div>
      )}
    </nav>
  );
}
