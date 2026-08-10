import { Clock, Download, Trash2, Upload } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { LocationSelectList } from '@/features/locations/LocationSelectList';
import { useLocationList } from '@/features/locations/useLocations';
import { useAuth } from '@/lib/auth';

import type { Location } from '@/types';
import { SettingsPageHeader } from '../SettingsPageHeader';
import { SettingsRadioCard } from '../SettingsRadioCard';
import { SettingsRow } from '../SettingsRow';
import { SettingsSection } from '../SettingsSection';
import { useDataSectionActions } from '../useDataSectionActions';

function StepLabel({
  step,
  total,
  id,
  children,
}: {
  step: number;
  total: number;
  id?: string;
  children: ReactNode;
}) {
  const { t } = useTranslation('settings');
  return (
    <div className="flex items-center gap-2">
      <span
        aria-hidden="true"
        className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[var(--bg-active)] text-[var(--text-xs)] font-semibold tabular-nums text-[var(--text-secondary)]"
      >
        {step}
      </span>
      <span id={id} className="settings-subheading">
        {children}
        <span className="sr-only"> {t('data.stepOfSr', { defaultValue: '(step {{step}} of {{total}})', step, total })}</span>
      </span>
    </div>
  );
}

function LocationPickerSection({
  locations,
  value,
  onChange,
}: {
  locations: Location[];
  value: string | null;
  onChange: (id: string) => void;
}) {
  const { t } = useTranslation('settings');
  if (locations.length <= 1) return null;
  return (
    <div className="space-y-2">
      <span className="settings-subheading">{t('data.locationLabel', { defaultValue: 'Location' })}</span>
      <div className="max-h-40 overflow-y-auto">
        <LocationSelectList locations={locations} value={value} onChange={onChange} />
      </div>
    </div>
  );
}

