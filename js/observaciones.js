/* ============================================================
   OBSERVACIONES + ETIQUETAS (Cotizaciones y Armar presupuesto)
   ------------------------------------------------------------
   · Etiqueta = { id, titulo, cuerpo }. Se guardan en Cloudflare KV (/etiquetas), compartidas entre
     módulos y computadoras. Si el conector todavía no tiene /etiquetas, se guardan en este navegador
     y se suben solas cuando el conector se actualiza.
   · Cada presupuesto tiene obs = { texto, etiquetaId, base }:
       texto      lo que va al Excel, PDF y al pedido de YiQi (sin el título de la etiqueta)
       etiquetaId la etiqueta elegida ("" = ninguna)
       base       el cuerpo de la etiqueta cuando se eligió: si texto === base, no se editó a mano y
                  sigue a la etiqueta si después se modifica.
   ============================================================ */
const ETQ_ENDPOINT = `${WORKER_BASE}/etiquetas`;
const ETQ_LOCAL_KEY = "aruki-etiquetas";
const etq = { items: [], version: 0, loaded: false, loading: false, local: false, listeners: new Set() };

function etqById(id){ return etq.items.find(e => e.id === id) || null; }
function etqNotify(){ etq.listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } }); }
function etqLocalRead(){ try { return JSON.parse(localStorage.getItem(ETQ_LOCAL_KEY) || "[]") || []; } catch { return []; } }
function etqLocalWrite(items){ try { localStorage.setItem(ETQ_LOCAL_KEY, JSON.stringify(items)); } catch {} }

