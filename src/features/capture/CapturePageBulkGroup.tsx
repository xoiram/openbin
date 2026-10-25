import type { TFunction } from 'i18next';
import { Check, Images, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { TourLauncher } from '@/features/tour/TourLauncher';
import { useTerminology } from '@/lib/terminology';
import { cn, focusRing } from '@/lib/utils';
import { CameraStartScreen } from './CameraStartScreen';
import { setCapturedPhotos, setCapturedReturnTarget } from './capturedPhotos';
import { FirstRunCoachmark, HelpButton } from './guidance/CameraGuidance';
import { ShutterButton } from './ShutterButton';
import { ThumbnailItem } from './ThumbnailItem';
import { useCaptureGrouping } from './useCaptureGrouping';
import { Viewfinder } from './Viewfinder';

function viewfinderHint(t: TFunction<'capture'>, bin: string, currentGroup: number, photosInCurrentGroup: number): string {
  if (currentGroup === 0 && photosInCurrentGroup === 0) return t('hints.tapShutter', { defaultValue: 'tap shutter to capture' });
  if (currentGroup === 0 && photosInCurrentGroup > 0) return t('hints.keepShooting', { defaultValue: 'keep shooting — same {{bin}}', bin });
  if (currentGroup > 0 && photosInCurrentGroup === 0) return t('hints.newBin', { defaultValue: 'new {{bin}} — aim & shoot', bin });
  return t('hints.doneWhenFinished', { defaultValue: 'Done when finished' });
}

export function CapturePageBulkGroup() {
  const { t } = useTranslation('capture');
  const term = useTerminology();
  const navigate = useNavigate();
  const {
    videoRef,
    isStreaming,
    error,
    photos,
    currentGroup,
    photosInCurrentGroup,
    groups,
    importFiles,
    capture,
    nextGroup,
    removePhoto,
    startCamera,
    cleanup,
  } = useCaptureGrouping();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => cleanup, [cleanup]);

  function handleClose() {
    if (photos.length > 0) {
      const ok = window.confirm(
        t('discardConfirm', {
          count: photos.length,
          defaultValue_one: 'Discard {{count}} photo?',
          defaultValue_other: 'Discard {{count}} photos?',
        }),
      );
      if (!ok) return;
    }
    navigate(-1);
  }

  function handleLibrary() {
    fileInputRef.current?.click();
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    importFiles(Array.from(files));
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleDone() {
    if (photos.length === 0) return;
    const files: File[] = [];
    const groupIds: number[] = [];
    photos.forEach((p, i) => {
      files.push(new File([p.blob], `capture-${i + 1}.jpg`, { type: 'image/jpeg' }));
      groupIds.push(p.groupId ?? currentGroup);
    });
    setCapturedPhotos(files, groupIds);
    setCapturedReturnTarget('bin-create');
    navigate(-1);
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      {/* Always rendered so videoRef is available when startCamera fires */}
      <video
        ref={videoRef}
        playsInline
        muted
        className="absolute inset-0 h-full w-full object-cover"
      />

      {!isStreaming && (
        <CameraStartScreen
          hasCamera={!!navigator.mediaDevices?.getUserMedia}
          error={error}
          onStart={() => startCamera()}
          onCancel={() => navigate(-1)}
        />
      )}

      <FirstRunCoachmark isStreaming={isStreaming} />

      {isStreaming && (
        <>
          {/* Top bar */}
          <div
            className="relative z-10 flex items-center justify-between px-3 py-2 bg-black/50"
            style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top, 0.5rem))' }}
          >
            <button
              type="button"
              onClick={handleClose}
              className={cn(
                focusRing,
                'h-8 w-8 flex items-center justify-center text-white/90 hover:text-white focus-visible:ring-offset-2 focus-visible:ring-offset-black',
              )}
              aria-label={t('close', { defaultValue: 'Close' })}
            >
              <X className="h-5 w-5" />
            </button>

            <div
              aria-live="polite"
              className="text-[11px] font-medium text-white/90 tracking-wide"
            >
              {t('bulk.groupStatus', {
                count: photosInCurrentGroup,
                index: currentGroup + 1,
                defaultValue_one: '{{Bin}} #{{index}} · {{count}} photo',
                defaultValue_other: '{{Bin}} #{{index}} · {{count}} photos',
                Bin: term.Bin,
              })}
            </div>

            <div className="flex items-center gap-2">
              <TourLauncher tourId="create-ai" />
              <HelpButton className="bg-transparent hover:bg-white/10" />
              <button
                type="button"
                onClick={handleLibrary}
                className={cn(
                  focusRing,
                  'h-8 w-8 flex items-center justify-center text-white/90 hover:text-white focus-visible:ring-offset-2 focus-visible:ring-offset-black',
                )}
                aria-label={t('bulk.openLibrary', { defaultValue: 'Open photo library' })}
              >
                <Images className="h-5 w-5" />
              </button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFileInput}
            />
          </div>

          <Viewfinder hint={viewfinderHint(t, term.bin, currentGroup, photosInCurrentGroup)} />

          {/* Photo strip */}
          <div
            className="relative z-10 bg-black/50 overflow-x-auto overflow-y-hidden"
            style={{ minHeight: 56 }}
          >
            {photos.length === 0 ? (
              <div className="px-3 py-3 text-[12px] text-white/40 italic">
                {t('noPhotosYet', { defaultValue: 'No photos yet' })}
              </div>
            ) : (
              /* Outer wrapper is <div> not <ul>: groups are visual clusters; only photo <li>s are listitems */
              <div className="flex items-center gap-0 px-3 py-2">
                {groups.map((group, groupIdx) => (
                  <div key={group.id} className="flex items-center">
                    <ul className="flex items-center gap-[2px]">
                      {group.photos.map((photo, photoIdx) => (
                        <ThumbnailItem
                          key={photo.id}
                          photo={photo}
                          groupIdx={groupIdx}
                          photoIdx={photoIdx}
                          onRemove={removePhoto}
                        />
                      ))}
                    </ul>
                    {groupIdx < groups.length - 1 && (
                      <div
                        data-testid={`group-divider-${group.id}-${groups[groupIdx + 1].id}`}
                        className="mx-1 h-9 w-[2px] rounded-[1px] bg-[var(--accent)]"
                        aria-hidden="true"
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Bottom controls */}
          <div
            className="relative z-10 flex items-center justify-between px-4 pt-2 pb-4 bg-black/50"
            style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 1rem))' }}
          >
            <button
              type="button"
              disabled={photos.length === 0}
              onClick={handleDone}
              aria-label={t('done', { defaultValue: 'Done' })}
              className={cn(
                focusRing,
                'w-[54px] text-[13px] focus-visible:ring-offset-2 focus-visible:ring-offset-black',
                photos.length === 0
                  ? 'font-medium text-white/35 cursor-not-allowed'
                  : 'font-semibold text-white hover:text-white/90',
              )}
            >
              {t('done', { defaultValue: 'Done' })}
            </button>

            <ShutterButton
              onClick={capture}
              showAccentRing={photosInCurrentGroup === 0}
            />

            <button
              type="button"
              disabled={photosInCurrentGroup === 0}
              onClick={nextGroup}
              data-tour="capture-grouping"
              aria-label={t('bulk.nextBin', { defaultValue: 'Next {{bin}}', bin: term.bin })}
              className={cn(
                focusRing,
                'w-[54px] text-[9px] leading-[1.1] flex flex-col items-center gap-[1px] focus-visible:ring-offset-2 focus-visible:ring-offset-black',
                photosInCurrentGroup === 0
                  ? 'text-white/35 cursor-not-allowed'
                  : 'text-[var(--accent)] font-semibold hover:brightness-125',
              )}
            >
              <Check className="h-3 w-3" aria-hidden="true" />
              <span>{t('bulk.nextBinLine1', { defaultValue: 'Next' })}</span>
              <span>{t('bulk.nextBinLine2', { defaultValue: '{{bin}}', bin: term.bin })}</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
