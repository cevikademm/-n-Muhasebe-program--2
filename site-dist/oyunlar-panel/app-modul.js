/* fikoai /app — "Oyunlar" modülü
 * Uygulamanın derlenmiş koduna dokunmadan Oyunlar'ı Muhasebe · Müşteri Bulma · Sosyal Medya
 * yanına dördüncü modül olarak ekler:
 *   - Uygulamadaki her modül değiştiricide (çekmece kartları, alt sekme çubuğu, masaüstü listesi)
 *     "Sosyal Medya" öğesinin kopyası "Oyunlar" olarak eklenir.
 *   - YÖNETİM menüsüne de "Oyunlar" eklenir (bekleyen lisans kodu rozetiyle).
 *   - Tıklanınca oyun paneli (/oyunlar) uygulamanın içinde, kendi modül çubuğuyla açılır;
 *     diğer modüle geçince kapanır. Adres: fikoai.de/app#oyunlar
 * Yalnızca license_admins'teki hesap için görünür.
 */
(function () {
  var SB_URL = "https://edlbvezskqbxasqkszvd.supabase.co";
  var SB_KEY = "sb_publishable_n_54_REfovQ_V9OLiDjcCA_tPoxYOeY";
  var STORE = "sb-edlbvezskqbxasqkszvd-auth-token";
  var MARK = "data-fikoai-oyunlar";
  var COLOR = "#f59e0b";
  var allowed = false;      // license_is_admin sonucu
  var checkedToken = null;  // hangi oturum için kontrol edildi
  var pending = 0;

  var MODULES = [
    { key: "muhasebe", tr: "Muhasebe", de: "Buchhaltung", color: "#06b6d4",
      icon: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"/>' },
    { key: "musteri_bulma", tr: "Müşteri Bulma", de: "Kundengewinnung", color: "#8b5cf6",
      icon: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>' },
    { key: "sosyal_medya", tr: "Sosyal Medya", de: "Social Media", color: "#ec4899",
      icon: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.59 13.51 6.83 3.98M15.41 6.51l-6.82 3.98"/>' },
    { key: "oyunlar", tr: "Oyunlar", de: "Spiele", color: COLOR,
      icon: '<rect x="2" y="6" width="20" height="12" rx="3"/><path d="M6 12h4M8 10v4"/><path d="M15 11h.01M18 13h.01"/>' },
  ];
  var GAME_ICON = MODULES[3].icon;
  var TEXT_MAP = {
    "Sosyal Medya": "Oyunlar", "Social Media": "Spiele",
    "Medya · Hesaplar · Takvim": "Lisans · İndirme · Kapatma",
    "Medien · Konten · Kalender": "Lizenzen · Download · Sperre",
    "Hesap Planları": "Oyunlar", "Kontenplan": "Spiele",
  };

  function lang() { return findByLabel(["Buchhaltung", "Kundengewinnung"]).length && !findByLabel(["Muhasebe", "Müşteri Bulma"]).length ? "de" : "tr"; }
  function svg(paths, size) { return '<svg width="' + (size || 16) + '" height="' + (size || 16) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + "</svg>"; }

  function token() {
    try {
      var s = JSON.parse(localStorage.getItem(STORE) || "null");
      return (s && (s.access_token || (s.currentSession && s.currentSession.access_token))) || null;
    } catch (e) { return null; }
  }
  function rpc(name) {
    var t = token();
    if (!t) return Promise.resolve(null);
    return fetch(SB_URL + "/rest/v1/rpc/" + name, {
      method: "POST", body: "{}",
      headers: { apikey: SB_KEY, Authorization: "Bearer " + t, "Content-Type": "application/json" },
    }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }
  function refresh() {
    checkedToken = token();
    rpc("license_is_admin").then(function (ok) {
      allowed = ok === true;
      if (!allowed) { removeAll(); return; }
      rpc("portal_stats").then(function (s) { if (s && typeof s.pending === "number") pending = s.pending; inject(); });
      inject();
      if (location.hash === "#oyunlar") openModule(false);
    });
  }

  // ---------- modül değiştiricilere ekleme ----------
  function textOf(el) { return (el.textContent || "").replace(/\s+/g, " ").trim(); }
  function clickable(el) { return el.closest("button,a,[role=button]"); }

  function findByLabel(labels) {
    var out = [];
    var all = document.querySelectorAll("button,a,[role=button]");
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (el.hasAttribute(MARK) || el.closest("[" + MARK + "]") || el.closest("#fikoai-oyunlar-modul")) continue;
      var spans = el.querySelectorAll("span,p,div,strong");
      for (var j = 0; j < spans.length; j++) {
        if (spans[j].children.length === 0 && labels.indexOf(textOf(spans[j])) !== -1) { out.push(el); break; }
      }
    }
    return out;
  }

  function retext(node) {
    var w = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    var n;
    while ((n = w.nextNode())) {
      var t = n.nodeValue.trim();
      if (TEXT_MAP[t]) n.nodeValue = n.nodeValue.replace(t, TEXT_MAP[t]);
    }
  }

  function makeClone(src, kind) {
    var c = src.cloneNode(true);
    c.setAttribute(MARK, kind);
    c.removeAttribute("aria-current");
    retext(c);
    var s = c.querySelector("svg");
    if (s) { var h = document.createElement("span"); h.innerHTML = svg(GAME_ICON, s.getAttribute("width") || 16); var ns = h.firstChild; ns.setAttribute("class", s.getAttribute("class") || ""); s.replaceWith(ns); }
    // aktif görünümü sıfırla
    c.querySelectorAll("*").forEach(function (e) {
      if (e.style && /236,\s*72,\s*153|#ec4899/i.test(e.getAttribute("style") || "")) {
        e.setAttribute("style", (e.getAttribute("style") || "").replace(/236,\s*72,\s*153/g, "245,158,11").replace(/#ec4899/gi, COLOR));
      }
    });
    if (/236,\s*72,\s*153|#ec4899/i.test(c.getAttribute("style") || ""))
      c.setAttribute("style", c.getAttribute("style").replace(/236,\s*72,\s*153/g, "245,158,11").replace(/#ec4899/gi, COLOR));
    c.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); openModule(true); }, true);
    return c;
  }

  function badge(el) {
    var b = el.querySelector("[data-fikoai-badge]");
    if (!pending) { if (b) b.remove(); return; }
    if (!b) {
      b = document.createElement("span");
      b.setAttribute("data-fikoai-badge", "1");
      var column = getComputedStyle(el).flexDirection === "column";
      b.style.cssText = "min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:#f59e0b;color:#1a1200;font-size:10.5px;font-weight:800;display:inline-flex;align-items:center;justify-content:center;flex:none;" +
        (column ? "position:absolute;top:4px;left:calc(50% + 6px);" : "margin-left:auto;");
      if (column && getComputedStyle(el).position === "static") el.style.position = "relative";
      el.appendChild(b);
    }
    b.textContent = String(pending);
  }

  function inject() {
    if (!allowed) return;
    // 1) modül değiştiriciler: "Sosyal Medya" öğesinin bulunduğu her grup
    findByLabel(["Sosyal Medya", "Social Media"]).forEach(function (src) {
      // Aynı grupta Muhasebe de olmalı (gerçek modül listesi olduğundan emin ol)
      var item = src, group = src.parentElement;
      while (group && !/Muhasebe|Buchhaltung/.test(textOf(group))) { item = group; group = group.parentElement; }
      if (!group || group === document.body) return;
      // gerçek modül değiştirici: Müşteri Bulma da var ve en fazla birkaç öğe
      if (!/Müşteri Bulma|Kundengewinnung/.test(textOf(group)) || group.children.length > 8) return;
      if (group.querySelector("[" + MARK + "='modul']")) { badge(group.querySelector("[" + MARK + "='modul']")); return; }
      var clone = makeClone(item, "modul");
      item.insertAdjacentElement("afterend", clone);
      badge(clone.matches("button,a") ? clone : (clone.querySelector("button,a") || clone));
    });
    // 2) YÖNETİM menüsü
    findByLabel(["Hesap Planları", "Kontenplan"]).forEach(function (src) {
      var group = src.parentElement;
      if (!group || group.querySelector("[" + MARK + "='menu']")) { var m = group && group.querySelector("[" + MARK + "='menu']"); if (m) badge(m); return; }
      var c = makeClone(src, "menu");
      c.style.background = "transparent";
      c.style.color = "var(--text-3)";
      var bar = c.querySelector("span");
      if (bar && !bar.children.length && !textOf(bar)) bar.style.width = "0";
      group.appendChild(c);
      badge(c);
    });
  }
  function removeAll() { document.querySelectorAll("[" + MARK + "]").forEach(function (e) { e.remove(); }); closeModule(false); }

  // ---------- modül görünümü (uygulama içinde) ----------
  var view = null;
  function isWide() { return window.matchMedia("(min-width: 1024px)").matches; }

  function buildView() {
    var L = lang();
    var wrap = document.createElement("div");
    wrap.id = "fikoai-oyunlar-modul";
    wrap.setAttribute("role", "region");
    wrap.setAttribute("aria-label", L === "de" ? "Spiele" : "Oyunlar");
    wrap.style.cssText = "position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:" + (isWide() ? "column" : "column-reverse") + ";background:#070b14";
    var bar = document.createElement("nav");
    bar.style.cssText = "flex:none;display:flex;align-items:stretch;justify-content:" + (isWide() ? "flex-start" : "space-around") + ";gap:" + (isWide() ? "6px" : "0") + ";padding:" + (isWide() ? "8px 14px" : "6px 4px calc(6px + env(safe-area-inset-bottom))") + ";background:#ffffff;border-" + (isWide() ? "bottom" : "top") + ":1px solid rgba(15,23,42,.08);font-family:'Plus Jakarta Sans',Inter,system-ui,sans-serif";
    MODULES.forEach(function (m) {
      var active = m.key === "oyunlar";
      var b = document.createElement("button");
      b.type = "button";
      b.style.cssText = "display:flex;flex-direction:" + (isWide() ? "row" : "column") + ";align-items:center;justify-content:center;gap:" + (isWide() ? "8px" : "3px") + ";min-height:48px;padding:" + (isWide() ? "8px 14px" : "4px 6px") + ";border:0;border-radius:12px;cursor:pointer;background:" + (active ? "rgba(245,158,11,.12)" : "transparent") + ";color:" + (active ? m.color : "#64748b") + ";font-weight:" + (active ? 700 : 500) + ";font-size:" + (isWide() ? "14px" : "11.5px") + ";flex:" + (isWide() ? "none" : "1");
      b.innerHTML = svg(m.icon, isWide() ? 16 : 20) + "<span>" + m[L] + "</span>";
      if (active) b.setAttribute("aria-current", "page");
      b.addEventListener("click", function () { if (!active) switchTo(m); });
      bar.appendChild(b);
    });
    var frame = document.createElement("iframe");
    frame.src = "/oyunlar?embed=1";
    frame.title = L === "de" ? "Spiele-Verwaltung" : "Oyun yönetimi";
    frame.style.cssText = "flex:1;width:100%;border:0;min-height:0;background:#070b14";
    wrap.appendChild(bar);
    wrap.appendChild(frame);
    return wrap;
  }

  function openModule(push) {
    if (!allowed) return;
    if (!view) { view = buildView(); document.body.appendChild(view); document.documentElement.style.overflow = "hidden"; }
    if (push && location.hash !== "#oyunlar") history.pushState({ fikoaiOyunlar: 1 }, "", "#oyunlar");
  }
  function closeModule(back) {
    if (view) { view.remove(); view = null; document.documentElement.style.overflow = ""; }
    if (back && location.hash === "#oyunlar") history.replaceState(null, "", location.pathname + location.search);
  }
  function switchTo(m) {
    closeModule(true);
    // uygulamanın kendi modül düğmesine tıkla (React işleyicisi çalışsın)
    var target = findByLabel([m.tr, m.de]).filter(function (el) { return el.offsetParent !== null; })[0] || findByLabel([m.tr, m.de])[0];
    if (target) target.click();
  }
  window.addEventListener("popstate", function () { if (location.hash !== "#oyunlar") closeModule(false); else openModule(false); });
  window.addEventListener("message", function (e) {
    if (e.origin !== location.origin || !e.data) return;
    if (e.data.type === "fikoai-oyunlar-close") closeModule(true);
    if (e.data.type === "fikoai-oyunlar-pending") { pending = e.data.pending | 0; inject(); }
  });

  // ---------- başlat ----------
  var scheduled = false;
  function schedule() {
    if (scheduled) return; scheduled = true;
    requestAnimationFrame(function () {
      scheduled = false;
      if (token() !== checkedToken) refresh();   // giriş/çıkış yapıldı
      inject();
    });
  }
  function start() {
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
    refresh();
    setInterval(refresh, 60000);
    window.addEventListener("storage", function (e) { if (e.key === STORE) refresh(); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
