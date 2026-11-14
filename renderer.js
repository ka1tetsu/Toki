const HOME = 'toki://home/';
const SEARCH = 'toki://search/?q='; // 内蔵の Toki 検索

const $ = (id) => document.getElementById(id);
const tabsEl = $('tabs'), viewsEl = $('views'), urlEl = $('url'), newBtn = $('new');

let tabs = [];   // { view, el, label }
let active = null;

// 入力を URL か検索語か判定する
function toURL(input) {
  const s = input.trim();
  if (!s) return HOME;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s) || /^(about|data|file|view-source):/i.test(s)) return s;
  if (!/\s/.test(s) && (/^localhost(:\d+)?(\/|$)/i.test(s) || /^[^/]+\.[^/.\s]+(\/|$|:\d+)/.test(s))) {
    return 'https://' + s;
  }
  return SEARCH + encodeURIComponent(s);
}

function newTab(url = HOME) {
  const view = document.createElement('webview');
  view.setAttribute('src', url);
  view.setAttribute('allowpopups', '');

  const el = document.createElement('div');
  el.className = 'tab';
  const label = document.createElement('span');
  label.textContent = '新しいタブ';
  const close = document.createElement('button');
  close.textContent = '×';
  el.append(label, close);

  const tab = { view, el, label };
  el.addEventListener('click', () => select(tab));
  el.addEventListener('auxclick', (e) => { if (e.button === 1) closeTab(tab); });
  close.addEventListener('click', (e) => { e.stopPropagation(); closeTab(tab); });

  view.addEventListener('page-title-updated', (e) => { label.textContent = e.title; el.title = e.title; });
  const onNav = (e) => {
    if (e.isMainFrame === false) return;
    if (tab === active && document.activeElement !== urlEl) urlEl.value = e.url;
  };
  view.addEventListener('did-navigate', onNav);
  view.addEventListener('did-navigate-in-page', onNav);
  view.addEventListener('did-fail-load', (e) => {
    if (e.isMainFrame && e.errorCode !== -3) label.textContent = `読み込み失敗: ${e.errorDescription}`;
  });

  tabs.push(tab);
  tabsEl.insertBefore(el, newBtn);
  viewsEl.append(view);
  select(tab);
  if (url === HOME) { urlEl.value = ''; urlEl.focus(); }
  return tab;
}

function select(tab) {
  active = tab;
  for (const t of tabs) {
    t.el.classList.toggle('active', t === tab);
    t.view.classList.toggle('active', t === tab);
  }
  try { urlEl.value = tab.view.getURL(); } catch { urlEl.value = tab.view.getAttribute('src'); }
}

function closeTab(tab = active) {
  const i = tabs.indexOf(tab);
  if (i < 0) return;
  tabs.splice(i, 1);
  tab.el.remove();
  tab.view.remove();
  if (!tabs.length) return window.close();
  if (tab === active) select(tabs[Math.min(i, tabs.length - 1)]);
}

const act = {
  'new-tab': (url) => newTab(url || HOME),
  'close-tab': () => closeTab(),
  'focus-url': () => { urlEl.focus(); urlEl.select(); },
  reload: () => active.view.reload(),
  back: () => active.view.canGoBack() && active.view.goBack(),
  forward: () => active.view.canGoForward() && active.view.goForward(),
  devtools: () => active.view.openDevTools(),
};

$('bar').addEventListener('submit', (e) => {
  e.preventDefault();
  active.view.loadURL(toURL(urlEl.value)).catch(() => {});
  active.view.focus();
});
urlEl.addEventListener('focus', () => urlEl.select());
newBtn.addEventListener('click', () => act['new-tab']());
$('back').addEventListener('click', act.back);
$('fwd').addEventListener('click', act.forward);
$('reload').addEventListener('click', act.reload);

window.toki.onCommand((cmd, arg) => act[cmd] && act[cmd](arg));

newTab();
