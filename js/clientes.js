/* ============================================================
   CLIENTES DE YIQI (entidad CLIENTE, smartie 1834)
   ------------------------------------------------------------
   Se descargan una vez y se guardan en la computadora (se actualizan
   solos cada 4 horas). clientePicker() convierte un campo de texto en
   un buscador de clientes. Vacío = Consumidor Final.
   ============================================================ */
const CLI_MAX_AGE = 4 * 3600000;
const CLI_CONSUMIDOR_FINAL_ID = 8192;   // "Consumidor Final" en YiQi
const clientesStore = {
  list: [], loaded: false, loading: false, savedAt: 0, error: "", listeners: new Set(),

  async ensureLoaded(){
    if (this.loaded || this.loading || !getAuthToken()) return;
    this.loading = true;
    const saved = await cacheGet("clientes");
    if (saved && Array.isArray(saved.list) && saved.list.length) {
      this.list = saved.list.filter(c => !cliOculto(c)); this.savedAt = saved.savedAt || 0; this.loaded = true;
      this.loading = false; this.notify();
      if (Date.now() - this.savedAt >= CLI_MAX_AGE) this.refresh();
      return;
    }
    this.loading = false;
    await this.refresh();
  },

  async refresh(){
    if (this.loading) return;
    this.loading = true; this.error = ""; this.notify();
    const btn = document.getElementById("syncCliBtn");
    syncBtnProgress(btn, 0.02);
    btn.title = "Actualizando clientes… tocá para detener";
    const ctrl = this.abort = new AbortController();
    let stopped = false;
    try {
      const result = await loadAllPages(`${WORKER_BASE}/clientes`, ctrl.signal, snap => syncBtnProgress(btn, snap.done / snap.totalPages));
      if (result.aborted) { stopped = true; return; }   // detenido: se siguen usando los clientes que ya había
      if (result.failed.length && !result.rows.length) throw new Error("No se pudieron descargar los clientes.");
      this.list = cliParse(result.rows, result.columns);
      this.modo = result.modo; this.motivo = result.motivo;
      this.savedAt = Date.now(); this.loaded = true;
      if (!result.failed.length) cacheSet("clientes", { list: this.list, savedAt: this.savedAt });
    } catch (error) {
      if (error instanceof SessionExpired) { clearSession(); showLogin("La sesión venció. Volvé a ingresar."); }
      if (ctrl.signal.aborted) stopped = true;
      else this.error = String(error?.message || error);
    } finally {
      this.loading = false; this.abort = null; this.notify();
      syncBtnProgress(btn, null, !!this.error, !stopped);
      btn.title = stopped ? "Actualización de clientes detenida. Tocá para volver a intentar."
        : this.error ? `No se pudieron actualizar los clientes: ${this.error}`
        : `Traer los clientes actualizados desde YiQi · ${numberFormatter.format(this.list.length)} clientes · Última actualización: ${new Date(this.savedAt).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })}${modoTexto(this.modo, this.motivo)}`;
      if (this.error && this.manual) alert(`No se pudieron actualizar los clientes.\n\n${this.error}`);
      this.manual = false;
    }
  },

  notify(){ this.listeners.forEach(fn => { try { fn(); } catch {} }); },
  reset(){ if (this.abort) this.abort.abort(); this.list = []; this.loaded = false; this.savedAt = 0; this.error = ""; this.notify(); },

  /* Cliente "Consumidor Final" (para cuando el campo queda vacío) */
  /* Siempre el de id 8192 ("Consumidor Final" con mayúsculas; hay otro en minúsculas que no se usa) */
  consumidorFinal(){
    return this.list.find(c => Number(c.id) === CLI_CONSUMIDOR_FINAL_ID)
      || { id: CLI_CONSUMIDOR_FINAL_ID, nombre: "Consumidor Final", razon: "Consumidor Final", cuit: "", iva: "", s: "consumidor final" };
  }
};

/* Clientes que no se muestran (v6.0): "discontinuado"/"descontinuado" o 3 o más asteriscos en el nombre o la razón social.
   Consumidor Final nunca se oculta. */
const cliStars = t => (String(t || "").match(/\*/g) || []).length;
function cliOculto(c){
  if (Number(c.id) === CLI_CONSUMIDOR_FINAL_ID) return false;
  if (/d[ei]s?continuad/i.test(`${c.nombre} ${c.razon}`)) return true;
  return Math.max(cliStars(c.nombre), cliStars(c.razon)) >= 3;
}

