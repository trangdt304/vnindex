'use strict';

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');

const dataDirectory = path.join(__dirname, '..', 'data');
const databaseFile = path.resolve(
  process.env.SQLITE_PATH || path.join(dataDirectory, 'stock.db'),
);

let database = null;

function openDatabase() {
  if (database) return Promise.resolve(database);
  fs.mkdirSync(path.dirname(databaseFile), { recursive: true });
  return new Promise((resolve, reject) => {
    const connection = new sqlite3.Database(databaseFile, (error) => {
      if (error) {
        reject(error);
        return;
      }
      database = connection;
      resolve(database);
    });
  });
}

async function run(sql, parameters = []) {
  const connection = await openDatabase();
  return new Promise((resolve, reject) => {
    connection.run(sql, parameters, function callback(error) {
      if (error) reject(error);
      else resolve({ changes: this.changes, lastID: this.lastID });
    });
  });
}

async function get(sql, parameters = []) {
  const connection = await openDatabase();
  return new Promise((resolve, reject) => {
    connection.get(sql, parameters, (error, row) => {
      if (error) reject(error);
      else resolve(row || null);
    });
  });
}

async function init() {
  await openDatabase();
  await run('PRAGMA journal_mode = WAL');
  await run('PRAGMA busy_timeout = 5000');
  await run(`
    CREATE TABLE IF NOT EXISTS stock_cache (
      symbol TEXT PRIMARY KEY,
      synced_at TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'VNDirect',
      prices TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  await run(`
    CREATE TABLE IF NOT EXISTS watchlists (
      client_key TEXT PRIMARY KEY,
      symbols TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL
    )
  `);
  await run(`
    CREATE TABLE IF NOT EXISTS ai_analysis_cache (
      symbol TEXT NOT NULL,
      price_date TEXT NOT NULL,
      model TEXT NOT NULL,
      prompt_version TEXT NOT NULL,
      result TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (symbol, price_date, model, prompt_version)
    )
  `);
}

async function read(symbol) {
  const row = await get(
    'SELECT symbol, synced_at, source, prices FROM stock_cache WHERE symbol = ?',
    [symbol.toUpperCase()],
  );
  if (!row) return null;
  return {
    symbol: row.symbol,
    syncedAt: row.synced_at,
    source: row.source,
    prices: JSON.parse(row.prices),
  };
}

async function write(symbol, payload) {
  const now = new Date().toISOString();
  await run(`
    INSERT INTO stock_cache (symbol, synced_at, source, prices, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(symbol) DO UPDATE SET
      synced_at = excluded.synced_at,
      source = excluded.source,
      prices = excluded.prices,
      updated_at = excluded.updated_at
  `, [
    symbol.toUpperCase(),
    payload.syncedAt,
    payload.source || 'VNDirect',
    JSON.stringify(payload.prices),
    now,
  ]);
  return payload;
}

async function readWatchlist(clientKey) {
  const row = await get(
    'SELECT symbols FROM watchlists WHERE client_key = ?',
    [clientKey],
  );
  if (!row) return null;
  const symbols = JSON.parse(row.symbols);
  return Array.isArray(symbols) ? symbols : null;
}

async function writeWatchlist(clientKey, symbols) {
  const now = new Date().toISOString();
  await run(`
    INSERT INTO watchlists (client_key, symbols, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(client_key) DO UPDATE SET
      symbols = excluded.symbols,
      updated_at = excluded.updated_at
  `, [clientKey, JSON.stringify(symbols), now]);
  return symbols;
}

async function readAiAnalysis(symbol, priceDate, model, promptVersion) {
  const row = await get(`
    SELECT result, created_at
    FROM ai_analysis_cache
    WHERE symbol = ? AND price_date = ? AND model = ? AND prompt_version = ?
  `, [symbol.toUpperCase(), priceDate, model, promptVersion]);
  if (!row) return null;
  return {
    result: JSON.parse(row.result),
    generatedAt: row.created_at,
  };
}

async function writeAiAnalysis(symbol, priceDate, model, promptVersion, result) {
  const generatedAt = new Date().toISOString();
  await run(`
    INSERT INTO ai_analysis_cache (
      symbol, price_date, model, prompt_version, result, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(symbol, price_date, model, prompt_version) DO UPDATE SET
      result = excluded.result,
      created_at = excluded.created_at
  `, [
    symbol.toUpperCase(),
    priceDate,
    model,
    promptVersion,
    JSON.stringify(result),
    generatedAt,
  ]);
  return { result, generatedAt };
}

async function close() {
  if (!database) return;
  const connection = database;
  database = null;
  await new Promise((resolve, reject) => {
    connection.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

module.exports = {
  init,
  read,
  write,
  readWatchlist,
  writeWatchlist,
  readAiAnalysis,
  writeAiAnalysis,
  close,
  backend: 'sqlite',
  databaseFile,
};
