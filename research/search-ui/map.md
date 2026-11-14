# map: search-ui

問い: 検索エンジン（Toki 検索）のホームと結果ページの UI/UX を、Google に近い使い心地にするには、何をどう作ればよいか。Google の結果ページはどんな要素でできていて、それぞれなぜ効くのか。
入口の言葉: search user interface, SERP design, search results page usability, 検索結果ページ UI

## 要る主張
- [x] 検索 UI の知見はどこに集まっているか（場） — 下の「場」。sources/hearst-2009-sui-ch5-results.md:18 "vertical list of information"
- [ ] Google に近い検索 UI を成り立たせている要素（検索窓・候補・結果1件の形・縦割りタブ・ページ送りなど）は何で、それぞれ利用者の行動にどう効くか — [x] sources/hearst-2009-sui-ch1-design.md:20 "type-keywords-in-entry-form"、sources/nng-2001-search-visible-simple.md:51 "the little box where I can type"、:57 "wide enough"
- [ ] 結果1件の見せ方（題名・URL・抜粋の長さ・強調）は、どう作ると選びやすく、どこで失敗するか — [x] sources/hearst-2009-sui-ch5-results.md:22 "title is uninformative or misleading"、:39 "all the query terms should appear"、sources/zhang-2018-snippet-highlighting.md:273 "too much highlighted terms"
- [ ] 入力中の候補（オートコンプリート）や「もしかして」は、どれくらい効き、何に気をつけるか — [x] sources/mitra-2014-qac-interactions.txt:22 "about half of the"、sources/baymard-2022-autocomplete-design.md:240 "choice paralysis"、:334、sources/w3c-apg-combobox.md:105。「もしかして」は原文なし
- [ ] 表示の速さ・待ち時間は利用にどれくらい響くか — [x] sources/schurman-2009-speed-matters.txt:7-8 "100 to 400 ms" "0.2% to 0.6%"
- [ ] これらの設計の元になった原典・研究はあるか — 一部だけ。sources/hearst-2009-sui-ch5-results.md:24（Clarke ら 2007 を引用）

## 用語
- document surrogate（結果1件の表示: 題名・URL・要約）— sources/hearst-2009-sui-ch5-results.md
- query-biased summary / snippet、query term highlighting — sources/zhang-2018-snippet-highlighting.md
- query auto-completion（QAC）— sources/mitra-2014-qac-interactions.txt
- combobox（aria-expanded、aria-activedescendant）— sources/w3c-apg-combobox.md
- SERP features（featured snippet、knowledge panel、People Also Ask）— sources/nng-key-serp-features.md
- 黄金の三角形 / F 字型 / ピンボール型（視線の動き）— https://www.nngroup.com/topic/search/ （未確認）

## 人
- Marti Hearst（UC Berkeley）— Search User Interfaces 2009
- Jake Brutlag、Eric Schurman（Google）— Speed Matters for Google Web Search 2009
- Bhaskar Mitra（Microsoft）— On User Interactions with Query Auto-Completion 2014
- Jakob Nielsen（Nielsen Norman Group）— Search: Visible and Simple 2001
- Greg Nudelman、Tony Russell-Rose と Tyler Tate — 検索 UX の書籍（有料・未確認）

## 場
- Search User Interfaces（全章無料公開）— https://searchuserinterfaces.com/book/
- Nielsen Norman Group 検索トピック — https://www.nngroup.com/topic/search/
- Baymard Institute — https://baymard.com/research-articles/autocomplete-design
- W3C ARIA Authoring Practices Guide — https://www.w3.org/WAI/ARIA/apg/patterns/combobox/
- SIGIR / CIKM / CHIIR、Google Research、Microsoft Research（未確認）

## 原文（sources/）
| 論文・資料 | ファイル | 元の URL | どこから来たか（周・動き） |
|---|---|---|---|
| 〔論文〕Hearst 2009 Search User Interfaces 1章（設計） | hearst-2009-sui-ch1-design.md | https://searchuserinterfaces.com/book/sui_ch1_design.html | 0周目・両方の検索役 |
| 〔論文〕Hearst 2009 同 5章（結果の見せ方） | hearst-2009-sui-ch5-results.md | https://searchuserinterfaces.com/book/sui_ch5_retrieval_results.html | 0周目・英語の検索役 |
| 〔論文〕Hearst 2009 同 4章（クエリの入力） | hearst-2009-sui-ch4-query.md | https://searchuserinterfaces.com/book/sui_ch4_query_specification.html | 1周目・近くを眺める（同じ本の隣の章） |
| 〔論文〕Schurman と Brutlag 2009 Speed Matters for Google Web Search 測定あり | schurman-2009-speed-matters.pdf / .txt | https://services.google.com/fh/files/blogs/google_delayexp.pdf | 0周目・英語の検索役 |
| 〔論文〕Mitra ら 2014 On User Interactions with Query Auto-Completion 測定あり | mitra-2014-qac-interactions.pdf / .txt | https://microsoft.com/en-us/research/wp-content/uploads/2014/07/sigirsp190-mitra.pdf | 0周目・英語の検索役 |
| 〔論文〕Zhang ら 2018 Beyond Query-Oriented Highlighting 測定あり | zhang-2018-snippet-highlighting.md | https://pmc.ncbi.nlm.nih.gov/articles/PMC6305051/ | 0周目・英語の検索役 |
| 〔論文〕The Evolution of Web Search User Interfaces（arXiv 2301.08613） | arxiv-2301.08613-evolution-serp.pdf / .txt | https://arxiv.org/pdf/2301.08613 | 0周目・両方の検索役 |
| 〔観察〕Baymard 2022 9 UX Best Practice Design Patterns for Autocomplete 宣伝あり | baymard-2022-autocomplete-design.md | https://baymard.com/research-articles/autocomplete-design | 0周目・英語の検索役 |
| 〔観察〕NN/g 2001 Search: Visible and Simple | nng-2001-search-visible-simple.md | https://www.nngroup.com/articles/search-visible-and-simple/ | 0周目・両方の検索役 |
| 〔観察〕NN/g Three Key SERP Features（未読） | nng-key-serp-features.md | https://www.nngroup.com/articles/key-serp-features/ | 0周目・英語の検索役 |
| 〔公式〕W3C APG Combobox Pattern | w3c-apg-combobox.md | https://www.w3.org/WAI/ARIA/apg/patterns/combobox/ | 1周目・後ろへ（日本語の検索役が挙げた自作記事の参照先） |

## 次の手がかり
- Clarke ら 2007（結果表示の特徴とクリック）— Hearst 5章が引く原典。未取得
- Cutrell と Guan 2007（抜粋の長さの視線追跡）— 英語の検索役が名前だけ挙げた
- Arapakis ら 2015（遅延）— 404
- 「もしかして」の効果を測った研究 — 両方の検索役が「探したが無い」
