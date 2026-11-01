import qrcode from 'qrcode-generator';
import { describe, expect, it } from 'vitest';
import { buildBadgeQrSvg, QR_QUIET_ZONE, qrCutoutSize } from '@/lib/qrBadge';

describe('qrCutoutSize', () => {
  it('follows the spec tiers and is always odd', () => {
    expect(qrCutoutSize(21)).toBe(7);
    expect(qrCutoutSize(29)).toBe(7);
    expect(qrCutoutSize(33)).toBe(9);
    expect(qrCutoutSize(37)).toBe(9);
    expect(qrCutoutSize(41)).toBe(11); // 10.25 -> 11
    expect(qrCutoutSize(57)).toBe(15); // 14.25 -> 15
    for (let n = 21; n <= 177; n += 4) expect(qrCutoutSize(n) % 2).toBe(1);
  });
});

describe('buildBadgeQrSvg', () => {
  const make = (data: string) => {
    const q = qrcode(0, 'H');
    q.addData(data);
    q.make();
    return q;
  };

  it('clears whole modules only, centred, clear of finders and timing patterns', () => {
    for (const data of ['openbin://bin/ABCDEF', 'x'.repeat(60), 'y'.repeat(120)]) {
      const q = make(data);
      const n = q.getModuleCount();
      const k = qrCutoutSize(n);
      const c0 = (n - k) / 2;
      expect(Number.isInteger(c0)).toBe(true);
      expect(c0).toBeGreaterThanOrEqual(9); // past finder + separator and the timing row/column
      const svg = buildBadgeQrSvg((r, c) => q.isDark(r, c), n, { dark: '#000', light: '#fff', iconMarkup: '<path d="M0 0"/>' });
      const d = /<path d="([^"]*)"/.exec(svg)?.[1] ?? '';
      for (const m of d.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
        const [x, y, w] = [Number(m[1]) - QR_QUIET_ZONE, Number(m[2]) - QR_QUIET_ZONE, Number(m[3])];
        const overlapsRow = y >= c0 && y < c0 + k;
        const overlapsCols = x < c0 + k && x + w > c0;
        expect(overlapsRow && overlapsCols).toBe(false);
      }
    }
  });

  it('insets the badge 1 module, rounds it at 22% and sizes the icon box to 60%', () => {
    const q = make('openbin://bin/ABCDEF');
    const n = q.getModuleCount();
    const badge = qrCutoutSize(n) - 2;
    const svg = buildBadgeQrSvg((r, c) => q.isDark(r, c), n, { dark: '#111', light: '#fff', iconMarkup: '<path d="M0 0"/>' });
    expect(svg).toContain(`width="${badge}" height="${badge}" rx="${badge * 0.22}"`);
    expect(svg).toContain(`scale(${(badge * 0.6) / 24})`);
    expect(svg).toContain(`viewBox="0 0 ${n + 8} ${n + 8}"`);
  });
});
