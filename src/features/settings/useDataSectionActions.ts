import type { TFunction } from 'i18next';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/components/ui/toast';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { ExportData } from '@/types';
import {
  countCSVBins,
  exportAllData,
  exportCsv,
  exportZip,
  ImportError,
  type ImportResult,
  importCSV,
  importData,
  importZip,
  parseImportFile,
  validateCSVHeader,
} from './exportImport';

function importErrorMessage(err: unknown, t: TFunction<'settings'>): string {
  if (err instanceof ImportError) {
    switch (err.code) {
      case 'FILE_TOO_LARGE': return t('dataActions.fileTooLarge', { defaultValue: 'File is too large (max 100 MB)' });
      case 'INVALID_JSON': return t('dataActions.invalidJson', { defaultValue: 'File is not valid JSON' });
      case 'INVALID_FORMAT': return t('dataActions.invalidFormat', { defaultValue: 'Invalid backup file format' });
    }
  }
  return t('dataActions.failedToReadBackup', { defaultValue: 'Failed to read backup file' });
}

type ExportFormat = 'zip' | 'json' | 'csv';
type ImportFormat = 'zip' | 'json' | 'csv';

interface ImportPreview {
  toCreate: { name: string; itemCount: number; tags: string[] }[];
  toSkip: { name: string; reason: string }[];
  totalBins: number;
  totalItems: number;
}

