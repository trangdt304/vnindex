'use strict';

const assert = require('assert');
const { buildNewsUrl, normalizeNews } = require('../server/news');

const result = normalizeNews([
  {
    ArticleID: 1,
    Title: ' Tin cũ ',
    Head: '<p>Nội dung &amp; diễn giải</p>',
    PublishTime: '2026-07-01T08:00:00',
    URL: '/2026/07/tin-cu.htm',
  },
  {
    ArticleID: 2,
    Title: 'Tin mới',
    Head: '',
    PublishTime: '2026-07-02T09:00:00',
    URL: 'https://vietstock.vn/2026/07/tin-moi.htm',
  },
  {
    ArticleID: 3,
    Title: 'Liên kết không tin cậy',
    PublishTime: '2026-07-03T09:00:00',
    URL: 'https://example.com/bad-link',
  },
  {
    ArticleID: 4,
    Title: '',
    PublishTime: 'not-a-date',
  },
  {
    ArticleID: 5,
    Title: 'FPTS: Tin của một doanh nghiệp khác',
    PublishTime: '2026-07-04T09:00:00',
    URL: '/2026/07/fpts.htm',
  },
  {
    ArticleID: 6,
    Title: 'FPT ETF thực hiện cơ cấu danh mục',
    PublishTime: '2026-07-05T09:00:00',
    URL: '/2026/07/fpt-etf.htm',
  },
], 5, 'FPT');

assert.strictEqual(result.length, 3);
assert.strictEqual(result[0].title, 'Liên kết không tin cậy');
assert.strictEqual(result[0].url, '');
assert.strictEqual(result[1].title, 'Tin mới');
assert.strictEqual(result[2].summary, 'Nội dung & diễn giải');
assert(result[2].url.startsWith('https://vietstock.vn/'));

const url = new URL(buildNewsUrl('GEX', 5));
assert(url.pathname.endsWith('/GEX'));
assert.strictEqual(url.searchParams.get('p'), '5');
assert.strictEqual(url.searchParams.get('s'), '1');

console.log('✓ Chuẩn hóa, sắp xếp và giới hạn liên kết tin doanh nghiệp');
