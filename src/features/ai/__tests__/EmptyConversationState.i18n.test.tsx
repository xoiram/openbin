import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Opt out of the global react-i18next mock (src/test-setup.ts) for this file
// only — renderWithI18n needs the real library + real JSON resources to
// catch broken keys/missing interpolation vars/JSON typos that the mock
// (which just echoes back key/defaultValue) wouldn't. This specifically
// exercises the real {{bin}}/{{bins}}/{{area}} interpolation composed with
// useTerminology()'s DEFAULT_TERMINOLOGY, and the {{n}}/{{unit}}
// interpolation in ConversationScopePill.
vi.unmock('react-i18next');

vi.mock('@/lib/terminology', async () => {
  const actual = await vi.importActual<typeof import('@/lib/terminology')>('@/lib/terminology');
  return { ...actual, useTerminology: () => actual.DEFAULT_TERMINOLOGY };
});

const { renderWithI18n } = await import('@/test/i18nTestUtils');
const { EmptyConversationState } = await import('../EmptyConversationState');
const { ConversationScopePill } = await import('../ConversationScopePill');

describe('EmptyConversationState (real i18n resources)', () => {
  it('renders real English examples with terminology interpolation', () => {
    renderWithI18n(<EmptyConversationState isScoped={false} onPickExample={vi.fn()} />);
    expect(screen.getByText('Try asking')).toBeTruthy();
    expect(screen.getByText("What's in the Camping Gear bin?")).toBeTruthy();
    expect(screen.getByText('Which bins have batteries?')).toBeTruthy();
  });

  it('renders the Norwegian resources when a language is requested', () => {
    renderWithI18n(<EmptyConversationState isScoped={false} onPickExample={vi.fn()} />, { language: 'nb' });
    expect(screen.getByText('Prøv å spørre')).toBeTruthy();
    expect(screen.getByText('Hva er i bin Campingutstyr?')).toBeTruthy();
  });

  it('renders scoped examples with the area term', () => {
    renderWithI18n(<EmptyConversationState isScoped onPickExample={vi.fn()} />, { language: 'nb' });
    expect(screen.getByText('Flytt alle disse til area Garasje')).toBeTruthy();
  });
});

describe('ConversationScopePill (real i18n resources)', () => {
  it('renders real English pluralization and aria-label', () => {
    renderWithI18n(<ConversationScopePill binCount={3} onClear={vi.fn()} />);
    expect(screen.getByText('Focused on 3 bins')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Clear scope' })).toBeTruthy();
  });

  it('renders the Norwegian resources when a language is requested', () => {
    renderWithI18n(<ConversationScopePill binCount={1} onClear={vi.fn()} />, { language: 'nb' });
    expect(screen.getByText('Fokusert på 1 bin')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Fjern fokus' })).toBeTruthy();
  });
});
