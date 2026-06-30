'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const store = require('../server/store');

async function migrate() {
  if (store.backend !== 'sqlite') {
    throw new Error('SQLite chưa được cấu hình.');
  }
  await store.init();
  const dataDirectory = path.join(__dirname, '..', 'data');
  const files = fs.existsSync(dataDirectory)
    ? fs.readdirSync(dataDirectory).filter((file) => file.endsWith('.json'))
    : [];
  let stocks = 0;
  let watchlists = 0;

  for (const file of files) {
    const payload = JSON.parse(fs.readFileSync(path.join(dataDirectory, file), 'utf8'));
    if (payload && payload.symbol && Array.isArray(payload.prices)) {
      await store.write(payload.symbol, payload);
      stocks += 1;
    }
    if (file === 'watchlists.json' && payload && typeof payload === 'object') {
      for (const [clientKey, symbols] of Object.entries(payload)) {
        if (/^[a-f0-9]{64}$/.test(clientKey) && Array.isArray(symbols)) {
          await store.writeWatchlist(clientKey, symbols);
          watchlists += 1;
        }
      }
    }
  }
  console.log(`Đã migrate ${stocks} mã cổ phiếu và ${watchlists} watchlist.`);
}

migrate()
  .then(() => store.close())
  .catch(async (error) => {
    console.error(error.message);
    await store.close();
    process.exit(1);
  });
