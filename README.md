# Toki

シンプルで検閲されないブラウザと、内蔵の検索エンジン。

## 起動

```bash
npm install
```

```bash
npm start
```

## ブラウザ

- タブ、アドレスバー（URL か検索語）、戻る／進む／再読み込みだけの最小構成
- ブロックリスト・コンテンツフィルタ・セーフサーチなし
- **DNS over HTTPS**（Cloudflare / Google、フィルタなし）で DNS ブロッキングと改ざんを回避。平文 DNS にはフォールバックしない
- プロキシ対応（Tor など）

| 環境変数 | 意味 |
| --- | --- |
| `TOKI_DOH` | DoH サーバー URL（カンマ区切り）。`off` で OS の DNS を使う |
| `TOKI_PROXY` | プロキシ。例: `socks5://127.0.0.1:9050`（Tor） |
| `TOKI_WOLFRAM_APPID` | Wolfram Alpha の AppID（設定すると検索ソースに加わる） |
| `TOKI_INDEX_VISITS` | `off` で閲覧ページの自動インデックスを止める |
| `TOKI_ENGINES` | `off` で Bing・DuckDuckGo・Yahoo への問い合わせを止める |

ショートカット: `Ctrl+T` 新規タブ / `Ctrl+W` 閉じる / `Ctrl+L` アドレスバー / `Ctrl+R` 再読み込み / `Alt+←→` 戻る・進む / `F12` 開発者ツール

DoH が防ぐのは DNS レベルの検閲です。IP 遮断や DPI による遮断には `TOKI_PROXY` で Tor や VPN を併用してください。

## Toki 検索（`toki://home/`）

複数のソースへ同時に問い合わせ、1本の順位にまとめて返すハイブリッド検索です。画面はホームの検索窓、入力中の候補、「すべて／画像」のタブ、ページ送りという一般的な検索エンジンの形にしています。

### 順位の付け方

- **順位の統合**: 各ソースの順位を Reciprocal Rank Fusion（k=60）で足し合わせます。複数のエンジンが一致して上位に出した結果ほど上に来ます
- **ソースの重み**: ウェブ全体を対象にするソース（Bing・DuckDuckGo・Yahoo・Wikipedia・Mwmbl・自前の索引）は同じ土俵で混ぜます。特定分野のソースは質問の種類が合うときだけ重くします（技術的な質問なら Stack Overflow と GitHub、論文なら arXiv、本なら Open Library）
- **検索語との一致**: 題名・抜粋・URL に検索語がまったく出ない結果を大きく下げ、題名が質問そのものの結果を上げます
- **言語**: 日本語の質問に対して、漢字だけで仮名のない結果（中国語の見込みが高い）を下げます
- **多様化**: 同じサイトの結果が続くほど割り引きます
- **待ち時間**: 主要なソースがそろったら、遅いソースは待たずに表示します
- **自前の索引**: 題名の一致を本文の 10 倍に数え、全語一致が少ないときは一部一致で補います
- **もしかして**: 綴りの候補があれば結果の上に出します

### 画像検索

- 「画像」タブで Wikipedia の記事画像・Wikimedia Commons・Openverse を検索し、同じ方法で1本の順位にまとめます
- 通常の検索結果にも画像のブロックが入ります。「写真」「画像」などを含む質問では先頭、それ以外では 3 件目の後ろに置き、技術的な質問には出しません

### ソース

| ソース | 内容 | キー |
| --- | --- | --- |
| Toki インデックス | 自前クローラー **TokiBot** と閲覧ページの全文索引（SQLite FTS5、日本語対応） | 不要 |
| Bing / DuckDuckGo / Yahoo | 一般のウェブ検索。各エンジンの結果ページを取得して読み取る（**デスクトップ版のみ**。`TOKI_ENGINES=off` で止める） | 不要 |
| Mwmbl | 非営利の独立したウェブ索引（英語が中心） | 不要 |
| Wikipedia | 記事検索・入力中の候補・綴りの候補（日本語/英語を自動判定） | 不要 |
| DuckDuckGo 即答 | インスタントアンサーと関連トピック | 不要 |
| Wolfram Alpha | 計算・事実の即答 | `TOKI_WOLFRAM_APPID` |
| Stack Overflow / GitHub / Hacker News / Internet Archive / Open Library / arXiv | 各サイトの検索 API | 不要 |
| Wikimedia Commons / Openverse | 画像 | 不要 |

- `toki://crawl/` に URL を入れると TokiBot がそのサイトをクロールして索引に追加します（最大 200 ページ・深さ 2、robots.txt を尊重）
- 索引は端末内（Electron の userData の `index.db`）にのみ保存されます
- ソースの追加は `docs/sources.js` の配列に `{ id, name, search(q) }` を足すだけです
- Bing・DuckDuckGo・Yahoo は公開 API が無い（Yahoo! Search BOSS と Bing Web Search API は提供終了）ため、結果ページを読み取っています。各社の利用規約が想定する使い方ではなく、ページの作りが変わったりロボット確認が出たりすると、そのエンジンだけ結果が出なくなります（結果ページ下部に「×」と表示）
- Yandex はロボット確認が出て取得できないため未実装です。結果ページ下部に Bing / Yandex / Google / DuckDuckGo で同じ語を検索するリンクがあります
- 入力中の候補は、打った文字を Wikipedia に送って取得します

設計の根拠にした文献と抜き書きは `research/search-relevance/` と `research/search-ui/` にあります（`map.md` と `extracts.json`）。

## Web 版（GitHub Pages）

`docs/` は Toki 検索の Web 版で、https://ka1tetsu.github.io/Toki/ で公開しています。サーバーを持たない静的サイトで、閲覧者のブラウザから各検索ソースへ直接問い合わせます。デスクトップ版の `toki://home/` も同じファイルを表示します。

Web 版にできないこと（ブラウザの制約）: Bing・DuckDuckGo・Yahoo の一般ウェブ検索、自前クローラーと索引、DNS over HTTPS、プロキシ、タブ付きブラウザ本体、arXiv と Wolfram Alpha のソース。これらはデスクトップ版で使えます。Web 版の一般ウェブ検索は Mwmbl と Wikipedia だけです。

## 構成

```
main.js            メインプロセス（DoH・プロキシ・toki:// プロトコル・メニュー）
index.html         ブラウザ UI
renderer.js        タブとアドレスバーの制御
preload.js         メニュー操作の橋渡し
search/index.js    全文索引とクローラー
search/sources.js  デスクトップ版の検索ソース設定
search/engines.js  Bing・DuckDuckGo・Yahoo の結果ページの読み取り
docs/sources.js    検索ソース・画像ソース・順位の統合（デスクトップ版と Web 版で共有）
docs/              検索画面（index.html / app.js / style.css）。Web 版と toki://home/ の両方で使う
research/          設計の根拠にした調査（地図・記録・抜き書き）
search/pages.js    toki:// の配信（検索画面・検索 API・クローラー管理）
```
