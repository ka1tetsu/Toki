# map: search-relevance

問い: 複数の外部ソース（Wikipedia・Stack Overflow・GitHub など）と自前の小さな全文索引を混ぜて返す検索エンジン（Toki）で、検索結果の質（関連するものが上に来ること）を上げるには何をすればよいか。
入口の言葉: federated search, metasearch, result merging, rank fusion, 検索精度 向上

## 要る主張
- [x] この分野（統合検索・メタ検索・ランキング）の知見はどこに集まっているか（場） — 下の「場」。sources/arguello-2017-aggregated-search.txt:72 "integrated search across"
- [ ] 複数ソースの順位付きリストを1本に混ぜるとき、単純な交互並べよりどの手法がどれくらい効くか（rank fusion） — [x] sources/cormack-2009-rrf.txt:26 "k = 60 was near-optimal"、:49 "by 4%"、sources/aslam-2001-models-for-metasearch.txt:24 "outperform the best input system"
- [ ] 質問ごとに「どのソースに問い合わせるか／どのソースを上に出すか」を選ぶ方法は何で、どこで失敗するか（resource / vertical selection） — [x] sources/arguello-2017-aggregated-search.txt:1664 "decide which verticals to present"、:1986 "more difficult task"、:2028 "specific slots"
- [ ] 小さな自前索引の順位付け（BM25・フィールドの重み・近接）で何が効き、日本語（分かち書きなし）では何が足りないか — [x] sources/sqlite-fts5-doc.md:1484 "assigned a different"、:893 "fewer than 3 unicode characters"、sources/elastic-japanese-fulltext.md:69,71
- [ ] 質問の書き換え（綴り直し・拡張）や重複除去・多様化は、どんな条件で効き、どこで害になるか — 一部だけ。sources/carbonell-1998-mmr.txt:14 "Marginal Relevance (MMR) criterion"。綴り直し・拡張の原文は未取得
- [x] これらの手法の元になった原典・研究はあるか — sources/cormack-2009-rrf.txt:1、aslam-2001、robertson-2009、carbonell-1998、arguello-2017

## 用語
- Reciprocal Rank Fusion（RRF）— sources/cormack-2009-rrf.txt
- CombSUM / CombMNZ、Borda count、Condorcet fusion（メタ検索のデータ融合）— sources/aslam-2001-models-for-metasearch.txt
- federated search / resource selection / result merging — https://www.microsoft.com/en-us/research/publication/federated-search/ （未確認）
- aggregated search / vertical selection / vertical presentation / slot — sources/arguello-2017-aggregated-search.txt
- BM25 / BM25F（フィールドの重み）— sources/robertson-2009-prf-bm25-beyond.txt、sources/sqlite-fts5-doc.md
- trigram トークナイザ、N-gram と形態素解析 — sources/sqlite-fts5-doc.md、sources/elastic-japanese-fulltext.md
- Maximal Marginal Relevance（MMR、多様化）— sources/carbonell-1998-mmr.txt
- nDCG / MRR（評価指標）— https://zenn.dev/msmtec/articles/b29bd4f22c3999 （未確認）

## 人
- Gordon V. Cormack、Charles L. A. Clarke、Stefan Büttcher（Waterloo）— RRF 2009
- Javed A. Aslam、Mark H. Montague — Models for Metasearch 2001
- Jaime Arguello（UNC）— Aggregated Search 2017
- Stephen Robertson、Hugo Zaragoza — The Probabilistic Relevance Framework: BM25 and Beyond
- Jaime Carbonell、Jade Goldstein（CMU）— MMR 1998
- Milad Shokouhi、Luo Si — Federated Search 2011（未確認）

## 場
- SIGIR、CIKM — https://ir.webis.de/anthology/
- Foundations and Trends in Information Retrieval — https://nowpublishers.com/article/Details/INR-052
- Introduction to Information Retrieval（Manning ら・無料公開）— https://nlp.stanford.edu/IR-book/
- SQLite 公式文書 — https://sqlite.org/fts5.html
- 言語処理学会 年次大会 — https://www.anlp.jp/proceedings/annual_meeting/2025/pdf_dir/P8-5.pdf
- 企業の技術ブログ（Elastic、issoh）、Zenn、gihyo.jp の連載（未確認）

## 原文（sources/）
| 論文・資料 | ファイル | 元の URL | どこから来たか（周・動き） |
|---|---|---|---|
| 〔論文〕Cormack ら 2009 Reciprocal Rank Fusion outperforms Condorcet… 測定あり | cormack-2009-rrf.pdf / .txt | https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf | 0周目・英語の検索役 |
| 〔論文〕Aslam と Montague 2001 Models for Metasearch 測定あり | aslam-2001-models-for-metasearch.pdf / .txt | https://www.ccs.neu.edu/home/jaa/CSG339.06F/resources/borda_metas.pdf | 1周目・後ろへ（Cormack の参考文献 [4] の著者） |
| 〔論文〕Arguello 2017 Aggregated Search | arguello-2017-aggregated-search.pdf / .txt | https://ils.unc.edu/~jarguell/ArguelloFNTIR2017 | 0周目・英語の検索役 |
| 〔論文〕Robertson と Zaragoza 2009 The Probabilistic Relevance Framework: BM25 and Beyond | robertson-2009-prf-bm25-beyond.pdf / .txt | https://www.staff.city.ac.uk/~sbrp622/papers/foundations_bm25_review.pdf | 1周目・著者で追う（BM25F の著者のページ） |
| 〔論文〕Carbonell と Goldstein 1998 The Use of MMR… | carbonell-1998-mmr.pdf / .txt | https://www.cs.cmu.edu/~jgc/publication/The_Use_MMR_Diversity_Based_LTMIR_1998.pdf | 1周目・著者で追う |
| 〔論文〕Wu ら 2022 Result Diversification in Search and Recommendation（未読） | wu-2022-diversification-survey.pdf / .txt | https://arxiv.org/pdf/2212.14464 | 0周目・英語の検索役 |
| 〔論文〕言語処理学会 2025 P8-5（未読） | anlp-2025-p8-5.pdf / .txt | https://www.anlp.jp/proceedings/annual_meeting/2025/pdf_dir/P8-5.pdf | 0周目・日本語の検索役 |
| 〔公式〕SQLite FTS5 Extension | sqlite-fts5-doc.md | https://sqlite.org/fts5.html | 0周目・英語の検索役 |
| 〔公式〕Elastic 日本語の全文検索（n-gram と形態素解析の併用） | elastic-japanese-fulltext.md | https://www.elastic.co/jp/blog/how-to-implement-japanese-full-text-search-in-elasticsearch | 0周目・日本語の検索役 |

## 次の手がかり
- Manning ら IR 教科書の 3章（綴り直し）・9章（クエリ拡張）— 接続が切れて未取得。書き換えの主張が一部だけのまま
- Shokouhi と Si 2011 Federated Search — ソース選択の定番。出版社ページは試し読みのみ
- Arguello ら 2009 Sources of evidence for vertical selection — 404。著者ページを当たる
- 日本語の RRF 実測記事 — 日本語の検索役は「解説のみ、実測は無い」と報告
