'use strict';

const https = require('https');

const BASE_URL = process.env.VNDIRECT_API_BASE || 'https://api-finfo.vndirect.com.vn/v4';

function requestJson(url, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'VNStockLab/1.0',
      },
    }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`VNDirect trả về HTTP ${response.statusCode}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (_) {
          reject(new Error('VNDirect trả về dữ liệu không hợp lệ'));
        }
      });
    });
    request.setTimeout(timeoutMs, () => request.destroy(new Error('VNDirect quá thời gian phản hồi')));
    request.on('error', reject);
  });
}

function dateString(date) {
  return date.toISOString().slice(0, 10);
}

function subtractYears(date, years) {
  const result = new Date(date);
  result.setUTCFullYear(result.getUTCFullYear() - years);
  return result;
}

function normalize(item) {
  return {
    date: item.date,
    open: Number(item.adOpen ?? item.open),
    high: Number(item.adHigh ?? item.high),
    low: Number(item.adLow ?? item.low),
    close: Number(item.adClose ?? item.close),
    volume: Number(item.nmVolume || 0),
    value: Number(item.nmValue || 0),
    floor: item.floor || '',
    basicPrice: Number(item.basicPrice || 0),
  };
}

async function fetchPrices(symbol, options = {}) {
  const upperSymbol = symbol.toUpperCase();
  const end = options.end || dateString(new Date());
  const start = options.start || dateString(subtractYears(new Date(), 3));
  const query = `code:${upperSymbol}~date:gte:${start}~date:lte:${end}`;
  const params = new URLSearchParams({
    q: query,
    sort: 'date',
    size: '2000',
    page: '1',
  });
  const payload = await requestJson(`${BASE_URL}/stock_prices?${params.toString()}`);
  if (!Array.isArray(payload.data)) throw new Error('Không tìm thấy trường data từ VNDirect');
  return payload.data.map(normalize).filter((row) => (
    row.date && Number.isFinite(row.open) && Number.isFinite(row.close)
  )).sort((a, b) => a.date.localeCompare(b.date));
}

module.exports = { fetchPrices, normalize, requestJson };
