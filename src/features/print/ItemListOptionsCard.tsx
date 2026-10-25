import {
  CheckSquare,
  ChevronDown,
  Edit3,
  Hash,
  LayoutList,
  ListOrdered,
  type LucideIcon,
  MapPin,
  Palette,
  PlusSquare,
  QrCode,
  Rows,
  StickyNote,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useTerminology } from '@/lib/terminology';
import { cn } from '@/lib/utils';
import { CopiesStepper } from './CopiesStepper';
import type { ItemListOptions } from './usePrintSettings';

interface ItemListOptionsCardProps {
  options: ItemListOptions;
  onUpdate: <K extends keyof ItemListOptions>(key: K, value: ItemListOptions[K]) => void;
  expanded: boolean;
  onExpandedChange: (v: boolean) => void;
}

export function ItemListOptionsCard({ options, onUpdate, expanded, onExpandedChange }: ItemListOptionsCardProps) {
  const { t } = useTranslation('print');
  const term = useTerminology();

  // `as const` narrows each `key` to its literal type so onUpdate's generic K
  // resolves per-row and type inference works without casts.
  const headerRows = [
    { key: 'showQrCode', label: t('itemList.showQrCode', { defaultValue: 'QR code' }), icon: QrCode },
    { key: 'showIcon', label: t('itemList.showIcon', { defaultValue: 'Icon & color' }), icon: Palette },
    { key: 'showAreaPath', label: t('itemList.showAreaPath', { defaultValue: '{{area}} path', area: term.Area }), icon: MapPin },
    { key: 'showBinCode', label: t('itemList.showBinCode', { defaultValue: '{{bin}} code', bin: term.Bin }), icon: Hash },
    { key: 'showItemCount', label: t('itemList.showItemCount', { defaultValue: 'Item count' }), icon: ListOrdered },
  ] as const;

  const contentRows = [
    { key: 'showCheckboxes', label: t('itemList.showCheckboxes', { defaultValue: 'Checkboxes' }), icon: CheckSquare },
    { key: 'showQuantity', label: t('itemList.showQuantity', { defaultValue: 'Quantity' }), icon: Hash },
    { key: 'showNotesColumn', label: t('itemList.showNotesColumn', { defaultValue: 'Write-in notes column' }), icon: Edit3 },
    { key: 'showBinNotes', label: t('itemList.showBinNotes', { defaultValue: '{{bin}} notes', bin: term.Bin }), icon: StickyNote },
  ] as const;

  const layoutRows = [
    { key: 'zebraStripes', label: t('itemList.zebraStripes', { defaultValue: 'Alternating row shading' }), icon: Rows },
  ] as const;

  const renderRow = <K extends 'showQrCode' | 'showIcon' | 'showAreaPath' | 'showBinCode' | 'showItemCount' | 'showCheckboxes' | 'showQuantity' | 'showNotesColumn' | 'showBinNotes' | 'zebraStripes'>({
    key,
    label,
    icon: Icon,
  }: { key: K; label: string; icon: LucideIcon }) => (
    <label
      key={key}
      htmlFor={`item-opt-${key}`}
      className="flex items-center gap-3 px-2 py-1.5 cursor-pointer rounded-[var(--radius-sm)] hover:bg-[var(--bg-hover)] transition-colors"
    >
      <Checkbox
        id={`item-opt-${key}`}
        checked={options[key]}
        onCheckedChange={(checked) => onUpdate(key, !!checked)}
      />
      <Icon className="h-4 w-4 text-[var(--text-tertiary)] shrink-0" />
      <span className="text-[15px] text-[var(--text-primary)]">{label}</span>
    </label>
  );

  return (
    <Card>
      <CardContent>
        <button
          type="button"
          className="row-spread w-full"
          aria-expanded={expanded}
          onClick={() => onExpandedChange(!expanded)}
        >
          <div className="row">
            <LayoutList className="h-4 w-4 text-[var(--text-tertiary)]" />
            <Label className="text-[15px] font-semibold text-[var(--text-primary)] pointer-events-none">{t('itemList.title', { defaultValue: 'List Options' })}</Label>
          </div>
          <ChevronDown className={cn(
            'h-5 w-5 text-[var(--text-tertiary)] transition-transform duration-200',
            expanded && 'rotate-180',
          )} />
        </button>

        {expanded && (
          <div className="mt-3 space-y-4">
            <Subsection title={t('itemList.sectionHeader', { defaultValue: 'Header' })}>{headerRows.map(renderRow)}</Subsection>
            <Subsection title={t('itemList.sectionContent', { defaultValue: 'Content' })}>{contentRows.map(renderRow)}</Subsection>
            <Subsection title={t('itemList.sectionLayout', { defaultValue: 'Layout' })}>{layoutRows.map(renderRow)}</Subsection>

            <CopiesStepper
              label={t('itemList.blankRows', { defaultValue: 'Blank rows at end' })}
              icon={PlusSquare}
              value={options.blankRowCount}
              onChange={(v) => onUpdate('blankRowCount', Math.max(0, Math.min(20, v)))}
              min={0}
              max={20}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Subsection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-1">
      <span className="text-[12px] text-[var(--text-secondary)] font-medium block mb-2">{title}</span>
      <div className="space-y-1">{children}</div>
    </div>
  );
}
