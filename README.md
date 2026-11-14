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

ショートカット: `Ctrl+T` 新規タブ / `Ctrl+W` 閉じる / `Ctrl+L` アドレスバー / `Ctrl+R` 再読み込み / `Alt+←→` 戻る・進む / `F12` 開発者ツール

DoH が防ぐのは DNS レベルの検閲です。IP 遮断や DPI による遮断には `TOKI_PROXY` で Tor や VPN を併用してください。

## Toki 検索（`toki://home/`）

複数のソースへ同時に問い合わせ、1本の順位にまとめて返すハイブリッド検索です。画面はホームの検索窓、入力中の候補、「すべて／画像」のタブ、ページ送りという一般的な検索エンジンの形にしています。

### 順位の付け方

- **順位の統合**: 各ソースの順位を Reciprocal Rank Fusion（k=60）で足し合わせます。複数のソースに出た結果ほど上に来ます
- **ソースの重み**: 質問の文字列から種類を見分け、技術的な質問なら Stack Overflow と GitHub、論文なら arXiv、本なら Open Library を重くします。日本語の一般的な語では英語圏のソースを軽くします
- **検索語との一致**: 題名・抜粋・URL に検索語が出ている結果を上げ、まったく出ていない結果を下げます
- **多様化**: 同じサイトの結果が続くほど割り引きます
- **自前の索引**: 題名の一致を本文の 10 倍に数え、全語一致が少ないときは一部一致で補います
- **もしかして**: 綴りの候補があれば結果の上に出します

### 画像検索

- 「画像」タブで Wikipedia の記事画像・Wikimedia Commons・Openverse を検索し、同じ方法で1本の順位にまとめます
- 通常の検索結果にも画像のブロックが入ります。「写真」「画像」などを含む質問では先頭、それ以外では 3 件目の後ろに置き、技術的な質問には出しません

### ソース

| ソース | 内容 | キー |
| --- | --- | --- |
| Toki インデックス | 自前クローラー **TokiBot** と閲覧ページの全文索引（SQLite FTS5、日本語対応） | 不要 |
| Wikipedia | 記事検索・入力中の候補・綴りの候補（日本語/英語を自動判定） | 不要 |
| DuckDuckGo | インスタントアンサーと関連トピック | 不要 |
| Wolfram Alpha | 計算・事実の即答 | `TOKI_WOLFRAM_APPID` |
| Stack Overflow / GitHub / Hacker News / Internet Archive / Open Library / arXiv | 各サイトの検索 API | 不要 |
| Wikimedia Commons / Openverse | 画像 | 不要 |

- `toki://crawl/` に URL を入れると TokiBot がそのサイトをクロールして索引に追加します（最大 200 ページ・深さ 2、robots.txt を尊重）
- 索引は端末内（Electron の userData の `index.db`）にのみ保存されます
- ソースの追加は `docs/sources.js` の配列に `{ id, name, search(q) }` を足すだけです
- Yahoo! Search BOSS と Bing Web Search API は提供終了、Yandex Search API は有料契約が必要なため未実装です。結果ページ下部に Bing / Yandex / Google / DuckDuckGo で同じ語を検索するリンクがあります
- 入力中の候補は、打った文字を Wikipedia に送って取得します

設計の根拠にした文献と抜き書きは `research/search-relevance/` と `research/search-ui/` にあります（`map.md` と `extracts.json`）。

## Web 版（GitHub Pages）

`docs/` は Toki 検索の Web 版で、https://ka1tetsu.github.io/Toki/ で公開しています。サーバーを持たない静的サイトで、閲覧者のブラウザから各検索ソースへ直接問い合わせます。デスクトップ版の `toki://home/` も同じファイルを表示します。

Web 版にできないこと（ブラウザの制約）: 自前クローラーと索引、DNS over HTTPS、プロキシ、タブ付きブラウザ本体、arXiv と Wolfram Alpha のソース。これらはデスクトップ版で使えます。

## 構成

```
main.js            メインプロセス（DoH・プロキシ・toki:// プロトコル・メニュー）
index.html         ブラウザ UI
renderer.js        タブとアドレスバーの制御
preload.js         メニュー操作の橋渡し
search/index.js    全文索引とクローラー
search/sources.js  デスクトップ版の検索ソース設定
docs/sources.js    検索ソース・画像ソース・順位の統合（デスクトップ版と Web 版で共有）
docs/              検索画面（index.html / app.js / style.css）。Web 版と toki://home/ の両方で使う
research/          設計の根拠にした調査（地図・記録・抜き書き）
search/pages.js    toki:// の配信（検索画面・検索 API・クローラー管理）
```
