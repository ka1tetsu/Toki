// デスクトップ版の検索ソース: 共有実装（docs/sources.js）に Chromium のネットワーク層と自前インデックスを渡す
const { net } = require('electron');
const index = require('./index');
const createTokiSearch = require('../docs/sources.js');

module.exports = createTokiSearch({
  fetch: (url, opts) => net.fetch(url, opts),
  local: (q, n) => index.search(q, n),
  wolframAppId: process.env.TOKI_WOLFRAM_APPID,
});
