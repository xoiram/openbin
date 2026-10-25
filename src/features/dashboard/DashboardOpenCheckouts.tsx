import { PackageSearch, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { BinIconBadge } from '@/components/ui/bin-icon-badge';
import { Tooltip } from '@/components/ui/tooltip';
import { useRelativeTime } from '@/features/activity/useRelativeTime';
import { ReturnItemDialog } from '@/features/checkouts/ReturnItemDialog';
import { resolveColor } from '@/lib/colorPalette';
import { resolveIcon } from '@/lib/iconMap';
import { usePermissions } from '@/lib/usePermissions';
import { cn, flatCard } from '@/lib/utils';
import type { ItemCheckoutWithContext } from '@/types';
import { SectionHeader } from './DashboardWidgets';

const VISIBLE_LIMIT = 3;

interface DashboardOpenCheckoutsProps {
  checkouts: ItemCheckoutWithContext[];
  showTimestamps?: boolean;
}

export function DashboardOpenCheckouts({ checkouts, showTimestamps = true }: DashboardOpenCheckoutsProps) {
  const navigate = useNavigate();
  const { t } = useTranslation('dashboard');
  const relativeTime = useRelativeTime();
  const { canWrite } = usePermissions();
  const [returning, setReturning] = useState<ItemCheckoutWithContext | null>(null);

  if (checkouts.length === 0) return null;

  const rows = checkouts.slice(0, VISIBLE_LIMIT);
  const overflow = checkouts.length - rows.length;

  return (
    <section aria-labelledby="dash-checkouts" className="flex flex-col gap-2">
      <SectionHeader
        id="dash-checkouts"
        icon={PackageSearch}
        title={t('checkouts.title', { defaultValue: 'Checked out ({{n}})', n: checkouts.length })}
        action={overflow > 0 ? { label: t('viewAll', { defaultValue: 'View all' }), onClick: () => navigate('/checkouts') } : undefined}
      />
      <div className={cn(flatCard, 'p-2')}>
        <ul className="flex flex-col">
          {rows.map((co) => {
            const hasBin = co.origin_bin_id != null;
            const Icon = resolveIcon(co.origin_bin_icon ?? '');
            const colorPreset = resolveColor(co.origin_bin_color ?? '');
            const originName = co.origin_bin_name ?? co.origin_area_name;
            const openOrigin = () => {
              // Checkouts from an area (or nowhere) have no box page to open.
              if (co.origin_bin_id) navigate(`/bin/${co.origin_bin_id}`);
            };
            return (
              <li key={co.id}>
                {/* biome-ignore lint/a11y/useSemanticElements: row contains a nested Return button; native <button> nesting is invalid */}
                <div
                  role="button"
                  tabIndex={0}
                  aria-label={originName
                    ? t('checkouts.rowLabel', {
                        defaultValue: '{{item}} checked out by {{user}} from {{bin}}',
                        item: co.item_name,
                        user: co.checked_out_by_name,
                        bin: originName,
                      })
                    : t('checkouts.rowLabelUnassigned', {
                        defaultValue: '{{item}} checked out by {{user}}, unassigned',
                        item: co.item_name,
                        user: co.checked_out_by_name,
                      })}
                  onClick={openOrigin}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openOrigin();
                    }
                  }}
                  className="group w-full flex items-center gap-3 px-2.5 py-2 min-h-[52px] rounded-[var(--radius-sm)] cursor-pointer outline-none transition-colors duration-150 hover:bg-[var(--bg-hover)] active:bg-[var(--bg-active)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                >
                  {hasBin && <BinIconBadge icon={Icon} colorPreset={colorPreset} />}
                  <div className="flex-1 min-w-0">
                    <p className="text-[13.5px] font-medium text-[var(--text-primary)] truncate leading-snug">
                      {co.item_name}
                    </p>
                    <p className="text-[11.5px] text-[var(--text-tertiary)] truncate leading-snug">
                      <span className="text-[var(--text-secondary)]">{co.checked_out_by_name}</span>
                      <span aria-hidden> · </span>
                      {originName ?? <span className="italic">{t('checkouts.unassigned', { defaultValue: 'Unassigned' })}</span>}
                    </p>
                  </div>
                  {showTimestamps && (
                    <span className="text-[11px] text-[var(--text-tertiary)] tabular-nums shrink-0">
                      {relativeTime(co.checked_out_at)}
                    </span>
                  )}
                  {canWrite && (
                    <Tooltip content={t('checkouts.returnItem', { defaultValue: 'Return item' })}>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setReturning(co); }}
                        aria-label={t('checkouts.returnNamed', { defaultValue: 'Return {{item}}', item: co.item_name })}
                        className="shrink-0 h-9 w-9 -my-1 flex items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-tertiary)] hover:bg-[var(--bg-active)] hover:text-[var(--text-primary)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                      >
                        <Undo2 className="h-4 w-4" />
                      </button>
                    </Tooltip>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {returning && (
        <ReturnItemDialog
          open
          onOpenChange={(next) => { if (!next) setReturning(null); }}
          itemName={returning.item_name}
          binId={returning.origin_bin_id}
          locationId={returning.location_id}
          itemId={returning.item_id}
          originBinName={returning.origin_bin_name ?? returning.origin_area_name ?? undefined}
        />
      )}
    </section>
  );
}
