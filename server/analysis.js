'use strict';

function round(value, digits = 2) {
  return value == null ? null : Number(value.toFixed(digits));
}

function averageTrueRange(rows, period = 14) {
  const recent = rows.slice(-(period + 1));
  if (recent.length < 2) return 0;
  const ranges = recent.slice(1).map((row, index) => {
    const previousClose = recent[index].close;
    return Math.max(
      row.high - row.low,
      Math.abs(row.high - previousClose),
      Math.abs(row.low - previousClose),
    );
  });
  return ranges.reduce((sum, value) => sum + value, 0) / ranges.length;
}

function clusterLevels(levels, tolerance) {
  const clusters = [];
  levels.slice().sort((a, b) => a - b).forEach((level) => {
    const nearest = clusters.find((cluster) => Math.abs(level - cluster.center) <= tolerance);
    if (nearest) {
      nearest.values.push(level);
      nearest.center = nearest.values.reduce((sum, value) => sum + value, 0) / nearest.values.length;
    } else {
      clusters.push({ center: level, values: [level] });
    }
  });
  return clusters;
}

function nearestLevels(rows, lookback = 120) {
  const recent = rows.slice(-lookback);
  if (!recent.length) {
    return {
      support: null, resistance: null, supportZones: [], resistanceZones: [],
    };
  }
  const last = recent[recent.length - 1].close;
  const atr = averageTrueRange(recent);
  const clusterTolerance = Math.max(atr * 0.65, last * 0.012);
  const halfWidth = Math.max(atr * 0.22, last * 0.003);
  const pivotLows = [];
  const pivotHighs = [];

  for (let index = 2; index < recent.length - 2; index += 1) {
    const window = recent.slice(index - 2, index + 3);
    const row = recent[index];
    if (row.low === Math.min(...window.map((item) => item.low))) pivotLows.push(row.low);
    if (row.high === Math.max(...window.map((item) => item.high))) pivotHighs.push(row.high);
  }

  const supportClusters = clusterLevels(
    pivotLows.length ? pivotLows : recent.map((row) => row.low),
    clusterTolerance,
  ).filter((cluster) => cluster.center < last)
    .sort((a, b) => b.center - a.center);
  const resistanceClusters = clusterLevels(
    pivotHighs.length ? pivotHighs : recent.map((row) => row.high),
    clusterTolerance,
  ).filter((cluster) => cluster.center > last)
    .sort((a, b) => a.center - b.center);
  const spacing = Math.max(atr * 1.5, last * 0.03);

  function completeZones(clusters, direction) {
    const centers = clusters.slice(0, 3).map((cluster) => cluster.center);
    while (centers.length < 3) {
      const base = centers.length ? centers[centers.length - 1] : last;
      centers.push(Math.max(0.01, base + direction * spacing));
    }
    return centers.map((center) => ({
      low: Math.max(0.01, center - halfWidth),
      high: center + halfWidth,
      center,
    }));
  }

  const supportZones = completeZones(supportClusters, -1);
  const resistanceZones = completeZones(resistanceClusters, 1);
  return {
    support: supportZones[0].center,
    resistance: resistanceZones[0].center,
    supportZones,
    resistanceZones,
  };
}

