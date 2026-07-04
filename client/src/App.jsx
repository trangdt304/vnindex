import { useEffect, useRef, useState } from 'react';
import ChartPanel from './components/ChartPanel';
import {
  compact, dateTime, number,
} from './format';

const EMPTY_AI = {
  available: false,
  pending: false,
  data: null,
  error: '',
};

function normalizeSymbol(value) {
  const symbol = String(value || '').trim().toUpperCase();
  return /^[A-Z0-9]{2,10}$/.test(symbol) ? symbol : '';
}

function initialSymbol() {
  return normalizeSymbol(new URLSearchParams(window.location.search).get('symbol')) || 'GEX';
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || 'Yêu cầu không thành công.');
  }
  return payload;
}

function TopBar({
  query, setQuery, onSubmit, onRefresh, loading,
}) {
  return (
    <header className="topbar">
      <a className="brand" href="/" aria-label="VN Stock Lab">
        <span className="brand-mark">V</span>
        <span><strong>VN Stock</strong><small>LAB</small></span>
      </a>
      <form className="search" onSubmit={onSubmit}>
        <span>⌕</span>
        <input
          value={query}
          maxLength="10"
          autoComplete="off"
          aria-label="Mã cổ phiếu"
          onChange={(event) => setQuery(event.target.value)}
        />
        <button type="submit">Phân tích</button>
      </form>
      <button
        className="ghost-button"
        type="button"
        onClick={onRefresh}
        disabled={loading}
      >
        ↻ Cập nhật VNDirect
      </button>
    </header>
  );
}

function WatchlistPanel({
  watchlist, symbol, onSelect, onAdd, onRemove,
}) {
  const added = watchlist.includes(symbol);
  return (
    <section className="watchlist-panel">
      <div className="watchlist-title">
        <div><strong>Watchlist</strong><span>Lưu theo IP kết nối</span></div>
        <button
          className="add-watchlist"
          type="button"
          onClick={onAdd}
          disabled={added}
        >
          {added ? '✓ Đã có trong watchlist' : '＋ Thêm mã hiện tại'}
        </button>
      </div>
      <div className="watchlist">
        {watchlist.length ? watchlist.map((item) => (
          <div className="watchlist-item" key={item}>
            <button
              className={`watchlist-symbol ${item === symbol ? 'active' : ''}`}
              type="button"
              onClick={() => onSelect(item)}
            >
              {item}
            </button>
            <button
              className="watchlist-remove"
              type="button"
              aria-label={`Xóa ${item} khỏi watchlist`}
              onClick={() => onRemove(item)}
            >
              ×
            </button>
          </div>
        )) : (
          <span className="watchlist-empty">Chưa có mã nào trong watchlist.</span>
        )}
      </div>
    </section>
  );
}

function Hero({ stock }) {
  const rows = stock.prices;
  const latest = rows[rows.length - 1];
  const previous = rows[rows.length - 2] || latest;
  const change = latest.close - previous.close;
  const percent = (latest.close / previous.close - 1) * 100;
  const tone = change >= 0 ? 'positive' : 'negative';
  const latestDate = new Intl.DateTimeFormat('vi-VN').format(
    new Date(`${latest.date}T00:00:00`),
  );

  return (
    <section className="hero">
      <div>
        <div className="eyebrow">
          <span>{latest.floor || 'VIỆT NAM'}</span> · DỮ LIỆU CUỐI NGÀY
        </div>
        <h1>{stock.symbol}</h1>
        <p className="muted">Phiên {latestDate}</p>
      </div>
      <div className="quote">
        <strong>{number(latest.close)}</strong>
        <span className={tone}>
          {change >= 0 ? '+' : ''}{number(change)} ({percent >= 0 ? '+' : ''}{number(percent)}%)
        </span>
      </div>
      <div className="quote-grid">
        <div><span>Mở cửa</span><strong>{number(latest.open)}</strong></div>
        <div><span>Cao nhất</span><strong>{number(latest.high)}</strong></div>
        <div><span>Thấp nhất</span><strong>{number(latest.low)}</strong></div>
        <div><span>Khối lượng</span><strong>{compact(latest.volume)}</strong></div>
      </div>
    </section>
  );
}

