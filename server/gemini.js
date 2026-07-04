'use strict';

const https = require('https');

const DEFAULT_MODEL = 'gemini-3.5-flash';
const PROMPT_VERSION = '2026-07-05-v1';
const MAX_RESPONSE_BYTES = 1024 * 1024;

const responseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: {
      type: 'string',
      description: 'Tóm tắt 2-3 câu về trạng thái kỹ thuật hiện tại.',
    },
    tone: {
      type: 'string',
      enum: ['positive', 'neutral', 'negative'],
      description: 'Sắc thái tổng thể của phân tích.',
    },
    outlook: {
      type: 'string',
      description: 'Triển vọng ngắn hạn 1-4 tuần, diễn đạt thận trọng.',
    },
    positiveFactors: {
      type: 'array',
      minItems: 1,
      maxItems: 4,
      items: { type: 'string' },
      description: 'Các yếu tố kỹ thuật đang ủng hộ giá.',
    },
    riskFactors: {
      type: 'array',
      minItems: 1,
      maxItems: 4,
      items: { type: 'string' },
      description: 'Các rủi ro hoặc tín hiệu kỹ thuật cần theo dõi.',
    },
    bullishScenario: {
      type: 'string',
      description: 'Kịch bản tích cực có điều kiện, dùng vùng giá trong dữ liệu.',
    },
    bearishScenario: {
      type: 'string',
      description: 'Kịch bản tiêu cực có điều kiện, dùng vùng giá trong dữ liệu.',
    },
  },
  required: [
    'summary',
    'tone',
    'outlook',
    'positiveFactors',
    'riskFactors',
    'bullishScenario',
    'bearishScenario',
  ],
};

function configured() {
  return Boolean(process.env.GEMINI_API_KEY);
}

function modelName() {
  const configuredModel = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  return /^[a-zA-Z0-9._-]+$/.test(configuredModel) ? configuredModel : DEFAULT_MODEL;
}

function compactIndicator(indicators = {}) {
  return {
    ma20: indicators.ma20,
    ma50: indicators.ma50,
    ma200: indicators.ma200,
    rsi14: indicators.rsi14,
    macd: indicators.macd,
    macdSignal: indicators.macdSignal,
    macdHistogram: indicators.macdHistogram,
    volumeMa20: indicators.volumeMa20,
    adLine: indicators.adLine,
    mcdxBanker: indicators.mcdxBanker,
    mcdxHotMoney: indicators.mcdxHotMoney,
    mcdxRetailer: indicators.mcdxRetailer,
  };
}

function buildStockContext(symbol, rows, technicalAnalysis) {
  const recent = rows.slice(-60);
  const latest = recent[recent.length - 1];
  const previous = recent[recent.length - 2] || latest;
  return {
    symbol,
    source: 'VNDirect end-of-day data',
    latestSession: {
      date: latest.date,
      open: latest.open,
      high: latest.high,
      low: latest.low,
      close: latest.close,
      volume: latest.volume,
      previousClose: previous.close,
      indicators: compactIndicator(latest.indicators),
    },
    deterministicAnalysis: technicalAnalysis,
    recentHistory: recent.map((row) => ({
      date: row.date,
      close: row.close,
      volume: row.volume,
    })),
  };
}

function requestGemini(body, timeoutMs = 25000) {
  const payload = JSON.stringify(body);
  const options = {
    hostname: 'generativelanguage.googleapis.com',
    path: `/v1beta/models/${encodeURIComponent(modelName())}:generateContent`,
    method: 'POST',
    timeout: timeoutMs,
    rejectUnauthorized: true,
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      'x-goog-api-key': process.env.GEMINI_API_KEY,
    },
  };

  return new Promise((resolve, reject) => {
    const request = https.request(options, (response) => {
      const chunks = [];
      let size = 0;

      response.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_RESPONSE_BYTES) {
          request.destroy(new Error('Phản hồi Gemini vượt quá giới hạn cho phép.'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let parsed;
        try {
          parsed = raw ? JSON.parse(raw) : {};
        } catch (_error) {
          reject(new Error('Gemini trả về phản hồi không hợp lệ.'));
          return;
        }

        if (response.statusCode < 200 || response.statusCode >= 300) {
          const providerMessage = parsed && parsed.error && parsed.error.message;
          const invalidKey = response.statusCode === 400
            && typeof providerMessage === 'string'
            && /api key|credential/i.test(providerMessage);
          const error = new Error(
            response.statusCode === 429
              ? 'Gemini đã chạm giới hạn Free Tier. Vui lòng thử lại sau.'
              : invalidKey || response.statusCode === 401 || response.statusCode === 403
                ? 'Gemini từ chối API key. Hãy kiểm tra key và quyền truy cập model.'
                : `Gemini API tạm thời không khả dụng (HTTP ${response.statusCode}).`,
          );
          error.statusCode = response.statusCode === 429 ? 429 : 502;
          reject(error);
          return;
        }
        resolve(parsed);
      });
    });

    request.on('timeout', () => request.destroy(new Error('Gemini phản hồi quá thời gian.')));
    request.on('error', reject);
    request.end(payload);
  });
}

