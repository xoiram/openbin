import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.unmock('react-i18next');

const { renderWithI18n } = await import('@/test/i18nTestUtils');
const { AiTurnExecutionResult } = await import('../AiTurnExecutionResult');
const { ItemSelectionBar } = await import('../ItemSelectionBar');
const { computeAnalyzeLabel } = await import('../analyzeLabel');
const { createTestI18n } = await import('@/test/i18nTestUtils');

const base = { completedActions: [], completedActionIndices: [0], createdBins: [], failedCount: 0 };

describe('AI whole-sentence plurals', () => {
  it('pluralizes the applied-changes summary in nb', () => {
    const { rerender } = renderWithI18n(<AiTurnExecutionResult result={base} onBinClick={vi.fn()} />, { language: 'nb' });
    expect(screen.getByText('Utførte 1 endring')).toBeTruthy();
    rerender(<AiTurnExecutionResult result={{ ...base, completedActionIndices: [0, 1] }} onBinClick={vi.fn()} />);
    expect(screen.getByText('Utførte 2 endringer')).toBeTruthy();
  });

  it('pluralizes the selection bar in en and nb', () => {
    const props = { onCheckout: vi.fn(), onRemove: vi.fn(), onClear: vi.fn(), isBusy: false };
    const { unmount } = renderWithI18n(<ItemSelectionBar selectionCount={1} {...props} />);
    expect(screen.getByText('1 item selected')).toBeTruthy();
    unmount();
    renderWithI18n(<ItemSelectionBar selectionCount={3} {...props} />, { language: 'nb' });
    expect(screen.getByText('3 gjenstander valgt')).toBeTruthy();
  });

  it('pluralizes the analyze label via a real t()', async () => {
    const i18n = createTestI18n();
    await i18n.changeLanguage('nb');
    const t = i18n.getFixedT('nb', 'ai');
    const partial = '{"name":"x","items":[{"name":"a"},{"name":"b"},';
    expect(computeAnalyzeLabel({ mode: 'analyze', partialText: partial, complete: false }, t).text).toBe('Fant 2 gjenstander');
  });
});
