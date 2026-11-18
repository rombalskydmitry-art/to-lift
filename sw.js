/* Service worker: приложение работает без интернета и обновляется само — чистить кеш не нужно.
   СБОРКА v2.9.0 — кнопка «+ добавить замечание», списки с удалением.
   Замечания выводятся под блоками акта приёмки и отдельными строками комиссионного акта.
   Один черновик не отправляется одновременно дважды; PDF не передаётся.

   Как это устроено:
   • Оболочка (index.html, main.js, data.js …) хранится в кеше «lift-shell-<отпечаток>» ЦЕЛИКОМ.
     Новая версия подставляется только когда скачаны ВСЕ файлы и их отпечаток изменился, — смеси
     старого index.html с новым main.js не бывает. Имя файла sw.js менять при выпуске версий не нужно.
   • Проверка обновлений идёт при открытии, при возврате в приложение и раз в 15 минут (с обходом
     HTTP-кеша). Если файлы на сервере изменились — страница получает сообщение и обновляется.
   • Тяжёлые данные (docs_text.json, ~15 МБ) лежат в отдельном кеше «lift-data», который
     переживает обновления; обновляются фоном через условный запрос (ETag), без повторной загрузки. */
var SHELL = ["index.html", "config.js", "main.js", "data.js", "act_form.js", "assets/lift-kompleks-logo.png", "vendor/html2canvas.min.js", "vendor/jspdf.umd.min.js"]; // обязательные файлы оболочки, логотип и PDF
var SHELL_OPT = ["manifest.webmanifest", "icon.svg"];      // необязательные (если нет на сервере — не мешают)
var SHELL_PREFIX = "lift-shell-", DATA_CACHE = "lift-data", META = "lift-meta";
var CHECK_EVERY = 60 * 1000, DATA_EVERY = 5 * 60 * 1000;

function hash(str) {
  var h = 2166136261;
  for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16);
}
function url(p) { return new URL(p, self.registration.scope).href; }
function relPath(u) { return decodeURIComponent(u.pathname.slice(new URL(self.registration.scope).pathname.length)); }

function currentName() {
  return caches.open(META).then(function (c) { return c.match("current"); }).then(function (r) { return r ? r.text() : null; });
}
function notify(msg) {
  return self.clients.matchAll({ includeUncontrolled: true }).then(function (cs) { cs.forEach(function (c) { c.postMessage(msg); }); });
}

var lastCheck = 0, checking = null;
function checkUpdate(force) {
  if (checking) return checking;
  if (!force && Date.now() - lastCheck < CHECK_EVERY) return Promise.resolve(false);
  lastCheck = Date.now();
  checking = doCheck().catch(function () { return null; }).then(function (r) { checking = null; return r; });
  return checking;
}
function doCheck() {
  var all = SHELL.concat(SHELL_OPT), got = {};
  return Promise.all(all.map(function (p) {
    // cache:"no-cache" — всегда сверяться с сервером, а не брать копию из HTTP-кеша браузера
    return fetch(new Request(url(p), { cache: "no-cache" })).then(function (r) { if (r.ok) got[p] = r; }).catch(function () {});
  })).then(function () {
    for (var i = 0; i < SHELL.length; i++) if (!got[SHELL[i]]) throw new Error("Не удалось скачать файлы обновления");
    var keys = Object.keys(got).sort();
    return Promise.all(keys.map(function (k) { return got[k].clone().text(); })).then(function (texts) {
      var ver = hash(keys.map(function (k, i) { return k + ":" + hash(texts[i]); }).join("|"));
      var name = SHELL_PREFIX + ver;
      return currentName().then(function (cur) {
        if (cur === name) return false;                                            // ничего не изменилось
        return caches.open(name).then(function (c) {
          return Promise.all(keys.map(function (k) { return c.put(url(k), got[k]); }));
        }).then(function () {
          return caches.open(META).then(function (m) { return m.put("current", new Response(name)); });
        }).then(function () {
          return caches.keys().then(function (ks) {                                 // старые оболочки и кеши прежних версий — удалить
            return Promise.all(ks.filter(function (k) {
              return (k.indexOf(SHELL_PREFIX) === 0 && k !== name) || k.indexOf("lift-to-") === 0;
            }).map(function (k) { return caches.delete(k); }));
          });
        }).then(function () { return notify({ type: "update", ver: ver, first: !cur }); }).then(function () { return true; });
      });
    });
  });
}

self.addEventListener("install", function (e) {
  e.waitUntil(checkUpdate(true).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(self.clients.claim());
});
self.addEventListener("message", function (e) {
  var d = e.data || {};
  if (d.type === "check") e.waitUntil(checkUpdate(true).then(function (changed) {
    return currentName().then(function (n) {
      if (e.source) e.source.postMessage({
        type: "checkResult", ok: changed !== null, updated: !!changed,
        ver: n ? n.slice(SHELL_PREFIX.length) : ""
      });
    });
  }));
  if (d.type === "ver") {
    e.waitUntil(currentName().then(function (n) {
      if (e.source) e.source.postMessage({ type: "ver", ver: n ? n.slice(SHELL_PREFIX.length) : "" });
    }));
  }
});

// оболочка: всегда из кеша (быстро и без интернета)
function shell(req, path) {
  return currentName().then(function (name) {
    if (!name) return fetch(req);
    return caches.open(name).then(function (c) { return c.match(url(path)); }).then(function (r) { return r || fetch(req); });
  });
}
// данные: из кеша сразу, в фоне — проверка обновления условным запросом (если файл не менялся, сервер отвечает 304 без тела)
var dataChecked = {};
function dataFetch(e) {
  var req = e.request;
  return caches.open(DATA_CACHE).then(function (c) {
    return c.match(req, { ignoreSearch: true }).then(function (hit) {
      function refresh() {
        var h = new Headers();
        if (hit) {
          var et = hit.headers.get("etag"), lm = hit.headers.get("last-modified");
          if (et) h.set("If-None-Match", et); else if (lm) h.set("If-Modified-Since", lm);
          else {                                  // валидаторов нет — не качаем файл целиком чаще раза в 12 часов
            var dt = Date.parse(hit.headers.get("date") || "");
            if (!dt || Date.now() - dt < 12 * 3600 * 1000) return Promise.resolve();
          }
        }
        return fetch(req.url, { headers: h, cache: "no-store" }).then(function (r) {
          if (r && r.status === 200) return c.put(req, r.clone()).then(function () { return r; });
          return r;
        });
      }
      if (hit) {
        if (!dataChecked[req.url] || Date.now() - dataChecked[req.url] > DATA_EVERY) {
          dataChecked[req.url] = Date.now();
          e.waitUntil(refresh().catch(function () {}));
        }
        return hit;
      }
      return refresh();
    });
  });
}

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var u = new URL(req.url);
  // запросы к таблице (script.google.com) и любые чужие домены — всегда в сеть
  if (u.origin !== self.location.origin) return;
  var path = relPath(u);
  if (req.mode === "navigate" || path === "") path = "index.html";
  if (path === "sw.js") return;                                       // сам воркер всегда проверяется по сети
  if (SHELL.indexOf(path) >= 0 || SHELL_OPT.indexOf(path) >= 0) {
    e.respondWith(shell(req, path));
    if (req.mode === "navigate") e.waitUntil(checkUpdate(false));      // открыли приложение — проверить обновления
    return;
  }
  e.respondWith(dataFetch(e));
});
