// Oyun portalı — yönetim paneli (yalnızca license_admins tablosundaki kullanıcı)
(() => {
  const C = {
    // fikoai.de uygulamasıyla aynı Supabase projesi (Ön Muhasebe Programı-3). Publishable anahtar; yetki RLS ile korunur.
    SUPABASE_URL: "https://edlbvezskqbxasqkszvd.supabase.co",
    SUPABASE_KEY: "sb_publishable_n_54_REfovQ_V9OLiDjcCA_tPoxYOeY",
  };
  const sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true }, // fikoai.de/app ile aynı oturum
  });

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const safeColor = (c) => /^#[0-9a-f]{3,8}$/i.test(c || "") ? c : "#ff2e88";
  const coverUrl = (p) => p ? `${C.SUPABASE_URL}/storage/v1/object/public/game-covers/${p.split("/").map(encodeURIComponent).join("/")}` : "";

  // fikoai /app içinde modül olarak açıldığında (iframe, ?embed=1)
  const EMBED = new URLSearchParams(location.search).has("embed") && window.parent !== window;
  if (EMBED) document.documentElement.classList.add("embed");
  const tellParent = (msg) => { if (EMBED) try { window.parent.postMessage(msg, location.origin); } catch (e) {} };

  const state = { tab: "devices", apps: [], devices: [], builds: [], log: [], dlreq: [], dlcodes: [], alerts: [], hwrec: [], stats: null, filters: { app: "", status: "", q: "" }, timer: null };

  // ---------- yardımcılar ----------
  function toast(msg, kind = "") {
    const t = document.createElement("div");
    t.className = "toast " + kind;
    t.textContent = msg;
    $("#toasts").append(t);
    setTimeout(() => t.remove(), 4500);
  }
  const fmtSize = (b) => {
    if (!b) return "—";
    const u = ["B", "KB", "MB", "GB"]; let i = 0, n = Number(b);
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
    return n.toFixed(i > 1 ? 1 : 0) + " " + u[i];
  };
  function ago(ts) {
    if (!ts) return "—";
    const s = Math.round((Date.now() - new Date(ts).getTime()) / 1000);
    if (s < 60) return s + " sn önce";
    if (s < 3600) return Math.round(s / 60) + " dk önce";
    if (s < 86400) return Math.round(s / 3600) + " sa önce";
    return Math.round(s / 86400) + " gün önce";
  }
  const dt = (ts) => ts ? new Date(ts).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" }) : "—";
  const appName = (id) => state.apps.find((a) => a.id === id)?.name || id;
  const online = (ts) => ts && Date.now() - new Date(ts).getTime() < 5 * 60 * 1000;

  function devBadge(d) {
    if (d.status === "approved") {
      if (d.expires_at && new Date(d.expires_at) < new Date()) return '<span class="badge off">Süresi doldu</span>';
      return '<span class="badge live">Onaylı</span>';
    }
    if (d.status === "revoked") return '<span class="badge off">Kapatıldı</span>';
    return '<span class="badge wait">Bekliyor</span>';
  }
  function buildBadge(s) {
    return s === "approved" ? '<span class="badge live">Onaylı</span>' : s === "blocked" ? '<span class="badge off">Engelli</span>' : '<span class="badge wait">Bekliyor</span>';
  }

  // ---------- modal ----------
  function modal(title, bodyHtml, buttons) {
    $("#modal-title").textContent = title;
    $("#modal-body").innerHTML = bodyHtml;
    const foot = $("#modal-foot");
    foot.innerHTML = "";
    for (const b of buttons) {
      const el = Object.assign(document.createElement("button"), { className: "btn " + (b.cls || "ghost"), textContent: b.text, type: "button" });
      el.onclick = async () => {
        if (!b.run) return closeModal();
        el.disabled = true;
        try { const keep = await b.run(); if (!keep) closeModal(); }
        catch (e) { toast(e.message || String(e), "err"); }
        finally { el.disabled = false; }
      };
      foot.append(el);
    }
    $("#modal").classList.remove("hidden");
    setTimeout(() => $("#modal-body input, #modal-body textarea")?.focus(), 30);
  }
  function closeModal() { $("#modal").classList.add("hidden"); }
  $("#modal").addEventListener("click", (e) => { if (e.target.matches("[data-close]") || e.target.id === "modal") closeModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

  // ---------- oturum ----------
  async function isAdmin() {
    const { data, error } = await sb.rpc("license_is_admin");
    return !error && data === true;
  }

  async function boot() {
    const { data: { session } } = await sb.auth.getSession();
    if (session && await isAdmin()) return enterApp(session);
    if (session) await sb.auth.signOut();
    showLogin();
  }
  function showLogin(msg = "") {
    clearInterval(state.timer);
    $("#app-view").classList.add("hidden");
    $("#login-view").classList.remove("hidden");
    $("#login-err").textContent = msg;
  }

  let fails = 0, lockUntil = 0;
  $("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (Date.now() < lockUntil) { $("#login-err").textContent = "Çok fazla deneme. Biraz bekleyin."; return; }
    const btn = $("#login-btn");
    btn.disabled = true; btn.textContent = "Kontrol ediliyor…";
    $("#login-err").textContent = "";
    try {
      const { data, error } = await sb.auth.signInWithPassword({ email: $("#email").value.trim(), password: $("#password").value });
      if (error) throw new Error("E-posta ya da şifre hatalı.");
      if (!(await isAdmin())) { await sb.auth.signOut(); throw new Error("Bu panele yalnızca yönetici girebilir."); }
      fails = 0;
      $("#password").value = "";
      enterApp(data.session);
    } catch (err) {
      fails++;
      if (fails >= 5) { lockUntil = Date.now() + 60_000; fails = 0; }
      $("#login-err").textContent = err.message;
    } finally {
      btn.disabled = false; btn.textContent = "Giriş yap";
    }
  });
  async function logout() { await sb.auth.signOut(); showLogin(); }
  $("#logout").onclick = logout;
  $("#logout-m").onclick = logout;
  sb.auth.onAuthStateChange((ev) => { if (ev === "SIGNED_OUT") showLogin(); });

  function enterApp(session) {
    $("#login-view").classList.add("hidden");
    $("#app-view").classList.remove("hidden");
    $("#me").textContent = session.user.email;
    refresh(true);
    clearInterval(state.timer);
    state.timer = setInterval(() => { if (!document.hidden && $("#modal").classList.contains("hidden")) refresh(); }, 15000);
  }

  // ---------- veri ----------
  async function refresh(full = false) {
    try {
      const since7 = new Date(Date.now() - 7 * 86400000).toISOString();
      const [apps, stats, devices, builds, log, dlreq, dlcodes, alerts, hwrec] = await Promise.all([
        sb.from("license_apps").select("*").order("sort_order").order("name"),
        sb.rpc("portal_stats"),
        sb.from("license_devices").select("*").order("last_seen", { ascending: false }).limit(1000),
        sb.from("license_builds").select("*").order("last_seen", { ascending: false }).limit(500),
        (full || state.tab === "log" || state.tab === "overview")
          ? sb.from("license_log").select("*").order("at", { ascending: false }).limit(300)
          : Promise.resolve({ data: state.log }),
        sb.from("download_requests").select("*").order("created_at", { ascending: false }).limit(500),
        sb.from("download_codes").select("*").order("created_at", { ascending: false }).limit(300),
        sb.from("license_alerts").select("*").or(`resolved_at.is.null,last_at.gt.${since7}`).order("last_at", { ascending: false }).limit(300),
        sb.from("license_hw_records").select("app_id,device_id,device_code,hw,hw_hash,ip,created_at").order("created_at", { ascending: false }).limit(2000),
      ]);
      const err = [apps, stats, devices, builds, log, dlreq, dlcodes, alerts, hwrec].find((r) => r.error)?.error;
      if (err) {
        if (/JWT|auth|yetkisiz/i.test(err.message)) return showLogin("Oturum süresi doldu, tekrar giriş yapın.");
        throw err;
      }
      state.apps = apps.data; state.stats = stats.data; state.devices = devices.data; state.builds = builds.data; state.log = log.data || []; state.dlreq = dlreq.data || []; state.dlcodes = dlcodes.data || []; state.alerts = alerts.data || []; state.hwrec = hwrec.data || [];
      tellParent({ type: "fikoai-oyunlar-pending", pending: state.stats?.pending || 0 });
      $$("[data-cnt]").forEach((el) => {
        const n = state.stats?.[el.dataset.cnt] || 0;
        el.textContent = n; el.classList.toggle("hidden", !n);
      });
      render();
    } catch (e) {
      toast("Veri alınamadı: " + e.message, "err");
    }
  }

  // ---------- sekmeler ----------
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-tab]");
    if (!t) return;
    state.tab = t.dataset.tab;
    $$("[data-tab]").forEach((x) => x.classList.toggle("active", x.dataset.tab === state.tab));
    render();
    if (state.tab === "log") refresh();
  });

  function render() {
    const m = $("#main");
    const scroll = window.scrollY;
    m.innerHTML = { overview: viewOverview, games: viewGames, devices: viewDevices, builds: viewBuilds, log: viewLog, downloads: viewDownloads, alerts: viewAlerts }[state.tab]();
    if (state.tab === "devices") bindDeviceFilters();
    window.scrollTo(0, scroll);
  }

  // ---------- Genel bakış ----------
  function viewOverview() {
    const s = state.stats || {};
    const pending = state.devices.filter((d) => d.status === "pending").slice(0, 8);
    return `
      <div class="page-head"><h2>Genel bakış</h2>
        <div class="tools"><button class="btn sm ghost" data-act="refresh">Yenile</button><button class="btn sm danger panic" data-act="panic">Tüm oyunları kapat</button></div></div>
      <div class="stats">
        <div class="stat"><div class="v">${s.games_live ?? 0}<span class="muted" style="font-size:16px"> / ${s.games ?? 0}</span></div><div class="l">Açık oyun</div></div>
        <div class="stat good"><div class="v">${s.online ?? 0}</div><div class="l">Şu an çevrim içi cihaz</div></div>
        <div class="stat"><div class="v">${s.approved ?? 0}</div><div class="l">Onaylı cihaz</div></div>
        <div class="stat ${s.pending ? "warn" : ""}"><div class="v">${s.pending ?? 0}</div><div class="l">Onay bekleyen kod</div></div>
        <div class="stat ${s.builds_pending ? "warn" : ""}"><div class="v">${s.builds_pending ?? 0}</div><div class="l">Onay bekleyen build</div></div>
        <div class="stat"><div class="v">${s.downloads ?? 0}</div><div class="l">Toplam indirme</div></div>
        <div class="stat ${s.flags_24h ? "bad" : ""}"><div class="v">${s.flags_24h ?? 0}</div><div class="l">Şüpheli işaret (24 sa)</div></div>
      </div>

      ${alertBox(openAlerts(), true)}
      <div class="panel"><h3>Oyunlar — uzaktan aç/kapat</h3>
        <div class="table-wrap"><table><thead><tr><th>Oyun</th><th>Durum</th><th>Cihaz</th><th>Çevrim içi</th><th>İndirme</th><th style="text-align:right">Oyun açık</th></tr></thead><tbody>
        ${state.apps.map((a) => {
          const devs = state.devices.filter((d) => d.app_id === a.id);
          return `<tr><td><b>${esc(a.name)}</b><div class="hash">${esc(a.id)}</div></td>
            <td>${a.enabled ? '<span class="badge live">Açık</span>' : '<span class="badge off">Kapalı</span>'}</td>
            <td>${devs.filter((d) => d.status === "approved").length} onaylı · ${devs.filter((d) => d.status === "pending").length} bekleyen</td>
            <td>${devs.filter((d) => online(d.last_seen)).length}</td>
            <td>${a.download_count ?? 0}</td>
            <td style="text-align:right">${switchHtml("enabled", a.id, a.enabled)}</td></tr>`;
        }).join("") || '<tr><td colspan="6" class="empty-row">Henüz oyun yok.</td></tr>'}
        </tbody></table></div></div>

      <div class="panel"><h3>Onay bekleyen kodlar <button class="btn sm ghost" data-tab="devices">Tümü →</button></h3>
        ${deviceTable(pending, true)}</div>

      <div class="panel"><h3>Son hareketler</h3>${logTable(state.log.slice(0, 10))}</div>`;
  }

  function switchHtml(field, id, on, label = "") {
    return `<label class="switch">${label}<input type="checkbox" data-switch="${field}" data-id="${esc(id)}" ${on ? "checked" : ""}><span class="track"></span></label>`;
  }

  // ---------- Oyunlar ----------
  function viewGames() {
    return `
      <div class="page-head"><h2>Oyunlar</h2>
        <div class="tools"><button class="btn sm danger panic" data-act="panic">Tümünü kapat</button><button class="btn primary" data-act="new-game">+ Yeni oyun</button></div></div>
      <div class="game-grid">
        ${state.apps.map((a) => {
          const devs = state.devices.filter((d) => d.app_id === a.id);
          const cover = a.cover_path ? `style="background-image:url('${esc(coverUrl(a.cover_path))}')"` : `style="background:radial-gradient(circle at 30% 30%, ${safeColor(a.accent)}88, transparent 60%), #120f1c"`;
          return `<div class="gcard ${a.enabled ? "" : "off"}">
            <div class="gcover" ${cover}>${a.cover_path ? "" : esc(a.name)}${a.enabled ? '<span class="badge live">Oyun açık</span>' : '<span class="badge off">Oyun kapalı</span>'}</div>
            <div class="gbody">
              <div><h4>${esc(a.name)}</h4><div class="gid">uygulama kimliği: ${esc(a.id)}</div></div>
              <div class="mini"><span><b>${devs.filter((d) => d.status === "approved").length}</b> onaylı</span><span><b>${devs.filter((d) => d.status === "pending").length}</b> bekleyen</span><span><b>${devs.filter((d) => online(d.last_seen)).length}</b> çevrim içi</span><span><b>${a.download_count ?? 0}</b> indirme</span></div>
              <div class="switches">
                ${switchHtml("enabled", a.id, a.enabled, "Oyun açık (kapatınca tüm cihazlarda durur)")}
                ${switchHtml("published", a.id, a.published, "Sitede göster")}
                <div class="hint">Her yeni cihaz ilk açılışta lisans kodu gösterir ve senin onayını bekler.</div>
              </div>
              <div class="mini"><span>Dosya: <b>${a.file_path ? esc(a.file_path.split("/").pop()) + " · " + fmtSize(a.file_size) : a.external_url ? "dış bağlantı" : "yok"}</b></span></div>
              ${!a.enabled && a.message ? `<div class="mini">Kapalı mesajı: <b>${esc(a.message)}</b></div>` : ""}
              <div class="gfoot">
                <button class="btn sm" data-act="edit-game" data-id="${esc(a.id)}">Düzenle</button>
                <button class="btn sm ghost" data-act="show-devices" data-id="${esc(a.id)}">Cihazlar</button>
                <button class="btn sm ghost" data-act="kill-msg" data-id="${esc(a.id)}">Kapalı mesajı</button>
              </div>
            </div></div>`;
        }).join("") || '<div class="panel" style="padding:30px;text-align:center" >Henüz oyun yok. “Yeni oyun” ile ekleyin.</div>'}
      </div>`;
  }

  function gameForm(a = {}) {
    const isNew = !a.id;
    return `
      <div class="section-label">Vitrin bilgileri</div>
      <div class="grid2">
        <label class="field">Oyun adı<input class="input" id="f-name" value="${esc(a.name)}" required></label>
        <label class="field">Uygulama kimliği ${isNew ? '<span class="hint">küçük harf, rakam, tire — oyundaki license.json ile aynı olmalı</span>' : ""}
          <input class="input mono" id="f-id" value="${esc(a.id)}" ${isNew ? "" : "disabled"} placeholder="ornek-oyun" pattern="[a-z0-9-]{2,64}"></label>
      </div>
      <label class="field">Kısa tanıtım (tek satır)<input class="input" id="f-tagline" value="${esc(a.tagline)}" maxlength="140"></label>
      <label class="field">Açıklama<textarea class="input" id="f-description">${esc(a.description)}</textarea></label>
      <div class="grid3">
        <label class="field">Tür<input class="input" id="f-genre" value="${esc(a.genre)}" placeholder="Canlı yayın · 3D"></label>
        <label class="field">Sürüm<input class="input" id="f-version" value="${esc(a.version_label)}" placeholder="1.0"></label>
        <label class="field">Sıra<input class="input" type="number" id="f-sort" value="${esc(a.sort_order ?? 100)}"></label>
      </div>
      <div class="grid2">
        <label class="field">Gereksinim<input class="input" id="f-req" value="${esc(a.requirements)}" placeholder="Windows 10/11 · 64-bit · TikFinity"></label>
        <label class="field">Vurgu rengi<input class="input" type="color" id="f-accent" value="${esc(safeColor(a.accent))}" style="height:46px;padding:4px"></label>
      </div>

      <hr class="divider"><div class="section-label">Dosyalar</div>
      <div class="upload-box">
        <label class="field">Kapak görseli (PNG/JPG/WebP, en fazla 5 MB)<input class="input" type="file" id="f-cover" accept="image/png,image/jpeg,image/webp"></label>
        ${a.cover_path ? `<span class="hint">Mevcut: ${esc(a.cover_path)}</span>` : ""}
      </div>
      <div class="upload-box">
        <label class="field">Oynanabilir build (.zip ya da .exe) <span class="hint">Yalnızca derlenmiş oyun: kaynak kod, Assets/ProjectSettings klasörleri, .cs dosyaları ve Mono (Managed) build reddedilir</span><input class="input" type="file" id="f-build" accept=".zip,.exe"></label><div class="hint" id="f-build-check"></div>
        <span class="hint">${a.file_path ? `Mevcut: ${esc(a.file_path)} · ${fmtSize(a.file_size)}. Yeni dosya seçerseniz eskisinin yerine geçer.` : "Henüz dosya yok."} Büyük dosyalar parça parça yüklenir.</span>
        <div class="progress hidden" id="f-prog"><i></i></div>
        <label class="field">…ya da dış indirme bağlantısı (Drive, GitHub Releases vb.)<input class="input" id="f-ext" value="${esc(a.external_url)}" placeholder="https://"></label>
        <span class="hint">Yüklenmiş dosya varsa dış bağlantı yerine o kullanılır.</span>
      </div>

      <hr class="divider"><div class="section-label">Lisans ayarları</div>
      <div class="grid2">
        <label class="field">Heartbeat (sn)<input class="input" type="number" min="10" id="f-hb" value="${esc(a.heartbeat_seconds ?? 30)}"></label>
        <label class="field">Çevrimdışı tolerans (saat)<input class="input" type="number" min="0" id="f-grace" value="${esc(a.offline_grace_hours ?? 1)}"></label>
      </div>
      <div class="switches" style="display:grid;gap:10px;padding:12px;border-radius:12px;background:var(--bg-2);border:1px solid var(--line)">
        <label class="switch" style="justify-content:space-between">Unity Editor'den çalıştırmaya izin ver<input type="checkbox" id="f-editor" ${a.allow_editor ?? true ? "checked" : ""}><span class="track"></span></label>
        <label class="switch" style="justify-content:space-between">Yeni build'leri otomatik onayla<input type="checkbox" id="f-autobuild" ${a.auto_approve_builds ? "checked" : ""}><span class="track"></span></label>
      </div>`;
  }

  // Yalnızca oynanabilir build: kaynak kod / Unity proje dosyası / Mono derlemesi içeren paketler reddedilir
  async function inspectBuild(file) {
    const out = $("#f-build-check");
    const say = (t) => { if (out) out.textContent = t; };
    const name = file.name.toLowerCase();
    if (name.endsWith(".exe")) { say("Tek .exe dosyası — kaynak kod içermez."); return; }
    if (!name.endsWith(".zip")) throw new Error("Yalnızca .zip ya da .exe yüklenebilir (içeriği denetlenebilsin diye).");
    if (!window.JSZip) throw new Error("Paket denetleyicisi yüklenemedi; sayfayı yenileyip tekrar deneyin.");
    say("Paket içeriği denetleniyor…");
    let zip;
    try { zip = await JSZip.loadAsync(file); } catch (e) { throw new Error("Zip açılamadı: " + (e.message || e)); }
    const paths = Object.keys(zip.files).map((p) => p.replace(/\\/g, "/"));
    const lower = paths.map((p) => p.toLowerCase());
    const has = (re) => lower.some((p) => re.test(p));
    const banned = [
      [/(^|\/)assets\/.*\.(cs|shader|unity|prefab|asset|mat|meta)$/, "Unity Assets klasörü (kaynak)"],
      [/(^|\/)projectsettings\//, "ProjectSettings klasörü"],
      [/(^|\/)packages\/manifest\.json$/, "Packages/manifest.json"],
      [/(^|\/)library\//, "Library klasörü"],
      [/\.(cs|csproj|sln|asmdef|ts|tsx|py)$/, "kaynak kod dosyası"],
      [/(^|\/)\.git\//, ".git klasörü"],
      [/(^|\/)\.env/, ".env dosyası"],
    ];
    for (const [re, why] of banned) {
      const hit = paths[lower.findIndex((p) => re.test(p))];
      if (has(re)) throw new Error(`Bu paket kaynak içeriyor (${why}: ${hit}). Yalnızca Builds/Windows çıktısını zipleyin.`);
    }
    if (has(/_data\/managed\/assembly-csharp\.dll$/))
      throw new Error("Bu bir Mono build: oyun kodu (Assembly-CSharp.dll) kolayca geri çözülür. Unity'de IL2CPP ile build alıp tekrar yükleyin.");
    if (!has(/\.exe$/)) throw new Error("Pakette .exe bulunamadı; bu oynanabilir bir Windows build'i gibi görünmüyor.");
    const il2cpp = has(/gameassembly\.dll$/);
    say(`Denetlendi: ${paths.length} dosya, kaynak kod yok${il2cpp ? ", IL2CPP build ✓" : ""}.`);
  }

  async function uploadBuild(appId, file) {
    const ext = (file.name.split(".").pop() || "zip").toLowerCase().replace(/[^a-z0-9]/g, "");
    const safe = file.name.replace(/\.[^.]+$/, "").normalize("NFKD").replace(/[^\w.-]+/g, "_").slice(0, 60) || appId;
    const path = `${appId}/${Date.now()}-${safe}.${ext}`;
    const prog = $("#f-prog");
    prog.classList.remove("hidden");
    const bar = prog.firstElementChild;
    const { data: { session } } = await sb.auth.getSession();

    if (file.size <= 45 * 1024 * 1024) {
      bar.style.width = "40%";
      const { error } = await sb.storage.from("game-builds").upload(path, file, { upsert: true, contentType: file.type || "application/octet-stream" });
      if (error) throw new Error("Dosya yüklenemedi: " + error.message);
      bar.style.width = "100%";
      return path;
    }
    // Büyük dosya: parçalı (TUS) yükleme
    await new Promise((resolve, reject) => {
      const up = new tus.Upload(file, {
        endpoint: `${C.SUPABASE_URL}/storage/v1/upload/resumable`,
        retryDelays: [0, 2000, 5000, 10000],
        headers: { authorization: `Bearer ${session.access_token}`, apikey: C.SUPABASE_KEY, "x-upsert": "true" },
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        chunkSize: 6 * 1024 * 1024,
        metadata: { bucketName: "game-builds", objectName: path, contentType: file.type || "application/octet-stream", cacheControl: "3600" },
        onError: (e) => reject(new Error("Dosya yüklenemedi: " + (e?.message || e) + " (Supabase planındaki dosya boyutu sınırını kontrol edin)")),
        onProgress: (sent, total) => { bar.style.width = Math.round((sent / total) * 100) + "%"; },
        onSuccess: resolve,
      });
      up.start();
    });
    return path;
  }

  async function saveGame(existing) {
    const isNew = !existing;
    const id = isNew ? $("#f-id").value.trim().toLowerCase() : existing.id;
    const name = $("#f-name").value.trim();
    if (!name) throw new Error("Oyun adı gerekli.");
    if (!/^[a-z0-9-]{2,64}$/.test(id)) throw new Error("Uygulama kimliği yalnızca küçük harf, rakam ve tire içerebilir (2–64).");
    if (isNew && state.apps.some((a) => a.id === id)) throw new Error("Bu kimlikle bir oyun zaten var.");
    const ext = $("#f-ext").value.trim();
    if (ext && !/^https:\/\//i.test(ext)) throw new Error("Dış bağlantı https:// ile başlamalı.");

    const row = {
      name,
      tagline: $("#f-tagline").value.trim() || null,
      description: $("#f-description").value.trim() || null,
      genre: $("#f-genre").value.trim() || null,
      version_label: $("#f-version").value.trim() || null,
      sort_order: parseInt($("#f-sort").value, 10) || 100,
      requirements: $("#f-req").value.trim() || null,
      accent: $("#f-accent").value,
      external_url: ext || null,
      heartbeat_seconds: Math.max(10, parseInt($("#f-hb").value, 10) || 30),
      offline_grace_hours: Math.max(0, parseInt($("#f-grace").value, 10) || 0),
      allow_editor: $("#f-editor").checked,
      auto_approve_builds: $("#f-autobuild").checked,
    };

    if (isNew) {
      const { error } = await sb.from("license_apps").insert({ id, ...row, enabled: true, published: false });
      if (error) throw new Error(error.message);
    }

    const cover = $("#f-cover").files[0];
    if (cover) {
      if (cover.size > 5 * 1024 * 1024) throw new Error("Kapak görseli 5 MB'dan büyük olamaz.");
      const cext = cover.type === "image/png" ? "png" : cover.type === "image/webp" ? "webp" : "jpg";
      const cpath = `${id}/cover-${Date.now()}.${cext}`;
      const { error } = await sb.storage.from("game-covers").upload(cpath, cover, { upsert: true, contentType: cover.type });
      if (error) throw new Error("Kapak yüklenemedi: " + error.message);
      if (existing?.cover_path) sb.storage.from("game-covers").remove([existing.cover_path]);
      row.cover_path = cpath;
    }
    const build = $("#f-build").files[0];
    if (build) {
      await inspectBuild(build);
      const bpath = await uploadBuild(id, build);
      if (existing?.file_path && existing.file_path !== bpath) sb.storage.from("game-builds").remove([existing.file_path]);
      row.file_path = bpath;
      row.file_size = build.size;
    }

    const { error } = await sb.from("license_apps").update(row).eq("id", id);
    if (error) throw new Error(error.message);
    toast(isNew ? "Oyun eklendi. Hazır olunca “Sitede göster”i açın." : "Kaydedildi.", "ok");
    await refresh();
  }

  // ---------- Cihazlar ----------
  function filteredDevices() {
    const f = state.filters, q = f.q.trim().toLowerCase();
    const order = { pending: 0, approved: 1, revoked: 2 };
    return state.devices.slice().sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9)).filter((d) =>
      (!f.app || d.app_id === f.app) &&
      (!f.status || d.status === f.status || (f.status === "online" && online(d.last_seen))) &&
      (!q || [d.device_code, d.label, d.machine_name, d.owner_note, d.last_ip, d.tiktok_username, personText(d)].some((v) => (v || "").toLowerCase().includes(q))));
  }
  function personText(d) {
    const r = reqFor(d);
    return r ? [r.first_name, r.last_name, r.phone, r.email, r.tiktok].join(" ") : "";
  }
  function viewDevices() {
    const f = state.filters;
    const list = filteredDevices();
    return `
      <div class="page-head"><h2>Lisans kodları</h2>
        <div class="tools"><button class="btn sm ok" data-act="approve-all" ${list.some((d) => d.status === "pending") ? "" : "disabled"}>Listedeki bekleyenleri onayla</button><button class="btn sm ghost" data-act="refresh">Yenile</button></div></div>
      ${alertBox(openAlerts(), true)}
      <div class="panel">
        <div class="filters">
          <input class="input" id="flt-q" placeholder="Kod, etiket, bilgisayar, kişi, TikTok ara…" value="${esc(f.q)}">
          <select class="input" id="flt-app"><option value="">Tüm oyunlar</option>${state.apps.map((a) => `<option value="${esc(a.id)}" ${f.app === a.id ? "selected" : ""}>${esc(a.name)}</option>`).join("")}</select>
          <select class="input" id="flt-status">
            ${[["", "Tüm durumlar"], ["pending", "Bekleyen"], ["approved", "Onaylı"], ["revoked", "Kapatılan"], ["online", "Çevrim içi"]].map(([v, t]) => `<option value="${v}" ${f.status === v ? "selected" : ""}>${t}</option>`).join("")}
          </select>
          <span class="muted" style="align-self:center;font-size:13px">${list.length} cihaz</span>
        </div>
        ${deviceTable(list, false)}
      </div>`;
  }
  function bindDeviceFilters() {
    const upd = () => {
      state.filters = { q: $("#flt-q").value, app: $("#flt-app").value, status: $("#flt-status").value };
      const pos = $("#flt-q").selectionStart;
      render();
      const q = $("#flt-q"); q.focus(); q.setSelectionRange(pos, pos);
    };
    let t; $("#flt-q").addEventListener("input", () => { clearTimeout(t); t = setTimeout(upd, 200); });
    $("#flt-app").addEventListener("change", upd);
    $("#flt-status").addEventListener("change", upd);
  }
  function deviceTable(list, compact) {
    if (!list.length) return `<div class="empty-row">${compact ? "Bekleyen kod yok." : "Kayıt yok."}</div>`;
    return `<div class="table-wrap"><table class="dev-table"><thead><tr><th>Kod</th><th>Oyun</th><th>Etiket / Bilgisayar</th><th>Durum</th><th>Son görülme</th><th style="text-align:right">İşlem</th></tr></thead><tbody>
      ${list.map((d) => `<tr>
        <td><span class="code">${esc(d.device_code)}</span>${devAlertBadge(d)}${(d.last_flags || []).length ? ` <span class="badge off" title="${esc((d.last_flags || []).join(", "))}">⚠ ${esc(d.last_flags.join(", "))}</span>` : ""}</td>
        <td>${esc(appName(d.app_id))}</td>
        <td>${esc(d.label || "—")}<div class="hash">${esc(d.machine_name || "")}${d.owner_note ? " · " + esc(d.owner_note) : ""}</div>${personFor(d)}${tiktokLine(d)}${hwLine(d)}</td>
        <td>${devBadge(d)} ${online(d.last_seen) ? '<span class="badge info">çevrim içi</span>' : ""}${!compact && d.expires_at ? `<div class="hash">bitiş: ${dt(d.expires_at)}</div>` : ""}</td>
        <td title="${esc(dt(d.last_seen))} · ${d.check_count ?? 0} sorgu">${ago(d.last_seen)}</td>
        <td class="c-act" style="text-align:right"><div class="row-actions" style="justify-content:flex-end">
          ${d.status !== "approved" ? `<button class="btn sm ok" data-act="dev-status" data-v="approved" data-id="${d.id}">Onayla</button>` : ""}
          ${d.status !== "revoked" ? `<button class="btn sm danger" data-act="dev-status" data-v="revoked" data-id="${d.id}">Kapat</button>` : ""}
          <button class="btn sm ghost" data-act="dev-hw" data-id="${d.id}">Donanım</button>
          <button class="btn sm ghost" data-act="dev-edit" data-id="${d.id}">Düzenle</button>
        </div></td></tr>`).join("")}
      </tbody></table></div>`;
  }

  // Cihazı açan kişi: oyunda girilen indirme koduyla KESİN bağ; yoksa aynı IP'den son başarılı indirme (tahmin).
  function reqFor(d) {
    if (d.download_request_id) { const r = state.dlreq.find((x) => x.id === d.download_request_id); if (r) return r; }
    if (!d.last_ip) return null;
    return state.dlreq.find((x) => x.status === "ok" && x.ip === d.last_ip && x.app_id === d.app_id) || state.dlreq.find((x) => x.status === "ok" && x.ip === d.last_ip) || null;
  }
  function personFor(d) {
    const r = reqFor(d);
    const exact = !!(d.download_request_id && r && r.id === d.download_request_id);
    if (!r) return d.download_code_id ? '<div class="hash" style="color:#34d399">indirme koduna bağlı (kişi kaydı silinmiş)</div>' : '<div class="hash" style="color:#f59e0b">indirme koduna bağlı değil</div>';
    return `<div class="person" title="${exact ? "İndirme koduyla bağlı (kesin)" : "IP eşleşmesi (tahmin): " + esc(d.last_ip)}"><b>${esc(r.first_name)} ${esc(r.last_name)}</b> · <a href="https://wa.me/${esc(String(r.phone).replace(/[^0-9]/g, ""))}" target="_blank" rel="noopener">${esc(r.phone)}</a>
      <div class="hash">${esc(r.email)} · kod ${esc(r.code || "")} · ${exact ? '<span style="color:#34d399">koda bağlı ✓</span>' : '<span style="color:#f59e0b">IP eşleşmesi</span>'}</div></div>`;
  }
  function tiktokLine(d) {
    if (!d.tiktok_username) return '<div class="tt no">TikTok hesabı tanımlı değil — yayıncı denetimi kapalı</div>';
    const v = d.tiktok_verified_at ? `<span title="${esc(dt(d.tiktok_verified_at))}">✓ yayında doğrulandı ${ago(d.tiktok_verified_at)}</span>` : "henüz yayında doğrulanmadı";
    return `<div class="tt ${d.tiktok_verified_at ? "ok" : "no"}"><a href="https://www.tiktok.com/@${esc(d.tiktok_username)}" target="_blank" rel="noopener">@${esc(d.tiktok_username)}</a> · ${v}</div>`;
  }
  function hwRec(d) { return state.hwrec.find((h) => h.app_id === d.app_id && h.device_id === d.device_id); }
  function hwLine(d) {
    const rec = hwRec(d);
    if (!rec) return '<div class="hash">donanım henüz kaydedilmedi (yeni sürümle ilk açılışta kilitlenir)</div>';
    const i = rec.hw?.info || {};
    const m = { same: ["#34d399", "donanım aynı"], partial: ["#fbbf24", "1 parça değişmiş"], different: ["#ef4444", "FARKLI BİLGİSAYAR"], accepted: ["#93c5fd", "yeni donanım kabul edildi"], locked: ["#34d399", "donanım kilitlendi"], unknown: ["#94a3b8", "karşılaştırılamadı"] }[d.hw_match || "locked"] || ["#94a3b8", d.hw_match];
    return `<div class="hash">🔒 ${esc(i.board_mfr || "")} ${esc(i.board_model || "")} · seri ${esc(i.board_serial || "—")} · <span style="color:${m[0]}">${m[1]}</span></div>`;
  }

  // ---------- Güvenlik uyarıları ----------
  const ALERT_TR = {
    hw_mismatch: ["BAŞKA BİLGİSAYAR", "Bu lisans donanımı farklı bir bilgisayarda açılmaya çalışıldı; o bilgisayarda oyun kilitlendi."],
    hw_partial: ["Donanım değişti", "Kilitli donanımdan bir parça farklı (oyun çalışmaya devam ediyor)."],
    hw_missing: ["Donanım okunamadı", "Oyun bu açılışta donanım bilgisini gönderemedi."],
    concurrent: ["Aynı anda iki yerde", "Aynı lisans kısa aralıkla farklı IP'lerden açıldı."],
    code_reuse: ["KOD BAŞKA PC'DE", "Bu indirme kodu başka bir bilgisayara bağlı; yeni bilgisayar onaylanmadı."],
    same_hw: ["Aynı donanım, yeni kod", "Bu bilgisayar daha önce başka bir lisans koduyla kaydolmuş (Windows yeniden kurulmuş olabilir)."],
    tiktok_mismatch: ["TİKTOK HESABI UYUŞMADI", "Oyun lisanstaki TikTok hesabından farklı bir yayında çalıştırıldı; oyun hemen kapatıldı."],
    tiktok_unverified: ["YAYIN DOĞRULANMADI", "Canlı olaylar geldi ama lisans sahibi hesabı 3 dakika içinde doğrulamadı; oyun kapatıldı."],
    tiktok_uid_changed: ["TikTok kimliği değişti", "Kullanıcı adı aynı ama TikTok sayısal kimliği farklı."],
  };
  const SEV_ORDER = { high: 0, warn: 1, info: 2 };
  function openAlerts() { return state.alerts.filter((a) => !a.resolved_at).sort((a, b) => (SEV_ORDER[a.severity] ?? 3) - (SEV_ORDER[b.severity] ?? 3) || new Date(b.last_at) - new Date(a.last_at)); }
  function devAlertBadge(d) {
    const n = state.alerts.filter((a) => !a.resolved_at && a.device_id === d.device_id && a.app_id === d.app_id && a.severity !== "info");
    if (!n.length) return "";
    const t = n.map((a) => (ALERT_TR[a.kind] || [a.kind])[0]).join(", ");
    return ` <span class="badge off" title="${esc(t)}">⚠ ${esc(n.length === 1 ? t : n.length + " uyarı")}</span>`;
  }
  function alertDesc(a) {
    const det = a.detail || {};
    const parts = [];
    if (det.diff?.length) parts.push("Farklı: " + det.diff.join(", "));
    if (det.got?.board || det.got?.board_model) parts.push(`Gelen PC: ${esc(det.machine || "?")} · anakart ${esc(det.got.board_model || "")} ${esc(det.got.board || "")}`);
    if (det.expected?.board) parts.push(`Kayıtlı: anakart ${esc(det.expected.board)}`);
    if (det.ips) parts.push("IP: " + det.ips.map(esc).join(" ↔ "));
    if (det.code) parts.push("Kod: " + esc(det.code) + (det.other_codes?.length ? " · bağlı olduğu cihaz: " + det.other_codes.map(esc).join(", ") : ""));
    if (det.other_codes?.length && !det.code) parts.push("Diğer kod: " + det.other_codes.map(esc).join(", "));
    if (det.expected !== undefined && typeof det.expected === "string") parts.push(`Lisans: @${esc(det.expected)}`);
    if (det.got_host || det.got_host_id) parts.push(`TikFinity yayıncısı: ${det.got_host ? "@" + esc(det.got_host) : ""} ${esc(det.got_host_id || "")}`);
    if (det.reason) parts.push(esc(det.reason));
    if (det.error) parts.push(esc(det.error));
    return parts.join(" · ");
  }
  function alertBox(list, compact) {
    const shown = compact ? list.filter((a) => a.severity !== "info") : list;
    if (!shown.length) return compact ? "" : '<div class="empty-row">Açık uyarı yok.</div>';
    const rows = shown.slice(0, compact ? 6 : 300).map((a) => {
      const [title, explain] = ALERT_TR[a.kind] || [a.kind, ""];
      const d = state.devices.find((x) => x.device_id === a.device_id && x.app_id === a.app_id);
      const hwKind = a.kind === "hw_mismatch" || a.kind === "hw_partial";
      return `<div class="alert-row ${esc(a.severity)}"><div class="k">${a.severity === "high" ? "⛔" : a.severity === "warn" ? "⚠" : "ℹ"} ${esc(title)}</div>
        <div class="d"><span class="code">${esc(a.device_code || "")}</span> · ${esc(appName(a.app_id))} · ${d ? esc(d.label || d.machine_name || "") : ""}${d?.tiktok_username ? " · @" + esc(d.tiktok_username) : ""}
          <div class="hash">${esc(explain)} ${alertDesc(a)}</div>
          <div class="hash">${ago(a.last_at)}${a.hits > 1 ? " · " + a.hits + " kez" : ""} · IP ${esc(a.ip || "—")}${a.resolved_at ? " · kapatıldı " + ago(a.resolved_at) : ""}</div></div>
        <div class="row-actions">
          <button class="btn sm ghost" data-act="alert-detail" data-id="${a.id}">Ayrıntı</button>
          ${!a.resolved_at && hwKind && a.detail?.hw_hash && d ? `<button class="btn sm ghost" data-act="alert-accept-hw" data-id="${a.id}" title="Gerçekten parça değiştiyse (ör. anakart tamiri)">Yeni donanımı kabul et</button>` : ""}
          ${!a.resolved_at && d && d.status !== "revoked" ? `<button class="btn sm danger" data-act="alert-revoke" data-id="${a.id}">Lisansı kapat</button>` : ""}
          ${!a.resolved_at ? `<button class="btn sm ok" data-act="alert-resolve" data-id="${a.id}">Uyarıyı kapat</button>` : ""}
        </div></div>`;
    }).join("");
    if (!compact) return `<div class="alert-box">${rows}</div>`;
    return `<div class="alert-box"><h3>⛔ ${shown.length} güvenlik uyarısı <button class="btn sm ghost" data-tab="alerts">Tümü →</button></h3>${rows}</div>`;
  }
  function viewAlerts() {
    const open = openAlerts(), closed = state.alerts.filter((a) => a.resolved_at);
    return `<div class="page-head"><h2>Güvenlik uyarıları</h2><div class="tools"><button class="btn sm ghost" data-act="refresh">Yenile</button></div></div>
      <div class="panel" style="margin-bottom:18px"><div class="filters"><b>Açık uyarılar (${open.length})</b><span class="muted" style="font-size:13px">Başka bilgisayar, kod paylaşımı, TikTok hesabı uyuşmazlığı. Oyun bu durumlarda kendini kilitler/kapatır; buradan lisansı kalıcı kapatabilirsin.</span></div>${alertBox(open, false)}</div>
      <div class="panel"><div class="filters"><b>Son 7 günde kapatılanlar (${closed.length})</b></div>${closed.length ? alertBox(closed, false) : '<div class="empty-row">Yok.</div>'}</div>`;
  }
  function hwModal(d) {
    const rec = hwRec(d);
    const a = rec?.hw?.info || {}, b = d.hw_last?.info || {};
    const rows = [["Anakart üretici", "board_mfr"], ["Anakart model", "board_model"], ["Anakart seri no", "board_serial", 1], ["Bilgisayar üretici / model", "pc"], ["BIOS üretici", "bios_vendor"], ["BIOS seri no", "bios_serial", 1], ["BIOS sürümü", "bios_version"],
      ["Sistem UUID", "uuid", 1], ["İşlemci", "cpu_name"], ["İşlemci kimliği", "cpu_id"], ["Windows MachineGuid", "machine_guid", 1], ["Windows ürün no", "os_serial"], ["Diskler", "disks", 1], ["MAC adresleri", "macs"], ["Ekran kartı", "gpu"], ["RAM", "ram_mb"], ["Windows kullanıcısı", "user"]];
    const val = (o, k) => k === "pc" ? [o.pc_mfr, o.pc_model].filter(Boolean).join(" ") : k === "disks" ? (o.disks || []).map((x) => `${x.model || "?"} (${x.serial || "seri yok"}${x.size_gb ? ", " + x.size_gb + " GB" : ""})`).join("; ") : k === "macs" ? (o.macs || []).join(", ") : k === "ram_mb" ? (o.ram_mb ? Math.round(o.ram_mb / 1024) + " GB" : "") : (o[k] ?? "");
    const grid = rows.map(([l, k, core]) => {
      const x = String(val(a, k) || "—"), y = rec && d.hw_last ? String(val(b, k) || "—") : "—";
      const bad = core && rec && d.hw_last && x !== y && x !== "—" && y !== "—";
      return `<div class="l">${esc(l)}${core ? " 🔒" : ""}</div><div>${esc(x)}</div><div class="${bad ? "bad" : ""}">${esc(y)}</div>`;
    }).join("");
    modal(`Donanım · ${d.device_code}`, `
      <p class="muted" style="margin:0 0 10px;font-size:13px">Sol sütun: oyunun bu lisansla <b>ilk</b> açıldığı bilgisayarın kaydı (${rec ? dt(rec.created_at) + ", IP " + esc(rec.ip || "—") : "henüz yok"}). Bu kayıt <b>değiştirilemez ve silinemez</b> — MAC adresi ya da başka bir alan değişse de ilk değerler kalır. 🔒 işaretli alanlar karşılaştırılır; MAC karşılaştırılmaz (kolay değiştirilir).</p>
      <div class="hw-grid"><div class="h">Alan</div><div class="h">Kilitli (ilk kayıt)</div><div class="h">Son açılış ${d.hw_last_at ? "(" + ago(d.hw_last_at) + ")" : ""}</div>${grid}</div>
      ${(d.hw_allowed || []).length ? `<p class="hash" style="margin-top:8px">Kabul edilmiş ek donanım: ${d.hw_allowed.length}</p>` : ""}`,
      [{ text: "Kapat" }]);
  }

  // ---------- İndirmeler (kod + kimlik) ----------
  function codeBadge(c) {
    if (c.revoked) return '<span class="badge off">İptal</span>';
    if (c.expires_at && new Date(c.expires_at) < new Date()) return '<span class="badge off">Süresi doldu</span>';
    if (c.used_count >= c.max_uses) return '<span class="badge plain">Kullanıldı</span>';
    return '<span class="badge live">Geçerli</span>';
  }
  function viewDownloads() {
    const reqs = state.dlreq, codes = state.dlcodes;
    return `
      <div class="page-head"><h2>İndirmeler</h2>
        <div class="tools"><button class="btn primary" data-act="new-code">+ İndirme kodu oluştur</button><button class="btn sm ghost" data-act="refresh">Yenile</button></div></div>
      <div class="panel" style="margin-bottom:18px">
        <div class="filters"><b>İndirme kodları</b><span class="muted" style="font-size:13px">Kodu WhatsApp'tan gönder; kişi sitede ad, soyad, telefon, e-posta ve kodu girmeden oyunu indiremez.</span></div>
        ${codes.length ? `<div class="table-wrap"><table><thead><tr><th>Kod</th><th>Oyun</th><th>Kullanım</th><th>Bitiş</th><th>Not</th><th>Durum</th><th style="text-align:right">İşlem</th></tr></thead><tbody>
          ${codes.map((c) => `<tr><td><span class="code">${esc(c.code)}</span></td><td>${esc(c.app_id ? appName(c.app_id) : "Tüm oyunlar")}</td>
            <td>${c.used_count}/${c.max_uses} indirme<div class="hash">${state.devices.filter((d) => d.download_code_id === c.id).map((d) => esc(d.device_code)).join(", ") || "PC yok"} · en çok ${c.max_devices ?? 1} PC</div></td><td>${c.expires_at ? dt(c.expires_at) : "—"}</td><td>${esc(c.note || "")}</td><td>${codeBadge(c)}</td>
            <td style="text-align:right"><div class="row-actions" style="justify-content:flex-end">
              <button class="btn sm ghost" data-act="code-copy" data-code="${esc(c.code)}">Kopyala</button>
              <button class="btn sm ghost" data-act="code-wa" data-code="${esc(c.code)}" data-app="${esc(c.app_id || "")}">WhatsApp mesajı</button>
              ${!c.revoked ? `<button class="btn sm danger" data-act="code-revoke" data-id="${c.id}">İptal</button>` : ""}
            </div></td></tr>`).join("")}</tbody></table></div>` : '<div class="empty-row">Henüz kod yok. "+ İndirme kodu oluştur" ile başlayın.</div>'}
      </div>
      <div class="panel">
        <div class="filters"><b>İndirme talepleri</b><span class="muted" style="font-size:13px">${reqs.filter((r) => r.status === "ok").length} başarılı · ${reqs.filter((r) => r.status === "denied").length} reddedildi</span></div>
        ${reqs.length ? `<div class="table-wrap"><table><thead><tr><th>Zaman</th><th>Ad Soyad</th><th>Telefon</th><th>E-posta</th><th>TikTok</th><th>Oyun</th><th>Kod</th><th>IP</th><th>Sonuç</th><th></th></tr></thead><tbody>
          ${reqs.map((r) => `<tr><td title="${esc(dt(r.created_at))}">${ago(r.created_at)}</td><td><b>${esc(r.first_name)} ${esc(r.last_name)}</b></td>
            <td><a href="https://wa.me/${esc(String(r.phone).replace(/[^0-9]/g, ""))}" target="_blank" rel="noopener">${esc(r.phone)}</a></td><td>${esc(r.email)}</td><td>${r.tiktok ? `<a href="https://www.tiktok.com/@${esc(r.tiktok)}" target="_blank" rel="noopener">@${esc(r.tiktok)}</a>${r.tiktok_checked === "yes" ? ' <span style="color:#34d399" title="TikTok\'ta var">✓</span>' : r.tiktok_checked === "no" ? ' <span style="color:#ef4444">yok</span>' : ""}<div class="hash">${esc(r.tiktok_nickname || "")}</div>` : "—"}</td>
            <td>${esc(appName(r.app_id))}</td><td><span class="code">${esc(r.code || "")}</span></td><td class="hash">${esc(r.ip || "")}</td>
            <td>${r.status === "ok" ? '<span class="badge live">İndirdi</span>' : `<span class="badge off" title="${esc(r.reason || "")}">Reddedildi</span>`}</td>
            <td><button class="btn sm ghost" data-act="req-del" data-id="${r.id}" title="Kişisel veriyi sil">Sil</button></td></tr>`).join("")}</tbody></table></div>` : '<div class="empty-row">Henüz indirme talebi yok.</div>'}
      </div>`;
  }
  // Uzun, okunaklı indirme kodu: FIKO-XXXX-XXXX-XXXX-XXXX (16 rastgele karakter ≈ 80 bit; karışan 0/O/1/I yok)
  function randomCode() {
    const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; const b = new Uint8Array(16); crypto.getRandomValues(b);
    const s = [...b].map((x) => A[x % A.length]).join("");
    return "FIKO-" + s.match(/.{4}/g).join("-");
  }
  // Profesyonel WhatsApp mesajı (c = download_codes satırı ya da { code, app_id, expires_at, max_uses, max_devices })
  function waText(c) {
    const oyun = c.app_id ? appName(c.app_id) : "";
    const bitis = c.expires_at ? new Date(c.expires_at).toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric" }) : "";
    const uses = Number(c.max_uses) || 1, pcs = Number(c.max_devices) || 1;
    return [
      "Merhaba,",
      "",
      `*fikoai.de* olarak ${oyun ? `*${oyun}*` : "TikTok canlı yayın oyunlarımız"} için size özel indirme kodunuzu iletiyoruz. 🎮`,
      "",
      `🔑 *İndirme kodu:* ${c.code}`,
      bitis ? `⏳ *Geçerlilik:* ${bitis} tarihine kadar` : "⏳ *Geçerlilik:* Süresiz",
      `💻 *Kullanım:* ${uses === 1 ? "tek indirme" : uses + " indirme"} · ${pcs} bilgisayar`,
      "",
      "*Kurulum adımları*",
      "1️⃣ https://fikoai.de/#spiele adresini açın",
      `2️⃣ ${oyun ? oyun + " kartındaki" : "Oyunun kartındaki"} *İndir* butonuna dokunun`,
      "3️⃣ Ad, soyad, telefon, e-posta, TikTok kullanıcı adınızı ve yukarıdaki kodu girin",
      "4️⃣ Oyunu ilk açtığınızda ekranda bir *cihaz kodu* görünür; bu kodu bu sohbetten bize iletin, lisansınızı hemen onaylayalım",
      "",
      "⚠️ Bu kod size özeldir; lütfen başkasıyla paylaşmayın.",
      "",
      "Sorularınız için bu numaradan bize her zaman ulaşabilirsiniz. Keyifli yayınlar dileriz!",
      "",
      "*fikoai.de*",
    ].join("\n");
  }
  // Mesajı göster: WhatsApp'ta aç + kopyala (telefonda pano izni kaybolsa da çalışır)
  function showWa(c) {
    const text = waText(c);
    modal("WhatsApp mesajı", `
      <p class="muted" style="margin:0 0 10px">Kod: <span class="code">${esc(c.code)}</span></p>
      <textarea class="input" id="wa-text" rows="14" style="width:100%;font-size:13px;line-height:1.45">${esc(text)}</textarea>`,
      [{ text: "Kapat" },
       { text: "Kopyala", run: async () => { const t = $("#wa-text").value; try { await navigator.clipboard.writeText(t); toast("Mesaj kopyalandı", "ok"); } catch (e) { $("#wa-text").select(); toast("Metni seçip kopyalayın", "err"); } return true; } },
       { text: "WhatsApp'ta aç", cls: "primary", run: async () => { window.open("https://wa.me/?text=" + encodeURIComponent($("#wa-text").value), "_blank", "noopener"); return true; } }]);
  }

  async function setDevice(id, patch, msg) {
    const { error } = await sb.from("license_devices").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    const d = state.devices.find((x) => x.id === id);
    if (d) Object.assign(d, patch);
    toast(msg, "ok");
    render();
    refresh();
  }

  function editDevice(d) {
    modal(`Cihaz · ${d.device_code}`, `
      <div class="kv mini" style="display:flex;gap:16px;flex-wrap:wrap"><span>Oyun: <b>${esc(appName(d.app_id))}</b></span><span>İlk görülme: <b>${dt(d.first_seen)}</b></span><span>IP: <b>${esc(d.last_ip || "—")}</b></span><span>Sürüm: <b>${esc(d.app_version || "—")}</b></span></div>
      <div class="hash">${esc(d.os || "")}</div>
      <label class="field">Etiket (kime ait)<input class="input" id="d-label" value="${esc(d.label)}"></label>
      <label class="field">Not<input class="input" id="d-note" value="${esc(d.owner_note)}"></label>
      <div class="grid2">
        <label class="field">TikTok kullanıcı adı (yayın hesabı)<input class="input" id="d-tt" value="${esc(d.tiktok_username)}" placeholder="kullanici_adi"></label>
        <label class="field">TikTok sayısal kimlik (boş bırakılabilir)<input class="input" id="d-ttid" value="${esc(d.tiktok_user_id)}" placeholder="otomatik"></label>
      </div>
      <div class="grid2">
        <label class="field">Durum<select class="input" id="d-status">
          ${[["pending", "Bekliyor"], ["approved", "Onaylı"], ["revoked", "Kapatıldı"]].map(([v, t]) => `<option value="${v}" ${d.status === v ? "selected" : ""}>${t}</option>`).join("")}</select></label>
        <label class="field">Lisans bitişi (boş = süresiz)<input class="input" type="datetime-local" id="d-exp" value="${d.expires_at ? new Date(new Date(d.expires_at).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ""}"></label>
      </div>
      <label class="field">Kapatma mesajı (oyuncu görür)<input class="input" id="d-kill" value="${esc(d.kill_message)}" placeholder="Bu cihazın izni kaldırıldı."></label>`,
      [
        { text: "Cihazı sil", cls: "danger", run: async () => {
          if (!confirm(`${d.device_code} silinsin mi? Oyun tekrar açılırsa bekleyen olarak yeniden düşer.`)) return true;
          const { error } = await sb.from("license_devices").delete().eq("id", d.id);
          if (error) throw new Error(error.message);
          toast("Cihaz silindi.", "ok"); refresh();
        } },
        { text: "Vazgeç" },
        { text: "Kaydet", cls: "primary", run: async () => {
          const exp = $("#d-exp").value;
          await setDevice(d.id, {
            label: $("#d-label").value.trim() || null,
            owner_note: $("#d-note").value.trim() || null,
            status: $("#d-status").value,
            expires_at: exp ? new Date(exp).toISOString() : null,
            kill_message: $("#d-kill").value.trim() || null,
            ...(() => {
              const tt = $("#d-tt").value.trim().replace(/^@+/, "").toLowerCase(), tid = $("#d-ttid").value.trim();
              if (tt && !/^[a-z0-9._]{2,24}$/.test(tt)) throw new Error("TikTok kullanıcı adı geçersiz.");
              if (tid && !/^[0-9]{3,30}$/.test(tid)) throw new Error("TikTok kimliği yalnız rakam olmalı.");
              const changed = tt !== (d.tiktok_username || "");
              return { tiktok_username: tt || null, tiktok_user_id: changed ? (tid || null) : (tid || d.tiktok_user_id || null), ...(changed ? { tiktok_verified_at: null } : {}) };
            })(),
          }, "Cihaz güncellendi.");
        } },
      ]);
  }

  // ---------- Build'ler ----------
  function viewBuilds() {
    return `
      <div class="page-head"><h2>Build'ler</h2><div class="tools"><span class="muted" style="font-size:13px">Yalnızca onaylı build'ler çalışır. Yeni build ilk açılışta buraya düşer.</span></div></div>
      <div class="panel">${state.builds.length ? `<div class="table-wrap"><table><thead><tr><th>Parmak izi</th><th>Oyun</th><th>Etiket</th><th>Durum</th><th>Cihaz</th><th>İlk / son</th><th style="text-align:right">İşlem</th></tr></thead><tbody>
        ${state.builds.map((b) => `<tr>
          <td><span class="hash" title="${esc(b.hash)}">${esc(b.hash.slice(0, 16))}…</span></td>
          <td>${esc(appName(b.app_id))}</td>
          <td>${esc(b.label || "—")}</td>
          <td>${buildBadge(b.status)}</td>
          <td>${b.device_count ?? 0}</td>
          <td>${dt(b.first_seen)}<div class="hash">${ago(b.last_seen)}</div></td>
          <td style="text-align:right"><div class="row-actions" style="justify-content:flex-end">
            ${b.status !== "approved" ? `<button class="btn sm ok" data-act="build-status" data-v="approved" data-app="${esc(b.app_id)}" data-hash="${esc(b.hash)}">Onayla</button>` : ""}
            ${b.status !== "blocked" ? `<button class="btn sm danger" data-act="build-status" data-v="blocked" data-app="${esc(b.app_id)}" data-hash="${esc(b.hash)}">Engelle</button>` : ""}
            <button class="btn sm ghost" data-act="build-label" data-app="${esc(b.app_id)}" data-hash="${esc(b.hash)}">Etiket</button>
          </div></td></tr>`).join("")}
        </tbody></table></div>` : '<div class="empty-row">Henüz build yok.</div>'}</div>`;
  }

  // ---------- Kayıtlar ----------
  const EVENT_TR = { register: "Yeni cihaz", flags: "Şüpheli işaret", new_build: "Yeni build", download: "İndirme", download_denied: "İndirme reddedildi", alert: "Güvenlik uyarısı", hw_locked: "Donanım kilitlendi", bind: "Koda bağlandı", tiktok_ok: "Yayın hesabı doğrulandı" };
  function logTable(rows) {
    if (!rows.length) return '<div class="empty-row">Kayıt yok.</div>';
    return `<div class="table-wrap"><table><thead><tr><th>Zaman</th><th>Olay</th><th>Oyun</th><th>Kod</th><th>Ayrıntı</th></tr></thead><tbody>
      ${rows.map((l) => {
        const det = l.detail || {};
        const txt = l.event === "flags" ? (det.flags || []).join(", ") : l.event === "register" ? [det.label, det.machine, det.status].filter(Boolean).join(" · ") : l.event === "new_build" ? (det.build || "").slice(0, 12) + "…" : (l.event === "download" || l.event === "download_denied") ? [det.name, det.ip].filter(Boolean).join(" · ") : l.event === "alert" ? ((ALERT_TR[det.kind] || [det.kind])[0] + " · " + (det.machine || "") + " · " + (det.ip || "")) : l.event === "bind" ? [det.code, det.person].filter(Boolean).join(" · ") : l.event === "tiktok_ok" ? "@" + (det.user || "") : l.event === "hw_locked" ? ["anakart " + (det.board || "?"), det.machine].filter(Boolean).join(" · ") : JSON.stringify(det).slice(0, 80);
        return `<tr><td title="${esc(dt(l.at))}">${ago(l.at)}</td><td>${l.event === "flags" || l.event === "alert" ? '<span class="badge off">' : '<span class="badge plain">'}${esc(EVENT_TR[l.event] || l.event)}</span></td><td>${esc(appName(l.app_id))}</td><td><span class="code">${esc(l.device_code || "")}</span></td><td class="hash">${esc(txt)}</td></tr>`;
      }).join("")}</tbody></table></div>`;
  }
  function viewLog() {
    return `<div class="page-head"><h2>Kayıtlar</h2><div class="tools"><button class="btn sm ghost" data-act="refresh">Yenile</button></div></div><div class="panel">${logTable(state.log)}</div>`;
  }

  // ---------- oyun aç/kapat ----------
  async function setApp(id, patch, msg) {
    const { error } = await sb.from("license_apps").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    const a = state.apps.find((x) => x.id === id);
    if (a) Object.assign(a, patch);
    toast(msg, "ok");
    render();
    refresh();
  }

  function askKill(a, input) {
    modal(`${a.name} kapatılsın mı?`, `
      <p style="margin:0">Oyun açık olan <b>tüm cihazlarda</b> bir sonraki kontrolde (en geç ~${a.heartbeat_seconds ?? 30} sn) kilitlenir ve siteden indirilemez.</p>
      <label class="field">Oyunculara gösterilecek mesaj (isteğe bağlı)<input class="input" id="k-msg" value="${esc(a.message)}" placeholder="Oyun geçici olarak kapatıldı."></label>`,
      [
        { text: "Vazgeç", run: async () => { input.checked = true; } },
        { text: "Oyunu kapat", cls: "danger solid", run: () => setApp(a.id, { enabled: false, message: $("#k-msg").value.trim() || null }, `${a.name} kapatıldı.`) },
      ]);
  }

  document.addEventListener("change", async (e) => {
    const sw = e.target.closest("[data-switch]");
    if (!sw) return;
    const a = state.apps.find((x) => x.id === sw.dataset.id);
    const field = sw.dataset.switch;
    if (field === "enabled" && !sw.checked) return askKill(a, sw);
    try {
      const labels = { enabled: ["açıldı", "kapatıldı"], published: ["sitede gösteriliyor", "siteden gizlendi"], auto_approve: ["otomatik onay açık", "otomatik onay kapalı"] };
      await setApp(a.id, { [field]: sw.checked }, `${a.name}: ${labels[field][sw.checked ? 0 : 1]}.`);
    } catch (err) { sw.checked = !sw.checked; toast(err.message, "err"); }
  });

  // ---------- eylemler ----------
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    try {
      if (act === "refresh") return refresh(true);
      if (act === "new-code") {
        const g = state.apps.find((a) => a.id === "neon-gazino") ? "neon-gazino" : "";
        return modal("İndirme kodu oluştur", `
          <label class="field">Oyun<select class="input" id="c-app"><option value="">Tüm oyunlar</option>${state.apps.map((a) => `<option value="${esc(a.id)}" ${a.id === g ? "selected" : ""}>${esc(a.name)}</option>`).join("")}</select></label>
          <label class="field">Kod<input class="input" id="c-code" value="${randomCode()}" style="text-transform:uppercase"></label>
          <div class="grid2"><label class="field">Kaç kez indirilebilir<input class="input" id="c-max" type="number" min="1" max="1000" value="1"></label>
          <label class="field">Kaç bilgisayarda çalışır<input class="input" id="c-dev" type="number" min="1" max="100" value="1"></label></div>
          <label class="field">Geçerlilik (gün, boş = süresiz)<input class="input" id="c-days" type="number" min="1" max="365" value="7"></label>
          <label class="field">Not (kime verildi)<input class="input" id="c-note" maxlength="200" placeholder="ör. Ahmet K. – WhatsApp"></label>`,
          [{ text: "Vazgeç" }, { text: "Oluştur", cls: "primary", run: async () => {
            const code = $("#c-code").value.trim().toUpperCase();
            if (!/^[A-Z0-9-]{6,32}$/.test(code)) throw new Error("Kod 6–32 karakter: harf, rakam, tire.");
            const days = parseInt($("#c-days").value, 10);
            const row = { code, app_id: $("#c-app").value || null, max_uses: Math.max(1, Math.min(1000, parseInt($("#c-max").value, 10) || 1)),
              max_devices: Math.max(1, Math.min(100, parseInt($("#c-dev").value, 10) || 1)),
              expires_at: days > 0 ? new Date(Date.now() + days * 86400000).toISOString() : null, note: $("#c-note").value.trim() || null };
            const { error } = await sb.from("download_codes").insert(row);
            if (error) throw new Error(/duplicate|unique/i.test(error.message) ? "Bu kod zaten var." : error.message);
            toast("Kod oluşturuldu ve kaydedildi: " + code, "ok");
            refresh();
            setTimeout(() => showWa(row), 50);
            return true;
          } }]);
      }
      if (act === "code-copy") { await navigator.clipboard.writeText(b.dataset.code); return toast("Kopyalandı: " + b.dataset.code, "ok"); }
      if (act === "code-wa") { const c = state.dlcodes.find((x) => x.code === b.dataset.code) || { code: b.dataset.code, app_id: b.dataset.app || null }; return showWa(c); }
      if (act === "code-revoke") {
        const { error } = await sb.from("download_codes").update({ revoked: true }).eq("id", b.dataset.id);
        if (error) throw new Error(error.message);
        toast("Kod iptal edildi", "ok"); return refresh();
      }
      if (act === "req-del") {
        return modal("Kayıt silinsin mi?", "<p style='margin:0'>Bu indirme talebindeki kişisel bilgiler kalıcı olarak silinir (silme talebi geldiğinde kullanın).</p>",
          [{ text: "Vazgeç" }, { text: "Sil", cls: "danger", run: async () => {
            const { error } = await sb.from("download_requests").delete().eq("id", b.dataset.id);
            if (error) throw new Error(error.message);
            toast("Silindi", "ok"); refresh();
          } }]);
      }
      if (act === "panic") {
        const live = state.apps.filter((a) => a.enabled);
        if (!live.length) return toast("Zaten tüm oyunlar kapalı.");
        return modal("Tüm oyunlar kapatılsın mı?", `<p style="margin:0">${live.map((a) => `<b>${esc(a.name)}</b>`).join(", ")} bütün cihazlarda kilitlenecek. Sonra tek tek açabilirsiniz.</p>
          <label class="field">Mesaj<input class="input" id="k-msg" placeholder="Oyunlar geçici olarak kapatıldı."></label>`,
          [{ text: "Vazgeç" }, { text: "Hepsini kapat", cls: "danger solid", run: async () => {
            const { error } = await sb.from("license_apps").update({ enabled: false, message: $("#k-msg").value.trim() || null }).in("id", live.map((a) => a.id));
            if (error) throw new Error(error.message);
            toast("Tüm oyunlar kapatıldı.", "ok"); refresh();
          } }]);
      }
      if (act === "new-game") return modal("Yeni oyun", gameForm(), [{ text: "Vazgeç" }, { text: "Oyunu ekle", cls: "primary", run: () => saveGame(null) }]);
      if (act === "edit-game") {
        const a = state.apps.find((x) => x.id === b.dataset.id);
        return modal(`${a.name} · düzenle`, gameForm(a), [{ text: "Vazgeç" }, { text: "Kaydet", cls: "primary", run: () => saveGame(a) }]);
      }
      if (act === "kill-msg") {
        const a = state.apps.find((x) => x.id === b.dataset.id);
        return modal("Kapalı mesajı", `<label class="field">Oyun kapalıyken oyunculara gösterilecek metin<input class="input" id="k-msg" value="${esc(a.message)}"></label>`,
          [{ text: "Vazgeç" }, { text: "Kaydet", cls: "primary", run: () => setApp(a.id, { message: $("#k-msg").value.trim() || null }, "Mesaj kaydedildi.") }]);
      }
      if (act === "show-devices") {
        state.filters = { app: b.dataset.id, status: "", q: "" };
        state.tab = "devices";
        $$("[data-tab]").forEach((x) => x.classList.toggle("active", x.dataset.tab === "devices"));
        return render();
      }
      if (act === "dev-status") {
        const d = state.devices.find((x) => x.id === b.dataset.id);
        if (b.dataset.v === "revoked") {
          return modal(`${d.device_code} kapatılsın mı?`, `<p style="margin:0">Bu cihazda oyun en geç ~30 sn içinde kilitlenir.</p><label class="field">Mesaj (isteğe bağlı)<input class="input" id="k-msg" value="${esc(d.kill_message)}"></label>`,
            [{ text: "Vazgeç" }, { text: "Cihazı kapat", cls: "danger solid", run: () => setDevice(d.id, { status: "revoked", kill_message: $("#k-msg").value.trim() || null }, `${d.device_code} kapatıldı.`) }]);
        }
        b.disabled = true;
        return setDevice(d.id, { status: "approved" }, `${d.device_code} onaylandı.`);
      }
      if (act === "dev-edit") return editDevice(state.devices.find((x) => x.id === b.dataset.id));
      if (act === "dev-hw") return hwModal(state.devices.find((x) => x.id === b.dataset.id));
      if (act && act.startsWith("alert-")) {
        const al = state.alerts.find((x) => String(x.id) === b.dataset.id);
        if (!al) return;
        const d = state.devices.find((x) => x.device_id === al.device_id && x.app_id === al.app_id);
        const resolve = async (note) => {
          const { error } = await sb.from("license_alerts").update({ resolved_at: new Date().toISOString(), resolved_note: note }).eq("id", al.id);
          if (error) throw new Error(error.message);
        };
        if (act === "alert-detail") {
          return modal(`${(ALERT_TR[al.kind] || [al.kind])[0]} · ${al.device_code || ""}`, `<p class="muted" style="margin:0 0 8px">${esc((ALERT_TR[al.kind] || ["", ""])[1])}</p>
            <div class="hash">İlk: ${dt(al.created_at)} · son: ${dt(al.last_at)} · ${al.hits} kez · IP ${esc(al.ip || "—")}</div>
            <pre style="white-space:pre-wrap;word-break:break-all;font-size:12px;max-height:50vh;overflow:auto;background:rgba(255,255,255,.04);padding:10px;border-radius:10px">${esc(JSON.stringify(al.detail, null, 2))}</pre>`,
            d ? [{ text: "Donanımı göster", run: () => { hwModal(d); return true; } }, { text: "Kapat" }] : [{ text: "Kapat" }]);
        }
        if (act === "alert-resolve") { await resolve("yönetici kapattı"); toast("Uyarı kapatıldı.", "ok"); return refresh(); }
        if (act === "alert-accept-hw") {
          return modal("Yeni donanım kabul edilsin mi?", `<p style="margin:0">${esc(al.device_code)} lisansı bu donanımda da çalışacak. İlk kayıt değişmez; yalnızca bu yeni donanım izinli listeye eklenir. Bunu yalnızca kişinin parça değiştirdiğinden eminsen yap.</p>`,
            [{ text: "Vazgeç" }, { text: "Kabul et", cls: "primary", run: async () => {
              const allowed = [...new Set([...(d.hw_allowed || []), al.detail.hw_hash])];
              const { error } = await sb.from("license_devices").update({ hw_allowed: allowed }).eq("id", d.id);
              if (error) throw new Error(error.message);
              await resolve("yeni donanım kabul edildi"); toast("Yeni donanım kabul edildi.", "ok"); refresh();
            } }]);
        }
        if (act === "alert-revoke") {
          return modal(`${al.device_code} lisansı kapatılsın mı?`, `<p style="margin:0">Bu lisans tüm bilgisayarlarda (asıl bilgisayar dahil) en geç ~30 sn içinde kilitlenir ve kapanır.</p><label class="field">Mesaj<input class="input" id="k-msg" value="Lisans kötüye kullanım nedeniyle kapatıldı."></label>`,
            [{ text: "Vazgeç" }, { text: "Lisansı kapat", cls: "danger solid", run: async () => {
              const { error } = await sb.from("license_devices").update({ status: "revoked", kill_message: $("#k-msg").value.trim() || null }).eq("id", d.id);
              if (error) throw new Error(error.message);
              await resolve("lisans kapatıldı"); toast(`${al.device_code} kapatıldı.`, "ok"); refresh();
            } }]);
        }
      }
      if (act === "approve-all") {
        const ids = filteredDevices().filter((d) => d.status === "pending").map((d) => d.id);
        if (!ids.length || !confirm(`${ids.length} bekleyen cihaz onaylansın mı?`)) return;
        const { error } = await sb.from("license_devices").update({ status: "approved" }).in("id", ids);
        if (error) throw new Error(error.message);
        toast(`${ids.length} cihaz onaylandı.`, "ok"); return refresh();
      }
      if (act === "build-status") {
        const { error } = await sb.from("license_builds").update({ status: b.dataset.v }).eq("app_id", b.dataset.app).eq("hash", b.dataset.hash);
        if (error) throw new Error(error.message);
        toast(b.dataset.v === "approved" ? "Build onaylandı." : "Build engellendi.", "ok"); return refresh();
      }
      if (act === "build-label") {
        const bl = state.builds.find((x) => x.app_id === b.dataset.app && x.hash === b.dataset.hash);
        return modal("Build etiketi", `<label class="field">Etiket<input class="input" id="b-label" value="${esc(bl.label)}" placeholder="v1.0 yayın"></label>`,
          [{ text: "Vazgeç" }, { text: "Kaydet", cls: "primary", run: async () => {
            const { error } = await sb.from("license_builds").update({ label: $("#b-label").value.trim() || null }).eq("app_id", bl.app_id).eq("hash", bl.hash);
            if (error) throw new Error(error.message);
            toast("Etiket kaydedildi.", "ok"); refresh();
          } }]);
      }
    } catch (err) { toast(err.message, "err"); }
  });

  boot();
})();