function cliParse(rows, columns){
  const cols = Array.isArray(columns) ? columns : [];
  const find = re => (cols.find(c => re.test(String(c.title || "").trim())) || {}).field;
  const fNombre = find(/^nombre$/i), fRazon = find(/raz[oó]n\s*social/i);
  const fCuit = find(/cuit|documento/i), fIva = find(/condici[oó]n\s*iva/i);
  return rows.map(r => {
    const nombre = String(r[fNombre] ?? "").trim(), razon = String(r[fRazon] ?? "").trim();
    return {
      id: r.id ?? r.ID ?? r.CLIE_ID_CLIE ?? null,
      nombre, razon: razon || nombre,
      cuit: String(r[fCuit] ?? "").trim(), iva: String(r[fIva] ?? "").trim()
    };
  }).filter(c => c.id !== null && (c.razon || c.nombre) && !cliOculto(c))
    .map(c => ({ ...c, s: foldText(`${c.razon} ${c.nombre} ${c.cuit} ${c.cuit.replace(/\D/g, "")}`) }));
}

function cliLabel(c){
  if (!c) return "";
  return c.nombre && c.razon && foldText(c.nombre) !== foldText(c.razon) ? `${c.razon} (${c.nombre})` : c.razon;
}

function cliSearch(query, limit = 12){
  const terms = foldText(query).trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const out = [];
  for (const c of clientesStore.list) {
    if (!terms.every(t => c.s.includes(t))) continue;
    const r = foldText(c.razon);
    out.push({ c, score: r.startsWith(terms[0]) ? 0 : 1 });
    if (out.length > 400) break;
  }
  out.sort((a, b) => cliIsCF(b.c) - cliIsCF(a.c) || a.score - b.score || a.c.razon.localeCompare(b.c.razon));
  return out.slice(0, limit).map(x => x.c);
}
const cliIsCF = c => Number(c.id) === CLI_CONSUMIDOR_FINAL_ID ? 1 : 0;

/* Lista completa (campo vacío): Consumidor Final primero y después todos por orden alfabético */
let cliSortedCache = { list: null, value: [] };
function cliAll(limit = 300){
  if (cliSortedCache.list !== clientesStore.list) {
    const cf = clientesStore.consumidorFinal();
    const rest = clientesStore.list.filter(c => !cliIsCF(c)).sort((a, b) => a.razon.localeCompare(b.razon));
    cliSortedCache = { list: clientesStore.list, value: [cf, ...rest] };
  }
  return cliSortedCache.value.slice(0, limit);
}

/* Convierte un input en buscador de clientes.
   onChange(cliente|null) se llama al elegir o borrar. */
