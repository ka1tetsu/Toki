// 一般のウェブ検索エンジンの結果ページを取り込む（デスクトップ版のみ）。
// どのエンジンも公開 API を持たない（または終了・有料化した）ため、利用者の端末から
// 通常の結果ページを取得して、題名・URL・抜粋を読み取る。Web 版からは CORS のため使えない。
// ロボット確認が出たエンジンは、その検索では結果なしとして扱う（回避はしない）。

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', middot: '·', bull: '•',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»', copy: '©', reg: '®', trade: '™' };
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
const web = (u) => /^https?:\/\//i.test(u) && !/^https?:\/\/([\w-]+\.)*(bing\.com|duckduckgo\.com|search\.yahoo\.com)\//i.test(u);

// 結果ごとの塊に切り分けて読む。ページの作りが変わったら 0 件になるだけで、他のソースには影響しない
const blocks = (html, marker) => html.split(marker).slice(1);

const engines = [
  {
    id: 'bing', name: 'Bing',
    url: (q) => `https://www.bing.com/search?q=${enc(q)}&adlt=off${isCJK(q) ? '&setlang=ja&cc=JP' : ''}`,
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
    url: (q) => `https://html.duckduckgo.com/html/?q=${enc(q)}&kp=-2${isCJK(q) ? '&kl=jp-jp' : ''}`,
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
    url: (q) => `https://search.yahoo.com/search?p=${enc(q)}&vm=p`,
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
];

// fetch を受け取って、sources.js の形（{ id, name, search(q) }）のソースにする
function createEngineSources(fetch) {
  return engines.map((e) => ({
    id: e.id, name: e.name, kind: 'web',
    search: async (q) => {
      const res = await fetch(e.url(q), { signal: AbortSignal.timeout(3500) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const results = e.parse(await res.text()).filter((r) => web(r.url) && r.title).slice(0, 10)
        .map((r) => ({ ...r, snippet: r.snippet.replace(/^[A-Z][a-z]{2} \d{1,2}, \d{4}\s*[·・]\s*/, '') }));
      // 0 件は、ロボット確認かページ構造の変更。失敗として表示する
      if (!results.length) throw new Error('no results');
      return { results };
    },
  }));
}

module.exports = { engines, createEngineSources };
