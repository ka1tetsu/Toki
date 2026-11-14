// toki:// の内蔵ページ（ホーム・検索結果・クローラー管理）
const index = require('./index');
const { searchAll, sources } = require('./sources');

// クロール操作用の使い捨てトークン。外部サイトは toki:// ページを読めないので偽造できない
const TOKEN = require('crypto').randomBytes(16).toString('hex');
const tokenField = `<input type="hidden" name="token" value="${TOKEN}">`;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const CSS = `
  body { font: 15px/1.6 system-ui, sans-serif; max-width: 760px; margin: 0 auto; padding: 24px 16px; color: #222; background: #fff; }
  h1 { font-size: 40px; text-align: center; margin: 12vh 0 16px; letter-spacing: 2px; }
  h1.small { font-size: 22px; text-align: left; margin: 0 0 12px; } h1 a { color: inherit; text-decoration: none; }
  form.q { display: flex; gap: 8px; } input[type=text], input[type=url] { flex: 1; padding: 9px 14px; font: inherit; border: 1px solid #bbb; border-radius: 20px; }
  button { padding: 8px 16px; font: inherit; border: 0; border-radius: 20px; background: #333; color: #fff; cursor: pointer; }
  .r { margin: 18px 0; } .r a { font-size: 17px; color: #1a0dab; text-decoration: none; } .r a:hover { text-decoration: underline; }
  .u { color: #060; font-size: 13px; word-break: break-all; } .src { color: #888; font-size: 12px; margin-left: 6px; }
  .instant { border: 1px solid #ddd; border-radius: 10px; padding: 12px 16px; margin: 18px 0; background: #f8f8f8; }
  .meta, footer { color: #777; font-size: 13px; margin-top: 14px; } .bad { color: #b00; }
  fieldset { border: 1px solid #ddd; border-radius: 10px; margin-top: 40px; padding: 12px 16px; } legend { color: #555; font-size: 13px; }
  @media (prefers-color-scheme: dark) { body { background: #1e1f22; color: #ddd; } .r a { color: #8ab4f8; } .u { color: #7c7; }
    .instant { background: #2b2d31; border-color: #444; } input { background: #2b2d31; color: #fff; border-color: #555; } button { background: #555; } fieldset { border-color: #444; } }
`;

const page = (title, body, head = '') => new Response(
  `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; form-action toki:">
${head}<title>${esc(title)}</title><style>${CSS}</style></head><body>${body}</body></html>`,
  { headers: { 'content-type': 'text/html; charset=utf-8' } });

const searchForm = (q = '') => `<form class="q" action="toki://search/"><input type="text" name="q" value="${esc(q)}" placeholder="Toki で検索" autofocus><button>検索</button></form>`;

function home() {
  const names = sources.filter((s) => !s.enabled || s.enabled()).map((s) => s.name).join(' · ');
  return page('Toki', `<h1>Toki</h1>${searchForm()}
<p class="meta">検索ソース: ${esc(names)}</p>
<fieldset><legend>TokiBot（自前クローラー） — インデックス済み ${index.count()} ページ</legend>
<form class="q" method="post" action="toki://crawl/">${tokenField}<input type="url" name="url" placeholder="https://example.com/ をクロールして索引に追加" required><button>クロール</button></form>
<p class="meta">サイト内を最大 200 ページ・深さ 2 までたどります。閲覧したページも自動で索引に入ります。 <a href="toki://crawl/">状況を見る</a></p>
</fieldset>`);
}

function hilite(text, terms) {
  let out = esc(text);
  for (const t of terms) {
    const re = new RegExp(esc(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    out = out.replace(re, (m) => `<b>${m}</b>`);
  }
  return out;
}

async function results(q) {
  q = q.trim();
  if (!q) return home();
  const { instants, results, status } = await searchAll(q);
  const terms = q.split(/\s+/).filter((t) => t.length > 1 || /[^\x00-\x7f]/.test(t));
  const ext = [
    ['DuckDuckGo', 'https://duckduckgo.com/?kp=-2&q='], ['Bing', 'https://www.bing.com/search?adlt=off&q='],
    ['Yandex', 'https://yandex.com/search/?text='], ['Google', 'https://www.google.com/search?safe=off&q='],
  ].map(([n, u]) => `<a href="${u}${encodeURIComponent(q)}">${n}</a>`).join(' · ');
  return page(`${q} - Toki 検索`, `<h1 class="small"><a href="toki://home/">Toki</a></h1>${searchForm(q)}
${instants.map((i) => `<div class="instant">${esc(i.text)}<div class="meta">${i.url ? `<a href="${esc(i.url)}">${esc(i.source)}</a>` : esc(i.source)}</div></div>`).join('')}
${results.map((r) => `<div class="r"><a href="${esc(r.url)}">${esc(r.title)}</a><span class="src">${esc(r.source)}</span>
<div class="u">${esc(r.url)}</div><div>${hilite(r.snippet || '', terms)}</div></div>`).join('') || '<p>結果が見つかりませんでした。</p>'}
<footer>ソース: ${status.map((s) => s.ok ? `${esc(s.name)} ${s.n}` : `<span class="bad">${esc(s.name)} ×</span>`).join(' · ')}
<br>外部エンジンで検索: ${ext}</footer>`);
}

function crawlStatus() {
  const c = index.crawl;
  return page('TokiBot', `<h1 class="small"><a href="toki://home/">Toki</a> / TokiBot</h1>
<p>${c.running ? `クロール中: <span class="u">${esc(c.current)}</span>` : (c.seed ? '完了（または停止）しました。' : 'クロールは実行されていません。')}</p>
<p>開始 URL: <span class="u">${esc(c.seed || '-')}</span><br>取得 ${c.done} ページ · 失敗 ${c.failed} · 待ち ${c.queued} · 索引全体 ${index.count()} ページ</p>
${c.running ? '<form method="post" action="toki://crawl/">${tokenField}<input type="hidden" name="stop" value="1"><button>停止</button></form>' : ''}`,
  c.running ? '<meta http-equiv="refresh" content="2">' : '');
}

async function handle(req) {
  const u = new URL(req.url);
  if (u.hostname === 'search') return results(u.searchParams.get('q') || '');
  if (u.hostname === 'crawl') {
    // クロールの開始・停止は Toki 自身のページからの POST だけ受け付ける（外部サイトからの悪用防止）
    const form = req.method === 'POST' ? new URLSearchParams(await req.text()) : null;
    if (form && form.get('token') === TOKEN) {
      if (form.get('stop')) index.crawl.stop = true;
      else {
        try {
          const seed = new URL(form.get('url'));
          if (/^https?:$/.test(seed.protocol)) index.startCrawl(seed.href);
        } catch {}
      }
    }
    return crawlStatus();
  }
  return home();
}

module.exports = { handle };
