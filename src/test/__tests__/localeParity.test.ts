import { describe, expect, it } from 'vitest';

// Every namespace must exist in every locale with the same key set, so a
// migration PR can't ship an English key without its Norwegian counterpart.
const localeModules = import.meta.glob<{ default: Record<string, unknown> }>('../../locales/*/*.json', { eager: true });

function flattenKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, value]) =>
    value && typeof value === 'object'
      ? flattenKeys(value as Record<string, unknown>, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

const byLocale = new Map<string, Map<string, string[]>>();
for (const [path, mod] of Object.entries(localeModules)) {
  const [, lng, ns] = path.match(/locales\/([^/]+)\/([^/]+)\.json$/) ?? [];
  if (!lng || !ns) continue;
  if (!byLocale.has(lng)) byLocale.set(lng, new Map());
  byLocale.get(lng)?.set(ns, flattenKeys(mod.default).sort());
}

const en = byLocale.get('en') ?? new Map<string, string[]>();
const otherLocales = [...byLocale.keys()].filter((lng) => lng !== 'en');

describe('locale parity', () => {
  it('finds the en resources', () => {
    expect(en.size).toBeGreaterThan(0);
    expect(otherLocales.length).toBeGreaterThan(0);
  });

  for (const lng of otherLocales) {
    it(`${lng} has the same namespaces as en`, () => {
      expect([...(byLocale.get(lng)?.keys() ?? [])].sort()).toEqual([...en.keys()].sort());
    });

    for (const [ns, keys] of en) {
      it(`${lng}/${ns}.json has the same keys as en/${ns}.json`, () => {
        expect(byLocale.get(lng)?.get(ns)).toEqual(keys);
      });
    }
  }
});
