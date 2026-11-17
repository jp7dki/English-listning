// =============================================================
// sw.js … Service Worker（オフラインでもアプリとフレーズ集を表示するため）
//  ・アプリ本体（HTML/CSS/JS/アイコン）は先に保存しておき、保存版を使う
//  ・data/*.json は「通信できれば最新、できなければ保存版」
//  ・音声（外部サイト）は保存しない（通信が必要）
// ファイルを変更して公開したら、下の VERSION の数字を1つ上げてください。
// （上げないと、スマホに古いファイルが残ることがあります）
// =============================================================

const VERSION = 'v1';
const CACHE = 'elp-' + VERSION;

const APP_FILES = [
  './',
  './index.html',
  './css/style.css',
  './js/storage.js',
  './js/player.js',
  './js/screens.js',
  './js/app.js',
  './data/plan.json',
  './data/materials.json',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

// インストール時：アプリ本体を保存
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(APP_FILES)).then(() => self.skipWaiting()));
});

// 有効化時：古いバージョンの保存分を削除
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('elp-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  // 自分のサイト以外（音声・公式ページなど）と GET 以外は何もしない
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  // 教材・プランのデータ：通信優先（失敗したら保存版）
  if (url.pathname.includes('/data/')) {
    e.respondWith(
      fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      }).catch(() => caches.match(req, { ignoreSearch: true }))
    );
    return;
  }

  // アプリ本体：保存版を優先（なければ通信）
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).catch(() => caches.match('./index.html')))
  );
});
