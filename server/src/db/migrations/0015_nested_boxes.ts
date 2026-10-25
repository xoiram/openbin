import type Database from 'better-sqlite3';
import type { Migration } from './types.js';

// ---------------------------------------------------------------------------
// Nested boxes and items in areas (see docs/nested-boxes.md)
//
//  - bins.parent_bin_id        a box can sit inside one other box (max depth 2,
//                              enforced in lib/binHierarchy.ts, not in SQL)
//  - bin_items.bin_id          nullable: an item can live in an area, or nowhere
//  - bin_items.area_id         new, ON DELETE SET NULL (deleting an area leaves
//                              its loose items unassigned, like its boxes)
//  - bin_items.location_id     new NOT NULL, backfilled from the item's box. An
//                              unassigned item has neither box nor area, so it
//                              carries its own location for scoping/permissions
//  - bin_items CHECK           an item has a box OR an area, never both
//  - item_checkouts            origin/return bin ids nullable + area columns
//  - shopping_list_items       origin_area_id
//
// SQLite cannot drop NOT NULL, so bin_items and item_checkouts are rebuilt.
// item_checkouts.item_id cascades from bin_items and SQLite runs with
// foreign_keys = ON: a plain DROP TABLE bin_items would delete every checkout
// row. The rebuild therefore follows the 0010 pattern (FKs off around the swap,
// own transaction, foreign_key_check before commit) and asserts row counts.
// ---------------------------------------------------------------------------

/**
 * Indexes on the new columns. Kept out of schema.{sqlite,pg}.sql on purpose:
 * the schema files run on every start *before* migrations, so on an existing
 * database an index on a not-yet-added column would abort startup. init.ts runs
 * these after migrations (fresh installs never run this migration).
 */
export const NESTED_BOXES_INDEXES_SQLITE = `
  CREATE INDEX IF NOT EXISTS idx_bins_parent_bin_id ON bins(parent_bin_id);
  CREATE INDEX IF NOT EXISTS idx_bin_items_area_id ON bin_items(area_id);
  CREATE INDEX IF NOT EXISTS idx_bin_items_location_id ON bin_items(location_id);
  CREATE INDEX IF NOT EXISTS idx_shopping_list_items_area ON shopping_list_items(origin_area_id);
`;

export const NESTED_BOXES_INDEXES_PG = NESTED_BOXES_INDEXES_SQLITE;

function columnNames(db: Database.Database, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
}

function countRows(db: Database.Database, table: string): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
}

