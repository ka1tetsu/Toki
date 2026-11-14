// 検索ソース。各ソースは { instant?: {text, url, source}, results: [{url, title, snippet}] } を返す。
// ソースを増やすにはこの配列に { id, name, search(q) } を足すだけ。
const { net } = require('electron');
const index = require('./index');

const enc = encodeURIComponent;
const strip = (s) => String(s || '').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim();

async function fetchRes(url) {
  const res = await net.fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res;
}
const json = async (url) => (await fetchRes(url)).json();

const sources = [
  {
    id: 'toki', name: 'Toki インデックス',
    search: async (q) => ({ results: index.search(q, 10) }),
  },
  {
    id: 'wikipedia', name: 'Wikipedia',
    search: async (q) => {
      const lang = /[぀-ヿ一-鿿]/.test(q) ? 'ja' : 'en';
      const d = await json(`https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srlimit=5&format=json&srsearch=${enc(q)}`);
      return {
        results: d.query.search.map((r) => ({
          url: `https://${lang}.wikipedia.org/wiki/${enc(r.title.replace(/ /g, '_'))}`,
          title: r.title, snippet: strip(r.snippet),
        })),
      };
    },
  },
  {
    id: 'duckduckgo', name: 'DuckDuckGo',
    search: async (q) => {
      const d = await json(`https://api.duckduckgo.com/?format=json&no_html=1&skip_disambig=1&kp=-2&q=${enc(q)}`);
      const text = d.Answer || d.AbstractText || d.Definition;
      const flat = (d.RelatedTopics || []).flatMap((t) => t.Topics || [t]);
      return {
        instant: text && typeof text === 'string'
          ? { text, url: d.AbstractURL || d.DefinitionURL || '', source: d.AbstractSource || 'DuckDuckGo' } : null,
        results: [
          ...(d.Results || []),
          ...flat,
        ].filter((t) => t.FirstURL && t.Text).slice(0, 5).map((t) => {
          const [title, ...rest] = t.Text.split(' - ');
          return { url: t.FirstURL, title, snippet: rest.join(' - ') };
        }),
      };
    },
  },
  {
    // Wolfram Alpha は AppID が必要（無料枠あり）: TOKI_WOLFRAM_APPID=xxxx
    id: 'wolfram', name: 'Wolfram Alpha', enabled: () => !!process.env.TOKI_WOLFRAM_APPID,
    search: async (q) => {
      const text = await (await fetchRes(`https://api.wolframalpha.com/v1/result?appid=${enc(process.env.TOKI_WOLFRAM_APPID)}&i=${enc(q)}`)).text();
      return { instant: { text, url: `https://www.wolframalpha.com/input?i=${enc(q)}`, source: 'Wolfram Alpha' }, results: [] };
    },
  },
  {
    id: 'stackoverflow', name: 'Stack Overflow',
    search: async (q) => {
      const d = await json(`https://api.stackexchange.com/2.3/search/advanced?site=stackoverflow&pagesize=4&order=desc&sort=relevance&q=${enc(q)}`);
      return { results: d.items.map((i) => ({ url: i.link, title: strip(i.title), snippet: `回答 ${i.answer_count} 件 · ${i.tags.join(', ')}` })) };
    },
  },
  {
    id: 'github', name: 'GitHub',
    search: async (q) => {
      const d = await json(`https://api.github.com/search/repositories?per_page=4&q=${enc(q)}`);
      return { results: d.items.map((i) => ({ url: i.html_url, title: i.full_name, snippet: `${i.description || ''} ★${i.stargazers_count}` })) };
    },
  },
  {
    id: 'hackernews', name: 'Hacker News',
    search: async (q) => {
      const d = await json(`https://hn.algolia.com/api/v1/search?tags=story&hitsPerPage=4&query=${enc(q)}`);
      return {
        results: d.hits.map((h) => ({
          url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
          title: h.title, snippet: `${h.points} points · ${h.num_comments} comments · ${String(h.created_at).slice(0, 10)}`,
        })),
      };
    },
  },
  {
    id: 'archive', name: 'Internet Archive',
    search: async (q) => {
      const d = await json(`https://archive.org/advancedsearch.php?fl[]=identifier&fl[]=title&fl[]=description&rows=4&output=json&q=${enc(q)}`);
      return {
        results: d.response.docs.map((r) => ({
          url: `https://archive.org/details/${r.identifier}`, title: String(r.title),
          snippet: strip([].concat(r.description || '').join(' ')).slice(0, 200),
        })),
      };
    },
  },
  {
    id: 'openlibrary', name: 'Open Library',
    search: async (q) => {
      const d = await json(`https://openlibrary.org/search.json?limit=4&fields=key,title,author_name,first_publish_year&q=${enc(q)}`);
      return {
        results: d.docs.map((r) => ({
          url: `https://openlibrary.org${r.key}`, title: r.title,
          snippet: [(r.author_name || []).join(', '), r.first_publish_year].filter(Boolean).join(' · '),
        })),
      };
    },
  },
  {
    id: 'arxiv', name: 'arXiv',
    search: async (q) => {
      const xml = await (await fetchRes(`https://export.arxiv.org/api/query?max_results=4&search_query=all:${enc(q)}`)).text();
      const tag = (s, t) => strip((s.match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`)) || [])[1]);
      return {
        results: xml.split('<entry>').slice(1).map((e) => ({
          url: tag(e, 'id').replace(/^http:/, 'https:'), title: tag(e, 'title'), snippet: tag(e, 'summary').slice(0, 200),
        })),
      };
    },
  },
];

// 全ソースへ同時に問い合わせ、順位ごとに交互に混ぜて URL の重複を除く
async function searchAll(q) {
  const active = sources.filter((s) => !s.enabled || s.enabled());
  const settled = await Promise.allSettled(active.map((s) => s.search(q)));
  const lists = [], instants = [], status = [];
  settled.forEach((r, i) => {
    const s = active[i];
    const results = r.status === 'fulfilled' ? (r.value.results || []).filter((x) => x.url && x.title) : [];
    status.push({ name: s.name, ok: r.status === 'fulfilled', n: results.length });
    if (r.status !== 'fulfilled') return;
    if (r.value.instant) instants.push(r.value.instant);
    lists.push(results.map((x) => ({ ...x, source: s.name })));
  });
  const merged = [], seen = new Map();
  const key = (u) => u.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
  for (let rank = 0; lists.some((l) => l.length > rank); rank++) {
    for (const l of lists) {
      const r = l[rank];
      if (!r) continue;
      const dup = seen.get(key(r.url));
      if (dup) { if (!dup.source.includes(r.source)) dup.source += ' + ' + r.source; continue; }
      seen.set(key(r.url), r);
      merged.push(r);
    }
  }
  return { instants, results: merged, status };
}

module.exports = { searchAll, sources };
