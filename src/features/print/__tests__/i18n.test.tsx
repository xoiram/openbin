import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_TERMINOLOGY } from '@/lib/terminology';

// Real react-i18next + real locale JSON (see src/test/i18nTestUtils.tsx).
vi.unmock('react-i18next');

vi.mock('@/lib/terminology', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/terminology')>();
  return { ...actual, useTerminology: () => actual.DEFAULT_TERMINOLOGY };
});

const { renderWithI18n } = await import('@/test/i18nTestUtils');
const { LabelOptionsCard } = await import('../LabelOptionsCard');
const { BinSelectorCard } = await import('../BinSelectorCard');
const { TagColorPicker } = await import('@/features/tags/TagColorPicker');

const labelOptions = {
  fontScale: 1,
  textAlign: 'center' as const,
  labelDirection: 'auto' as const,
  showQrCode: true,
  showBinName: true,
  showIcon: true,
  showBinCode: true,
  showColorSwatch: false,
};

describe('print/tags i18n', () => {
  it('renders the label options card in Norwegian', () => {
    renderWithI18n(
      <LabelOptionsCard
        labelOptions={labelOptions}
        onUpdateOption={vi.fn()}
        copies={1}
        onUpdateCopies={vi.fn()}
        expanded
        onExpandedChange={vi.fn()}
      />,
      { language: 'nb' },
    );
    expect(screen.getByText('Etikettalternativer')).toBeTruthy();
    expect(screen.getByText('Kompakt')).toBeTruthy();
    expect(screen.getByText(`${DEFAULT_TERMINOLOGY.Bin}-navn`)).toBeTruthy();
  });

  it('interpolates terminology into the Norwegian bin selector', () => {
    renderWithI18n(
      <BinSelectorCard
        allBins={[]}
        areas={[]}
        selectedIds={new Set()}
        toggleBin={vi.fn()}
        selectAll={vi.fn()}
        selectNone={vi.fn()}
        toggleArea={vi.fn()}
        expanded
        onExpandedChange={vi.fn()}
      />,
      { language: 'nb' },
    );
    expect(screen.getByText(`Velg ${DEFAULT_TERMINOLOGY.Bins}`)).toBeTruthy();
  });

  it('renders the tag color picker in Norwegian', () => {
    renderWithI18n(<TagColorPicker currentColor="" onColorChange={vi.fn()} tagName="3 stikkord" inline />, {
      language: 'nb',
    });
    expect(screen.getByText('Forhåndsvisning')).toBeTruthy();
    expect(screen.getByLabelText('Svart')).toBeTruthy();
  });
});
