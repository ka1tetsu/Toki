// 自前の検索インデックス（SQLite FTS5）とクローラー「TokiBot」
const { app, net } = require('electron');
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const UA = 'TokiBot/0.1 (personal search index)';
let db;

function open() {
  db = new DatabaseSync(path.join(app.getPath('userData'), 'index.db'));
  // trigram トークナイザ: 分かち書きのない日本語でも部分一致検索できる
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS pages USING fts5(url UNINDEXED, title, body, tokenize='trigram');
    CREATE TABLE IF NOT EXISTS seen(url TEXT PRIMARY KEY, id INTEGER);
  `);
}

function add(url, title, body) {
  url = url.split('#')[0];
  body = String(body || '').replace(/\s+/g, ' ').trim().slice(0, 200000);
  title = String(title || '').replace(/\s+/g, ' ').trim() || url;
  const old = db.prepare('SELECT id FROM seen WHERE url = ?').get(url);
  if (old) db.prepare('DELETE FROM pages WHERE rowid = ?').run(old.id);
  const { lastInsertRowid } = db.prepare('INSERT INTO pages(url, title, body) VALUES (?, ?, ?)').run(url, title, body);
  db.prepare('INSERT OR REPLACE INTO seen(url, id) VALUES (?, ?)').run(url, Number(lastInsertRowid));
}

const count = () => db.prepare('SELECT count(*) AS n FROM seen').get().n;

function search(q, limit = 20) {
  const terms = q.split(/\s+/).filter(Boolean).slice(0, 8);
  if (!terms.length) return [];
  if (terms.every((t) => [...t].length >= 3)) {
    const match = terms.map((t) => '"' + t.replace(/"/g, '""') + '"').join(' AND ');
    // bm25() に列ごとの重みを渡す（url, title, body）。題名の一致を本文の 10 倍に数える
    const run = (m) => db.prepare(`
      SELECT url, title, snippet(pages, 2, '', '', '…', 64) AS snippet
      FROM pages WHERE pages MATCH ? ORDER BY bm25(pages, 0, 10, 1) LIMIT ?
    `).all(m, limit);
    const rows = run(match);
    // 全語一致が少ないときは、どれかの語に一致するページで補う（全語一致が先）
    if (rows.length >= 3 || terms.length < 2) return rows;
    const seen = new Set(rows.map((r) => r.url));
    return rows.concat(run(match.replace(/ AND /g, ' OR ')).filter((r) => !seen.has(r.url))).slice(0, limit);
  }
  // 3文字未満の語（「猫」など）は trigram で引けないので LIKE で検索
  const like = terms.map((t) => '%' + t.replace(/[\\%_]/g, '\\$&') + '%');
  const where = like.map(() => `(title LIKE ? ESCAPE '\\' OR body LIKE ? ESCAPE '\\')`).join(' AND ');
  return db.prepare(`
    SELECT url, title, substr(body, max(1, instr(lower(body), lower(?)) - 30), 160) AS snippet
    FROM pages WHERE ${where}
    ORDER BY (title LIKE ? ESCAPE '\\') DESC,
      -- 本文の長さあたりの出現回数（長いページが有利になりすぎないようにする）
      (length(body) - length(replace(lower(body), lower(?), ''))) * 1.0 / (length(body) + 500) DESC
    LIMIT ?
  `).all(terms[0], ...like.flatMap((l) => [l, l]), like[0], terms[0], limit);
}

// --- クローラー -----------------------------------------------------------
const crawl = { running: false, stop: false, done: 0, failed: 0, queued: 0, current: '', seed: '' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s) => s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => {
  if (e[0] !== '#') return ENT[e.toLowerCase()] ?? m;
  const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
  try { return String.fromCodePoint(n); } catch { return m; }
});

function parseHTML(html, base) {
  const title = decode((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
  const links = [];
  for (const m of html.matchAll(/<a\s[^>]*?href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
    try {
      const u = new URL(decode(m[1] ?? m[2] ?? m[3]), base);
      if (/^https?:$/.test(u.protocol)) { u.hash = ''; links.push(u.href); }
    } catch {}
  }
  const text = decode(html
    .replace(/<(script|style|noscript|svg|template|title)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' '));
  return { title, text, links };
}

async function get(url) {
  const res = await net.fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res;
}

const robots = new Map();
async function allowed(url) {
  const u = new URL(url);
  if (!robots.has(u.origin)) {
    const rules = [];
    try {
      const txt = await (await get(u.origin + '/robots.txt')).text();
      let applies = false, inAgents = false;
      for (const line of txt.split('\n')) {
        const [k, ...rest] = line.split('#')[0].split(':');
        const key = k.trim().toLowerCase(), val = rest.join(':').trim();
        if (key === 'user-agent') {
          if (!inAgents) applies = false;
          inAgents = true;
          if (val === '*' || /tokibot/i.test(val)) applies = true;
        } else {
          inAgents = false;
          if (key === 'disallow' && applies && val) rules.push(val);
        }
      }
    } catch {}
    robots.set(u.origin, rules);
  }
  const p = u.pathname + u.search;
  return !robots.get(u.origin).some((r) => p.startsWith(r.replace(/\*.*$/, '')));
}

// seed から幅優先でリンクをたどり、本文をインデックスに入れる
async function startCrawl(seed, { maxPages = 200, maxDepth = 2, external = false } = {}) {
  if (crawl.running) return;
  const host = new URL(seed).host;
  const queue = [[seed, 0]];
  const visited = new Set([seed]);
  Object.assign(crawl, { running: true, stop: false, done: 0, failed: 0, queued: 1, current: '', seed });
  try {
    while (queue.length && crawl.done < maxPages && !crawl.stop) {
      const [url, depth] = queue.shift();
      crawl.current = url;
      crawl.queued = queue.length;
      try {
        if (!(await allowed(url))) continue;
        const res = await get(url);
        const type = res.headers.get('content-type') || '';
        if (!/text\/html|application\/xhtml/i.test(type)) continue;
        const buf = Buffer.from(await res.arrayBuffer()).subarray(0, 2 << 20);
        const charset = (type.match(/charset=["']?([\w-]+)/i) ||
          buf.subarray(0, 2048).toString('latin1').match(/charset=["']?([\w-]+)/i) || [])[1] || 'utf-8';
        let html;
        try { html = new TextDecoder(charset).decode(buf); } catch { html = buf.toString('utf8'); }
        const page = parseHTML(html, res.url || url);
        add(res.url || url, page.title, page.text);
        crawl.done++;
        if (depth < maxDepth) {
          for (const link of page.links) {
            if (visited.has(link) || visited.size > maxPages * 20) continue;
            if (!external && new URL(link).host !== host) continue;
            visited.add(link);
            queue.push([link, depth + 1]);
          }
        }
      } catch { crawl.failed++; }
      await sleep(300); // 相手サーバーに負荷をかけない
    }
  } finally {
    Object.assign(crawl, { running: false, current: '', queued: 0 });
  }
}

module.exports = { open, add, count, search, crawl, startCrawl };
