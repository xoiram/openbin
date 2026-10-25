import { ChevronDown, QrCode, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Disclosure } from '@/components/ui/disclosure';
import { Label } from '@/components/ui/label';
import { OptionGroup } from '@/components/ui/option-group';
import { Switch } from '@/components/ui/switch';
import { HueGradientPicker } from '@/features/bins/ColorPicker';
import { buildColorKey, hexToHsl, resolveColor, SHADE_COUNT } from '@/lib/colorPalette';
import { cn } from '@/lib/utils';
import type { QrStyleOptions } from './usePrintSettings';
import { DEFAULT_QR_STYLE, isDefaultQrStyle } from './usePrintSettings';

const ROTATION_TICKS = [0, 90, 180, 270, 360];

const ERROR_LEVELS: { key: QrStyleOptions['errorCorrection']; label: string }[] = [
  { key: 'L', label: 'L' },
  { key: 'M', label: 'M' },
  { key: 'Q', label: 'Q' },
  { key: 'H', label: 'H' },
];

interface QrStyleCardProps {
  qrStyle: QrStyleOptions;
  onUpdateStyle: (style: QrStyleOptions) => void;
  expanded: boolean;
  onExpandedChange: (v: boolean) => void;
}

const QR_PREVIEW_SIZE = 140;
const QR_PREVIEW_PAD = 6;
const QR_PREVIEW_RADIUS = 4;

function MiniPreview({ style }: { style: QrStyleOptions }) {
  const { t } = useTranslation('print');
  const [dataUrl, setDataUrl] = useState<string>('');
  const [prevUrl, setPrevUrl] = useState<string>('');
  const [transitioning, setTransitioning] = useState(false);
  const styleKey = JSON.stringify(style);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      try {
        const { generateStyledQRDataURL } = await import('@/lib/styledQr');
        const url = await generateStyledQRDataURL('DEMOBN', 280, style);
        if (cancelled) return;

        if (dataUrl) {
          setPrevUrl(dataUrl);
          setTransitioning(true);
          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = setTimeout(() => {
            setPrevUrl('');
            setTransitioning(false);
          }, 250);
        }
        setDataUrl(url);
      } catch {
        // Silently fail — preview is non-critical
      }
    }

    render();
    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [styleKey]);

  return (
    <div className="flex items-center justify-center py-1">
      <div
        className="relative bg-[var(--bg-print-surface)] shadow-[inset_0_0_0_1px_var(--border-preview)]"
        style={{
          padding: QR_PREVIEW_PAD,
          borderRadius: QR_PREVIEW_RADIUS,
        }}
      >
        {/* Previous image (crossfade out) */}
        {transitioning && prevUrl && (
          <img
            src={prevUrl}
            alt=""
            className="absolute inset-0 m-auto transition-opacity duration-250 opacity-0"
            style={{ width: QR_PREVIEW_SIZE, height: QR_PREVIEW_SIZE }}
          />
        )}

        {/* Current image */}
        {dataUrl ? (
          <img
            src={dataUrl}
            alt={t('qrStyle.previewAlt', { defaultValue: 'QR preview' })}
            className="transition-opacity duration-250"
            style={{
              width: QR_PREVIEW_SIZE,
              height: QR_PREVIEW_SIZE,
              opacity: 1,
            }}
          />
        ) : (
          <div
            className="rounded-[var(--radius-xs)] bg-[var(--bg-input)] animate-pulse"
            style={{ width: QR_PREVIEW_SIZE, height: QR_PREVIEW_SIZE }}
          />
        )}
      </div>
    </div>
  );
}

/** Convert a hex color to the nearest color key for HueGradientPicker. */
function hexToColorKey(hex: string): string {
  if (!hex) return '';
  const lower = hex.toLowerCase();
  if (lower === '#000000' || lower === '#1c1c1e') return 'black';
  if (lower === '#f2f2f7' || lower === '#ffffff') return 'white';

  const { h, s, l } = hexToHsl(hex);
  const hue = s < 10 ? 'neutral' as const : h;
  const shadeLightness = [72, 62, 52, 42, 32];
  let bestShade = 2;
  let bestDist = Infinity;
  for (let i = 0; i < SHADE_COUNT; i++) {
    const dist = Math.abs(l - shadeLightness[i]);
    if (dist < bestDist) { bestDist = dist; bestShade = i; }
  }
  return buildColorKey(hue, bestShade);
}

function QrColorPicker({ value, onChange, label }: { value: string; onChange: (hex: string) => void; label: string }) {
  const [colorKey, setColorKey] = useState(() => hexToColorKey(value));

  useEffect(() => {
    setColorKey(hexToColorKey(value));
  }, [value]);

  function handleChange(key: string) {
    setColorKey(key);
    if (key) {
      const preset = resolveColor(key);
      onChange(preset?.dot ?? '#000000');
    }
  }

  return (
    <div>
      <span className="text-[12px] text-[var(--text-secondary)] font-medium block mb-2">{label}</span>
      <HueGradientPicker value={colorKey} onChange={handleChange} />
    </div>
  );
}

