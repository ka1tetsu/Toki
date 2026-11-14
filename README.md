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

複数のソースへ同時に問い合わせ、順位ごとに混ぜて重複を除いた結果を返すハイブリッド検索です。

| ソース | 内容 | キー |
| --- | --- | --- |
| Toki インデックス | 自前クローラー **TokiBot** と閲覧ページの全文索引（SQLite FTS5、日本語対応） | 不要 |
| Wikipedia | 記事検索（日本語/英語を自動判定） | 不要 |
| DuckDuckGo | インスタントアンサーと関連トピック | 不要 |
| Wolfram Alpha | 計算・事実の即答 | `TOKI_WOLFRAM_APPID` |
| Stack Overflow / GitHub / Hacker News / Internet Archive / Open Library / arXiv | 各サイトの検索 API | 不要 |

- ホーム画面の入力欄に URL を入れると TokiBot がそのサイトをクロールして索引に追加します（最大 200 ページ・深さ 2、robots.txt を尊重）
- 索引は端末内（Electron の userData の `index.db`）にのみ保存されます
- ソースの追加は `search/sources.js` の配列に `{ id, name, search(q) }` を足すだけです
- Yahoo! Search BOSS と Bing Web Search API は提供終了、Yandex Search API は有料契約が必要なため未実装です。結果ページ下部に Bing / Yandex / Google / DuckDuckGo で同じ語を検索するリンクがあります

## 構成

```
main.js            メインプロセス（DoH・プロキシ・toki:// プロトコル・メニュー）
index.html         ブラウザ UI
renderer.js        タブとアドレスバーの制御
preload.js         メニュー操作の橋渡し
search/index.js    全文索引とクローラー
search/sources.js  検索ソースと結果の統合
search/pages.js    toki:// の内蔵ページ
```
