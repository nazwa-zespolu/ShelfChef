import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync, SQLInputValue} from 'node:sqlite';

// Only the native bridge is replaced. Queries run against a real database file.
const directory = mkdtempSync(join(tmpdir(), 'shelfchef-test-'));
const filename = join(directory, 'shelfchef.db');
const openDatabase = () => {
  const connection = new DatabaseSync(filename);
  // Match QuickSQLite's default; enabling foreign keys is a separate app change.
  connection.exec('PRAGMA foreign_keys = OFF');
  return connection;
};
let connection = openDatabase();

export const sqlite = {
  execute(sql: string, params: (SQLInputValue | boolean | undefined)[] = []) {
    const values = params.map(value =>
      typeof value === 'boolean' ? Number(value) : value ?? null,
    );
    const rows = connection.prepare(sql).all(...values);
    return {
      rows: {length: rows.length, item: (index: number) => rows[index]},
    };
  },
  reset() {
    connection.close();
    rmSync(filename, {force: true});
    connection = openDatabase();
  },
  reopen() {
    connection.close();
    connection = openDatabase();
  },
  close() {
    connection.close();
    rmSync(directory, {recursive: true, force: true});
  },
};
