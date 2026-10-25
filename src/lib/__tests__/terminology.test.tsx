import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Real react-i18next so the nb defaults come from common.json.
vi.unmock('react-i18next');

const mockLocations = vi.fn();
vi.mock('@/features/locations/useLocations', () => ({
  useLocationList: () => ({ locations: mockLocations() }),
}));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ activeLocationId: 'loc1' }) }));

const { useTerminology } = await import('../terminology');
const { createTestI18n } = await import('@/test/i18nTestUtils');

function run(language: string) {
  const i18n = createTestI18n();
  i18n.changeLanguage(language);
  const wrapper = ({ children }: { children: ReactNode }) => <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
  return renderHook(() => useTerminology(), { wrapper }).result.current;
}

const loc = (over: Record<string, string> = {}) => [
  { id: 'loc1', term_bin: '', term_location: '', term_area: '', ...over },
];

describe('useTerminology', () => {
  beforeEach(() => mockLocations.mockReturnValue(loc()));

  it('uses English defaults in en', () => {
    const t = run('en');
    expect([t.bin, t.Bins, t.location, t.Areas]).toEqual(['bin', 'Bins', 'location', 'Areas']);
  });

  it('localizes uncustomized defaults in nb', () => {
    const t = run('nb');
    expect([t.bin, t.Bins, t.location, t.locations, t.Area, t.areas]).toEqual([
      'boks', 'Bokser', 'sted', 'steder', 'Område', 'områder',
    ]);
  });

  it('keeps admin-customized terms verbatim in nb, localizing only the rest', () => {
    mockLocations.mockReturnValue(loc({ term_bin: 'tote|totes' }));
    const t = run('nb');
    expect([t.bin, t.bins, t.Bin]).toEqual(['tote', 'totes', 'Tote']);
    expect(t.location).toBe('sted');
  });

  it('falls back to localized plural default when only singular is customized', () => {
    mockLocations.mockReturnValue(loc({ term_bin: 'tote' }));
    expect(run('nb').bins).toBe('bokser');
  });
});
