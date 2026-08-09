import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Opt out of the global react-i18next mock (src/test-setup.ts) for this file
// only — renderWithI18n needs the real library + real JSON resources to
// catch broken keys/missing interpolation vars/JSON typos that the mock
// (which just echoes back key/defaultValue) wouldn't. This specifically
// guards the dynamic `picker.${tourId}.title` lookup in TourLauncher.tsx —
// a kebab-case/camelCase key mismatch would silently fall back to the
// English defaultValue under the mocked tests but fail here for `nb`.
vi.unmock('react-i18next');

vi.mock('@/lib/userPreferences', () => ({
  useUserPreferences: vi.fn(() => ({
    preferences: { tours_seen: [] as string[] },
    isLoading: false,
    updatePreferences: vi.fn(),
  })),
}));

const { renderWithI18n } = await import('@/test/i18nTestUtils');
const { TourLauncher } = await import('../TourLauncher');
const { TourProvider } = await import('../TourProvider');

function makeTourReturn() {
  return {
    isActive: false,
    currentStep: 0,
    totalSteps: 0,
    step: null,
    targetRect: null,
    transitioning: false,
    currentTourId: null,
    start: vi.fn(),
    next: vi.fn(),
    prev: vi.fn(),
    skip: vi.fn(),
  };
}

describe('TourLauncher (real i18n resources)', () => {
  it('renders real English picker titles for kebab-case tour ids', () => {
    renderWithI18n(
      <TourProvider tour={makeTourReturn()}>
        <TourLauncher tourId="bin-anatomy" variant="menu" />
      </TourProvider>,
    );
    expect(screen.getByText('Inside a bin')).toBeTruthy();
    expect(screen.getByText('Items, tags, QR, tabs, toolbar')).toBeTruthy();
  });

  it('renders the Norwegian picker title/summary for kebab-case tour ids', () => {
    renderWithI18n(
      <TourProvider tour={makeTourReturn()}>
        <TourLauncher tourId="bin-anatomy" variant="menu" />
      </TourProvider>,
      { language: 'nb' },
    );
    expect(screen.getByText('Inni en boks')).toBeTruthy();
    expect(screen.getByText('Gjenstander, stikkord, QR, faner, verktøylinje')).toBeTruthy();
  });

  it('composes the icon-variant aria-label from real resources', () => {
    renderWithI18n(
      <TourProvider tour={makeTourReturn()}>
        <TourLauncher tourId="highlights" />
      </TourProvider>,
    );
    expect(screen.getByRole('button', { name: 'Tour: Highlights' })).toBeTruthy();
  });
});
