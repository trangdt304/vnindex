'use strict';

const assert = require('assert');
const {
  sma, ema, rsi, bollinger, accumulationDistribution, mcdx, enrich,
} = require('../server/indicators');
const { analyze } = require('../server/analysis');
const { buildStockContext, normalizeAiAnalysis } = require('../server/gemini');
const { watchlistKey, normalizeWatchlist } = require('../server');

function test(name, callback) {
  try {
    callback();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

test('SMA giữ đúng độ dài và tính trung bình cửa sổ', () => {
  assert.deepStrictEqual(sma([1, 2, 3, 4, 5], 3), [null, null, 2, 3, 4]);
});

test('EMA bắt đầu bằng SMA của chu kỳ đầu', () => {
  assert.deepStrictEqual(ema([1, 2, 3, 4, 5], 3), [null, null, 2, 3, 4]);
});

test('RSI đạt 100 với chuỗi chỉ tăng', () => {
  const values = Array.from({ length: 20 }, (_, index) => index + 1);
  assert.strictEqual(rsi(values, 14)[19], 100);
});

test('Bollinger cho đường giữa bằng SMA', () => {
  const values = Array.from({ length: 25 }, (_, index) => index + 1);
  const result = bollinger(values, 20, 2);
  assert.strictEqual(result.middle[19], 10.5);
  assert(result.upper[19] > result.middle[19]);
  assert(result.lower[19] < result.middle[19]);
});

test('A/D cộng dồn dòng tiền theo vị trí giá đóng cửa', () => {
  const result = accumulationDistribution([
    { high: 12, low: 10, close: 12, volume: 100 },
    { high: 14, low: 10, close: 10, volume: 50 },
    { high: 11, low: 11, close: 11, volume: 1000 },
  ]);
  assert.deepStrictEqual(result, [100, 50, 50]);
});

test('MA50 và MA200 xuất hiện khi đủ số phiên', () => {
  const rows = Array.from({ length: 210 }, (_, index) => ({
    date: String(index),
    open: index + 1,
    high: index + 2,
    low: index,
    close: index + 1,
    volume: 1000,
  }));
  const result = enrich(rows);
  assert.strictEqual(result[48].indicators.ma50, null);
  assert.strictEqual(result[49].indicators.ma50, 25.5);
  assert.strictEqual(result[198].indicators.ma200, null);
  assert.strictEqual(result[199].indicators.ma200, 100.5);
});

test('MCDX cục bộ đưa các nhóm về thang sức mạnh 0–100', () => {
  const rows = Array.from({ length: 80 }, (_, index) => ({
    high: 12 + index * 0.1,
    low: 10 + index * 0.1,
    close: 11.8 + index * 0.1,
    volume: 1000 + index * 20,
  }));
  const result = mcdx(rows);
  result.forEach((item) => {
    assert(item.banker >= 0 && item.banker <= 100);
    assert(item.hotMoney >= 0 && item.hotMoney <= 100);
    assert(item.retailer >= 0 && item.retailer <= 100);
  });
  assert.strictEqual(result[79].banker, 100);
  assert.strictEqual(result[79].hotMoney, 100);
  assert.strictEqual(result[79].retailer, 0);
});

test('Watchlist nhận diện IP bằng HMAC và chuẩn hóa mã', () => {
  const first = watchlistKey({ ip: '203.0.113.10' });
  const same = watchlistKey({ ip: '203.0.113.10' });
  const other = watchlistKey({ ip: '203.0.113.11' });
  assert.strictEqual(first, same);
  assert.notStrictEqual(first, other);
  assert(!first.includes('203.0.113.10'));
  assert.deepStrictEqual(normalizeWatchlist([' gex ', 'GEX', 'fpt', 'sai mã']), ['GEX', 'FPT']);
});

test('Phân tích sinh điểm và các tín hiệu từ OHLCV', () => {
  const rows = Array.from({ length: 80 }, (_, index) => ({
    date: `2025-${String(Math.floor(index / 28) + 1).padStart(2, '0')}-${String(index % 28 + 1).padStart(2, '0')}`,
    open: 10 + index * 0.1,
    high: 10.3 + index * 0.1,
    low: 9.8 + index * 0.1,
    close: 10.2 + index * 0.1,
    volume: 1000000 + index * 10000,
  }));
  const result = analyze(enrich(rows));
  assert(result.score > 0);
  assert(result.signals.length >= 5);
  assert(result.signals.some((signal) => signal.label.includes('tích lũy')));
  assert(result.resistance >= rows[rows.length - 1].close);
  assert.strictEqual(result.supportZones.length, 3);
  assert.strictEqual(result.resistanceZones.length, 3);
  assert(result.supportZones[0].center < rows[rows.length - 1].close);
  assert(result.resistanceZones[0].center > rows[rows.length - 1].close);
});

test('Ngữ cảnh Gemini chỉ gửi lịch sử cô đọng và kết quả kỹ thuật', () => {
  const rows = Array.from({ length: 80 }, (_, index) => ({
    date: `2026-06-${String(index + 1).padStart(2, '0')}`,
    open: 10,
    high: 11,
    low: 9,
    close: 10 + index / 10,
    volume: 1000 + index,
    indicators: { rsi14: 50, ma20: 12 },
  }));
  const context = buildStockContext('GEX', rows, { verdict: 'Trung tính' });
  assert.strictEqual(context.symbol, 'GEX');
  assert.strictEqual(context.recentHistory.length, 60);
  assert.deepStrictEqual(context.deterministicAnalysis, { verdict: 'Trung tính' });
});

test('Chuẩn hóa phản hồi Gemini về cấu trúc an toàn cho giao diện', () => {
  const result = normalizeAiAnalysis({
    summary: '  Tóm tắt  ',
    tone: 'positive',
    outlook: 'Theo dõi xu hướng.',
    positiveFactors: ['Giá trên MA20'],
    riskFactors: ['Khối lượng thấp'],
    bullishScenario: 'Vượt kháng cự.',
    bearishScenario: 'Thủng hỗ trợ.',
  });
  assert.strictEqual(result.summary, 'Tóm tắt');
  assert.strictEqual(result.tone, 'positive');
  assert(result.disclaimer.includes('không phải khuyến nghị'));
});
