import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AiProviderSetup } from '../useAiProviderSetup';

// Opt out of the global react-i18next mock (src/test-setup.ts) for this file
// only — renderWithI18n needs the real library + real JSON resources to
// catch broken keys/missing interpolation vars/JSON typos that the mock
// (which just echoes back key/defaultValue) wouldn't. This specifically
// exercises the dynamic `ai:providers.${key}` lookup used by the provider
// pills inside InlineAiSetup — the same mechanism verified for
// TaskRoutingSection, here reused in a different component.
vi.unmock('react-i18next');

const { renderWithI18n } = await import('@/test/i18nTestUtils');
const { InlineAiSetup, AiSetupView } = await import('../InlineAiSetup');

function makeSetup(overrides: Partial<AiProviderSetup> = {}): AiProviderSetup {
  return {
    provider: 'openai',
    apiKey: '',
    model: '',
    endpointUrl: '',
    showKey: false,
    testing: false,
    saving: false,
    configured: false,
    isReady: false,
    testResult: null,
    setProvider: vi.fn(),
    setApiKey: vi.fn(),
    setModel: vi.fn(),
    setEndpointUrl: vi.fn(),
    setShowKey: vi.fn(),
    setTestResult: vi.fn(),
    handleProviderChange: vi.fn(),
    handleTest: vi.fn(),
    handleSave: vi.fn(),
    ...overrides,
  };
}

describe('InlineAiSetup (real i18n resources)', () => {
  it('renders real English default label and provider options', () => {
    renderWithI18n(<InlineAiSetup expanded onExpandedChange={vi.fn()} setup={makeSetup()} />);
    expect(screen.getByText('Set up AI provider to get started')).toBeTruthy();
    expect(screen.getByPlaceholderText('API key')).toBeTruthy();
    expect(screen.getByPlaceholderText('Model name')).toBeTruthy();
  });

  it('renders the Norwegian resources when a language is requested', () => {
    renderWithI18n(
      <InlineAiSetup expanded onExpandedChange={vi.fn()} setup={makeSetup()} />,
      { language: 'nb' },
    );
    expect(screen.getByText('Sett opp AI-leverandør for å komme i gang')).toBeTruthy();
    expect(screen.getByPlaceholderText('API-nøkkel')).toBeTruthy();
    expect(screen.getByPlaceholderText('Modellnavn')).toBeTruthy();
  });

  it('AiSetupView renders real Norwegian resources', () => {
    renderWithI18n(<AiSetupView onNavigate={vi.fn()} onDismiss={vi.fn()} />, { language: 'nb' });
    expect(screen.getByText('Sett opp en AI-leverandør for å komme i gang')).toBeTruthy();
    expect(screen.getByText('Gå til innstillinger')).toBeTruthy();
    expect(screen.getByText('Senere')).toBeTruthy();
  });
});
