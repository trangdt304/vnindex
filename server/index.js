'use strict';

require('dotenv').config();

const express = require('express');
const crypto = require('crypto');
const path = require('path');
const { fetchPrices } = require('./vndirect');
const store = require('./store');
const { enrich } = require('./indicators');
const { analyze } = require('./analysis');
const gemini = require('./gemini');

const app = express();
const port = Number(process.env.PORT || 5173);
const defaultSymbol = process.env.DEFAULT_SYMBOL || 'GEX';
const defaultWatchlist = (process.env.WATCHLIST || 'GEX,FPT,HPG,VNM,VND')
  .split(',').map((symbol) => symbol.trim().toUpperCase()).filter(Boolean);
const syncing = new Map();
const aiJobs = new Map();
const aiRequests = new Map();
const aiRateLimit = Math.max(1, Number(process.env.AI_RATE_LIMIT || 5));
const aiRateWindowMs = 10 * 60 * 1000;

// Chỉ tin X-Forwarded-For từ reverse proxy chạy trên cùng VM.
app.set('trust proxy', 'loopback');

function validSymbol(value) {
  return typeof value === 'string' && /^[A-Z0-9]{2,10}$/.test(value.toUpperCase());
}

function watchlistKey(request) {
  const salt = process.env.WATCHLIST_IP_SALT || 'vn-stock-lab-local-development';
  return crypto.createHmac('sha256', salt)
    .update(request.ip || request.socket.remoteAddress || 'unknown')
    .digest('hex');
}

function normalizeWatchlist(symbols) {
  return [...new Set(symbols
    .map((symbol) => String(symbol).trim().toUpperCase())
    .filter(validSymbol))].slice(0, 50);
}

async function getClientWatchlist(request) {
  const saved = await store.readWatchlist(watchlistKey(request));
  return Array.isArray(saved) ? normalizeWatchlist(saved) : defaultWatchlist.slice();
}

async function saveClientWatchlist(request, symbols) {
  const key = watchlistKey(request);
  const normalized = normalizeWatchlist(symbols);
  await store.writeWatchlist(key, normalized);
  return normalized;
}

function consumeAiQuota(request) {
  const key = watchlistKey(request);
  const now = Date.now();
  const active = (aiRequests.get(key) || []).filter(
    (timestamp) => now - timestamp < aiRateWindowMs,
  );
  if (active.length >= aiRateLimit) {
    return Math.ceil((aiRateWindowMs - (now - active[0])) / 1000);
  }
  active.push(now);
  aiRequests.set(key, active);
  return 0;
}

async function sync(symbol) {
  const upperSymbol = symbol.toUpperCase();
  if (syncing.has(upperSymbol)) return syncing.get(upperSymbol);
  const job = (async () => {
    const prices = await fetchPrices(upperSymbol);
    if (!prices.length) throw new Error(`Không có dữ liệu cho mã ${upperSymbol}`);
    return store.write(upperSymbol, {
      symbol: upperSymbol,
      syncedAt: new Date().toISOString(),
      source: 'VNDirect',
      prices,
    });
  })().finally(() => syncing.delete(upperSymbol));
  syncing.set(upperSymbol, job);
  return job;
}

async function getData(symbol, force = false) {
  let cached = await store.read(symbol);
  const today = new Date().toISOString().slice(0, 10);
  const freshToday = cached && cached.syncedAt && cached.syncedAt.slice(0, 10) === today;
  if (force || !freshToday) {
    try {
      cached = await sync(symbol);
    } catch (error) {
      if (!cached) throw error;
      cached.warning = `Không thể cập nhật mới: ${error.message}. Đang dùng dữ liệu cache.`;
    }
  }
  return cached;
}

app.use(express.json());
app.use('/vendor', express.static(path.join(__dirname, '..', 'node_modules', 'lightweight-charts', 'dist')));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/health', (_request, response) => {
  response.json({
    ok: true,
    source: 'VNDirect',
    storage: store.backend,
    scheduler: 'disabled',
    ai: {
      enabled: gemini.configured(),
      model: gemini.modelName(),
    },
  });
});

app.get('/api/watchlist', async (request, response) => {
  try {
    response.json({ items: await getClientWatchlist(request), storage: 'hashed-ip' });
  } catch (error) {
    response.status(500).json({ error: `Không thể tải watchlist: ${error.message}` });
  }
});

app.post('/api/watchlist', async (request, response) => {
  try {
    const symbol = String(request.body.symbol || '').trim().toUpperCase();
    if (!validSymbol(symbol)) {
      response.status(400).json({ error: 'Mã cổ phiếu không hợp lệ.' });
      return;
    }
    const current = await getClientWatchlist(request);
    if (current.includes(symbol)) {
      response.json({ items: current });
      return;
    }
    if (current.length >= 50) {
      response.status(400).json({ error: 'Watchlist được giới hạn tối đa 50 mã.' });
      return;
    }
    response.status(201).json({
      items: await saveClientWatchlist(request, [...current, symbol]),
    });
  } catch (error) {
    response.status(500).json({ error: `Không thể thêm vào watchlist: ${error.message}` });
  }
});

