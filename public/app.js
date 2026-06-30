/* global LightweightCharts */
'use strict';

const colors = {
  background: '#10151d',
  text: '#8490a1',
  grid: '#252d39',
  green: '#16d890',
  red: '#ff5570',
  orange: '#ffad42',
  blue: '#4a8cff',
  purple: '#9a7cff',
};

const charts = [];
let currentSymbol = 'GEX';
let watchlist = [];

function number(value, digits = 2) {
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: digits }).format(value);
}

function compact(value) {
  return new Intl.NumberFormat('vi-VN', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function dateLabel(date) {
  const [year, month, day] = date.split('-');
  return `${day}/${month}/${year}`;
}

function setText(id, value) {
  document.getElementById(id).textContent = value;
}

function chartOptions(container) {
  return {
    width: container.clientWidth,
    height: container.clientHeight,
    layout: { background: { color: colors.background }, textColor: colors.text, fontSize: 11 },
    grid: { vertLines: { color: colors.grid }, horzLines: { color: colors.grid } },
    rightPriceScale: { borderColor: colors.grid },
    timeScale: { borderColor: colors.grid, timeVisible: false, rightOffset: 3 },
    crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
    localization: { locale: 'vi-VN' },
  };
}

function createChart(id) {
  const container = document.getElementById(id);
  const chart = LightweightCharts.createChart(container, chartOptions(container));
  charts.push({ chart, container });
  return chart;
}

function lineData(rows, key) {
  return rows.map((row) => (
    row.indicators[key] == null
      ? { time: row.date }
      : { time: row.date, value: row.indicators[key] }
  ));
}

function destroyCharts() {
  charts.splice(0).forEach(({ chart }) => chart.remove());
}

function indicatorValue(value, digits = 2) {
  return value == null || !Number.isFinite(value) ? '—' : number(value, digits);
}

function updateHoverStats(row) {
  if (!row) return;
  const indicator = row.indicators;
  const changeTone = row.close >= row.open ? 'positive' : 'negative';
  document.getElementById('hover-stats').innerHTML = `
    <div class="hover-stat date"><span>Ngày</span><strong>${dateLabel(row.date)}</strong></div>
    <div class="hover-stat"><span>O / H / L / C</span><strong class="${changeTone}">${number(row.open)} / ${number(row.high)} / ${number(row.low)} / ${number(row.close)}</strong></div>
    <div class="hover-stat volume-stat"><span>Khối lượng</span><strong>${compact(row.volume)}</strong></div>
    <div class="hover-stat ma20-stat"><span>MA20</span><strong>${indicatorValue(indicator.ma20)}</strong></div>
    <div class="hover-stat ma50-stat"><span>MA50</span><strong>${indicatorValue(indicator.ma50)}</strong></div>
    <div class="hover-stat ma200-stat"><span>MA200</span><strong>${indicatorValue(indicator.ma200)}</strong></div>
    <div class="hover-stat bb-upper-stat"><span>BB trên</span><strong>${indicatorValue(indicator.bbUpper)}</strong></div>
    <div class="hover-stat bb-middle-stat"><span>BB giữa</span><strong>${indicatorValue(indicator.bbMiddle)}</strong></div>
    <div class="hover-stat bb-lower-stat"><span>BB dưới</span><strong>${indicatorValue(indicator.bbLower)}</strong></div>
    <div class="hover-stat rsi-stat"><span>RSI 14</span><strong>${indicatorValue(indicator.rsi14)}</strong></div>
    <div class="hover-stat macd-stat"><span>MACD</span><strong>${indicatorValue(indicator.macd)}</strong></div>
    <div class="hover-stat signal-stat"><span>Signal</span><strong>${indicatorValue(indicator.macdSignal)}</strong></div>
    <div class="hover-stat ad-stat"><span>A/D</span><strong>${indicator.adLine == null ? '—' : compact(indicator.adLine)}</strong></div>
    <div class="hover-stat mcdx-banker"><span>MCDX nhóm lớn</span><strong>${indicatorValue(indicator.mcdxBanker)}%</strong></div>
    <div class="hover-stat mcdx-hot"><span>MCDX đầu cơ</span><strong>${indicatorValue(indicator.mcdxHotMoney)}%</strong></div>
    <div class="hover-stat mcdx-retail"><span>MCDX nhỏ lẻ</span><strong>${indicatorValue(indicator.mcdxRetailer)}%</strong></div>
  `;
}

function timeKey(time) {
  if (typeof time === 'string') return time;
  if (time && typeof time === 'object' && time.year) {
    return `${time.year}-${String(time.month).padStart(2, '0')}-${String(time.day).padStart(2, '0')}`;
  }
  return null;
}

function drawCharts(rows) {
  destroyCharts();
  const rowsByDate = new Map(rows.map((row) => [row.date, row]));
  const priceChart = createChart('price-chart');
  const candles = priceChart.addCandlestickSeries({
    upColor: colors.green, downColor: colors.red,
    borderUpColor: colors.green, borderDownColor: colors.red,
    wickUpColor: colors.green, wickDownColor: colors.red,
  });
  candles.setData(rows.map((row) => ({
    time: row.date, open: row.open, high: row.high, low: row.low, close: row.close,
  })));
  [
    ['ma20', colors.orange, 2],
    ['ma50', colors.green, 2],
    ['ma200', colors.purple, 2],
    ['bbUpper', colors.blue, 1],
    ['bbMiddle', '#546caa', 1],
    ['bbLower', colors.blue, 1],
  ].forEach(([key, color, lineWidth]) => {
    const series = priceChart.addLineSeries({ color, lineWidth, priceLineVisible: false, lastValueVisible: false });
    series.setData(lineData(rows, key));
  });

  const volumeChart = createChart('volume-chart');
  const volumes = volumeChart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceLineVisible: false });
  volumes.setData(rows.map((row) => ({
    time: row.date, value: row.volume, color: row.close >= row.open ? 'rgba(22,216,144,.55)' : 'rgba(255,85,112,.55)',
  })));
  const volumeMa = volumeChart.addLineSeries({ color: colors.blue, lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
  volumeMa.setData(lineData(rows, 'volumeMa20'));

  const mcdxChart = createChart('mcdx-chart');
  const mcdxRetail = mcdxChart.addHistogramSeries({
    color: '#52f500', priceLineVisible: false, lastValueVisible: false,
  });
  const mcdxHot = mcdxChart.addHistogramSeries({
    color: '#f2ed00', priceLineVisible: false, lastValueVisible: false,
  });
  const mcdxBanker = mcdxChart.addHistogramSeries({
    color: '#ff254e', priceLineVisible: false, lastValueVisible: false,
  });
  const mcdxWeakBanker = mcdxChart.addHistogramSeries({
    color: '#fd8c73', priceLineVisible: false, lastValueVisible: false,
  });
  mcdxRetail.setData(rows.map((row) => ({ time: row.date, value: 100 })));
  mcdxHot.setData(rows.map((row) => ({
    time: row.date,
    value: row.indicators.mcdxHotMoney,
  })));
  mcdxBanker.setData(rows.map((row) => ({
    time: row.date,
    value: row.indicators.mcdxBanker,
  })));
  mcdxWeakBanker.setData(rows.filter((row) => row.indicators.mcdxWeakBanker > 0).map((row) => ({
    time: row.date,
    value: row.indicators.mcdxWeakBanker,
  })));
  mcdxChart.priceScale('right').applyOptions({ scaleMargins: { top: 0.05, bottom: 0 } });

  const rsiChart = createChart('rsi-chart');
  const rsi = rsiChart.addLineSeries({ color: colors.purple, lineWidth: 2, priceLineVisible: false });
  rsi.setData(lineData(rows, 'rsi14'));
  rsi.createPriceLine({ price: 70, color: '#5c526f', lineStyle: 2, axisLabelVisible: false });
  rsi.createPriceLine({ price: 30, color: '#5c526f', lineStyle: 2, axisLabelVisible: false });
  rsiChart.priceScale('right').applyOptions({ scaleMargins: { top: 0.15, bottom: 0.15 } });

  const macdChart = createChart('macd-chart');
  const histogram = macdChart.addHistogramSeries({ priceLineVisible: false });
  histogram.setData(rows.map((row) => (
    row.indicators.macdHistogram == null
      ? { time: row.date }
      : {
        time: row.date,
        value: row.indicators.macdHistogram,
        color: row.indicators.macdHistogram >= 0 ? 'rgba(22,216,144,.75)' : 'rgba(255,85,112,.75)',
      }
  )));
  [['macd', colors.blue], ['macdSignal', colors.orange]].forEach(([key, color]) => {
    const series = macdChart.addLineSeries({ color, lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
    series.setData(lineData(rows, key));
  });

  const adChart = createChart('ad-chart');
  const adLine = adChart.addLineSeries({
    color: colors.green,
    lineWidth: 2,
    priceLineVisible: false,
    priceFormat: { type: 'volume' },
  });
  adLine.setData(lineData(rows, 'adLine'));

  charts.forEach(({ chart }) => chart.timeScale().fitContent());
  const initialRange = charts[0].chart.timeScale().getVisibleRange();
  if (initialRange) {
    charts.slice(1).forEach(({ chart }) => chart.timeScale().setVisibleRange(initialRange));
  }
  let syncingRange = false;
  charts.forEach(({ chart }, index) => {
    chart.timeScale().subscribeVisibleTimeRangeChange((range) => {
      if (!range || syncingRange) return;
      syncingRange = true;
      charts.forEach(({ chart: other }, otherIndex) => {
        if (otherIndex !== index) other.timeScale().setVisibleRange(range);
      });
      syncingRange = false;
    });
    chart.subscribeCrosshairMove((parameter) => {
      const date = timeKey(parameter.time);
      updateHoverStats(date && rowsByDate.get(date) ? rowsByDate.get(date) : rows[rows.length - 1]);
    });
  });
  updateHoverStats(rows[rows.length - 1]);
}

function updateSummary(payload) {
  const rows = payload.prices;
  const latest = rows[rows.length - 1];
  const previous = rows[rows.length - 2] || latest;
  const change = latest.close - previous.close;
  const percent = (latest.close / previous.close - 1) * 100;
  const tone = change >= 0 ? 'positive' : 'negative';

  setText('symbol', payload.symbol);
  setText('exchange', latest.floor || 'VIỆT NAM');
  setText('latest-date', `Phiên ${new Intl.DateTimeFormat('vi-VN').format(new Date(`${latest.date}T00:00:00`))}`);
  setText('last-price', number(latest.close));
  setText('price-change', `${change >= 0 ? '+' : ''}${number(change)} (${percent >= 0 ? '+' : ''}${number(percent)}%)`);
  document.getElementById('price-change').className = tone;
  setText('open-price', number(latest.open));
  setText('high-price', number(latest.high));
  setText('low-price', number(latest.low));
  setText('volume', compact(latest.volume));
  setText('sync-time', `Đồng bộ ${new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(payload.syncedAt))}`);
}

function updateAnalysis(analysis) {
  setText('score', analysis.score > 0 ? `+${analysis.score}` : analysis.score);
  setText('verdict', analysis.verdict);
  document.getElementById('support-zones').innerHTML = analysis.supportZones.map((zone, index) => `
    <div class="zone support"><em>S${index + 1}</em><strong>${number(zone.low)} – ${number(zone.high)}</strong></div>
  `).join('');
  document.getElementById('resistance-zones').innerHTML = analysis.resistanceZones.map((zone, index) => `
    <div class="zone resistance"><em>R${index + 1}</em><strong>${number(zone.low)} – ${number(zone.high)}</strong></div>
  `).join('');
  const ring = document.getElementById('score-ring');
  const progress = Math.max(0, Math.min(100, (analysis.score + 100) / 2));
  ring.style.setProperty('--score-angle', `${progress * 3.6}deg`);
  document.getElementById('verdict').className = analysis.score >= 35 ? 'positive' : analysis.score <= -35 ? 'negative' : 'neutral';
  document.getElementById('signals').innerHTML = analysis.signals.map((signal) => `
    <div class="signal">
      <div class="signal-head ${signal.tone}"><span class="signal-dot"></span>${signal.label}</div>
      <p>${signal.detail}</p>
    </div>
  `).join('');
}

function showMessage(text, isError = false) {
  const message = document.getElementById('message');
  message.hidden = !text;
  message.textContent = text || '';
  message.style.color = isError ? colors.red : '';
  message.style.borderColor = isError ? 'rgba(255,85,112,.4)' : '';
}

function renderWatchlist() {
  const container = document.getElementById('watchlist');
  container.innerHTML = watchlist.length
    ? watchlist.map((symbol) => `
      <div class="watchlist-item">
        <button class="watchlist-symbol ${symbol === currentSymbol ? 'active' : ''}" type="button" data-symbol="${symbol}">${symbol}</button>
        <button class="watchlist-remove" type="button" data-remove="${symbol}" aria-label="Xóa ${symbol} khỏi watchlist">×</button>
      </div>
    `).join('')
    : '<span class="watchlist-empty">Chưa có mã nào trong watchlist.</span>';
  const addButton = document.getElementById('add-watchlist-button');
  addButton.disabled = watchlist.includes(currentSymbol);
  addButton.textContent = addButton.disabled ? '✓ Đã có trong watchlist' : '＋ Thêm mã hiện tại';
}

async function loadWatchlist() {
  try {
    const response = await fetch('/api/watchlist');
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Không thể tải watchlist');
    watchlist = payload.items;
    renderWatchlist();
  } catch (error) {
    showMessage(error.message, true);
  }
}

async function addToWatchlist() {
  try {
    const response = await fetch('/api/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol: currentSymbol }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Không thể thêm mã');
    watchlist = payload.items;
    renderWatchlist();
  } catch (error) {
    showMessage(error.message, true);
  }
}

async function removeFromWatchlist(symbol) {
  try {
    const response = await fetch(`/api/watchlist/${symbol}`, { method: 'DELETE' });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Không thể xóa mã');
    watchlist = payload.items;
    renderWatchlist();
  } catch (error) {
    showMessage(error.message, true);
  }
}

async function load(symbol, refresh = false) {
  const normalized = symbol.trim().toUpperCase();
  if (!/^[A-Z0-9]{2,10}$/.test(normalized)) {
    showMessage('Mã cổ phiếu chỉ gồm 2–10 chữ cái hoặc chữ số.', true);
    return;
  }
  currentSymbol = normalized;
  document.getElementById('symbol-input').value = normalized;
  document.getElementById('loading').hidden = false;
  showMessage('');
  try {
    const response = await fetch(`/api/stocks/${normalized}${refresh ? '?refresh=1' : ''}`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Không thể tải dữ liệu');
    updateSummary(payload);
    updateAnalysis(payload.analysis);
    drawCharts(payload.prices);
    renderWatchlist();
    if (payload.warning) showMessage(payload.warning);
    history.replaceState(null, '', `?symbol=${normalized}`);
    document.title = `${normalized} · VN Stock Lab`;
  } catch (error) {
    showMessage(`${error.message} Hãy thử lại sau hoặc kiểm tra kết nối tới VNDirect.`, true);
  } finally {
    document.getElementById('loading').hidden = true;
  }
}

document.getElementById('search-form').addEventListener('submit', (event) => {
  event.preventDefault();
  load(document.getElementById('symbol-input').value);
});
document.getElementById('refresh-button').addEventListener('click', () => load(currentSymbol, true));
document.getElementById('add-watchlist-button').addEventListener('click', addToWatchlist);
document.getElementById('watchlist').addEventListener('click', (event) => {
  const symbol = event.target.dataset.symbol;
  const remove = event.target.dataset.remove;
  if (symbol) load(symbol);
  if (remove) removeFromWatchlist(remove);
});
window.addEventListener('resize', () => {
  charts.forEach(({ chart, container }) => chart.applyOptions({ width: container.clientWidth, height: container.clientHeight }));
});

const querySymbol = new URLSearchParams(location.search).get('symbol') || 'GEX';
loadWatchlist();
load(querySymbol);