export function useDataSectionActions() {
  const { activeLocationId } = useAuth();
  const { showToast } = useToast();
  const { t } = useTranslation('settings');

  function resolveLocationId(locationId?: string | null): string | null {
    return locationId ?? activeLocationId ?? null;
  }

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Export dialog
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<ExportFormat>('zip');
  const [exporting, setExporting] = useState(false);

  // Import dialog
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importFormatRaw, setImportFormatRaw] = useState<ImportFormat>('json');
  const [importMode, setImportModeRaw] = useState<'merge' | 'replace'>('merge');
  const [pendingData, setPendingData] = useState<ExportData | null>(null);
  const [csvPending, setCsvPending] = useState<{ file: File; bins: number; items: number } | null>(null);
  const [zipPending, setZipPending] = useState<{ file: File } | null>(null);
  const [importing, setImporting] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  // Cache the merge-mode result so mode toggles don't re-upload files
  const mergePreviewRef = useRef<ImportPreview | null>(null);

  async function fetchDryRun(
    source: { json: ExportData } | { file: File; format: 'csv' | 'zip' },
    mode: 'merge' | 'replace',
    locationId?: string | null,
  ) {
    const targetLocationId = resolveLocationId(locationId);
    if (!targetLocationId) return;
    try {
      let result: ImportPreview;
      if ('json' in source) {
        result = await apiFetch<ImportPreview>(`/api/locations/${targetLocationId}/import`, {
          method: 'POST',
          body: { bins: source.json.bins, mode, dryRun: true },
        });
      } else {
        const formData = new FormData();
        formData.append('file', source.file);
        formData.append('mode', mode);
        formData.append('dryRun', 'true');
        result = await apiFetch<ImportPreview>(
          `/api/locations/${targetLocationId}/import/${source.format}`,
          { method: 'POST', body: formData },
        );
      }
      if (mode === 'merge') mergePreviewRef.current = result;
      setImportPreview(result);
    } catch {
      // silently ignore — fall back to count-only summary
    }
  }

  function setImportFormat(format: ImportFormat) {
    setImportFormatRaw(format);
    setPendingData(null);
    setCsvPending(null);
    setZipPending(null);
    setImportPreview(null);
    mergePreviewRef.current = null;
  }

  function setImportMode(mode: 'merge' | 'replace') {
    setImportModeRaw(mode);
    if (!importPreview) return;

    if (mode === 'replace') {
      // In replace mode all bins are created — derive client-side, no re-upload
      const allBins = [...importPreview.toCreate, ...importPreview.toSkip.map(b => ({
        name: b.name, itemCount: 0, tags: [] as string[],
      }))];
      setImportPreview({
        toCreate: allBins,
        toSkip: [],
        totalBins: importPreview.totalBins,
        totalItems: importPreview.totalItems,
      });
    } else if (mergePreviewRef.current) {
      // Switching back to merge — use cached result
      setImportPreview(mergePreviewRef.current);
    } else if (importFormatRaw === 'json' && pendingData) {
      fetchDryRun({ json: pendingData }, mode);
    } else if (importFormatRaw === 'csv' && csvPending) {
      fetchDryRun({ file: csvPending.file, format: 'csv' }, mode);
    } else if (importFormatRaw === 'zip' && zipPending) {
      fetchDryRun({ file: zipPending.file, format: 'zip' }, mode);
    }
  }

  function resetImportState() {
    setPendingData(null);
    setCsvPending(null);
    setZipPending(null);
    setImportFormatRaw('zip');
    setImportModeRaw('merge');
    setImportPreview(null);
    mergePreviewRef.current = null;
  }

  // --- Export ---

  async function handleExport(locationId?: string | null) {
    const targetLocationId = resolveLocationId(locationId);
    if (!targetLocationId) {
      showToast({ message: t('dataActions.selectLocationFirst', { defaultValue: 'Select a location first' }) });
      return;
    }
    setExporting(true);
    try {
      switch (exportFormat) {
        case 'zip':
          await exportZip(targetLocationId);
          showToast({ message: t('dataActions.zipExported', { defaultValue: 'ZIP backup exported successfully' }) });
          break;
        case 'json':
          await exportAllData(targetLocationId);
          showToast({ message: t('dataActions.jsonExported', { defaultValue: 'Backup exported successfully' }) });
          break;
        case 'csv':
          await exportCsv(targetLocationId);
          showToast({ message: t('dataActions.csvExported', { defaultValue: 'CSV exported successfully' }) });
          break;
      }
      setExportDialogOpen(false);
    } catch {
      const message = exportFormat === 'zip'
        ? t('dataActions.zipExportFailed', { defaultValue: 'ZIP export failed' })
        : exportFormat === 'csv'
          ? t('dataActions.csvExportFailed', { defaultValue: 'CSV export failed' })
          : t('dataActions.exportFailed', { defaultValue: 'Export failed' });
      showToast({ message });
    } finally {
      setExporting(false);
    }
  }

  // --- Import ---

  function handleImportFileClick() {
    fileInputRef.current?.click();
  }

  async function handleImportFileSelected(files: FileList | null, locationId?: string | null) {
    const targetLocationId = resolveLocationId(locationId);
    if (!files?.[0] || !targetLocationId) return;
    const file = files[0];

    if (importFormatRaw === 'zip') {
      if (!file.name.toLowerCase().endsWith('.zip')) {
        showToast({ message: t('dataActions.pleaseSelectZip', { defaultValue: 'Please select a .zip file' }) });
      } else {
        setZipPending({ file });
        fetchDryRun({ file, format: 'zip' }, importMode, locationId);
      }
    } else if (importFormatRaw === 'json') {
      try {
        const data = await parseImportFile(file);
        setPendingData(data);
        fetchDryRun({ json: data }, importMode, locationId);
      } catch (err) {
        showToast({ message: importErrorMessage(err, t) });
      }
    } else {
      try {
        const text = await file.text();
        if (!text.trim()) {
          showToast({ message: t('dataActions.csvEmpty', { defaultValue: 'CSV file is empty' }) });
          return;
        }
        if (!validateCSVHeader(text)) {
          showToast({
            message: t('dataActions.invalidCsvHeader', {
              defaultValue: 'Invalid CSV header. Expected "Bin Name,Area,Item,Quantity,Tags" or "Bin Name,Area,Items,Tags"',
            }),
          });
          return;
        }
        const counts = countCSVBins(text);
        setCsvPending({ file, bins: counts.bins, items: counts.items });
        fetchDryRun({ file, format: 'csv' }, importMode, locationId);
      } catch {
        showToast({ message: t('dataActions.failedToReadCsv', { defaultValue: 'Failed to read CSV file' }) });
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function buildImportToast(result: ImportResult, isReplace: boolean): string {
    const parts: string[] = [];
    parts.push(t('dataActions.binsCount', { count: result.binsImported, defaultValue: '{{count}} bin' }));
    if (result.trashedBinsImported) {
      parts.push(t('dataActions.trashedCount', { count: result.trashedBinsImported, defaultValue: '{{count}} trashed' }));
    }
    if (result.photosImported) {
      parts.push(t('dataActions.photosCount', { count: result.photosImported, defaultValue: '{{count}} photo' }));
    }
    const main = parts.join(', ');
    const skipped = !isReplace && result.binsSkipped
      ? ` ${t('dataActions.skippedSuffix', { count: result.binsSkipped, defaultValue: '({{count}} skipped)' })}`
      : '';
    return isReplace
      ? t('dataActions.replacedAllData', { defaultValue: 'Replaced all data: {{summary}}', summary: main })
      : t('dataActions.imported', { defaultValue: 'Imported {{summary}}{{skipped}}', summary: main, skipped });
  }

  async function handleConfirmImport(locationId?: string | null) {
    const targetLocationId = resolveLocationId(locationId);
    if (!targetLocationId) return;

    if (importFormatRaw === 'zip' && zipPending) {
      setImporting(true);
      try {
        const result = await importZip(targetLocationId, zipPending.file, importMode);
        showToast({ message: buildImportToast(result, importMode === 'replace') });
        setZipPending(null);
        setImportDialogOpen(false);
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        showToast({ message: t('dataActions.zipImportFailed', { defaultValue: 'ZIP import failed: {{detail}}', detail }) });
      } finally {
        setImporting(false);
      }
    } else if (importFormatRaw === 'json' && pendingData) {
      setImporting(true);
      try {
        const result = await importData(targetLocationId, pendingData, importMode);
        showToast({ message: buildImportToast(result, importMode === 'replace') });
        setPendingData(null);
        setImportDialogOpen(false);
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        showToast({
          message: importMode === 'replace'
            ? t('dataActions.replaceImportFailed', { defaultValue: 'Replace import failed: {{detail}}', detail })
            : t('dataActions.importFailedGeneric', { defaultValue: 'Import failed: {{detail}}', detail }),
        });
      } finally {
        setImporting(false);
      }
    } else if (importFormatRaw === 'csv' && csvPending) {
      setImporting(true);
      try {
        const result = await importCSV(targetLocationId, csvPending.file, importMode);
        const bins = t('dataActions.binsCount', { count: result.binsImported, defaultValue: '{{count}} bin' });
        const items = t('dataActions.itemsCount', { count: result.itemsImported, defaultValue: '{{count}} item' });
        const skipped = result.binsSkipped
          ? ` ${t('dataActions.skippedSuffix', { count: result.binsSkipped, defaultValue: '({{count}} skipped)' })}`
          : '';
        showToast({
          message: t('dataActions.importedWithItems', { defaultValue: 'Imported {{bins}} with {{items}}{{skipped}}', bins, items, skipped }),
        });
        setCsvPending(null);
        setImportDialogOpen(false);
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        showToast({ message: t('dataActions.csvImportFailed', { defaultValue: 'CSV import failed: {{detail}}', detail }) });
      } finally {
        setImporting(false);
      }
    }
  }

  return {
    fileInputRef,
    exportDialogOpen,
    setExportDialogOpen,
    exportFormat,
    setExportFormat,
    exporting,
    importDialogOpen,
    setImportDialogOpen,
    importFormat: importFormatRaw,
    setImportFormat,
    importMode,
    setImportMode,
    pendingData,
    csvPending,
    zipPending,
    importing,
    importPreview,
    handleExport,
    handleImportFileClick,
    handleImportFileSelected,
    handleConfirmImport,
    resetImportState,
  };
}
