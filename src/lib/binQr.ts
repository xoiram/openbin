import type { QrStyleOptions } from '@/features/print/usePrintSettings';
import { isDefaultQrStyle } from '@/features/print/usePrintSettings';
import { batchGenerateQRDataURLs, type QRColorOptions } from './qr';

interface BinQrOptions {
  /** Custom QR style; the plain generator is used when absent or default. Ignored when an icon badge is embedded. */
  style?: QrStyleOptions;
  colors?: Map<string, QRColorOptions>;
  /** Embed each bin's icon in a badge cut out of the QR centre (plain square modules, level H). */
  withIcon?: boolean;
}

/** The one place bin QR codes are rendered: picks the generator and embeds icons. Returns Map<binId, dataUrl>. */
export async function generateBinQRDataURLs(
  bins: Array<{ id: string; icon: string }>,
  size: number,
  { style, colors, withIcon }: BinQrOptions = {},
): Promise<Map<string, string>> {
  const ids = bins.map((b) => b.id);

  if (withIcon) {
    // Empty icon names are kept: resolveIcon falls back to the default icon, as the bin card does.
    const { generateBadgeQRDataURL } = await import('./qrBadgeRender');
    const results = new Map<string, string>();
    await Promise.all(
      bins.map(async (b) => {
        results.set(b.id, await generateBadgeQRDataURL(b.id, b.icon, size, colors?.get(b.id)));
      }),
    );
    return results;
  }

  if (!isDefaultQrStyle(style)) {
    const { batchGenerateStyledQRDataURLs } = await import('./styledQr');
    return batchGenerateStyledQRDataURLs(ids, size, style as QrStyleOptions, colors);
  }
  return batchGenerateQRDataURLs(ids, size, undefined, colors);
}
