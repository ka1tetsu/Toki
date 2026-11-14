// Toki 検索の画面。Web 版ではブラウザから各ソースへ直接問い合わせ、
// デスクトップ版（toki://）では自前インデックスも使えるようメインプロセスの API に問い合わせる。
// 画面設計の根拠は research/search-ui/（extracts.json）にある。
const DESKTOP = location.protocol === 'toki:';
const client = createTokiSearch({ fetch: (u, o) => fetch(u, o), web: true });
const api = (path, q) => fetch(`${path}?q=${encodeURIComponent(q)}`).then((r) => r.json());
const engine = DESKTOP
  ? { searchAll: (q) => api('api/search', q), searchImages: (q) => api('api/images', q), suggest: client.suggest }
  : client;

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...children) => {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...children.filter((c) => c !== null && c !== undefined && c !== false));
  return n;
};
const safeHref = (u) => (/^https?:\/\//i.test(u) ? u : '#');
const PER_PAGE = 10;

const params = new URLSearchParams(location.search);
const Q = (params.get('q') || '').trim();
const TAB = params.get('t') === 'images' ? 'images' : 'all';
const PAGE = Math.max(1, parseInt(params.get('p'), 10) || 1);
const urlFor = (q, tab = 'all', page = 1) =>
  './?q=' + encodeURIComponent(q) + (tab === 'images' ? '&t=images' : '') + (page > 1 ? '&p=' + page : '');

const EXTERNAL = [
  ['DuckDuckGo', 'https://duckduckgo.com/?kp=-2&q='], ['Bing', 'https://www.bing.com/search?adlt=off&q='],
  ['Yandex', 'https://yandex.com/search/?text='], ['Google', 'https://www.google.com/search?safe=off&q='],
];

// ---- 結果1件: サイト名と URL → 題名 → 抜粋（Hearst 2009 5章の document surrogate）
const COLORS = ['#1a73e8', '#d93025', '#188038', '#e37400', '#9334e6', '#12858d', '#c5221f', '#5f6368'];
function siteParts(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    const segs = decodeURIComponent(u.pathname).split('/').filter(Boolean);
    let hash = 0;
    for (const c of host) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
    // 頭文字はサイト名の部分から取る（en.wikipedia.org → W、example.co.jp → E）
    const parts = host.split('.');
    let i = Math.max(0, parts.length - 2);
    if (i > 0 && /^(co|com|ne|or|ac|go|org|net)$/.test(parts[i]) && parts[parts.length - 1].length === 2) i--;
    return { host, initial: parts[i][0] || '?', crumb: [u.origin, ...segs].join(' › '), color: COLORS[hash % COLORS.length] };
  } catch { return { host: url, initial: '?', crumb: url, color: COLORS[0] }; }
}

// 検索語の強調は少なめにする（強調が多すぎると助けにならない: Zhang ら 2018）
function hilite(text, terms, max = 4) {
  const frag = document.createDocumentFragment();
  const alt = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  if (!alt) { frag.append(text); return frag; }
  let last = 0, n = 0;
  for (const m of text.matchAll(new RegExp(alt, 'gi'))) {
    if (n++ >= max) break;
    frag.append(text.slice(last, m.index), el('b', {}, m[0]));
    last = m.index + m[0].length;
  }
  frag.append(text.slice(last));
  return frag;
}

function resultItem(r, terms) {
  const s = siteParts(r.url);
  const av = el('span', { className: 'av' }, s.initial);
  av.style.background = s.color;
  return el('div', { className: 'r' },
    el('a', { className: 'site', href: safeHref(r.url), rel: 'noreferrer', tabIndex: -1 }, av,
      el('span', {}, el('span', { className: 'sn' }, s.host), el('span', { className: 'bc' }, s.crumb))),
    el('a', { className: 't', href: safeHref(r.url), rel: 'noreferrer' }, r.title),
    r.snippet ? el('div', { className: 's' }, hilite(r.snippet, terms)) : null,
    el('div', { className: 'via' }, r.source));
}

const imgEl = (i, cls) => {
  const img = el('img', { src: safeHref(i.thumb), alt: i.title || '', loading: 'lazy', referrerPolicy: 'no-referrer' });
  img.addEventListener('error', () => { const a = img.closest('a'); if (a) a.remove(); });
  return img;
};

function imageBlock(images, q) {
  return el('section', { className: 'imgblock' },
    el('h2', {}, '画像'),
    el('div', { className: 'strip' }, ...images.slice(0, 8).map((i) =>
      el('a', { href: safeHref(i.url), rel: 'noreferrer', title: i.title || '' }, imgEl(i)))),
    el('a', { className: 'more', href: urlFor(q, 'images') }, '画像をすべて表示'));
}

