import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'

let _db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!_db) {
    const dbPath = join(app.getPath('userData'), 'tradicted.db')
    _db = new Database(dbPath)
    _db.pragma('journal_mode = WAL')
    initSchema(_db)
  }
  return _db
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS portfolios (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    INSERT OR IGNORE INTO portfolios (id, name, sort_order) VALUES ('default', 'Portfolio 1', 0);

    CREATE TABLE IF NOT EXISTS trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      symbol TEXT NOT NULL,
      direction TEXT CHECK(direction IN ('long', 'short')) NOT NULL,
      entry_price REAL NOT NULL,
      exit_price REAL,
      stop_loss REAL,
      take_profit REAL,
      position_size REAL NOT NULL,
      pnl REAL,
      r_multiple REAL,
      status TEXT CHECK(status IN ('open', 'closed', 'cancelled')) DEFAULT 'open',
      notes TEXT,
      tags TEXT,
      screenshot_path TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS journal_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      content TEXT,
      mood TEXT,
      trade_id INTEGER REFERENCES trades(id),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    INSERT OR IGNORE INTO settings (key, value) VALUES ('accountSize', '10000');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('riskPct', '1');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('currencySymbol', '$');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('theme', 'dark');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('commission', '0');
  `)

  // Migrate: add portfolio_id column to existing tables if missing
  const tradeCols = db.prepare('PRAGMA table_info(trades)').all() as Array<{ name: string }>
  if (!tradeCols.some((c) => c.name === 'portfolio_id')) {
    db.exec(`ALTER TABLE trades ADD COLUMN portfolio_id TEXT DEFAULT 'default'`)
  }
  if (!tradeCols.some((c) => c.name === 'setup_tag')) {
    db.exec(`ALTER TABLE trades ADD COLUMN setup_tag TEXT`)
  }
  if (!tradeCols.some((c) => c.name === 'psych_tag')) {
    db.exec(`ALTER TABLE trades ADD COLUMN psych_tag TEXT`)
  }
  if (!tradeCols.some((c) => c.name === 'grade')) {
    db.exec(`ALTER TABLE trades ADD COLUMN grade TEXT`)
  }
  if (!tradeCols.some((c) => c.name === 'rules_followed')) {
    db.exec(`ALTER TABLE trades ADD COLUMN rules_followed TEXT`)
  }
  if (!tradeCols.some((c) => c.name === 'closed_at')) {
    db.exec(`ALTER TABLE trades ADD COLUMN closed_at TEXT`)
  }
  if (!tradeCols.some((c) => c.name === 'trade_uid')) {
    db.exec(`ALTER TABLE trades ADD COLUMN trade_uid TEXT`)
  }
  // Backfill any trades missing a trade_uid (new installs or post-migration rows)
  // Uses SQLite's random() for the suffix — same entropy level as Math.random().toString(36)
  db.exec(`
    UPDATE trades SET trade_uid = (
      CAST(CAST((julianday(created_at) - 2440587.5) * 86400000 AS INTEGER) AS TEXT)
      || '-' ||
      UPPER(REPLACE(REPLACE(REPLACE(symbol, ' ', ''), '/', ''), '-', ''))
      || '-' ||
      LOWER(SUBSTR('abcdefghijklmnopqrstuvwxyz0123456789', ABS(random()) % 36 + 1, 1))
      || LOWER(SUBSTR('abcdefghijklmnopqrstuvwxyz0123456789', ABS(random()) % 36 + 1, 1))
      || LOWER(SUBSTR('abcdefghijklmnopqrstuvwxyz0123456789', ABS(random()) % 36 + 1, 1))
      || LOWER(SUBSTR('abcdefghijklmnopqrstuvwxyz0123456789', ABS(random()) % 36 + 1, 1))
      || LOWER(SUBSTR('abcdefghijklmnopqrstuvwxyz0123456789', ABS(random()) % 36 + 1, 1))
    ) WHERE trade_uid IS NULL
  `)

  const journalCols = db.prepare('PRAGMA table_info(journal_entries)').all() as Array<{ name: string }>
  if (!journalCols.some((c) => c.name === 'portfolio_id')) {
    db.exec(`ALTER TABLE journal_entries ADD COLUMN portfolio_id TEXT DEFAULT 'default'`)
  }
}
