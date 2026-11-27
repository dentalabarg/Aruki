/* ============================================================
   TEMA — patrón de 3 pasos
   ============================================================ */
function resolveTheme(){
  const s = localStorage.getItem('aruki-theme') || 'system';
  return s === 'system' ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : s;
}
function applyTheme(t){
  document.documentElement.dataset.theme = t;
  // v6.8: un solo botón redondo (luna/sol); marca el tema que se ve (si estaba en "sistema", el que resolvió)
  document.querySelectorAll('.theme-opt').forEach(b => b.classList.toggle('active', b.dataset.themeOpt === t));
}
function setTheme(v){
  localStorage.setItem('aruki-theme', v);
  applyTheme(v === 'system' ? resolveTheme() : v);
}
// Cerrado muestra solo el tema actual; al tocarlo se abre y muestra los dos; al elegir uno se cierra
document.querySelectorAll('.theme-opt').forEach(b => b.addEventListener('click', e => {
  const box = b.closest('.theme-toggle');
  e.stopPropagation();
  if (!box.classList.contains('open')) { box.classList.add('open'); return; }
  setTheme(b.dataset.themeOpt);
  box.classList.remove('open');
}));
document.addEventListener('click', () => document.querySelectorAll('.theme-toggle.open').forEach(x => x.classList.remove('open')));
document.addEventListener('keydown', e => { if (e.key === 'Escape') document.querySelectorAll('.theme-toggle.open').forEach(x => x.classList.remove('open')); });
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
  setTimeout(staleCheck, 4000);
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
  manualModule.reset();
  if (typeof cobranzasModule !== "undefined") cobranzasModule.reset();
  clientesStore.reset();
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
/* Precios: si son enteros, sin decimales ($ 34.700); si no, con dos ($ 34.700,50) */
const priceIsWhole = n => Math.abs(n - Math.round(n)) < 0.005;
const priceFmt2 = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const priceFmt0 = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 0, maximumFractionDigits: 0 });
const priceFormatter = { format: n => (priceIsWhole(Number(n)) ? priceFmt0 : priceFmt2).format(n) };

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
/* Orden de SKU (v6.3): por partes separadas por "-"; cada parte en orden "natural"
   (números de menor a mayor y antes que las letras): 50-30, 50-946, 50-a1, 50-a3, 55-n3, 60-99, 60-b8 */
const SKU_COLLATOR = new Intl.Collator("es", { numeric: true, sensitivity: "base" });
function skuCompare(a, b){
  const pa = String(a ?? "").trim().split("-"), pb = String(b ?? "").trim().split("-");
  for (let i = 0; i < Math.min(pa.length, pb.length); i++) {
    const c = SKU_COLLATOR.compare(pa[i].trim(), pb[i].trim());
    if (c) return c;
  }
  return pa.length - pb.length || SKU_COLLATOR.compare(String(a ?? ""), String(b ?? ""));
}

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

