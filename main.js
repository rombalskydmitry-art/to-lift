/* Журнал ТО лифтов — офлайн PWA, v2.8.5
   v2.8.5: акт приёмки формируется на сервере в DOCX из точного шаблона;
   приложение отправляет только данные чек-листа, без PDF и base64.
   v2.8.4: ручная проверка сравнивает только хэш оболочки (без ложного сообщения
   об обновлении); после загрузки открывается новая навигация с меткой версии.
   v2.8.3: один черновик не может отправиться одновременно автоматически и вручную;
   повторный вызов присоединяется к уже выполняющемуся запросу.
   v2.8.2: обновление PWA применяется при смене service worker и после сообщения
   о готовой оболочке; добавлена защита от циклической перезагрузки.
   v2.8.1: при отправке акта приёмки приложение создаёт новый двухстраничный PDF
   тем же кодом, что печать, и передаёт его на сервер с меткой app-new-blank.
   v2.8.0: акт приёмки — подписи пунктов на печатном бланке берутся из файла
   «Названия пунктов — бланк акта приёмки.xlsx» (it.lab); фон бланка зачищен,
   подписи рисуются Carlito с кеглем оригинала, не влезает — ужим/перенос в 2 строки.
   v2.7.6: hotfix — main.js теперь вызывает __BOOT_DONE() после старта: без этого
   сторож запуска в index.html считал запуск неудачным и показывал ложную
   «Повреждён сохранённый пакет обновления» + бесконечно чистил кеш.
   v2.7.15: номер лифта в первом столбце комиссионного акта выровнен по центру.
   v2.7.14: фраза и адрес комиссионного акта уменьшены до 9 pt; отступ 7.5 mm.
   v2.7.13: фраза и адрес 10 pt в одну строку; исходный отступ слева.
   v2.7.12: фраза об осмотре и адрес в комиссионном акте — 10 pt.
   v2.7.11: блок адреса полностью повторяет шрифт, размер и интерлиньяж даты.
   v2.7.10: акт комиссионного осмотра — адрес 12 pt, полужирный курсив.
   v2.7.9: надёжное обновление PWA — точный результат проверки и актуальный номер сборки.
   v2.7.8: акт приёмки — поля 10 pt, замечания 9,5 pt; цифры даты 12 pt без сжатия года.
   v2.7.7: акт комиссионного осмотра — таблица 9 pt и компактные строки,
   дата выровнена вправо, поля и ширина таблицы приведены к DOCX-оригиналу.
   v2.7.5: акт приёмки — значения чек-листа печатаются ОДНИМ кеглем, без
   уменьшения; что не влезает в графу, уходит в свободные строки внизу раздела
   в формате «узел – что сделать» («Контакторы – требуется протяжка»), без кодов.
   v2.7.4: акт комиссионного осмотра — точная копия оригинала: Times New Roman
   во всех элементах, дата «от ДД.ММ.ГГГГ г.» в шапке справа как в образце,
   у подписей линия сверху, а надпись «(подпись, Ф.И.О.)» — под линией.
   v2.7.3: акт комиссионного осмотра воспроизводит фирменный образец с логотипом,
   шапкой и подписями; переносятся все замечания, комментарии и данные лифтов.
   v2.7.2: логотип закреплён в шапке; отдельное приложение к акту убрано,
   все замечания размещаются на бланке; «Скачать акт» формирует настоящий PDF.
   v2.7.1: печать — если всплывающая вкладка заблокирована (iPhone/PWA), форма
   сразу скачивается файлом вместо молчаливого window.print(); добавлен
   app/act_pdf_data.json — данные бланка для серверного PDF акта приёмки.
   v2.7: акт приёмки — в бланке вместо слова «ЗАМЕЧАНИЕ» печатается текст замечания
   из чек-листа (примечание к пункту; если пусто — «ЗАМЕЧАНИЕ»);
   акт комиссионного осмотра — замечания вида «узел — что сделать», без кодов пунктов.
   v2.1: fix Акт приёмки после «Обновить с Диска» (восстановление header),
   комментарии к блокам акта, печать/приложение.
   v2: вход по аккаунтам, сводка, печать акта, обязательные отметки, время ТО. */
