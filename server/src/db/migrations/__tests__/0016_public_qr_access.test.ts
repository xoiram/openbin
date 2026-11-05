import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { publicQrAccess } from '../0016_public_qr_access.js';
import { migrations } from '../index.js';
import { runSqliteMigrations } from '../runner.js';

const SCHEMA_DIR = path.join(import.meta.dirname, '..', '..', '..', '..');
const OLD_SCHEMA = fs.readFileSync(path.join(import.meta.dirname, 'fixtures', 'schema.sqlite.0015.sql'), 'utf-8');
const NEW_SCHEMA = fs.readFileSync(path.join(SCHEMA_DIR, 'schema.sqlite.sql'), 'utf-8');

interface ColumnInfo { name: string; type: string; notnull: number; dflt_value: string | null }

/** Name, type, nullability and default; position is ignored (ALTER ADD COLUMN appends, a fresh schema doesn't). */
function columns(db: Database.Database, table: string): ColumnInfo[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as ColumnInfo[])
    .map(({ name, type, notnull, dflt_value }) => ({ name, type, notnull, dflt_value }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** A database as it looked at migration 0015: old schema, all earlier migrations recorded, real rows. */
function oldDatabase(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(OLD_SCHEMA);
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY NOT NULL, applied_at TEXT NOT NULL DEFAULT (datetime('now')))");
  for (const m of migrations.filter((x) => x.name !== publicQrAccess.name)) {
    db.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(m.name);
  }
  db.exec(`
    INSERT INTO users (id, display_name, email) VALUES ('u1', 'Ann', 'ann@example.com');
    INSERT INTO locations (id, name, created_by, invite_code) VALUES ('l1', 'Home', 'u1', 'AAA');
    INSERT INTO bins (id, short_code, location_id, name) VALUES ('b1', 'AAAAAA', 'l1', 'Toolbox');
  `);
  return db;
}

describe('migration 0016_public_qr_access (SQLite)', () => {
  it('adds the columns with safe defaults and keeps existing rows', () => {
    const db = oldDatabase();
    expect(columns(db, 'locations').map((c) => c.name)).not.toContain('public_qr_access');

    runSqliteMigrations(db, migrations);

    const loc = db.prepare('SELECT public_qr_access AS a, public_qr_photos AS p FROM locations WHERE id = ?').get('l1');
    expect(loc).toEqual({ a: 0, p: 1 });
    const bin = db.prepare('SELECT name, public_view_count AS c, last_public_view_at AS t FROM bins WHERE id = ?').get('b1');
    expect(bin).toEqual({ name: 'Toolbox', c: 0, t: null });
    db.close();
  });

  it('is safe to run twice', () => {
    const db = oldDatabase();
    publicQrAccess.sqlite?.(db);
    expect(() => publicQrAccess.sqlite?.(db)).not.toThrow();
    db.close();
  });

  it('leaves a migrated database with the same columns as a fresh schema', () => {
    const migrated = oldDatabase();
    runSqliteMigrations(migrated, migrations);
    const fresh = new Database(':memory:');
    fresh.exec(NEW_SCHEMA);
    for (const table of ['locations', 'bins']) {
      expect(columns(migrated, table)).toEqual(columns(fresh, table));
    }
    migrated.close();
    fresh.close();
  });
});
