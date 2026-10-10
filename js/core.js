/* ============================================================
   TEMA — patrón de 3 pasos
   ============================================================ */
function resolveTheme(){
  const s = localStorage.getItem('aruki-theme') || 'system';
  return s === 'system' ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : s;
}
function applyTheme(t){
  document.documentElement.dataset.theme = t;
  const s = localStorage.getItem('aruki-theme') || 'system';
  document.querySelectorAll('.theme-opt').forEach(b => b.classList.toggle('active', b.dataset.themeOpt === s));
}
function setTheme(v){
  localStorage.setItem('aruki-theme', v);
  applyTheme(v === 'system' ? resolveTheme() : v);
}
document.querySelectorAll('.theme-opt').forEach(b => b.addEventListener('click', () => setTheme(b.dataset.themeOpt)));
window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
  if ((localStorage.getItem('aruki-theme') || 'system') === 'system') applyTheme(resolveTheme());
});
applyTheme(resolveTheme());

/* ============================================================
   LOGIN SEGURO — validado en Cloudflare Worker
   ============================================================ */
const WORKER_BASE = "https://aruki.dentalabarg.workers.dev";
const SESSION_KEY = "aruki_secure_session";

function getStoredSession(){
  const raw = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function getAuthToken(){
  return getStoredSession()?.token || "";
}

function clearSession(){
  localStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem("aruki_session");
  sessionStorage.removeItem("aruki_session");
  localStorage.removeItem("dentalab_session");
  sessionStorage.removeItem("dentalab_session");
}

function showLogin(message = ""){
  document.getElementById("app").classList.add("hidden");
  document.getElementById("loginScreen").classList.remove("hidden");
  const status = document.getElementById("authStatus");
  status.textContent = message || "Usuario o contraseña incorrectos.";
  status.dataset.state = message ? "error" : "idle";
}

async function checkSession(){
  const saved = getStoredSession();
  if (!saved?.token) return;

  try {
    const response = await fetch(`${WORKER_BASE}/auth/session`, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "Authorization": `Bearer ${saved.token}`
      },
      cache: "no-store"
    });
    const payload = await response.json();
    if (!response.ok || !payload?.authenticated) throw new Error("Sesión inválida");
    enterApp(payload.name || saved.name || "Usuario");
  } catch {
    clearSession();
    showLogin("La sesión venció. Volvé a ingresar.");
  }
}

function enterApp(name){
  document.getElementById("loginScreen").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
  document.getElementById("userName").textContent = name;
  document.getElementById("userAvatar").textContent =
    name.split(" ").map(p => p[0]).join("").slice(0,2).toUpperCase();
  showModule("cotizaciones");
}

document.getElementById("loginForm").addEventListener("submit", async function(e){
  e.preventDefault();

  const username = document.getElementById("loginUser").value.trim();
  const password = document.getElementById("loginPass").value;
  const remember = document.getElementById("rememberMe").checked;
  const status = document.getElementById("authStatus");
  const submit = document.getElementById("loginSubmitBtn");

  status.dataset.state = "idle";
  submit.disabled = true;
  submit.textContent = "Verificando…";

  try {
    const response = await fetch(`${WORKER_BASE}/auth/login`, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ username, password, remember }),
      cache: "no-store"
    });

    const payload = await response.json();
    if (!response.ok || !payload?.token) {
      throw new Error(payload?.error || "Usuario o contraseña incorrectos.");
    }

    clearSession();
    const session = JSON.stringify({
      token: payload.token,
      name: payload.name || username
    });

    if (remember) localStorage.setItem(SESSION_KEY, session);
    else sessionStorage.setItem(SESSION_KEY, session);

    document.getElementById("loginPass").value = "";
    enterApp(payload.name || username);
  } catch(error) {
    status.textContent = String(error?.message || error);
    status.dataset.state = "error";
  } finally {
    submit.disabled = false;
    submit.textContent = "Iniciar sesión";
  }
});

document.getElementById("eyeBtn").addEventListener("click", function(){
  const input = document.getElementById("loginPass");
  input.type = input.type === "password" ? "text" : "password";
});

