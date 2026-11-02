interface PublicPhotoGridProps {
  photos: Array<{ id: string; filename: string }>;
  /** Where a photo's full file and thumbnail live (differs for share links and public QR views). */
  urls: (photoId: string) => { file: string; thumb: string };
}

/** Thumbnail grid of unauthenticated photo links, shared by the share-link page and the public QR page. */
export function PublicPhotoGrid({ photos, urls }: PublicPhotoGridProps) {
  if (photos.length === 0) return null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {photos.map((p) => {
        const { file, thumb } = urls(p.id);
        return (
          <a
            key={p.id}
            href={file}
            target="_blank"
            rel="noopener noreferrer"
            className="block aspect-square rounded-[var(--radius-sm)] overflow-hidden bg-[var(--bg-input)]"
          >
            <img src={thumb} alt={p.filename} loading="lazy" className="w-full h-full object-cover" />
          </a>
        );
      })}
    </div>
  );
}
