import { screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

// Opt out of the global react-i18next mock (src/test-setup.ts) for this file
// only — renderWithI18n needs the real library + real JSON resources to
// catch broken keys/missing interpolation vars/JSON typos that the mock
// (which just echoes back key/defaultValue) wouldn't. This specifically
// exercises the real {{days}}/{{location}} interpolation used throughout
// DataSection.tsx and useDataSectionActions.ts, which isn't covered by any
// mocked test since neither file has one.
vi.unmock('react-i18next');

vi.mock('@/lib/auth', () => ({
  useAuth: vi.fn(() => ({ activeLocationId: 'loc-1' })),
}));
vi.mock('@/features/locations/useLocations', () => ({
  useLocationList: vi.fn(() => ({
    locations: [{ id: 'loc-1', name: 'Home', activity_retention_days: 30, trash_retention_days: 14 }],
    isLoading: false,
  })),
}));
vi.mock('@/components/ui/toast', () => ({
  useToast: vi.fn(() => ({ showToast: vi.fn() })),
}));

const { renderWithI18n } = await import('@/test/i18nTestUtils');
const { DataSection } = await import('../sections/DataSection');

function renderData(language?: string) {
  return renderWithI18n(
    <MemoryRouter>
      <DataSection />
    </MemoryRouter>,
    language ? { language } : undefined,
  );
}

describe('DataSection (real i18n resources)', () => {
  it('renders real English translations, including day-count interpolation', () => {
    renderData();
    expect(screen.getByText('Data')).toBeTruthy();
    expect(screen.getByText('Changes from the last 30 days')).toBeTruthy();
    expect(screen.getByText('Restore within 14 days — then permanently deleted')).toBeTruthy();
    expect(screen.getByText('Export & Import')).toBeTruthy();
  });

  it('renders the Norwegian resources when a language is requested', () => {
    renderData('nb');
    expect(screen.getByText('Data')).toBeTruthy();
    expect(screen.getByText('Endringer fra de siste 30 dagene')).toBeTruthy();
    expect(screen.getByText('Gjenopprett innen 14 dager — deretter slettet permanent')).toBeTruthy();
    expect(screen.getByText('Eksport og import')).toBeTruthy();
  });
});