document.getElementById("logoutBtn").addEventListener("click", function(){
  clearSession();
  cacheClearAll();   // al cerrar sesión se borran los datos guardados en esta computadora
  showLogin();
  document.getElementById("loginForm").reset();
  document.getElementById("rememberMe").checked = true;
  facturasModule.reset();
  articulosModule.reset();
  relacionesModule.reset();
  cotizacionesModule.reset();
  showModule("cotizaciones");
});

/* ============================================================
   SIDEBAR — contraer / expandir + mobile
   ============================================================ */
const sidebar = document.getElementById('sidebar');
const sidebarBackdrop = document.getElementById('sidebarBackdrop');

document.getElementById('sidebarToggleBtn').addEventListener('click', function(){
  if (window.innerWidth <= 980) {
    sidebar.classList.toggle('mobile-open');
    sidebarBackdrop.classList.toggle('hidden');
  } else {
    sidebar.classList.toggle('collapsed');
    localStorage.setItem('aruki-sidebar', sidebar.classList.contains('collapsed') ? 'collapsed' : 'open');
  }
});
sidebarBackdrop.addEventListener('click', function(){
  sidebar.classList.remove('mobile-open');
  sidebarBackdrop.classList.add('hidden');
});
if (localStorage.getItem('aruki-sidebar') === 'collapsed' && window.innerWidth > 980) {
  sidebar.classList.add('collapsed');
}

/* ============================================================
   CHANGELOG MODAL
   ============================================================ */
function renderChangelog(){
  const wrap = document.getElementById('changelogList');
  wrap.innerHTML = CHANGELOG.map(entry => `
    <div class="cl-entry">
      <div><span class="cl-version">v${entry.version}</span><span class="cl-date">${entry.date}</span></div>
      <div class="cl-title">${entry.title}</div>
      <ul class="cl-items">
        ${entry.items.map(it => `<li><span class="cl-tag ${it.type}">${it.type}</span>${it.text}</li>`).join('')}
      </ul>
    </div>
  `).join('');
}
document.getElementById('changelogBtn').addEventListener('click', function(){
  renderChangelog();
  document.getElementById('changelogModal').classList.remove('hidden');
});
document.getElementById('closeChangelog').addEventListener('click', function(){
  document.getElementById('changelogModal').classList.add('hidden');
});
document.getElementById('changelogModal').addEventListener('click', function(e){
  if (e.target === this) this.classList.add('hidden');
});
document.getElementById('topVersion').textContent = LATEST_VERSION;
document.getElementById('loginVersion').textContent = LATEST_VERSION;

/* ============================================================
   UTILIDADES COMPARTIDAS
   ============================================================ */
const moneyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency", currency: "ARS",
  minimumFractionDigits: 0, maximumFractionDigits: 2
});
const numberFormatter = new Intl.NumberFormat("es-AR");
const decimalFormatter = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });
const priceFormatter = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2, maximumFractionDigits: 2 });

