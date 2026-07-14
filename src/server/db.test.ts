import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { applyMigrations } from './db';

function oldSchema(db: Database.Database): void {
  db.exec(`CREATE TABLE session (
    sourceId TEXT NOT NULL, sessionId TEXT NOT NULL, agent TEXT NOT NULL,
    filePath TEXT NOT NULL, cwd TEXT, name TEXT, model TEXT,
    startedAt TEXT NOT NULL, updatedAt TEXT NOT NULL,
    messageCount INTEGER NOT NULL DEFAULT 0, costUsd REAL,
    branches INTEGER NOT NULL DEFAULT 0, live INTEGER NOT NULL DEFAULT 0,
    status TEXT, PRIMARY KEY (sourceId, sessionId));`);
}

function columnNames(db: Database.Database): Set<string> {
  const rows = db.prepare(`PRAGMA table_info(session)`).all() as { name: string }[];
  return new Set(rows.map((r) => r.name));
}

test('applyMigrations adds lastKind/lastLine to an old table', () => {
  const db = new Database(':memory:');
  oldSchema(db);
  applyMigrations(db);
  const cols = columnNames(db);
  assert.ok(cols.has('lastKind'));
  assert.ok(cols.has('lastLine'));
});

test('applyMigrations is idempotent', () => {
  const db = new Database(':memory:');
  oldSchema(db);
  applyMigrations(db);
  assert.doesNotThrow(() => applyMigrations(db));
});