function addColumnIfMissing(db: Database.Database, table: string, column: string, ddl: string): void {
  if (!columnNames(db, table).includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}

const SQLITE_BIN_ITEMS_NEW = `
  CREATE TABLE bin_items_new (
    id          TEXT PRIMARY KEY,
    bin_id      TEXT REFERENCES bins(id) ON DELETE CASCADE,
    area_id     TEXT REFERENCES areas(id) ON DELETE SET NULL,
    location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    quantity    INTEGER DEFAULT NULL,
    position    INTEGER NOT NULL DEFAULT 0,
    deleted_at  TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (bin_id IS NULL OR area_id IS NULL)
  )
`;

const SQLITE_BIN_ITEMS_COPY = `
  INSERT INTO bin_items_new (id, bin_id, area_id, location_id, name, quantity, position, deleted_at, created_at, updated_at)
  SELECT bi.id, bi.bin_id, NULL, b.location_id, bi.name, bi.quantity, bi.position, bi.deleted_at, bi.created_at, bi.updated_at
  FROM bin_items bi JOIN bins b ON b.id = bi.bin_id
`;

const SQLITE_BIN_ITEMS_INDEXES = `
  CREATE INDEX IF NOT EXISTS idx_bin_items_bin_id ON bin_items(bin_id, position);
  CREATE INDEX IF NOT EXISTS idx_bin_items_deleted_at ON bin_items(deleted_at);
`;

const SQLITE_CHECKOUTS_NEW = `
  CREATE TABLE item_checkouts_new (
    id              TEXT PRIMARY KEY,
    item_id         TEXT NOT NULL REFERENCES bin_items(id) ON DELETE CASCADE,
    origin_bin_id   TEXT,
    origin_area_id  TEXT,
    location_id     TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    checked_out_by  TEXT NOT NULL REFERENCES users(id),
    checked_out_at  TEXT NOT NULL DEFAULT (datetime('now')),
    returned_at     TEXT,
    returned_by     TEXT REFERENCES users(id),
    return_bin_id   TEXT,
    return_area_id  TEXT
  )
`;

const SQLITE_CHECKOUTS_COPY = `
  INSERT INTO item_checkouts_new (id, item_id, origin_bin_id, origin_area_id, location_id, checked_out_by, checked_out_at, returned_at, returned_by, return_bin_id, return_area_id)
  SELECT id, item_id, origin_bin_id, NULL, location_id, checked_out_by, checked_out_at, returned_at, returned_by, return_bin_id, NULL
  FROM item_checkouts
`;

const SQLITE_CHECKOUTS_INDEXES = `
  CREATE INDEX IF NOT EXISTS idx_item_checkouts_active ON item_checkouts(location_id) WHERE returned_at IS NULL;
  CREATE INDEX IF NOT EXISTS idx_item_checkouts_item ON item_checkouts(item_id, returned_at);
`;

/** Rebuild a table with FKs off. Throws (rolling back) on row-count change or dangling FKs. */
function rebuildTable(
  db: Database.Database,
  table: string,
  createNewSql: string,
  copySql: string,
  indexesSql: string,
): void {
  const before = countRows(db, table);
  db.exec('PRAGMA foreign_keys = OFF');
  try {
    db.exec('BEGIN');
    try {
      db.exec(`DROP TABLE IF EXISTS ${table}_new`);
      db.exec(createNewSql);
      db.exec(copySql);
      const copied = countRows(db, `${table}_new`);
      if (copied !== before) {
        throw new Error(`0015: ${table} rebuild would change the row count (${before} -> ${copied})`);
      }
      db.exec(`DROP TABLE ${table}`);
      db.exec(`ALTER TABLE ${table}_new RENAME TO ${table}`);
      db.exec(indexesSql);
      const violations = db.prepare('PRAGMA foreign_key_check').all() as unknown[];
      if (violations.length > 0) {
        throw new Error(`0015: foreign_key_check failed after ${table} rebuild: ${JSON.stringify(violations)}`);
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
}

export const nestedBoxes: Migration = {
  name: '0015_nested_boxes',

  sqlite(db) {
    addColumnIfMissing(db, 'bins', 'parent_bin_id', 'parent_bin_id TEXT REFERENCES bins(id) ON DELETE CASCADE');
    addColumnIfMissing(db, 'shopping_list_items', 'origin_area_id', 'origin_area_id TEXT REFERENCES areas(id) ON DELETE SET NULL');

    // Rebuild only when the old shape is still there (idempotent re-runs, fresh installs).
    if (!columnNames(db, 'bin_items').includes('area_id')) {
      rebuildTable(db, 'bin_items', SQLITE_BIN_ITEMS_NEW, SQLITE_BIN_ITEMS_COPY, SQLITE_BIN_ITEMS_INDEXES);
    }
    if (!columnNames(db, 'item_checkouts').includes('origin_area_id')) {
      rebuildTable(db, 'item_checkouts', SQLITE_CHECKOUTS_NEW, SQLITE_CHECKOUTS_COPY, SQLITE_CHECKOUTS_INDEXES);
    }

    db.exec(NESTED_BOXES_INDEXES_SQLITE);
  },

  async postgres(pool) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`
        ALTER TABLE bins ADD COLUMN IF NOT EXISTS parent_bin_id TEXT REFERENCES bins(id) ON DELETE CASCADE;

        ALTER TABLE bin_items ALTER COLUMN bin_id DROP NOT NULL;
        ALTER TABLE bin_items ADD COLUMN IF NOT EXISTS area_id TEXT
          REFERENCES areas(id) ON DELETE SET NULL DEFERRABLE INITIALLY IMMEDIATE;
        ALTER TABLE bin_items ADD COLUMN IF NOT EXISTS location_id TEXT
          REFERENCES locations(id) ON DELETE CASCADE DEFERRABLE INITIALLY IMMEDIATE;
        UPDATE bin_items bi SET location_id = b.location_id
          FROM bins b WHERE b.id = bi.bin_id AND bi.location_id IS NULL;
        ALTER TABLE bin_items ALTER COLUMN location_id SET NOT NULL;

        ALTER TABLE item_checkouts ALTER COLUMN origin_bin_id DROP NOT NULL;
        ALTER TABLE item_checkouts ADD COLUMN IF NOT EXISTS origin_area_id TEXT;
        ALTER TABLE item_checkouts ADD COLUMN IF NOT EXISTS return_area_id TEXT;

        ALTER TABLE shopping_list_items ADD COLUMN IF NOT EXISTS origin_area_id TEXT
          REFERENCES areas(id) ON DELETE SET NULL DEFERRABLE INITIALLY IMMEDIATE;
      `);
      await client.query(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bin_items_bin_xor_area') THEN
            ALTER TABLE bin_items ADD CONSTRAINT bin_items_bin_xor_area CHECK (bin_id IS NULL OR area_id IS NULL);
          END IF;
        END $$;
      `);
      await client.query(NESTED_BOXES_INDEXES_PG);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },
};