/** Check whether any advanced QR setting differs from default. */
function hasAdvancedChanges(style: QrStyleOptions): boolean {
  return (
    style.cornerSquareType !== DEFAULT_QR_STYLE.cornerSquareType ||
    style.cornerSquareColor !== DEFAULT_QR_STYLE.cornerSquareColor ||
    style.cornerDotType !== DEFAULT_QR_STYLE.cornerDotType ||
    style.cornerDotColor !== DEFAULT_QR_STYLE.cornerDotColor ||
    style.useGradient !== DEFAULT_QR_STYLE.useGradient ||
    style.errorCorrection !== DEFAULT_QR_STYLE.errorCorrection
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[12px] text-[var(--text-secondary)] font-medium block mb-2">
      {children}
    </span>
  );
}

export function QrStyleCard({ qrStyle, onUpdateStyle, expanded, onExpandedChange }: QrStyleCardProps) {
  const { t } = useTranslation('print');
  const shapeLabels = {
    auto: t('qrStyle.shapes.auto', { defaultValue: 'Auto' }),
    square: t('qrStyle.shapes.square', { defaultValue: 'Square' }),
    rounded: t('qrStyle.shapes.rounded', { defaultValue: 'Rounded' }),
    dots: t('qrStyle.shapes.dots', { defaultValue: 'Dots' }),
    classy: t('qrStyle.shapes.classy', { defaultValue: 'Classy' }),
    classyRounded: t('qrStyle.shapes.classyRounded', { defaultValue: 'Classy R.' }),
    extraRounded: t('qrStyle.shapes.extraRounded', { defaultValue: 'Extra R.' }),
  };
  const dotTypes: { key: QrStyleOptions['dotType']; label: string }[] = [
    { key: 'square', label: shapeLabels.square },
    { key: 'rounded', label: shapeLabels.rounded },
    { key: 'dots', label: shapeLabels.dots },
    { key: 'classy', label: shapeLabels.classy },
    { key: 'classy-rounded', label: shapeLabels.classyRounded },
    { key: 'extra-rounded', label: shapeLabels.extraRounded },
  ];
  const cornerSquareTypes: { key: string; label: string }[] = [
    { key: '', label: shapeLabels.auto },
    { key: 'square', label: shapeLabels.square },
    { key: 'dot', label: shapeLabels.rounded },
    { key: 'extra-rounded', label: shapeLabels.extraRounded },
  ];
  const cornerDotTypes: { key: string; label: string }[] = [
    { key: '', label: shapeLabels.auto },
    { key: 'square', label: shapeLabels.square },
    { key: 'dot', label: shapeLabels.rounded },
  ];
  function update<K extends keyof QrStyleOptions>(key: K, value: QrStyleOptions[K]) {
    onUpdateStyle({ ...qrStyle, [key]: value });
  }

  const advancedModified = hasAdvancedChanges(qrStyle);

  return (
    <Card>
      <CardContent>
        <button
          type="button"
          className="row-spread w-full"
          aria-expanded={expanded}
          onClick={() => onExpandedChange(!expanded)}
        >
          <div className="row">
            <QrCode className="h-4 w-4 text-[var(--text-tertiary)]" />
            <Label className="text-[15px] font-semibold text-[var(--text-primary)] pointer-events-none">{t('qrStyle.title', { defaultValue: 'QR Style' })}</Label>
          </div>
          <ChevronDown className={cn(
            'h-5 w-5 text-[var(--text-tertiary)] transition-transform duration-200',
            expanded && 'rotate-180',
          )} />
        </button>

        {expanded && (
          <div className="mt-3 space-y-4">
            <MiniPreview style={qrStyle} />

            {/* Dot Style */}
            <div className="px-1">
              <SectionLabel>{t('qrStyle.dotStyle', { defaultValue: 'Dot Style' })}</SectionLabel>
              <OptionGroup
                options={dotTypes}
                value={qrStyle.dotType}
                onChange={(v) => update('dotType', v)}
                size="sm"
              />
            </div>

            {/* Dot Color */}
            <div className="px-1">
              <QrColorPicker value={qrStyle.dotColor} onChange={(v) => update('dotColor', v)} label={t('qrStyle.dotColor', { defaultValue: 'Dot Color' })} />
            </div>

            {/* Advanced */}
            <div className="px-1">
              <Disclosure label={t('qrStyle.advanced', { defaultValue: 'Advanced' })} indicator={advancedModified}>
                <div className="space-y-3">
                  {/* Corner Square Style */}
                  <div>
                    <SectionLabel>{t('qrStyle.cornerSquareStyle', { defaultValue: 'Corner Square Style' })}</SectionLabel>
                    <OptionGroup
                      options={cornerSquareTypes}
                      value={qrStyle.cornerSquareType}
                      onChange={(v) => update('cornerSquareType', v as QrStyleOptions['cornerSquareType'])}
                      size="sm"
                    />
                    {qrStyle.cornerSquareType && (
                      <div className="mt-3">
                        <QrColorPicker value={qrStyle.cornerSquareColor} onChange={(v) => update('cornerSquareColor', v)} label={t('qrStyle.cornerSquareColor', { defaultValue: 'Corner Square Color' })} />
                      </div>
                    )}
                  </div>

                  <div className="border-t border-[var(--border-subtle)]" />

                  {/* Corner Dot Style */}
                  <div>
                    <SectionLabel>{t('qrStyle.cornerDotStyle', { defaultValue: 'Corner Dot Style' })}</SectionLabel>
                    <OptionGroup
                      options={cornerDotTypes}
                      value={qrStyle.cornerDotType}
                      onChange={(v) => update('cornerDotType', v as QrStyleOptions['cornerDotType'])}
                      size="sm"
                    />
                    {qrStyle.cornerDotType && (
                      <div className="mt-3">
                        <QrColorPicker value={qrStyle.cornerDotColor} onChange={(v) => update('cornerDotColor', v)} label={t('qrStyle.cornerDotColor', { defaultValue: 'Corner Dot Color' })} />
                      </div>
                    )}
                  </div>

                  <div className="border-t border-[var(--border-subtle)]" />

                  {/* Gradient */}
                  <div>
                    <div className="row-spread mb-2">
                      <SectionLabel>{t('qrStyle.gradient', { defaultValue: 'Gradient' })}</SectionLabel>
                      <Switch checked={qrStyle.useGradient} onCheckedChange={(v) => update('useGradient', v)} />
                    </div>
                    {qrStyle.useGradient && (
                      <div className="space-y-3 mt-1">
                        <OptionGroup
                          options={[
                            { key: 'linear' as const, label: t('qrStyle.linear', { defaultValue: 'Linear' }) },
                            { key: 'radial' as const, label: t('qrStyle.radial', { defaultValue: 'Radial' }) },
                          ]}
                          value={qrStyle.gradientType}
                          onChange={(v) => update('gradientType', v)}
                          size="sm"
                        />
                        <QrColorPicker value={qrStyle.gradientColor1} onChange={(v) => update('gradientColor1', v)} label={t('qrStyle.startColor', { defaultValue: 'Start Color' })} />
                        <QrColorPicker value={qrStyle.gradientColor2} onChange={(v) => update('gradientColor2', v)} label={t('qrStyle.endColor', { defaultValue: 'End Color' })} />
                        <div>
                          <div className="row-spread mb-1.5">
                            <span className="text-[12px] text-[var(--text-secondary)] font-medium">{t('qrStyle.rotation', { defaultValue: 'Rotation' })}</span>
                            <span className="text-[12px] text-[var(--text-tertiary)] tabular-nums font-medium">{qrStyle.gradientRotation}°</span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={360}
                            step={15}
                            value={qrStyle.gradientRotation}
                            onChange={(e) => update('gradientRotation', parseInt(e.target.value, 10))}
                            aria-label={t('qrStyle.rotationAria', { defaultValue: 'Gradient rotation angle' })}
                            className="qr-range-slider w-full"
                            list="rotation-ticks"
                          />
                          <datalist id="rotation-ticks">
                            {ROTATION_TICKS.map((deg) => (
                              <option key={deg} value={deg} label={`${deg}°`} />
                            ))}
                          </datalist>
                          <div className="flex justify-between text-[10px] text-[var(--text-tertiary)] mt-0.5 px-0.5" aria-hidden>
                            {ROTATION_TICKS.map((deg) => (
                              <span key={deg}>{`${deg}°`}</span>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="border-t border-[var(--border-subtle)]" />

                  {/* Error Correction */}
                  <div>
                    <SectionLabel>{t('qrStyle.errorCorrection', { defaultValue: 'Error Correction' })}</SectionLabel>
                    <OptionGroup
                      options={ERROR_LEVELS}
                      value={qrStyle.errorCorrection}
                      onChange={(v) => update('errorCorrection', v)}
                      size="sm"
                    />
                  </div>
                </div>
              </Disclosure>
            </div>

            {/* Reset */}
            {!isDefaultQrStyle(qrStyle) && (
              <div className="px-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onUpdateStyle({ ...DEFAULT_QR_STYLE })}
                  className="w-full"
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                  {t('qrStyle.reset', { defaultValue: 'Reset QR Style' })}
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
