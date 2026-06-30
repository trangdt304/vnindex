'use strict';

const assert = require('assert');
const os = require('os');
const path = require('path');

process.env.SQLITE_PATH = path.join(
  os.tmpdir(),
  `vn-stock-lab-${process.pid}-${Date.now()}.db`,
);

const store = require('../server/store');

async function test() {
  await store.init();

  const payload = {
    symbol: 'GEX',
    syncedAt: '2026-07-01T09:00:00.000Z',
    source: 'VNDirect',
    prices: [{ date: '2026-07-01', close: 31.45 }],
  };
  await store.write('GEX', payload);
  assert.deepStrictEqual(await store.read('GEX'), payload);

  const clientKey = 'a'.repeat(64);
  await store.writeWatchlist(clientKey, ['GEX', 'FPT']);
  assert.deepStrictEqual(await store.readWatchlist(clientKey), ['GEX', 'FPT']);

  await store.close();
  console.log('✓ SQLite lưu và đọc cache giá cùng watchlist');
}

test().catch(async (error) => {
  await store.close();
  console.error(error);
  process.exit(1);
});
