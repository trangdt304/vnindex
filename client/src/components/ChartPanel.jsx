import { useEffect, useRef, useState } from 'react';
import { createChart, CrosshairMode } from 'lightweight-charts';
import {
  compact, dateLabel, indicatorValue, number,
} from '../format';

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

function chartOptions(container) {
  return {
    width: container.clientWidth,
    height: container.clientHeight,
    layout: {
      background: { color: colors.background },
      textColor: colors.text,
      fontSize: 11,
    },
    grid: {
      vertLines: { color: colors.grid },
      horzLines: { color: colors.grid },
    },
    rightPriceScale: { borderColor: colors.grid },
    timeScale: {
      borderColor: colors.grid,
      timeVisible: false,
      rightOffset: 3,
    },
    crosshair: { mode: CrosshairMode.Normal },
    localization: { locale: 'vi-VN' },
  };
}

function lineData(rows, key) {
  return rows.map((row) => (
    row.indicators[key] == null
      ? { time: row.date }
      : { time: row.date, value: row.indicators[key] }
  ));
}

function timeKey(time) {
  if (typeof time === 'string') return time;
  if (time && typeof time === 'object' && time.year) {
    return `${time.year}-${String(time.month).padStart(2, '0')}-${String(time.day).padStart(2, '0')}`;
  }
  return null;
}

function HoverStats({ row }) {
  if (!row) {
    return (
      <div className="hover-stats">
        <span className="hover-hint">Di chuột trên biểu đồ để xem dữ liệu từng phiên</span>
      </div>
    );
  }

  const indicator = row.indicators;
  const changeTone = row.close >= row.open ? 'positive' : 'negative';
  return (
    <div className="hover-stats" aria-live="polite">
      <div className="hover-stat date">
        <span>Ngày</span>
        <strong>{dateLabel(row.date)}</strong>
      </div>
      <div className="hover-stat">
        <span>O / H / L / C</span>
        <strong className={changeTone}>
          {number(row.open)} / {number(row.high)} / {number(row.low)} / {number(row.close)}
        </strong>
      </div>
      <div className="hover-stat volume-stat">
        <span>Khối lượng</span>
        <strong>{compact(row.volume)}</strong>
      </div>
      <div className="hover-stat ma20-stat"><span>MA20</span><strong>{indicatorValue(indicator.ma20)}</strong></div>
      <div className="hover-stat ma50-stat"><span>MA50</span><strong>{indicatorValue(indicator.ma50)}</strong></div>
      <div className="hover-stat ma200-stat"><span>MA200</span><strong>{indicatorValue(indicator.ma200)}</strong></div>
      <div className="hover-stat bb-upper-stat"><span>BB trên</span><strong>{indicatorValue(indicator.bbUpper)}</strong></div>
      <div className="hover-stat bb-middle-stat"><span>BB giữa</span><strong>{indicatorValue(indicator.bbMiddle)}</strong></div>
      <div className="hover-stat bb-lower-stat"><span>BB dưới</span><strong>{indicatorValue(indicator.bbLower)}</strong></div>
      <div className="hover-stat rsi-stat"><span>RSI 14</span><strong>{indicatorValue(indicator.rsi14)}</strong></div>
      <div className="hover-stat macd-stat"><span>MACD</span><strong>{indicatorValue(indicator.macd)}</strong></div>
      <div className="hover-stat signal-stat"><span>Signal</span><strong>{indicatorValue(indicator.macdSignal)}</strong></div>
      <div className="hover-stat ad-stat"><span>A/D</span><strong>{indicator.adLine == null ? '—' : compact(indicator.adLine)}</strong></div>
      <div className="hover-stat mcdx-banker"><span>MCDX nhóm lớn</span><strong>{indicatorValue(indicator.mcdxBanker)}%</strong></div>
      <div className="hover-stat mcdx-hot"><span>MCDX đầu cơ</span><strong>{indicatorValue(indicator.mcdxHotMoney)}%</strong></div>
      <div className="hover-stat mcdx-retail"><span>MCDX nhỏ lẻ</span><strong>{indicatorValue(indicator.mcdxRetailer)}%</strong></div>
    </div>
  );
}