function Message({ message }) {
  if (!message.text) return null;
  return (
    <div className={`message ${message.error ? 'message-error' : ''}`}>
      {message.text}
    </div>
  );
}

function AiAnalysis({ ai, onAnalyze }) {
  let buttonText = 'Phân tích bằng AI';
  if (!ai.available) buttonText = 'AI chưa cấu hình';
  else if (ai.pending) buttonText = 'Gemini đang phân tích…';
  else if (ai.data) buttonText = 'Phân tích lại';

  let content;
  if (ai.pending) {
    content = (
      <div className="ai-analysis-content loading-ai">
        <p>Đang tổng hợp các tín hiệu kỹ thuật…</p>
      </div>
    );
  } else if (ai.error) {
    content = (
      <div className="ai-analysis-content ai-error">
        <p>{ai.error}</p>
      </div>
    );
  } else if (ai.data) {
    const payload = ai.data;
    content = (
      <div className={`ai-analysis-content ${payload.tone}`}>
        <p className="ai-summary">{payload.summary}</p>
        <p className="ai-outlook">{payload.outlook}</p>
        <div className="ai-factors">
          <div className="ai-factor-group positive">
            <strong>Điểm hỗ trợ</strong>
            <ul>{payload.positiveFactors.map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
          <div className="ai-factor-group negative">
            <strong>Rủi ro</strong>
            <ul>{payload.riskFactors.map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
        </div>
        <div className="ai-scenarios">
          <strong className="positive">Kịch bản tích cực</strong>
          <p>{payload.bullishScenario}</p>
          <strong className="negative">Kịch bản tiêu cực</strong>
          <p>{payload.bearishScenario}</p>
        </div>
        <small className="ai-meta">
          {payload.model} · {payload.cached ? 'Đã lưu cache' : 'Vừa tạo'} ·{' '}
          {dateTime(payload.generatedAt)}
        </small>
        <small className="ai-disclaimer">{payload.disclaimer}</small>
      </div>
    );
  } else {
    content = (
      <div className="ai-analysis-content">
        <p>
          {ai.available
            ? 'Nhấn nút để Gemini tổng hợp các tín hiệu kỹ thuật của mã hiện tại.'
            : 'Backend chưa có GEMINI_API_KEY.'}
        </p>
      </div>
    );
  }

  return (
    <section className="ai-analysis">
      <div className="ai-analysis-head">
        <div>
          <span className="ai-label">GEMINI AI</span>
          <h3>Góc nhìn AI</h3>
        </div>
        <button
          id="ai-analysis-button"
          type="button"
          disabled={!ai.available || ai.pending}
          onClick={onAnalyze}
        >
          {buttonText}
        </button>
      </div>
      {content}
    </section>
  );
}

function AnalysisPanel({
  stock, ai, onAnalyze,
}) {
  const { analysis } = stock;
  const scoreProgress = Math.max(0, Math.min(100, (analysis.score + 100) / 2));
  const verdictTone = analysis.score >= 35
    ? 'positive'
    : analysis.score <= -35 ? 'negative' : 'neutral';

  return (
    <aside className="analysis-card">
      <div className="card-head">
        <div>
          <h2>Phân tích kỹ thuật</h2>
          <p>Đồng bộ {dateTime(stock.syncedAt)}</p>
        </div>
        <span className="source-pill">VNDirect</span>
      </div>
      <div className="score-wrap">
        <div
          className="score-ring"
          style={{ '--score-angle': `${scoreProgress * 3.6}deg` }}
        >
          <strong>{analysis.score > 0 ? `+${analysis.score}` : analysis.score}</strong>
          <span>/ 100</span>
        </div>
        <div>
          <span className="muted">Đánh giá tổng hợp</span>
          <h3 className={verdictTone}>{analysis.verdict}</h3>
        </div>
      </div>
      <div className="levels">
        <div>
          <span>3 vùng hỗ trợ</span>
          <div className="zone-list">
            {analysis.supportZones.map((zone, index) => (
              <div className="zone support" key={`${zone.low}-${zone.high}`}>
                <em>S{index + 1}</em>
                <strong>{number(zone.low)} – {number(zone.high)}</strong>
              </div>
            ))}
          </div>
        </div>
        <div>
          <span>3 vùng kháng cự</span>
          <div className="zone-list">
            {analysis.resistanceZones.map((zone, index) => (
              <div className="zone resistance" key={`${zone.low}-${zone.high}`}>
                <em>R{index + 1}</em>
                <strong>{number(zone.low)} – {number(zone.high)}</strong>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="signals">
        {analysis.signals.map((signal) => (
          <div className="signal" key={`${signal.label}:${signal.detail}`}>
            <div className={`signal-head ${signal.tone}`}>
              <span className="signal-dot" />{signal.label}
            </div>
            <p>{signal.detail}</p>
          </div>
        ))}
      </div>
      <AiAnalysis ai={ai} onAnalyze={onAnalyze} />
      <p className="disclaimer">
        Phân tích kỹ thuật mang tính tham khảo, không phải khuyến nghị mua hoặc bán.
      </p>
    </aside>
  );
}

function NewsItem({ item }) {
  const body = (
    <>
      <div className="news-meta">
        <time dateTime={item.publishedAt}>{dateTime(item.publishedAt)}</time>
        <span>{item.source}</span>
      </div>
      <h3>{item.title}</h3>
      {item.summary ? <p>{item.summary}</p> : null}
      {item.url ? <span className="news-read-more">Đọc bài ↗</span> : null}
    </>
  );

  return (
    <article className="news-item">
      {item.url ? (
        <a href={item.url} target="_blank" rel="noopener noreferrer">{body}</a>
      ) : <div>{body}</div>}
    </article>
  );
}

function NewsPanel({ symbol, news }) {
  let content;
  if (news.loading) {
    content = <p className="news-status">Đang cập nhật tin tức {symbol}…</p>;
  } else if (news.error) {
    content = <p className="news-status error">{news.error}</p>;
  } else if (!news.items.length) {
    content = <p className="news-status">Chưa có tin doanh nghiệp cho mã {symbol}.</p>;
  } else {
    content = news.items.map((item) => <NewsItem item={item} key={item.id} />);
  }

  return (
    <section className="news-card">
      <div className="card-head">
        <div>
          <h2>Tin tức doanh nghiệp</h2>
          <p>5 tin mới nhất liên quan đến {symbol}</p>
        </div>
        <span className="source-pill">KBS · VIETSTOCK</span>
      </div>
      <div className="news-list" aria-live="polite">{content}</div>
    </section>
  );
}

export default function App() {
  const firstSymbol = initialSymbol();
  const [selection, setSelection] = useState({
    symbol: firstSymbol,
    force: false,
    version: 0,
  });
  const [query, setQuery] = useState(firstSymbol);
  const [stock, setStock] = useState(null);
  const [watchlist, setWatchlist] = useState([]);
  const [news, setNews] = useState({ loading: true, error: '', items: [] });
  const [ai, setAi] = useState(EMPTY_AI);
  const [message, setMessage] = useState({ text: '', error: false });
  const [loading, setLoading] = useState(true);
  const stockRequestId = useRef(0);
  const aiRequestId = useRef(0);
  const activeSymbol = useRef(firstSymbol);
  const symbol = selection.symbol;
  activeSymbol.current = symbol;

  useEffect(() => {
    const requestId = ++stockRequestId.current;
    aiRequestId.current += 1;
    const controller = new AbortController();
    const suffix = selection.force ? '?refresh=1' : '';

    setLoading(true);
    setStock(null);
    setAi(EMPTY_AI);
    setMessage({ text: '', error: false });
    setNews({ loading: true, error: '', items: [] });

    fetchJson(`/api/stocks/${symbol}${suffix}`, { signal: controller.signal })
      .then((payload) => {
        if (requestId !== stockRequestId.current) return;
        setStock(payload);
        setAi({ ...EMPTY_AI, available: payload.aiAvailable });
        if (payload.warning) {
          setMessage({ text: payload.warning, error: false });
        }
        window.history.replaceState(null, '', `?symbol=${symbol}`);
        document.title = `${symbol} · VN Stock Lab`;
      })
      .catch((error) => {
        if (error.name === 'AbortError' || requestId !== stockRequestId.current) return;
        setMessage({
          text: `${error.message} Hãy thử lại sau hoặc kiểm tra kết nối tới VNDirect.`,
          error: true,
        });
      })
      .finally(() => {
        if (requestId === stockRequestId.current) setLoading(false);
      });

    fetchJson(`/api/stocks/${symbol}/news${suffix}`, { signal: controller.signal })
      .then((payload) => {
        if (requestId !== stockRequestId.current) return;
        setNews({ loading: false, error: '', items: payload.items });
      })
      .catch((error) => {
        if (error.name === 'AbortError' || requestId !== stockRequestId.current) return;
        setNews({ loading: false, error: error.message, items: [] });
      });

    return () => controller.abort();
  }, [selection, symbol]);

  useEffect(() => {
    const controller = new AbortController();
    fetchJson('/api/watchlist', { signal: controller.signal })
      .then((payload) => setWatchlist(payload.items))
      .catch((error) => {
        if (error.name !== 'AbortError') {
          setMessage({ text: error.message, error: true });
        }
      });
    return () => controller.abort();
  }, []);

  const selectSymbol = (value, force = false) => {
    const normalized = normalizeSymbol(value);
    if (!normalized) {
      setMessage({
        text: 'Mã cổ phiếu chỉ gồm 2–10 chữ cái hoặc chữ số.',
        error: true,
      });
      return;
    }
    setQuery(normalized);
    setSelection((current) => ({
      symbol: normalized,
      force,
      version: current.version + 1,
    }));
  };

  const addToWatchlist = async () => {
    try {
      const payload = await fetchJson('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol }),
      });
      setWatchlist(payload.items);
    } catch (error) {
      setMessage({ text: error.message, error: true });
    }
  };

  const removeFromWatchlist = async (item) => {
    try {
      const payload = await fetchJson(`/api/watchlist/${item}`, {
        method: 'DELETE',
      });
      setWatchlist(payload.items);
    } catch (error) {
      setMessage({ text: error.message, error: true });
    }
  };

  const analyzeWithAi = async () => {
    const requestSymbol = symbol;
    const requestId = ++aiRequestId.current;
    setAi((current) => ({
      ...current,
      pending: true,
      data: null,
      error: '',
    }));
    try {
      const payload = await fetchJson(`/api/stocks/${requestSymbol}/ai-analysis`, {
        method: 'POST',
      });
      if (requestId === aiRequestId.current && activeSymbol.current === requestSymbol) {
        setAi({
          available: true,
          pending: false,
          data: payload,
          error: '',
        });
      }
    } catch (error) {
      if (requestId === aiRequestId.current && activeSymbol.current === requestSymbol) {
        setAi((current) => ({
          ...current,
          pending: false,
          data: null,
          error: error.message,
        }));
      }
    }
  };

  return (
    <>
      <TopBar
        query={query}
        setQuery={setQuery}
        loading={loading}
        onSubmit={(event) => {
          event.preventDefault();
          selectSymbol(query);
        }}
        onRefresh={() => selectSymbol(symbol, true)}
      />
      <main>
        <WatchlistPanel
          watchlist={watchlist}
          symbol={symbol}
          onSelect={selectSymbol}
          onAdd={addToWatchlist}
          onRemove={removeFromWatchlist}
        />
        {stock ? <Hero stock={stock} /> : null}
        <Message message={message} />
        {stock ? (
          <section className="workspace">
            <ChartPanel rows={stock.prices} />
            <AnalysisPanel
              stock={stock}
              ai={ai}
              onAnalyze={analyzeWithAi}
            />
          </section>
        ) : !loading ? (
          <section className="empty-state">
            Không có dữ liệu để hiển thị cho mã {symbol}.
          </section>
        ) : null}
        <NewsPanel symbol={symbol} news={news} />
      </main>
      {loading ? (
        <div className="loading">
          <span />
          <p>Đang lấy dữ liệu thị trường…</p>
        </div>
      ) : null}
    </>
  );
}
