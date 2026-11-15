// G-Bowl のオフライン対応（サービスワーカー）。index.html と同じ場所に置く。
// アプリ本体: まずネットから取り、取れないとき（電波なし・4秒待っても返事なし）は前回の保存分を使う。だから更新はいつもどおり届く。
// 地図の部品（Leaflet）: 一度取ったら保存分を使う。地図の画像: 見たことのある場所だけ保存（古いものから消す）。
// 制限速度・オービスなどの問い合わせは保存しない。
const APP = 'gbowl-app-v1', LIB = 'gbowl-lib-v1', TILES = 'gbowl-tiles-v1', TILE_MAX = 800;
const LIBS = ['https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css', 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const app = await caches.open(APP), lib = await caches.open(LIB);
    await Promise.allSettled([
      app.add(new Request('./', { cache: 'reload' })),
      app.add('icon-180.png'),
      ...LIBS.map(u => lib.add(u)),
    ]);
    self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keep = [APP, LIB, TILES];
    for (const k of await caches.keys()) if (k.startsWith('gbowl-') && !keep.includes(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

const timeout = (p, ms) => new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('timeout')), ms); p.then(v => { clearTimeout(t); res(v); }, err => { clearTimeout(t); rej(err); }); });

async function appFirstNet(req) {   // アプリ本体
  const cache = await caches.open(APP), url = new URL(req.url);
  const key = url.pathname.endsWith('/') || url.pathname.endsWith('/index.html') ? new URL('./', self.registration.scope).href : url.origin + url.pathname;
  try {
    const net = fetch(req);
    const r = await timeout(net, 4000);
    if (r.ok) cache.put(key, r.clone());
    return r;
  } catch (err) {
    const hit = await cache.match(key);
    if (hit) return hit;
    throw err;
  }
}
async function cacheFirst(req, name, max) {   // 地図の部品・地図の画像
  const cache = await caches.open(name), hit = await cache.match(req);
  if (hit) return hit;
  const r = await fetch(req);
  if (r.ok || r.type === 'opaque') {
    cache.put(req, r.clone());
    if (max && Math.random() < .05) cache.keys().then(ks => { for (let i = 0; i < ks.length - max; i++) cache.delete(ks[i]); });
  }
  return r;
}
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) { if (url.pathname.endsWith('/sw.js')) return; e.respondWith(appFirstNet(req)); }
  else if (url.hostname === 'cdn.jsdelivr.net') e.respondWith(cacheFirst(req, LIB));
  else if (url.hostname === 'tile.openstreetmap.org') e.respondWith(cacheFirst(req, TILES, TILE_MAX));
});
