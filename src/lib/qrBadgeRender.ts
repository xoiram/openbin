import { getBinQrPayload } from './constants';
import { resolveIcon } from './iconMap';
import type { QRColorOptions } from './qr';
import { makeLruCache } from './qr';
import { buildBadgeQrSvg } from './qrBadge';

const cache = makeLruCache();
const iconCache = new Map<string, string>();

/** Inner markup (paths, circles…) of a lucide icon, rendered synchronously so it works from inside React effects. */
async function iconMarkup(name: string): Promise<string> {
  const hit = iconCache.get(name);
  if (hit !== undefined) return hit;
  const [{ createElement }, { renderToStaticMarkup }] = await Promise.all([import('react'), import('react-dom/server')]);
  const html = renderToStaticMarkup(createElement(resolveIcon(name)));
  const inner = html.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
  iconCache.set(name, inner);
  return inner;
}

async function svgToPngDataURL(svg: string, px: number): Promise<string> {
  const img = new Image();
  const loaded = new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Failed to render QR SVG'));
  });
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await loaded;
  const canvas = document.createElement('canvas');
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, px, px);
  return canvas.toDataURL('image/png');
}

/** Build the badge QR for a bin as SVG markup. Error correction is always H. */
export async function generateBadgeQRSvg(binId: string, iconName: string, colors?: QRColorOptions): Promise<string> {
  const { default: qrcode } = await import('qrcode-generator');
  const qr = qrcode(0, 'H');
  qr.addData(getBinQrPayload(binId));
  qr.make();
  return buildBadgeQrSvg((r, c) => qr.isDark(r, c), qr.getModuleCount(), {
    dark: colors?.dark ?? '#000000',
    light: colors?.light ?? '#ffffff',
    iconMarkup: await iconMarkup(iconName),
  });
}

/** PNG export of the badge QR. The raster is a whole number of pixels per module so edges stay sharp. */
export async function generateBadgeQRDataURL(binId: string, iconName: string, size: number, colors?: QRColorOptions): Promise<string> {
  const key = `${binId}:${iconName}:${size}:${colors?.dark}:${colors?.light}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const svg = await generateBadgeQRSvg(binId, iconName, colors);
  const total = Number(/viewBox="0 0 (\d+)/.exec(svg)?.[1]);
  const px = Math.max(1, Math.ceil(size / total)) * total;
  const url = await svgToPngDataURL(svg, px);
  cache.set(key, url);
  return url;
}