function footer(status, q) {
  const foot = $('foot');
  foot.replaceChildren('ソース: ');
  status.forEach((s, i) => {
    if (i) foot.append(' · ');
    foot.append(s.ok ? `${s.name} ${s.n}` : el('span', { className: 'bad' }, `${s.name} ×`));
  });
  foot.append(el('br'), '外部エンジンで検索: ');
  EXTERNAL.forEach(([name, url], i) => {
    if (i) foot.append(' · ');
    foot.append(el('a', { href: url + encodeURIComponent(q), rel: 'noreferrer' }, name));
  });
}

// ページ送りで同じ検索を繰り返さないよう、結果をこのタブの間だけ覚えておく
async function cached(key, run) {
  try { const hit = sessionStorage.getItem(key); if (hit) return JSON.parse(hit); } catch {}
  const data = await run();
  try { sessionStorage.setItem(key, JSON.stringify(data)); } catch {}
  return data;
}

async function showAll(q) {
  const d = await cached('all:' + q, () => engine.searchAll(q));
  const terms = client.termsOf(q);
  const pages = Math.max(1, Math.ceil(d.results.length / PER_PAGE));
  const page = Math.min(PAGE, pages);
  const slice = d.results.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const nodes = [el('div', { id: 'stats' }, `${d.results.length} 件（${(d.ms / 1000).toFixed(2)} 秒）` + (page > 1 ? ` · ${page} ページ目` : ''))];

  if (page === 1) {
    if (d.suggestion) nodes.push(el('div', { className: 'dym' }, el('span', {}, 'もしかして: '), el('a', { href: urlFor(d.suggestion) }, d.suggestion)));
    for (const i of d.instants) {
      nodes.push(el('div', { className: 'instant' },
        i.image ? el('img', { src: safeHref(i.image), alt: '', referrerPolicy: 'no-referrer' }) : null,
        el('div', {}, i.text, el('div', { className: 'meta' }, i.url ? el('a', { href: safeHref(i.url), rel: 'noreferrer' }, i.source) : i.source))));
    }
  }
  slice.forEach((r, i) => {
    // 画像は決まった位置にブロックで差し込む（Arguello 2017 の slot）
    if (page === 1 && i === d.imageSlot) nodes.push(imageBlock(d.images, q));
    nodes.push(resultItem(r, terms));
  });
  if (page === 1 && d.imageSlot >= slice.length) nodes.push(imageBlock(d.images, q));
  if (!d.results.length) nodes.push(el('p', {}, `「${q}」に一致する結果は見つかりませんでした。`));

  if (pages > 1) {
    const pager = el('nav', { id: 'pager', ariaLabel: 'ページ' });
    if (page > 1) pager.append(el('a', { href: urlFor(q, 'all', page - 1) }, '前へ'));
    for (let p = 1; p <= pages; p++) pager.append(p === page ? el('span', { ariaCurrent: 'page' }, String(p)) : el('a', { href: urlFor(q, 'all', p) }, String(p)));
    if (page < pages) pager.append(el('a', { href: urlFor(q, 'all', page + 1) }, '次へ'));
    nodes.push(pager);
  }
  $('out').replaceChildren(...nodes);
  footer(d.status, q);
}

async function showImages(q) {
  const d = await cached('img:' + q, () => engine.searchImages(q));
  const grid = el('div', { className: 'grid' }, ...d.images.map((i) => {
    const a = el('a', { className: 'cell', href: safeHref(i.url), rel: 'noreferrer', title: i.title || '' },
      imgEl(i), el('span', { className: 'cap' }, i.title || '', el('small', {}, i.source)));
    // 縦横比に合わせて幅を割り当て、行をすき間なく埋める
    const ratio = i.width && i.height ? Math.min(2.4, Math.max(0.6, i.width / i.height)) : 1.3;
    a.style.flexBasis = Math.round(150 * ratio) + 'px';
    a.style.flexGrow = String(ratio);
    return a;
  }));
  $('out').replaceChildren(d.images.length ? grid : el('p', {}, `「${q}」に一致する画像は見つかりませんでした。`));
  footer(d.status, q);
}

// ---- 入力中の候補（W3C APG の combobox パターン）
const input = $('q'), list = $('sug'), box = $('box');
let typed = '', activeIdx = -1, sugTimer = 0, sugSeq = 0;

