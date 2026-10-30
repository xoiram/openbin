import { generateBinQRDataURLs } from '@/lib/binQr';
import type { Bin } from '@/types';
import { generateLabelPDF } from './generateLabelPDF';
import { batchRenderIconDataURLs } from './iconToDataUrl';
import type { LabelFormat } from './labelFormats';
import { buildColorMap } from './labelFormats';
import type { LabelOptions, QrStyleOptions } from './usePrintSettings';

interface DownloadLabelPDFParams {
  bins: Bin[];
  format: LabelFormat;
  labelOptions: LabelOptions;
  iconSize: string;
  qrStyle?: QrStyleOptions;
}

export async function downloadLabelPDF(params: DownloadLabelPDFParams): Promise<void> {
  const { bins, format, labelOptions, iconSize, qrStyle } = params;

  // 1. Generate QR data URLs, icon embedded (cache-hit from LRU cache since LabelSheet already generated them)
  const qrPixelSize = Math.round(parseFloat(format.qrSize) * 150);
  const qrMap = labelOptions.showQrCode
    ? await generateBinQRDataURLs(bins, qrPixelSize, {
        style: qrStyle,
        colors: buildColorMap(bins, labelOptions.showColorSwatch),
        withIcon: labelOptions.showIcon,
      })
    : new Map<string, string>();

  // 2. Render icon PNGs for icon-only labels
  let iconMap = new Map<string, string>();
  if (labelOptions.showIcon) {
    const uniqueIcons = [...new Set(bins.map((b) => b.icon))];
    iconMap = await batchRenderIconDataURLs(uniqueIcons, 128);
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
