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

  const state = { tab: "devices", apps: [], devices: [], builds: [], log: [], stats: null, filters: { app: "", status: "", q: "" }, timer: null };

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
      const [apps, stats, devices, builds, log] = await Promise.all([
        sb.from("license_apps").select("*").order("sort_order").order("name"),
        sb.rpc("portal_stats"),
        sb.from("license_devices").select("*").order("last_seen", { ascending: false }).limit(1000),
        sb.from("license_builds").select("*").order("last_seen", { ascending: false }).limit(500),
        (full || state.tab === "log" || state.tab === "overview")
          ? sb.from("license_log").select("*").order("at", { ascending: false }).limit(300)
          : Promise.resolve({ data: state.log }),
      ]);
      const err = [apps, stats, devices, builds, log].find((r) => r.error)?.error;
      if (err) {
        if (/JWT|auth|yetkisiz/i.test(err.message)) return showLogin("Oturum süresi doldu, tekrar giriş yapın.");
        throw err;
      }
      state.apps = apps.data; state.stats = stats.data; state.devices = devices.data; state.builds = builds.data; state.log = log.data || [];
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
    m.innerHTML = { overview: viewOverview, games: viewGames, devices: viewDevices, builds: viewBuilds, log: viewLog }[state.tab]();
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
      (!q || [d.device_code, d.label, d.machine_name, d.owner_note, d.last_ip].some((v) => (v || "").toLowerCase().includes(q))));
  }
  function viewDevices() {
    const f = state.filters;
    const list = filteredDevices();
    return `
      <div class="page-head"><h2>Lisans kodları</h2>
        <div class="tools"><button class="btn sm ok" data-act="approve-all" ${list.some((d) => d.status === "pending") ? "" : "disabled"}>Listedeki bekleyenleri onayla</button><button class="btn sm ghost" data-act="refresh">Yenile</button></div></div>
      <div class="panel">
        <div class="filters">
          <input class="input" id="flt-q" placeholder="Kod, etiket, bilgisayar ara…" value="${esc(f.q)}">
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
        <td><span class="code">${esc(d.device_code)}</span>${(d.last_flags || []).length ? ` <span class="badge off" title="${esc((d.last_flags || []).join(", "))}">⚠ ${esc(d.last_flags.join(", "))}</span>` : ""}</td>
        <td>${esc(appName(d.app_id))}</td>
        <td>${esc(d.label || "—")}<div class="hash">${esc(d.machine_name || "")}${d.owner_note ? " · " + esc(d.owner_note) : ""}</div></td>
        <td>${devBadge(d)} ${online(d.last_seen) ? '<span class="badge info">çevrim içi</span>' : ""}${!compact && d.expires_at ? `<div class="hash">bitiş: ${dt(d.expires_at)}</div>` : ""}</td>
        <td title="${esc(dt(d.last_seen))} · ${d.check_count ?? 0} sorgu">${ago(d.last_seen)}</td>
        <td class="c-act" style="text-align:right"><div class="row-actions" style="justify-content:flex-end">
          ${d.status !== "approved" ? `<button class="btn sm ok" data-act="dev-status" data-v="approved" data-id="${d.id}">Onayla</button>` : ""}
          ${d.status !== "revoked" ? `<button class="btn sm danger" data-act="dev-status" data-v="revoked" data-id="${d.id}">Kapat</button>` : ""}
          <button class="btn sm ghost" data-act="dev-edit" data-id="${d.id}">Düzenle</button>
        </div></td></tr>`).join("")}
      </tbody></table></div>`;
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
  const EVENT_TR = { register: "Yeni cihaz", flags: "Şüpheli işaret", new_build: "Yeni build", download: "İndirme" };
  function logTable(rows) {
    if (!rows.length) return '<div class="empty-row">Kayıt yok.</div>';
    return `<div class="table-wrap"><table><thead><tr><th>Zaman</th><th>Olay</th><th>Oyun</th><th>Kod</th><th>Ayrıntı</th></tr></thead><tbody>
      ${rows.map((l) => {
        const det = l.detail || {};
        const txt = l.event === "flags" ? (det.flags || []).join(", ") : l.event === "register" ? [det.label, det.machine, det.status].filter(Boolean).join(" · ") : l.event === "new_build" ? (det.build || "").slice(0, 12) + "…" : l.event === "download" ? "" : JSON.stringify(det).slice(0, 80);
        return `<tr><td title="${esc(dt(l.at))}">${ago(l.at)}</td><td>${l.event === "flags" ? '<span class="badge off">' : '<span class="badge plain">'}${esc(EVENT_TR[l.event] || l.event)}</span></td><td>${esc(appName(l.app_id))}</td><td><span class="code">${esc(l.device_code || "")}</span></td><td class="hash">${esc(txt)}</td></tr>`;
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
