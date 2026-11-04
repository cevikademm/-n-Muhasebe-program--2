/* fikoai /app — "Oyunlar" menü öğesi (YÖNETİM bölümü)
 * Uygulamanın derlenmiş koduna dokunmadan, yönetici menüsündeki "Hesap Planları"
 * öğesinin birebir kopyasını "Oyunlar" olarak ekler. YÖNETİM bölümü zaten yalnızca
 * admin rolüne görünür; tıklanınca fikoai.de/oyunlar açılır (aynı Supabase oturumu).
 * Yanında onay bekleyen lisans kodu sayısı gösterilir.
 */
(function () {
  var SB_URL = "https://edlbvezskqbxasqkszvd.supabase.co";
  var SB_KEY = "sb_publishable_n_54_REfovQ_V9OLiDjcCA_tPoxYOeY";
  var STORE = "sb-edlbvezskqbxasqkszvd-auth-token";
  var LABELS = { "Hesap Planları": "tr", "Kontenplan": "de" };
  var MARK = "data-fikoai-oyunlar";
  var pending = null;

  var ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="6" width="20" height="12" rx="3"/><path d="M6 12h4M8 10v4"/><path d="M15 11h.01M18 13h.01"/></svg>';

  function token() {
    try {
      var raw = localStorage.getItem(STORE);
      if (!raw) return null;
      var s = JSON.parse(raw);
      return (s && (s.access_token || (s.currentSession && s.currentSession.access_token))) || null;
    } catch (e) { return null; }
  }

  function loadPending() {
    var t = token();
    if (!t) return;
    fetch(SB_URL + "/rest/v1/rpc/portal_stats", {
      method: "POST",
      headers: { apikey: SB_KEY, Authorization: "Bearer " + t, "Content-Type": "application/json" },
      body: "{}",
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (s) { if (s && typeof s.pending === "number") { pending = s.pending; inject(); } })
      .catch(function () {});
  }

  function labelSpan(btn, text) {
    var spans = btn.querySelectorAll("span");
    for (var i = 0; i < spans.length; i++) {
      if (spans[i].children.length === 0 && spans[i].textContent.trim() === text) return spans[i];
    }
    return null;
  }

  function inject() {
    var buttons = document.querySelectorAll("button");
    for (var i = 0; i < buttons.length; i++) {
      var src = buttons[i];
      var txt = (src.textContent || "").trim();
      var lang = LABELS[txt];
      if (!lang || src.hasAttribute(MARK)) continue;

      // Menü öğeleri doğrudan YÖNETİM <nav>'ının çocukları: kopyayı grubun sonuna ekle
      var group = src.parentElement;
      if (!group) continue;
      var existing = group.querySelector("[" + MARK + "]");
      var label = lang === "de" ? "Spiele" : "Oyunlar";
      if (existing) { updateBadge(existing); continue; }

      var btn = src.cloneNode(true);
      btn.setAttribute(MARK, "1");
      btn.setAttribute("aria-label", label);
      btn.title = lang === "de" ? "Spiele · Lizenzcodes" : "Oyunlar · Lisans kodları";
      // pasif görünüm
      btn.style.background = "transparent";
      btn.style.color = "var(--text-3)";
      var bar = btn.querySelector("span");
      if (bar && bar.children.length === 0 && !bar.textContent.trim()) bar.style.width = "0";
      var svg = btn.querySelector("svg");
      if (svg) {
        var holder = document.createElement("span");
        holder.innerHTML = ICON;
        svg.replaceWith(holder.firstChild);
      }
      var ls = labelSpan(btn, txt);
      if (ls) ls.textContent = label;
      btn.addEventListener("mouseenter", function () { this.style.background = "rgba(124,92,255,.08)"; this.style.color = "var(--text-2)"; });
      btn.addEventListener("mouseleave", function () { this.style.background = "transparent"; this.style.color = "var(--text-3)"; });
      btn.addEventListener("click", function (e) {
        e.preventDefault(); e.stopPropagation();
        window.location.href = "/oyunlar";
      }, true);
      group.appendChild(btn);
      updateBadge(btn);
    }
  }

  function updateBadge(btn) {
    var b = btn.querySelector("[data-fikoai-badge]");
    if (!pending) { if (b) b.remove(); return; }
    if (!b) {
      b = document.createElement("span");
      b.setAttribute("data-fikoai-badge", "1");
      b.style.cssText = "margin-left:auto;min-width:20px;height:20px;padding:0 6px;border-radius:999px;background:#f59e0b;color:#1a1200;font-size:11px;font-weight:800;display:inline-flex;align-items:center;justify-content:center";
      btn.appendChild(b);
    }
    b.textContent = String(pending);
  }

  var scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(function () { scheduled = false; inject(); });
  }

  function start() {
    inject();
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
    loadPending();
    setInterval(loadPending, 60000);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
