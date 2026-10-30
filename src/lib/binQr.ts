import { batchRenderIconDataURLs } from '@/features/print/iconToDataUrl';
import type { QrStyleOptions } from '@/features/print/usePrintSettings';
import { isDefaultQrStyle } from '@/features/print/usePrintSettings';
import { batchGenerateQRDataURLs, type QRColorOptions } from './qr';

interface BinQrOptions {
  /** Custom QR style; the plain generator is used when absent or default. */
  style?: QrStyleOptions;
  colors?: Map<string, QRColorOptions>;
  /** Embed each bin's icon in the QR centre (modules behind it are cleared). */
  withIcon?: boolean;
}

/** The one place bin QR codes are rendered: picks the generator and embeds icons. Returns Map<binId, dataUrl>. */
export async function generateBinQRDataURLs(
  bins: Array<{ id: string; icon: string }>,
  size: number,
  { style, colors, withIcon }: BinQrOptions = {},
): Promise<Map<string, string>> {
  const ids = bins.map((b) => b.id);

  let icons: Map<string, string> | undefined;
  if (withIcon) {
    const byName = await batchRenderIconDataURLs(bins.map((b) => b.icon).filter(Boolean));
    icons = new Map();
    for (const b of bins) {
      const url = byName.get(b.icon);
      if (url) icons.set(b.id, url);
    }
  }

  if (!isDefaultQrStyle(style)) {
    const { batchGenerateStyledQRDataURLs } = await import('./styledQr');
    return batchGenerateStyledQRDataURLs(ids, size, style as QrStyleOptions, colors, undefined, icons);
  }
  return batchGenerateQRDataURLs(ids, size, undefined, colors, icons);
}