function clientePicker(inputId, onChange){
  const input = document.getElementById(inputId);
  const wrap = document.createElement("div");
  wrap.className = "rel-picker cli-picker";
  input.parentNode.insertBefore(wrap, input);
  wrap.appendChild(input);
  const box = document.createElement("div");
  box.className = "rel-results hidden";
  wrap.appendChild(box);
  const info = document.createElement("div");
  info.className = "cli-info";
  wrap.parentNode.appendChild(info);
  input.placeholder = "Buscá por nombre, razón social o CUIT · vacío = Consumidor Final";

  const p = { selected: null, active: 0 };
  const renderInfo = () => {
    const c = p.selected;
    if (c) info.innerHTML = `<span class="badge badge-green">Cliente de YiQi</span>${c.cuit ? ` CUIT/Doc: ${escapeHtml(c.cuit)}` : ""}${c.iva ? ` · ${escapeHtml(c.iva)}` : ""}`;
    else if (!input.value.trim()) info.innerHTML = clientesStore.loading && !clientesStore.list.length
      ? "Cargando clientes de YiQi…" : `<span class="source-note">Se usa <strong>Consumidor Final</strong>.</span>`;
    else info.innerHTML = `<span class="badge badge-amber">No elegido de la lista</span> <span class="source-note">Elegí un cliente de la lista para poder enviarlo a YiQi.</span>`;
  };
  const show = () => {
    const q = p.selected ? "" : input.value.trim();     // con un cliente elegido se muestra la lista completa
    const res = q ? cliSearch(q, 50) : (clientesStore.list.length ? cliAll() : []);
    if (!res.length) {
      box.innerHTML = q && clientesStore.list.length ? `<div class="rel-result-empty">No hay clientes con ese texto.</div>`
        : (q && clientesStore.loading ? `<div class="rel-result-empty">Cargando clientes de YiQi…</div>` : "");
      box.classList.toggle("hidden", !box.innerHTML);
      return;
    }
    p.active = Math.min(p.active, res.length - 1);
    box.innerHTML = res.map((c, i) => `<div class="rel-result ${i === p.active ? "is-active" : ""} ${p.selected && p.selected.id === c.id ? "is-current" : ""}" data-i="${i}">
      <span>${escapeHtml(cliLabel(c))}</span><span class="marca">${escapeHtml(c.cuit)}</span></div>`).join("")
      + (!q && clientesStore.list.length > res.length
        ? `<div class="rel-result-empty">Se muestran ${res.length} de ${numberFormatter.format(clientesStore.list.length)} clientes. Escribí para buscar el resto.</div>` : "");
    box.classList.remove("hidden");
    box.querySelectorAll("[data-i]").forEach(el => el.addEventListener("mousedown", e => {
      e.preventDefault(); pick(res[Number(el.dataset.i)]);
    }));
    p.results = res;
  };
  const pick = c => {
    p.selected = c || null;
    input.value = c ? cliLabel(c) : input.value;
    box.classList.add("hidden");
    renderInfo();
    onChange && onChange(p.selected);
  };
  input.addEventListener("input", () => {
    if (p.selected) { p.selected = null; onChange && onChange(null); }
    p.active = 0; show(); renderInfo();
  });
  input.addEventListener("focus", () => { clientesStore.ensureLoaded(); p.active = 0; input.select(); show(); });
  input.addEventListener("click", () => { if (box.classList.contains("hidden")) show(); });
  input.addEventListener("blur", () => setTimeout(() => {
    box.classList.add("hidden");
    // Campo vacío → se elige solo "Consumidor Final" (id 8192)
    if (!p.selected && !input.value.trim()) pick(clientesStore.consumidorFinal());
  }, 150));
  input.addEventListener("keydown", e => {
    const n = box.classList.contains("hidden") ? 0 : (p.results || []).length;
    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && n) {
      e.preventDefault(); p.active = (p.active + (e.key === "ArrowDown" ? 1 : -1) + n) % n; show();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (n && p.results[p.active]) pick(p.results[p.active]);
    } else if (e.key === "Escape") box.classList.add("hidden");
  });
  clientesStore.listeners.add(() => { renderInfo(); if (document.activeElement === input && !p.selected) show(); });

  const api = {
    get: () => p.selected,
    text: () => input.value.trim(),
    set(c, text){
      p.selected = c && c.id !== undefined ? c : (text ? null : clientesStore.consumidorFinal());   // vacío = Consumidor Final
      input.value = p.selected ? cliLabel(p.selected) : (text || "");
      renderInfo();
    },
    clear(){ api.set(null, ""); },
    /* Para el PDF/Excel: lo que se muestra como cliente */
    display(){
      const c = p.selected;
      if (c) return { nombre: cliLabel(c), cuit: c.cuit, iva: c.iva };
      const t = input.value.trim();
      if (t) return { nombre: t, cuit: "", iva: "" };
      const cf = clientesStore.consumidorFinal();
      return { nombre: "Consumidor Final", cuit: cf ? cf.cuit : "", iva: cf ? cf.iva : "" };
    },
    /* Para enviar a YiQi: id del cliente elegido o de Consumidor Final; error si escribió algo sin elegir */
    forYiqi(){
      if (p.selected) return { id: p.selected.id, nombre: cliLabel(p.selected) };
      if (input.value.trim()) return { error: "Elegí el cliente de la lista (o dejá el campo vacío para Consumidor Final)." };
      return { id: CLI_CONSUMIDOR_FINAL_ID, nombre: "Consumidor Final" };
    }
  };
  api.set(null, "");
  return api;
}

document.getElementById("syncCliBtn").addEventListener("click", () => {
  if (!getAuthToken()) return;
  if (clientesStore.loading && clientesStore.abort) { clientesStore.abort.abort(); return; }   // detener
  clientesStore.manual = true;
  clientesStore.refresh();
});