export function DataSection() {
  const navigate = useNavigate();
  const { activeLocationId } = useAuth();
  const { t } = useTranslation('settings');

  const actions = useDataSectionActions();
  const {
    fileInputRef,
    exportDialogOpen,
    setExportDialogOpen,
    exportFormat,
    setExportFormat,
    exporting,
    importDialogOpen,
    setImportDialogOpen,
    importFormat,
    setImportFormat,
    importMode,
    setImportMode,
    pendingData,
    csvPending,
    zipPending,
    importing,
    importPreview: dryRunPreview,
    handleExport,
    handleImportFileClick,
    handleImportFileSelected,
    handleConfirmImport,
    resetImportState,
  } = actions;

  const { locations } = useLocationList();
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(activeLocationId ?? null);

  const activeLocation = locations.find((l) => l.id === activeLocationId);
  const selectedLocation = locations.find((l) => l.id === selectedLocationId);
  const selectedLocationName = selectedLocation?.name ?? t('data.currentLocation', { defaultValue: 'Current location' });

  const hasImportFile =
    (importFormat === 'zip' && zipPending != null) ||
    (importFormat === 'json' && pendingData != null) ||
    (importFormat === 'csv' && csvPending != null);

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  const importSummary = dryRunPreview
    ? null
    : importFormat === 'zip' && zipPending
      ? `${zipPending.file.name} (${formatFileSize(zipPending.file.size)})`
      : importFormat === 'json' && pendingData
        ? t('data.foundBins', { count: pendingData.bins.length, defaultValue: 'Found {{count}} bin' })
        : importFormat === 'csv' && csvPending
          ? t('data.foundBinsWithItems', {
              defaultValue: 'Found {{bins}} with {{items}}',
              bins: t('data.binsCount', { count: csvPending.bins, defaultValue: '{{count}} bin' }),
              items: t('data.itemsCount', { count: csvPending.items, defaultValue: '{{count}} item' }),
            })
          : null;

  return (
    <>
      <SettingsPageHeader
        title={t('data.title', { defaultValue: 'Data' })}
        description={t('data.description', { defaultValue: 'Export, import, and manage your workspace data.' })}
      />

      <SettingsSection label={t('data.manageSection', { defaultValue: 'Manage' })}>
        <SettingsRow
          icon={Clock}
          label={t('data.activityLogLabel', { defaultValue: 'Activity Log' })}
          description={
            activeLocation?.activity_retention_days
              ? t('data.activityLogDescWithDays', {
                  defaultValue: 'Changes from the last {{days}} days',
                  days: activeLocation.activity_retention_days,
                })
              : t('data.activityLogDescDefault', { defaultValue: 'Recent changes and actions' })
          }
          onClick={() => navigate('/settings/activity')}
        />
        <SettingsRow
          icon={Trash2}
          label={t('data.trashLabel', { defaultValue: 'Trash' })}
          description={
            activeLocation?.trash_retention_days
              ? t('data.trashDescWithDays', {
                  defaultValue: 'Restore within {{days}} days — then permanently deleted',
                  days: activeLocation.trash_retention_days,
                })
              : t('data.trashDescDefault', { defaultValue: 'Restore or permanently remove deleted bins' })
          }
          onClick={() => navigate('/settings/trash')}
        />
      </SettingsSection>

      <SettingsSection label={t('data.exportImportSection', { defaultValue: 'Export & Import' })} dividerAbove>
        <SettingsRow
          icon={Download}
          label={t('data.exportLabel', { defaultValue: 'Export' })}
          description={t('data.exportDesc', { defaultValue: 'Download a backup or spreadsheet of this workspace' })}
          onClick={() => {
            setSelectedLocationId(activeLocationId ?? null);
            setExportDialogOpen(true);
          }}
          disabled={!activeLocationId}
        />
        <SettingsRow
          icon={Upload}
          label={t('data.importLabel', { defaultValue: 'Import' })}
          description={t('data.importDesc', { defaultValue: 'Restore from a backup or load a spreadsheet' })}
          onClick={() => {
            resetImportState();
            setSelectedLocationId(activeLocationId ?? null);
            setImportDialogOpen(true);
          }}
          disabled={!activeLocationId}
        />
      </SettingsSection>

      <input
        ref={fileInputRef}
        type="file"
        accept={importFormat === 'zip' ? '.zip,application/zip' : importFormat === 'csv' ? '.csv,text/csv' : '.json'}
        className="hidden"
        onChange={(e) => handleImportFileSelected(e.target.files, selectedLocationId)}
      />

      <Dialog
        open={exportDialogOpen}
        onOpenChange={(open) => {
          if (!open && !exporting) setExportDialogOpen(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('data.exportDialogTitle', { defaultValue: 'Export' })}</DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            <LocationPickerSection
              locations={locations}
              value={selectedLocationId}
              onChange={setSelectedLocationId}
            />
            <div className="space-y-2.5">
              <span id="export-format-label" className="settings-subheading">
                {t('data.formatLabel', { defaultValue: 'Format' })}
              </span>
              <div className="flex flex-col gap-2" role="radiogroup" aria-labelledby="export-format-label">
                <SettingsRadioCard
                  name="export-format"
                  value="zip"
                  current={exportFormat}
                  onChange={setExportFormat}
                  title={t('data.backupZipTitle', { defaultValue: 'Backup (ZIP)' })}
                  description={t('data.backupZipDesc', { defaultValue: 'All data including photos' })}
                />
                <SettingsRadioCard
                  name="export-format"
                  value="json"
                  current={exportFormat}
                  onChange={setExportFormat}
                  title={t('data.backupJsonTitle', { defaultValue: 'Backup (JSON)' })}
                  description={t('data.backupJsonDesc', { defaultValue: 'Data and settings, no photos' })}
                />
                <SettingsRadioCard
                  name="export-format"
                  value="csv"
                  current={exportFormat}
                  onChange={setExportFormat}
                  title={t('data.spreadsheetCsvTitle', { defaultValue: 'Spreadsheet (CSV)' })}
                  description={t('data.spreadsheetCsvDescExport', { defaultValue: 'Open in Excel or Google Sheets' })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setExportDialogOpen(false)} disabled={exporting}>
              {t('data.cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button onClick={() => handleExport(selectedLocationId)} disabled={exporting}>
              {exporting
                ? t('data.exporting', { defaultValue: 'Exporting...' })
                : t('data.exportButton', { defaultValue: 'Export {{location}}', location: selectedLocationName })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={importDialogOpen}
        onOpenChange={(open) => {
          if (!open && !importing) {
            setImportDialogOpen(false);
            resetImportState();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('data.importDialogTitle', { defaultValue: 'Import' })}</DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            <LocationPickerSection
              locations={locations}
              value={selectedLocationId}
              onChange={setSelectedLocationId}
            />

            <div className="space-y-2.5">
              <StepLabel step={1} total={3} id="import-format-label">{t('data.formatLabel', { defaultValue: 'Format' })}</StepLabel>
              <div className="flex flex-col gap-2" role="radiogroup" aria-labelledby="import-format-label">
                <SettingsRadioCard
                  name="import-format"
                  value="zip"
                  current={importFormat}
                  onChange={setImportFormat}
                  title={t('data.backupZipTitle', { defaultValue: 'Backup (ZIP)' })}
                  description={t('data.backupZipDesc', { defaultValue: 'All data including photos' })}
                />
                <SettingsRadioCard
                  name="import-format"
                  value="json"
                  current={importFormat}
                  onChange={setImportFormat}
                  title={t('data.backupJsonTitle', { defaultValue: 'Backup (JSON)' })}
                  description={t('data.backupJsonDesc', { defaultValue: 'Data and settings, no photos' })}
                />
                <SettingsRadioCard
                  name="import-format"
                  value="csv"
                  current={importFormat}
                  onChange={setImportFormat}
                  title={t('data.spreadsheetCsvTitle', { defaultValue: 'Spreadsheet (CSV)' })}
                  description={t('data.spreadsheetCsvDescImport', { defaultValue: 'Bins and items from a spreadsheet' })}
                />
              </div>
            </div>

            <div className="space-y-2.5">
              <StepLabel step={2} total={3} id="import-mode-label">{t('data.modeLabel', { defaultValue: 'Mode' })}</StepLabel>
              <div className="flex flex-col gap-2" role="radiogroup" aria-labelledby="import-mode-label">
                <SettingsRadioCard
                  name="import-mode"
                  value="merge"
                  current={importMode}
                  onChange={setImportMode}
                  title={t('data.mergeTitle', { defaultValue: 'Merge' })}
                  description={t('data.mergeDesc', { defaultValue: 'Add new data, skip existing' })}
                />
                <SettingsRadioCard
                  name="import-mode"
                  value="replace"
                  current={importMode}
                  onChange={setImportMode}
                  title={t('data.replaceTitle', { defaultValue: 'Replace' })}
                  description={t('data.replaceDesc', { defaultValue: 'Delete all existing data first' })}
                  destructive
                />
              </div>
            </div>

            <div className="space-y-2.5">
              <StepLabel step={3} total={3}>{t('data.fileLabel', { defaultValue: 'File' })}</StepLabel>
              <Button variant="outline" onClick={handleImportFileClick} disabled={importing}>
                {hasImportFile ? t('data.changeFile', { defaultValue: 'Change File' }) : t('data.selectFile', { defaultValue: 'Select File' })}
              </Button>
              {dryRunPreview && (
                <div className="max-h-48 overflow-y-auto space-y-1 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-input)] p-2 text-[var(--text-sm)]">
                  {dryRunPreview.toCreate.map((b) => (
                    <div
                      key={b.name}
                      className="flex items-center gap-2 rounded-[var(--radius-xs)] px-2 py-1"
                    >
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-success)]" />
                      <span className="truncate flex-1">{b.name}</span>
                      <span className="tabular-nums text-[var(--text-tertiary)]">
                        {t('data.itemsCount', { count: b.itemCount, defaultValue: '{{count}} items' })}
                      </span>
                    </div>
                  ))}
                  {dryRunPreview.toSkip.map((b) => (
                    <div
                      key={`skip-${b.name}`}
                      className="flex items-center gap-2 rounded-[var(--radius-xs)] px-2 py-1 opacity-50"
                    >
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--text-tertiary)]" />
                      <span className="truncate flex-1">{b.name}</span>
                      <span className="text-[var(--text-tertiary)]">{t('data.skip', { defaultValue: 'skip' })}</span>
                    </div>
                  ))}
                </div>
              )}
              {importSummary && (
                <p className="settings-row-desc">{importSummary}</p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setImportDialogOpen(false);
                resetImportState();
              }}
              disabled={importing}
            >
              {t('data.cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button
              variant={importMode === 'replace' ? 'destructive' : 'default'}
              onClick={() => handleConfirmImport(selectedLocationId)}
              disabled={!hasImportFile || importing}
            >
              {importing
                ? t('data.importing', { defaultValue: 'Importing...' })
                : importMode === 'replace'
                  ? t('data.replaceAndImport', { defaultValue: 'Replace & Import' })
                  : t('data.importButton', { defaultValue: 'Import {{location}}', location: selectedLocationName })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
