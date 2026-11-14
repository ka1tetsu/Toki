// デスクトップ版の検索ソース: 共有実装（docs/sources.js）に Chromium のネットワーク層と自前インデックスを渡す
const { net } = require('electron');
const index = require('./index');
const createTokiSearch = require('../docs/sources.js');
const { createEngineSources } = require('./engines');

const fetch = (url, opts) => net.fetch(url, opts);

module.exports = createTokiSearch({
  fetch,
  // 一般のウェブ検索（Bing・DuckDuckGo・Yahoo）。TOKI_ENGINES=off で止める
  extraSources: process.env.TOKI_ENGINES === 'off' ? [] : createEngineSources(fetch),
  local: (q, n) => index.search(q, n),
  wolframAppId: process.env.TOKI_WOLFRAM_APPID,
});