async function etqApi(method, body){
  const token = getAuthToken();
  if (!token) throw new SessionExpired("Sesión vencida.");
  const response = await fetch(`${ETQ_ENDPOINT}?_=${Date.now()}`, {
    method,
    headers: { "Accept": "application/json", "Authorization": `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store"
  });
  let payload = {};
  try { payload = await response.json(); } catch {}
  if (response.status === 401) throw new SessionExpired("Sesión vencida.");
  if (!response.ok || payload?.error) {
    const err = new Error(payload?.error || `Error HTTP ${response.status}.`);
    err.status = response.status;
    throw err;
  }
  return payload;
}

async function etqLoad(){
  if (etq.loading) return;
  etq.loading = true;
  try {
    const data = await etqApi("GET");
    etq.items = data.etiquetas || [];
    etq.version = data.version || 0;
    etq.local = false;
    // Las que se habían guardado en este navegador mientras el conector no estaba actualizado: se suben
    const pend = etqLocalRead();
    if (pend.length) {
      const nuevas = pend.filter(p => !etq.items.some(e => e.id === p.id || relKey(e.titulo) === relKey(p.titulo)));
      if (nuevas.length) {
        const saved = await etqApi("PUT", { etiquetas: [...etq.items, ...nuevas], baseVersion: etq.version });
        etq.items = saved.etiquetas || []; etq.version = saved.version || 0;
      }
      try { localStorage.removeItem(ETQ_LOCAL_KEY); } catch {}
    }
  } catch (error) {
    if (error instanceof SessionExpired) { etq.loading = false; return; }
    // Conector viejo (404) u otro problema: se usan las de este navegador
    etq.items = etqLocalRead();
    etq.local = true;
    etq.localMotivo = error.status === 404
      ? "Falta actualizar el conector de Cloudflare: por ahora las etiquetas se guardan solo en esta computadora."
      : `No se pudieron leer las etiquetas de Cloudflare (${error.message}). Por ahora se usan las de esta computadora.`;
  }
  etq.loaded = true;
  etq.loading = false;
  etqNotify();
}
function etqEnsure(){ if (!etq.loaded && !etq.loading) etqLoad(); }

/* Guarda la lista completa. Devuelve true si salió bien. */
async function etqSave(next){
  const now = Date.now();
  next = next.map(e => ({ ...e, actualizado: e.actualizado || now, creado: e.creado || now }));
  if (etq.local) {
    etq.items = next; etqLocalWrite(next); etqNotify();
    return true;
  }
  try {
    const data = await etqApi("PUT", { etiquetas: next, baseVersion: etq.version });
    etq.items = data.etiquetas || []; etq.version = data.version || 0;
    etqNotify();
    return true;
  } catch (error) {
    if (error instanceof SessionExpired) { clearSession(); showLogin("La sesión venció. Volvé a ingresar."); return false; }
    if (error.status === 409) { await etqLoad(); alert(error.message); return false; }
    if (error.status === 404) {             // el conector todavía no tiene /etiquetas: se guardan acá
      etq.local = true; etq.localMotivo = "Falta actualizar el conector de Cloudflare: por ahora las etiquetas se guardan solo en esta computadora.";
      return etqSave(next);
    }
    alert(`No se pudo guardar la etiqueta: ${error.message}`);
    return false;
  }
}

/* ---------- Ventana "Etiquetas" (crear / modificar / borrar) ---------- */
const etqUi = { editingId: null };
function etqEl(id){ return document.getElementById(id); }
function etqRenderModal(){
  const list = etqEl("etqList");
  const items = [...etq.items].sort((a, b) => a.titulo.localeCompare(b.titulo, "es"));
  list.innerHTML = items.length ? items.map(e => `
    <div class="etq-item ${e.id === etqUi.editingId ? "is-editing" : ""}" data-id="${escapeHtml(e.id)}">
      <div class="etq-item-text">
        <strong>${escapeHtml(e.titulo)}</strong>
        <span>${escapeHtml(e.cuerpo || "(sin texto)")}</span>
      </div>
      <div class="row-actions">
        <button class="btn-icon" type="button" data-etq-edit title="Modificar" aria-label="Modificar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button>
        <button class="btn-icon danger" type="button" data-etq-del title="Eliminar" aria-label="Eliminar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg></button>
      </div>
    </div>`).join("")
    : `<div class="empty-state etq-empty">Todavía no hay etiquetas. Creá la primera con el formulario de arriba.</div>`;
  etqEl("etqLocalNote").textContent = etq.local ? etq.localMotivo || "" : "";
  etqEl("etqLocalNote").classList.toggle("hidden", !etq.local);
  etqEl("etqFormTitle").textContent = etqUi.editingId ? "Modificar etiqueta" : "Nueva etiqueta";
  etqEl("etqSaveBtn").textContent = etqUi.editingId ? "Guardar cambios" : "Crear etiqueta";
  etqEl("etqCancelEdit").classList.toggle("hidden", !etqUi.editingId);
}
function etqEditForm(e){
  etqUi.editingId = e ? e.id : null;
  etqEl("etqTitulo").value = e ? e.titulo : "";
  etqEl("etqCuerpo").value = e ? e.cuerpo : "";
  etqEl("etqError").textContent = "";
  etqRenderModal();
  etqEl(e ? "etqCuerpo" : "etqTitulo").focus();
}
function etqOpen(editId){
  etqEnsure();
  etqEl("etqModal").classList.remove("hidden");
  etqEditForm(editId ? etqById(editId) : null);
}
function etqClose(){ etqEl("etqModal").classList.add("hidden"); }
async function etqSubmit(){
  const titulo = etqEl("etqTitulo").value.trim();
  const cuerpo = etqEl("etqCuerpo").value.trim();
  const err = etqEl("etqError");
  if (!titulo) { err.textContent = "Poné un título (es lo que vas a elegir en la lista)."; etqEl("etqTitulo").focus(); return; }
  if (!cuerpo) { err.textContent = "Escribí el texto de la observación."; etqEl("etqCuerpo").focus(); return; }
  if (etq.items.some(e => e.id !== etqUi.editingId && relKey(e.titulo) === relKey(titulo))) { err.textContent = "Ya hay una etiqueta con ese título."; return; }
  const now = Date.now();
  const next = etqUi.editingId
    ? etq.items.map(e => e.id === etqUi.editingId ? { ...e, titulo, cuerpo, actualizado: now } : e)
    : [...etq.items, { id: crypto.randomUUID(), titulo, cuerpo, creado: now, actualizado: now }];
  const btn = etqEl("etqSaveBtn");
  btn.disabled = true;
  const ok = await etqSave(next);
  btn.disabled = false;
  if (ok) etqEditForm(null);
}

/* ---------- Observaciones de un presupuesto (desplegable arriba + caja editable abajo) ----------
   cfg = { sel, tagsBtn, box, text, chip, bottomSel, saveBtn, newBtn, get: () => obs, save: () => void } */
function obsWidget(cfg){
  const $ = id => document.getElementById(id);
  const obs = () => cfg.get();
  const edited = () => { const o = obs(); return !!o.etiquetaId && o.texto !== o.base; };

  function fillSelect(sel){
    const o = obs();
    const items = [...etq.items].sort((a, b) => a.titulo.localeCompare(b.titulo, "es"));
    sel.innerHTML = `<option value="">…</option>` + items.map(e => `<option value="${escapeHtml(e.id)}">${escapeHtml(e.titulo)}</option>`).join("");
    sel.value = o.etiquetaId && etqById(o.etiquetaId) ? o.etiquetaId : "";
  }
  function render(){
    const o = obs();
    // Si la etiqueta se modificó (acá o en el otro módulo) y el texto no se había tocado, se actualiza solo
    const e = o.etiquetaId ? etqById(o.etiquetaId) : null;
    if (e && o.texto === o.base && e.cuerpo !== o.base) { o.texto = e.cuerpo; o.base = e.cuerpo; cfg.save(); }
    if (o.etiquetaId && !e && etq.loaded) { o.etiquetaId = ""; o.base = ""; cfg.save(); }
    fillSelect($(cfg.sel)); fillSelect($(cfg.bottomSel));
    const ta = $(cfg.text);
    if (document.activeElement !== ta && ta.value !== o.texto) ta.value = o.texto;
    const chip = $(cfg.chip);
    chip.textContent = e ? (edited() ? `Etiqueta «${e.titulo}» · modificada acá` : `Etiqueta «${e.titulo}»`) : o.texto ? "Texto propio" : "Sin observaciones";
    chip.className = `badge ${e ? (edited() ? "badge-amber" : "badge-cyan") : o.texto ? "badge-purple" : "badge-muted"}`;
    const save = $(cfg.saveBtn);
    save.classList.toggle("hidden", !(e && edited()));
    save.textContent = e ? `Guardar en la etiqueta «${e.titulo}»` : "";
    $(cfg.newBtn).classList.toggle("hidden", !o.texto.trim() || (e && !edited()));
  }
  function choose(id){
    const o = obs();
    if (id === o.etiquetaId) return;
    const cambiado = o.texto.trim() && (!o.etiquetaId || o.texto !== o.base);
    if (cambiado && !confirm(id ? "Las observaciones escritas a mano se van a reemplazar por la etiqueta. ¿Continuar?" : "¿Borrar las observaciones de este presupuesto?")) { render(); return; }
    const e = id ? etqById(id) : null;
    o.etiquetaId = e ? e.id : "";
    o.texto = e ? e.cuerpo : "";
    o.base = o.texto;
    cfg.save(); render();
  }
  [cfg.sel, cfg.bottomSel].forEach(id => $(id).addEventListener("change", ev => choose(ev.target.value)));
  $(cfg.sel).addEventListener("focus", etqEnsure);
  $(cfg.tagsBtn).addEventListener("click", () => etqOpen(null));
  $(cfg.text).addEventListener("input", ev => { obs().texto = ev.target.value; cfg.save(); render(); });
  $(cfg.saveBtn).addEventListener("click", async () => {
    const o = obs(); const e = etqById(o.etiquetaId);
    if (!e || !confirm(`¿Cambiar la etiqueta «${e.titulo}» con este texto? Se va a usar así en los próximos presupuestos.`)) return;
    const texto = o.texto.trim();
    if (await etqSave(etq.items.map(x => x.id === e.id ? { ...x, cuerpo: texto, actualizado: Date.now() } : x))) { o.texto = texto; o.base = texto; cfg.save(); render(); }
  });
  $(cfg.newBtn).addEventListener("click", async () => {
    const o = obs();
    const titulo = (prompt("Título de la nueva etiqueta (es lo que vas a elegir en la lista):") || "").trim();
    if (!titulo) return;
    if (etq.items.some(e => relKey(e.titulo) === relKey(titulo))) { alert("Ya hay una etiqueta con ese título."); return; }
    const nueva = { id: crypto.randomUUID(), titulo, cuerpo: o.texto.trim(), creado: Date.now(), actualizado: Date.now() };
    if (await etqSave([...etq.items, nueva])) { o.etiquetaId = nueva.id; o.texto = nueva.cuerpo; o.base = nueva.cuerpo; cfg.save(); render(); }
  });
  etq.listeners.add(render);
  return { render };
}
function obsEmpty(){ return { texto: "", etiquetaId: "", base: "" }; }

/* ---------- Eventos de la ventana ---------- */
(function(){
  etqEl("etqSaveBtn").addEventListener("click", etqSubmit);
  etqEl("etqCancelEdit").addEventListener("click", () => etqEditForm(null));
  etqEl("etqClose").addEventListener("click", etqClose);
  etqEl("etqModal").addEventListener("click", e => { if (e.target === e.currentTarget) etqClose(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !etqEl("etqModal").classList.contains("hidden")) etqClose(); });
  etqEl("etqList").addEventListener("click", async e => {
    const item = e.target.closest("[data-id]");
    if (!item) return;
    const et = etqById(item.dataset.id);
    if (e.target.closest("[data-etq-edit]")) etqEditForm(et);
    else if (e.target.closest("[data-etq-del]") && et && confirm(`¿Eliminar la etiqueta «${et.titulo}»? Los presupuestos que ya la tienen conservan el texto.`)) {
      if (etqUi.editingId === et.id) etqEditForm(null);
      await etqSave(etq.items.filter(x => x.id !== et.id));
    }
  });
  etq.listeners.add(() => { if (!etqEl("etqModal").classList.contains("hidden")) etqRenderModal(); });
})();
