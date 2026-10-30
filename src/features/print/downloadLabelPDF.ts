import { batchGenerateQRDataURLs } from '@/lib/qr';
import type { Bin } from '@/types';
import { generateLabelPDF } from './generateLabelPDF';
import { batchRenderIconDataURLs } from './iconToDataUrl';
import type { LabelFormat } from './labelFormats';
import { buildColorMap } from './labelFormats';
import type { LabelOptions, QrStyleOptions } from './usePrintSettings';
import { isDefaultQrStyle } from './usePrintSettings';

interface DownloadLabelPDFParams {
  bins: Bin[];
  format: LabelFormat;
  labelOptions: LabelOptions;
  iconSize: string;
  qrStyle?: QrStyleOptions;
}

export async function downloadLabelPDF(params: DownloadLabelPDFParams): Promise<void> {
  const { bins, format, labelOptions, iconSize, qrStyle } = params;

  // 1. Render icon PNGs (if showIcon enabled); they are also embedded in the QR codes
  let iconMap = new Map<string, string>();
  if (labelOptions.showIcon) {
    const uniqueIcons = [...new Set(bins.map((b) => b.icon))];
    iconMap = await batchRenderIconDataURLs(uniqueIcons, 128);
  }

  // 2. Generate QR data URLs (cache-hit from LRU cache since LabelSheet already generated them)
  const qrPixelSize = Math.round(parseFloat(format.qrSize) * 150);
  const colorMap = buildColorMap(bins, labelOptions.showColorSwatch);
  const qrIcons = new Map<string, string>();
  if (labelOptions.showIcon) {
    for (const b of bins) {
      const url = iconMap.get(b.icon);
      if (url) qrIcons.set(b.id, url);
    }
  }
  let qrMap: Map<string, string>;
  if (!labelOptions.showQrCode) {
    qrMap = new Map();
  } else if (!isDefaultQrStyle(qrStyle)) {
    const { batchGenerateStyledQRDataURLs } = await import('@/lib/styledQr');
    qrMap = await batchGenerateStyledQRDataURLs(bins.map((b) => b.id), qrPixelSize, qrStyle as QrStyleOptions, colorMap, undefined, qrIcons);
  } else {
    qrMap = await batchGenerateQRDataURLs(bins.map((b) => b.id), qrPixelSize, undefined, colorMap, qrIcons);
  }

  // 3. Generate PDF blob
  const blob = await generateLabelPDF({ bins, format, labelOptions, qrMap, iconMap, iconSize });

  // 4. Trigger download via temporary <a> element
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `labels-${new Date().toISOString().slice(0, 10)}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
