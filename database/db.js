import * as SQLite from 'expo-sqlite';

const db = SQLite.openDatabaseSync('vaultai.db');

export const initDatabase = () => {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS vault (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      username TEXT,
      password TEXT NOT NULL,
      category TEXT,
      url TEXT,
      breach_count INTEGER DEFAULT 0,
      created_at TEXT,
      updated_at TEXT
    );
  `);

  db.execSync(`
    CREATE TABLE IF NOT EXISTS master (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      password_hash TEXT NOT NULL,
      pin_hash TEXT NOT NULL
    );
  `);

  db.execSync(`
    CREATE TABLE IF NOT EXISTS audit_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      result TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  db.execSync(`
    CREATE TABLE IF NOT EXISTS behavior_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hour_of_access INTEGER NOT NULL,
      passwords_viewed INTEGER NOT NULL,
      session_duration INTEGER NOT NULL,
      failed_pins INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  // Migration: add breach_count to existing installs
  try {
    db.execSync(`ALTER TABLE vault ADD COLUMN breach_count INTEGER DEFAULT 0;`);
  } catch (e) {
    // Column already exists — safe to ignore
  }
};

export const db_instance = db;