async function fetchSmartiePage(endpoint, page, signal, extra = ""){
  let lastError;
  for (let attempt = 0; attempt <= LOAD_RETRIES; attempt++) {
    const token = getAuthToken();
    if (!token) throw new SessionExpired("Sesión vencida.");
    try {
      const response = await fetch(`${endpoint}?page=${encodeURIComponent(page)}${extra}&_=${Date.now()}`, {
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
  // El conector avisa si va por consulta rápida (1000 por página) o por la smartie (50): el resto de las páginas va igual
  const extra = first.modo ? `&modo=${encodeURIComponent(first.modo)}` : "";
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
        const payload = await fetchSmartiePage(endpoint, page, signal, extra);
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
    rows: flatten(), columns: first.columns, total, totalPages, modo: first.modo || "", motivo: first.motivo || "",
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

/* ============================================================
   DATOS GUARDADOS EN EL SERVIDOR (v7.3, Cloudflare KV vía el conector)
   ------------------------------------------------------------
   Una tarea automática de GitHub baja Clientes, Artículos y Facturas cada 3 horas y los deja
   en el conector (comprimidos). Al entrar, Aruki trae esa copia en vez de bajar todo de YiQi.
   El botón de actualizar baja de YiQi como siempre y además sube el resultado para todos.
   Si el conector es viejo (sin /cache), todo sigue funcionando como antes.
   ============================================================ */
const SRV_STALE_HOURS = 6;
let srvMetaMemo = { at: 0, promise: null };
async function srvFetch(path, opts = {}){
  const token = getAuthToken();
  if (!token) throw new SessionExpired("Sesión vencida.");
  const r = await fetch(`${WORKER_BASE}${path}`, {
    ...opts, cache: "no-store", headers: { ...(opts.headers || {}), Authorization: `Bearer ${token}` }
  });
  if (r.status === 401) throw new SessionExpired("Sesión vencida.");
  return r;
}
/* { clientes:{fecha, registros, robot…}, articulos:{…}, facturas:{…} } o null (se recuerda 1 min) */
function srvMeta(force = false){
  if (!force && srvMetaMemo.promise && Date.now() - srvMetaMemo.at < 60000) return srvMetaMemo.promise;
  srvMetaMemo = { at: Date.now(), promise: srvFetch("/cache").then(r => r.ok ? r.json() : null).then(j => (j && j.datos) || null).catch(() => null) };
  return srvMetaMemo.promise;
}
async function srvGet(name){
  const r = await srvFetch(`/cache/${name}`);
  if (!r.ok) return null;
  return await new Response(r.body.pipeThrough(new DecompressionStream("gzip"))).json();
}
/* Sube lo que se acaba de bajar de YiQi (si falla, no pasa nada: queda en esta computadora) */
async function srvPut(name, payload){
  try {
    const gz = await new Response(new Blob([JSON.stringify(payload)]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer();
    const r = await srvFetch(`/cache/${name}?registros=${payload.rows.length}&fecha=${payload.fecha}`,
      { method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: gz });
    srvMetaMemo.at = 0;
    if (r.ok) staleCheck();
  } catch {}
}
/* Aviso si la tarea automática dejó de actualizar (por ej. GitHub la pausó) */
async function staleCheck(){
  const banner = document.getElementById("staleBanner");
  if (!banner || !getAuthToken()) return;
  const meta = await srvMeta();
  /* v7.9: se mira cada dato por separado (antes alcanzaba con que se actualizara uno) y cuenta también
     si alguien lo actualizó a mano (fecha). */
  const NOMBRES = { clientes: "Clientes", articulos: "Artículos", facturas: "Facturas", cobranzas: "Cuentas corrientes" };
  const viejos = Object.entries(meta || {})
    .filter(([n, d]) => NOMBRES[n] && Number(d.robot))
    .map(([n, d]) => ({ n: NOMBRES[n], t: Math.max(Number(d.robot) || 0, Number(d.fecha) || 0) }))
    .filter(x => Date.now() - x.t > SRV_STALE_HOURS * 3600000);
  const late = viejos.length > 0;
  const robot = late ? Math.min(...viejos.map(x => x.t)) : 0;
  banner.classList.toggle("hidden", !late);
  if (late) banner.innerHTML = `<strong>${viejos.length < 4 ? viejos.map(x => x.n).join(", ") + ": l" : "L"}os datos no se actualizan solos desde ${fmtAgo(Date.now() - robot)}.</strong>
    Para forzarlo: github.com → repositorio <b>Aruki</b> → pestaña <b>Actions</b> → «Actualizar datos de Aruki» → <b>Run workflow</b>
    (si arriba aparece un cartel amarillo de tarea pausada, tocá antes <b>Enable workflow</b>). Mientras tanto podés actualizar con los botones de arriba.`;
}
setInterval(staleCheck, 10 * 60000);

function fmtAgo(ms){
  const min = Math.max(0, Math.round(ms / 60000));
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60), r = min % 60;
  return `hace ${h} h${r ? ` ${r} min` : ""}`;
}

/* Ajusta la altura del cuadro con scroll de un módulo para que toda la página entre en la pantalla
   (sin scroll de la página entera: solo se scrollea adentro del cuadro). */
const FIT_VIEWS = ["view-articulos", "view-relaciones"];
function fitScrollArea(viewId){
  const view = document.getElementById(viewId);
  if (!view || view.classList.contains("hidden") || window.innerWidth <= 980) {
    if (view) { const el = view.querySelector(".art-scroll"); if (el) el.style.maxHeight = ""; }
    return;
  }
  const el = view.querySelector(".art-scroll");
  if (!el) return;
  el.style.maxHeight = "0px";                      // se mide con el cuadro cerrado
  const top = el.getBoundingClientRect().top + window.scrollY;
  const pad = parseFloat(getComputedStyle(view.parentElement).paddingBottom) || 0;
  const below = view.getBoundingClientRect().bottom + window.scrollY - top + pad;   // paginación, márgenes, etc.
  const avail = Math.floor(window.innerHeight - top - below);
  el.style.maxHeight = `${Math.max(220, avail)}px`;
}
function fitScrollAreas(){ FIT_VIEWS.forEach(fitScrollArea); }
window.addEventListener("resize", () => requestAnimationFrame(fitScrollAreas));
// Si algo cambia de tamaño dentro de la página (un formulario que se abre, etc.) se vuelve a ajustar
let fitPending = false;
if (window.ResizeObserver) {
  new ResizeObserver(() => {
    if (fitPending) return;
    fitPending = true;
    requestAnimationFrame(() => { fitPending = false; fitScrollAreas(); });
  }).observe(document.querySelector(".content"));
}

/* Texto para los tooltips: cómo se leyó (rápida de a 1000 o smartie de a 50) y por qué */
function modoTexto(modo, motivo){
  if (modo === "rapido") return " · lectura rápida";
  if (modo === "smartie") return ` · lectura por smartie${motivo ? ` (motivo: ${motivo})` : ""}`;
  return "";
}

/* Botones "Actualizar …" de la barra superior: se van rellenando con el avance */
function syncBtnProgress(btn, progress, error, done = true){
  if (!btn) return;
  const busy = typeof progress === "number";
  const wasBusy = btn.classList.contains("is-busy");
  btn.classList.toggle("is-busy", busy);
  btn.classList.toggle("is-error", !busy && !!error);
  btn.style.setProperty("--p", busy ? String(Math.max(0.02, Math.min(1, progress))) : "0");
  btn.dataset.pct = busy ? `${Math.round(Math.max(0, Math.min(1, progress)) * 100)} %` : "";
  if (!busy) {
    btn.classList.remove("is-done");
    if (!error && done && wasBusy) { void btn.offsetWidth; btn.classList.add("is-done"); setTimeout(() => btn.classList.remove("is-done"), 1200); }
  }
}

/* ============================================================
   MÓDULO GENÉRICO: carga todo, busca en todo, pagina en pantalla
   ============================================================ */
/* ============================================================
   TABLA CON ORDEN Y ANCHO DE COLUMNAS (v7.6, la usan Cuentas corrientes y Facturas de venta)
   gridRender(wrap, store, cols, rows, footHtml, onRow, sortState {k,d}, onSort(newState), presorted)
   cols: [{ k, t, w, num, html(row), sv(row) }]. Anchos en localStorage "aruki-<store>".
   ============================================================ */
/* v8.2: "-v2" para empezar de cero (los anchos viejos guardaban solo algunas columnas) */
function gridColW(store){ try { return JSON.parse(localStorage.getItem(`aruki-${store}-v2`) || "{}") || {}; } catch { return {}; } }
function gridSaveColW(store, w){ try { localStorage.setItem(`aruki-${store}-v2`, JSON.stringify(w)); } catch {} }
function gridSortRows(rows, cols, st){
  const col = cols.find(c => c.k === st.k) || cols[0];
  const val = col.sv || (r => r[col.k]);
  return [...rows].sort((a, b) => {
    const x = val(a), y = val(b);
    if (x === y) return 0;
    if (x === null || x === undefined || x === "") return 1;
    if (y === null || y === undefined || y === "") return -1;
    return (typeof x === "string" ? x.localeCompare(y, "es", { numeric: true }) : (x < y ? -1 : 1)) * st.d;
  });
}
/* cols: [{ k, t, w, num, html(row), sv(row), foot }]; onRow(row) al tocar una fila */
function gridRender(wrap, key, cols, rows, footHtml, onRow, st, onSort, presorted = false){
  /* v8.2: como en Artículos. Sin anchos guardados la tabla ocupa justo el recuadro (porcentajes: nunca aparece la barra
     horizontal). Al arrastrar un borde se fijan TODOS los anchos en píxeles y solo cambia esa columna (las demás quedan
     quietas; si la tabla queda más ancha que el recuadro, aparece la barra). Doble clic en un borde: anchos originales. */
  const saved = gridColW(key);
  const has = cols.some(c => saved[c.k]);
  const sumW = cols.reduce((s, c) => s + (c.w || 120), 0);
  const colW = c => has ? `${saved[c.k] || c.w || 120}px` : `${((c.w || 120) / sumW * 100).toFixed(3)}%`;
  const sorted = presorted ? rows : gridSortRows(rows, cols, st);
  wrap.innerHTML = `<table class="table cob-table">
    <colgroup>${cols.map(c => `<col style="width:${colW(c)}">`).join("")}</colgroup>
    <thead><tr>${cols.map(c => `<th data-k="${c.k}" class="${c.num ? "num" : ""} ${st.k === c.k ? "is-sorted" : ""}" title="Ordenar">
      <span>${escapeHtml(c.t)}</span>${st.k === c.k ? `<i class="cob-arrow">${st.d > 0 ? "▲" : "▼"}</i>` : ""}<b class="cob-resize" title="Arrastrá para cambiar el ancho · doble clic: anchos originales"></b></th>`).join("")}</tr></thead>
    <tbody>${sorted.length ? sorted.map((r, i) => `<tr data-i="${i}" class="${onRow ? "is-click" : ""}">${cols.map(c => `<td class="${c.num ? "num" : ""}">${c.html(r)}</td>`).join("")}</tr>`).join("")
      : `<tr><td colspan="${cols.length}" class="cob-empty">No hay nada con esos filtros.</td></tr>`}</tbody>
    ${footHtml && sorted.length ? `<tfoot><tr>${footHtml}</tr></tfoot>` : ""}
  </table>`;
  const table = wrap.querySelector("table");
  const colEls = [...table.querySelectorAll("col")];
  const totalW = () => colEls.reduce((s, c) => s + parseFloat(c.style.width), 0);
  table.style.width = has ? `${totalW()}px` : "100%";
  table.querySelectorAll("th").forEach((th, idx) => {
    th.addEventListener("click", e => {
      if (e.target.closest(".cob-resize") || th.dataset.dragged) { delete th.dataset.dragged; return; }
      const k = th.dataset.k;
      onSort(st.k === k ? { k, d: -st.d } : { k, d: cols[idx].num ? -1 : 1 });
    });
    const handle = th.querySelector(".cob-resize");
    handle.addEventListener("dblclick", e => {
      e.preventDefault(); e.stopPropagation();
      try { localStorage.removeItem(`aruki-${key}-v2`); } catch {}
      onSort(st);   // vuelve a dibujar con los anchos originales
    });
    handle.addEventListener("mousedown", e => {
      e.preventDefault(); e.stopPropagation();
      // Se fijan en píxeles los anchos que se ven ahora (así las otras columnas no se mueven)
      const ths = [...table.querySelectorAll("thead th")];
      const now = ths.map(h => h.getBoundingClientRect().width);
      colEls.forEach((c, i) => { c.style.width = `${Math.round(now[i])}px`; });
      table.style.width = `${totalW()}px`;
      const col = colEls[idx];
      const x0 = e.clientX, w0 = parseFloat(col.style.width);
      document.body.classList.add("cob-resizing");
      const move = ev => { col.style.width = `${Math.max(50, Math.round(w0 + ev.clientX - x0))}px`; table.style.width = `${totalW()}px`; };
      const up = () => {
        document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up);
        document.body.classList.remove("cob-resizing");
        const w = {}; cols.forEach((c, i) => { w[c.k] = Math.round(parseFloat(colEls[i].style.width)); });
        gridSaveColW(key, w);
        th.dataset.dragged = "1"; setTimeout(() => delete th.dataset.dragged, 0);
      };
      document.addEventListener("mousemove", move); document.addEventListener("mouseup", up);
    });
  });
  if (onRow) table.querySelectorAll("tbody tr[data-i]").forEach(tr => tr.addEventListener("click", e => {
    if (e.target.closest("a,button")) return;
    onRow(sorted[Number(tr.dataset.i)]);
  }));
  return sorted;
}


/* v7.6: link para abrir una factura en YiQi (id interno de la factura) */
const YIQI_WEB_SCHEMA = 328;
function yiqiFacturaUrl(id){ return `https://me.yiqi.com.ar/view/FACTURA?schemaId=${YIQI_WEB_SCHEMA}#/${encodeURIComponent(id)}`; }
/* v8.0: reporte de cuenta corriente de un cliente (reportId 68, instanceId = id del cliente; formato dado por el usuario) */
function yiqiCtaCteUrl(clienteId){ return `https://me.yiqi.com.ar/report/view?schemaId=${YIQI_WEB_SCHEMA}&reportId=68&instanceId=${encodeURIComponent(clienteId)}`; }
function yiqiCtaCteLinkHtml(clienteId){
  if (clienteId === null || clienteId === undefined || clienteId === "") return "";
  return yiqiLinkHtml(clienteId, yiqiCtaCteUrl(clienteId), "Abrir la cuenta corriente en YiQi");
}
function yiqiLinkHtml(id, url, title = "Abrir esta factura en YiQi"){
  if (id === null || id === undefined || id === "") return "";
  return `<a class="yiqi-link" href="${url || yiqiFacturaUrl(id)}" target="_blank" rel="noopener" title="${title}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg></a>`;
}

function createDataModule(cfg){
  const $ = key => document.getElementById(cfg.ids[key]);
  const m = {
    rows: [], columns: [], total: 0, viewPage: 1, search: "",
    loading: false, loaded: false, abort: null, loadId: 0, failed: [], lastRender: 0,
    refreshing: false, restoring: false, savedAt: 0
  };
  const cacheMaxAge = cfg.cache ? cfg.cache.maxAgeHours * 3600000 : 0;
  const srvName = cfg.serverCache || "";   // v7.3: nombre de los datos guardados en el servidor

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
    syncBtnProgress($("refresh"), state === "loading" ? (showProgress ? progress : 0.02) : null, state === "error", state === "connected");
    const rb = $("refresh");
    if (!rb.dataset.title) rb.dataset.title = rb.title;
    rb.title = state === "loading" ? "Actualizando… tocá para detener" : state === "error" ? `${title}: ${text}` : rb.dataset.title;
  };

  /* Aviso cuando se están usando los datos guardados */
  m.showSavedState = function(){
    if (!cfg.cache || !m.savedAt) return;
    const when = new Date(m.savedAt).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
    m.setState("connected", `${numberFormatter.format(m.rows.length)} registros listos`,
      `Actualizados el ${when} (${fmtAgo(Date.now() - m.savedAt)}). Se actualizan solos cada ${srvName ? 3 : cfg.cache.maxAgeHours} horas; con el botón de arriba lo hacés ahora.`);
    $("kicker").textContent = "Datos guardados";
    $("refresh").title = `${cfg.syncTitle || "Traer los datos actualizados desde YiQi"} · ${numberFormatter.format(m.rows.length)} registros · Última actualización: ${when} (${fmtAgo(Date.now() - m.savedAt)})${modoTexto(m.modo, m.motivo)}`;
  };

  m.filtered = function(){
    const terms = foldText(m.search).split(/\s+/).filter(Boolean);
    let base = m.rows;
    if (cfg.sortRows) {          // orden fijo (Artículos: por SKU); se rehace solo si cambiaron las filas
      if (m.sortedFor !== m.rows || m.sortedLen !== m.rows.length) {
        m.sorted = cfg.sortRows(m.rows, m); m.sortedFor = m.rows; m.sortedLen = m.rows.length;
      }
      base = m.sorted;
    }
    const out = base.filter(row => {
      if (cfg.filter && !cfg.filter(row)) return false;
      if (!terms.length) return true;
      if (row.__s === undefined) row.__s = foldText(cfg.searchText(row, m));
      return terms.every(t => row.__s.includes(t));
    });
    return cfg.sortFiltered ? cfg.sortFiltered(out, m) : out;   // v7.6: orden elegido tocando el título (Facturas)
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
      m.modo = result.modo; m.motivo = result.motivo;
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
        const rb = $("refresh");
        rb.dataset.title = `${cfg.syncTitle || "Traer los datos actualizados desde YiQi"} · ${numberFormatter.format(m.rows.length)} registros${modoTexto(m.modo, m.motivo)}`;
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
      if (m.abort?.signal.aborted) {
        m.setState("idle", "Carga detenida", `Se cargaron ${numberFormatter.format(m.rows.length)} registros.`);
        m.render();
        return;
      }
      m.setState("error", "No se pudieron obtener los datos", String(error?.message || error));
      m.render();
    }
  };

  const savedAgo = () => m.savedAt ? `los datos guardados (${fmtAgo(Date.now() - m.savedAt)})` : "los datos ya cargados";
  /* fromServer: los datos vinieron del servidor (no se vuelven a subir) */
  m.saveCache = function(fromServer = false){
    if (!fromServer) m.savedAt = Date.now();
    const rows = m.rows.map(r => { const { __s, ...rest } = r; return rest; });
    cacheSet(cfg.cache.key, { rows, columns: m.columns, total: m.total, savedAt: m.savedAt, modo: m.modo, motivo: m.motivo });
    if (!fromServer && srvName) srvPut(srvName, { rows, columns: m.columns, total: m.total, modo: m.modo || "", motivo: m.motivo || "", fecha: m.savedAt });
  };

  /* v7.3: si el servidor tiene datos más nuevos que los de esta computadora, los trae (true si los trajo) */
  m.syncFromServer = async function(force = false){
    if (!srvName || m.syncing || m.loading || m.refreshing) return false;
    const meta = await srvMeta(force);
    const info = meta && meta[srvName];
    if (!info || !(Number(info.fecha) > m.savedAt)) return false;
    m.syncing = true;
    const id = m.loadId;
    if (!m.rows.length) m.setState("loading", "Trayendo los datos guardados", "Un momento…", 0.5);
    try {
      const data = await srvGet(srvName);
      if (id !== m.loadId || m.loading || m.refreshing) return false;
      if (!data || !Array.isArray(data.rows) || !data.rows.length) return false;
      const fecha = Number(data.fecha) || Number(info.fecha);
      if (fecha <= m.savedAt) return false;
      const first = !m.rows.length;
      m.rows = data.rows; m.columns = data.columns || m.columns; m.total = data.total || data.rows.length;
      m.modo = data.modo || ""; m.motivo = data.motivo || "";
      m.savedAt = fecha; m.loaded = true; m.failed = [];
      if (first) m.viewPage = 1;
      m.saveCache(true);
      m.showSavedState();
      m.render();
      document.dispatchEvent(new CustomEvent("aruki:loaded", { detail: { endpoint: cfg.endpoint } }));
      return true;
    } catch (error) {
      if (error instanceof SessionExpired) { clearSession(); showLogin("La sesión venció. Volvé a ingresar."); }
      return false;
    } finally {
      m.syncing = false;
    }
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
      m.modo = result.modo; m.motivo = result.motivo;
      m.failed = [];
      m.saveCache();
      m.showSavedState();
      m.render();
      document.dispatchEvent(new CustomEvent("aruki:loaded", { detail: { endpoint: cfg.endpoint } }));
    } catch (error) {
      if (id !== m.loadId) return;
      m.refreshing = false;
      if (error instanceof SessionExpired) { clearSession(); showLogin("La sesión venció. Volvé a ingresar."); return; }
      if (m.abort?.signal.aborted) { if (m.savedAt) m.showSavedState(); else m.setState("idle", "Actualización detenida", ""); return; }
      m.setState("error", "No se pudo actualizar",
        `${String(error?.message || error)} Seguís usando ${savedAgo()}.`);
    }
  };

  m.stop = function(){ if (m.abort) m.abort.abort(); };

  m.ensureLoaded = async function(){
    if (m.loaded || m.loading || m.refreshing || m.restoring || m.syncing || !getAuthToken()) return;
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
        m.modo = saved.modo || ""; m.motivo = saved.motivo || "";
        m.loaded = true;
        m.viewPage = 1;
        m.showSavedState();
        m.render();
        document.dispatchEvent(new CustomEvent("aruki:loaded", { detail: { endpoint: cfg.endpoint } }));
        // Primero se fija si el servidor tiene algo más nuevo; solo si no y ya pasaron las horas, baja de YiQi
        const got = await m.syncFromServer();
        if (!got && !m.loading && !m.refreshing && Date.now() - m.savedAt >= cacheMaxAge) m.load();
        return;
      }
      // Nada en esta computadora: se prueba con lo guardado en el servidor antes de bajar todo de YiQi
      if (await m.syncFromServer()) return;
      if (m.loaded || m.loading || m.refreshing) return;
    }
    m.load();
  };

  /* Cada minuto: refresca el "hace X min"; cada 10 min se fija si el servidor tiene datos nuevos;
     si pasaron las horas indicadas y el servidor no tiene nada más nuevo, baja de YiQi */
  if (cfg.cache) {
    let ticks = 0;
    setInterval(async () => {
      ticks += 1;
      if (!m.loaded || !m.savedAt || m.loading || m.refreshing || m.syncing || !getAuthToken()) return;
      if (Date.now() - m.savedAt >= cacheMaxAge) {
        if (!(await m.syncFromServer()) && !m.loading && !m.refreshing && Date.now() - m.savedAt >= cacheMaxAge) m.load();
      } else if (srvName && ticks % 10 === 0) {
        await m.syncFromServer();
      } else if ($("banner").dataset.state === "connected") m.showSavedState();
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
  // El mismo botón actualiza o, si ya está actualizando, detiene
  $("refresh").addEventListener("click", () => (m.loading || m.refreshing) ? m.stop() : m.load());
  $("retry").addEventListener("click", () => m.load());
  $("stop").addEventListener("click", () => m.stop());
  $("first").addEventListener("click", () => { m.viewPage = 1; m.render(); });
  $("last").addEventListener("click", () => {
    m.viewPage = Math.max(1, Math.ceil(m.filtered().length / cfg.viewSize));
    m.render();
  });

  return m;
}


/* ---------- v5.7 Interruptores: además del clic, se pueden arrastrar (derecha = encendido, izquierda = apagado) ---------- */
(function(){
  let drag = null;
  // En Artículos son casillas comunes (v5.8): no se arrastran
  const isSwitch = el => el instanceof HTMLInputElement && el.type === "checkbox" && !el.closest("#view-articulos");
  document.addEventListener("pointerdown", e => {
    if (!isSwitch(e.target) || e.target.disabled) return;
    drag = { el: e.target, x: e.clientX, before: e.target.checked };
  }, true);
  document.addEventListener("pointermove", e => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (Math.abs(dx) > 4) {
      drag.el.classList.add("is-dragging");
      // El botón sigue al dedo / mouse mientras se arrastra
      const base = drag.before ? 14 : 0;
      drag.el.style.setProperty("--knob", `${Math.max(0, Math.min(14, base + dx))}px`);
    }
  }, true);
  document.addEventListener("click", e => {
    if (!drag || e.target !== drag.el) { drag = null; return; }
    const { el, x, before } = drag;
    const dx = e.clientX - x;
    el.classList.remove("is-dragging"); el.style.removeProperty("--knob");
    drag = null;
    if (Math.abs(dx) <= 4) return;                  // fue un clic común: cambia como siempre
    const want = dx > 0;                            // arrastró a la derecha → encendido
    if (want === before) { e.preventDefault(); el.checked = before; }   // ya estaba así: no cambia
    else el.checked = want;                         // el clic ya lo cambió al valor pedido
  }, true);
  document.addEventListener("pointerup", e => {
    if (!drag) return;
    // Soltó fuera del interruptor después de arrastrar: igual se aplica
    if (e.target !== drag.el && Math.abs(e.clientX - drag.x) > 4) {
      const { el, before } = drag;
      const want = e.clientX - drag.x > 0;
      el.classList.remove("is-dragging"); el.style.removeProperty("--knob");
      drag = null;
      if (want !== before) { el.checked = want; el.dispatchEvent(new Event("change", { bubbles: true })); }
      return;
    }
    setTimeout(() => { if (drag) { drag.el.classList.remove("is-dragging"); drag.el.style.removeProperty("--knob"); drag = null; } }, 0);
  }, true);
})();

/* v8.7: "x" para borrar la búsqueda (Cuentas corrientes y Facturas de venta), igual que en Artículos */
document.querySelectorAll(".search-clear[data-for]").forEach(btn => {
  const input = document.getElementById(btn.dataset.for);
  if (!input) return;
  const sync = () => btn.classList.toggle("hidden", !input.value);
  input.addEventListener("input", sync);
  btn.addEventListener("click", () => { input.value = ""; input.dispatchEvent(new Event("input")); input.focus(); sync(); });
  sync();
});

/* ============================================================
   v8.8 Lista desplegable con casillas (varios a la vez) — Cuentas corrientes y Facturas de venta.
   La lista tiene el mismo ancho que el botón; el botón se ensancha para que entre el nombre más largo.
   ms = multiSelect(wrap, { set, allText, manyText:n=>"", title, onChange }); ms.render(items)
   ============================================================ */
const _msCanvas = document.createElement("canvas").getContext("2d");
function _msTextW(text, font){ _msCanvas.font = font; return _msCanvas.measureText(String(text)).width; }
function multiSelect(wrap, opt){
  const set = opt.set || new Set();
  let items = [];
  wrap.classList.add("cob-multi");
  wrap.innerHTML = `<button class="ds-input cob-multi-btn" type="button" title="${escapeHtml(opt.title || "Elegí uno o varios")}"><span></span><i>▾</i></button><div class="cob-multi-pop hidden"></div>`;
  const btn = wrap.querySelector(".cob-multi-btn"), pop = wrap.querySelector(".cob-multi-pop"), txt = btn.querySelector("span");
  const fit = () => {
    const fam = getComputedStyle(document.body).fontFamily || "sans-serif";
    const itemW = Math.max(_msTextW("Todos", `600 13.5px ${fam}`), ...items.map(v => _msTextW(v, `400 13.5px ${fam}`)));
    const scroll = items.length > 8 ? 12 : 0;   // barra de la lista si es larga
    const need = Math.max(_msTextW(opt.allText, `500 14px ${fam}`) + 54, itemW + 66 + scroll);
    wrap.style.width = `${Math.ceil(Math.min(380, Math.max(opt.minWidth || 120, need)))}px`;
  };
  const ms = {
    set,
    render(list){
      if (list) { items = list; fit(); }
      const n = set.size;
      txt.textContent = !n ? opt.allText : n === 1 ? [...set][0] : opt.manyText(n);
      btn.classList.toggle("is-set", n > 0);
      pop.innerHTML = `<label class="cob-multi-all"><input type="checkbox" data-all ${n ? "" : "checked"}> Todos</label>` +
        items.map(v => `<label title="${escapeHtml(v)}"><input type="checkbox" data-v="${escapeHtml(v)}" ${set.has(v) ? "checked" : ""}> <span>${escapeHtml(v)}</span></label>`).join("");
    },
    close(){ pop.classList.add("hidden"); },
  };
  btn.addEventListener("click", e => {
    e.stopPropagation();
    const open = pop.classList.contains("hidden");
    document.querySelectorAll(".cob-multi-pop, .drp-pop").forEach(p => p.classList.add("hidden"));
    pop.classList.toggle("hidden", !open);
  });
  pop.addEventListener("click", e => e.stopPropagation());
  pop.addEventListener("change", e => {
    const i = e.target;
    if (i.dataset.all !== undefined) set.clear();
    else if (i.checked) set.add(i.dataset.v); else set.delete(i.dataset.v);
    ms.render(); opt.onChange && opt.onChange(set);
  });
  return ms;
}
document.addEventListener("click", () => document.querySelectorAll(".cob-multi-pop, .drp-pop").forEach(p => p.classList.add("hidden")));
document.addEventListener("keydown", e => { if (e.key === "Escape") document.querySelectorAll(".cob-multi-pop, .drp-pop").forEach(p => p.classList.add("hidden")); });

/* ============================================================
   v8.8 Calendario de rango (un solo cuadro "desde – hasta"): primer clic = desde, segundo = hasta;
   entre los dos se pinta suave mientras se mueve el mouse; la X borra. Fechas en formato AAAA-MM-DD.
   dr = dateRange(wrap, { placeholder, onChange:(desde, hasta)=>{} }); dr.desde / dr.hasta / dr.clear()
   ============================================================ */
const DR_MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
function _drIso(d){ return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function _drFmt(iso){ return iso ? iso.split("-").reverse().join("/") : ""; }
function dateRange(wrap, opt){
  const calIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="16.5" rx="3"/><line x1="3" y1="9.5" x2="21" y2="9.5"/><line x1="8" y1="2.5" x2="8" y2="6.5"/><line x1="16" y1="2.5" x2="16" y2="6.5"/></svg>`;
  wrap.classList.add("drp");
  wrap.innerHTML = `<button class="ds-input drp-btn" type="button" title="Elegí desde qué día y hasta qué día">${calIcon}<span></span></button>
    <button type="button" class="drp-x hidden" title="Borrar las fechas" aria-label="Borrar las fechas"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
    <div class="drp-pop hidden"></div>`;
  const btn = wrap.querySelector(".drp-btn"), x = wrap.querySelector(".drp-x"), pop = wrap.querySelector(".drp-pop");
  const st = { desde: "", hasta: "", anchor: "", hover: "", view: null };
  const today = _drIso(new Date());
  const label = () => {
    const t = st.desde && st.hasta ? (st.desde === st.hasta ? _drFmt(st.desde) : `${_drFmt(st.desde)} – ${_drFmt(st.hasta)}`)
      : st.desde ? `Desde ${_drFmt(st.desde)}` : "";
    btn.querySelector("span").textContent = t || opt.placeholder;
    btn.classList.toggle("is-set", !!t);
    x.classList.toggle("hidden", !t);
  };
  const month = (y, m) => {
    const first = new Date(y, m, 1), days = new Date(y, m + 1, 0).getDate();
    const lead = (first.getDay() + 6) % 7;   // semana empieza el lunes
    let lo = st.desde, hi = st.hasta;
    if (st.anchor && st.hover) { lo = st.anchor < st.hover ? st.anchor : st.hover; hi = st.anchor < st.hover ? st.hover : st.anchor; }
    const preview = !!(st.anchor && st.hover);
    let cells = "";
    for (let i = 0; i < lead; i++) cells += `<span class="drp-day is-empty"></span>`;
    for (let d = 1; d <= days; d++) {
      const iso = _drIso(new Date(y, m, d));
      const cls = ["drp-day"];
      if (lo && hi && iso > lo && iso < hi) cls.push(preview ? "in-preview" : "in-range");
      if (iso === lo && hi && lo !== hi) cls.push("is-start", preview ? "pv" : "");
      if (iso === hi && lo && lo !== hi) cls.push("is-end", preview ? "pv" : "");
      if (iso === lo || iso === hi || iso === st.anchor) cls.push("is-edge");
      if (iso === today) cls.push("is-today");
      cells += `<button type="button" class="${cls.join(" ")}" data-d="${iso}"><span>${d}</span></button>`;
    }
    return `<div class="drp-month"><div class="drp-mtitle">${DR_MESES[m]} ${y}</div>
      <div class="drp-week">${["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"].map(w => `<span>${w}</span>`).join("")}</div>
      <div class="drp-grid">${cells}</div></div>`;
  };
  const render = () => {
    const v = st.view;
    const v2 = new Date(v.getFullYear(), v.getMonth() + 1, 1);
    pop.innerHTML = `<div class="drp-head">
        <button type="button" class="drp-nav" data-nav="-12" title="Un año antes">«</button>
        <button type="button" class="drp-nav" data-nav="-1" title="Mes anterior">‹</button>
        <span class="drp-hint">${st.anchor ? "Ahora elegí la fecha hasta" : "Elegí la fecha desde"}</span>
        <button type="button" class="drp-nav" data-nav="1" title="Mes siguiente">›</button>
        <button type="button" class="drp-nav" data-nav="12" title="Un año después">»</button>
      </div>
      <div class="drp-months">${month(v.getFullYear(), v.getMonth())}${month(v2.getFullYear(), v2.getMonth())}</div>`;
  };
  const apply = () => { label(); opt.onChange && opt.onChange(st.desde, st.hasta); };
  const close = () => {
    pop.classList.add("hidden");
    if (st.anchor) { st.desde = st.anchor; st.hasta = ""; st.anchor = ""; apply(); }   // solo eligió "desde"
  };
  btn.addEventListener("click", e => {
    e.stopPropagation();
    if (!pop.classList.contains("hidden")) { close(); return; }
    document.querySelectorAll(".cob-multi-pop, .drp-pop").forEach(p => p.classList.add("hidden"));
    st.anchor = "";
    const base = st.hasta || st.desde ? new Date((st.hasta || st.desde) + "T12:00:00") : new Date();
    st.view = new Date(base.getFullYear(), base.getMonth() - 1, 1);
    st.anchor = ""; st.hover = "";
    render(); pop.classList.remove("hidden");
  });
  pop.addEventListener("click", e => {
    e.stopPropagation();
    const nav = e.target.closest("[data-nav]");
    if (nav) { st.view = new Date(st.view.getFullYear(), st.view.getMonth() + Number(nav.dataset.nav), 1); render(); return; }
    const day = e.target.closest("[data-d]");
    if (!day) return;
    const d = day.dataset.d;
    if (!st.anchor) { st.anchor = d; st.hover = d; render(); return; }
    st.desde = d < st.anchor ? d : st.anchor; st.hasta = d < st.anchor ? st.anchor : d;
    st.anchor = ""; st.hover = "";
    pop.classList.add("hidden"); apply();
  });
  pop.addEventListener("mouseover", e => {
    if (!st.anchor) return;
    const day = e.target.closest("[data-d]");
    if (day && day.dataset.d !== st.hover) { st.hover = day.dataset.d; render(); }
  });
  x.addEventListener("click", e => { e.stopPropagation(); st.desde = st.hasta = st.anchor = ""; pop.classList.add("hidden"); apply(); });
  document.addEventListener("click", () => close());
  label();
  return {
    get desde(){ return st.desde; }, get hasta(){ return st.hasta; },
    clear(){ st.desde = st.hasta = st.anchor = ""; label(); },
  };
}
