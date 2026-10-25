import { AlertCircle, Lock, Plus, RotateCcw, ScanLine, Search, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BinCreateDialog } from '@/features/bins/BinCreateDialog';
import { lookupBinByCodeSafe } from '@/features/bins/useBins';
import { recordScan } from '@/features/dashboard/scanHistory';
import { recordBinUsage } from '@/features/usage/recordBinUsage';
import { ApiError, apiFetch } from '@/lib/api';
import { BIN_URL_REGEX } from '@/lib/qr';
import { useTerminology } from '@/lib/terminology';
import { haptic } from '@/lib/utils';
import { Html5QrcodePlugin } from './Html5QrcodePlugin';

interface ScanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ScanDialog({ open, onOpenChange }: ScanDialogProps) {
  const { t } = useTranslation('qrcode');
  const term = useTerminology();
  const navigate = useNavigate();
  const [error, setError] = useState<string>('');
  const [scanning, setScanning] = useState(true);
  const [unknownId, setUnknownId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [manualError, setManualError] = useState('');
  const [manualLoading, setManualLoading] = useState(false);
  const [scanErrorType, setScanErrorType] = useState<'deleted' | 'forbidden' | null>(null);

  // Reset all state when dialog opens
  useEffect(() => {
    if (open) {
      setError('');
      setUnknownId(null);
      setManualCode('');
      setManualError('');
      setManualLoading(false);
      setScanning(true);
      setScanErrorType(null);
    }
  }, [open]);

  async function handleManualLookup() {
    const code = manualCode.trim().toUpperCase();
    if (!code) return;
    setManualError('');
    setManualLoading(true);
    try {
      const result = await lookupBinByCodeSafe(code);
      if (result.status === 'found' && result.bin) {
        haptic();
        recordScan(result.bin.id);
        recordBinUsage(result.bin.id, 'manual');
        onOpenChange(false);
        navigate(`/bin/${result.bin.id}`);
        return;
      }
      if (result.status === 'deleted') {
        setScanErrorType('deleted');
        return;
      }
      if (result.status === 'forbidden') {
        setScanErrorType('forbidden');
        return;
      }
      setManualError(t('scan.noBinWithCode', { defaultValue: 'No {{bin}} found with that code', bin: term.bin }));
    } catch {
      setManualError(t('scan.noBinWithCode', { defaultValue: 'No {{bin}} found with that code', bin: term.bin }));
    } finally {
      setManualLoading(false);
    }
  }

  const handleScan = useCallback(
    async (decodedText: string) => {
      const match = decodedText.match(BIN_URL_REGEX);
      if (match) {
        const binId = match[1];
        haptic();
        setScanning(false);
        try {
          await apiFetch(`/api/bins/${binId}`);
          recordScan(binId);
          recordBinUsage(binId, 'scan');
          onOpenChange(false);
          navigate(`/bin/${binId}`);
        } catch (err: unknown) {
          const status = err instanceof ApiError ? err.status : undefined;
          if (status === 410) {
            setScanErrorType('deleted');
          } else if (status === 403) {
            setScanErrorType('forbidden');
          } else {
            setUnknownId(binId);
          }
        }
      } else {
        setScanning(false);
        setError(decodedText);
      }
    },
    [navigate, onOpenChange],
  );

  function handleRetry() {
    setError('');
    setUnknownId(null);
    setScanErrorType(null);
    setScanning(true);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('scan.title', { defaultValue: 'Scan QR Code' })}</DialogTitle>
          </DialogHeader>

          {error ? (
            <Card>
              <CardContent className="py-8">
                <div className="flex flex-col items-center gap-5 text-center">
                  <div className="h-14 w-14 rounded-[var(--radius-xl)] bg-[var(--destructive)] bg-opacity-10 flex items-center justify-center">
                    <AlertCircle className="h-7 w-7 text-[var(--destructive)]" />
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-[17px] font-semibold text-[var(--text-primary)]">{t('scan.notABinQr', { defaultValue: 'Not a {{bin}} QR Code', bin: term.Bin })}</p>
                    <p className="text-[13px] text-[var(--text-tertiary)] break-all max-w-xs mx-auto leading-relaxed">{error}</p>
                  </div>
                  <Button variant="outline" onClick={handleRetry} className="mt-1">
                    <RotateCcw className="h-4 w-4 mr-1.5" />
                    {t('scan.scanAgain', { defaultValue: 'Scan Again' })}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : scanErrorType === 'deleted' ? (
            <Card>
              <CardContent className="py-8">
                <div className="flex flex-col items-center gap-5 text-center">
                  <div className="h-14 w-14 rounded-[var(--radius-xl)] bg-[var(--destructive)] bg-opacity-10 flex items-center justify-center">
                    <Trash2 className="h-7 w-7 text-[var(--destructive)]" />
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-[17px] font-semibold text-[var(--text-primary)]">{t('scan.deletedTitle', { defaultValue: 'This {{bin}} was deleted', bin: term.bin })}</p>
                    <p className="text-[13px] text-[var(--text-tertiary)] leading-relaxed">
                      {t('scan.deletedDescription', { defaultValue: 'It may be restorable from the trash.' })}
                    </p>
                  </div>
                  <div className="flex gap-2.5 mt-1">
                    <Button variant="outline" onClick={handleRetry}>
                      <RotateCcw className="h-4 w-4 mr-1.5" />
                      {t('scan.scanAgain', { defaultValue: 'Scan Again' })}
                    </Button>
                    <Button onClick={() => { onOpenChange(false); navigate('/trash'); }}>
                      <Trash2 className="h-4 w-4 mr-1.5" />
                      {t('scan.viewTrash', { defaultValue: 'View Trash' })}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : scanErrorType === 'forbidden' ? (
            <Card>
              <CardContent className="py-8">
                <div className="flex flex-col items-center gap-5 text-center">
                  <div className="h-14 w-14 rounded-[var(--radius-xl)] bg-[var(--accent)] bg-opacity-10 flex items-center justify-center">
                    <Lock className="h-7 w-7 text-[var(--accent)]" />
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-[17px] font-semibold text-[var(--text-primary)]">{t('scan.forbiddenTitle', { defaultValue: 'This {{bin}} belongs to another {{location}}', bin: term.bin, location: term.location })}</p>
                    <p className="text-[13px] text-[var(--text-tertiary)] leading-relaxed">
                      {t('scan.forbiddenDescription', { defaultValue: 'You need to join the {{location}} that owns this {{bin}} to view it.', bin: term.bin, location: term.location })}
                    </p>
                  </div>
                  <Button variant="outline" onClick={handleRetry} className="mt-1">
                    <RotateCcw className="h-4 w-4 mr-1.5" />
                    {t('scan.scanAgain', { defaultValue: 'Scan Again' })}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : unknownId ? (
            <Card>
              <CardContent className="py-8">
                <div className="flex flex-col items-center gap-5 text-center">
                  <div className="h-14 w-14 rounded-[var(--radius-xl)] bg-[var(--accent)] bg-opacity-10 flex items-center justify-center">
                    <ScanLine className="h-7 w-7 text-[var(--accent)]" />
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-[17px] font-semibold text-[var(--text-primary)]">{t('scan.notFoundTitle', { defaultValue: '{{bin}} Not Found', bin: term.Bin })}</p>
                    <p className="text-[13px] text-[var(--text-tertiary)] leading-relaxed">
                      {t('scan.notFoundDescription', { defaultValue: "This QR code points to a {{bin}} that doesn't exist yet.", bin: term.bin })}
                    </p>
                  </div>
                  <div className="flex gap-2.5 mt-1">
                    <Button variant="outline" onClick={handleRetry}>
                      <RotateCcw className="h-4 w-4 mr-1.5" />
                      {t('scan.scanAgain', { defaultValue: 'Scan Again' })}
                    </Button>
                    <Button onClick={() => setCreateOpen(true)}>
                      <Plus className="h-4 w-4 mr-1.5" />
                      {t('scan.createBin', { defaultValue: 'Create {{bin}}', bin: term.Bin })}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <CardContent className="py-5">
                {open && <Html5QrcodePlugin paused={!scanning} onScanSuccess={handleScan} />}
                {scanning && (
                  <p className="mt-5 text-center text-[13px] text-[var(--text-tertiary)]">
                    {t('scan.pointCamera', { defaultValue: 'Point your camera at a {{bin}} QR code', bin: term.bin })}
                  </p>
                )}
                {!scanning && (
                  <div className="flex items-center justify-center py-8 text-[var(--text-tertiary)]">
                    {t('scan.redirecting', { defaultValue: 'Redirecting...' })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Manual lookup by short code */}
          <div className="mt-4">
            <Label className="text-[15px] font-semibold text-[var(--text-primary)] mb-3 block">
              {t('scan.manualLookup', { defaultValue: 'Manual Lookup' })}
            </Label>
            <div className="flex gap-2">
              <Input
                value={manualCode}
                onChange={(e) => {
                  setManualCode(e.target.value.toUpperCase());
                  setManualError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleManualLookup();
                  }
                }}
                placeholder={t('scan.codePlaceholder', { defaultValue: 'Enter {{bin}} code', bin: term.bin })}
                maxLength={6}
                disabled={manualLoading}
                className="flex-1 font-mono uppercase tracking-widest"
              />
              <Button
                onClick={handleManualLookup}
                disabled={!manualCode.trim() || manualLoading}
                className="rounded-[var(--radius-md)] shrink-0"
              >
                <Search className="h-4 w-4 mr-1.5" />
                {t('scan.lookUp', { defaultValue: 'Look Up' })}
              </Button>
            </div>
            {manualError && (
              <p className="mt-2 text-[13px] text-[var(--destructive)]">{manualError}</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <BinCreateDialog
        open={createOpen}
        onOpenChange={(o) => {
          setCreateOpen(o);
          if (!o) handleRetry();
        }}
      />

    </>
  );
}
