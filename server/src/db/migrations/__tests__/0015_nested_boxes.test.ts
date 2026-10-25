import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { NESTED_BOXES_INDEXES_SQLITE, nestedBoxes } from '../0015_nested_boxes.js';
import { migrations } from '../index.js';
import { runSqliteMigrations } from '../runner.js';

const SCHEMA_DIR = path.join(import.meta.dirname, '..', '..', '..', '..');
const OLD_SCHEMA = fs.readFileSync(path.join(import.meta.dirname, 'fixtures', 'schema.sqlite.0014.sql'), 'utf-8');
const NEW_SCHEMA = fs.readFileSync(path.join(SCHEMA_DIR, 'schema.sqlite.sql'), 'utf-8');

interface ColumnInfo { name: string; type: string; notnull: number; dflt_value: string | null }

/** Name, type, nullability and default; position is ignored (ALTER ADD COLUMN appends, a fresh schema doesn't). */
function columns(db: Database.Database, table: string): ColumnInfo[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as ColumnInfo[])
    .map(({ name, type, notnull, dflt_value }) => ({ name, type, notnull, dflt_value }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function count(db: Database.Database, table: string): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
}

/** A database as it looked at migration 0014: old schema, all earlier migrations recorded, real rows. */
function oldDatabase(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(OLD_SCHEMA);
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY NOT NULL, applied_at TEXT NOT NULL DEFAULT (datetime(\'now\')))');
  for (const m of migrations.filter((x) => x.name !== nestedBoxes.name)) {
    db.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(m.name);
  }
  db.exec(`
    INSERT INTO users (id, display_name, email) VALUES ('u1', 'Ann', 'ann@example.com'), ('u2', 'Bo', 'bo@example.com');
    INSERT INTO locations (id, name, created_by, invite_code) VALUES ('l1', 'Home', 'u1', 'AAA'), ('l2', 'Cabin', 'u1', 'BBB');
    INSERT INTO areas (id, location_id, name) VALUES ('a1', 'l1', 'Garage');
    INSERT INTO bins (id, short_code, location_id, name, area_id) VALUES
      ('b1', 'AAAAAA', 'l1', 'Toolbox', 'a1'), ('b2', 'BBBBBB', 'l1', 'Cables', NULL), ('b3', 'CCCCCC', 'l2', 'Pots', NULL);
    INSERT INTO bin_items (id, bin_id, name, quantity, position) VALUES
      ('i1', 'b1', 'Hammer', 1, 0), ('i2', 'b1', 'Nails', 200, 1), ('i3', 'b2', 'HDMI', 3, 0), ('i4', 'b3', 'Pan', NULL, 0);
    UPDATE bin_items SET deleted_at = datetime('now') WHERE id = 'i2';
    INSERT INTO item_checkouts (id, item_id, origin_bin_id, location_id, checked_out_by) VALUES
      ('c1', 'i1', 'b1', 'l1', 'u2'), ('c2', 'i3', 'b2', 'l1', 'u1');
    UPDATE item_checkouts SET returned_at = datetime('now'), returned_by = 'u1', return_bin_id = 'b2' WHERE id = 'c2';
    INSERT INTO shopping_list_items (id, location_id, name, origin_bin_id, created_by) VALUES ('s1', 'l1', 'Screws', 'b1', 'u1');
  `);
  return db;
}

describe('migration 0015_nested_boxes (SQLite)', () => {
  it('upgrades a populated database without losing rows, checkout history or links', () => {
    const db = oldDatabase();
    const before = {
      items: count(db, 'bin_items'),
      checkouts: count(db, 'item_checkouts'),
      shopping: count(db, 'shopping_list_items'),
      bins: count(db, 'bins'),
    };

    // exactly what init.ts does on startup: new schema file, then migrations, then the index step
    db.exec(NEW_SCHEMA);
    runSqliteMigrations(db, migrations);
    db.exec(NESTED_BOXES_INDEXES_SQLITE);

    expect(count(db, 'bin_items')).toBe(before.items);
    expect(count(db, 'item_checkouts')).toBe(before.checkouts);
    expect(count(db, 'shopping_list_items')).toBe(before.shopping);
    expect(count(db, 'bins')).toBe(before.bins);

    // location_id backfilled from each item's box; soft-deleted state and ordering preserved
    const items = db.prepare('SELECT id, bin_id, area_id, location_id, position, deleted_at FROM bin_items ORDER BY id').all() as Array<Record<string, unknown>>;
    expect(items.map((i) => [i.id, i.bin_id, i.area_id, i.location_id])).toEqual([
      ['i1', 'b1', null, 'l1'], ['i2', 'b1', null, 'l1'], ['i3', 'b2', null, 'l1'], ['i4', 'b3', null, 'l2'],
    ]);
    expect(items.find((i) => i.id === 'i2')?.deleted_at).not.toBeNull();

    // checkouts keep their item links and origin/return values (the cascade would have deleted them)
    const checkouts = db.prepare('SELECT id, item_id, origin_bin_id, return_bin_id, returned_at FROM item_checkouts ORDER BY id').all() as Array<Record<string, unknown>>;
    expect(checkouts.map((c) => [c.id, c.item_id, c.origin_bin_id, c.return_bin_id])).toEqual([['c1', 'i1', 'b1', null], ['c2', 'i3', 'b2', 'b2']]);
    expect(checkouts[1].returned_at).not.toBeNull();

    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    db.close();
  });

  it('produces exactly the same table shapes as a fresh install from the schema file', () => {
    const upgraded = oldDatabase();
    upgraded.exec(NEW_SCHEMA);
    runSqliteMigrations(upgraded, migrations);
    upgraded.exec(NESTED_BOXES_INDEXES_SQLITE);

    const fresh = new Database(':memory:');
    fresh.exec(NEW_SCHEMA);
    fresh.exec(NESTED_BOXES_INDEXES_SQLITE);

    for (const table of ['bins', 'bin_items', 'item_checkouts', 'shopping_list_items']) {
      expect(columns(upgraded, table), `${table} columns`).toEqual(columns(fresh, table));
      const indexes = (db: Database.Database) =>
        (db.prepare(`PRAGMA index_list(${table})`).all() as { name: string }[]).map((i) => i.name).filter((n) => !n.startsWith('sqlite_autoindex')).sort();
      expect(indexes(upgraded), `${table} indexes`).toEqual(indexes(fresh));
    }
    upgraded.close();
    fresh.close();
  });

  it('allows loose and unassigned items, but not an item in both a box and an area', () => {
    const db = oldDatabase();
    db.exec(NEW_SCHEMA);
    runSqliteMigrations(db, migrations);

    db.prepare("INSERT INTO bin_items (id, bin_id, area_id, location_id, name) VALUES ('loose', NULL, 'a1', 'l1', 'Ladder')").run();
    db.prepare("INSERT INTO bin_items (id, bin_id, area_id, location_id, name) VALUES ('floating', NULL, NULL, 'l1', 'Tape')").run();
    expect(() =>
      db.prepare("INSERT INTO bin_items (id, bin_id, area_id, location_id, name) VALUES ('both', 'b1', 'a1', 'l1', 'X')").run(),
    ).toThrow(/CHECK/);

    // deleting the area leaves its loose item unassigned, like its boxes
    db.prepare("DELETE FROM areas WHERE id = 'a1'").run();
    const loose = db.prepare("SELECT bin_id, area_id FROM bin_items WHERE id = 'loose'").get();
    expect(loose).toEqual({ bin_id: null, area_id: null });
    expect(db.prepare("SELECT area_id FROM bins WHERE id = 'b1'").get()).toEqual({ area_id: null });
    db.close();
  });

  it('supports parent boxes and cascades a hard delete to children', () => {
    const db = oldDatabase();
    db.exec(NEW_SCHEMA);
    runSqliteMigrations(db, migrations);
    db.prepare("INSERT INTO bins (id, short_code, location_id, name, parent_bin_id) VALUES ('child', 'DDDDDD', 'l1', 'Screws', 'b1')").run();
    db.prepare("DELETE FROM bins WHERE id = 'b1'").run();
    expect(db.prepare("SELECT id FROM bins WHERE id = 'child'").get()).toBeUndefined();
    db.close();
  });

  it('can be run again without changing anything', () => {
    const db = oldDatabase();
    db.exec(NEW_SCHEMA);
    nestedBoxes.sqlite?.(db);
    const snapshot = JSON.stringify([columns(db, 'bin_items'), count(db, 'bin_items'), count(db, 'item_checkouts')]);
    nestedBoxes.sqlite?.(db);
    expect(JSON.stringify([columns(db, 'bin_items'), count(db, 'bin_items'), count(db, 'item_checkouts')])).toBe(snapshot);
    db.close();
  });

  it('rolls back and keeps the old tables when the rebuild would lose rows', () => {
    const db = oldDatabase();
    db.exec(NEW_SCHEMA);
    // an item pointing at a bin that no longer exists would be dropped by the backfill JOIN
    db.pragma('foreign_keys = OFF');
    db.prepare("INSERT INTO bin_items (id, bin_id, name) VALUES ('orphan', 'gone', 'Ghost')").run();
    db.pragma('foreign_keys = ON');
    const itemsBefore = count(db, 'bin_items');
    expect(() => nestedBoxes.sqlite?.(db)).toThrow(/row count/);
    expect(count(db, 'bin_items')).toBe(itemsBefore);
    expect(columns(db, 'bin_items').map((c) => c.name)).not.toContain('area_id');
    expect(count(db, 'item_checkouts')).toBe(2);
    db.close();
  });
});
