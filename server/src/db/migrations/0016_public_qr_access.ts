import type Database from 'better-sqlite3';
import type { Migration } from './types.js';

// ---------------------------------------------------------------------------
// Public QR access (see docs/public-qr-access.md)
//
//  - locations.public_qr_access   admin switch: anyone who scans a QR code sees a
//                                 read-only view of the location's boxes. Off by default.
//  - locations.public_qr_photos   whether that public view includes photos. On by default,
//                                 only meaningful while public_qr_access is on.
//  - bins.public_view_count       loads through the unauthenticated endpoint
//  - bins.last_public_view_at     when the last one happened
//
// No indexes: every lookup is by primary key.
// ---------------------------------------------------------------------------

const SQLITE_ALTER_STATEMENTS = [
  'ALTER TABLE locations ADD COLUMN public_qr_access INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE locations ADD COLUMN public_qr_photos INTEGER NOT NULL DEFAULT 1',
  'ALTER TABLE bins ADD COLUMN public_view_count INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE bins ADD COLUMN last_public_view_at TEXT',
];

const POSTGRES_ALTER_STATEMENTS = [
  'ALTER TABLE locations ADD COLUMN IF NOT EXISTS public_qr_access BOOLEAN NOT NULL DEFAULT FALSE',
  'ALTER TABLE locations ADD COLUMN IF NOT EXISTS public_qr_photos BOOLEAN NOT NULL DEFAULT TRUE',
  'ALTER TABLE bins ADD COLUMN IF NOT EXISTS public_view_count INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE bins ADD COLUMN IF NOT EXISTS last_public_view_at TEXT',
];

function safeAlterSqlite(db: Database.Database, sql: string): void {
  try {
    db.prepare(sql).run();
  } catch (err) {
    const msg = String((err as Error)?.message ?? '');
    if (/duplicate column name/i.test(msg)) return;
    throw err;
  }
}

export const publicQrAccess: Migration = {
  name: '0016_public_qr_access',
  sqlite(db) {
    for (const sql of SQLITE_ALTER_STATEMENTS) safeAlterSqlite(db, sql);
  },
  async postgres(pool) {
    for (const sql of POSTGRES_ALTER_STATEMENTS) {
      await pool.query(sql);
    }
  },
};
