// Toki 検索の本体: 検索ソース・画像ソース・順位の統合。デスクトップ版（Electron）と Web 版（GitHub Pages）で共有する。
// 設計の根拠は research/search-relevance/（extracts.json）にある。
// ソースを増やすには sources / imageSources 配列に { id, name, search(q) } を足すだけ。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.createTokiSearch = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // fetch: 使用する fetch 関数 / local: 自前インデックスの検索関数（無ければ省略）
  // wolframAppId: Wolfram Alpha の AppID / web: ブラウザ上で動かす場合 true
  // extraSources: 追加のソース（デスクトップ版が Bing・DuckDuckGo・Yahoo の結果ページを渡す）
  return function createTokiSearch({ fetch, local, wolframAppId, web, extraSources = [] } = {}) {
    const enc = encodeURIComponent;
    const strip = (s) => String(s || '').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim();

    // 待ち時間は利用に響く（Schurman & Brutlag 2009）ので、遅いソースは待たずに切り捨てる
    const TIMEOUT = 3500;
    // Wikimedia の API は、名乗らないクライアントを強く制限する（429）。ブラウザからは Api-User-Agent で名乗る
    const WIKIMEDIA = /^https:\/\/[a-z-]+\.(wikipedia|wikimedia)\.org\//;
    async function fetchRes(url) {
      const headers = WIKIMEDIA.test(url) ? { 'Api-User-Agent': 'TokiSearch/0.1' } : undefined;
      const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT), headers });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res;
    }
    const json = async (url) => (await fetchRes(url)).json();

    const isCJK = (q) => /[぀-ヿ一-鿿]/.test(q);
    const wiki = (q) => `https://${isCJK(q) ? 'ja' : 'en'}.wikipedia.org`;

    // --- ウェブ検索のソース ---------------------------------------------------
    const sources = [
      {
        id: 'toki', name: 'Toki インデックス', enabled: () => !!local,
        search: async (q) => ({ results: await local(q, 10) }),
      },
      ...extraSources,
      {
        // Mwmbl: 非営利の独立したウェブ索引（英語が中心）。公開 API があり Web 版からも使える
        id: 'mwmbl', name: 'Mwmbl',
        search: async (q) => {
          const d = await json(`https://mwmbl.org/api/v1/search/?s=${enc(q)}`);
          const join = (parts) => (Array.isArray(parts) ? parts.map((x) => x.value).join('') : String(parts || ''));
          return { results: d.slice(0, 10).map((r) => ({ url: r.url, title: join(r.title), snippet: join(r.extract) })) };
        },
      },
      {
        id: 'wikipedia', name: 'Wikipedia',
        search: async (q) => {
          const d = await json(`${wiki(q)}/w/api.php?action=query&list=search&srlimit=4&srinfo=suggestion&format=json&origin=*&srsearch=${enc(q)}`);
          return {
            suggestion: d.query.searchinfo && d.query.searchinfo.suggestion,
            results: d.query.search.map((r) => ({
              url: `${wiki(q)}/wiki/${enc(r.title.replace(/ /g, '_'))}`,
              title: r.title, snippet: strip(r.snippet),
            })),
          };
        },
      },
      {
        id: 'duckduckgo', name: 'DuckDuckGo 即答',
        search: async (q) => {
          const d = await json(`https://api.duckduckgo.com/?format=json&no_html=1&skip_disambig=1&kp=-2&q=${enc(q)}`);
          const text = d.Answer || d.AbstractText || d.Definition;
          const flat = (d.RelatedTopics || []).flatMap((t) => t.Topics || [t]);
          return {
            instant: text && typeof text === 'string'
              ? { text, url: d.AbstractURL || d.DefinitionURL || '', source: d.AbstractSource || 'DuckDuckGo', image: d.Image ? 'https://duckduckgo.com' + d.Image : '' } : null,
            results: [...(d.Results || []), ...flat].filter((t) => t.FirstURL && t.Text).slice(0, 6).map((t) => {
              const [title, ...rest] = t.Text.split(' - ');
              return { url: t.FirstURL, title, snippet: rest.join(' - ') };
            }),
          };
        },
      },
      {
        // Wolfram Alpha は AppID が必要（無料枠あり）: TOKI_WOLFRAM_APPID=xxxx
        id: 'wolfram', name: 'Wolfram Alpha', enabled: () => !!wolframAppId,
        search: async (q) => {
          const text = await (await fetchRes(`https://api.wolframalpha.com/v1/result?appid=${enc(wolframAppId)}&i=${enc(q)}`)).text();
          return { instant: { text, url: `https://www.wolframalpha.com/input?i=${enc(q)}`, source: 'Wolfram Alpha' }, results: [] };
        },
      },
      {
        id: 'stackoverflow', name: 'Stack Overflow',
        search: async (q) => {
          const d = await json(`https://api.stackexchange.com/2.3/search/advanced?site=stackoverflow&pagesize=8&order=desc&sort=relevance&q=${enc(q)}`);
          return { results: d.items.map((i) => ({ url: i.link, title: strip(i.title), snippet: `回答 ${i.answer_count} 件 · ${i.tags.join(', ')}` })) };
        },
      },
      {
        id: 'github', name: 'GitHub',
        search: async (q) => {
          const d = await json(`https://api.github.com/search/repositories?per_page=8&q=${enc(q)}`);
          return { results: d.items.map((i) => ({ url: i.html_url, title: i.full_name, snippet: `${i.description || ''} ★${i.stargazers_count}` })) };
        },
      },
      {
        id: 'hackernews', name: 'Hacker News',
        search: async (q) => {
          const d = await json(`https://hn.algolia.com/api/v1/search?tags=story&hitsPerPage=8&query=${enc(q)}`);
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
          const d = await json(`https://archive.org/advancedsearch.php?fl[]=identifier&fl[]=title&fl[]=description&rows=6&output=json&q=${enc(q)}`);
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
          const d = await json(`https://openlibrary.org/search.json?limit=6&fields=key,title,author_name,first_publish_year&q=${enc(q)}`);
          return {
            results: d.docs.map((r) => ({
              url: `https://openlibrary.org${r.key}`, title: r.title,
              snippet: [(r.author_name || []).join(', '), r.first_publish_year].filter(Boolean).join(' · '),
            })),
          };
        },
      },
      {
        // arXiv の API は CORS 非対応なので Web 版では使えない
        id: 'arxiv', name: 'arXiv', enabled: () => !web,
        search: async (q) => {
          const xml = await (await fetchRes(`https://export.arxiv.org/api/query?max_results=6&search_query=all:${enc(q)}`)).text();
          const tag = (s, t) => strip((s.match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`)) || [])[1]);
          return {
            results: xml.split('<entry>').slice(1).map((e) => ({
              url: tag(e, 'id').replace(/^http:/, 'https:'), title: tag(e, 'title'), snippet: tag(e, 'summary').slice(0, 200),
            })),
          };
        },
      },
    ];

    // --- 画像検索のソース -----------------------------------------------------
    // 各画像: { thumb, full, url（掲載ページ）, title, width, height }
    const imageSources = [
      {
        // Wikipedia の記事の代表画像。固有名詞の検索で精度が高い
        id: 'wikipedia-image', name: 'Wikipedia', weight: 1.3,
        search: async (q) => {
          const d = await json(`${wiki(q)}/w/api.php?action=query&generator=search&gsrlimit=12&gsrsearch=${enc(q)}&prop=pageimages&piprop=thumbnail%7Coriginal&pithumbsize=400&format=json&origin=*`);
          return Object.values((d.query && d.query.pages) || {}).filter((p) => p.thumbnail).sort((a, b) => a.index - b.index).map((p) => ({
            thumb: p.thumbnail.source, full: (p.original && p.original.source) || p.thumbnail.source,
            url: `${wiki(q)}/wiki/${enc(p.title.replace(/ /g, '_'))}`, title: p.title,
            width: p.thumbnail.width, height: p.thumbnail.height,
          }));
        },
      },
      {
        id: 'commons', name: 'Wikimedia Commons', weight: 1,
        search: async (q) => {
          const d = await json(`https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrlimit=24&gsrsearch=${enc(q)}&prop=imageinfo&iiprop=url%7Csize%7Cmime&iiurlwidth=400&format=json&origin=*`);
          return Object.values((d.query && d.query.pages) || {}).sort((a, b) => a.index - b.index)
            .map((p) => ({ p, ii: (p.imageinfo || [])[0] }))
            .filter(({ ii }) => ii && ii.thumburl && /^image\/(jpeg|png|gif|webp|svg)/.test(ii.mime || ''))
            .map(({ p, ii }) => ({
              thumb: ii.thumburl, full: ii.url, url: ii.descriptionurl,
              title: p.title.replace(/^File:/, '').replace(/\.\w+$/, '').replace(/_/g, ' '),
              width: ii.thumbwidth, height: ii.thumbheight,
            }));
        },
      },
      {
        id: 'openverse', name: 'Openverse', weight: 1,
        search: async (q) => {
          const d = await json(`https://api.openverse.org/v1/images/?page_size=20&q=${enc(q)}`);
          return d.results.map((r) => ({
            thumb: r.thumbnail || r.url, full: r.url, url: r.foreign_landing_url, title: r.title || '',
            width: r.width, height: r.height,
          }));
        },
      },
    ];

    // --- どのソースを重く見るか（vertical selection・Arguello 2017 の query string features）
    const TECH = /\b(error|exception|undefined|api|sdk|npm|pip|git|github|linux|docker|sql|css|html|javascript|typescript|python|java|rust|golang|node|react|vue|regex|function|async|install|compile|stack ?trace|library|framework|bug|code|vim|emacs|bash|shell|terminal|command|kubernetes|aws|json|http|android|ios|windows|macos)\b|[(){}\[\];=<>]|::|エラー|例外|実装|インストール|コンパイル|ライブラリ|プログラ|コード|関数|変数|バグ/i;
    const ACADEMIC = /\b(paper|theorem|arxiv|proof|survey|algorithm|quantum|neural|equation)\b|論文|定理|証明|アルゴリズム/i;
    const BOOK = /\b(book|novel|author|isbn)\b|小説|著者|書籍|絵本|文庫/i;
    const IMAGE = /\b(images?|photos?|pictures?|wallpapers?|logo|icon|illustrations?)\b|画像|写真|イラスト|壁紙|ロゴ|アイコン/i;

    // ウェブ全体を対象にするソース。互いに同じ土俵で順位を付けているので、重みは近くそろえる。
    // 特定分野のソース（vertical）は、質問の種類が合うときだけ同じ土俵に上げる。
    function weights(q) {
      const tech = TECH.test(q), cjk = isCJK(q);
      const w = {
        toki: 1.6, bing: 1.5, 'duckduckgo-web': 1.5, yahoo: 1.3, wikipedia: 1.0, mwmbl: 1.1, duckduckgo: 1.0,
        stackoverflow: 0.3, github: 0.3, hackernews: 0.25, archive: 0.2, openlibrary: 0.2, arxiv: 0.2,
      };
      if (tech) Object.assign(w, { stackoverflow: 1.3, github: 1.0, hackernews: 0.6 });
      if (ACADEMIC.test(q)) w.arxiv = 1.2;
      if (BOOK.test(q)) Object.assign(w, { openlibrary: 1.0, archive: 0.5 });
      // 英語が中心のソースは、日本語の質問にはほとんど当たらない
      if (cjk) { w.mwmbl *= 0.5; if (!tech) { w.stackoverflow *= 0.5; w.hackernews *= 0.5; } }
      return w;
    }

    // 検索語（1文字の ASCII は除く）
    const termsOf = (q) => q.toLowerCase().split(/\s+/).filter((t) => t.length > 1 || /[^\x00-\x7f]/.test(t));
    const coverage = (text, terms) => {
      if (!terms.length) return 1;
      const t = String(text || '').toLowerCase();
      return terms.filter((x) => t.includes(x)).length / terms.length;
    };
    const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
    // サイトの単位（example.co.jp や wikipedia.org のような登録ドメイン相当）
    const siteOf = (u) => {
      const parts = hostOf(u).split('.');
      const n = parts.length > 2 && /^(co|com|ne|or|ac|go|org|net|gr|ed|lg)$/.test(parts[parts.length - 2]) && parts[parts.length - 1].length === 2 ? 3 : 2;
      return parts.slice(-n).join('.');
    };
    const keyOf = (u) => String(u).replace(/^https?:\/\/(www\.)?/, '').replace(/[/#?]+$/, '').toLowerCase();

    // --- 順位の統合 -----------------------------------------------------------
    // Reciprocal Rank Fusion（Cormack ら 2009）: 各ソースでの順位 r に対し 重み/(k+r) を足す。k=60。
    // ソース間で点数の尺度がそろっていなくても、順位だけで混ぜられる。
    const K = 60;
    function fuse(lists, terms, q = '') {
      const norm = (t) => String(t || '').toLowerCase().replace(/\s+/g, ' ').trim();
      const nq = norm(q);
      const cjkQuery = isCJK(q);
      const byKey = new Map();
      for (const { name, weight, items } of lists) {
        items.forEach((r, i) => {
          const k = keyOf(r.url);
          let e = byKey.get(k);
          if (!e) { e = { ...r, sources: [], rrf: 0 }; byKey.set(k, e); }
          else if (!e.snippet && r.snippet) e.snippet = r.snippet;
          if (!e.sources.includes(name)) e.sources.push(name);
          e.rrf += weight / (K + i + 1);
        });
      }
      const all = [...byKey.values()];
      for (const e of all) {
        // 題名・抜粋・URL に検索語がどれだけ出ているか（Clarke ら 2007 の、選ばれやすい結果の特徴）。
        // 各エンジンがすでに関連度で並べているので、ここでは控えめに効かせる
        let safeUrl = e.url;
        try { safeUrl = decodeURIComponent(e.url); } catch {}
        const title = coverage(e.title, terms);
        const any = coverage(`${e.title} ${e.snippet || ''} ${safeUrl}`, terms);
        const nt = norm(e.title);
        // 題名が質問そのもの（または質問で始まる）なら、その語を扱うページそのものである見込みが高い
        const exact = nq && (nt === nq || nt.startsWith(nq + ' - ') || nt.startsWith(nq + ' | ') || nt.startsWith(nq + ' – ')) ? 1.3 : 1;
        // 日本語の質問（漢字だけの語を含む）に対して、漢字はあるが仮名が1つも無い結果は中国語の見込みが高い
        const body = `${e.title} ${e.snippet || ''}`;
        const foreign = cjkQuery && /[\u4e00-\u9fff]/.test(body) && !/[\u3040-\u30ff]/.test(body) ? 0.6 : 1;
        // 検索語が題名にも抜粋にも URL にも出ない結果は、エンジン側の取り違えの見込みが高い
        const match = any === 0 ? 0.35 : 0.7 + 0.3 * any;
        e.score = e.rrf * match * (1 + 0.3 * title) * exact * foreign;
      }
      // 多様化（MMR・Carbonell & Goldstein 1998 の考え方）: 1つのサイトが上位を占めないよう、
      // 同じサイト（ja.wikipedia.org と en.wikipedia.org は同じ wikipedia.org と数える）の
      // 2件目は少し、3件目以降は大きく割り引く
      const crowd = (n) => (n === 0 ? 1 : n === 1 ? 0.8 : 0.8 * Math.pow(0.3, n - 1));
      const out = [], perSite = new Map();
      while (all.length) {
        let best = 0, bestVal = -1;
        all.forEach((e, i) => {
          const v = e.score * crowd(perSite.get(siteOf(e.url)) || 0);
          if (v > bestVal) { bestVal = v; best = i; }
        });
        const [e] = all.splice(best, 1);
        perSite.set(siteOf(e.url), (perSite.get(siteOf(e.url)) || 0) + 1);
        out.push({ url: e.url, title: e.title, snippet: e.snippet || '', source: e.sources.join(' + '), score: bestVal });
      }
      return out;
    }

    const active = (list) => list.filter((s) => !s.enabled || s.enabled());

    // 全部の応答を待つが、SOFT ミリ秒を過ぎたら、主要なソース（core）がそろった時点で打ち切る。
    // 待ち時間は利用に響く（Schurman & Brutlag 2009）ので、遅い脇のソースに全体を待たせない
    const SOFT = 1200;
    const CORE = new Set(['toki', 'bing', 'duckduckgo-web', 'yahoo', 'wikipedia', 'mwmbl']);
    function settle(list, q) {
      return new Promise((resolve) => {
        const out = list.map(() => ({ status: 'rejected', reason: new Error('timeout') }));
        let pending = list.length, pendingCore = list.filter((s) => CORE.has(s.id)).length, late = false, done = false;
        const finish = () => { if (!done) { done = true; resolve(out); } };
        const check = () => { if (!pending || (late && !pendingCore)) finish(); };
        setTimeout(() => { late = true; check(); }, SOFT);
        list.forEach((s, i) => {
          Promise.resolve().then(() => s.search(q)).then(
            (value) => { out[i] = { status: 'fulfilled', value }; },
            (reason) => { out[i] = { status: 'rejected', reason }; },
          ).then(() => { pending--; if (CORE.has(s.id)) pendingCore--; check(); });
        });
        if (!list.length) finish();
      });
    }

    async function searchImages(q) {
      const act = active(imageSources);
      const settled = await Promise.allSettled(act.map((s) => s.search(q)));
      const terms = termsOf(q), byKey = new Map(), status = [];
      settled.forEach((r, si) => {
        const s = act[si];
        const items = r.status === 'fulfilled' ? r.value.filter((x) => x.thumb && x.url) : [];
        status.push({ name: s.name, ok: r.status === 'fulfilled', n: items.length });
        items.forEach((img, i) => {
          const k = keyOf(img.full || img.thumb);
          let e = byKey.get(k);
          if (!e) { e = { ...img, source: s.name, rrf: 0 }; byKey.set(k, e); }
          e.rrf += s.weight / (K + i + 1);
        });
      });
      const images = [...byKey.values()]
        .map((e) => ({ ...e, score: e.rrf * (0.6 + 0.4 * coverage(e.title, terms)) }))
        .sort((a, b) => b.score - a.score)
        .map(({ rrf, ...e }) => e);
      return { images, status };
    }

    // 通常の検索: 全ソースと画像ソースへ同時に問い合わせ、RRF で1本にまとめる
    async function searchAll(q) {
      const t0 = Date.now();
      const act = active(sources), w = weights(q), terms = termsOf(q);
      const tech = TECH.test(q), wantsImage = IMAGE.test(q);
      const [settled, img] = await Promise.all([
        settle(act, q),
        // 技術的な質問には画像を出さない（どの vertical を出すかの選択）
        tech && !wantsImage ? { images: [], status: [] } : Promise.race([
          searchImages(q).catch(() => ({ images: [], status: [] })),
          // 画像ブロックのために、ウェブの結果を長く待たせない
          new Promise((r) => setTimeout(() => r({ images: [], status: [] }), 1800)),
        ]),
      ]);
      const lists = [], instants = [], status = [];
      let suggestion = '';
      settled.forEach((r, i) => {
        const s = act[i];
        const items = r.status === 'fulfilled' ? (r.value.results || []).filter((x) => x.url && x.title) : [];
        status.push({ name: s.name, ok: r.status === 'fulfilled', n: items.length });
        if (r.status !== 'fulfilled') return;
        if (r.value.instant) instants.push(r.value.instant);
        if (r.value.suggestion && !suggestion) suggestion = r.value.suggestion;
        lists.push({ name: s.name, weight: w[s.id] ?? 0.5, items });
      });
      const results = fuse(lists, terms, q);
      // 画像ブロックを置く位置（Arguello 2017 の slot）: 画像を求める語なら先頭、それ以外は3件目の後ろ
      const images = img.images.slice(0, 12);
      const imageSlot = images.length < 4 ? -1 : wantsImage ? 0 : 3;
      if (suggestion && suggestion.toLowerCase() === q.toLowerCase()) suggestion = '';
      return { instants, results, images, imageSlot, suggestion, status: [...status, ...img.status.map((s) => ({ ...s, name: s.name + '（画像）' }))], ms: Date.now() - t0 };
    }

    // 入力中の候補（Wikipedia の見出し語）
    async function suggest(prefix) {
      const d = await json(`${wiki(prefix)}/w/api.php?action=opensearch&limit=8&namespace=0&format=json&origin=*&search=${enc(prefix)}`);
      return (d[1] || []).filter((s) => typeof s === 'string');
    }

    // 画面に出すソース名の一覧
    const sourceNames = () => [...active(sources), ...imageSources].map((x) => x.name).filter((n, i, arr) => arr.indexOf(n) === i);

    return { searchAll, searchImages, suggest, sources, imageSources, sourceNames, fuse, termsOf };
  };
});
