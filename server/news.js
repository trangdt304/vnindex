'use strict';

const https = require('https');

const API_BASE = process.env.KBS_NEWS_API_BASE
  || 'https://kbbuddywts.kbsec.com.vn/iis-server/investment/stockinfo/news';
const ARTICLE_BASE = 'https://vietstock.vn';
const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const cache = new Map();
const pending = new Map();

function requestJson(url, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'VNStockLab/1.0',
      },
    }, (response) => {
      const chunks = [];
      let size = 0;

      response.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_RESPONSE_BYTES) {
          request.destroy(new Error('Phản hồi tin tức vượt quá giới hạn cho phép.'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`Nguồn tin KBS trả về HTTP ${response.statusCode}`));
          return;
        }
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch (_error) {
          reject(new Error('Nguồn tin KBS trả về dữ liệu không hợp lệ.'));
        }
      });
    });

    request.setTimeout(
      timeoutMs,
      () => request.destroy(new Error('Nguồn tin KBS phản hồi quá thời gian.')),
    );
    request.on('error', reject);
  });
}

function cleanText(value, maxLength) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function articleUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const url = new URL(value, ARTICLE_BASE);
    const trustedHost = url.hostname === 'vietstock.vn'
      || url.hostname.endsWith('.vietstock.vn');
    return url.protocol === 'https:' && trustedHost ? url.toString() : '';
  } catch (_error) {
    return '';
  }
}

function normalizeNewsItem(item) {
  if (!item || typeof item !== 'object') return null;
  const title = cleanText(item.Title, 300);
  const publishedAt = cleanText(item.PublishTime, 40);
  if (!title || !publishedAt || Number.isNaN(Date.parse(publishedAt))) return null;

  return {
    id: String(item.ArticleID || `${publishedAt}:${title}`),
    title,
    summary: cleanText(item.Head, 500),
    publishedAt,
    source: 'Vietstock',
    url: articleUrl(item.URL),
  };
}

function isRelevantToSymbol(item, symbol) {
  if (!symbol) return true;
  const title = item.title.toUpperCase();
  const upperSymbol = symbol.toUpperCase();
  const disclosureSymbol = title.match(/^([A-Z0-9]{2,10})\s*:/);
  if (disclosureSymbol && disclosureSymbol[1] !== upperSymbol) return false;

  const escapedSymbol = upperSymbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const unrelatedFund = new RegExp(
    `\\b(?:${escapedSymbol}\\s+(?:ETF|FUND)|(?:ETF|FUND)\\s+${escapedSymbol})\\b`,
  );
  return !unrelatedFund.test(title);
}

function normalizeNews(items, limit = 5, symbol = '') {
  if (!Array.isArray(items)) return [];
  const seen = new Set();
  return items
    .map(normalizeNewsItem)
    .filter(Boolean)
    .filter((item) => isRelevantToSymbol(item, symbol))
    .filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt))
    .slice(0, limit);
}

function buildNewsUrl(symbol, limit) {
  const params = new URLSearchParams({
    l: '1',
    // API KBS dùng p làm số bản ghi và s làm vị trí bắt đầu.
    p: String(limit),
    s: '1',
  });
  return `${API_BASE}/${encodeURIComponent(symbol)}?${params.toString()}`;
}

async function fetchCompanyNews(symbol, options = {}) {
  const upperSymbol = symbol.toUpperCase();
  const limit = Math.max(1, Math.min(5, Number(options.limit) || 5));
  const now = Date.now();
  const cached = cache.get(upperSymbol);
  if (!options.force && cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.payload;
  }

  if (pending.has(upperSymbol)) return pending.get(upperSymbol);

  const job = (async () => {
    const candidateLimit = Math.min(15, limit * 3);
    const items = normalizeNews(
      await requestJson(buildNewsUrl(upperSymbol, candidateLimit)),
      limit,
      upperSymbol,
    );
    const payload = {
      symbol: upperSymbol,
      source: 'KBS / Vietstock',
      fetchedAt: new Date().toISOString(),
      items,
    };
    cache.set(upperSymbol, { timestamp: Date.now(), payload });
    return payload;
  })().finally(() => pending.delete(upperSymbol));

  pending.set(upperSymbol, job);
  return job;
}

module.exports = {
  fetchCompanyNews,
  normalizeNews,
  normalizeNewsItem,
  isRelevantToSymbol,
  buildNewsUrl,
};
