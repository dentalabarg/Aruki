/* ============================================================
   PRESUPUESTOS › RELACIONES
   ------------------------------------------------------------
   "Si el cliente escribe X → el artículo es SKU A (o A y B)".
   Se guardan en Cloudflare KV a través del Worker (/relaciones).
   Se guarda siempre la lista completa con control de versión
   (baseVersion) para no pisar cambios hechos desde otra computadora.
   ============================================================ */
const RELACIONES_ENDPOINT = `${WORKER_BASE}/relaciones`;

const rel = {
  items: [], version: 0, loaded: false, loading: false, saving: false,
  editingId: null, formSkus: [], search: "", activeResult: 0
};

/* Texto normalizado para comparar (sin tildes, mayúsculas ni espacios de más) */
function relKey(texto){
  return foldText(texto).replace(/[^a-z0-9ñ.,/%+\-]+/g, " ").replace(/\s+/g, " ").trim();
}

/* Índice para Cotizaciones: texto normalizado → relación */
function getRelacionesIndex(){
  const map = new Map();
  rel.items.forEach(r => map.set(relKey(r.texto), r));
  return map;
}

function relEl(id){ return document.getElementById(id); }

function relSetState(state, title, text){
  const banner = relEl("relBanner");
  banner.dataset.state = state;
  const labels = { idle: "Relaciones", loading: "Conectando", connected: "Guardado en Cloudflare", error: "Atención" };
  relEl("relKicker").textContent = labels[state] || "Estado";
  relEl("relTitle").textContent = title;
  relEl("relText").textContent = text;
  relEl("relRetryBtn").classList.toggle("hidden", state !== "error");
}

