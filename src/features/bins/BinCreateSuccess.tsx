import { ChevronRight, CirclePlus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { AnimatedCheckmark } from '@/components/ui/animated-checkmark';
import { Button } from '@/components/ui/button';
import { ListItem } from '@/components/ui/list-item';
import { resolveColor } from '@/lib/colorPalette';
import { resolveIcon } from '@/lib/iconMap';
import { useTerminology } from '@/lib/terminology';
import { cn, stickyDialogFooter } from '@/lib/utils';

export interface CreatedBinInfo {
  id: string;
  name: string;
  icon: string;
  color: string;
  itemCount?: number;
}

interface BinCreateSuccessProps {
  createdBins: CreatedBinInfo[];
  onCreateAnother: () => void;
  onClose: () => void;
}

function StatsLine({ createdBins }: { createdBins: CreatedBinInfo[] }) {
  const { t } = useTranslation('bins');
  const term = useTerminology();
  const count = createdBins.length;
  const totalItems = createdBins.reduce((sum, b) => sum + (b.itemCount ?? 0), 0);

  if (count === 1) {
    const bin = createdBins[0];
    if (totalItems > 0) {
      return (
        <>
          {t('createSuccess.createdOneWithItems', {
            count: totalItems,
            defaultValue_one: 'Created {{name}} with {{count}} item',
            defaultValue_other: 'Created {{name}} with {{count}} items',
            name: bin.name,
          })}
        </>
      );
    }
    return <>{t('createSuccess.createdOne', { defaultValue: 'Created {{name}}', name: bin.name })}</>;
  }

  if (totalItems > 0) {
    return (
      <>
        {t('createSuccess.createdManyWithItems', {
          count: totalItems,
          defaultValue_one: 'Created {{bins}} ({{binCount}}) · {{count}} item',
          defaultValue_other: 'Created {{bins}} ({{binCount}}) · {{count}} items',
          bins: term.bins,
          binCount: count,
        })}
      </>
    );
  }
  return <>{t('createSuccess.createdMany', { defaultValue: 'Created {{count}} {{bins}}', count, bins: term.bins })}</>;
}

export function BinCreateSuccess({ createdBins, onCreateAnother, onClose }: BinCreateSuccessProps) {
  const { t } = useTranslation('bins');
  const term = useTerminology();
  const navigate = useNavigate();
  const showColor = createdBins.length > 1;

  function handleViewBin(binId: string) {
    onClose();
    navigate(`/bin/${binId}`, { state: { backLabel: term.Bins, backPath: '/bins' } });
  }

  return (
    <div className="flex flex-1 flex-col items-center gap-6">
      {/* Animated checkmark */}
      <div className="relative flex items-center justify-center">
        <AnimatedCheckmark />
      </div>

      {/* Heading + stats */}
      <div className="text-center scan-text-fade">
        <h2 className="text-xl font-bold text-[var(--text-primary)]">{t('createSuccess.allSet', { defaultValue: 'All set' })}</h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          <StatsLine createdBins={createdBins} />
        </p>
      </div>

      {/* Bin list */}
      <div className="w-full scan-text-fade-delay">
        <div className={createdBins.length > 1 ? 'flex flex-col gap-2 overflow-y-auto' : undefined} style={createdBins.length > 1 ? { maxHeight: 200 } : undefined}>
          {createdBins.map((bin) => (
            <BinRow key={bin.id} bin={bin} showColor={showColor} onViewBin={handleViewBin} />
          ))}
        </div>
      </div>

      {/* Action buttons */}
      <div className={cn('row-spread self-stretch', stickyDialogFooter, 'scan-text-fade-delay')}>
        <Button variant="ghost" onClick={onClose}>
          {t('createSuccess.done', { defaultValue: 'Done' })}
        </Button>
        <Button onClick={onCreateAnother}>
          <CirclePlus className="mr-2 h-4 w-4" />
          {t('createSuccess.createAnother', { defaultValue: 'Create another' })}
        </Button>
      </div>
    </div>
  );
}

export function BinRow({ bin, showColor, onViewBin }: { bin: CreatedBinInfo; showColor: boolean; onViewBin: (id: string) => void }) {
  const { t } = useTranslation('common');
  const Icon = resolveIcon(bin.icon);
  const colorPreset = showColor ? resolveColor(bin.color) : null;

  return (
    <ListItem
      interactive
      onClick={() => onViewBin(bin.id)}
      style={colorPreset ? { background: colorPreset.bgCss, boxShadow: 'none' } : { boxShadow: 'none' }}
    >
      <Icon className="h-5 w-5 shrink-0 text-[var(--text-secondary)]" />
      <span className="flex-1 truncate text-[var(--text-primary)] font-medium">{bin.name}</span>
      {showColor && (bin.itemCount ?? 0) > 0 && (
        <span className="text-xs text-[var(--text-tertiary)]">
          {t('itemCount', { count: bin.itemCount ?? 0, defaultValue_one: '{{count}} item', defaultValue_other: '{{count}} items' })}
        </span>
      )}
      <ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
    </ListItem>
  );
}
