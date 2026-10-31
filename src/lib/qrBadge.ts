/** Quiet zone around the code, in modules (QR spec minimum). */
export const QR_QUIET_ZONE = 4;

/** Stroke weight of the icon, as a fraction of one module's width at final size. */
const ICON_STROKE_MODULES = 0.425;
/** Icon box as a fraction of the badge size. */
const ICON_BOX_RATIO = 0.6;
/** Badge corner radius as a fraction of the badge size. */
const BADGE_RADIUS_RATIO = 0.22;
/** Lucide icons are drawn on a 24-unit grid. */
const ICON_VIEWBOX = 24;

/** Side, in whole modules, of the square cleared from the centre. Always odd so it centres exactly. */
export function qrCutoutSize(moduleCount: number): number {
  if (moduleCount <= 29) return 7;
  if (moduleCount <= 37) return 9;
  const k = Math.round((moduleCount * 0.25 - 1) / 2) * 2 + 1;
  return k;
}

interface BadgeQrOptions {
  dark: string;
  light: string;
  /** Inner markup of a 24x24 line icon (lucide). Omit for a plain code. */
  iconMarkup?: string;
}

/** Build the code as SVG: square modules, a grid-aligned centre cut-out and a solid badge carrying a white icon. */
export function buildBadgeQrSvg(isDark: (row: number, col: number) => boolean, moduleCount: number, { dark, light, iconMarkup }: BadgeQrOptions): string {
  const n = moduleCount;
  const total = n + QR_QUIET_ZONE * 2;
  const k = qrCutoutSize(n);
  const c0 = (n - k) / 2;
  const c1 = c0 + k;
  const inCutout = (r: number, c: number) => r >= c0 && r < c1 && c >= c0 && c < c1;

  let d = '';
  for (let r = 0; r < n; r++) {
    let runStart = -1;
    for (let c = 0; c <= n; c++) {
      const on = c < n && isDark(r, c) && !inCutout(r, c);
      if (on && runStart < 0) runStart = c;
      if (!on && runStart >= 0) {
        d += `M${runStart + QR_QUIET_ZONE} ${r + QR_QUIET_ZONE}h${c - runStart}v1h-${c - runStart}z`;
        runStart = -1;
      }
    }
  }

  const badge = k - 2;
  const badgePos = c0 + 1 + QR_QUIET_ZONE;
  const radius = badge * BADGE_RADIUS_RATIO;

  let iconSvg = '';
  if (iconMarkup) {
    const box = badge * ICON_BOX_RATIO;
    const scale = box / ICON_VIEWBOX;
    const offset = badgePos + (badge - box) / 2;
    const stroke = ICON_STROKE_MODULES / scale;
    iconSvg = `<g transform="translate(${offset} ${offset}) scale(${scale})" fill="none" stroke="${light}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${iconMarkup}</g>`;
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${total}" height="${total}" shape-rendering="crispEdges">` +
    `<rect width="${total}" height="${total}" fill="${light}"/>` +
    `<path d="${d}" fill="${dark}"/>` +
    `<rect x="${badgePos}" y="${badgePos}" width="${badge}" height="${badge}" rx="${radius}" fill="${dark}" shape-rendering="geometricPrecision"/>` +
    iconSvg +
    `</svg>`
  );
}