async function relApi(method, body){
  const token = getAuthToken();
  if (!token) throw new SessionExpired("Sesión vencida.");
  const response = await fetch(`${RELACIONES_ENDPOINT}?_=${Date.now()}`, {
    method,
    headers: {
      "Accept": "application/json",
      "Authorization": `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store"
  });
  let payload;
  try { payload = await response.json(); }
  catch { throw new Error(`El conector respondió con un formato inválido (HTTP ${response.status}).`); }
  if (response.status === 401) throw new SessionExpired("Sesión vencida.");
  if (!response.ok || payload?.error) {
    const err = new Error(payload?.error || `Error HTTP ${response.status}.`);
    err.status = response.status;
    throw err;
  }
  return payload;
}

function relHandleError(error, title){
  if (error instanceof SessionExpired) {
    clearSession();
    showLogin("La sesión venció. Volvé a ingresar.");
    return;
  }
  relSetState("error", title, String(error?.message || error));
}

async function relLoad(){
  if (rel.loading || !getAuthToken()) return;
  rel.loading = true;
  relSetState("loading", "Cargando relaciones", "Consultando la base de datos de Cloudflare…");
  try {
    const data = await relApi("GET");
    rel.items = Array.isArray(data.relaciones) ? data.relaciones : [];
    rel.version = data.version || 0;
    rel.loaded = true;
    relSetState("connected", `${numberFormatter.format(rel.items.length)} relaciones guardadas`,
      "Se usan en Cotizaciones antes que la búsqueda automática.");
  } catch (error) {
    relHandleError(error, "No se pudieron cargar las relaciones");
  } finally {
    rel.loading = false;
    relRender();
  }
}

async function relSave(nextItems, okMessage){
  if (rel.saving) return false;
  rel.saving = true;
  relSetState("loading", "Guardando…", "Enviando los cambios a Cloudflare.");
  try {
    const data = await relApi("PUT", { relaciones: nextItems, baseVersion: rel.version });
    rel.items = data.relaciones || [];
    rel.version = data.version || 0;
    relSetState("connected", okMessage || "Cambios guardados",
      `${numberFormatter.format(rel.items.length)} relaciones guardadas.`);
    return true;
  } catch (error) {
    if (error.status === 409) {
      rel.saving = false;
      await relLoad();
      relSetState("error", "No se guardó: hubo cambios desde otra computadora", String(error.message));
      return false;
    }
    relHandleError(error, "No se pudieron guardar los cambios");
    return false;
  } finally {
    rel.saving = false;
    relRender();
  }
}

/* ---------- Búsqueda de artículos para elegir SKU ---------- */
function relCatalogInfo(){
  const cat = getArticulosCatalog();
  if (!cat.list.length) {
    return { cat, hint: articulosModule.loading
      ? `Cargando artículos desde YiQi… (${numberFormatter.format(articulosModule.rows.length)} de ${numberFormatter.format(articulosModule.total || 0)})`
      : "Los artículos todavía no están cargados." };
  }
  return { cat, hint: "" };
}

function relSearchArticulos(query, limit = 12){
  const { cat } = relCatalogInfo();
  const q = foldText(query).trim();
  if (!q) return [];
  const terms = q.split(/\s+/);
  const out = [];
  for (const a of cat.list) {
    const skuF = foldText(a.sku);
    if (a.__rs === undefined) a.__rs = foldText(`${a.sku} ${a.nombre} ${a.marca || ""}`);
    if (!terms.every(t => a.__rs.includes(t))) continue;
    const score = skuF === q ? 0 : skuF.startsWith(q) ? 1 : 2;
    out.push({ a, score });
  }
  out.sort((x, y) => x.score - y.score || x.a.nombre.localeCompare(y.a.nombre));
  return out.slice(0, limit).map(x => x.a);
}

function relRenderResults(){
  const box = relEl("relSkuResults");
  const query = relEl("relSkuSearch").value;
  if (!query.trim()) { box.classList.add("hidden"); box.innerHTML = ""; return; }
  const { hint } = relCatalogInfo();
  const results = relSearchArticulos(query);
  if (!results.length) {
    box.innerHTML = `<div class="rel-result-empty">${escapeHtml(hint || "No se encontraron artículos con esa búsqueda.")}</div>`;
  } else {
    rel.activeResult = Math.min(rel.activeResult, results.length - 1);
    box.innerHTML = results.map((a, i) => `
      <div class="rel-result ${i === rel.activeResult ? "is-active" : ""}" data-sku="${escapeHtml(a.sku)}">
        <span class="sku">${escapeHtml(a.sku)}</span><span>${escapeHtml(a.nombre)}</span>
      </div>`).join("");
    box.querySelectorAll("[data-sku]").forEach(el => {
      el.addEventListener("mousedown", e => { e.preventDefault(); relAddSku(el.dataset.sku); });
    });
  }
  box.classList.remove("hidden");
}

function relAddSku(sku){
  if (!sku) return;
  if (!rel.formSkus.includes(sku)) rel.formSkus.push(sku);
  relEl("relSkuSearch").value = "";
  rel.activeResult = 0;
  relRenderResults();
  relRenderChips();
  relEl("relSkuSearch").focus();
}

function relChipHtml(sku, removable){
  const item = getArticulosCatalog().bySku.get(String(sku));
  const missing = !item && getArticulosCatalog().list.length > 0;
  const name = item ? item.nombre : (missing ? "No está en Artículos" : "");
  return `<span class="chip ${missing ? "is-missing" : ""}" title="${escapeHtml(name)}">
    <span class="sku">${escapeHtml(sku)}</span>${name ? `<span class="chip-name">${escapeHtml(name)}</span>` : ""}
    ${removable ? `<button type="button" data-remove-sku="${escapeHtml(sku)}" aria-label="Quitar ${escapeHtml(sku)}">×</button>` : ""}
  </span>`;
}

function relRenderChips(){
  const wrap = relEl("relChips");
  wrap.innerHTML = rel.formSkus.length
    ? rel.formSkus.map(s => relChipHtml(s, true)).join("")
    : `<span class="source-note">Todavía no elegiste ningún artículo.</span>`;
  wrap.querySelectorAll("[data-remove-sku]").forEach(btn => {
    btn.addEventListener("click", () => {
      rel.formSkus = rel.formSkus.filter(s => s !== btn.dataset.removeSku);
      relRenderChips();
    });
  });
}

/* ---------- Formulario alta / edición ---------- */
function relOpenForm(item){
  rel.editingId = item ? item.id : null;
  rel.formSkus = item ? [...item.skus] : [];
  relEl("relFormTitle").textContent = item ? "Editar relación" : "Nueva relación";
  relEl("relTexto").value = item ? item.texto : "";
  relEl("relNota").value = item ? (item.nota || "") : "";
  relEl("relSkuSearch").value = "";
  relEl("relFormError").textContent = "";
  relEl("relForm").classList.remove("hidden");
  relRenderChips();
  relRenderResults();
  articulosModule.ensureLoaded();
  relEl("relTexto").focus();
  relEl("relForm").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function relCloseForm(){
  rel.editingId = null;
  rel.formSkus = [];
  relEl("relForm").classList.add("hidden");
}

async function relSubmitForm(){
  const texto = relEl("relTexto").value.trim();
  const nota = relEl("relNota").value.trim();
  const error = relEl("relFormError");
  if (!texto) { error.textContent = "Escribí cómo lo pide el cliente."; return; }
  if (!rel.formSkus.length) { error.textContent = "Elegí al menos un artículo."; return; }
  const key = relKey(texto);
  const dup = rel.items.find(r => relKey(r.texto) === key && r.id !== rel.editingId);
  if (dup) { error.textContent = `Ya existe una relación para "${dup.texto}". Editá esa en lugar de crear otra.`; return; }

  const now = Date.now();
  const next = rel.editingId
    ? rel.items.map(r => r.id === rel.editingId ? { ...r, texto, nota, skus: [...rel.formSkus], actualizado: now } : r)
    : [{ id: crypto.randomUUID(), texto, nota, skus: [...rel.formSkus], creado: now, actualizado: now }, ...rel.items];
  const ok = await relSave(next, rel.editingId ? "Relación actualizada" : "Relación creada");
  if (ok) relCloseForm();
}

async function relDelete(id){
  const item = rel.items.find(r => r.id === id);
  if (!item) return;
  if (!confirm(`¿Eliminar la relación "${item.texto}"?`)) return;
  await relSave(rel.items.filter(r => r.id !== id), "Relación eliminada");
}

/* ---------- Respaldo ---------- */
function relExport(){
  const today = new Date().toISOString().slice(0, 10);
  const data = { app: "aruki", tipo: "relaciones", exportado: new Date().toISOString(), relaciones: rel.items };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `aruki-relaciones-${today}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function relImport(file){
  let parsed;
  try { parsed = JSON.parse(await file.text()); }
  catch { relSetState("error", "No se pudo leer el archivo", "Elegí un respaldo descargado desde Aruki (.json)."); return; }
  const incoming = (Array.isArray(parsed) ? parsed : parsed?.relaciones) || [];
  const valid = incoming.filter(r => r && String(r.texto || "").trim() && Array.isArray(r.skus) && r.skus.length);
  if (!valid.length) { relSetState("error", "El archivo no tiene relaciones", "Revisá que sea un respaldo de Aruki."); return; }
  if (!confirm(`Se van a sumar ${valid.length} relaciones del archivo a las ${rel.items.length} actuales. Las que tengan el mismo texto se actualizan. ¿Continuar?`)) return;

  const next = [...rel.items];
  const index = new Map(next.map((r, i) => [relKey(r.texto), i]));
  let added = 0, updated = 0;
  const now = Date.now();
  valid.forEach(r => {
    const key = relKey(r.texto);
    const clean = { texto: String(r.texto).trim(), skus: r.skus.map(String), nota: String(r.nota || "") };
    if (index.has(key)) { const i = index.get(key); next[i] = { ...next[i], ...clean, actualizado: now }; updated++; }
    else { next.push({ id: crypto.randomUUID(), ...clean, creado: now, actualizado: now }); index.set(key, next.length - 1); added++; }
  });
  await relSave(next, `Respaldo importado: ${added} nuevas, ${updated} actualizadas`);
}

/* ---------- Tabla ---------- */
function relRender(){
  const q = foldText(rel.search).split(/\s+/).filter(Boolean);
  const cat = getArticulosCatalog();
  const rows = rel.items.filter(r => {
    if (!q.length) return true;
    const names = r.skus.map(s => cat.bySku.get(String(s))?.nombre || "").join(" ");
    const text = foldText(`${r.texto} ${r.skus.join(" ")} ${names} ${r.nota || ""}`);
    return q.every(t => text.includes(t));
  });

  relEl("relCount").textContent = numberFormatter.format(rows.length);
  relEl("relTotal").textContent = numberFormatter.format(rel.items.length);
  const body = relEl("relBody");
  const empty = relEl("relEmpty");
  if (!rows.length) {
    body.innerHTML = "";
    empty.textContent = rel.loading ? "Cargando relaciones…"
      : rel.items.length ? "No hay relaciones que coincidan con la búsqueda."
      : "Todavía no hay relaciones. Tocá \"Nueva relación\" para crear la primera.";
    empty.classList.remove("hidden");
  } else {
    empty.classList.add("hidden");
    body.innerHTML = rows.map(r => `
      <tr>
        <td class="name"><strong>${escapeHtml(r.texto)}</strong></td>
        <td><div class="chips">${r.skus.map(s => relChipHtml(s, false)).join("")}</div></td>
        <td class="muted-cell">${escapeHtml(r.nota || "")}</td>
        <td class="muted-cell num">${r.actualizado ? new Date(r.actualizado).toLocaleDateString("es-AR") : "—"}</td>
        <td class="num">
          <div class="row-actions">
            <button class="btn-icon" type="button" data-edit="${escapeHtml(r.id)}" title="Editar" aria-label="Editar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
            </button>
            <button class="btn-icon danger" type="button" data-delete="${escapeHtml(r.id)}" title="Eliminar" aria-label="Eliminar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
            </button>
          </div>
        </td>
      </tr>`).join("");
    body.querySelectorAll("[data-edit]").forEach(b => b.addEventListener("click", () => {
      relOpenForm(rel.items.find(r => r.id === b.dataset.edit));
    }));
    body.querySelectorAll("[data-delete]").forEach(b => b.addEventListener("click", () => relDelete(b.dataset.delete)));
  }
  const busy = rel.loading || rel.saving;
  ["relNewBtn", "relImportBtn", "relSaveBtn"].forEach(id => { relEl(id).disabled = busy; });
  relEl("relExportBtn").disabled = busy || !rel.items.length;
}

const relacionesModule = {
  ensureLoaded(){
    articulosModule.ensureLoaded();
    if (!rel.loaded) relLoad();
    else relRender();
  },
  reset(){
    rel.items = []; rel.version = 0; rel.loaded = false; rel.loading = false; rel.saving = false; rel.search = "";
    relEl("relSearch").value = "";
    relCloseForm();
    relSetState("idle", "Relaciones manuales", "Se cargan al abrir este módulo.");
    relRender();
  }
};

/* ---------- Eventos ---------- */
relEl("relNewBtn").addEventListener("click", () => relOpenForm(null));
relEl("relCancelBtn").addEventListener("click", relCloseForm);
relEl("relSaveBtn").addEventListener("click", relSubmitForm);
relEl("relRetryBtn").addEventListener("click", relLoad);
relEl("relExportBtn").addEventListener("click", relExport);
relEl("relImportBtn").addEventListener("click", () => relEl("relImportFile").click());
relEl("relImportFile").addEventListener("change", function(){
  if (this.files[0]) relImport(this.files[0]);
  this.value = "";
});
let relSearchTimer;
relEl("relSearch").addEventListener("input", function(){
  clearTimeout(relSearchTimer);
  relSearchTimer = setTimeout(() => { rel.search = this.value; relRender(); }, 150);
});
relEl("relSkuSearch").addEventListener("input", () => { rel.activeResult = 0; relRenderResults(); });
relEl("relSkuSearch").addEventListener("blur", () => relEl("relSkuResults").classList.add("hidden"));
relEl("relSkuSearch").addEventListener("focus", relRenderResults);
relEl("relSkuSearch").addEventListener("keydown", e => {
  const items = relEl("relSkuResults").querySelectorAll("[data-sku]");
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    if (!items.length) return;
    rel.activeResult = (rel.activeResult + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    relRenderResults();
  } else if (e.key === "Enter") {
    e.preventDefault();
    if (items[rel.activeResult]) relAddSku(items[rel.activeResult].dataset.sku);
  } else if (e.key === "Escape") {
    relEl("relSkuResults").classList.add("hidden");
  }
});
relEl("relTexto").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); relEl("relSkuSearch").focus(); } });
document.addEventListener("aruki:loaded", e => {
  if (e.detail?.endpoint !== `${WORKER_BASE}/articulos`) return;
  relRender();
  if (!relEl("relForm").classList.contains("hidden")) { relRenderChips(); relRenderResults(); }
});