function closeSug() {
  list.hidden = true; list.replaceChildren(); activeIdx = -1;
  box.classList.remove('open'); input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant');
}
function setActive(i) {
  const items = [...list.children];
  activeIdx = i;
  items.forEach((li, n) => li.setAttribute('aria-selected', String(n === i)));
  if (i >= 0) { input.setAttribute('aria-activedescendant', items[i].id); input.value = items[i].dataset.value; }
  else { input.removeAttribute('aria-activedescendant'); input.value = typed; }
}
async function loadSug() {
  const prefix = input.value.trim(), seq = ++sugSeq;
  if (!prefix) return closeSug();
  let items = [];
  try { items = await engine.suggest(prefix); } catch {}
  if (seq !== sugSeq || document.activeElement !== input) return;
  items = items.filter((s) => s.toLowerCase() !== prefix.toLowerCase()).slice(0, 8); // 候補は少なく保つ（Baymard 2022）
  if (!items.length) return closeSug();
  list.replaceChildren(...items.map((s, n) => {
    // 打った部分はそのまま、補われる部分を太字にする
    const same = s.toLowerCase().startsWith(prefix.toLowerCase());
    const li = el('li', { id: 'sug-' + n, role: 'option' }, same ? el('span', {}, s.slice(0, prefix.length), el('b', {}, s.slice(prefix.length))) : el('span', {}, s));
    li.dataset.value = s;
    li.addEventListener('mousedown', (e) => { e.preventDefault(); input.value = s; $('form').requestSubmit(); });
    return li;
  }));
  activeIdx = -1;
  list.hidden = false; box.classList.add('open'); input.setAttribute('aria-expanded', 'true');
}
input.addEventListener('input', () => {
  typed = input.value;
  $('clear').hidden = !input.value;
  clearTimeout(sugTimer);
  sugTimer = setTimeout(loadSug, 180);
});
input.addEventListener('keydown', (e) => {
  if (e.isComposing) return; // 日本語変換中の Enter や矢印は IME に任せる
  const n = list.children.length;
  if (e.key === 'ArrowDown' && n) { e.preventDefault(); setActive(activeIdx + 1 >= n ? -1 : activeIdx + 1); }
  else if (e.key === 'ArrowUp' && n) { e.preventDefault(); setActive(activeIdx < 0 ? n - 1 : activeIdx - 1); }
  else if (e.key === 'Escape' && !list.hidden) { e.preventDefault(); input.value = typed; closeSug(); }
});
input.addEventListener('blur', closeSug);
$('clear').addEventListener('click', () => { input.value = ''; typed = ''; $('clear').hidden = true; closeSug(); input.focus(); });
$('form').addEventListener('submit', (e) => { if (!input.value.trim()) e.preventDefault(); });
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && document.activeElement !== input) { e.preventDefault(); input.focus(); input.select(); }
});

// ---- 起動
const showNames = (names) => { $('names').textContent = '検索ソース: ' + names.join(' · '); };
if (DESKTOP) fetch('api/sources').then((r) => r.json()).then(showNames).catch(() => {});
else showNames(client.sourceNames());
if (DESKTOP) $('links').append(' ', el('a', { href: 'toki://crawl/' }, 'TokiBot（自前クローラー）の管理'));
else $('links').append(' ', el('a', { href: 'https://github.com/ka1tetsu/Toki' }, 'デスクトップ版ブラウザ'));

if (Q) {
  document.body.className = 'results' + (TAB === 'images' ? ' images' : '');
  document.title = `${Q} - Toki 検索`;
  input.value = typed = Q;
  input.removeAttribute('autofocus');
  $('clear').hidden = false;
  if (TAB === 'images') { $('t').disabled = false; $('t').value = 'images'; }
  $('tabs').hidden = false;
  $('tab-all').href = urlFor(Q);
  $('tab-images').href = urlFor(Q, 'images');
  $(TAB === 'images' ? 'tab-images' : 'tab-all').setAttribute('aria-current', 'page');
  // 待っている間も画面が動いていることを示す（Hearst 2009 1章: informative feedback）
  $('out').replaceChildren(el('div', { id: 'stats' }, '検索中…'), ...[70, 100, 85, 60, 95, 80].map((w) => {
    const s = el('div', { className: 'skel' }); s.style.width = w + '%'; return s;
  }));
  (TAB === 'images' ? showImages(Q) : showAll(Q))
    .catch((e) => $('out').replaceChildren(el('p', { className: 'err' }, '検索に失敗しました: ' + String(e.message || e))));
}