(function () {
  "use strict";

  var DATA = window.APP_DATA;
  var screenEl = document.getElementById("screen");
  var titleEl = document.getElementById("title");
  var netEl = document.getElementById("net");
  var backEl = document.getElementById("btnBack");
  var statusEl = document.getElementById("statusbar");

  // Раскрывающиеся блоки сделаны на обычных div + button (не <details>): так они выглядят и работают
  // одинаково в Safari, Chrome и встроенных браузерах разных телефонов.
  function acc(title, count, body, opts) {
    opts = opts || {};
    return '<div class="module' + (opts.sub ? " sub" : "") + (opts.open ? " open" : "") + '"' + (opts.attrs || "") + '>' +
      '<button type="button" class="mHead" aria-expanded="' + (opts.open ? "true" : "false") + '">' +
      '<span class="mTitle">' + title + '</span>' + (count == null ? "" : '<span class="moduleCount"' + (opts.countAttrs || "") + '>' + count + '</span>') +
      '</button><div class="mBody">' + body + '</div></div>';
  }
  function setAcc(m, open) {
    m.classList.toggle("open", open);
    var h = m.querySelector(":scope > .mHead");
    if (h) h.setAttribute("aria-expanded", open ? "true" : "false");
  }
  document.addEventListener("click", function (e) {
    var h = e.target && e.target.closest ? e.target.closest(".mHead") : null;
    if (!h || !h.parentNode) return;
    setAcc(h.parentNode, !h.parentNode.classList.contains("open"));
  });
  // высота шапки нужна «липкой» полосе прогресса: у разных телефонов (вырез, 2 строки заголовка) она разная
  function syncTopbar() {
    var t = document.querySelector(".topbar");
    if (t) document.documentElement.style.setProperty("--topbar-h", t.offsetHeight + "px");
  }
  window.addEventListener("resize", syncTopbar);
  window.addEventListener("orientationchange", syncTopbar);
  if (window.ResizeObserver) { var tb0 = document.querySelector(".topbar"); if (tb0) new ResizeObserver(syncTopbar).observe(tb0); }
  syncTopbar();

  // ---------- хранилище ----------
  function lsGet(k, def) {
    try { var v = localStorage.getItem(k); return v === null ? def : JSON.parse(v); }
    catch (e) { return def; }
  }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  function drafts() { return lsGet("to_drafts", []); }
  function saveDrafts(a) { lsSet("to_drafts", a); }
  // Настройки. Адрес приёмника может задаваться двумя способами:
  // 1) в комплекте развёртывания (config.js, window.APP_ENDPOINT) — тогда он
  //    едет вместе с приложением и обновляется сам при автообновлении PWA;
  // 2) вручную на экране «Настройки» (если config.js не заполнен).
  // Bundled-адрес всегда имеет приоритет.
  function settings() {
    var s = lsGet("to_settings", { endpoint: "", org: "" });
    if (window.APP_ENDPOINT && window.APP_ENDPOINT.indexOf("ВСТАВИТЬ") < 0) s.endpoint = window.APP_ENDPOINT;
    return s;
  }
  function account() { return lsGet("to_account", null); }
  function isAdmin() { var a = account(); return a && a.role === "admin"; }

  // Единый реестр участков. Старые написания принимаются только как псевдонимы.
  var AREAS = [
    { name:"Грин-1", aliases:["грин-1", "грин 1", "грин1", "гринландия-1", "гринландия 1", "гринландия1"] },
    { name:"Грин-2", aliases:["грин-2", "грин 2", "грин2", "гринландия-2", "гринландия 2", "гринландия2"] },
    { name:"Чистое небо", aliases:["чистое небо", "чистоенебо"] },
    { name:"Город Звезд", aliases:["город звезд", "город-звезд", "городзвезд", "город звёзд", "город-звёзд", "саратовка", "новосаратовка", "ново-саратовка", "ново саратовка"] },
    { name:"Третий", aliases:["третий", "3 участок", "участок 3", "третий участок"] }
  ];
  function normArea(s) {
    return String(s || "").toLowerCase().replace(/ё/g, "е").replace(/[_.\-–—]/g, " ").replace(/\s+/g, " ").trim();
  }
  function canonicalArea(s) {
    var n = normArea(s);
    for (var i = 0; i < AREAS.length; i++) if (AREAS[i].aliases.indexOf(n) >= 0) return AREAS[i].name;
    return String(s || "").trim();
  }
  function formsCache() { return lsGet("to_forms_by_area", {}); }
  // № пункта мог сохраниться в таблице участка как дата (Sheets превращает «1.1» в 01.01)
  // и вернуться строкой вида «Thu Jan 01 2026 …» — приводим обратно к виду «1.1»
  function cleanId(id) {
    var s = String(id == null ? "" : id).trim();
    if (/GMT[+-]\d{4}|^\d{4}-\d{2}-\d{2}T/.test(s)) {
      var d = new Date(s);
      if (!isNaN(d)) return d.getDate() + "." + (d.getMonth() + 1);
    }
    return s;
  }
  function normalizeForms(forms) {
    // Встроенная форма «Акт приёмки» — источник header/title: таблица с Диска
    // отдаёт только sections/items, без шапки объекта. Без header приложение
    // уходит в выбор лифта вместо экрана «Объект приёмки».
    var builtinAct = null;
    (DATA.forms || []).forEach(function (bf) {
      if (bf.type === "Акт приёмки") builtinAct = bf;
    });
    (forms || []).forEach(function (f) {
      (f.sections || []).forEach(function (s) {
        (s.items || []).forEach(function (it) { it.id = cleanId(it.id); });
      });
      if (f.type === "Акт приёмки" && builtinAct) {
        if (!f.header || !f.header.length) f.header = builtinAct.header;
        if (!f.title) f.title = builtinAct.title;
      }
    });
    return forms;
  }
  function formsForArea(area) {
    var c = formsCache()[canonicalArea(area)];
    return normalizeForms(c && c.forms && c.forms.length ? c.forms : DATA.forms);
  }
  function findForm(formType, area) {
    return formsForArea(area).find(function (x) { return x.type === formType; }) || null;
  }
  function activeArea() {
    var a = account() || {};
    return canonicalArea(isAdmin() ? (state.formArea || "Третий") : a.u);
  }
  function refreshForms(area) {
    area = canonicalArea(area || activeArea());
    if (!navigator.onLine || !settings().endpoint || !area) return Promise.resolve(false);
    var acc = account() || {};
    return api({ what:"forms", area:area, login:acc.login || "", pwd:acc.pwd || "" }).then(function (r) {
      if (!r.ok || !r.forms || !r.forms.length) return false;
      var cache = formsCache();
      cache[canonicalArea(r.area || area)] = { t:Date.now(), forms:normalizeForms(r.forms) };
      lsSet("to_forms_by_area", cache);
      return true;
    }).catch(function () { return false; });
  }

  // справочник лифтов: synced-версия поверх встроенной
  var syncedLifts = lsGet("to_lifts", null);
  if (syncedLifts && syncedLifts.length) DATA.lifts = syncedLifts;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  var state = { view: "home", form: null, lift: null, stack: [] };
  var DRAFT_KEY = "to_current";

  // ---------- API (чтение из таблицы) ----------
  function api(params) {
    var ep = settings().endpoint;
    if (!ep) return Promise.reject(new Error("no-endpoint"));
    var q = Object.keys(params).map(function (k) {
      return encodeURIComponent(k) + "=" + encodeURIComponent(params[k]);
    }).join("&");
    return fetch(ep + "?" + q, { method: "GET", mode: "cors" }).then(function (r) { return r.json(); });
  }

  // ---------- навигация ----------
  function go(view, params) {
    state.stack.push({ view: state.view, form: state.form, lift: state.lift });
    render(view, params);
  }
  function back() {
    var p = state.stack.pop() || { view: "home", form: null, lift: null };
    render(p.view, {}, true);
  }
  backEl.addEventListener("click", back);

  function render(view, params, keepStack) {
    if (!keepStack && view !== state.view) state.view = view;
    state.view = view;
    backEl.classList.toggle("hidden", view === "home" || view === "login");
    window.scrollTo(0, 0);
    ({
      login: renderLogin,
      home: renderHome,
      forms: renderForms,
      lift: renderLift,
      actheader: renderActHeader,
      checklist: renderChecklist,
      outbox: renderOutbox,
      svodka: renderSvodka,
      docs: renderDocs,
      assistant: renderAssistant,
      docadd: renderDocAdd,
      liftcard: renderLiftCard,
      inspections: renderInspections,
      settings: renderSettings
    })[view](params || {});
    updateNet();
  }

  // ---------- общие элементы ----------
  function toast(msg) {
    var t = document.getElementById("toast");
    t.textContent = msg; t.style.opacity = "1";
    clearTimeout(t._h); t._h = setTimeout(function () { t.style.opacity = "0"; }, 2600);
  }

  function updateNet() {
    var on = navigator.onLine;
    netEl.textContent = on ? "онлайн" : "офлайн";
    netEl.classList.toggle("on", on);
    var q = drafts().filter(function (d) { return d.status !== "sent"; }).length;
    statusEl.textContent = q > 0 ? "Неотправленных осмотров: " + q : "";
  }
  window.addEventListener("online", function () { updateNet(); flushProfile(); syncAll(); flushDocsQueue(); });
  window.addEventListener("offline", updateNet);

  // гарантированный отклик нажатия на сенсорных экранах: класс .pressed на время касания
  document.addEventListener("touchstart", function (e) {
    var t = e.target;
    var b = t && t.closest ? t.closest(".btn,.tgl,.miniBtn,.aiMode,.aiExample,.aiSaveDoc") : null;
    if (!b) return;
    b.classList.add("pressed");
    var off = function () { b.classList.remove("pressed"); };
    document.addEventListener("touchend", off, { once: true });
    document.addEventListener("touchcancel", off, { once: true });
    setTimeout(off, 600);
  }, { passive: true });

  function fmtTime(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d)) return String(iso);
    var p = function (n) { return (n < 10 ? "0" : "") + n; };
    return p(d.getHours()) + ":" + p(d.getMinutes());
  }

  // ---------- ВХОД ----------
  function renderLogin() {
    titleEl.textContent = "Вход";
    var saved = account();
    screenEl.innerHTML =
      '<div class="card"><h2>Аккаунт</h2>' +
      '<p class="hint">Введите логин и пароль своего участка.</p></div>' +
      '<label>Логин</label><input type="text" id="lLogin" autocomplete="username" value="' + esc(saved ? saved.login : "") + '">' +
      '<label>Пароль</label><input type="password" id="lPwd" autocomplete="current-password">' +
      '<button class="btn primary" id="lGo" style="margin-top:16px">Войти</button>' +
      (saved ? '<button class="btn" id="lOffline">Работать офлайн<small>как ' + esc(saved.name || saved.login) + " (" + esc(saved.u || "админ") + ")</small></button>" : "") +
      '<button class="btn" id="lSet">Настройки подключения<small>Ссылка на скрипт таблицы</small></button>';
    function tryLogin(offline) {
      var login = document.getElementById("lLogin").value.trim();
      var pwd = document.getElementById("lPwd").value;
      if (!login) { toast("Введите логин"); return; }
      if (offline && saved && saved.login === login) {
        state.stack = []; render("home"); return;
      }
      if (!navigator.onLine) { toast("Нет связи — доступен вход «Работать офлайн» для сохранённого аккаунта"); return; }
      api({ what: "auth", login: login, pwd: pwd }).then(function (r) {
        if (!r.ok) { toast("Отказ: " + (r.error || "проверьте логин и пароль")); return; }
        lsSet("to_account", { login: login, pwd: pwd, role: r.role, u: canonicalArea(r.u || ""), z: r.z || "", name: r.name || login });
        toast("Вошли как " + (r.name || login));
        refreshLifts();
        if (r.role !== "admin") refreshForms(r.u);
        state.stack = []; render("home");
      }).catch(function () { toast("Не удалось связаться со скриптом — проверьте ссылку в настройках"); });
    }
    document.getElementById("lGo").onclick = function () { tryLogin(false); };
    var lo = document.getElementById("lOffline");
    if (lo) lo.onclick = function () { tryLogin(true); };
    document.getElementById("lSet").onclick = function () { go("settings"); };
  }

  // ---------- ГЛАВНАЯ ----------
  function renderHome() {
    var acc = account();
    titleEl.textContent = "Журнал ТО лифтов";
    var q = drafts().filter(function (d) { return d.status !== "sent"; }).length;
    var html = '<div class="card"><div class="row"><div><h2>' + esc(acc ? (acc.name || acc.login) : "Без аккаунта") + "</h2>" +
      '<p class="hint">' + (acc ? (isAdmin() ? "Администратор · все участки" : "Участок: " + esc(acc.u || "—")) : "Войдите, чтобы работать с таблицей") + "</p></div>" +
      '<button class="btn" id="bChange" style="width:auto;padding:8px 14px;font-size:.85rem">' + (acc ? "Сменить" : "Войти") + "</button></div></div>" +
      ((acc && acc.name && acc.name !== acc.login && settings().org) ? "" :
        '<div class="card" style="border-color:var(--bad);background:var(--bad-soft)"><p class="hint">' +
        '<b>Заполните настройки:</b> укажите свои фамилию и инициалы и обслуживающую организацию — ' +
        'это обязательно, данные подставляются в осмотры и акты.</p></div>') +
      '<button class="btn primary" id="bNew">Заполнить чек-лист<small>Ежемесячное · Квартальное · Полугодовое · Годовое · Акт приёмки</small></button>' +
      '<button class="btn" id="bSvodka">Сводка<small>Состояние лифтов из таблицы' + (isAdmin() ? "" : " (ваш участок)") + "</small></button>" +
      '<button class="btn" id="bDocs">Документация<small>Библиотека: РЭ, схемы, паспорта, ГОСТы · можно пополнять</small></button>' +
      '<button class="btn primary" id="bAI">Помощь ИИ<small>Вопрос по документации · чтение файлов · поиск в интернете</small></button>';
    if (isAdmin()) html += '<button class="btn" id="bInsp">Осмотры<small>Все осмотры: даты, исполнители, время начала и конца ТО</small></button>';
    html += '<button class="btn" id="bOutbox">Исходящие записи' + (q ? " (" + q + ")" : "") + "<small>Осмотры, ожидающие отправки</small></button>" +
      '<button class="btn" id="bSet">Настройки<small>Подключение таблицы, организация</small></button>';
    screenEl.innerHTML = html;
    document.getElementById("bNew").onclick = function () { state.stack = []; go("forms"); };
    document.getElementById("bSvodka").onclick = function () { state.stack = []; go("svodka"); };
    document.getElementById("bDocs").onclick = function () { state.stack = []; go("docs"); };
    document.getElementById("bAI").onclick = function () { state.stack = []; go("assistant"); };
    if (isAdmin()) document.getElementById("bInsp").onclick = function () { state.stack = []; go("inspections"); };
    document.getElementById("bOutbox").onclick = function () { state.stack = []; go("outbox"); };
    document.getElementById("bSet").onclick = function () { state.stack = []; go("settings"); };
    document.getElementById("bChange").onclick = function () { state.stack = []; go("login"); };
  }

  // ---------- ВЫБОР ВИДА ТО ----------
  function renderForms() {
    titleEl.textContent = "Вид технического обслуживания";
    if (isAdmin() && !state.formArea) state.formArea = "Третий";
    var area = activeArea(), forms = formsForArea(area);
    var html = '<div class="card"><h2>Чек-листы участка</h2>';
    if (isAdmin()) {
      html += '<label>Участок</label><select id="fArea">' + AREAS.map(function (a) {
        return '<option value="' + esc(a.name) + '"' + (a.name === area ? " selected" : "") + '>' + esc(a.name) + '</option>';
      }).join("") + '</select>';
    } else html += '<p class="hint">' + esc(area) + '</p>';
    html += '<p class="hint">Пункты редактируются в отдельной Google-таблице участка на Диске.</p>' +
      '<button class="btn" id="fRefresh">Обновить чек-листы с Диска</button></div><div class="list">';
    forms.forEach(function (f) {
      var n = f.sections.reduce(function (a, s) { return a + s.items.length; }, 0);
      html += '<button class="btn" data-t="' + esc(f.type) + '">' + esc(f.type) +
        "<small>" + esc(f.title) + " · " + n + " пунктов</small></button>";
    });
    html += "</div>";
    screenEl.innerHTML = html;
    var fa = document.getElementById("fArea");
    if (fa) fa.onchange = function () { state.formArea = canonicalArea(fa.value); renderForms({ refresh:true }); };
    document.getElementById("fRefresh").onclick = function () {
      toast("Загружаю чек-листы участка…");
      refreshForms(area).then(function (ok) { toast(ok ? "Чек-листы обновлены" : "Не удалось обновить — показана сохранённая версия"); renderForms(); });
    };
    screenEl.querySelectorAll("button[data-t]").forEach(function (b) {
      b.onclick = function () {
        var f = findForm(b.getAttribute("data-t"), area);
        if (!f) { toast("Форма не найдена"); return; }
        // Подстраховка: после обновления с Диска у «Акт приёмки» может не быть header
        if ((!f.header || !f.header.length) && /при[её]мк/i.test(f.type || "")) {
          var builtin = (DATA.forms || []).find(function (bf) { return bf.type === "Акт приёмки"; });
          if (builtin && builtin.header) {
            f.header = builtin.header;
            if (!f.title) f.title = builtin.title;
          }
        }
        state.form = f;
        if (f.header && f.header.length) go("actheader", { form: f });
        else go("lift", { form: f });
      };
    });
    if (arguments[0] && arguments[0].refresh) refreshForms(area).then(function () { renderForms(); });
  }

  // ---------- ВЫБОР ЛИФТА ----------
  function myLifts() {
    var acc = account(), area = activeArea();
    if (acc && acc.role !== "admin" && !area) return [];
    if (!area) return DATA.lifts;
    return DATA.lifts.filter(function (l) { return canonicalArea(l.u) === area; });
  }

  // Строка оборудования лифта: "Станция + Привод (+ год)", "" если неизвестно
  function cfgFromLift(l) {
    if (!l || !l.e) return "";
    var parts = [];
    if (l.e.su) parts.push(l.e.su);
    if (l.e.pd) parts.push(l.e.pd);
    var s = parts.join(" + ");
    if (s && l.e.yr) s += " (" + l.e.yr + ")";
    return s;
  }

  // Найти лифт в справочнике по номеру (и адресу, если задан)
  function findLiftByNum(n, a) {
    n = String(n == null ? "" : n).trim();
    if (!n) return null;
    a = String(a == null ? "" : a).trim().toLowerCase();
    var pool = DATA.lifts || [];
    for (var i = 0; i < pool.length; i++) {
      if (String(pool[i].n).trim() !== n) continue;
      if (a && String(pool[i].a || "").trim().toLowerCase() !== a) continue;
      return pool[i];
    }
    return null;
  }

  function renderLift() {
    titleEl.textContent = state.form.type + " — выбор лифта";
    screenEl.innerHTML =
      '<input type="text" id="q" placeholder="Поиск: адрес или № лифта" autocomplete="off">' +
      '<div class="search-res list" id="res"></div>';
    var res = document.getElementById("res");
    var pool = myLifts();
    // grouped === true: адрес и парадная уже указаны в заголовках группы — в строке не повторяем
    function itemHtml(l, grouped) {
      var g = grouped === true;
      return '<div class="item" data-i="' + pool.indexOf(l) + '"><div class="t">№ ' + esc(l.n) + (g ? "" : ' · ' + esc(l.a)) +
        '</div><div class="s">' + esc(l.u) + (g ? "" : " · парадная " + esc(l.p)) + " · " + esc(l.g) + " кг</div></div>";
    }
    function bind() {
      res.querySelectorAll(".item").forEach(function (el) {
        el.onclick = function () {
          state.lift = pool[+el.getAttribute("data-i")];
          var d = lsGet(DRAFT_KEY, null);
          if (d && d.formType === state.form.type && d.lift && d.lift.n === state.lift.n) {
            if (confirm("Есть незавершённый осмотр этого лифта. Продолжить?")) {
              go("checklist", { draft: d }); return;
            }
          }
          lsSet(DRAFT_KEY, null);
          go("checklist", {});
        };
      });
    }
    // без поиска — весь список, сгруппированный: дом → парадная
    function showGrouped() {
      if (!pool.length) {
        res.innerHTML = '<div class="empty">Список лифтов пуст.<br>Откройте «Сводка» и нажмите «Обновить» (нужен интернет).</div>';
        return;
      }
      var houses = {}, order = [];
      pool.forEach(function (l) {
        var addr = String(l.a || "").trim() || "Адрес не указан";
        var p = String(l.p || "").trim();
        if (!houses[addr]) { houses[addr] = { ents: {}, entOrder: [] }; order.push(addr); }
        var h = houses[addr];
        if (!h.ents[p]) { h.ents[p] = []; h.entOrder.push(p); }
        h.ents[p].push(l);
      });
      order.sort(function (a, b) { return a.localeCompare(b, "ru", { numeric: true }); });
      res.innerHTML = order.map(function (addr) {
        var h = houses[addr];
        h.entOrder.sort(function (a, b) { return a.localeCompare(b, "ru", { numeric: true }); });
        var total = h.entOrder.reduce(function (n, p) { return n + h.ents[p].length; }, 0);
        var inner = h.entOrder.map(function (p) {
          var items = h.ents[p].map(function (x) { return itemHtml(x, true); }).join("");
          if (h.entOrder.length === 1 && p === "") return items;
          return acc(p ? "Парадная " + esc(p) : "Парадная не указана", h.ents[p].length, items, { sub: true });
        }).join("");
        return acc(esc(addr), total, inner);
      }).join("");
      bind();
    }
    function filter() {
      var q = document.getElementById("q").value.trim().toLowerCase();
      if (q.length < 2) { showGrouped(); return; }
      var list = pool.filter(function (l) {
        return (l.a + " " + l.n + " " + l.u).toLowerCase().indexOf(q) >= 0;
      }).slice(0, 60);
      res.innerHTML = list.length ? list.map(itemHtml).join("") : '<div class="empty">Ничего не найдено</div>';
      bind();
    }
    document.getElementById("q").addEventListener("input", filter);
    filter();
  }

  // ---------- ШАПКА АКТА ПРИЁМКИ (новый объект — ввод вручную) ----------
  function renderActHeader() {
    var f = state.form, acc = account() || {};
    titleEl.textContent = "Акт приёмки — объект";
    var h = '<div class="card"><h2>Объект приёмки</h2>' +
      '<p class="hint">Новый объект могут ещё не внести в справочник — заполните шапку вручную. ' +
      "Участок: " + esc(acc.u || "—") + ", заказчик: " + esc(acc.z || "—") + ".</p></div>";
    f.header.forEach(function (fld) {
      var type = fld.key === "g" ? "number" : "text";
      h += "<label>" + esc(fld.label) + '</label><input type="' + type + '" id="ah_' + fld.key + '" placeholder="' + esc(fld.ph || "") + '">';
    });
    h += '<button class="btn primary" id="ahGo" style="margin-top:16px">К чек-листу</button>';
    screenEl.innerHTML = h;
    document.getElementById("ahGo").onclick = function () {
      var vals = {};
      var ok = true;
      f.header.forEach(function (fld) {
        vals[fld.key] = document.getElementById("ah_" + fld.key).value.trim();
        if ((fld.key === "a" || fld.key === "n") && !vals[fld.key]) ok = false;
      });
      if (!ok) { toast("Заполните адрес и заводской №"); return; }
      state.lift = { u: acc.u || "", z: acc.z || "", a: vals.a, p: vals.p, n: vals.n, g: vals.g, model: vals.model };
      go("checklist", {});
    };
  }

  // ---------- ЧЕК-ЛИСТ ----------
  function itemType(it) { return it.type || "check"; }

  var LIFT_MODULES = [
    { key: "cabin", name: "Кабина" },
    { key: "shaft", name: "Шахта" },
    { key: "machine", name: "Машинное отделение" },
    { key: "pit", name: "Приямок" }
  ];
  function liftModule(section, it) {
    if (it.module && LIFT_MODULES.some(function (m) { return m.key === it.module; })) return it.module;
    if (section.module && LIFT_MODULES.some(function (m) { return m.key === section.module; })) return section.module;
    var s = String(section.name || "").toLowerCase(), t = String(it.node || "").toLowerCase() + " " + String(it.works || "").toLowerCase();
    if (/приям|буфер|ловител|натяжн.*устрой|маслосбор/.test(t)) return "pit";
    if (/крыша кабины|двери шахты|створк|замок дш|контакт дш|направляющ|противовес|вкладыш|шахт|этаж/.test(t)) return "shaft";
    if (/купе|кабин|приказн|фотореверс|поручен|зеркал|пол кабины|покрытие кабины|реверс дверей|привод дверей кабины/.test(t)) return "cabin";
    if (/станци|контроллер|электрооборуд|\bсу\b|плат[аы]|автомат|контактор|реле|леб[её]дк|тормоз|редуктор|подвеск|канат|рем[её]н|квш|гву|rbi|эвакуац|испытан|замер|изоляц|заземлен/.test(t)) return "machine";
    if (/приям/.test(s)) return "pit";
    if (/купе/.test(s)) return "cabin";
    if (/станци|леб[её]дк|испытан|замер|электрооборуд|канат/.test(s)) return "machine";
    return "shaft";
  }
  function checklistModules(f) {
    var map = {};
    LIFT_MODULES.forEach(function (m) { map[m.key] = { key:m.key, name:m.name, sections:[], ids:[] }; });
    f.sections.forEach(function (s) {
      var byModule = {};
      s.items.forEach(function (it) {
        var key = liftModule(s, it);
        if (!byModule[key]) byModule[key] = [];
        byModule[key].push(it);
        map[key].ids.push(it.id);
      });
      Object.keys(byModule).forEach(function (key) {
        map[key].sections.push({ name:s.name, items:byModule[key] });
      });
    });
    return LIFT_MODULES.map(function (m) { return map[m.key]; }).filter(function (m) { return m.ids.length; });
  }

  function renderChecklist(params) {
    var f = state.form, l = state.lift;
    titleEl.textContent = f.type + " · № " + l.n;
    var draft = params.draft || lsGet(DRAFT_KEY, null);
    var results = (draft && draft.results) || {};
    var comment = (draft && draft.comment) || "";
    var sectionComments = (draft && draft.sectionComments) || {};
    var date = (draft && draft.date) || new Date().toISOString().slice(0, 10);
    var model = (draft && draft.model) || l.model || "";
    var startedAt = (draft && draft.startedAt) || new Date().toISOString();
    var editId = (draft && draft.editId) || null;

    // обязательные к отметке пункты: check и state (count/floors — необязательны)
    var required = [];
    f.sections.forEach(function (s) {
      s.items.forEach(function (it) {
        if (itemType(it) === "check" || itemType(it) === "state") required.push(it.id);
      });
    });
    function val(id) { return (results[id] && results[id].v) || ""; }
    function noteOf(id) { return (results[id] && results[id].note) || ""; }
    function done() { return required.filter(function (id) { return val(id) !== ""; }).length; }

    var html = '<div class="card">' +
      '<div class="row"><div><h2>' + esc(l.a) + '</h2>' +
      '<p class="hint">Лифт № ' + esc(l.n) + ' · ' + esc(l.u) +
      (model ? " · " + esc(model) : "") + "</p></div></div>" +
      '<label>Дата проведения</label><input type="date" id="cDate" value="' + esc(date) + '"></div>' +
      '<div class="progress" id="prog"></div>';

    // Акт приёмки — строго в порядке печатной формы (СУ → Шахта → Приямок → Купе → Двери шахты),
    // без перегруппировки по модулям; остальные виды ТО — по модулям, как раньше
    var modules = f.header
      ? f.sections.map(function (s, i) {
          return { key: "sec" + i, name: s.name,
            sections: [{ name: "", items: s.items }],
            ids: s.items.map(function (it) { return it.id; }) };
        })
      : checklistModules(f);
    html += '<div class="clList">' +
      '<div class="moduleActions"><button class="miniBtn" id="modExpand">Развернуть все</button>' +
      '<button class="miniBtn" id="modCollapse">Свернуть все</button></div>';
    modules.forEach(function (m, mi) {
      html += '<div class="module' + (mi === 0 ? " open" : "") + '" data-module="' + m.key + '">' +
        '<button type="button" class="mHead" aria-expanded="' + (mi === 0 ? "true" : "false") + '">' +
        '<span class="mTitle">' + esc(m.name) + '</span><span class="moduleCount" data-mprog="' + m.key + '"></span></button><div class="mBody">';
      m.sections.forEach(function (s) {
        html += s.name ? '<div class="sec">' + esc(s.name) + "</div>" : "";
        s.items.forEach(function (it) {
          var t = itemType(it);
          var r = val(it.id);
          html += '<div class="check' + (required.indexOf(it.id) >= 0 && r === "" ? " miss" : "") + '" data-id="' + esc(it.id) + '" data-t="' + t + '"><div class="txt">' +
            '<div class="works">' + esc(it.id) + ". " + esc(it.node) + " — " + esc(it.works) + "</div>" +
            (it.req ? '<div class="req">Норма: ' + esc(it.req) + "</div>" : "");

          if (t === "check") {
            html += '<div class="note' + (r === "bad" ? "" : " hidden") + '"><input type="text" placeholder="Примечание при замечании" value="' + esc(noteOf(it.id)) + '"></div>';
          } else if (t === "state") {
            var own = r !== "" && it.options.indexOf(r) < 0;
            html += '<select class="st">' +
              '<option value="">— не отмечено —</option>' +
              it.options.map(function (o) {
                return '<option value="' + esc(o) + '"' + (!own && r === o ? " selected" : "") + ">" + esc(o) + (o === it.options[0] ? " (норма)" : "") + "</option>";
              }).join("") +
              '<option value="__own__"' + (own ? " selected" : "") + '>✎ Свой вариант…</option>' +
              "</select>" +
              '<div class="own' + (own ? "" : " hidden") + '"><input type="text" class="ownV" placeholder="Своё значение, напр.: не работает" value="' + (own ? esc(r) : "") + '"></div>' +
              '<div class="note"><input type="text" placeholder="Свой комментарий (необязательно)" value="' + esc(noteOf(it.id)) + '"></div>';
          } else if (t === "count") {
            html += '<input type="number" inputmode="numeric" min="0" class="num" placeholder="' + esc(it.ph || "значение") + '" value="' + esc(r) + '">';
          } else if (t === "floors") {
            html += '<input type="text" class="flr" placeholder="Этажи с замечаниями, напр.: 1, 7, 13" value="' + esc(r) + '">' +
              '<div class="req" style="margin-top:4px">Оставьте пустым, если замечаний нет</div>';
          }
          html += "</div>";

          if (t === "check") {
            html += '<div class="toggles">' +
              '<button class="tgl ok' + (r === "ok" ? " on" : "") + '" data-v="ok">✓</button>' +
              '<button class="tgl bad' + (r === "bad" ? " on" : "") + '" data-v="bad">✕</button>' +
              "</div>";
          }
          html += "</div>";
        });
      });
      // Свободный комментарий к блоку (разделу) — только для акта приёмки
      if (f.header) {
        var secKey = "А" + (mi + 1);
        var secCmt = sectionComments[secKey] || sectionComments[m.name] || "";
        html += '<div class="secComment" style="margin:12px 14px 6px;padding-top:10px;border-top:1px solid var(--line)">' +
          '<label style="font-size:.9rem;color:var(--muted)">Комментарий к блоку «' + esc(m.name) + '»</label>' +
          '<textarea class="secCmt" data-seckey="' + esc(secKey) + '" placeholder="Свободный комментарий по разделу (необязательно)…" rows="2">' + esc(secCmt) + '</textarea>' +
          '</div>';
      }
      html += '</div></div>';
    });
    html += '</div>'; // .clList

    html += '<label>Общий комментарий</label>' +
      '<textarea id="cComment" placeholder="Выявленные неисправности и замечания…">' + esc(comment) + "</textarea>" +
      '<button class="btn primary" id="bSave" style="margin-top:14px">Сохранить осмотр</button>' +
      '<button class="btn" id="bPrint">Печать<small>акта осмотра по печатной форме, с ведомостью замечаний</small></button>';
    screenEl.innerHTML = html;

    function refreshProg() {
      document.getElementById("prog").textContent = "Отмечено обязательных пунктов: " + done() + " из " + required.length;
      modules.forEach(function (m) {
        var ids = m.ids.filter(function (id) { return required.indexOf(id) >= 0; });
        var completed = ids.filter(function (id) { return val(id) !== ""; }).length;
        var el = document.querySelector('[data-mprog="' + m.key + '"]');
        if (el) el.textContent = completed + " / " + ids.length;
      });
    }
    refreshProg();
    document.getElementById("modExpand").onclick = function () {
      screenEl.querySelectorAll(".module").forEach(function (d) { setAcc(d, true); });
    };
    document.getElementById("modCollapse").onclick = function () {
      screenEl.querySelectorAll(".module").forEach(function (d) { setAcc(d, false); });
    };

    function readItem(el) {
      var id = el.getAttribute("data-id"), t = el.getAttribute("data-t");
      if (t === "check") return;
      var v = "", note = "";
      if (t === "state") {
        var sv = el.querySelector(".st").value;
        v = sv === "__own__" ? el.querySelector(".own .ownV").value.trim() : sv;
        note = el.querySelector(".note input").value;
      } else if (t === "count") {
        v = el.querySelector(".num").value;
      } else if (t === "floors") {
        v = el.querySelector(".flr").value.trim();
      }
      if (v === "") delete results[id];
      else results[id] = { v: v, note: note };
    }

    screenEl.querySelectorAll(".check").forEach(function (el) {
      var id = el.getAttribute("data-id");
      var t = el.getAttribute("data-t");

      if (t === "check") {
        el.querySelectorAll(".tgl").forEach(function (b) {
          b.onclick = function () {
            var v = b.getAttribute("data-v");
            var cur = val(id);
            var next = cur === v ? "" : v;
            if (next) results[id] = { v: next, note: next === "bad" ? noteOf(id) : "" };
            else delete results[id];
            b.classList.toggle("on", next === v);
            el.querySelector(".toggles ." + (v === "ok" ? "bad" : "ok")).classList.remove("on");
            el.querySelector(".note").classList.toggle("hidden", next !== "bad");
            if (next !== "bad") el.querySelector(".note input").value = "";
            el.classList.toggle("miss", next === "");
            saveCurrent();
            refreshProg();
          };
        });
        el.querySelector(".note input").addEventListener("input", saveCurrent);
      } else {
        el.addEventListener("input", function () {
          if (t === "state") {
            var sv = el.querySelector(".st").value;
            el.querySelector(".own").classList.toggle("hidden", sv !== "__own__");
            el.classList.toggle("miss", sv === "" || (sv === "__own__" && !el.querySelector(".own .ownV").value.trim()));
          }
          readItem(el);
          saveCurrent();
          refreshProg();
        });
        el.addEventListener("change", function () {
          readItem(el);
          saveCurrent();
          refreshProg();
        });
      }
    });

    function normalize() {
      Object.keys(results).forEach(function (k) {
        if (typeof results[k] === "string") results[k] = { v: results[k], note: "" };
      });
    }

    function collectSectionComments() {
      var sc = {};
      screenEl.querySelectorAll("textarea.secCmt").forEach(function (ta) {
        var key = ta.getAttribute("data-seckey");
        var v = (ta.value || "").trim();
        if (key && v) sc[key] = v;
      });
      return sc;
    }
    function saveCurrent() {
      normalize();
      screenEl.querySelectorAll(".check").forEach(readItem);
      normalize();
      lsSet(DRAFT_KEY, {
        formType: f.type, lift: l, model: model,
        date: document.getElementById("cDate").value,
        results: results, comment: document.getElementById("cComment").value,
        sectionComments: collectSectionComments(),
        startedAt: startedAt, editId: editId
      });
    }
    document.getElementById("cDate").addEventListener("change", saveCurrent);
    document.getElementById("cComment").addEventListener("input", saveCurrent);
    screenEl.querySelectorAll("textarea.secCmt").forEach(function (ta) {
      ta.addEventListener("input", saveCurrent);
    });

    document.getElementById("bSave").onclick = function () {
      saveCurrent();
      var d = lsGet(DRAFT_KEY, null);
      if (done() < required.length) {
        if (!confirm("Не отмечено обязательных пунктов: " + (required.length - done()) +
            ". Неотмеченные уйдут в таблицу ПУСТЫМИ. Сохранить так?")) return;
      }
      var a = drafts();
      var rec = {
        id: editId || Date.now().toString(36),
        created: new Date().toISOString(),
        status: "queue",
        formType: f.type, formTitle: f.title,
        lift: l, model: model, date: d.date, results: d.results, comment: d.comment,
        sectionComments: d.sectionComments || {},
        worker: (account() && account().name) || "",
        startedAt: startedAt, finishedAt: new Date().toISOString()
      };
      var i = a.findIndex(function (x) { return x.id === rec.id; });
      if (i >= 0) a[i] = rec; else a.push(rec);
      saveDrafts(a);
      lsSet(DRAFT_KEY, null);
      toast("Осмотр сохранён в исходящих");
      state.stack = [];
      render("outbox");
    };
    document.getElementById("bPrint").onclick = function () {
      saveCurrent();
      var d = lsGet(DRAFT_KEY, null) || {};
      printAct({
        formType: f.type, lift: l, model: model,
        date: d.date || date, results: d.results || {}, comment: d.comment || "",
        sectionComments: d.sectionComments || {},
        worker: (account() && account().name) || ""
      });
    };
  }

  function findItem(formType, id, area) {
    var f = findForm(formType, area || activeArea());
    if (!f) return null;
    for (var i = 0; i < f.sections.length; i++) {
      var items = f.sections[i].items;
      for (var j = 0; j < items.length; j++) if (items[j].id === id) return items[j];
    }
    return null;
  }

  // ---------- ИСХОДЯЩИЕ ----------
  function countBad(d) {
    return Object.keys(d.results || {}).filter(function (k) {
      var r = d.results[k];
      var it = findItem(d.formType, k, d.lift && d.lift.u);
      var t = it ? itemType(it) : "check";
      var v = r && r.v;
      if (t === "check") return v === "bad";
      if (t === "state") return v !== undefined && v !== "" && v !== it.options[0];
      if (t === "floors") return v !== undefined && v !== "";
      return false;
    }).length;
  }

  function renderOutbox() {
    titleEl.textContent = "Исходящие записи";
    var a = drafts();
    var pending = a.filter(function (d) { return d.status !== "sent"; });
    var sentList = a.filter(function (d) { return d.status === "sent"; }).slice().reverse();

    function itemHtml(d, isPending) {
      var st = d.status === "sent" ? '<span class="badge sent">отправлено</span>'
        : d.status === "fail" ? '<span class="badge fail">ошибка</span>'
        : '<span class="badge q">в очереди</span>';
      var bad = countBad(d);
      var b = "";
      if (d.status === "fail") b += '<button class="btn danger" data-re="' + d.id + '" style="margin-top:8px">Повторить отправку</button>';
      if (d.status === "sent") b += '<button class="btn" data-ed="' + d.id + '" style="margin-top:8px">Исправить<small>перезапишет данные в таблице</small></button>';
      b += '<button class="btn" data-pr="' + d.id + '" style="margin-top:8px">' +
        (d.formType === "Акт приёмки" ? "Печать акта" : "Печать") +
        '<small>по печатной форме, с ведомостью замечаний</small></button>';
      return '<div class="item' + (isPending ? " pending" : "") + '"><div class="row"><div class="t">' + esc(d.formType) + " · № " + esc(d.lift.n) +
        "</div>" + st + "</div>" +
        '<div class="s">' + esc(d.lift.a) + "<br>" + esc(d.date) + " · " + esc(d.worker || "—") +
        (d.startedAt ? " · " + fmtTime(d.startedAt) + "–" + fmtTime(d.finishedAt || d.startedAt) : "") +
        (bad ? " · замечаний: " + bad : "") + "</div>" + b + "</div>";
    }

    var html = "";
    if (!a.length) {
      html = '<div class="empty">Пока нет сохранённых осмотров.<br>Заполненные чек-листы будут появляться здесь.</div>';
    } else {
      if (drafts().some(function (d) { return d.formType === "Акт приёмки"; })) {
        html += '<button class="btn" id="bCommission" style="margin-top:12px">Акт комиссионного осмотра<small>по замечаниям из актов приёмки, по адресу</small></button>';
      }
      if (pending.length) {
        html += '<div class="sec" style="margin-top:0">Ждут отправки — уйдут сами при появлении интернета</div>' +
          '<div class="list">' + pending.slice().reverse().map(function (d) { return itemHtml(d, true); }).join("") + "</div>" +
          '<button class="btn primary" id="bSync">Отправить всё (' + pending.length + ")</button>";
      }
      if (sentList.length) {
        var byAddr = {}, order = [];
        sentList.forEach(function (d) {
          var addr = String((d.lift && d.lift.a) || "").trim() || "Адрес не указан";
          if (!byAddr[addr]) { byAddr[addr] = []; order.push(addr); }
          byAddr[addr].push(d);
        });
        order.sort(function (x, y) { return x.localeCompare(y, "ru", { numeric: true }); });
        html += '<div class="sec">Отправленные — по адресам</div>' + order.map(function (addr) {
          return acc(esc(addr), byAddr[addr].length, byAddr[addr].map(function (d) { return itemHtml(d, false); }).join(""));
        }).join("");
      }
    }
    screenEl.innerHTML = html;
    var bs = document.getElementById("bSync");
    if (bs) bs.onclick = function () { syncAll(true); };
    var bc = document.getElementById("bCommission");
    if (bc) bc.onclick = renderCommissionPicker;
    screenEl.querySelectorAll("[data-re]").forEach(function (b) {
      b.onclick = function () { syncOne(b.getAttribute("data-re"), true); };
    });
    screenEl.querySelectorAll("[data-ed]").forEach(function (b) {
      b.onclick = function () { editSent(b.getAttribute("data-ed")); };
    });
    screenEl.querySelectorAll("[data-pr]").forEach(function (b) {
      b.onclick = function () {
        var d = drafts().find(function (x) { return x.id === b.getAttribute("data-pr"); });
        if (d) printAct(d);
      };
    });
    autoSync();
  }

  // автоотправка очереди и профиля при появлении интернета (не чаще раза в минуту)
  var lastAutoSync = 0;
  function autoSync() {
    if (Date.now() - lastAutoSync < 60000) return;
    if (!navigator.onLine || !settings().endpoint) return;
    var p = profileInfo();
    var hasQueue = drafts().some(function (d) { return d.status !== "sent"; });
    if (!hasQueue && !(p && p.dirty)) return;
    lastAutoSync = Date.now();
    flushProfile();
    if (hasQueue) syncAll();
  }

  // вернуть отправленный осмотр в редактирование (повторная отправка перезапишет данные)
  function editSent(id) {
    var a = drafts();
    var i = a.findIndex(function (x) { return x.id === id; });
    if (i < 0) return;
    var d = a[i];
    var f = findForm(d.formType, d.lift && d.lift.u);
    if (!f) { toast("Форма не найдена"); return; }
    state.form = f;
    state.lift = d.lift;
    lsSet(DRAFT_KEY, {
      formType: d.formType, lift: d.lift, model: d.model || "",
      date: d.date, results: d.results || {}, comment: d.comment || "",
      sectionComments: d.sectionComments || {},
      startedAt: d.startedAt || new Date().toISOString(), editId: d.id
    });
    a.splice(i, 1);
    saveDrafts(a);
    state.stack = [];
    go("checklist", { draft: lsGet(DRAFT_KEY, null) });
  }

  // ---------- ОТПРАВКА ----------
  function payload(d) {
    var acc = account() || {};
    return {
      id: d.id, created: d.created, worker: d.worker, date: d.date,
      formType: d.formType, formTitle: d.formTitle,
      u: d.lift.u, z: d.lift.z, a: d.lift.a, p: d.lift.p, n: d.lift.n, g: d.lift.g,
      model: d.model || "", org: settings().org || "",
      startedAt: d.startedAt || "", finishedAt: d.finishedAt || "",
      login: acc.login || "", pwd: acc.pwd || "",
      items: Object.keys(d.results).map(function (k) {
        var r = d.results[k];
        var it = findItem(d.formType, k, d.lift && d.lift.u);
        var t = it ? itemType(it) : "check";
        var v = r.v;
        var bad;
        if (t === "check") bad = v === "bad";
        else if (t === "state") bad = v !== "" && v !== it.options[0];
        else if (t === "floors") bad = v !== "";
        else bad = false;
        // n/w — названия пункта для печатного акта на сервере
        return { id: k, k: t, v: v, bad: bad, note: r.note || "",
          n: it ? it.node : "", w: it ? it.works : "" };
      }),
      comment: d.comment || "",
      sectionComments: d.sectionComments || {}
    };
  }

  function payloadForSend_(d) {
    // Акт приёмки заполняется на сервере в DOCX из точного шаблона ACT_TEMPLATE_ID.
    // PDF и большие base64-вложения из приложения больше не передаются.
    return Promise.resolve(payload(d));
  }

  function send(p, ep) {
    // no-cors: ответ Google не читаем (он идёт через редирект),
    // но запрос гарантированно выполняется на стороне Apps Script.
    // Подтверждение — строка «запрос получен» на листе «Лог» в таблице.
    return fetch(ep, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(p)
    }).then(function () { return { ok: true }; });
  }

  // POST с чтением ответа — для ИИ-ассистента (text/plain не вызывает preflight).
  function sendForResponse(p) {
    var ep = settings().endpoint;
    if (!ep) return Promise.reject(new Error("no-endpoint"));
    return fetch(ep, {
      method: "POST", mode: "cors", redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(p)
    }).then(function (r) { return r.json(); });
  }

  var sendJobs_ = {};
  function syncOne(id, manual) {
    // Автосинхронизация, кнопка «повторить» и «отправить всё» могут сработать
    // одновременно. Второй вызов ждёт тот же запрос, а не шлёт осмотр заново.
    if (sendJobs_[id]) return sendJobs_[id];
    var ep = settings().endpoint;
    var a = drafts();
    var d = a.find(function (x) { return x.id === id; });
    if (!d || d.status === "sent") return Promise.resolve();
    if (!ep) {
      if (manual) toast("Сначала укажите ссылку на скрипт в Настройках");
      return Promise.resolve();
    }
    if (!navigator.onLine) {
      if (manual) toast("Нет связи — запись останется в очереди");
      return Promise.resolve();
    }
    var job = payloadForSend_(d).then(function (p) {
      return send(p, ep);
    }).then(function () {
      d.status = "sent"; saveDrafts(a);
      if (state.view === "outbox") render("outbox"); // не сбрасывать другие экраны
    }).catch(function (e) {
      d.status = "fail"; saveDrafts(a);
      if (state.view === "outbox") render("outbox");
      if (manual) toast(e && e.message ? e.message : "Не удалось отправить — попробуйте позже");
    });
    sendJobs_[id] = job;
    function clearJob() { delete sendJobs_[id]; }
    job.then(clearJob, clearJob);
    return job;
  }

  function syncAll(manual) {
    var a = drafts().filter(function (d) { return d.status !== "sent"; });
    if (!a.length) { if (manual) toast("Всё уже отправлено"); return; }
    if (!settings().endpoint) { if (manual) toast("Сначала укажите ссылку на скрипт в Настройках"); return; }
    if (!navigator.onLine) { if (manual) toast("Нет связи — записи останутся в очереди"); return; }
    toast("Отправляю " + a.length + "…");
    a.reduce(function (ch, d) {
      return ch.then(function () { return syncOne(d.id); });
    }, Promise.resolve()).then(function () {
      updateNet();
      var left = drafts().filter(function (d) { return d.status !== "sent"; }).length;
      toast(left ? "Не ушло: " + left + " — повторите позже" : "Всё отправлено ✓");
    });
  }

  // ---------- СВОДКА (просмотр из таблицы) ----------
  function svodkaCache() {
    var c = lsGet("to_svodka", null);
    if (c && c.rows) c.rows = normSvodkaRows(c.rows);
    return c;
  }
  // в старых строках сводки дата могла сохраниться текстом «Fri Nov 06 2026 16:20:13 GMT+0300 …» —
  // приводим к виду «06.11.2026»; заодно чистим ISO-строки
  function fmtCell(v) {
    if (typeof v !== "string") return v;
    if (!/GMT[+-]\d{4}|^\d{4}-\d{2}-\d{2}T/.test(v)) return v;
    var d = new Date(v);
    if (isNaN(d)) return v;
    return ("0" + d.getDate()).slice(-2) + "." + ("0" + (d.getMonth() + 1)).slice(-2) + "." + d.getFullYear();
  }
  function normSvodkaRows(rows) {
    return (rows || []).map(function (r) { return r.map(fmtCell); });
  }

  function renderSvodka(params) {
    titleEl.textContent = "Сводка" + (isAdmin() ? "" : " · " + ((account() || {}).u || ""));
    var cache = svodkaCache();
    var html = '<div class="card"><div class="row"><div><h2>Состояние лифтов</h2>' +
      '<p class="hint">' + (cache && cache.t
        ? "Обновлено: " + new Date(cache.t).toLocaleString()
        : "Данных ещё нет — нажмите «Обновить» (нужен интернет)") + "</p></div>" +
      '<button class="btn" id="svRef" style="width:auto;padding:8px 14px;font-size:.85rem">Обновить</button></div></div>' +
      '<input type="text" id="svQ" placeholder="Поиск: адрес или № лифта" autocomplete="off">' +
      '<div class="list" id="svRes" style="margin-top:8px"></div>';
    if (isAdmin() && cache && cache.rows && cache.rows.length) {
      html += '<button class="btn" id="svPrint">Печать списка<small>Вся сводка компактным списком</small></button>';
    }
    screenEl.innerHTML = html;

    function draw(q) {
      var res = document.getElementById("svRes");
      if (!cache || !cache.rows) { res.innerHTML = '<div class="empty">Нет данных</div>'; return; }
      var hU = cache.headers.indexOf("Участок"), hA = cache.headers.indexOf("Адрес"),
          hN = cache.headers.indexOf("№ лифта"), hV = cache.headers.indexOf("Вид ТО (последнее)"),
          hD = cache.headers.indexOf("Дата последнего ТО"), hP = cache.headers.indexOf("№ парадной");
      var list = cache.rows.map(function (r, i) { return { r: r, i: i }; });
      function itemHtml(x) {
        return '<div class="item" data-i="' + x.i + '"><div class="t">№ ' + esc(x.r[hN]) + " · " + esc(x.r[hA]) + "</div>" +
          '<div class="s">' + esc(x.r[hU]) + (x.r[hV] ? " · " + esc(x.r[hV]) + " " + esc(x.r[hD]) : "") + "</div></div>";
      }
      function bind() {
        res.querySelectorAll(".item").forEach(function (el) {
          el.onclick = function () { go("liftcard", { idx: +el.getAttribute("data-i") }); };
        });
      }
      // при поиске — плоский список совпадений
      if (q) {
        q = q.toLowerCase();
        list = list.filter(function (x) {
          return (String(x.r[hA]) + " " + String(x.r[hN])).toLowerCase().indexOf(q) >= 0;
        });
        res.innerHTML = list.length ? list.slice(0, 80).map(itemHtml).join("") : '<div class="empty">Ничего не найдено</div>';
        bind();
        return;
      }
      // без поиска — группировка: дом → парадная, раскрывающиеся блоки
      var houses = {}, order = [];
      list.forEach(function (x) {
        var addr = String(x.r[hA] || "").trim() || "Адрес не указан";
        var p = hP >= 0 ? String(x.r[hP] || "").trim() : "";
        if (!houses[addr]) { houses[addr] = { ents: {}, entOrder: [] }; order.push(addr); }
        var h = houses[addr];
        if (!h.ents[p]) { h.ents[p] = []; h.entOrder.push(p); }
        h.ents[p].push(x);
      });
      order.sort(function (a, b) { return a.localeCompare(b, "ru", { numeric: true }); });
      res.innerHTML = order.length ? order.map(function (addr) {
        var h = houses[addr];
        h.entOrder.sort(function (a, b) { return a.localeCompare(b, "ru", { numeric: true }); });
        var total = h.entOrder.reduce(function (n, p) { return n + h.ents[p].length; }, 0);
        var inner = h.entOrder.map(function (p) {
          var items = h.ents[p].map(itemHtml).join("");
          // единственная парадная без номера — не показываем лишний уровень
          if (h.entOrder.length === 1 && p === "") return items;
          return acc(p ? "Парадная " + esc(p) : "Парадная не указана", h.ents[p].length, items, { sub: true });
        }).join("");
        return acc(esc(addr), total,
          '<div style="padding:10px 12px 2px"><button class="miniBtn" data-xls="' + esc(addr) + '">Скачать Excel по дому</button></div>' + inner);
      }).join("") : '<div class="empty">Ничего не найдено</div>';
      bind();
      res.querySelectorAll("[data-xls]").forEach(function (btn) {
        btn.onclick = function () { exportHouse(btn.getAttribute("data-xls")); };
      });
    }
    draw("");
    document.getElementById("svQ").addEventListener("input", function () { draw(this.value.trim()); });

    function refresh() {
      if (!navigator.onLine) { toast("Нет связи"); return; }
      var acc = account() || {};
      toast("Загрузка сводки…");
      api({ what: "svodka", login: acc.login || "", pwd: acc.pwd || "" }).then(function (r) {
        if (!r.ok) { toast("Отказ: " + (r.error || "")); return; }
        lsSet("to_svodka", { t: Date.now(), headers: r.headers, rows: normSvodkaRows(r.rows) });
        renderSvodka();
      }).catch(function () { toast("Не удалось загрузить сводку"); });
    }
    document.getElementById("svRef").onclick = refresh;
    var sp = document.getElementById("svPrint");
    if (sp) sp.onclick = function () { printSvodkaList(cache); };
    if (params.refresh) refresh();
  }

  // ---------- КАРТОЧКА ЛИФТА (из сводки) ----------
  var SVODKA_MODULE_NAMES = { cabin:"Кабина", shaft:"Шахта", machine:"Машинное отделение", pit:"Приямок", other:"Прочее" };
  function svodkaModule(h) {
    h = String(h || "").toLowerCase();
    if (/купе|реверс дверей|привод дверей кабины/.test(h)) return "cabin";
    if (/приямок|буфер|ловител|натяжное устройство/.test(h)) return "pit";
    if (/шахта|противовес|вкладыш|концевые|направляющ|датчики позиционирования/.test(h)) return "shaft";
    if (/гву|rbi|\bос\b|лебедка|квш|тормоз|ремни|перпасовка|канаты|эвакуация/.test(h)) return "machine";
    return "other";
  }
  function svodkaValue(v, lastDate) {
    if (v === "" || v === null || v === undefined) return "—";
    var s = String(v).trim();
    if (s === "+" || /^(вс[её]|все)?\s*работает$/i.test(s) || /^вс[её] в норме$/i.test(s)) return lastDate || "—";
    return s;
  }
  function groupedSvodkaRows(headers, r) {
    var groups = { cabin:[], shaft:[], machine:[], pit:[], other:[] };
    var lastDate = r[headers.indexOf("Дата последнего ТО")] || "";
    var skip = ["Участок","Заказчик","Адрес","№ парадной","№ лифта","Г/П, кг","Вид ТО (последнее)","Дата последнего ТО","Комментарии"];
    headers.forEach(function (h, i) {
      h = String(h || "").trim();
      if (!h || skip.indexOf(h) >= 0) return;
      groups[svodkaModule(h)].push([h, svodkaValue(r[i], lastDate)]);
    });
    return Object.keys(groups).filter(function (k) { return groups[k].length; }).map(function (k) {
      return { key:k, name:SVODKA_MODULE_NAMES[k], rows:groups[k] };
    });
  }
  function renderLiftCard(params) {
    var cache = svodkaCache();
    if (!cache) { render("svodka"); return; }
    var r = cache.rows[params.idx];
    var hN = cache.headers.indexOf("№ лифта"), hA = cache.headers.indexOf("Адрес");
    titleEl.textContent = "№ " + r[hN];
    var mLift = findLiftByNum(r[hN], r[hA]);
    var cfg = cfgFromLift(mLift);
    var groups = groupedSvodkaRows(cache.headers, r);
    screenEl.innerHTML =
      '<div class="card"><h2>' + esc(r[hA]) + '</h2><p class="hint">Лифт № ' + esc(r[hN]) + " · " +
      esc(r[cache.headers.indexOf("Участок")]) + " · " + esc(r[cache.headers.indexOf("Г/П, кг")]) + " кг<br>" +
      esc(r[cache.headers.indexOf("Вид ТО (последнее)")]) + " · " + esc(r[cache.headers.indexOf("Дата последнего ТО")]) + '<br>' +
      (cfg ? 'Оборудование: <b>' + esc(cfg) + '</b>' : 'Оборудование не указано') + '</p></div>' +
      groups.map(function (g) {
        return acc(esc(g.name), g.rows.length, g.rows.map(function (x) {
          return '<div class="item"><div class="t" style="font-size:.9rem">' + esc(x[0]) + '</div><div class="s">' + esc(x[1]) + '</div></div>';
        }).join(""), { open: true });
      }).join("") +
      '<button class="btn primary" id="lcPrint">Печать карточки</button>';
    document.getElementById("lcPrint").onclick = function () {
      printSvodkaLift(cache.headers, r);
    };
  }

  // ---------- ОСМОТРЫ (только админ) ----------
  function renderInspections(params) {
    titleEl.textContent = "Осмотры (таблица)";
    var cache = lsGet("to_insp", null);
    var html = '<div class="card"><div class="row"><div><h2>Журнал осмотров</h2>' +
      '<p class="hint">' + (cache && cache.t ? "Обновлено: " + new Date(cache.t).toLocaleString() : "Нет данных") + "</p></div>" +
      '<button class="btn" id="inRef" style="width:auto;padding:8px 14px;font-size:.85rem">Обновить</button></div></div>' +
      '<div class="list" id="inRes"></div>';
    screenEl.innerHTML = html;
    function draw() {
      var res = document.getElementById("inRes");
      if (!cache || !cache.rows || !cache.rows.length) { res.innerHTML = '<div class="empty">Нет данных</div>'; return; }
      var H = cache.headers;
      var col = function (n) { return H.indexOf(n); };
      var cD = col("Дата ТО"), cV = col("Вид ТО"), cA = col("Адрес"), cN = col("№ лифта"),
          cW = col("Исполнитель"), cB = col("Начало ТО"), cE = col("Окончание ТО"),
          cBad = col("Замечаний"), cAcc = col("Аккаунт");
      res.innerHTML = cache.rows.slice().reverse().slice(0, 100).map(function (r) {
        return '<div class="item"><div class="t" style="font-size:.92rem">' + esc(r[cV]) + " · № " + esc(r[cN]) + "</div>" +
          '<div class="s">' + esc(r[cA]) + "<br>" + esc(r[cD]) + " · " + esc(r[cW]) +
          (r[cAcc] ? " (" + esc(r[cAcc]) + ")" : "") +
          "<br>ТО: " + esc(fmtTime(r[cB])) + " – " + esc(fmtTime(r[cE])) +
          (String(r[cBad]) !== "0" && r[cBad] !== "" ? " · замечаний: " + esc(r[cBad]) : " · без замечаний") + "</div></div>";
      }).join("");
    }
    draw();
    document.getElementById("inRef").onclick = function () {
      if (!navigator.onLine) { toast("Нет связи"); return; }
      var acc = account() || {};
      toast("Загрузка…");
      api({ what: "inspections", login: acc.login || "", pwd: acc.pwd || "" }).then(function (r) {
        if (!r.ok) { toast("Отказ: " + (r.error || "")); return; }
        lsSet("to_insp", { t: Date.now(), headers: r.headers, rows: r.rows });
        renderInspections();
      }).catch(function () { toast("Не удалось загрузить"); });
    };
  }

  // ---------- ДОКУМЕНТЫ (библиотека, этап 1 базы знаний) ----------
  function docsCache() { return lsGet("to_docs", null); }
  function docsQueue() { return lsGet("to_docs_queue", []); }
  function saveDocsQueue(a) { lsSet("to_docs_queue", a); }
  // Документ «доступен по ключам», если в ключевых словах есть участок работника,
  // пометка «все участки» или «Мурино» (общая библиотека Грин-1 и Грин-2).
  function docAllowedForArea(r, cK, area) {
    if (!area) return true; // администратор видит всё
    var kw = normArea(r[cK]);
    if (kw.indexOf("все участки") >= 0) return true;
    var canon = canonicalArea(area);
    if ((canon === "Грин-1" || canon === "Грин-2") && kw.indexOf("мурино") >= 0) return true;
    return AREAS.some(function (a) {
      return a.name === canon && a.aliases.some(function (alias) { return kw.indexOf(alias) >= 0; });
    });
  }
  // Подписки участков: {ID документа: [участки]} — карта приходит с сервера
  // вместе с реестром (лист «Подписки»). Подключение — свободное, без
  // согласования с администратором: нажал «На мой участок» — документ видит
  // вся бригада.
  function docsSubs() { var c = docsCache(); return (c && c.subs) || {}; }
  function myAreaName() { var acc = account() || {}; return acc.u ? canonicalArea(acc.u) : ""; }
  function docSubscribed(r, cI) {
    var my = myAreaName();
    if (!my || cI < 0) return false;
    var arr = docsSubs()[String(r[cI])] || [];
    return arr.indexOf(my) >= 0;
  }
  // Документ «на участке», если он попал по ключевым словам или участок на него подписан.
  function docOnArea(r, cK, cI) {
    return docAllowedForArea(r, cK, (account() || {}).u) || docSubscribed(r, cI);
  }

  // ---------- ПОИСК ПО ДОКУМЕНТАМ: нормализация, основы слов, ранжирование ----------
  // В текстах документов (после распознавания PDF) кириллица и латиница перемешаны: «Р03.13» с русской Р,
  // «Пapaмeтpы» с латинскими a/p/e. Поэтому и текст, и запрос приводятся к одной «свёрнутой» записи:
  // строчные буквы, ё=е, латинские двойники русских букв заменены русскими. Замена посимвольная,
  // длина строки не меняется — позиции в свёрнутом и исходном тексте совпадают, сниппет берём из исходного.
  var DS = (function () {
    var HG = { a: "а", b: "в", c: "с", e: "е", h: "н", k: "к", m: "м", o: "о", p: "р", t: "т", x: "х", y: "у" };
    var TR = { "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ж": "zh", "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m", "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u", "ф": "f", "х": "h", "ц": "c", "ч": "ch", "ш": "sh", "щ": "sch", "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu", "я": "ya" };
    // одно и то же оборудование пишут по-разному (кириллица/латиница) — те же группы, что на сервере
    var BR = [["уэл", "uel", "welmaks"], ["астар", "astar", "as320", "as620", "as380"], ["кеб", "keb"], ["эмотрон", "emotron"],
      ["авв", "abb"], ["шулм", "shulm"], ["смарт", "smart"], ["hpmont", "нрмонт", "hd5l"], ["отис", "otis", "gecb", "lcbii"],
      ["вакон", "vacon"], ["фудзи", "fuji"], ["веспер", "vesper"], ["яскава", "yaskawa"], ["дельта", "delta"]];
    var STOP = {};
    ("и в во на по с со к ко из за от до не но а же ли бы что как где это или при для над под про его ее она они оно мы вы я у о об")
      .split(" ").forEach(function (w) { STOP[w] = 1; });

    function fold(s) {
      return String(s == null ? "" : s).toLowerCase().replace(/ё/g, "е")
        .replace(/[abcehkmoptxy]/g, function (c) { return HG[c]; });
    }
    function isW(c) { return (c >= 48 && c <= 57) || (c >= 97 && c <= 122) || (c >= 1072 && c <= 1103); }
    function translit(s) { return s.split("").map(function (c) { return TR[c] != null ? TR[c] : c; }).join(""); }
    function stemOf(w) {
      var v = w.replace(/(ить|ать|ять|еть|ыть|уть|ться|тся)$/, ""); // сбросить → сброс (найдёт и «сброс», и «сбросе»)
      if (v.length >= 4) w = v;
      var n = w.length; return n <= 4 ? w : w.slice(0, n <= 6 ? n - 1 : n - 2);
    }

    // Запрос -> список терминов: { raw, v: [варианты], mx: сколько букв допустимо после основы, code }
    function parseQuery(q) {
      var low = String(q || "").toLowerCase().replace(/ё/g, "е");
      var parts = low.match(/[a-zа-я0-9]+(?:[.\-_,\/][a-zа-я0-9]+)*/g) || [];
      var seen = {}, all = [];
      parts.forEach(function (p) { if (!seen[p]) { seen[p] = 1; all.push(p); } });
      var useful = all.filter(function (p) { return !STOP[p] && (p.length >= 2 || /\d/.test(p)); });
      if (useful.length) all = useful;
      var out = [];
      all.forEach(function (p) {
        var t = { raw: p, v: [], mx: 2, code: false };
        if (/\d/.test(p)) {
          t.code = true; t.mx = 0; t.v.push(fold(p));
          var nosep = fold(p.replace(/[-_]/g, ""));                 // «шк-6000» = «шк6000»
          if (t.v.indexOf(nosep) < 0) t.v.push(nosep);
          var ld = /^([a-zа-я]+)(\d+)$/.exec(p);
          if (ld) t.v.push(fold(ld[1] + "-" + ld[2]));              // «шк6000» = «шк-6000»
        }
        else {
          var cyr = /[а-я]/.test(p);
          var st = cyr ? stemOf(p) : p;
          t.mx = p.length >= 5 ? 1e9 : 2; // длинные слова — по основе (любое окончание), короткие — до 2 букв
          t.v.push(fold(st));
          if (cyr && /к[аиуе]$/.test(p) && p.length >= 5) t.v.push(fold(p.slice(0, -2) + "ок")); // ошибка → ошибок
          if (cyr && st.length >= 3) { var tl = fold(translit(st)); if (tl.length >= 3 && t.v.indexOf(tl) < 0) t.v.push(tl); }
          BR.forEach(function (g) {
            if (g.indexOf(p) >= 0) g.forEach(function (a) { var f = fold(a); if (t.v.indexOf(f) < 0) t.v.push(f); });
          });
        }
        out.push(t);
      });
      return out.slice(0, 8);
    }

    // позиции вхождений: слева — граница слова; справа — не более tok.mx лишних букв (окончание)
    function matchEnd(f, p, len, mx) {
      if (p > 0 && isW(f.charCodeAt(p - 1))) return -1;
      var e = p + len, x = e;
      while (isW(f.charCodeAt(x))) x++;
      return x - e > mx ? -1 : x;
    }
    function findPos(f, tok, cap) {
      var out = [];
      if (!f) return out;
      for (var v = 0; v < tok.v.length; v++) {
        var s = tok.v[v], from = 0, p, guard = 0;
        if (!s) continue;
        while (out.length < cap && guard++ < 6000 && (p = f.indexOf(s, from)) >= 0) {
          from = p + 1;
          if (matchEnd(f, p, s.length, tok.mx) >= 0) out.push(p);
        }
      }
      out.sort(function (a, b) { return a - b; });
      return out;
    }
    function hasAll(f, toks) {
      for (var i = 0; i < toks.length; i++) if (!findPos(f, toks[i], 1).length) return false;
      return true;
    }
    function near(a, b, d) {
      var i = 0, j = 0;
      while (i < a.length && j < b.length) {
        var x = a[i] - b[j];
        if (x >= -d && x <= d) return true;
        if (x < 0) i++; else j++;
      }
      return false;
    }

    // items: [{ f: свёрнутый текст, fn: свёрнутое название, fm: свёрнутые прочие реквизиты }]
    // Возвращает отсортированный список { it, score, pos, partial } — только подходящие.
    function rank(items, toks) {
      var n = toks.length;
      var scan = items.map(function (it) {
        return {
          it: it,
          pos: toks.map(function (t) { return findPos(it.f, t, 30); }),
          mt: toks.map(function (t) { return findPos(it.fn, t, 1).length ? 2 : (findPos(it.fm, t, 1).length ? 1 : 0); })
        };
      });
      var w = toks.map(function (t, i) {
        var df = 0;
        scan.forEach(function (x) { if (x.pos[i].length || x.mt[i]) df++; });
        return (t.code ? 2.2 : 1) * (0.4 + Math.log(1 + scan.length / (1 + df)));
      });
      function build(minHit) {
        var res = [];
        scan.forEach(function (x) {
          var hit = 0, score = 0;
          for (var i = 0; i < n; i++) {
            if (!x.pos[i].length && !x.mt[i]) continue;
            hit++;
            score += w[i] * ((x.mt[i] === 2 ? 14 : x.mt[i] === 1 ? 8 : 0) + 4 * Math.log(1 + Math.min(x.pos[i].length, 30)) / Math.LN2);
          }
          if (hit < minHit) return;
          for (var a = 0; a < n; a++) for (var b = a + 1; b < n; b++) {
            if (x.pos[a].length && x.pos[b].length && near(x.pos[a], x.pos[b], 150)) score += 10 * Math.min(w[a], w[b]);
          }
          if (hit === n) score += 25; else score *= 0.4;
          res.push({ it: x.it, score: score, pos: x.pos, partial: hit < n });
        });
        res.sort(function (p, q) { return q.score - p.score; });
        return res;
      }
      var strict = build(n);
      if (strict.length || n < 2) return { list: strict, partial: false, w: w };
      return { list: build(n - 1), partial: true, w: w };
    }

    function ranges(fs, toks) {
      var rs = [];
      toks.forEach(function (t) {
        t.v.forEach(function (s) {
          if (!s) return;
          var from = 0, p, guard = 0;
          while (guard++ < 400 && (p = fs.indexOf(s, from)) >= 0) {
            from = p + 1;
            var e = matchEnd(fs, p, s.length, t.mx);
            if (e >= 0) rs.push([p, e]);
          }
        });
      });
      rs.sort(function (a, b) { return a[0] - b[0] || b[1] - a[1]; });
      var out = [];
      rs.forEach(function (r) {
        var last = out[out.length - 1];
        if (last && r[0] <= last[1]) { if (r[1] > last[1]) last[1] = r[1]; } else out.push([r[0], r[1]]);
      });
      return out;
    }

    // Фрагмент вокруг места, где рядом нашлось больше всего слов запроса; найденное подсвечивается.
    function snippet(e, toks, pos, w) {
      var f = e.f, cand = [];
      pos.forEach(function (pl) { pl.slice(0, 12).forEach(function (p) { cand.push(p); }); });
      if (!cand.length) return null;
      var best = cand[0], bs = -1;
      cand.forEach(function (p) {
        var s = 0;
        pos.forEach(function (pl, i) {
          for (var k = 0; k < pl.length; k++) { if (pl[k] >= p - 90 && pl[k] <= p + 230) { s += w[i]; break; } }
        });
        if (s > 0 && /[.…]{6,}/.test(f.slice(Math.max(0, p - 90), p + 230))) s *= 0.5; // оглавление с точками-лидерами — не лучший фрагмент
        if (s > bs + 1e-9) { bs = s; best = p; }
      });
      var a = Math.max(0, best - 90), b = Math.min(f.length, best + 230);
      if (a > 0) { while (a < best && isW(f.charCodeAt(a))) a++; }
      while (b < f.length && isW(f.charCodeAt(b))) b++;
      var fs = f.slice(a, b), os = e.same ? e.t.slice(a, b) : fs, html = "", pos0 = 0;
      ranges(fs, toks).forEach(function (r) {
        html += esc(os.slice(pos0, r[0])) + '<mark style="background:#FFE9A8;color:inherit;border-radius:3px;padding:0 1px">' + esc(os.slice(r[0], r[1])) + "</mark>";
        pos0 = r[1];
      });
      html += esc(os.slice(pos0));
      var page = "", pg = e.t.lastIndexOf("[Страница ", a);
      if (e.same && pg >= 0 && a - pg < 4000) { var mm = /^\[Страница (\d+)\]/.exec(e.t.slice(pg, pg + 24)); if (mm) page = mm[1]; }
      return { html: (a > 0 ? "…" : "") + html.replace(/\s+/g, " ") + (b < f.length ? "…" : ""), page: page };
    }

    // ---- хранилище текстов документов (живёт, пока открыто приложение) ----
    function looseKey(s) {
      return String(s || "").toLowerCase().replace(/ё/g, "е").replace(/\.(pdf|docx?|djvu|xlsx?|txt)$/i, "").replace(/[_\s]+/g, " ").trim();
    }
    var store = { raw: null, loose: null, cache: {} };
    function setRaw(j) {
      store.raw = j; store.loose = {}; store.cache = {};
      Object.keys(j).forEach(function (k) { store.loose[looseKey(k)] = k; });
    }
    function entryFor(name) {
      if (!store.raw) return null;
      var k = store.loose[looseKey(name)];
      if (k == null) return null;
      var e = store.cache[k];
      if (!e) { var t = String(store.raw[k] || ""), f = fold(t); e = store.cache[k] = { t: t, f: f, same: f.length === t.length }; }
      return e;
    }
    return { fold: fold, parseQuery: parseQuery, hasAll: hasAll, rank: rank, snippet: snippet,
             setRaw: setRaw, entryFor: entryFor, loaded: function () { return !!store.raw; } };
  })();

  function renderDocs() {
    titleEl.textContent = "Документация";
    var cache = docsCache();
    var q = docsQueue().length;
    var html = '<div class="card"><div class="row"><div><h2>Библиотека документов</h2>' +
      '<p class="hint">' + (cache && cache.t ? "Обновлено: " + new Date(cache.t).toLocaleString() : "Данных ещё нет — нажмите «Обновить»") +
      '<br>Общая библиотека: откройте список и нажмите «На мой участок» — документ увидит вся ваша бригада. Согласование не нужно. Файлы открываются по ссылке, по библиотеке отвечает «Помощь ИИ».' +
      (q ? "<br><b style=\"color:var(--bad)\">В очереди на отправку: " + q + "</b>" : "") + "</p></div>" +
      '<button class="btn" id="dcRef" style="width:auto;padding:8px 14px;font-size:.85rem">Обновить</button></div></div>' +
      '<input type="text" id="dcQ" placeholder="Поиск по документам…" autocomplete="off">' +
      '<div class="row" style="margin-top:8px;align-items:stretch">' +
      '<select id="dcP" style="flex:1"><option value="">Производитель: все</option></select>' +
      '<select id="dcT" style="flex:1"><option value="">Тип: все</option></select></div>' +
      '<label class="row" style="margin-top:8px;gap:8px;align-items:center"><input type="checkbox" id="dcMine" style="width:18px;height:18px"> <span style="font-size:.9rem">Только мой участок <span class="hint">(по ключевым словам и подключённое)</span></span></label>' +
      '<div class="list" id="dcRes" style="margin-top:8px"></div>' +
      '<button class="btn primary" id="dcAdd" style="margin-top:10px">Добавить документ<small>Нужное вам — в общую библиотеку, участок подпишется автоматически</small></button>';
    screenEl.innerHTML = html;

    var H = (cache && cache.headers) || [];
    function col(n) { return H.indexOf(n); }
    var cN = col("Название"), cP = col("Производитель"), cT = col("Тип"),
        cU = col("Узел/оборудование"), cK = col("Ключевые слова"),
        cL = col("Ссылка на Диск"), cC = col("Комментарий"), cI = col("ID");
    // v18: сервер отдаёт весь реестр целиком (+ карта подписок). По умолчанию
    // показываем все документы — подключение к участку делается кнопкой в карточке;
    // фильтр «Только мой участок» оставляет документы по ключам и подпискам.
    var allRows = (cache && cache.rows) || [];
    var visibleRows = allRows;

    function distinct(ci) {
      var s = {}, out = [];
      visibleRows.forEach(function (r) {
        var v = String(r[ci] || "").trim();
        if (v && !s[v]) { s[v] = 1; out.push(v); }
      });
      return out.sort();
    }
    [ ["dcP", cP], ["dcT", cT] ].forEach(function (x) {
      if (x[1] < 0) return;
      var sel = document.getElementById(x[0]);
      distinct(x[1]).forEach(function (v) {
        var o = document.createElement("option");
        o.value = v; o.textContent = v;
        sel.appendChild(o);
      });
    });

    // --- полнотекстовый поиск по содержимому документов (см. модуль DS выше) ---
    var docsTextLoading = false;
    function loadDocsText() {
      if (DS.loaded() || docsTextLoading) return;
      docsTextLoading = true;
      var res = document.getElementById("dcRes");
      if (res) res.innerHTML = '<div class="empty">Загружаю текст документов для поиска… (один раз, ~13 МБ)</div>';
      fetch("docs_text.json").then(function (r) { return r.json(); }).then(function (j) {
        DS.setRaw(j); docsTextLoading = false;
        var res2 = document.getElementById("dcRes");
        if (res2) res2.innerHTML = '<div class="empty">Готовлю индекс…</div>';
        setTimeout(draw, 30); // дать экрану перерисоваться: первая нормализация текстов занимает время
      }).catch(function () {
        docsTextLoading = false;
        toast("Не удалось загрузить текстовый индекс — поиск только по названиям");
        draw();
      });
    }

    var SHOW_MAX = 50;
    var admin = isAdmin();
    // Подключение/отключение документа к участку аккаунта. Согласование не
    // нужно — запрос уходит как обычная посылка; без связи встаёт в очередь.
    function toggleSub(id, on) {
      var acc = account();
      if (!acc) { toast("Сначала войдите в аккаунт"); return; }
      var my = myAreaName();
      if (!my) { toast("У аккаунта не задан участок"); return; }
      var c = docsCache();
      if (!c) return;
      c.subs = c.subs || {};
      var arr = c.subs[id] || (c.subs[id] = []);
      var ix = arr.indexOf(my);
      if (on && ix < 0) arr.push(my);
      if (!on && ix >= 0) arr.splice(ix, 1);
      lsSet("to_docs", c);
      var p = {
        type: "subscribe", id: "sub-" + Date.now().toString(36),
        login: acc.login || "", pwd: acc.pwd || "",
        docId: id, on: on
      };
      if (!navigator.onLine || !settings().endpoint) {
        var q = docsQueue(); q.push(p); saveDocsQueue(q);
        toast("Нет связи — подписка в очереди, уйдёт сама");
      } else {
        sendDoc(p).then(function (ok) {
          if (!ok) {
            var q2 = docsQueue(); q2.push(p); saveDocsQueue(q2);
            toast("Не отправилось — подписка в очереди");
          }
        });
      }
      draw();
    }
    // Кнопка подписки в карточке документа (админу не нужна — он видит всё).
    function subBtnHtml(r) {
      if (admin || cI < 0) return "";
      var id = String(r[cI]);
      if (docSubscribed(r, cI)) {
        return '<button class="btn" data-sub="' + esc(id) + '" data-on="0" style="width:auto;padding:7px 12px;font-size:.82rem;margin-top:8px;display:inline-block">На участке ✓ — убрать</button>';
      }
      if (docAllowedForArea(r, cK, (account() || {}).u)) {
        return '<div class="s" style="margin-top:6px;color:var(--ok)">Уже доступен вашему участку</div>';
      }
      return '<button class="btn primary" data-sub="' + esc(id) + '" data-on="1" style="width:auto;padding:7px 12px;font-size:.82rem;margin-top:8px;display:inline-block">+ На мой участок</button>';
    }
    function itemHtml(r, snipHtml, page) {
      var sub = [r[cP], r[cT], r[cU]].filter(function (v) { return v; }).join(" · ") + (page ? (" · стр. " + page) : "");
      return '<div class="item" data-l="' + esc(r[cL]) + '"><div class="t" style="font-size:.92rem">' + esc(r[cN]) + "</div>" +
        (sub ? '<div class="s">' + esc(sub) + "</div>" : "") +
        (snipHtml ? '<div class="s" style="color:var(--accent)">' + snipHtml + "</div>"
                  : (r[cC] ? '<div class="s">' + esc(r[cC]) + "</div>" : "")) +
        subBtnHtml(r) + "</div>";
    }
    function draw() {
      var res = document.getElementById("dcRes");
      if (!res) return; // экран уже закрыт
      var qraw = document.getElementById("dcQ").value.trim();
      if (qraw.length >= 2 && !DS.loaded() && !docsTextLoading) loadDocsText();
      if (docsTextLoading) return; // сообщение о загрузке уже показано, после загрузки поиск перерисуется
      var fp = document.getElementById("dcP").value, ft = document.getElementById("dcT").value;
      var onlyMine = !admin && document.getElementById("dcMine").checked;
      var rows = visibleRows.filter(function (r) { return !onlyMine || docOnArea(r, cK, cI); });
      if (!rows.length) { res.innerHTML = '<div class="empty">' + (onlyMine ? "На вашем участке документов пока нет. Снимите фильтр — в общей библиотеке есть что подключить." : "Библиотека пуста.<br>Нажмите «Обновить» (нужен интернет).") + "</div>"; return; }
      var base = rows.filter(function (r) {
        if (fp && String(r[cP] || "").trim() !== fp) return false;
        if (ft && String(r[cT] || "").trim() !== ft) return false;
        return true;
      });
      var toks = qraw.length >= 2 ? DS.parseQuery(qraw) : [];
      var html, note = "";
      if (!toks.length) {
        html = base.slice(0, 100).map(function (r) { return itemHtml(r, "", ""); }).join("");
      } else {
        var items = base.map(function (r) {
          var e = DS.entryFor(r[cN]);
          return { r: r, e: e, f: e ? e.f : "", fn: DS.fold(r[cN]),
                   fm: DS.fold([r[cK], r[cU], r[cP], r[cT], r[cC]].join(" ")) };
        });
        var rk = DS.rank(items, toks);
        var list = rk.list;
        if (list.length) {
          note = '<div class="hint" style="margin:2px 2px 0">' +
            (rk.partial ? "Точных совпадений нет — показаны документы, где нашлась часть слов. " : "") +
            "Найдено: " + list.length + (list.length > SHOW_MAX ? " (показаны лучшие " + SHOW_MAX + ")" : "") + "</div>";
        }
        html = list.slice(0, SHOW_MAX).map(function (x) {
          var sn = x.it.e ? DS.snippet(x.it.e, toks, x.pos, rk.w) : null;
          return itemHtml(x.it.r, sn ? sn.html : "", sn ? sn.page : "");
        }).join("");
      }
      res.innerHTML = (html ? note + html : '<div class="empty">Ничего не найдено</div>');
      res.querySelectorAll(".item").forEach(function (el) {
        el.onclick = function () {
          var u = el.getAttribute("data-l");
          if (u) window.open(u, "_blank");
          else toast("У записи нет ссылки");
        };
      });
      res.querySelectorAll("[data-sub]").forEach(function (b) {
        b.onclick = function (e) {
          e.stopPropagation();
          toggleSub(b.getAttribute("data-sub"), b.getAttribute("data-on") === "1");
        };
      });
    }
    draw();
    var dcTimer = null;
    document.getElementById("dcQ").addEventListener("input", function () { clearTimeout(dcTimer); dcTimer = setTimeout(draw, 150); });
    document.getElementById("dcP").addEventListener("change", draw);
    document.getElementById("dcT").addEventListener("change", draw);
    var dcMineEl = document.getElementById("dcMine");
    if (dcMineEl) dcMineEl.addEventListener("change", draw);

    function refresh() {
      if (!navigator.onLine) { toast("Нет связи"); return; }
      var acc = account() || {};
      toast("Загрузка…");
      api({ what: "docs", login: acc.login || "", pwd: acc.pwd || "" }).then(function (r) {
        if (!r.ok) { toast("Отказ: " + (r.error || "")); return; }
        lsSet("to_docs", { t: Date.now(), headers: r.headers, rows: r.rows, subs: r.subs || {} });
        renderDocs();
      }).catch(function () { toast("Не удалось загрузить"); });
    }
    document.getElementById("dcRef").onclick = refresh;
    var dca = document.getElementById("dcAdd");
    if (dca) dca.onclick = function () { go("docadd"); };
    flushDocsQueue();
  }

  // ---------- ПОМОЩЬ ИИ (чат по документации) ----------
  // Поиск фрагментов и ответ ИИ выполняет сервер (GET what=assistant).
  // Экран — как в мессенджере: шапка сверху, лента сообщений прокручивается
  // отдельно, строка ввода закреплена внизу; после ответа лента сама
  // прокручивается к последнему сообщению.
  function renderAssistant() {
    titleEl.textContent = "Помощь ИИ";
    var cache = docsCache(), acc = account() || {};
    var busy = false;
    var chat = state.aiChat || [];
    var selDoc = state.aiDoc || null;
    if (state.aiDocOpen) { state.aiDocOpen = false; state.aiPick = true; }
    var pickMode = !!state.aiPick;           // открыт выбор документа
    var admin = !!(acc && acc.role === "admin");

    var ICON_TRASH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6"/></svg>';
    var ICON_SEND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';

    screenEl.innerHTML =
      '<div class="aiWrap" id="aiWrap">' +
      '<div class="aiTop">' +
        '<div class="aiModes">' +
          '<button class="aiMode' + ((selDoc || pickMode) ? "" : " on") + '" id="aiModeAll">Вся библиотека</button>' +
          '<button class="aiMode' + ((selDoc || pickMode) ? " on" : "") + '" id="aiModeDoc">По документу</button>' +
          '<button class="aiIcon" id="aiClear" title="Очистить чат" aria-label="Очистить чат">' + ICON_TRASH + '</button>' +
        '</div>' +
        '<input type="text" id="aiCfg" list="aiCfgList" placeholder="Конфигурация, напр. УЭЛ + KEB" value="' + esc(state.aiCfg || "") + '">' +
        '<datalist id="aiCfgList">' +
          aiCfgOptions(acc).map(function (c) { return '<option value="' + c + '">'; }).join("") +
        '</datalist>' +
        (selDoc ? '<div class="aiChip">📄 <span>' + esc(selDoc.title) + '</span><b id="aiChipX" title="Убрать документ">✕</b></div>' : "") +
      '</div>' +
      '<div id="aiChat"></div>' +
      '<div class="aiBar' + (pickMode ? " hidden" : "") + '">' +
        '<textarea id="aiQ" rows="1" placeholder="Вопрос по документации…"></textarea>' +
        '<button class="btn primary aiSend" id="aiSend" title="Отправить" aria-label="Отправить">' + ICON_SEND + '</button>' +
      '</div></div>';

    var H = (cache && cache.headers) || [];
    function col(n) { return H.indexOf(n); }
    var cN = col("Название"), cP = col("Производитель"), cK = col("Ключевые слова"), cL = col("Ссылка на Диск");

    function norm(s) { return String(s || "").toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim(); }
    // подсказки связок зависят от участка: у каждого своё оборудование, остальное — Otis
    function aiCfgOptions(acc2) {
      var a = norm((acc2 && acc2.u) || "");
      var GRIN = ["УЭЛ + Astar", "УЭЛ + KEB", "УЭЛ + Emotron", "УЭЛ + ABB",
        "Astar + ШУЛМ", "ШУЛМ + Emotron", "ШУЛМ + ABB", "ШУЛМ + KEB"];
      if (a.indexOf("грин") >= 0) return GRIN.concat(["Otis"]);
      if (a.indexOf("третий") >= 0) return ["ШК6000 + УЭЛ", "Otis"];
      if (a.indexOf("новосар") >= 0) return ["Смарт + Astar", "УЭЛ + HPMONT", "Otis"];
      if (!a) return GRIN.concat(["ШК6000 + УЭЛ", "Смарт + Astar", "УЭЛ + HPMONT", "Otis"]); // админ
      return ["Otis"];
    }

    // прокрутка к последнему сообщению: длинный ответ — началом к верху
    // (читаем сверху вниз), короткое сообщение — просто докрутить вниз
    function toBottom() {
      var el = document.getElementById("aiChat");
      if (!el) return;
      requestAnimationFrame(function () {
        var last = el.lastElementChild;
        if (!last) { el.scrollTop = 0; return; }
        if (chat.length === 0 || last.offsetHeight >= el.clientHeight - 24) {
          el.scrollTop = chat.length === 0 ? 0 : Math.max(0, last.offsetTop - 6);
        } else {
          el.scrollTop = el.scrollHeight;
        }
      });
    }
    // высота чата = видимая высота экрана минус шапка приложения
    function fitAi() {
      var wrap = document.getElementById("aiWrap");
      if (!wrap) return;
      var vv = window.visualViewport;
      var visible = vv ? vv.height : window.innerHeight;
      var top = Math.max(0, wrap.getBoundingClientRect().top);
      wrap.style.height = Math.max(260, visible - top - 6) + "px";
      toBottom();
    }
    // пересчитывать высоту при открытии/закрытии клавиатуры (один глобальный слушатель)
    if (!window.__aiVpHook) {
      window.__aiVpHook = true;
      window.addEventListener("resize", function () { if (window.__fitAi) window.__fitAi(); });
      if (window.visualViewport) window.visualViewport.addEventListener("resize", function () { if (window.__fitAi) window.__fitAi(); });
    }
    window.__fitAi = fitAi;

    // ---- оформление ответа: **жирный**, *курсив*, списки, [Документ N] ----
    function inl(x) {
      return esc(x)
        .replace(/\*\*([^*]+?)\*\*/g, "<b>$1</b>")
        .replace(/(^|[\s(>])\*([^*\s][^*]*?)\*(?=$|[\s).,;:!?<])/g, "$1<i>$2</i>")
        .replace(/\[Документ\s*(\d+)\]/g, '<span class="aiRef">Док. $1</span>');
    }
    function fmt(t, dropSources) {
      var s = String(t || "").replace(/\r/g, "");
      // блок «Источники», который пишет сама модель, дублирует карточки ниже — убираем
      if (dropSources) s = s.replace(/(?:^|\n)[ \t]*(?:#{1,3}[ \t]*)?(?:\*\*)?Источники:?(?:\*\*)?:?[ \t]*(?:\n[\s\S]*)?$/i, "");
      var out = [], cur = null;
      function close() { if (cur) { out.push("</" + cur + ">"); cur = null; } }
      s.split("\n").forEach(function (line) {
        var l = line.trim();
        if (!l) { close(); return; }
        var hd = /^#{1,3}\s+(.*)$/.exec(l), bl = /^[-•*]\s+(.*)$/.exec(l), nm = /^(\d+)[.)]\s+(.*)$/.exec(l);
        if (hd) { close(); out.push('<div class="aiH">' + inl(hd[1]) + "</div>"); }
        else if (bl) { if (cur !== "ul") { close(); out.push("<ul>"); cur = "ul"; } out.push("<li>" + inl(bl[1]) + "</li>"); }
        else if (nm) { if (cur !== "ol") { close(); out.push("<ol>"); cur = "ol"; } out.push("<li>" + inl(nm[2]) + "</li>"); }
        else { close(); out.push("<p>" + inl(l) + "</p>"); }
      });
      close();
      return out.join("");
    }

    function add(kind, text, sources, dbg, web) {
      chat.push({ kind: kind, text: text, sources: sources || [], dbg: dbg || "", web: !!web });
      state.aiChat = chat;
      drawChat();
    }
    function welcomeHtml() {
      var sub = selDoc
        ? 'Вопросы по документу: <b>' + esc(selDoc.title) + '</b>.'
        : 'Участок: <b>' + esc(acc.u || "все") + '</b>. Отвечаю по вашим инструкциям и подсказываю, что проверить. Если ответа в документации нет — дам общий совет с пометкой.';
      var ex = ["Что проверить при ошибке EOC?", "Как сбросить параметры привода до заводских?", "Двери не закрываются — с чего начать?"];
      return '<div class="card aiWelcome"><h2>Чем помочь?</h2><p class="hint">' + sub + '</p><div class="aiExamples">' +
        ex.map(function (q) { return '<button class="btn aiExample" data-q="' + esc(q) + '">' + esc(q) + '</button>'; }).join("") + '</div></div>';
    }
    function drawChat() {
      var el = document.getElementById("aiChat");
      if (!el || pickMode) return;
      el.innerHTML = chat.length ? chat.map(function (m) {
        if (m.kind === "user") return '<div class="aiUser">' + esc(m.text) + '</div>';
        if (m.kind === "system") return '<div class="aiSys">' + esc(String(m.text).replace(/…$/, "")) + '<span class="aiDots"><i></i><i></i><i></i></span></div>';
        var cls = m.kind === "error" ? "aiError" : (m.kind === "general" ? "aiGeneral" : "aiAnswer");
        var sources = (m.sources || []).map(function (s, i) {
          return '<div class="aiSource" data-u="' + esc(s.link) + '"><div class="aiSrcHead"><b>' + (m.web ? "Источник " : "Док. ") + (i + 1) + '</b>' +
            (s.pages && s.pages.length ? '<span class="aiPage">стр. ' + esc(s.pages.join(", ")) + '</span>' : "") +
            (m.web && s.link ? '<button class="aiSaveDoc" data-u="' + esc(s.link) + '" data-t="' + esc(s.title) + '">＋ В библиотеку</button>' : "") + '</div>' +
            '<div class="aiSrcName">' + esc(s.title) + '</div>' +
            (s.snip ? '<div class="aiSnip">' + esc(s.snip) + '…</div>' : "") + '</div>';
        }).join("");
        return '<div class="card ' + cls + '">' +
          (m.kind === "general" ? '<div class="aiGenTag">⚠️ Общий совет — ответ не из вашей документации, сверяйте с НПА</div>' : "") +
          '<div class="aiText">' + fmt(m.text, !!sources) + '</div>' +
          (sources ? '<div class="aiSources"><div class="aiSrcTitle">Источники <span style="font-weight:400">· нажмите, чтобы открыть</span></div>' + sources + '</div>' : "") +
          (m.dbg && admin ? '<details class="aiDbg"><summary>Детали поиска</summary>' + esc(m.dbg) + '</details>' : "") + '</div>';
      }).join("") : welcomeHtml();
      el.querySelectorAll(".aiSource").forEach(function (x) {
        x.onclick = function () { var u = x.getAttribute("data-u"); if (u) window.open(u, "_blank"); else toast("У документа нет ссылки"); };
      });
      el.querySelectorAll(".aiExample").forEach(function (b) {
        b.onclick = function () { document.getElementById("aiQ").value = b.getAttribute("data-q"); ask(); };
      });
      // «＋ В библиотеку»: скачать найденный в интернете документ на Диск и в реестр
      el.querySelectorAll(".aiSaveDoc").forEach(function (b) {
        b.onclick = function (ev) {
          ev.stopPropagation();
          if (b.disabled) return;
          if (!navigator.onLine) { toast("Нет связи"); return; }
          b.disabled = true; b.textContent = "Сохраняю…";
          sendForResponse({
            type: "docfetch", id: "df-" + Date.now().toString(36),
            login: acc.login || "", pwd: acc.pwd || "", worker: acc.name || "",
            doc: { url: b.getAttribute("data-u"), title: b.getAttribute("data-t") }
          }).then(function (r) {
            if (r && r.ok) {
              b.textContent = r.saved ? "✓ Сохранено на Диск" : "✓ Ссылка в реестре";
              toast(r.saved ? "Файл скачан в библиотеку документации" : "Файл не скачался — ссылка добавлена в реестр");
            } else {
              b.textContent = "Не сохранилось";
              toast("Не сохранилось: " + ((r && r.error) || "ошибка"));
            }
          }).catch(function () {
            b.textContent = "Не сохранилось"; b.disabled = false;
            toast("Нет связи со скриптом");
          });
        };
      });
      toBottom();
    }
    function autosize(el) { el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 120) + "px"; }
    function ask() {
      if (busy) return;
      var input = document.getElementById("aiQ"), q = input.value.trim();
      if (q.length < 3) { toast("Напишите вопрос"); return; }
      if (!navigator.onLine) { toast("Для ответа ассистента нужен интернет"); return; }
      busy = true; input.value = ""; autosize(input);
      document.getElementById("aiSend").disabled = true;
      input.blur(); // убрать клавиатуру — ответ будет виден целиком
      add("user", q);
      add("system", selDoc ? "Читаю документ целиком и формирую ответ…" : "Ищу по библиотеке и формирую ответ…");
      function done() { busy = false; var sb = document.getElementById("aiSend"); if (sb) sb.disabled = false; }
      var params = { what: "assistant", q: q, login: acc.login || "", pwd: acc.pwd || "" };
      if (selDoc) params.doc = selDoc.title;
      if (state.aiCfg) params.cfg = state.aiCfg;
      api(params).then(function (r) {
        chat.pop(); state.aiChat = chat; done();
        if (!r.ok) { add("error", r.error || "Не удалось получить ответ"); return; }
        add((r.general || r.web) ? "general" : "answer", r.answer, r.sources || [], r.dbg, r.web);
      }).catch(function () {
        chat.pop(); state.aiChat = chat; done();
        add("error", "Не удалось связаться со скриптом. Проверьте интернет и развёртывание веб-приложения.");
      });
    }

    // --- выбор документа: список занимает всё место под шапкой ---
    function drawPick() {
      var box = document.getElementById("aiChat");
      var rows = (cache && cache.rows) || [];
      if (!rows.length) { box.innerHTML = '<div class="card"><p class="hint">Библиотека пуста — обновите её в разделе «Документация».</p></div>'; return; }
      box.innerHTML = '<div class="aiPickBox"><div class="aiPickHead"><input type="text" id="aiPickQ" placeholder="Название, марка, ключевое слово…">' +
        (selDoc ? '<button class="aiMode" id="aiPickCancel">Отмена</button>' : "") + '</div>' +
        '<div class="aiPickHint">Выберите документ — вопросы будут заданы только по нему</div>' +
        '<div class="list" id="aiPickRes"></div></div>';
      var res = document.getElementById("aiPickRes");
      function drawList(q) {
        var toks = DS.parseQuery(q);
        var list = rows.filter(function (r) {
          return !toks.length || DS.hasAll(DS.fold(r[cN] + " " + r[cP] + " " + r[cK]), toks);
        }).slice(0, 60);
        res.innerHTML = list.length ? list.map(function (r) {
          return '<div class="item" data-t="' + esc(r[cN]) + '" data-l="' + esc(r[cL] || "") + '"><div class="t" style="font-size:.92rem">' + esc(r[cN]) + '</div>' +
            (r[cP] ? '<div class="s">' + esc(r[cP]) + '</div>' : "") + '</div>';
        }).join("") : '<div class="empty">Не найдено</div>';
        res.querySelectorAll(".item").forEach(function (el) {
          el.onclick = function () {
            state.aiDoc = { title: el.getAttribute("data-t"), link: el.getAttribute("data-l") };
            state.aiPick = false;
            render("assistant");
          };
        });
      }
      drawList("");
      document.getElementById("aiPickQ").addEventListener("input", function () { drawList(norm(this.value)); });
      var cx = document.getElementById("aiPickCancel");
      if (cx) cx.onclick = function () { state.aiPick = false; render("assistant"); };
    }

    document.getElementById("aiModeAll").onclick = function () { state.aiDoc = null; state.aiPick = false; render("assistant"); };
    document.getElementById("aiModeDoc").onclick = function () { state.aiPick = true; render("assistant"); };
    document.getElementById("aiCfg").addEventListener("input", function () { state.aiCfg = this.value.trim(); });
    var chipX = document.getElementById("aiChipX");
    if (chipX) chipX.onclick = function () { state.aiDoc = null; state.aiPick = false; render("assistant"); };
    document.getElementById("aiClear").onclick = function () { chat = []; state.aiChat = []; if (!pickMode) drawChat(); };
    document.getElementById("aiSend").onclick = ask;
    var qEl = document.getElementById("aiQ");
    qEl.addEventListener("input", function () { autosize(this); });
    qEl.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey && !/Android|iPhone|iPad/i.test(navigator.userAgent)) { e.preventDefault(); ask(); }
    });
    if (pickMode) drawPick(); else drawChat();
    fitAi();
  }

  // добавление записи в реестр; без связи — в очередь, уйдёт сама при появлении сети
  function sendDoc(p) {
    var ep = settings().endpoint;
    if (!ep || !navigator.onLine) return Promise.resolve(false);
    return send(p, ep).then(function () { return true; }).catch(function () { return false; });
  }

  function flushDocsQueue() {
    var q = docsQueue();
    if (!q.length || !settings().endpoint || !navigator.onLine) return;
    q.reduce(function (ch, p) {
      return ch.then(function () {
        return send(p, settings().endpoint).then(function () {
          q.shift(); saveDocsQueue(q);
        }).catch(function () {});
      });
    }, Promise.resolve()).then(function () {
      if (!docsQueue().length) toast("Документы из очереди отправлены");
    });
  }

  function renderDocAdd() {
    if (!account()) {
      toast("Сначала войдите в аккаунт");
      render("docs");
      return;
    }
    titleEl.textContent = "Добавить документ";
    var acc = account() || {};
    screenEl.innerHTML =
      '<div class="card"><p class="hint">1. Разместите файл на Google Диске (например, в папке «Библиотека документации»).<br>' +
      '2. Правый клик по файлу → «Открыть доступ» → «Все, у кого есть ссылка» → читатель.<br>' +
      '3. Скопируйте ссылку и заполните форму ниже.<br>' +
      'Документ увидят коллеги вашего участка («' + esc(acc.u || "участок не задан") + '») — участок допишется в ключевые слова автоматически. ' +
      'Чтобы документ был виден всем бригадам, добавьте в ключевые слова: <b>все участки</b>.</p></div>' +
      '<label>Название *</label><input type="text" id="dName" placeholder="напр.: РЭ OTIS Gen2 — раздел тормоз">' +
      '<label>Ссылка на файл (Google Диск) *</label><input type="url" id="dLink" placeholder="https://drive.google.com/…">' +
      '<label>Производитель</label><input type="text" id="dProducer" placeholder="OTIS, KONE, ЩЛЗ, Wellmaks…">' +
      '<label>Тип</label><select id="dType">' +
      ["", "РЭ", "Схема", "ПЧ", "Паспорт", "ГОСТ/ПП", "Прочее"].map(function (v) {
        return '<option value="' + esc(v) + '">' + (v || "— выберите —") + "</option>";
      }).join("") + "</select>" +
      '<label>Узел / оборудование</label><input type="text" id="dNode" placeholder="лебёдка, привод дверей, станция управления…">' +
      '<label>Язык</label><select id="dLang">' +
      ["русский", "английский", "немецкий"].map(function (v) {
        return '<option value="' + v + '">' + v + "</option>";
      }).join("") + "</select>" +
      '<label>Ключевые слова</label><input type="text" id="dKeys" placeholder="через запятую, как говорят механики: шибер, бугель, цепь безопасности…">' +
      '<label>Комментарий</label><textarea id="dComment" placeholder="Нюансы: какой раздел, для какой модели, на что обратить внимание…"></textarea>' +
      '<button class="btn primary" id="dSave" style="margin-top:14px">Сохранить в реестр</button>';
    document.getElementById("dSave").onclick = function () {
      function v(id) { return document.getElementById(id).value.trim(); }
      if (!v("dName") || !v("dLink")) { toast("Заполните название и ссылку"); return; }
      var p = {
        type: "doc",
        id: "doc-" + Date.now().toString(36),
        login: acc.login || "", pwd: acc.pwd || "",
        worker: acc.name || "",
        doc: {
          name: v("dName"), link: v("dLink"), producer: v("dProducer"),
          dtype: v("dType"), node: v("dNode"), lang: v("dLang"),
          keywords: v("dKeys"), comment: v("dComment"),
          date: new Date().toISOString().slice(0, 10)
        }
      };
      if (!navigator.onLine) {
        var q = docsQueue(); q.push(p); saveDocsQueue(q);
        toast("Нет связи — запись в очереди, уйдёт сама");
        back();
        return;
      }
      sendDoc(p).then(function (ok) {
        if (ok) toast("Документ добавлен в реестр");
        else { var q2 = docsQueue(); q2.push(p); saveDocsQueue(q2); toast("Не отправилось — запись в очереди"); }
        back();
      });
    };
  }

  // ---------- НАСТРОЙКИ ----------
  function profileInfo() { return lsGet("to_profile", null); }
  // ФИО и организация уходят в таблицу: ФИО — в строку аккаунта, организация — в лист «Настройки»
  function flushProfile() {
    var p = profileInfo();
    if (!p || !p.dirty || !navigator.onLine || !settings().endpoint) return Promise.resolve(false);
    var acc = account() || {};
    return send({
      type: "profile", id: "profile-" + Date.now().toString(36),
      login: acc.login || "", pwd: acc.pwd || "", name: p.name, org: p.org
    }, settings().endpoint).then(function () {
      p.dirty = false; lsSet("to_profile", p);
      return true;
    }).catch(function () { return false; });
  }

  function renderSettings() {
    titleEl.textContent = "Настройки";
    var s = settings();
    var acc = account();
    var p = profileInfo() || {};
    var curName = (acc && acc.name && acc.name !== acc.login) ? acc.name : (p.name || "");
    var curOrg = s.org || p.org || "";
    screenEl.innerHTML =
      '<div class="card"><h2>Аккаунт</h2>' +
      '<p class="hint">' + (acc ? esc(acc.name || acc.login) + " · " + (acc.role === "admin" ? "администратор" : "участок " + esc(acc.u)) : "Не выполнен вход") + "</p></div>" +
      '<div class="card"><h2>Фамилия и инициалы *</h2>' +
      '<p class="hint">Подставляется в осмотры и печатные акты, сохраняется в лист «Аккаунты». Заполнение обязательно.</p>' +
      '<input type="text" id="sName" placeholder="Иванов И. И." value="' + esc(curName) + '"></div>' +
      '<div class="card"><h2>Обслуживающая организация *</h2>' +
      '<p class="hint">Подставляется в печатный акт осмотра, сохраняется в таблице. Заполнение обязательно.</p>' +
      '<input type="text" id="sOrg" placeholder="ООО «…»" value="' + esc(curOrg) + '"></div>' +
      '<div class="card"><h2>Таблица</h2>' +
      (window.APP_ENDPOINT && window.APP_ENDPOINT.indexOf("ВСТАВИТЬ") < 0
        ? '<p class="hint">Приёмник данных задан в комплекте приложения и обновляется автоматически вместе с ним.<br><span style="word-break:break-all">' + esc(window.APP_ENDPOINT) + "</span></p>"
        : '<p class="hint">Ссылка Google Apps Script (…/exec) — берётся в «Управление развертываниями».</p>' +
          '<input type="url" id="sEndpoint" placeholder="https://script.google.com/macros/s/…/exec" value="' + esc(s.endpoint) + '">') + "</div>" +
      '<div class="card"><h2>Справка</h2><p class="hint">Версия 2.8.4 · видов ТО: ' + DATA.forms.length +
      " · лифтов в справочнике: " + DATA.lifts.length + ".<br>Осмотры хранятся в телефоне до отправки.<br>" +
      'Сборка: <b id="appVer">' + esc(window.__appVer || "—") + '</b></p>' +
      '<div style="margin-top:10px"><button type="button" class="miniBtn" id="sUpd">Проверить обновления</button></div></div>' +
      '<button class="btn primary" id="sSave">Сохранить настройки</button>' +
      (acc ? '<button class="btn danger" id="sOut">Выйти из аккаунта</button>' : "");
    document.getElementById("sSave").onclick = function () {
      var name = document.getElementById("sName").value.trim();
      var org = document.getElementById("sOrg").value.trim();
      var ok = true;
      [["sName", name], ["sOrg", org]].forEach(function (x) {
        document.getElementById(x[0]).classList.toggle("miss", !x[1]);
        if (!x[1]) ok = false;
      });
      if (!ok) { toast("Заполните обязательные поля: ФИО и организация"); return; }
      lsSet("to_settings", {
        endpoint: document.getElementById("sEndpoint") ? document.getElementById("sEndpoint").value.trim() : s.endpoint,
        org: org
      });
      if (acc) { acc.name = name; lsSet("to_account", acc); }
      lsSet("to_profile", { name: name, org: org, dirty: true });
      flushProfile().then(function (sent) {
        toast(sent ? "Настройки сохранены и записаны в таблицу" : "Настройки сохранены — в таблицу уйдут при появлении интернета");
      });
      back();
    };
    var so = document.getElementById("sOut");
    if (so) so.onclick = function () { lsSet("to_account", null); state.stack = []; render("login"); };
    var su = document.getElementById("sUpd");
    if (su) su.onclick = function () {
      if (!("serviceWorker" in navigator)) { toast("Автообновление в этом браузере недоступно"); return; }
      if (!navigator.onLine) { toast("Нет интернета — проверить обновления нельзя"); return; }
      su.disabled = true; su.textContent = "Проверяю…";
      var done = false, beforeVer = window.__shellVer || "";
      function restore() {
        su.disabled = false; su.textContent = "Проверить обновления";
        window.__onUpd = null;
      }
      function fail() {
        if (done) return; done = true; clearTimeout(t); restore();
        toast("Не удалось проверить обновления — попробуйте ещё раз");
      }
      var t = setTimeout(fail, 15000);
      window.__onUpd = function (result) {
        if (done) return;
        if (!result || !result.ok) { fail(); return; }
        done = true; clearTimeout(t); window.__onUpd = null;
        if (result.ver) setAppVer_(result.ver);
        if (result.updated || (result.ver && beforeVer && result.ver !== beforeVer)) {
          toast("Обновление загружено — открываю новую версию");
          setTimeout(applyUpdate, 500);
        } else {
          restore(); toast("Новых обновлений нет");
        }
      };
      // Сначала обновляем сам service worker, затем просим его скачать всю оболочку.
      navigator.serviceWorker.getRegistration().then(function (reg) {
        if (!reg) throw new Error("no registration");
        return reg.update().catch(function () {}).then(function () {
          var c = navigator.serviceWorker.controller || reg.active || reg.waiting || reg.installing;
          if (!c) throw new Error("no worker");
          c.postMessage({ type: "check" });
        });
      }).catch(fail);
    };
    requestAppVer_();
  }

  // обновить справочник лифтов из таблицы
  function refreshLifts() {
    if (!navigator.onLine || !settings().endpoint) return;
    var acc = account() || {};
    api({ what: "lifts", login: acc.login || "", pwd: acc.pwd || "" }).then(function (r) {
      if (r.ok && r.lifts && r.lifts.length) {
        lsSet("to_lifts", r.lifts);
        DATA.lifts = r.lifts;
      }
    }).catch(function () {});
  }

  /* ---------- ЭКСПОРТ В EXCEL (xlsx, настоящий ZIP) ---------- */
  function crc32(bytes) {
    var t = crc32.t;
    if (!t) {
      t = crc32.t = new Uint32Array(256);
      for (var n = 0; n < 256; n++) {
        var c = n;
        for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        t[n] = c >>> 0;
      }
    }
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) crc = (crc >>> 8) ^ t[(crc ^ bytes[i]) & 0xFF];
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  function zipStore(entries) {
    var enc = new TextEncoder();
    function u16(v) { return [v & 255, (v >> 8) & 255]; }
    function u32(v) { return [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255]; }
    var chunks = [], central = [], offset = 0;
    entries.forEach(function (e) {
      var name = enc.encode(e.name), data = enc.encode(e.data), crc = crc32(data);
      var head = new Uint8Array([].concat(
        u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
        u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0)));
      chunks.push(head, name, data);
      central.push({ name: name, crc: crc, size: data.length, offset: offset });
      offset += head.length + name.length + data.length;
    });
    var cdStart = offset, cdSize = 0;
    central.forEach(function (e) {
      var rec = new Uint8Array([].concat(
        u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
        u32(e.crc), u32(e.size), u32(e.size), u16(e.name.length),
        u16(0), u16(0), u16(0), u16(0), u32(0), u32(e.offset)));
      chunks.push(rec, e.name);
      cdSize += rec.length + e.name.length;
    });
    chunks.push(new Uint8Array([].concat(
      u32(0x06054b50), u16(0), u16(0), u16(central.length), u16(central.length),
      u32(cdSize), u32(cdStart), u16(0))));
    return new Blob(chunks, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  }
  function buildXlsx(headers, rows) {
    function escX(s) {
      return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
      });
    }
    function colRef(i) {
      var s = ""; i += 1;
      while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = (i - m) / 26 | 0; }
      return s;
    }
    var all = [headers].concat(rows);
    var sheetRows = all.map(function (r, ri) {
      var cells = r.map(function (v, ci) {
        return '<c r="' + colRef(ci) + (ri + 1) + '" t="inlineStr"><is><t>' + escX(v) + "</t></is></c>";
      }).join("");
      return '<row r="' + (ri + 1) + '">' + cells + "</row>";
    }).join("");
    var xmlHead = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    return zipStore([
      { name: "[Content_Types].xml", data: xmlHead + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>' },
      { name: "_rels/.rels", data: xmlHead + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
      { name: "xl/workbook.xml", data: xmlHead + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Сводка" sheetId="1" r:id="rId1"/></sheets></workbook>' },
      { name: "xl/_rels/workbook.xml.rels", data: xmlHead + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>' },
      { name: "xl/worksheets/sheet1.xml", data: xmlHead + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' + sheetRows + "</sheetData></worksheet>" }
    ]);
  }
  function downloadBlob(name, blob) {
    var u = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = u; a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(u); a.remove(); }, 800);
  }
  function exportHouse(addr) {
    var cache = svodkaCache();
    if (!cache || !cache.rows || !cache.rows.length) { toast("Нет данных — нажмите «Обновить»"); return; }
    var hA = cache.headers.indexOf("Адрес");
    var rows = cache.rows.filter(function (r) {
      return (String(r[hA] || "").trim() || "Адрес не указан") === addr;
    });
    if (!rows.length) { toast("По этому дому строк нет"); return; }
    var fname = ("Сводка — " + addr).replace(/[\\/:*?"<>|]/g, "") + ".xlsx";
    downloadBlob(fname, buildXlsx(cache.headers, rows));
    toast("Скачан файл: " + rows.length + " лифт(ов)");
  }

  /* ---------- ПЕЧАТЬ ----------
     На многих телефонах window.print() молча не работает, поэтому печатная
     форма открывается отдельной страницей в новой вкладке — оттуда её можно
     распечатать или сохранить в PDF через меню браузера. Запасной вариант —
     классическая печать из скрытого блока (десктоп). */
  var PRINT_CSS_ =
    "body{font:12pt/1.4 'Segoe UI',Arial,sans-serif;color:#000;padding:10mm}" +
    "h1{font-size:15pt;text-align:center;margin-bottom:6mm}" +
    "h3{font-size:11pt;margin:5mm 0 2mm;border-bottom:1px solid #000;padding-bottom:1mm}" +
    "table{width:100%;border-collapse:collapse}" +
    "td,th{border:1px solid #999;padding:4px 6px;vertical-align:top;text-align:left}" +
    "td.v,th{font-weight:600}.ah{margin-bottom:5mm;line-height:1.7}.sign{margin-top:10mm;line-height:2}" +
    "table.tight td,table.tight th{font-size:9pt;padding:2px 4px}" +
    ".cardPrint{font-size:9pt;line-height:1.25}.cardPrint h1{font-size:14pt;margin-bottom:3mm}" +
    ".cardPrint h3{font-size:10pt;margin:3mm 0 1mm}.cardPrint td:first-child{width:63%}" +
    "td.c{text-align:center}" +
    "table.flGrid{table-layout:fixed}" +
    "table.flGrid td,table.flGrid th{font-size:6.5pt;padding:1px;text-align:center}" +
    "table.flGrid td.flName,table.flGrid th.flName{width:34mm;text-align:left;font-size:7.5pt;padding:2px 3px}" +
    ".printMeta{margin-top:4mm;font-size:8pt;color:#555}" +
    ".pbar{position:sticky;top:0;z-index:5;background:#FFF3CD;border:1px solid #E3B341;border-radius:8px;" +
    "padding:10px 14px;margin-bottom:12px;font-size:10pt;line-height:1.5}" +
    ".pbar button{display:inline-block;margin:0 8px 8px 0;padding:12px 20px;font-size:11pt;font-weight:700;" +
    "border:1px solid #8A6D00;border-radius:8px;background:#fff;color:#000;cursor:pointer}" +
    ".ptip{color:#5B4A00}" +
    "@media print{.noprint{display:none}}";

  function printHTML(inner, fileName) {
    var hint = '<div class="noprint pbar">' +
      '<button type="button" id="downloadAct" onclick="savePdf_()">Скачать акт (PDF)</button>' +
      '<div class="ptip">PDF содержит две страницы акта. На iPhone после открытия меню выберите «Сохранить в Файлы».</div></div>' +
      '<script>async function savePdf_(){' +
      'var btn=document.getElementById("downloadAct");btn.disabled=true;btn.textContent="Формируем PDF…";' +
      'try{if(!window.html2canvas||!window.jspdf)throw new Error("PDF-модуль не загружен");' +
      'var pdf=new window.jspdf.jsPDF({orientation:"portrait",unit:"mm",format:"a4",compress:true});' +
      'var nodes=Array.from(document.querySelectorAll(".actpg,.apx"));' +
      'if(!nodes.length){var one=document.querySelector(".act");if(one)nodes=[one];}' +
      'var first=true;' +
      'function loadImg(src){return new Promise(function(ok,no){var im=new Image();im.onload=function(){ok(im)};im.onerror=no;im.src=src;});}' +
      'for(var n=0;n<nodes.length;n++){' +
      'var canvas;' +
      'if(nodes[n].classList.contains("actpg")){' +
      // Бланк собираем через штатный SVG-рендер браузера: так координаты текста
      // в PDF совпадают с экранным предпросмотром (html2canvas съезжает по SVG).
      'canvas=document.createElement("canvas");canvas.width=1588;canvas.height=2245;' +
      'var actx=canvas.getContext("2d");actx.fillStyle="#fff";actx.fillRect(0,0,canvas.width,canvas.height);' +
      'var bg=nodes[n].querySelector("img"),sv=nodes[n].querySelector("svg");' +
      'if(bg)actx.drawImage(await loadImg(bg.src),0,0,canvas.width,canvas.height);' +
      'if(sv){var sc=sv.cloneNode(true);sc.setAttribute("width",canvas.width);sc.setAttribute("height",canvas.height);' +
      'var su=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(sc)],{type:"image/svg+xml;charset=utf-8"}));' +
      'actx.drawImage(await loadImg(su),0,0,canvas.width,canvas.height);URL.revokeObjectURL(su);}' +
      '}else{canvas=await html2canvas(nodes[n],{scale:2,backgroundColor:"#fff",useCORS:true,logging:false});}' +
      'var pageH=Math.ceil(canvas.width*297/210);' +
      'for(var y=0;y<canvas.height;y+=pageH){' +
      'var h=Math.min(pageH,canvas.height-y),part=document.createElement("canvas");' +
      'part.width=canvas.width;part.height=h;var ctx=part.getContext("2d");' +
      'ctx.fillStyle="#fff";ctx.fillRect(0,0,part.width,part.height);ctx.drawImage(canvas,0,y,canvas.width,h,0,0,canvas.width,h);' +
      'if(!first)pdf.addPage();first=false;' +
      'pdf.addImage(part.toDataURL("image/jpeg",0.95),"JPEG",0,0,210,297*h/pageH,undefined,"FAST");' +
      '}}' +
      'var name=' + JSON.stringify(fileName || "akt-priemki-lifta.pdf") + ',blob=pdf.output("blob"),file=new File([blob],name,{type:"application/pdf"});' +
      'var ios=/iPad|iPhone|iPod/.test(navigator.userAgent);' +
      'if(ios&&navigator.canShare&&navigator.canShare({files:[file]})){await navigator.share({files:[file],title:name});}' +
      'else{var a=document.createElement("a"),url=URL.createObjectURL(blob);a.href=url;a.download=name;' +
      'document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url)},60000);}' +
      'btn.textContent="Скачать акт ещё раз";btn.disabled=false;' +
      '}catch(e){btn.disabled=false;btn.textContent="Скачать акт (PDF)";' +
      'if(e&&e.name!=="AbortError")alert("Не удалось сформировать PDF. Обновите приложение и попробуйте ещё раз.");}}<\/script>';
    var vendorBase = new URL("vendor/", location.href).href;
    var doc = '<!doctype html><html><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>Акт приёмки лифта</title>' +
      '<script src="' + vendorBase + 'html2canvas.min.js"><\/script>' +
      '<script src="' + vendorBase + 'jspdf.umd.min.js"><\/script>' +
      '<style>' + PRINT_CSS_ + '</style></head><body>' + hint + inner + '</body></html>';
    var blob = new Blob([doc], { type: "text/html;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    try {
      var w = window.open(url, "_blank");
      if (w) { toast("Печатная форма открыта в новой вкладке"); return; }
    } catch (e) {}
    // Всплывающая вкладка заблокирована (частый случай на iPhone/PWA):
    // открываем форму в этой же вкладке, где кнопка сформирует настоящий PDF.
    try {
      location.href = url;
    } catch (e2) {
      toast("Не удалось открыть акт — обновите приложение и попробуйте ещё раз");
    }
  }

  function itemLabel(f, id) {
    var it = findItem(f.type, id);
    return it ? (it.node + " — " + it.works) : id;
  }

  function itemValue(d, k) {
    var r = d.results[k];
    var it = findItem(d.formType, k, d.lift && d.lift.u);
    var t = it ? itemType(it) : "check";
    var v = r && r.v;
    if (v === undefined || v === null || v === "") return ["", ""];
    var note = (r && r.note) || "";
    if (t === "check") return [v === "ok" ? "Исправно" : "Замечание", note];
    if (t === "state") return [v, note];
    if (t === "floors") return ["этажи: " + v, note];
    return [String(v), note];
  }

  // Печать акта осмотра: «Акт приёмки» печатается ПОЛНОЙ КОПИЕЙ бланка
  // «Форма_Передаточного_акта.pdf», остальные виды ТО — табличной формой
  // со всеми пунктами и ведомостью замечаний.
  var FLOORS_ = ["-2", "-1", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13",
    "14", "15", "16", "17", "18", "19", "20", "21", "22", "23", "24", "25"];
  function floorSet_(v) {
    var s = {};
    String(v || "").split(/[,\s;]+/).forEach(function (x) { if (x.trim()) s[x.trim()] = 1; });
    return s;
  }
  function printAct(d) {
    var f = findForm(d.formType, d.lift && d.lift.u);
    if (!f) { toast("Форма «" + d.formType + "» не найдена — обновите чек-листы в разделе видов ТО"); return; }
    if (d.formType === "Акт приёмки") printActBlank(d, f); else printActGeneric(d, f);
  }

  // ---------- АКТ КОМИССИОННОГО ОСМОТРА ----------
  // Заполняется по образцу templates/Акт_комиссионного_осмотра_от_20_05_2026.docx:
  // замечания собираются из актов приёмки по выбранному адресу.
  // Реквизиты организации в шапке — правятся здесь (COM_ORG_).
  var COM_ORG_ = {
    name: "ООО СП «Лифт Комплекс»",
    ogrn: "1247800119654",
    inn: "7813684448",
    kpp: "781301001",
    addr: "197022, СПб, Аптекарская наб., д. 6, лит. А, пом. 2-Н, офис 4",
    email: "info@splk-spb.ru"
  };

  function commissionGroups() {
    var g = {}, order = [];
    drafts().forEach(function (d) {
      if (d.formType !== "Акт приёмки") return;
      var addr = String((d.lift && d.lift.a) || "").trim() || "Адрес не указан";
      if (!g[addr]) { g[addr] = []; order.push(addr); }
      g[addr].push(d);
    });
    order.sort(function (x, y) { return x.localeCompare(y, "ru", { numeric: true }); });
    return order.map(function (addr) { return { addr: addr, records: g[addr] }; });
  }

  // замечания одного акта приёмки (тот же принцип, что и в actBuild_)
  function commissionDefects(d) {
    var f = findForm("Акт приёмки", d.lift && d.lift.u);
    if (!f) return [];
    var out = [];
    f.sections.forEach(function (s) {
      s.items.forEach(function (it) {
        var v = actVal_(d, it.id);
        if (!v || !v.bad) return;
        // формат как на бумаге: «узел — что сделать», без кодов пунктов чек-листа
        var t = it.node || "";
        if (v.k === "check") t = t + (v.note ? " — " + v.note : "");
        else if (v.k === "floors") t = t + " (этажи: " + (d.results[it.id].v || "") + ")" + (v.note ? " — " + v.note : "");
        else t = t + " — " + v.t + (v.note ? " (" + v.note + ")" : "");
        out.push(t);
      });
    });
    var sc = d.sectionComments || {};
    Object.keys(sc).forEach(function (k) {
      var text = String(sc[k] || "").trim();
      if (text) out.push(text);
    });
    var c = String(d.comment || "").trim();
    if (c) out.push(c);
    return out;
  }

  function printActCommission(addr, dateStr, records) {
    if (!records.length) { toast("Нет актов приёмки для этого адрес"); return; }
    var rows = "";
    records.forEach(function (d, i) {
      var defs = commissionDefects(d), lift = d.lift || {};
      rows += '<tr class="liftRow"><td class="c">' + (i + 1) + '</td><td colspan="2"><b>Заводской номер: ' +
        esc(lift.n || "—") + (lift.p ? " (секция " + esc(lift.p) + ")" : "") +
        (lift.g ? ", г/п " + esc(lift.g) + " кг" : "") + '.</b></td></tr>';
      if (!defs.length) {
        rows += '<tr><td></td><td>Замечаний не выявлено</td><td class="fix"></td></tr>';
      } else {
        defs.forEach(function (t) {
          rows += '<tr><td></td><td>' + esc(t) + '</td><td class="fix"></td></tr>';
        });
      }
    });
    var dp = String(dateStr || "").split("-");
    var dateRu = dp.length === 3 ? dp[2] + "." + dp[1] + "." + dp[0] : (dateStr || "");
    var O = COM_ORG_, logoUrl = new URL("assets/lift-kompleks-logo.png", location.href).href;
    var inner = '<div class="act commissionDoc">' +
      '<table class="lh"><tr>' +
      '<td class="logo"><img src="' + logoUrl + '" alt="Лифт Комплекс"></td>' +
      '<td class="lhc"><b>' + esc(O.name) + '</b><br>ОГРН ' + esc(O.ogrn) + '<br>ИНН ' + esc(O.inn) +
      ' КПП ' + esc(O.kpp) + '<br>Адрес: ' + esc(O.addr) + '<br>' + esc(O.email) + '</td>' +
      '<td class="lht"><b>Акт комиссионного осмотра</b><br><br><b>от ' + esc(dateRu) + ' г.</b></td>' +
      '</tr></table>' +
      '<p class="intro"><span class="introAddr">По результатам осмотра лифтового оборудования, смонтированного по адресу: <span class="addr">«' +
      esc(addr === "Адрес не указан" ? "АДРЕС" : addr) + '»</span></span><br>выявлены следующие замечания:</p>' +
      '<table class="cm"><tr><th class="c num"></th><th>Замечание</th>' +
      '<th class="fix">Отметка об устранении</th></tr>' + rows + '</table>' +
      '<div class="signBlock"><p class="signh">Подписи:</p>' +
      '<table class="sgn">' +
      '<tr><td class="who">Представитель<br>монтажной<br>организации</td><td class="sig"><div class="ln"></div><div class="cap">(подпись, Ф.И.О.)</div></td></tr>' +
      '<tr><td class="who">Представитель специализированной организации<br>по техническому обслуживанию</td><td class="sig"><div class="ln"></div><div class="cap">(подпись, Ф.И.О.)</div></td></tr>' +
      '<tr><td class="who">Представитель эксплуатирующей<br>организации</td><td class="sig"><div class="ln"></div><div class="cap">(подпись, Ф.И.О.)</div></td></tr>' +
      '<tr><td class="who">Представитель застройщика</td><td class="sig"><div class="ln"></div><div class="cap">(подпись, Ф.И.О.)</div></td></tr>' +
      '</table></div></div>';
    var css = '<style>@page{size:A4;margin:19.4mm 15mm 4.9mm 7.5mm}' +
      'body{margin:0;padding:0}.commissionDoc{width:210mm;box-sizing:border-box;margin:0 auto;padding:19.4mm 15mm 4.9mm 7.5mm;background:#fff;font:12pt/1.15 "Times New Roman",Times,serif;color:#000}' +
      '.commissionDoc,.commissionDoc *{font-family:"Times New Roman",Times,serif}' +
      '.commissionDoc table{width:100%;border-collapse:collapse}.commissionDoc td,.commissionDoc th{border:0;padding:0}' +
      '.commissionDoc table.lh{height:24mm;margin-bottom:12mm}.commissionDoc .lh td{vertical-align:top}' +
      '.commissionDoc .lh td.logo{width:52mm;padding-right:3mm}.commissionDoc .lh img{display:block;width:45.24mm;height:auto}' +
      '.commissionDoc .lh td.lhc{width:75mm;font-size:10pt;line-height:1.15}' +
      '.commissionDoc .lh td.lht{text-align:right;font-size:12pt;line-height:1.3;font-style:italic;font-weight:700;padding-top:1mm;padding-left:6mm;white-space:nowrap}' +
      '.commissionDoc p.intro{margin:0 0 0.8mm 7.5mm;font:italic 700 12pt/1.3 "Times New Roman",Times,serif}' +
      '.commissionDoc p.intro .introAddr{display:inline-block;white-space:nowrap;font:italic 700 9pt/1.3 "Times New Roman",Times,serif;letter-spacing:-0.1pt}' +
      '.commissionDoc p.intro .addr{font:italic 700 9pt/1.3 "Times New Roman",Times,serif}' +
      '.commissionDoc table.cm{table-layout:fixed;width:176.29mm;margin-left:7.5mm}.commissionDoc table.cm td,.commissionDoc table.cm th{border:0.6pt solid #000;' +
      'padding:0.25mm 1mm;vertical-align:middle;text-align:left;font-size:9pt;line-height:1.05}' +
      '.commissionDoc table.cm th{text-align:center;font-weight:400;font-size:9pt}.commissionDoc .cm .num{width:6.05mm}' +
      '.commissionDoc .cm .fix{width:42.09mm}.commissionDoc table.cm td.c{text-align:center;vertical-align:middle}.commissionDoc td.fix{height:4.2mm}' +
      '.commissionDoc .cm tr{height:4.2mm}.commissionDoc .liftRow td{height:4.2mm}.commissionDoc .liftRow td.c{font-weight:700}' +
      '.commissionDoc .signBlock{break-inside:avoid;page-break-inside:avoid;margin:9mm 0 0 7.5mm}' +
      '.commissionDoc p.signh{margin:0 0 4mm;font-size:11.5pt;font-weight:700;font-style:italic}' +
      '.commissionDoc table.sgn{table-layout:fixed}.commissionDoc table.sgn td.who{width:56%;font-size:10.5pt;font-weight:700;' +
      'font-style:italic;line-height:1.12;vertical-align:bottom;padding:0 0 6mm}' +
      '.commissionDoc table.sgn td.sig{vertical-align:bottom;padding:0 0 6mm 14mm}' +
      '.commissionDoc table.sgn .ln{border-bottom:1px solid #000;height:5mm}' +
      '.commissionDoc table.sgn .cap{margin-top:1mm;text-align:center;font-size:7pt;font-weight:400;font-style:normal;line-height:1.1}' +
      '@media print{.noprint{display:none}}</style>';
    printHTML('<style>' + css.replace(/<\/?style>/g, "") + '</style>' + inner, "akt-kommissionnogo-osmotra.pdf");
  }

  // экран выбора адреса и даты для акта комиссионного осмотра
  function renderCommissionPicker() {
    titleEl.textContent = "Акт комиссионного осмотра";
    var groups = commissionGroups();
    if (!groups.length) {
      screenEl.innerHTML = '<div class="empty">Нет актов приёмки.<br>Акт комиссионного осмотра собирается из замечаний актов приёмки по адресу.</div>';
      return;
    }
    var today = new Date();
    var def = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(today.getDate()).padStart(2, "0");
    screenEl.innerHTML =
      '<div class="sec" style="margin-top:0">Адрес объекта</div>' +
      '<div class="list">' + groups.map(function (g, i) {
        var bad = g.records.reduce(function (n, d) { return n + countBad(d); }, 0);
        return '<label class="item"><div class="row"><div class="t">' + esc(g.addr) + '</div></div>' +
          '<div class="s">актов приёмки: ' + g.records.length + (bad ? " · замечаний: " + bad : "") + '</div>' +
          '<div style="margin-top:8px"><input type="radio" name="cAddr" value="' + i + '"' + (i === 0 ? " checked" : "") + '> сформировать акт</div></label>';
      }).join("") + '</div>' +
      '<div class="sec">Дата акта</div>' +
      '<div class="item"><input type="date" id="cDate" value="' + def + '" style="width:100%;padding:12px;font-size:12pt"></div>' +
      '<button class="btn primary" id="bComGo">Сформировать акт</button>' +
      '<button class="btn" id="bComBack">Назад к исходящим</button>';
    document.getElementById("bComBack").onclick = renderOutbox;
    document.getElementById("bComGo").onclick = function () {
      var r = screenEl.querySelector('input[name="cAddr"]:checked');
      var i = r ? +r.value : 0;
      var dt = document.getElementById("cDate").value;
      if (!dt) { toast("Укажите дату акта"); return; }
      printActCommission(groups[i].addr, dt, groups[i].records);
    };
  }
  function printActGeneric(d, f) {
    var FLOORS = FLOORS_, floorSet = floorSet_;
    var defects = [];
    var sectionsHtml = f.sections.map(function (s) {
      var rows = [];
      s.items.forEach(function (it) {
        var t = itemType(it);
        var r = (d.results || {})[it.id];
        var v = r && r.v, note = (r && r.note) || "";
        if (v === undefined || v === null) v = "";
        var name = it.node + (it.works ? " — " + it.works : "");
        var label = esc(it.id) + ". " + esc(name);
        // ведомость замечаний: только отклонения от нормы
        if (t === "check" && v === "bad") defects.push([it.id, name, "ЗАМЕЧАНИЕ" + (note ? ": " + note : "")]);
        else if (t === "state" && v !== "" && v !== it.options[0]) defects.push([it.id, it.node, String(v) + (note ? " (" + note + ")" : "")]);
        else if (t === "floors" && String(v).trim() !== "") defects.push([it.id, name, "этажи: " + v]);
        // строки формы
        if (t === "floors") {
          var marks = floorSet(v);
          rows.push('<tr><td class="flName">' + label + '</td>' + FLOORS.map(function (fl) {
            return '<td class="fl">' + (marks[fl] ? "✕" : "") + '</td>';
          }).join("") + '</tr>');
        } else {
          var val = "";
          if (t === "check") val = v === "ok" ? "исправно" : (v === "bad" ? ("ЗАМЕЧАНИЕ" + (note ? ": " + note : "")) : "");
          else if (t === "state") val = String(v) + (note ? " (" + note + ")" : "");
          else val = String(v);
          rows.push('<tr><td>' + label + '</td><td class="v">' + esc(val) + '</td></tr>');
        }
      });
      var hasFloors = s.items.some(function (it) { return itemType(it) === "floors"; });
      var head = hasFloors
        ? '<tr><th class="flName">Этаж</th>' + FLOORS.map(function (fl) { return '<th class="fl">' + fl + '</th>'; }).join("") + '</tr>'
        : "";
      return '<h3>' + esc(s.name) + '</h3><table' + (hasFloors ? ' class="flGrid"' : "") + '>' + head + rows.join("") + '</table>';
    });
    // ведомость замечаний: № по порядку, пункт, наименование, полный вид дефекта
    var defHtml = '<h3>ВЕДОМОСТЬ ЗАМЕЧАНИЙ</h3>' +
      (defects.length
        ? '<table><tr><th style="width:6%">№</th><th style="width:11%">Пункт</th><th style="width:43%">Наименование</th><th>Замечание</th></tr>' +
          defects.map(function (x, i) {
            return '<tr><td class="c">' + (i + 1) + '</td><td class="c">' + esc(x[0]) + '</td><td>' + esc(x[1]) + '</td><td class="v">' + esc(x[2]) + '</td></tr>';
          }).join("") + '</table>'
        : '<p class="ah">Замечаний нет.</p>');
    var org = settings().org || "_______________________";
    var dp = String(d.date || "").split("-"); // гггг-мм-дд
    var day = dp[2] || "____", mon = dp[1] || "______", yr = dp[0] ? dp[0].slice(2) : "____";
    printHTML(
      '<div class="act">' +
      '<h1>АКТ ОСМОТРА ЛИФТА</h1>' +
      '<p class="ah">«' + esc(day) + '» ' + esc(mon) + ' 20' + esc(yr) + ' г. &nbsp;&nbsp; Заводской №: <b>' + esc(d.lift.n) + '</b> &nbsp;&nbsp; ' +
      'Обслуживающая организация: ' + esc(org) + '<br>' +
      'Адрес: <b>' + esc(d.lift.a) + '</b>' + (d.lift.p ? ', парадная/секция ' + esc(d.lift.p) : "") + ' &nbsp;&nbsp; ' +
      'Пр-тель и модель лифта: ' + esc(d.model || "_______________________") + '<br>' +
      'Вид ТО: ' + esc(d.formType) + ' &nbsp;&nbsp; Г/П: ' + esc(d.lift.g || "—") + ' кг &nbsp;&nbsp; Исполнитель: ' + esc(d.worker || "—") + '</p>' +
      sectionsHtml.join("") +
      defHtml +
      (d.comment ? '<h3>ОТДЕЛЬНЫЕ ЗАМЕЧАНИЯ</h3><p class="ah">' + esc(d.comment) + '</p>' : "") +
      '<p class="sign">Исполнитель: _______________ / ' + esc(d.worker || "") + ' /<br>' +
      'Представитель заказчика: _______________ / _______________ /</p>' +
      '</div>'
    );
  }

  /* ACT_FORM:BEGIN — бланк вынесен в act_form.js (генерируется tools/gen_act_form.py) */
 // ---- «Акт приёмки»: ТОЧНАЯ КОПИЯ бланка «Форма_Передаточного_акта.pdf» ----
  // Подложка — сам бланк (2 страницы A4, 300 dpi). Значения печатаются поверх, на тех же линиях и в тех же
  // клетках: координаты сняты с оригинального PDF (ACT_FORM.g). Пункты чек-листа, которых в бланке нет,
  // и ведомость замечаний вынесены на страницу-приложение — бланк остаётся таким, как на бумаге.
  var ACT_UNITS_ = { "А3.2": " %", "А3.3": " мм", "А3.8": " мм" };
  var ACT_MONTHS_ = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
  var ACT_TEXT_SIZE_ = 10, ACT_NOTE_SIZE_ = 9.5;
  var actCtx_ = null;
  function actTw_(str, bold) {            // ширина строки при кегле 1 (в тех же шрифтах, что и в печатной форме)
    if (!actCtx_) actCtx_ = document.createElement("canvas").getContext("2d");
    actCtx_.font = (bold ? "bold " : "") + "100px Calibri, Carlito, Arial, Helvetica, sans-serif";
    return actCtx_.measureText(String(str)).width / 100;
  }
  // Вписать полный текст в поле бланка: уменьшаем кегль, но никогда не обрезаем замечание.
  function actFit_(str, w, size, bold) {
    str = String(str);
    var tw = actTw_(str, bold);
    if (tw * size <= w) return { t: str, s: size, cut: false };
    return { t: str, s: Math.max(3, w / tw), cut: false };
  }
  function actWrap_(str, w, size, bold) {
    var out = [];
    String(str).split("\n").forEach(function (para) {
      var words = para.split(/\s+/).filter(Boolean), cur = "";
      words.forEach(function (wd) {
        var nxt = cur ? cur + " " + wd : wd;
        if (cur && actTw_(nxt, bold) * size > w) { out.push(cur); cur = wd; } else cur = nxt;
      });
      if (cur || !words.length) out.push(cur);
    });
    return out;
  }
  // Все замечания остаются на бланке: подбираем кегль под число свободных строк,
  // ничего не обрезаем и не выносим в отдельное приложение.
  function actFitLines_(entries, w, maxLines) {
    var size = ACT_NOTE_SIZE_, lines = [];
    while (size >= 0.5) {
      // Замечания идут сплошным перечнем: короткие пункты могут занимать одну строку вместе.
      lines = actWrap_(entries.join("; "), w, size, false);
      if (lines.length <= maxLines) return { lines: lines, size: size };
      size = Math.round((size - (size > 3 ? 0.5 : 0.25)) * 100) / 100;
    }
    return { lines: lines, size: size };
  }
  // значение пункта для печати: { t: короткий текст в строку бланка, full: полный текст, bad, note, k }
  function actVal_(d, id) {
    var it = findItem("Акт приёмки", id, d.lift && d.lift.u);
    var r = (d.results || {})[id];
    var v = r && r.v, note = (r && r.note) || "";
    if (v === undefined || v === null || String(v) === "") return null;
    var k = it ? itemType(it) : "state";
    if (k === "check") return v === "bad"
      // в бланке — не общее слово, а само замечание из чек-листа (примечание);
      // если примечание пусто — остаётся «ЗАМЕЧАНИЕ»
      ? { k: k, t: note || "ЗАМЕЧАНИЕ", full: note || "ЗАМЕЧАНИЕ", bad: true, note: note }
      : { k: k, t: "исправно", full: "исправно", bad: false, note: note };
    if (k === "state") {
      var bad = !!(it && it.options && v !== it.options[0]);
      return { k: k, t: String(v), full: String(v) + (note ? " (" + note + ")" : ""), bad: bad, note: note };
    }
    if (k === "count") return { k: k, t: String(v) + (ACT_UNITS_[id] || ""), full: String(v) + (ACT_UNITS_[id] || ""), bad: false, note: note };
    return { k: k, t: String(v), full: "этажи: " + v, bad: true, note: note };      // floors
  }

  function actBuild_(d, f) {
    var G = ACT_FORM.g, FL = G.floors;
    var onForm = {}, vals = {};
    G.f.forEach(function (x) { onForm[x.id] = x; });
    G.grids.forEach(function (g) { g.ids.forEach(function (i) { if (i) onForm[i] = true; }); });
    var defects = [], extras = [], notes = [];
    f.sections.forEach(function (s) {
      s.items.forEach(function (it) {
        var v = actVal_(d, it.id);
        if (!v) return;
        vals[it.id] = v;
        var lab = it.node || (onForm[it.id] && onForm[it.id].lab) || it.id;
        v.lab = lab;
        if (v.bad) defects.push({ id: it.id, lab: lab, text: v.full, sec: String(it.id).slice(0, 2) });
        else if (v.note) notes.push({ id: it.id, lab: lab, text: v.note });
        if (!onForm[it.id]) extras.push({ id: it.id, lab: it.node, v: v });
      });
    });
    var p1 = [], p2 = [];
    function T(arr, x, y, str, size, bold) {
      arr.push('<text x="' + x + '" y="' + y + '" font-size="' + (Math.round(size * 100) / 100) + '"' + (bold ? ' font-weight="700"' : "") + ">" + esc(str) + "</text>");
    }
    function fieldText(arr, fld, str, bold) {
      if (str === "" || str == null) return null;
      T(arr, fld.x + (fld.w < 30 ? 1.5 : 3), fld.b, str, ACT_TEXT_SIZE_, bold);
      return { t: str, s: ACT_TEXT_SIZE_, cut: false };
    }
    // Значения чек-листа печатаются ОДНИМ кеглем (без уменьшения).
    // Если значение не влезает в свою графу — возвращаем false, и оно уходит
    // в свободные строки внизу раздела в формате «узел – что сделать».
    function fieldTextFixed(arr, fld, str, bold) {
      if (str === "" || str == null) return true;
      var size = ACT_TEXT_SIZE_;
      if (actTw_(str, bold) * size > fld.w - 7) return false;
      T(arr, fld.x + (fld.w < 30 ? 1.5 : 5), fld.b, str, size, bold);
      return true;
    }
    // Цифры даты крупнее и без автоматического сжатия: особенно важно для двух цифр года.
    function fieldTextDate(arr, fld, str) {
      if (str === "" || str == null) return;
      T(arr, fld.x + 1.5, fld.b, str, 12, false);
    }
    // шапка
    var dp = String(d.date || "").split("-"), H = G.hdr;
    if (dp.length === 3) {
      fieldTextDate(p1, H.day, String(+dp[2]));
      fieldText(p1, H.mon, ACT_MONTHS_[+dp[1] - 1] || "");
      fieldTextDate(p1, H.yr, dp[0].indexOf("202") === 0 ? dp[0].slice(3) : dp[0].slice(-2));
    }
    fieldText(p1, H.num, (d.lift && d.lift.n) || "");
    fieldText(p1, H.org, settings().org || "");
    fieldText(p1, H.addr, ((d.lift && d.lift.a) || "") + (d.lift && d.lift.p ? ", парадная " + d.lift.p : ""));
    fieldText(p1, H.model, d.model || "");
    // Подписи пунктов на бланке СТЁРТЫ (фон зачищен) — рисуем названия из чек-листа
    // на тех же местах, с кеглем/насыщенностью оригинала (геометрия g.f[].lg / g.lbl).
    // Подписи на бланке = короткие названия из файла «Названия пунктов — бланк акта приёмки»
    // (приходят в пункте как it.lab); полные названия it.node — только в замечаниях/приложении.
    var names = {};
    f.sections.forEach(function (s) { s.items.forEach(function (it) { names[it.id] = it.lab || it.node; }); });
    function labelText(arr, geo, str, rightBound) {
      if (!geo || str == null || str === "") return;
      var w = rightBound - geo.x - 2;
      if (w < 10) return;
      var size = geo.s || 10, lines = [str];
      if (actTw_(str, !!geo.bold) * size > w) {
        size = Math.max(6.5, w / actTw_(str, !!geo.bold));
        // в оригинале длинные подписи занимают две строки: переносим по словам
        if (actTw_(str, !!geo.bold) * 6.5 > w + 0.01) {
          var words = String(str).split(/\s+/), two = null;
          for (var i = 1; i < words.length; i++) {
            var l1 = words.slice(0, i).join(" "), l2 = words.slice(i).join(" ");
            if (actTw_(l1, !!geo.bold) * 6.5 <= w && actTw_(l2, !!geo.bold) * 6.5 <= w) { two = [l1, l2]; break; }
          }
          if (!two) { // не нашли разбиение, где обе строки влезают — делим пополам и ужимаем
            var half = Math.ceil(words.length / 2);
            two = [words.slice(0, half).join(" "), words.slice(half).join(" ") || " "];
          }
          size = Math.max(4, Math.min(geo.s || 10, w / Math.max(actTw_(two[0], !!geo.bold), actTw_(two[1], !!geo.bold))));
          lines = two;
        }
      }
      if (lines.length === 1) T(arr, geo.x, geo.b, lines[0], size, !!geo.bold);
      else { T(arr, geo.x, geo.b, lines[1], size, !!geo.bold); T(arr, geo.x, geo.b - size * 1.15, lines[0], size, !!geo.bold); }
    }
    G.f.forEach(function (fld) { labelText(p1, fld.lg, names[fld.id], fld.x); });
    G.grids.forEach(function (gr) {
      gr.ids.forEach(function (id) {
        if (!id || !G.lbl || !G.lbl[id]) return;
        labelText(p2, G.lbl[id], names[id], gr.xs[1] - 1);
      });
    });
    // поля бланка: одним размером; не влезло — в нижний блок раздела
    var overflow = [];
    G.f.forEach(function (fld) {
      var v = vals[fld.id];
      if (!v) return;
      if (!fieldTextFixed(p1, fld, v.t, v.bad) && !v.bad) {
        overflow.push({ sec: String(fld.id).slice(0, 2), text: v.lab + " – " + v.full });
      }
    });
    // Свободные строки внизу раздела: комментарий, все замечания раздела и всё,
    // что не вместилось в графы — в формате «узел – что сделать»
    // (напр. «Контакторы – требуется протяжка»), без кодов пунктов.
    var sc = d.sectionComments || {};
    ["А1", "А2", "А3", "А4"].forEach(function (sec) {
      var lines = G.free[sec], entries = [];
      if (sc[sec] && String(sc[sec]).trim()) entries.push(String(sc[sec]).trim());
      defects.filter(function (x) { return x.sec === sec; }).forEach(function (x) {
        entries.push(x.lab + " – " + x.text);
      });
      overflow.filter(function (x) { return x.sec === sec; }).forEach(function (x) {
        entries.push(x.text);
      });
      var fitted = actFitLines_(entries, lines[0].w - 4, lines.length);
      fitted.lines.forEach(function (tx, i) { T(lines[i].p === 2 ? p2 : p1, lines[i].x + 2, lines[i].b, tx, fitted.size); });
    });
    // поэтажные таблицы
    G.grids.forEach(function (g) {
      g.ids.forEach(function (id, r) {
        var v = id && vals[id];
        if (!v) return;
        var marks = {};
        String(d.results[id].v || "").split(/[,\s;]+/).forEach(function (x) { if (x.trim()) marks[x.trim()] = 1; });
        FL.forEach(function (fl, c) {
          if (!marks[fl]) return;
          var x0 = g.xs[c + 1], x1 = g.xs[c + 2], y0 = g.ys[r + 1], y1 = g.ys[r + 2];
          var pad = Math.min(x1 - x0, y1 - y0) * 0.27;
          p2.push('<path d="M' + (x0 + pad) + " " + (y0 + pad) + "L" + (x1 - pad) + " " + (y1 - pad) + "M" + (x1 - pad) + " " + (y0 + pad) + "L" + (x0 + pad) + " " + (y1 - pad) + '" stroke="#000" stroke-width="1.1" fill="none"/>');
        });
      });
    });
    // «Отдельные замечания» — полный текст на бланке, без сокращений.
    var rem = G.rem, rtexts = [];
    if (d.comment) rtexts.push(String(d.comment));
    var remFit = actFitLines_(rtexts, rem[0].w - 4, rem.length);
    remFit.lines.forEach(function (tx, i) { T(p2, rem[i].x + 2, rem[i].b, tx, remFit.size); });
    return { p1: p1.join(""), p2: p2.join("") };
  }

  // ---------- НОВЫЙ PDF АКТА ДЛЯ ОТПРАВКИ НА СЕРВЕР ----------
  // Используется тот же ACT_FORM и тот же actBuild_, что при печати из приложения.
  var actPdfLibPromise_ = null;
  function ensureActPdfLib_() {
    if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve();
    if (actPdfLibPromise_) return actPdfLibPromise_;
    actPdfLibPromise_ = new Promise(function (resolve, reject) {
      var sc = document.createElement("script");
      sc.src = "vendor/jspdf.umd.min.js";
      sc.onload = function () { resolve(); };
      sc.onerror = function () { actPdfLibPromise_ = null; reject(new Error("Не загрузился PDF-модуль приложения")); };
      document.head.appendChild(sc);
    });
    return actPdfLibPromise_;
  }
  function actPdfLoadImage_(src) {
    return new Promise(function (resolve, reject) {
      var im = new Image();
      im.onload = function () { resolve(im); };
      im.onerror = function () { reject(new Error("Не загрузилась страница нового бланка")); };
      im.src = src;
    });
  }
  function actPdfPageCanvas_(svgText, bg) {
    var canvas = document.createElement("canvas");
    canvas.width = 1588; canvas.height = 2245;
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    return actPdfLoadImage_(bg).then(function (bgImage) {
      ctx.drawImage(bgImage, 0, 0, canvas.width, canvas.height);
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + canvas.width + '" height="' + canvas.height +
        '" viewBox="0 0 ' + ACT_FORM.g.W + " " + ACT_FORM.g.H + '" font-family="Calibri,Carlito,Arial,Helvetica,sans-serif" fill="#000">' + svgText + "</svg>";
      var url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
      return actPdfLoadImage_(url).then(function (svgImage) {
        ctx.drawImage(svgImage, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        return canvas;
      });
    });
  }
  function actPdfBase64FromApp_(d, f) {
    if (typeof ACT_FORM === "undefined") return Promise.reject(new Error("Нет данных нового бланка — обновите приложение"));
    return ensureActPdfLib_().then(function () {
      var built = actBuild_(d, f);
      var pdf = new window.jspdf.jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
      return actPdfPageCanvas_(built.p1, ACT_FORM.bg[0]).then(function (page1) {
        pdf.addImage(page1.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, 210, 297, undefined, "FAST");
        return actPdfPageCanvas_(built.p2, ACT_FORM.bg[1]);
      }).then(function (page2) {
        pdf.addPage();
        pdf.addImage(page2.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, 210, 297, undefined, "FAST");
        var result = pdf.output("datauristring");
        var base64 = result.slice(result.indexOf(",") + 1);
        if (!base64) throw new Error("Приложение не смогло создать PDF акта");
        return base64;
      });
    });
  }

  function printActBlank(d, f) {
    if (typeof ACT_FORM === "undefined") { toast("Нет данных бланка — обновите приложение"); return; }
    var b = actBuild_(d, f), G = ACT_FORM.g;
    var css = '<style>@page{size:A4;margin:0}' +
      '.actpg{position:relative;width:100%;max-width:210mm;margin:0 auto 8px;aspect-ratio:595.3/841.9;background:#fff;box-shadow:0 0 0 1px #ccc;overflow:hidden}' +
      '.actpg img{position:absolute;left:0;top:0;width:100%;height:100%;display:block}' +
      '.actpg svg{position:absolute;left:0;top:0;width:100%;height:100%;font-family:Calibri,Carlito,Arial,Helvetica,sans-serif;fill:#000}' +
      '@media print{.actpg{width:210mm;max-width:none;height:297mm;aspect-ratio:auto;margin:0;box-shadow:none;break-after:page;page-break-after:always}' +
      '.actpg:last-child{break-after:auto;page-break-after:auto}}</style>';
    function page(bg, svg) {
      return '<div class="actpg"><img alt="" src="' + bg + '"><svg viewBox="0 0 ' + G.W + " " + G.H + '" xmlns="http://www.w3.org/2000/svg">' + svg + "</svg></div>";
    }
    // Только две страницы фирменного бланка. Отдельного приложения нет.
    printHTML(css + page(ACT_FORM.bg[0], b.p1) + page(ACT_FORM.bg[1], b.p2));
  }

  // Карточка лифта из сводки для печати: общие сведения + компактные модули
  function printSvodkaLift(headers, r) {
    var info = ["Участок","Заказчик","Адрес","№ парадной","№ лифта","Г/П, кг","Вид ТО (последнее)","Дата последнего ТО"];
    var infoRows = info.map(function (h) {
      var i = headers.indexOf(h);
      return i >= 0 ? '<tr><td>' + esc(h) + '</td><td class="v">' + esc(r[i] || "—") + '</td></tr>' : "";
    }).join("");
    var groups = groupedSvodkaRows(headers, r);
    var body = groups.map(function (g) {
      return '<h3>' + esc(g.name) + '</h3><table class="tight">' + g.rows.map(function (x) {
        return '<tr><td>' + esc(x[0]) + '</td><td class="v">' + esc(x[1]) + '</td></tr>';
      }).join("") + '</table>';
    }).join("");
    var ci = headers.indexOf("Комментарии"), comment = ci >= 0 ? r[ci] : "";
    printHTML('<div class="act cardPrint"><h1>КАРТОЧКА СОСТОЯНИЯ ЛИФТА</h1>' +
      '<table class="tight">' + infoRows + '</table>' + body +
      (comment ? '<h3>Комментарии</h3><p class="ah">' + esc(comment) + '</p>' : "") +
      '<p class="printMeta">Сформировано: ' + esc(new Date().toLocaleString()) + '</p></div>');
  }

  // Вся сводка компактным списком (админ)
  function printSvodkaList(cache) {
    var hA = cache.headers.indexOf("Адрес"), hN = cache.headers.indexOf("№ лифта"),
        hU = cache.headers.indexOf("Участок"), hV = cache.headers.indexOf("Вид ТО (последнее)"),
        hD = cache.headers.indexOf("Дата последнего ТО");
    var rows = cache.rows.map(function (r) {
      return "<tr><td>" + esc(r[hU]) + "</td><td>" + esc(r[hA]) + "</td><td>" + esc(r[hN]) + "</td><td>" +
        esc(r[hV]) + '</td><td class="v">' + esc(r[hD] || "—") + "</td></tr>";
    });
    printHTML('<div class="act"><h1>СВОДКА СОСТОЯНИЯ ЛИФТОВ</h1>' +
      '<p class="ah">Сформировано: ' + new Date().toLocaleString() + "</p>" +
      '<table class="tight"><tr><th>Участок</th><th>Адрес</th><th>№</th><th>Последнее ТО</th><th>Дата осмотра</th></tr>' +
      rows.join("") + "</table></div>");
  }

  // ---------- сервис-воркер: приложение обновляется само, чистить кеш не нужно ----------
  var pendingUpdate = false, updateReloading = false, hadSwController = !!navigator.serviceWorker.controller;
  var APP_BUILD = "2.8.5";
  function applyUpdate() {
    if (updateReloading) return;
    // Некоторые браузеры шлют update и controllerchange почти одновременно.
    // Разрешаем только одну перезагрузку за 10 секунд, чтобы не получить цикл.
    var now = Date.now(), last = 0;
    try { last = Number(sessionStorage.getItem("to_update_reload") || 0); } catch (e) {}
    if (now - last < 10000) return;
    updateReloading = true;
    try { sessionStorage.setItem("to_update_reload", String(now)); } catch (e2) {}
    // Новая навигация, а не повтор текущего документа: исключаем возврат старой
    // страницы из BFCache и явно помечаем переход на загруженную оболочку.
    var target = new URL(location.href);
    target.searchParams.set("upd", String(now));
    location.replace(target.href);
  }
  function setAppVer_(ver) {
    window.__appVer = APP_BUILD + (ver ? " · " + ver : "");
    var el = document.getElementById("appVer");
    if (el) el.textContent = window.__appVer;
  }
  function requestAppVer_() {
    if (!("serviceWorker" in navigator)) return;
    var c = navigator.serviceWorker.controller;
    if (c) c.postMessage({ type: "ver" });
  }
  // плашка под шапкой: «Доступна новая версия» (осмотры сохраняются в телефоне, перезагрузка их не теряет)
  function showUpdateBar() {
    if (document.getElementById("updBar")) return;
    var b = document.createElement("div");
    b.id = "updBar";
    b.setAttribute("style", "position:fixed;left:12px;right:12px;top:calc(var(--topbar-h,64px) + 8px);z-index:60;max-width:536px;margin:0 auto;" +
      "background:#1F4E78;color:#fff;border-radius:14px;padding:10px 10px 10px 16px;display:flex;align-items:center;gap:12px;" +
      "box-shadow:0 6px 24px rgba(0,0,0,.28);font-size:.92rem");
    b.innerHTML = '<span style="flex:1;min-width:0">Доступна новая версия приложения</span>' +
      '<button type="button" style="flex:none;border:0;border-radius:10px;padding:9px 14px;font:inherit;font-weight:700;background:#fff;color:#1F4E78;cursor:pointer">Обновить</button>';
    b.querySelector("button").onclick = applyUpdate;
    document.body.appendChild(b);
  }
  // Пакет уже скачан целиком и атомарно переключён в lift-meta/current.
  // Перезагружаем страницу на любом экране: черновики и введённые осмотры хранятся отдельно.
  function onUpdateReady() {
    pendingUpdate = true;
    applyUpdate();
  }
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", function (e) {
      var d = e.data || {};
      if (d.type === "ver") setAppVer_(d.ver);
      if (d.type === "checkResult" && window.__onUpd) window.__onUpd(d);
      if (d.type === "update" && !d.first) {
        setAppVer_(d.ver);
        // При ручной проверке ждём точный checkResult, а не перезагружаемся по событию.
        if (!window.__onUpd) onUpdateReady();
      }
    });
    navigator.serviceWorker.addEventListener("controllerchange", function () {
      var c = navigator.serviceWorker.controller;
      if (c) c.postMessage({ type: "ver" });
      // При первой установке страница и так только что загружена с сервера.
      // При СМЕНЕ воркера старый JS уже в памяти — обязательно загружаем новую оболочку.
      if (hadSwController) applyUpdate();
      hadSwController = true;
    });
    navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then(function (reg) {
      function check() {
        try { reg.update(); } catch (e) {}
        var c = navigator.serviceWorker.controller;
        if (c) c.postMessage({ type: "check" });
      }
      // вернулись в приложение (iPhone держит его в памяти днями) — проверить обновления
      document.addEventListener("visibilitychange", function () {
        if (document.hidden) return;
        check();
        if (pendingUpdate && (state.view === "home" || state.view === "login")) applyUpdate();
      });
      setInterval(check, 15 * 60 * 1000);
      navigator.serviceWorker.ready.then(function () {
        // Сначала заставляем браузер сверить именно sw.js, затем проверяем всю оболочку.
        reg.update().catch(function () {});
        var c = navigator.serviceWorker.controller;
        if (c) { c.postMessage({ type: "ver" }); c.postMessage({ type: "check" }); }
      });
    }).catch(function () {});
  }

  // старт
  refreshLifts();
  if (account() && !isAdmin()) refreshForms(account().u);
  autoSync();
  if (!account()) state.stack = [], render("login");
  else render("home");

  // сообщить сторожу запуска из index.html, что приложение поднялось
  if (window.__BOOT_DONE) window.__BOOT_DONE();

  // бейдж Netlify перекрывает нижние кнопки — прячем при появлении
  function hideNetlifyBadge() {
    document.querySelectorAll("iframe, div, a").forEach(function (el) {
      var s = (el.id || "") + " " + (typeof el.className === "string" ? el.className : "") + " " +
              (el.src || "") + " " + (el.href || "");
      if (/netlify/i.test(s)) el.style.setProperty("display", "none", "important");
    });
  }
  if ("MutationObserver" in window) {
    new MutationObserver(hideNetlifyBadge).observe(document.documentElement, { childList: true, subtree: true });
  }
  hideNetlifyBadge();
})();