export default function ChartPanel({ rows }) {
  const priceRef = useRef(null);
  const volumeRef = useRef(null);
  const mcdxRef = useRef(null);
  const rsiRef = useRef(null);
  const macdRef = useRef(null);
  const adRef = useRef(null);
  const [hoverRow, setHoverRow] = useState(rows[rows.length - 1]);

  useEffect(() => {
    if (!rows.length) return undefined;

    setHoverRow(rows[rows.length - 1]);
    const charts = [];
    const addChart = (container) => {
      const chart = createChart(container, chartOptions(container));
      charts.push({ chart, container });
      return chart;
    };

    const rowsByDate = new Map(rows.map((row) => [row.date, row]));
    const priceChart = addChart(priceRef.current);
    const candles = priceChart.addCandlestickSeries({
      upColor: colors.green,
      downColor: colors.red,
      borderUpColor: colors.green,
      borderDownColor: colors.red,
      wickUpColor: colors.green,
      wickDownColor: colors.red,
    });
    candles.setData(rows.map((row) => ({
      time: row.date,
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
    })));
    [
      ['ma20', colors.orange, 2],
      ['ma50', colors.green, 2],
      ['ma200', colors.purple, 2],
      ['bbUpper', colors.blue, 1],
      ['bbMiddle', '#546caa', 1],
      ['bbLower', colors.blue, 1],
    ].forEach(([key, color, lineWidth]) => {
      const series = priceChart.addLineSeries({
        color,
        lineWidth,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      series.setData(lineData(rows, key));
    });

    const volumeChart = addChart(volumeRef.current);
    const volumes = volumeChart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceLineVisible: false,
    });
    volumes.setData(rows.map((row) => ({
      time: row.date,
      value: row.volume,
      color: row.close >= row.open
        ? 'rgba(22,216,144,.55)'
        : 'rgba(255,85,112,.55)',
    })));
    const volumeMa = volumeChart.addLineSeries({
      color: colors.blue,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    volumeMa.setData(lineData(rows, 'volumeMa20'));

    const mcdxChart = addChart(mcdxRef.current);
    const mcdxRetail = mcdxChart.addHistogramSeries({
      color: '#52f500',
      priceLineVisible: false,
      lastValueVisible: false,
    });
    const mcdxHot = mcdxChart.addHistogramSeries({
      color: '#f2ed00',
      priceLineVisible: false,
      lastValueVisible: false,
    });
    const mcdxBanker = mcdxChart.addHistogramSeries({
      color: '#ff254e',
      priceLineVisible: false,
      lastValueVisible: false,
    });
    const mcdxWeakBanker = mcdxChart.addHistogramSeries({
      color: '#fd8c73',
      priceLineVisible: false,
      lastValueVisible: false,
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
    mcdxWeakBanker.setData(
      rows
        .filter((row) => row.indicators.mcdxWeakBanker > 0)
        .map((row) => ({
          time: row.date,
          value: row.indicators.mcdxWeakBanker,
        })),
    );
    mcdxChart.priceScale('right').applyOptions({
      scaleMargins: { top: 0.05, bottom: 0 },
    });

    const rsiChart = addChart(rsiRef.current);
    const rsi = rsiChart.addLineSeries({
      color: colors.purple,
      lineWidth: 2,
      priceLineVisible: false,
    });
    rsi.setData(lineData(rows, 'rsi14'));
    rsi.createPriceLine({
      price: 70,
      color: '#5c526f',
      lineStyle: 2,
      axisLabelVisible: false,
    });
    rsi.createPriceLine({
      price: 30,
      color: '#5c526f',
      lineStyle: 2,
      axisLabelVisible: false,
    });
    rsiChart.priceScale('right').applyOptions({
      scaleMargins: { top: 0.15, bottom: 0.15 },
    });

    const macdChart = addChart(macdRef.current);
    const histogram = macdChart.addHistogramSeries({ priceLineVisible: false });
    histogram.setData(rows.map((row) => (
      row.indicators.macdHistogram == null
        ? { time: row.date }
        : {
          time: row.date,
          value: row.indicators.macdHistogram,
          color: row.indicators.macdHistogram >= 0
            ? 'rgba(22,216,144,.75)'
            : 'rgba(255,85,112,.75)',
        }
    )));
    [['macd', colors.blue], ['macdSignal', colors.orange]].forEach(([key, color]) => {
      const series = macdChart.addLineSeries({
        color,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      series.setData(lineData(rows, key));
    });

    const adChart = addChart(adRef.current);
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
      charts.slice(1).forEach(({ chart }) => {
        chart.timeScale().setVisibleRange(initialRange);
      });
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
        setHoverRow(
          date && rowsByDate.get(date)
            ? rowsByDate.get(date)
            : rows[rows.length - 1],
        );
      });
    });

    const resize = () => {
      charts.forEach(({ chart, container }) => {
        chart.applyOptions({
          width: container.clientWidth,
          height: container.clientHeight,
        });
      });
    };
    window.addEventListener('resize', resize);

    return () => {
      window.removeEventListener('resize', resize);
      charts.forEach(({ chart }) => chart.remove());
    };
  }, [rows]);

  return (
    <div className="chart-card">
      <div className="card-head">
        <div>
          <h2>Biểu đồ kỹ thuật</h2>
          <p>Nến ngày · Giá điều chỉnh</p>
        </div>
        <div className="legend">
          <span className="ma20">MA20</span>
          <span className="ma50">MA50</span>
          <span className="ma200">MA200</span>
          <span className="bb">Bollinger</span>
        </div>
      </div>
      <HoverStats row={hoverRow} />
      <div ref={priceRef} className="chart price-chart" />
      <div ref={volumeRef} className="chart volume-chart" />
      <div className="subchart-label">
        MCDX CỤC BỘ · <span className="mcdx-banker">NHÓM LỚN</span> ·{' '}
        <span className="mcdx-hot">ĐẦU CƠ</span> ·{' '}
        <span className="mcdx-retail">NHỎ LẺ</span> · VNDirect
      </div>
      <div ref={mcdxRef} className="chart mcdx-chart" />
      <div className="subchart-label">RSI 14</div>
      <div ref={rsiRef} className="chart oscillator-chart" />
      <div className="subchart-label">MACD 12 · 26 · 9</div>
      <div ref={macdRef} className="chart oscillator-chart" />
      <div className="subchart-label">A/D · ACCUMULATION / DISTRIBUTION</div>
      <div ref={adRef} className="chart oscillator-chart" />
    </div>
  );
}
