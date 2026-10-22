import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Opt out of the global react-i18next mock (src/test-setup.ts) for this file
// only — renderWithI18n needs the real library + real JSON resources to
// catch broken keys/missing interpolation vars/JSON typos that the mock
// (which just echoes back key/defaultValue) wouldn't. This specifically
// exercises the real {{elapsed}} interpolation in TranscriptionMicButton's
// "Recording: ..." aria-label.
vi.unmock('react-i18next');

// TranscriptionMicButton unconditionally calls useCreditCostLabel(), which
// reads usePlan() — outside a <PlanProvider> (not needed by any other part
// of this test) that throws. Mock it to the self-hosted/no-credits shape,
// matching the pattern used elsewhere for this hook.
vi.mock('@/lib/usePlan', () => ({
  usePlan: () => ({
    isGated: () => false,
    isSelfHosted: true,
    planInfo: { aiCredits: null, status: 'inactive' },
  }),
}));

const { renderWithI18n } = await import('@/test/i18nTestUtils');
const { ConversationComposer } = await import('../ConversationComposer');
const { TranscriptionMicButton } = await import('../TranscriptionMicButton');

const defaultProps = {
  onSend: vi.fn(),
  onCancel: vi.fn(),
  onPhotoClick: vi.fn(),
  onCameraClick: vi.fn(),
  isStreaming: false,
  transcription: undefined,
};

describe('ConversationComposer (real i18n resources)', () => {
  it('renders real English placeholder and aria-label', () => {
    renderWithI18n(<ConversationComposer {...defaultProps} />);
    expect(screen.getByPlaceholderText('Ask anything…')).toBeTruthy();
    expect(screen.getByLabelText('Ask AI')).toBeTruthy();
    expect(screen.getByLabelText('Send')).toBeTruthy();
  });

  it('renders the Norwegian resources when a language is requested', () => {
    renderWithI18n(<ConversationComposer {...defaultProps} />, { language: 'nb' });
    expect(screen.getByPlaceholderText('Spør om hva som helst…')).toBeTruthy();
    expect(screen.getByLabelText('Send')).toBeTruthy();
  });
});

describe('TranscriptionMicButton (real i18n resources)', () => {
  it('renders real {{elapsed}} interpolation in English while recording', () => {
    renderWithI18n(
      <TranscriptionMicButton
        transcription={{ state: 'recording', duration: 5000, error: null, start: vi.fn(), stop: vi.fn(), cancel: vi.fn() }}
      />,
    );
    expect(screen.getByLabelText(/^Recording: /)).toBeTruthy();
  });

  it('renders real {{elapsed}} interpolation in Norwegian while recording', () => {
    renderWithI18n(
      <TranscriptionMicButton
        transcription={{ state: 'recording', duration: 5000, error: null, start: vi.fn(), stop: vi.fn(), cancel: vi.fn() }}
      />,
      { language: 'nb' },
    );
    expect(screen.getByLabelText(/^Tar opp: /)).toBeTruthy();
  });
});
