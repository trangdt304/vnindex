'use strict';

function sma(values, period) {
  return values.map((_, index) => {
    if (index < period - 1) return null;
    const window = values.slice(index - period + 1, index + 1);
    return window.reduce((sum, value) => sum + value, 0) / period;
  });
}

function ema(values, period) {
  const result = Array(values.length).fill(null);
  if (values.length < period) return result;
  const multiplier = 2 / (period + 1);
  let previous = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  result[period - 1] = previous;
  for (let index = period; index < values.length; index += 1) {
    previous = (values[index] - previous) * multiplier + previous;
    result[index] = previous;
  }
  return result;
}

function rsi(values, period = 14) {
  const result = Array(values.length).fill(null);
  if (values.length <= period) return result;
  let gains = 0;
  let losses = 0;
  for (let index = 1; index <= period; index += 1) {
    const change = values[index] - values[index - 1];
    gains += Math.max(change, 0);
    losses += Math.max(-change, 0);
  }
  let averageGain = gains / period;
  let averageLoss = losses / period;
  result[period] = averageLoss === 0 ? 100 : 100 - 100 / (1 + averageGain / averageLoss);
  for (let index = period + 1; index < values.length; index += 1) {
    const change = values[index] - values[index - 1];
    averageGain = (averageGain * (period - 1) + Math.max(change, 0)) / period;
    averageLoss = (averageLoss * (period - 1) + Math.max(-change, 0)) / period;
    result[index] = averageLoss === 0 ? 100 : 100 - 100 / (1 + averageGain / averageLoss);
  }
  return result;
}

function macd(values, fast = 12, slow = 26, signalPeriod = 9) {
  const fastLine = ema(values, fast);
  const slowLine = ema(values, slow);
  const line = values.map((_, index) => (
    fastLine[index] == null || slowLine[index] == null ? null : fastLine[index] - slowLine[index]
  ));
  const compact = line.filter((value) => value != null);
  const compactSignal = ema(compact, signalPeriod);
  const signal = Array(values.length).fill(null);
  let compactIndex = 0;
  line.forEach((value, index) => {
    if (value != null) {
      signal[index] = compactSignal[compactIndex];
      compactIndex += 1;
    }
  });
  return {
    line,
    signal,
    histogram: line.map((value, index) => (
      value == null || signal[index] == null ? null : value - signal[index]
    )),
  };
}

function bollinger(values, period = 20, deviations = 2) {
  const middle = sma(values, period);
  const upper = Array(values.length).fill(null);
  const lower = Array(values.length).fill(null);
  for (let index = period - 1; index < values.length; index += 1) {
    const window = values.slice(index - period + 1, index + 1);
    const variance = window.reduce((sum, value) => sum + (value - middle[index]) ** 2, 0) / period;
    const deviation = Math.sqrt(variance) * deviations;
    upper[index] = middle[index] + deviation;
    lower[index] = middle[index] - deviation;
  }
  return { middle, upper, lower };
}

function accumulationDistribution(rows) {
  let cumulative = 0;
  return rows.map((row) => {
    const range = row.high - row.low;
    const moneyFlowMultiplier = range === 0
      ? 0
      : ((row.close - row.low) - (row.high - row.close)) / range;
    cumulative += moneyFlowMultiplier * row.volume;
    return cumulative;
  });
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

// Tính tại chỗ từ giá đóng cửa VNDirect. Các giá trị là chỉ số sức mạnh
// độc lập trên thang 0–100, không phải ba tỷ trọng cộng lại thành 100%.
function mcdx(rows) {
  const closes = rows.map((row) => row.close);
  const rsi50 = rsi(closes, 50);
  const rsi40 = rsi(closes, 40);
  const bankerRaw = rsi50.map((value) => (
    value == null ? 0 : clamp(1.5 * (value - 50), 0, 20)
  ));
  const hotMoneyRaw = rsi40.map((value) => (
    value == null ? 0 : clamp(0.7 * (value - 30), 0, 20)
  ));
  const bankerAverageRaw = sma(bankerRaw, 10);
  const hotMoneyAverageRaw = sma(hotMoneyRaw, 10);

  return rows.map((_, index) => {
    const banker = bankerRaw[index];
    const bankerAverage = bankerAverageRaw[index] || 0;
    const hotMoney = hotMoneyRaw[index];
    const hotMoneyAverage = hotMoneyAverageRaw[index] || 0;
    return {
      banker: Number((banker * 5).toFixed(4)),
      weakBanker: Number((banker < bankerAverage && banker !== 20 ? banker * 5 : 0).toFixed(4)),
      hotMoney: Number((hotMoney * 5).toFixed(4)),
      retailer: Number(((20 - hotMoneyAverage) * 5).toFixed(4)),
      bankerAverage: Number((bankerAverage * 5).toFixed(4)),
      hotMoneyAverage: Number((hotMoneyAverage * 5).toFixed(4)),
    };
  });
}

function enrich(rows) {
  const closes = rows.map((row) => row.close);
  const volumes = rows.map((row) => row.volume);
  const bb = bollinger(closes);
  const macdResult = macd(closes);
  const mcdxResult = mcdx(rows);
  const values = {
    ma20: sma(closes, 20),
    ma50: sma(closes, 50),
    ma200: sma(closes, 200),
    ema10: ema(closes, 10),
    ema50: ema(closes, 50),
    volumeMa20: sma(volumes, 20),
    rsi14: rsi(closes),
    macd: macdResult.line,
    macdSignal: macdResult.signal,
    macdHistogram: macdResult.histogram,
    bbMiddle: bb.middle,
    bbUpper: bb.upper,
    bbLower: bb.lower,
    adLine: accumulationDistribution(rows),
    mcdxBanker: mcdxResult.map((item) => item.banker),
    mcdxWeakBanker: mcdxResult.map((item) => item.weakBanker),
    mcdxHotMoney: mcdxResult.map((item) => item.hotMoney),
    mcdxRetailer: mcdxResult.map((item) => item.retailer),
    mcdxBankerAverage: mcdxResult.map((item) => item.bankerAverage),
    mcdxHotMoneyAverage: mcdxResult.map((item) => item.hotMoneyAverage),
  };
  return rows.map((row, index) => {
    const indicators = {};
    Object.keys(values).forEach((key) => {
      indicators[key] = values[key][index];
    });
    return { ...row, indicators };
  });
}

module.exports = {
  sma, ema, rsi, macd, bollinger, accumulationDistribution, mcdx, enrich,
};
