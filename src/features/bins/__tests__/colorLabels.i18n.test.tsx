import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.unmock('react-i18next');

const { useTranslation } = await import('react-i18next');
const { renderWithI18n } = await import('@/test/i18nTestUtils');
const { ColorPicker } = await import('../ColorPicker');
const { translateBackgroundLabel, translateColorLabel } = await import('../colorLabels');
const { HUE_RANGES, BLACK_PRESET, WHITE_PRESET } = await import('@/lib/colorPalette');
const { PREMADE_BACKGROUNDS } = await import('@/lib/premadeBackgrounds');
const { default: nbBins } = await import('@/locales/nb/bins.json');
const { default: enBins } = await import('@/locales/en/bins.json');

function Labels() {
  const { t } = useTranslation('bins');
  return (
    <ul>
      {PREMADE_BACKGROUNDS.map((bg) => (
        <li key={bg.id}>{translateBackgroundLabel(t, bg.id, bg.label)}</li>
      ))}
      <li>{translateColorLabel(t, 'Gray')}</li>
    </ul>
  );
}

describe('color and background name translation', () => {
  it('translates the selected color names and the secondary color label in nb', () => {
    renderWithI18n(
      <ColorPicker value="0:2" onChange={vi.fn()} secondaryLabel="Border Color" secondaryValue="black" onSecondaryChange={vi.fn()} />,
      { language: 'nb' },
    );
    expect(screen.getByText('Rød')).toBeTruthy();
    expect(screen.getByText('Svart')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Rød/ }));
    expect(screen.getByText('Kantfarge')).toBeTruthy();
  });

  it('keeps the English labels in en', () => {
    renderWithI18n(<ColorPicker value="0:2" onChange={vi.fn()} />);
    expect(screen.getByText('Red')).toBeTruthy();
  });

  it('translates premade background labels in nb', () => {
    renderWithI18n(<Labels />, { language: 'nb' });
    expect(screen.getByText('Svart og gul')).toBeTruthy();
    expect(screen.getByText('Grønn og rød')).toBeTruthy();
  });

  it('has a key in every locale for each dynamically-built color/background label', () => {
    const labels = [...HUE_RANGES.map((h) => h.label), BLACK_PRESET.label, WHITE_PRESET.label];
    for (const bins of [enBins, nbBins] as Array<Record<string, Record<string, string>>>) {
      for (const label of labels) expect(bins.colors[label.toLowerCase()], label).toBeTruthy();
      for (const bg of PREMADE_BACKGROUNDS) expect(bins.backgrounds[bg.id], bg.id).toBeTruthy();
      for (const k of ['border', 'gradient', 'stripe']) {
        expect((bins.colorPicker as unknown as Record<string, Record<string, string>>).secondary[k], k).toBeTruthy();
      }
    }
  });
});