function escapeHtml(value){
  return String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
function toNumber(value){
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
function money(value){ return moneyFormatter.format(toNumber(value)); }
function fmtDateTime(value){
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return escapeHtml(value);
  return date.toLocaleString("es-AR", {
    day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit"
  });
}
/* Para buscar sin importar mayúsculas ni tildes */
function foldText(value){
  return String(value ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/* ============================================================
   CARGA COMPLETA DE TODAS LAS PÁGINAS DE UNA SMARTIE
   ------------------------------------------------------------
   Trae la página 1, calcula cuántas páginas hay y descarga el resto
   de a pocas por vez (para no saturar YiQi).
   ============================================================ */
const LOAD_CONCURRENCY = 4;
const LOAD_RETRIES = 2;

class SessionExpired extends Error {}

function sleep(ms){ return new Promise(resolve => setTimeout(resolve, ms)); }

async function fetchSmartiePage(endpoint, page, signal){
  let lastError;
  for (let attempt = 0; attempt <= LOAD_RETRIES; attempt++) {
    const token = getAuthToken();
    if (!token) throw new SessionExpired("Sesión vencida.");
    try {
      const response = await fetch(`${endpoint}?page=${encodeURIComponent(page)}&_=${Date.now()}`, {
        method: "GET",
        headers: { "Accept": "application/json", "Authorization": `Bearer ${token}` },
        cache: "no-store",
        signal
      });
      let payload;
      try { payload = await response.json(); }
      catch { throw new Error(`El conector respondió con un formato inválido (HTTP ${response.status}).`); }
      if (response.status === 401) throw new SessionExpired("Sesión vencida.");
      if (!response.ok) throw new Error(payload?.error || `Error HTTP ${response.status}.`);
      if (payload?.error) throw new Error(payload.error);
      if (!Array.isArray(payload?.data)) throw new Error("La respuesta de YiQi no contiene una lista válida.");
      return payload;
    } catch (error) {
      if (error instanceof SessionExpired || signal?.aborted) throw error;
      lastError = error;
      if (attempt < LOAD_RETRIES) await sleep(700 * (attempt + 1));
    }
  }
  throw lastError;
}

async function loadAllPages(endpoint, signal, onProgress){
  const first = await fetchSmartiePage(endpoint, 1, signal);
  const pageSize = first.data.length || 1;
  const total = toNumber(first.total) || first.data.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pages = new Array(totalPages + 1);
  pages[1] = first.data;
  const failed = [];
  let done = 1;
  let nextPage = 2;

  const flatten = () => {
    const rows = [];
    for (let p = 1; p <= totalPages; p++) if (pages[p]) for (const r of pages[p]) rows.push(r);
    return rows;
  };
  const report = () => onProgress({ done, totalPages, total, columns: first.columns, flatten });
  report();

  async function worker(){
    while (!signal.aborted) {
      const page = nextPage++;
      if (page > totalPages) return;
      try {
        const payload = await fetchSmartiePage(endpoint, page, signal);
        pages[page] = payload.data;
      } catch (error) {
        if (error instanceof SessionExpired) throw error;
        if (signal.aborted) return;
        failed.push(page);
      }
      done++;
      report();
    }
  }

  const workers = Array.from({ length: Math.min(LOAD_CONCURRENCY, totalPages - 1) }, worker);
  await Promise.all(workers);

  return {
    rows: flatten(), columns: first.columns, total, totalPages,
    failed: failed.sort((a, b) => a - b), aborted: signal.aborted
  };
}

/* ============================================================
   DATOS GUARDADOS EN ESTA COMPUTADORA (IndexedDB)
   ------------------------------------------------------------
   Guarda lo descargado de una smartie para no volver a bajarlo
   cada vez que se entra. Si algo falla, simplemente no se usa.
   ============================================================ */
const CACHE_DB = "aruki-cache";
const CACHE_STORE = "smarties";
function cacheOpen(){
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(CACHE_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(CACHE_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function cacheRun(mode, fn){
  try {
    const db = await cacheOpen();
    return await new Promise(resolve => {
      const tx = db.transaction(CACHE_STORE, mode);
      const req = fn(tx.objectStore(CACHE_STORE));
      tx.oncomplete = () => { db.close(); resolve(req?.result ?? null); };
      tx.onerror = tx.onabort = () => { db.close(); resolve(null); };
    });
  } catch { return null; }
}
const cacheGet = key => cacheRun("readonly", st => st.get(key));
const cacheSet = (key, value) => cacheRun("readwrite", st => st.put(value, key));
const cacheClearAll = () => cacheRun("readwrite", st => st.clear());

function fmtAgo(ms){
  const min = Math.max(0, Math.round(ms / 60000));
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60), r = min % 60;
  return `hace ${h} h${r ? ` ${r} min` : ""}`;
}

/* ============================================================
   MÓDULO GENÉRICO: carga todo, busca en todo, pagina en pantalla
   ============================================================ */
function createDataModule(cfg){
  const $ = key => document.getElementById(cfg.ids[key]);
  const m = {
    rows: [], columns: [], total: 0, viewPage: 1, search: "",
    loading: false, loaded: false, abort: null, loadId: 0, failed: [], lastRender: 0,
    refreshing: false, restoring: false, savedAt: 0
  };
  const cacheMaxAge = cfg.cache ? cfg.cache.maxAgeHours * 3600000 : 0;

  m.setState = function(state, title, text, progress){
    const banner = $("banner");
    banner.dataset.state = state;
    const labels = { idle: "Sin datos", loading: "Cargando desde YiQi", connected: "Conectado a YiQi", error: "Atención" };
    $("kicker").textContent = labels[state] || "Estado";
    $("title").textContent = title;
    $("text").textContent = text;
    const showProgress = typeof progress === "number";
    $("progress").classList.toggle("hidden", !showProgress);
    if (showProgress) $("progressFill").style.width = `${Math.max(2, Math.min(100, progress * 100))}%`;
    $("stop").classList.toggle("hidden", state !== "loading");
    $("retry").classList.toggle("hidden", state !== "error");
    $("refresh").disabled = m.loading || m.refreshing;
  };

  /* Aviso cuando se están usando los datos guardados */
  m.showSavedState = function(){
    if (!cfg.cache || !m.savedAt) return;
    const when = new Date(m.savedAt).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
    m.setState("connected", `${numberFormatter.format(m.rows.length)} registros listos`,
      `Actualizados el ${when} (${fmtAgo(Date.now() - m.savedAt)}). Se actualizan solos cada ${cfg.cache.maxAgeHours} horas; con Actualizar lo hacés ahora.`);
    $("kicker").textContent = "Guardado en esta computadora";
  };

  m.filtered = function(){
    const terms = foldText(m.search).split(/\s+/).filter(Boolean);
    return m.rows.filter(row => {
      if (cfg.filter && !cfg.filter(row)) return false;
      if (!terms.length) return true;
      if (row.__s === undefined) row.__s = foldText(cfg.searchText(row, m));
      return terms.every(t => row.__s.includes(t));
    });
  };

  m.render = function(){
    const filtered = m.filtered();
    const totalPages = Math.max(1, Math.ceil(filtered.length / cfg.viewSize));
    if (m.viewPage > totalPages) m.viewPage = totalPages;
    if (m.viewPage < 1) m.viewPage = 1;
    const start = (m.viewPage - 1) * cfg.viewSize;
    const pageRows = filtered.slice(start, start + cfg.viewSize);

    cfg.renderRows(pageRows, filtered, m);

    const empty = $("empty");
    if (!pageRows.length) {
      empty.textContent = m.loading
        ? "Cargando datos desde YiQi…"
        : (m.rows.length ? "No se encontraron resultados con esa búsqueda o filtro." : cfg.emptyText);
      empty.classList.remove("hidden");
    } else {
      empty.classList.add("hidden");
    }

    $("currentPage").textContent = numberFormatter.format(m.viewPage);
    $("totalPages").textContent = numberFormatter.format(totalPages);
    $("totalRecords").textContent = numberFormatter.format(filtered.length);
    $("note").textContent = m.rows.length
      ? `${numberFormatter.format(m.rows.length)} de ${numberFormatter.format(m.total || m.rows.length)} registros de YiQi cargados. La búsqueda y los filtros se aplican sobre todo lo cargado.`
      : "La búsqueda y los filtros se aplican sobre todo lo cargado desde YiQi.";

    const wrap = $("pageButtons");
    const count = Math.min(5, totalPages);
    let from = Math.max(1, m.viewPage - 2);
    let to = from + count - 1;
    if (to > totalPages) { to = totalPages; from = Math.max(1, to - count + 1); }
    wrap.innerHTML = Array.from({ length: to - from + 1 }, (_, i) => from + i).map(p => `
      <button class="page-btn ${p === m.viewPage ? "active" : ""}" type="button" data-page="${p}"
        aria-label="Ir a la página ${p}">${numberFormatter.format(p)}</button>`).join("");
    wrap.querySelectorAll("[data-page]").forEach(btn => {
      btn.addEventListener("click", () => { m.viewPage = Number(btn.dataset.page); m.render(); });
    });
    $("first").disabled = m.viewPage <= 1;
    $("last").disabled = m.viewPage >= totalPages;
    $("refresh").disabled = m.loading || m.refreshing;
  };

  m.load = async function(){
    if (m.loading || m.refreshing) return;
    if (!getAuthToken()) { clearSession(); showLogin("La sesión venció. Volvé a ingresar."); return; }
    // Con datos guardados: se actualiza "por detrás" y se sigue usando lo que ya hay
    if (cfg.cache && m.loaded && m.rows.length) return m.refreshInBackground();

    m.loading = true;
    m.loadId += 1;
    const id = m.loadId;
    m.abort = new AbortController();
    m.failed = [];
    m.lastRender = 0;
    let firstChunk = true;
    m.setState("loading", cfg.loadingTitle, "Consultando la primera página…", 0.02);
    m.render();

    try {
      const result = await loadAllPages(cfg.endpoint, m.abort.signal, snap => {
        if (id !== m.loadId) return;
        if (firstChunk) { m.viewPage = 1; firstChunk = false; }
        m.total = snap.total;
        m.columns = snap.columns || m.columns;
        m.setState("loading", cfg.loadingTitle,
          `Página ${numberFormatter.format(snap.done)} de ${numberFormatter.format(snap.totalPages)} descargada${snap.done === 1 ? "" : "s"}. Ya podés buscar mientras termina.`,
          snap.done / snap.totalPages);
        const now = Date.now();
        if (m.rows.length === 0 || now - m.lastRender > 700) {
          m.rows = snap.flatten();
          m.lastRender = now;
          m.render();
        }
      });
      if (id !== m.loadId) return;

      m.rows = result.rows;
      m.columns = result.columns || m.columns;
      m.total = result.total;
      m.failed = result.failed;
      m.loaded = !result.aborted;
      m.loading = false;

      if (result.aborted) {
        m.setState("idle", "Carga detenida",
          `Se cargaron ${numberFormatter.format(m.rows.length)} de ${numberFormatter.format(m.total)} registros. Presioná Actualizar para cargar todo.`);
      } else if (m.failed.length) {
        m.setState("error", "Carga incompleta",
          `No se pudieron descargar ${m.failed.length} página(s) (${m.failed.slice(0, 8).join(", ")}${m.failed.length > 8 ? "…" : ""}). Presioná Reintentar para volver a cargar todo.`);
      } else if (cfg.cache) {
        m.saveCache();
        m.showSavedState();
      } else {
        m.setState("connected", "Todos los registros cargados",
          `${numberFormatter.format(m.rows.length)} registros traídos desde YiQi. Actualizá para volver a consultar.`);
      }
      m.render();
      document.dispatchEvent(new CustomEvent("aruki:loaded", { detail: { endpoint: cfg.endpoint } }));
    } catch (error) {
      if (id !== m.loadId) return;
      m.loading = false;
      if (error instanceof SessionExpired) {
        clearSession();
        showLogin("La sesión venció. Volvé a ingresar.");
        return;
      }
      m.setState("error", "No se pudieron obtener los datos", String(error?.message || error));
      m.render();
    }
  };

  const savedAgo = () => m.savedAt ? `los datos guardados (${fmtAgo(Date.now() - m.savedAt)})` : "los datos ya cargados";
  m.saveCache = function(){
    m.savedAt = Date.now();
    const rows = m.rows.map(r => { const { __s, ...rest } = r; return rest; });
    cacheSet(cfg.cache.key, { rows, columns: m.columns, total: m.total, savedAt: m.savedAt });
  };

  /* Descarga todo de nuevo sin borrar lo que se está usando; reemplaza al terminar bien */
  m.refreshInBackground = async function(){
    m.refreshing = true;
    m.loadId += 1;
    const id = m.loadId;
    m.abort = new AbortController();
    m.setState("loading", "Actualizando desde YiQi", "Mientras tanto podés seguir usando los datos guardados.", 0.02);
    try {
      const result = await loadAllPages(cfg.endpoint, m.abort.signal, snap => {
        if (id !== m.loadId) return;
        m.setState("loading", "Actualizando desde YiQi",
          `Página ${numberFormatter.format(snap.done)} de ${numberFormatter.format(snap.totalPages)}. Mientras tanto podés seguir usando los datos guardados.`,
          snap.done / snap.totalPages);
      });
      if (id !== m.loadId) return;
      m.refreshing = false;
      if (result.aborted) { if (m.savedAt) m.showSavedState(); else m.setState("idle", "Actualización detenida", "Seguís usando los datos ya cargados."); return; }
      if (result.failed.length) {
        m.setState("error", "No se pudo actualizar del todo",
          `Fallaron ${result.failed.length} página(s). Seguís usando ${savedAgo()}. Presioná Reintentar.`);
        return;
      }
      m.rows = result.rows;
      m.columns = result.columns || m.columns;
      m.total = result.total;
      m.failed = [];
      m.saveCache();
      m.showSavedState();
      m.render();
      document.dispatchEvent(new CustomEvent("aruki:loaded", { detail: { endpoint: cfg.endpoint } }));
    } catch (error) {
      if (id !== m.loadId) return;
      m.refreshing = false;
      if (error instanceof SessionExpired) { clearSession(); showLogin("La sesión venció. Volvé a ingresar."); return; }
      m.setState("error", "No se pudo actualizar",
        `${String(error?.message || error)} Seguís usando ${savedAgo()}.`);
    }
  };

  m.stop = function(){ if (m.abort) m.abort.abort(); };

  m.ensureLoaded = async function(){
    if (m.loaded || m.loading || m.refreshing || m.restoring || !getAuthToken()) return;
    if (cfg.cache) {
      m.restoring = true;
      const loadId = m.loadId;
      const saved = await cacheGet(cfg.cache.key);
      m.restoring = false;
      if (loadId !== m.loadId || m.loaded || m.loading) return;
      if (saved && Array.isArray(saved.rows) && saved.rows.length) {
        m.rows = saved.rows;
        m.columns = saved.columns || [];
        m.total = saved.total || saved.rows.length;
        m.savedAt = saved.savedAt || 0;
        m.loaded = true;
        m.viewPage = 1;
        m.showSavedState();
        m.render();
        document.dispatchEvent(new CustomEvent("aruki:loaded", { detail: { endpoint: cfg.endpoint } }));
        if (Date.now() - m.savedAt >= cacheMaxAge) m.load();
        return;
      }
    }
    m.load();
  };

  /* Cada minuto: refresca el "hace X min" y actualiza solo cuando pasaron las horas indicadas */
  if (cfg.cache) {
    setInterval(() => {
      if (!m.loaded || !m.savedAt || m.loading || m.refreshing || !getAuthToken()) return;
      if (Date.now() - m.savedAt >= cacheMaxAge) m.load();
      else if ($("banner").dataset.state === "connected") m.showSavedState();
    }, 60000);
  }

  m.reset = function(){
    m.loadId += 1;
    if (m.abort) m.abort.abort();
    m.rows = []; m.columns = []; m.total = 0; m.viewPage = 1; m.search = "";
    m.loading = false; m.loaded = false; m.failed = []; m.refreshing = false; m.restoring = false; m.savedAt = 0;
    if (cfg.onReset) cfg.onReset(m);
    $("search").value = "";
    m.setState("idle", "Sin datos cargados", cfg.idleText);
    m.render();
  };

  let searchTimer;
  $("search").addEventListener("input", function(){
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { m.search = this.value; m.viewPage = 1; m.render(); }, 150);
  });
  $("refresh").addEventListener("click", () => m.load());
  $("retry").addEventListener("click", () => m.load());
  $("stop").addEventListener("click", () => m.stop());
  $("first").addEventListener("click", () => { m.viewPage = 1; m.render(); });
  $("last").addEventListener("click", () => {
    m.viewPage = Math.max(1, Math.ceil(m.filtered().length / cfg.viewSize));
    m.render();
  });

  return m;
}