function analyze(rows) {
  if (!rows.length) return null;
  const latest = rows[rows.length - 1];
  const previous = rows[rows.length - 2] || latest;
  const indicator = latest.indicators;
  const signals = [];
  let score = 0;

  if (indicator.ma20 != null) {
    const positive = latest.close >= indicator.ma20;
    score += positive ? 1 : -1;
    signals.push({
      label: 'Xu hướng ngắn hạn',
      tone: positive ? 'positive' : 'negative',
      detail: `Giá ${positive ? 'trên' : 'dưới'} MA20 (${round(indicator.ma20)}).`,
    });
  }
  if (indicator.ma50 != null) {
    const positive = indicator.ma20 >= indicator.ma50;
    score += positive ? 1 : -1;
    signals.push({
      label: 'Cấu trúc xu hướng',
      tone: positive ? 'positive' : 'negative',
      detail: `MA20 ${positive ? 'trên' : 'dưới'} MA50 (${round(indicator.ma50)}).`,
    });
  }
  if (indicator.ma200 != null) {
    const positive = indicator.ma50 >= indicator.ma200;
    score += positive ? 1 : -1;
    signals.push({
      label: 'Xu hướng dài hạn',
      tone: positive ? 'positive' : 'negative',
      detail: `MA50 ${positive ? 'trên' : 'dưới'} MA200 (${round(indicator.ma200)}).`,
    });
  }
  if (indicator.rsi14 != null) {
    const tone = indicator.rsi14 > 70 ? 'warning' : indicator.rsi14 < 30 ? 'positive' : 'neutral';
    if (indicator.rsi14 >= 50 && indicator.rsi14 <= 70) score += 1;
    if (indicator.rsi14 > 70 || indicator.rsi14 < 40) score -= 0.5;
    signals.push({
      label: 'Động lượng RSI',
      tone,
      detail: `RSI(14) ở ${round(indicator.rsi14)}${indicator.rsi14 > 70 ? ', vùng quá mua' : indicator.rsi14 < 30 ? ', vùng quá bán' : ', vùng trung tính'}.`,
    });
  }
  if (indicator.macd != null && indicator.macdSignal != null) {
    const positive = indicator.macd >= indicator.macdSignal;
    score += positive ? 1 : -1;
    signals.push({
      label: 'Động lượng MACD',
      tone: positive ? 'positive' : 'negative',
      detail: `MACD ${positive ? 'trên' : 'dưới'} đường tín hiệu.`,
    });
  }
  if (indicator.volumeMa20 != null) {
    const ratio = latest.volume / indicator.volumeMa20;
    if (ratio > 1.2 && latest.close > previous.close) score += 0.5;
    signals.push({
      label: 'Khối lượng',
      tone: ratio > 1.2 ? 'positive' : 'neutral',
      detail: `Khối lượng bằng ${round(ratio, 1)}x trung bình 20 phiên.`,
    });
  }
  if (rows.length >= 21 && indicator.adLine != null) {
    const comparison = rows[rows.length - 21];
    const adRising = indicator.adLine > comparison.indicators.adLine;
    const priceRising = latest.close > comparison.close;
    const divergence = adRising !== priceRising;
    if (adRising) score += divergence ? 0.5 : 1;
    if (!adRising) score -= divergence ? 0.5 : 1;
    signals.push({
      label: adRising ? 'Dòng tiền tích lũy' : 'Dòng tiền phân phối',
      tone: adRising ? 'positive' : 'negative',
      detail: divergence
        ? `A/D 20 phiên ${adRising ? 'tăng' : 'giảm'} ngược chiều giá, xuất hiện phân kỳ cần theo dõi.`
        : `A/D 20 phiên ${adRising ? 'tăng cùng giá, xác nhận lực mua' : 'giảm cùng giá, xác nhận áp lực bán'}.`,
    });
  }
  if (indicator.mcdxBanker != null) {
    const earlier = rows[Math.max(0, rows.length - 6)].indicators.mcdxBanker;
    const rising = indicator.mcdxBanker > earlier;
    signals.push({
      label: 'MCDX cục bộ',
      tone: indicator.mcdxBanker >= 25 ? 'positive' : 'neutral',
      detail: `Sức mạnh nhóm lớn ${round(indicator.mcdxBanker)}% (${rising ? 'đang tăng' : 'đang giảm'}); đầu cơ ${round(indicator.mcdxHotMoney)}%, nhỏ lẻ ${round(indicator.mcdxRetailer)}%.`,
    });
  }

  const levels = nearestLevels(rows);
  const normalized = Math.max(-100, Math.min(100, Math.round(score / 6.5 * 100)));
  const verdict = normalized >= 35 ? 'Tích cực' : normalized <= -35 ? 'Tiêu cực' : 'Trung tính';

  return {
    score: normalized,
    verdict,
    change: round(latest.close - previous.close),
    changePercent: round((latest.close / previous.close - 1) * 100),
    support: round(levels.support),
    resistance: round(levels.resistance),
    supportZones: levels.supportZones.map((zone) => ({
      low: round(zone.low),
      high: round(zone.high),
      center: round(zone.center),
    })),
    resistanceZones: levels.resistanceZones.map((zone) => ({
      low: round(zone.low),
      high: round(zone.high),
      center: round(zone.center),
    })),
    signals,
    disclaimer: 'Phân tích kỹ thuật mang tính tham khảo, không phải khuyến nghị mua hoặc bán.',
  };
}

module.exports = {
  analyze, nearestLevels, averageTrueRange, clusterLevels,
};
