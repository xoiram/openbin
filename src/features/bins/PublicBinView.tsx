import { ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { resolveIcon } from '@/lib/iconMap';
import { PublicPhotoGrid } from './PublicPhotoGrid';
import { getPublicPhotoUrls, type PublicBin } from './usePublicBin';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flat-card p-4 space-y-2">
      <h2 className="text-sm font-medium text-[var(--text-secondary)]">{title}</h2>
      {children}
    </div>
  );
}

/**
 * Read-only content of a publicly viewable box (docs/public-qr-access.md).
 * Renders without any app providers: it is used by anonymous visitors, who have no location,
 * terminology or permissions context, so it must not call useTerminology/usePermissions/usePlan.
 */
export function PublicBinView({ bin }: { bin: PublicBin }) {
  const { t } = useTranslation('bins');
  const Icon = resolveIcon(bin.icon);

  return (
    <div className="space-y-6">
      <div>
        {bin.parent && (
          <Link
            to={`/bin/${bin.parent.id}`}
            className="inline-flex items-center text-sm text-[var(--accent)] hover:underline mb-1"
          >
            {t('publicPage.insideParent', { defaultValue: 'Inside {{name}}', name: bin.parent.name })}
          </Link>
        )}
        <div className="flex items-center gap-2 mb-1">
          <Icon className="h-5 w-5 text-[var(--text-secondary)]" />
          <h1 className="text-xl font-semibold">{bin.name}</h1>
        </div>
        {bin.area_name && <p className="text-sm text-[var(--text-tertiary)]">{bin.area_name}</p>}
      </div>

      {bin.photos.length > 0 && (
        <Section title={t('sharedPage.photos', { defaultValue: 'Photos' })}>
          <PublicPhotoGrid photos={bin.photos} urls={(photoId) => getPublicPhotoUrls(bin.id, photoId)} />
        </Section>
      )}

      {bin.items.length > 0 && (
        <Section title={t('sharedPage.items', { defaultValue: 'Items' })}>
          <ul className="space-y-1">
            {bin.items.map((item, i) => (
              // Items have no public id and names can repeat, so the position is the stable key here
              // biome-ignore lint/suspicious/noArrayIndexKey: read-only list, never reordered
              <li key={`${i}-${item.name}`} className="flex items-center justify-between text-sm py-1 border-b border-[var(--border-subtle)] last:border-0">
                <span>{item.name}</span>
                {item.quantity != null && <span className="text-[var(--text-tertiary)] tabular-nums">{item.quantity}</span>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {bin.children.length > 0 && (
        <Section title={t('publicPage.contains', { defaultValue: 'Contains' })}>
          <ul className="space-y-1">
            {bin.children.map((child) => {
              const ChildIcon = resolveIcon(child.icon);
              return (
                <li key={child.id}>
                  <Link
                    to={`/bin/${child.id}`}
                    className="flex items-center gap-2 text-sm py-2 border-b border-[var(--border-subtle)] last:border-0 hover:text-[var(--accent)]"
                  >
                    <ChildIcon className="h-4 w-4 text-[var(--text-secondary)]" />
                    <span className="flex-1 min-w-0 truncate">{child.name}</span>
                    <span className="text-[var(--text-tertiary)] tabular-nums">
                      {t('publicPage.itemCount', { defaultValue_one: '{{count}} item', defaultValue_other: '{{count}} items', count: child.item_count })}
                    </span>
                    <ChevronRight className="h-4 w-4 text-[var(--text-tertiary)]" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {bin.notes.trim().length > 0 && (
        <Section title={t('sharedPage.notes', { defaultValue: 'Notes' })}>
          <p className="text-sm whitespace-pre-wrap">{bin.notes}</p>
        </Section>
      )}

      {bin.tags.length > 0 && (
        <Section title={t('sharedPage.tags', { defaultValue: 'Tags' })}>
          <div className="flex flex-wrap gap-1.5">
            {bin.tags.map((tag) => (
              <span key={tag} className="rounded-md bg-[var(--bg-input)] px-2 py-0.5 text-xs font-medium text-[var(--text-secondary)]">
                {tag}
              </span>
            ))}
          </div>
        </Section>
      )}

      {bin.custom_fields.length > 0 && (
        <Section title={t('sharedPage.details', { defaultValue: 'Details' })}>
          <dl className="space-y-1">
            {bin.custom_fields.map((field) => (
              <div key={field.name} className="flex items-center justify-between text-sm py-1 border-b border-[var(--border-subtle)] last:border-0">
                <dt className="text-[var(--text-tertiary)]">{field.name}</dt>
                <dd>{field.value}</dd>
              </div>
            ))}
          </dl>
        </Section>
      )}
    </div>
  );
}
