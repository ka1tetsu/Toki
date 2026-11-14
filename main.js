const { app, BrowserWindow, Menu, protocol } = require('electron');
const path = require('path');
const index = require('./search/index');
const pages = require('./search/pages');

// --- 検閲回避の設定 -------------------------------------------------------
// DNS over HTTPS: ISP の DNS ブロッキング/改ざんを受けない、フィルタなしのリゾルバを使う。
// TOKI_DOH   = カンマ区切りの DoH URL（"off" で OS の DNS に戻す）
// TOKI_PROXY = プロキシ（例: socks5://127.0.0.1:9050 で Tor 経由）
const DOH = process.env.TOKI_DOH || 'https://cloudflare-dns.com/dns-query,https://dns.google/dns-query';
const PROXY = process.env.TOKI_PROXY;

if (PROXY) app.commandLine.appendSwitch('proxy-server', PROXY);

// toki:// = 内蔵ページ（ホーム・Toki 検索・クローラー）
protocol.registerSchemesAsPrivileged([{ scheme: 'toki', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

let win;
const send = (cmd) => () => win && win.webContents.send('cmd', cmd);

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'Toki',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      webviewTag: true,
    },
  });
  win.loadFile('index.html');
  win.on('closed', () => { win = null; });
}

app.whenReady().then(() => {
  if (DOH !== 'off') {
    app.configureHostResolver({
      // 'secure' = 平文 DNS へフォールバックしない（改ざんされた応答を受け取らない）
      secureDnsMode: 'secure',
      secureDnsServers: DOH.split(',').map((s) => s.trim()).filter(Boolean),
    });
  }

  index.open();
  protocol.handle('toki', (req) => pages.handle(req).catch((e) => new Response(String(e), { status: 500 })));

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'Toki',
      submenu: [
        { label: '新しいタブ', accelerator: 'CmdOrCtrl+T', click: send('new-tab') },
        { label: 'タブを閉じる', accelerator: 'CmdOrCtrl+W', click: send('close-tab') },
        { label: 'アドレスバー', accelerator: 'CmdOrCtrl+L', click: send('focus-url') },
        { label: '再読み込み', accelerator: 'CmdOrCtrl+R', click: send('reload') },
        { label: '戻る', accelerator: 'Alt+Left', click: send('back') },
        { label: '進む', accelerator: 'Alt+Right', click: send('forward') },
        { label: 'ページの開発者ツール', accelerator: 'F12', click: send('devtools') },
        { type: 'separator' },
        { role: 'quit', label: '終了' },
      ],
    },
    { role: 'editMenu' },
  ]));

  createWindow();
  app.on('activate', () => { if (!win) createWindow(); });
});

// ページが開こうとする新規ウィンドウは新しいタブにする
app.on('web-contents-created', (_e, contents) => {
  if (contents.getType() !== 'webview') return;
  contents.setWindowOpenHandler(({ url }) => {
    if (win) win.webContents.send('cmd', 'new-tab', url);
    return { action: 'deny' };
  });
  // 閲覧したページを自前インデックスに追加（TOKI_INDEX_VISITS=off で無効）
  if (process.env.TOKI_INDEX_VISITS === 'off') return;
  contents.on('did-finish-load', async () => {
    const url = contents.getURL();
    if (!/^https?:/.test(url)) return;
    try {
      const text = await contents.executeJavaScript('document.body ? document.body.innerText : ""');
      if (text) index.add(url, contents.getTitle(), text);
    } catch {}
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