app.delete('/api/watchlist/:symbol', async (request, response) => {
  try {
    const symbol = request.params.symbol.toUpperCase();
    if (!validSymbol(symbol)) {
      response.status(400).json({ error: 'Mã cổ phiếu không hợp lệ.' });
      return;
    }
    response.json({
      items: await saveClientWatchlist(
        request,
        (await getClientWatchlist(request)).filter((item) => item !== symbol),
      ),
    });
  } catch (error) {
    response.status(500).json({ error: `Không thể xóa khỏi watchlist: ${error.message}` });
  }
});

function secureEqual(actual, expected) {
  const actualBuffer = Buffer.from(actual || '');
  const expectedBuffer = Buffer.from(expected || '');
  return actualBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

app.post('/api/cron/sync', async (request, response) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    response.status(503).json({ error: 'CRON_SECRET chưa được cấu hình.' });
    return;
  }
  if (!secureEqual(request.get('x-cron-secret'), secret)) {
    response.status(401).json({ error: 'Cron secret không hợp lệ.' });
    return;
  }
  const results = await Promise.allSettled(defaultWatchlist.map(sync));
  response.json({
    ok: true,
    synced: results.filter((result) => result.status === 'fulfilled').length,
    failed: results.filter((result) => result.status === 'rejected').length,
  });
});

app.get('/api/stocks/:symbol', async (request, response) => {
  const symbol = request.params.symbol.toUpperCase();
  if (!validSymbol(symbol)) {
    response.status(400).json({ error: 'Mã cổ phiếu không hợp lệ.' });
    return;
  }
  try {
    const payload = await getData(symbol, request.query.refresh === '1');
    const rows = enrich(payload.prices);
    response.json({
      ...payload,
      prices: rows,
      analysis: analyze(rows),
      aiAvailable: gemini.configured(),
    });
  } catch (error) {
    response.status(502).json({ error: error.message });
  }
});

app.post('/api/stocks/:symbol/ai-analysis', async (request, response) => {
  const symbol = request.params.symbol.toUpperCase();
  if (!validSymbol(symbol)) {
    response.status(400).json({ error: 'Mã cổ phiếu không hợp lệ.' });
    return;
  }
  if (!gemini.configured()) {
    response.status(503).json({ error: 'Tính năng AI chưa được cấu hình.' });
    return;
  }

  try {
    const payload = await getData(symbol);
    const rows = enrich(payload.prices);
    const latest = rows[rows.length - 1];
    if (!latest) {
      response.status(404).json({ error: `Không có dữ liệu cho mã ${symbol}.` });
      return;
    }

    const model = gemini.modelName();
    const priceDate = latest.date;
    const cached = await store.readAiAnalysis(
      symbol,
      priceDate,
      model,
      gemini.PROMPT_VERSION,
    );
    if (cached && request.query.refresh !== '1') {
      response.json({
        ...cached.result,
        symbol,
        priceDate,
        model,
        generatedAt: cached.generatedAt,
        cached: true,
      });
      return;
    }

    const jobKey = `${symbol}:${priceDate}:${model}:${gemini.PROMPT_VERSION}`;
    let job = aiJobs.get(jobKey);
    if (!job) {
      const retryAfter = consumeAiQuota(request);
      if (retryAfter) {
        response.set('Retry-After', String(retryAfter));
        response.status(429).json({
          error: 'Bạn đã tạo nhiều phân tích AI. Vui lòng thử lại sau ít phút.',
        });
        return;
      }
      job = (async () => {
        const result = await gemini.analyzeStock(symbol, rows, analyze(rows));
        return store.writeAiAnalysis(
          symbol,
          priceDate,
          model,
          gemini.PROMPT_VERSION,
          result,
        );
      })().finally(() => aiJobs.delete(jobKey));
      aiJobs.set(jobKey, job);
    }
    const saved = await job;
    response.json({
      ...saved.result,
      symbol,
      priceDate,
      model,
      generatedAt: saved.generatedAt,
      cached: false,
    });
  } catch (error) {
    response.status(error.statusCode || 502).json({
      error: error.message || 'Không thể tạo phân tích AI.',
    });
  }
});

app.post('/api/sync/:symbol', async (request, response) => {
  const symbol = request.params.symbol.toUpperCase();
  if (!validSymbol(symbol)) {
    response.status(400).json({ error: 'Mã cổ phiếu không hợp lệ.' });
    return;
  }
  try {
    const payload = await sync(symbol);
    response.json({ ok: true, symbol, syncedAt: payload.syncedAt, rows: payload.prices.length });
  } catch (error) {
    response.status(502).json({ error: error.message });
  }
});

app.get('*', (_request, response) => {
  response.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

async function start() {
  await store.init();
  app.listen(port, () => {
    console.log(`VN Stock Lab đang chạy tại http://localhost:${port} (storage: ${store.backend})`);
  });
}

if (require.main === module) {
  start().catch((error) => {
    console.error(`Không thể khởi động: ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  app, sync, getData, validSymbol, watchlistKey,
  normalizeWatchlist, getClientWatchlist, saveClientWatchlist, start,
};
