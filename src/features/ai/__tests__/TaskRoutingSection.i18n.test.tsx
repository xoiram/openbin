import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AiSettings } from '@/types';

// Opt out of the global react-i18next mock (src/test-setup.ts) for this file
// only — renderWithI18n needs the real library + real JSON resources to
// catch broken keys/missing interpolation vars/JSON typos that the mock
// (which just echoes back key/defaultValue) wouldn't. This specifically
// guards the dynamic `ai:providers.${key}` / `ai:taskGroups.${key}.*` key
// lookups in aiConstants.ts's aiProviderLabel()/aiTaskGroupLabel()/
// aiTaskGroupDescription() helpers — a key mismatch would silently fall
// back to the English defaultValue under the mocked tests but fail here
// for `nb`.
vi.unmock('react-i18next');

const { renderWithI18n } = await import('@/test/i18nTestUtils');
const { TaskRoutingSection } = await import('../TaskRoutingSection');

const baseSettings: AiSettings = {
  id: 's1',
  provider: 'openai',
  apiKey: 'sk-test',
  model: 'gpt-5-mini',
  endpointUrl: null,
  customPrompt: null,
  commandPrompt: null,
  queryPrompt: null,
  structurePrompt: null,
  reorganizationPrompt: null,
  tagSuggestionPrompt: null,
  temperature: null,
  maxTokens: null,
  topP: null,
  requestTimeout: null,
};

function renderSection(language?: string) {
  return renderWithI18n(
    <TaskRoutingSection settings={baseSettings} overrides={{}} onChange={vi.fn()} />,
    language ? { language } : undefined,
  );
}

describe('TaskRoutingSection (real i18n resources)', () => {
  it('renders real English task group and provider labels', () => {
    renderSection();
    expect(screen.getByText('Vision')).toBeTruthy();
    expect(screen.getByText('Photo Scan')).toBeTruthy();
    expect(screen.getByText('Quick Text')).toBeTruthy();
    expect(screen.getByText('Deep Text')).toBeTruthy();
    expect(screen.getAllByText('Provider').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Default (OpenAI)').length).toBeGreaterThan(0);
  });

  it('renders the Norwegian resources when a language is requested', () => {
    renderSection('nb');
    expect(screen.getByText('Syn')).toBeTruthy();
    expect(screen.getByText('Bildeskanning')).toBeTruthy();
    expect(screen.getByText('Rask tekst')).toBeTruthy();
    expect(screen.getByText('Dyp tekst')).toBeTruthy();
    expect(screen.getAllByText('Leverandør').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Standard (OpenAI)').length).toBeGreaterThan(0);
  });
});
