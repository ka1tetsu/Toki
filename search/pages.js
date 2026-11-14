// toki:// の内蔵ページ。
//   toki://home/        検索画面（docs/ の Web 版と同じファイル）と、その裏の検索 API
//   toki://crawl/       TokiBot（自前クローラー）の管理
const fs = require('fs');
const path = require('path');
const index = require('./index');
const engine = require('./sources');

const DOCS = path.join(__dirname, '..', 'docs');
const STATIC = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/sources.js': ['sources.js', 'text/javascript; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
};

// クロール操作用の使い捨てトークン。外部サイトは toki:// ページを読めないので偽造できない
const TOKEN = require('crypto').randomBytes(16).toString('hex');
const tokenField = `<input type="hidden" name="token" value="${TOKEN}">`;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const json = (data) => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json; charset=utf-8' } });

function crawlPage() {
  const c = index.crawl;
  const state = c.running ? `クロール中: <span class="u">${esc(c.current)}</span>` : (c.seed ? '完了（または停止）しました。' : 'クロールは実行されていません。');
  return new Response(`<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; form-action toki:">
${c.running ? '<meta http-equiv="refresh" content="2">' : ''}<title>TokiBot</title><style>
  body { font: 15px/1.6 system-ui, sans-serif; max-width: 692px; margin: 0 auto; padding: 28px 20px; color: #202124; background: #fff; }
  h1 { font-size: 24px; } h1 a { color: inherit; text-decoration: none; }
  form { display: flex; gap: 8px; margin: 16px 0; } input[type=url] { flex: 1; padding: 10px 16px; font: inherit; border: 1px solid #dadce0; border-radius: 24px; }
  button { padding: 8px 18px; font: inherit; border: 1px solid #dadce0; border-radius: 4px; background: #f8f9fa; cursor: pointer; }
  .u { color: #188038; word-break: break-all; } .meta { color: #70757a; font-size: 13px; }
  @media (prefers-color-scheme: dark) { body { background: #1f1f1f; color: #e8eaed; } input, button { background: #303134; color: #e8eaed; border-color: #3c4043; } .u { color: #81c995; } }
</style></head><body>
<h1><a href="toki://home/">Toki</a> / TokiBot</h1>
<p>${state}</p>
<p>開始 URL: <span class="u">${esc(c.seed || '-')}</span><br>取得 ${c.done} ページ · 失敗 ${c.failed} · 待ち ${c.queued} · 索引全体 ${index.count()} ページ</p>
${c.running
    ? `<form method="post" action="toki://crawl/">${tokenField}<input type="hidden" name="stop" value="1"><button>停止</button></form>`
    : `<form method="post" action="toki://crawl/">${tokenField}<input type="url" name="url" placeholder="https://example.com/ をクロールして索引に追加" required><button>クロール</button></form>`}
<p class="meta">サイト内を最大 200 ページ・深さ 2 までたどります（robots.txt を尊重）。閲覧したページも自動で索引に入ります。</p>
</body></html>`, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}

async function handle(req) {
  const u = new URL(req.url);
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
    return crawlPage();
  }
  const q = (u.searchParams.get('q') || '').trim();
  // 以前の toki://search/?q= も同じ画面へ
  if (u.hostname !== 'home') return Response.redirect('toki://home/' + (q ? '?q=' + encodeURIComponent(q) : ''), 302);
  if (u.pathname === '/api/search') return json(await engine.searchAll(q));
  if (u.pathname === '/api/images') return json(await engine.searchImages(q));
  if (u.pathname === '/api/sources') return json(engine.sourceNames());
  if (u.pathname === '/api/suggest') return json(q ? await engine.suggest(q) : []);
  const file = STATIC[u.pathname];
  if (!file) return new Response('Not found', { status: 404 });
  return new Response(fs.readFileSync(path.join(DOCS, file[0])), { headers: { 'content-type': file[1] } });
}

module.exports = { handle };
