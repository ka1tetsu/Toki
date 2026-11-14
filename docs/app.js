// Toki 検索 Web 版: サーバーなしで、ブラウザから各検索ソースへ直接問い合わせる
const { searchAll, sources } = createTokiSearch({ fetch: (u, o) => fetch(u, o), web: true });

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...children) => {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...children);
  return n;
};

const EXTERNAL = [
  ['DuckDuckGo', 'https://duckduckgo.com/?kp=-2&q='], ['Bing', 'https://www.bing.com/search?adlt=off&q='],
  ['Yandex', 'https://yandex.com/search/?text='], ['Google', 'https://www.google.com/search?safe=off&q='],
];

// 検索語を太字にする（HTML を組み立てず、テキストノードだけで作る）
function hilite(text, terms) {
  const frag = document.createDocumentFragment();
  const alt = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  if (!alt) { frag.append(text); return frag; }
  let last = 0;
  for (const m of text.matchAll(new RegExp(alt, 'gi'))) {
    frag.append(text.slice(last, m.index), el('b', {}, m[0]));
    last = m.index + m[0].length;
  }
  frag.append(text.slice(last));
  return frag;
}

const safeHref = (u) => (/^https?:\/\//i.test(u) ? u : '#');

async function run(q) {
  document.body.classList.add('results');
  document.title = `${q} - Toki 検索`;
  $('q').value = q;
  $('out').replaceChildren(el('p', { className: 'meta' }, '検索中…'));
  const { instants, results, status } = await searchAll(q);
  const terms = q.split(/\s+/).filter((t) => t.length > 1 || /[^\x00-\x7f]/.test(t));

  $('out').replaceChildren(
    ...instants.map((i) => el('div', { className: 'instant' }, i.text,
      el('div', { className: 'meta' }, i.url ? el('a', { href: safeHref(i.url), rel: 'noreferrer' }, i.source) : i.source))),
    ...results.map((r) => el('div', { className: 'r' },
      el('a', { href: safeHref(r.url), rel: 'noreferrer' }, r.title),
      el('span', { className: 'src' }, r.source),
      el('div', { className: 'u' }, r.url),
      el('div', {}, hilite(r.snippet || '', terms)))),
  );
  if (!results.length && !instants.length) $('out').append(el('p', {}, '結果が見つかりませんでした。'));

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

$('names').textContent = '検索ソース: ' + sources.filter((s) => !s.enabled || s.enabled()).map((s) => s.name).join(' · ');

const q = (new URLSearchParams(location.search).get('q') || '').trim();
if (q) run(q).catch((e) => $('out').replaceChildren(el('p', { className: 'bad' }, String(e))));
