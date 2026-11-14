// 一般のウェブ検索エンジンの結果ページを取り込む（デスクトップ版のみ）。
// どのエンジンも公開 API を持たない（または終了・有料化した）ため、利用者の端末から
// 通常の結果ページを取得して、題名・URL・抜粋を読み取る。Web 版からは CORS のため使えない。
// ロボット確認が出たエンジンは、その検索では結果なしとして扱う（回避はしない）。

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', middot: '·', bull: '•',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»', copy: '©', reg: '®', trade: '™', boxv: '│', times: '×', yen: '¥' };
const decode = (s) => String(s).replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => {
  if (e[0] !== '#') return ENT[e.toLowerCase()] ?? m;
  const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
  try { return String.fromCodePoint(n); } catch { return m; }
});
const text = (html) => decode(String(html || '').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
const first = (s, re) => (s.match(re) || [])[1] || '';
const isCJK = (q) => /[぀-ヿ一-鿿]/.test(q);
const enc = encodeURIComponent;
// 行き先が http(s) で、検索エンジン自身のページ（関連検索など）でないもの
const web = (u) => /^https?:\/\//i.test(u) && !/^https?:\/\/([\w-]+\.)*(bing\.com|duckduckgo\.com|search\.yahoo\.com|search\.brave\.com)\//i.test(u);

// 結果ごとの塊に切り分けて読む。ページの作りが変わったら 0 件になるだけで、他のソースには影響しない
const blocks = (html, marker) => html.split(marker).slice(1);

const engines = [
  {
    id: 'bing', name: 'Bing',
    // 2 ページ分（20 件）を取る
    urls: (q) => ['', '&first=11'].map((pg) => `https://www.bing.com/search?q=${enc(q)}&adlt=off${isCJK(q) ? '&setlang=ja&cc=JP' : ''}${pg}`),
    parse: (html) => blocks(html, '<li class="b_algo"').map((b) => {
      let url = decode(first(b, /<h2[^>]*>\s*<a[^>]*href="([^"]+)"/));
      // Bing の転送リンク（/ck/a?...&u=a1<base64url>）から行き先を取り出す
      const u = first(url, /[?&]u=a1([^&]+)/);
      if (u) { try { url = Buffer.from(u, 'base64url').toString('utf8'); } catch {} }
      return {
        url, title: text(first(b, /<h2[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/)),
        snippet: text(first(b, /<p[^>]*>([\s\S]*?)<\/p>/)),
      };
    }),
  },
  {
    id: 'duckduckgo-web', name: 'DuckDuckGo',
    urls: (q) => [`https://html.duckduckgo.com/html/?q=${enc(q)}&kp=-2${isCJK(q) ? '&kl=jp-jp' : ''}`],
    parse: (html) => blocks(html, 'class="result__a"').map((b) => {
      const href = decode(first(b, /href="([^"]+)"/));
      let url = first(href, /[?&]uddg=([^&]+)/);
      try { url = decodeURIComponent(url); } catch {}
      return {
        // 広告は uddg を持たない（y.js 経由）ので、ここで落ちる
        url: /duckduckgo\.com\/y\.js/.test(url) ? '' : url,
        title: text(first(b, />([\s\S]*?)<\/a>/)),
        snippet: text(first(b, /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/)),
      };
    }),
  },
  {
    id: 'yahoo', name: 'Yahoo',
    urls: (q) => ['', '&b=8'].map((pg) => `https://search.yahoo.com/search?p=${enc(q)}&vm=p${pg}`),
    parse: (html) => blocks(html, 'class="compTitle').map((b) => {
      const href = decode(first(b, /href="([^"]+)"/));
      let url = first(href, /\/RU=([^/]+)\//) || href;
      try { url = decodeURIComponent(url); } catch {}
      return {
        url, title: text(first(b, /<h3[^>]*>([\s\S]*?)<\/h3>/)),
        snippet: text(first(b, /class="compText[^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/)),
      };
    }),
  },
  {
    // Brave は Bing とは別の、独自のウェブ索引を持つ
    id: 'brave', name: 'Brave',
    urls: (q) => [`https://search.brave.com/search?q=${enc(q)}&safesearch=off`],
    parse: (html) => blocks(html, 'data-type="web"').map((b) => ({
      url: decode(first(b, /<a href="(https?:\/\/[^"]+)"/)),
      title: decode(first(b, /class="title [^"]*"[^>]*title="([^"]*)"/)) || text(first(b, /class="title [^>]*>([\s\S]*?)<\/div>/)),
      snippet: text(first(b, /class="content [^>]*>([\s\S]*?)<\/div>/)),
    })),
  },
];

// fetch を受け取って、sources.js の形（{ id, name, search(q) }）のソースにする
function createEngineSources(fetch) {
  return engines.map((e) => ({
    id: e.id, name: e.name, kind: 'web',
    search: async (q) => {
      // 各ページを同時に取り、ページ順につなぐ。1 ページ目が取れなければ失敗、2 ページ目以降の失敗は無視
      const pages = await Promise.allSettled(e.urls(q).map(async (url) => {
        const res = await fetch(url, { signal: AbortSignal.timeout(3500) });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return e.parse(await res.text());
      }));
      if (pages[0].status !== 'fulfilled') throw pages[0].reason;
      const seen = new Set();
      const results = pages.flatMap((p) => (p.status === 'fulfilled' ? p.value : []))
        .filter((r) => web(r.url) && r.title && !seen.has(r.url) && seen.add(r.url)).slice(0, 30)
        // 抜粋の頭に付く日付（"Nov 22, 2025 · " や "2 weeks ago - "）は落とす
        .map((r) => ({ ...r, snippet: r.snippet.replace(/^([A-Z][a-z]{2} \d{1,2}, \d{4}\s*[·・-]|\d+ \w+ ago\s*[·・-])\s*/, '') }));
      // 0 件は、ロボット確認かページ構造の変更。失敗として表示する
      if (!results.length) throw new Error('no results');
      return { results };
    },
  }));
}

// 入力中の候補（デスクトップ版）: DuckDuckGo と Yahoo の候補。どちらも [入力, [候補...]] の形で返る
const SUGGEST = [
  (q) => `https://duckduckgo.com/ac/?q=${enc(q)}&type=list`,
  (q) => `https://ff.search.yahoo.com/gossip?output=fxjson&command=${enc(q)}`,
];
function createSuggesters(fetch) {
  return SUGGEST.map((url) => async (q) => {
    const res = await fetch(url(q), { signal: AbortSignal.timeout(1500) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const d = await res.json();
    return (Array.isArray(d) && Array.isArray(d[1]) ? d[1] : []).filter((x) => typeof x === 'string');
  });
}

module.exports = { engines, createEngineSources, createSuggesters };
