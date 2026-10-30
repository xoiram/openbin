import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRelativeTime } from '@/features/activity/useRelativeTime';
import { useScanHistory } from '@/features/dashboard/scanHistory';
import { batchRenderIconDataURLs } from '@/features/print/iconToDataUrl';
import { BinUsageSection } from '@/features/usage/BinUsageSection';
import { resolveColor } from '@/lib/colorPalette';
import { generateQRDataURL } from '@/lib/qr';
import { sectionHeader, sectionHeaderRow } from '@/lib/utils';
import type { Bin } from '@/types';
import { BinDetailActivitySection } from './BinDetailActivitySection';

interface BinDetailInformationTabProps {
  bin: Bin;
}

const QR_FG = '#000';
const QR_BG_FALLBACK = '#fff';
// Render QR at a high resolution and let CSS downscale; keeps dots crisp and
// makes the library's integer-rounding leftover (proportional margin) negligible.
const QR_GEN_SIZE = 540;

export function BinDetailInformationTab({ bin }: BinDetailInformationTabProps) {
  const { t, i18n } = useTranslation('bins');
  const relativeTime = useRelativeTime();
  const colorPreset = useMemo(
    () => (bin.color ? resolveColor(bin.color) : null),
    [bin.color],
  );
  const cardBg = colorPreset?.bg ?? QR_BG_FALLBACK;
  const [qrUrl, setQrUrl] = useState('');
  const { history } = useScanHistory(50);
  const lastScan = useMemo(
    () => history.find((entry) => entry.binId === bin.id),
    [history, bin.id],
  );

  useEffect(() => {
    let cancelled = false;
    // The icon is embedded in the QR so the modules behind it are cleared on the grid.
    const iconPromise = bin.icon
      ? batchRenderIconDataURLs([bin.icon]).then((m) => m.get(bin.icon))
      : Promise.resolve(undefined);
    iconPromise
      .then((icon) => generateQRDataURL(bin.id, QR_GEN_SIZE, { dark: QR_FG, light: cardBg }, icon))
      .then((url) => {
        if (!cancelled) setQrUrl(url);
      });
    return () => {
      cancelled = true;
    };
  }, [bin.id, bin.icon, cardBg]);

  const createdAbsolute = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }).format(new Date(bin.created_at)),
    [bin.created_at, i18n.language],
  );

  return (
    <div className="flex flex-col gap-8">
      <section>
        <header className={sectionHeaderRow}>
          <h3 className={sectionHeader}>{t('infoTab.details', { defaultValue: 'Details' })}</h3>
        </header>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 items-start md:gap-8">
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-2.5 text-[13px] self-start">
            {bin.created_by_name && (
              <>
                <dt className="text-[var(--text-tertiary)]">{t('infoTab.creator', { defaultValue: 'Creator' })}</dt>
                <dd className="text-[var(--text-primary)]">{bin.created_by_name}</dd>
              </>
            )}

            <dt className="text-[var(--text-tertiary)]">{t('infoTab.created', { defaultValue: 'Created' })}</dt>
            <dd className="text-[var(--text-primary)]">{createdAbsolute}</dd>

            <dt className="text-[var(--text-tertiary)]">{t('infoTab.updated', { defaultValue: 'Updated' })}</dt>
            <dd className="text-[var(--text-primary)]">{relativeTime(bin.updated_at)}</dd>

            <dt className="text-[var(--text-tertiary)]">{t('infoTab.lastScanned', { defaultValue: 'Last scanned' })}</dt>
            <dd className="text-[var(--text-primary)]">
              {lastScan ? relativeTime(lastScan.scannedAt) : t('infoTab.never', { defaultValue: 'Never' })}
            </dd>
          </dl>

          <div
            className="p-[4px] md:p-[6px]"
            style={{
              backgroundColor: cardBg,
              borderRadius: 'var(--radius-lg)',
              border: colorPreset ? 'none' : '1px solid var(--border-flat)',
            }}
          >
            <div className="relative w-[80px] h-[80px] md:w-[108px] md:h-[108px]">
              {qrUrl && (
                <img
                  src={qrUrl}
                  alt={t('infoTab.qrAlt', { defaultValue: 'QR code for {{name}}', name: bin.name })}
                  className="w-full h-full block"
                />
              )}
            </div>
          </div>
        </div>
      </section>

      <BinDetailActivitySection binId={bin.id} />

      <section>
        <header className={sectionHeaderRow}>
          <h3 className={sectionHeader}>{t('infoTab.usage', { defaultValue: 'Usage' })}</h3>
        </header>
        <BinUsageSection binId={bin.id} />
      </section>
    </div>
  );
}