function cleanText(value, maxLength = 1200) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

function cleanList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => cleanText(item, 400)).filter(Boolean).slice(0, 4);
}

function normalizeAiAnalysis(value) {
  const tone = ['positive', 'neutral', 'negative'].includes(value && value.tone)
    ? value.tone
    : 'neutral';
  const normalized = {
    summary: cleanText(value && value.summary),
    tone,
    outlook: cleanText(value && value.outlook),
    positiveFactors: cleanList(value && value.positiveFactors),
    riskFactors: cleanList(value && value.riskFactors),
    bullishScenario: cleanText(value && value.bullishScenario, 700),
    bearishScenario: cleanText(value && value.bearishScenario, 700),
    disclaimer: 'Nội dung do AI tổng hợp từ dữ liệu kỹ thuật, không phải khuyến nghị đầu tư.',
  };

  if (!normalized.summary
    || !normalized.outlook
    || !normalized.positiveFactors.length
    || !normalized.riskFactors.length
    || !normalized.bullishScenario
    || !normalized.bearishScenario) {
    throw new Error('Gemini trả về nội dung phân tích chưa đầy đủ.');
  }
  return normalized;
}

async function analyzeStock(symbol, rows, technicalAnalysis) {
  if (!configured()) {
    const error = new Error('GEMINI_API_KEY chưa được cấu hình.');
    error.statusCode = 503;
    throw error;
  }
  if (!rows.length) throw new Error('Không có dữ liệu giá để phân tích.');

  const context = buildStockContext(symbol, rows, technicalAnalysis);
  const response = await requestGemini({
    systemInstruction: {
      parts: [{
        text: [
          'Bạn là trợ lý diễn giải phân tích kỹ thuật cổ phiếu Việt Nam.',
          'Chỉ sử dụng dữ liệu JSON do ứng dụng cung cấp; không bịa tin tức, cơ bản doanh nghiệp hoặc dữ liệu thời gian thực.',
          'Nêu rõ điều kiện cho từng kịch bản, tránh khẳng định chắc chắn và không đưa lệnh mua/bán.',
          'Viết tiếng Việt ngắn gọn, dễ hiểu. Đơn vị giá giữ nguyên như dữ liệu VNDirect.',
        ].join(' '),
      }],
    },
    contents: [{
      role: 'user',
      parts: [{
        text: `Hãy tổng hợp góc nhìn kỹ thuật cho dữ liệu sau:\n${JSON.stringify(context)}`,
      }],
    }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 4096,
      thinkingConfig: { thinkingLevel: 'low' },
      responseMimeType: 'application/json',
      responseJsonSchema: responseSchema,
    },
  });

  const candidate = (response.candidates || [])[0] || {};
  const parts = (candidate.content || {}).parts;
  const output = Array.isArray(parts)
    ? parts.filter((part) => part && part.text && !part.thought).map((part) => part.text).join('')
    : '';
  if (!output) throw new Error('Gemini không trả về nội dung phân tích.');

  let parsed;
  try {
    const cleanOutput = output.trim()
      .replace(/^```json\s*/i, '')
      .replace(/\s*```$/, '');
    parsed = JSON.parse(cleanOutput);
  } catch (_error) {
    throw new Error(
      candidate.finishReason === 'MAX_TOKENS'
        ? 'Gemini chưa hoàn tất phản hồi. Vui lòng thử lại.'
        : 'Gemini trả về JSON không hợp lệ.',
    );
  }
  return normalizeAiAnalysis(parsed);
}

module.exports = {
  DEFAULT_MODEL,
  PROMPT_VERSION,
  configured,
  modelName,
  buildStockContext,
  normalizeAiAnalysis,
  analyzeStock,
};
