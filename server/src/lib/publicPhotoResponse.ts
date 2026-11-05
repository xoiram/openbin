import path from 'node:path';
import type { Response } from 'express';
import { query } from '../db.js';
import { config } from './config.js';
import { NotFoundError } from './httpErrors.js';
import { storage } from './storage.js';

/** Row fields the photo responders need. */
export interface PhotoFileRow {
  storage_path: string;
  mime_type: string;
}

export interface PhotoThumbRow {
  storage_path: string;
  thumb_path: string | null;
}

/** Security headers for every unauthenticated response (share links and public QR views). */
export function setSharedHeaders(res: Response): void {
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
}

/** Stream the original photo file. */
export async function sendPhotoFile(res: Response, photo: PhotoFileRow): Promise<void> {
  if (!(await storage.exists(photo.storage_path))) throw new NotFoundError('Photo file not found');

  setSharedHeaders(res);
  res.setHeader('Content-Type', photo.mime_type || 'application/octet-stream');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  storage.readStream(photo.storage_path).pipe(res);
}

/** Stream a photo thumbnail, generating and storing it on first request; falls back to the original. */
export async function sendPhotoThumb(res: Response, photoId: string, photo: PhotoThumbRow): Promise<void> {
  setSharedHeaders(res);

  // Serve existing thumbnail if available
  if (photo.thumb_path && (await storage.exists(photo.thumb_path))) {
    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    storage.readStream(photo.thumb_path).pipe(res);
    return;
  }

  // Generate thumbnail lazily
  if (!(await storage.exists(photo.storage_path))) throw new NotFoundError('Photo file not found');

  try {
    const thumbFilename = `${path.basename(photo.storage_path, path.extname(photo.storage_path))}_thumb.webp`;
    const thumbStoragePath = path.join(path.dirname(photo.storage_path), thumbFilename);

    if (config.storageBackend === 's3') {
      const { generateThumbnailBuffer } = await import('./thumbnailPool.js');
      const originalBuffer = await storage.read(photo.storage_path);
      const thumbBuffer = await generateThumbnailBuffer(originalBuffer);
      await storage.upload(thumbStoragePath, thumbBuffer, 'image/webp');
      await query('UPDATE photos SET thumb_path = $1 WHERE id = $2', [thumbStoragePath, photoId]);

      res.setHeader('Content-Type', 'image/webp');
      res.setHeader('Cache-Control', 'private, max-age=3600');
      res.end(thumbBuffer);
    } else {
      const { generateThumbnail } = await import('./photoHelpers.js');
      const { safePath } = await import('./pathSafety.js');
      const { PHOTO_STORAGE_PATH } = await import('./uploadConfig.js');

      const thumbFullPath = path.join(PHOTO_STORAGE_PATH, thumbStoragePath);
      const originalFile = safePath(PHOTO_STORAGE_PATH, photo.storage_path);
      if (!originalFile) throw new NotFoundError('Photo file not found');

      await generateThumbnail(originalFile, thumbFullPath);
      await query('UPDATE photos SET thumb_path = $1 WHERE id = $2', [thumbStoragePath, photoId]);

      res.setHeader('Content-Type', 'image/webp');
      res.setHeader('Cache-Control', 'private, max-age=3600');
      storage.readStream(thumbStoragePath).pipe(res);
    }
  } catch {
    // Fallback to original photo
    const mimeResult = await query('SELECT mime_type FROM photos WHERE id = $1', [photoId]);
    const mimeType = mimeResult.rows[0]?.mime_type || 'application/octet-stream';
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    storage.readStream(photo.storage_path).pipe(res);
  }
}
