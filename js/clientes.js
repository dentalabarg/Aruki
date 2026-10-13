/* ============================================================
   CLIENTES DE YIQI (entidad CLIENTE, smartie 1834)
   ------------------------------------------------------------
   Se descargan una vez y se guardan en la computadora (se actualizan
   solos cada 4 horas). clientePicker() convierte un campo de texto en
   un buscador de clientes. Vacío = Consumidor Final.
   ============================================================ */
const CLI_MAX_AGE = 4 * 3600000;
const clientesStore = {
  list: [], loaded: false, loading: false, savedAt: 0, error: "", listeners: new Set(),

  async ensureLoaded(){
    if (this.loaded || this.loading || !getAuthToken()) return;
    this.loading = true;
    const saved = await cacheGet("clientes");
    if (saved && Array.isArray(saved.list) && saved.list.length) {
      this.list = saved.list; this.savedAt = saved.savedAt || 0; this.loaded = true;
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
    btn.disabled = true;
    try {
      const ctrl = new AbortController();
      const result = await loadAllPages(`${WORKER_BASE}/clientes`, ctrl.signal, snap => syncBtnProgress(btn, snap.done / snap.totalPages));
      if (result.failed.length && !result.rows.length) throw new Error("No se pudieron descargar los clientes.");
      this.list = cliParse(result.rows, result.columns);
      this.savedAt = Date.now(); this.loaded = true;
      if (!result.failed.length) cacheSet("clientes", { list: this.list, savedAt: this.savedAt });
    } catch (error) {
      if (error instanceof SessionExpired) { clearSession(); showLogin("La sesión venció. Volvé a ingresar."); }
      this.error = String(error?.message || error);
    } finally {
      this.loading = false; this.notify();
      btn.disabled = false;
      syncBtnProgress(btn, null, !!this.error);
      btn.title = this.error ? `No se pudieron actualizar los clientes: ${this.error}`
        : `Traer los clientes actualizados desde YiQi · ${numberFormatter.format(this.list.length)} clientes · Última actualización: ${new Date(this.savedAt).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })}`;
      if (this.error && this.manual) alert(`No se pudieron actualizar los clientes.\n\n${this.error}`);
      this.manual = false;
    }
  },

  notify(){ this.listeners.forEach(fn => { try { fn(); } catch {} }); },
  reset(){ this.list = []; this.loaded = false; this.savedAt = 0; this.error = ""; this.notify(); },

  /* Cliente "Consumidor Final" (para cuando el campo queda vacío) */
  consumidorFinal(){
    return this.list.find(c => /^consumidor\s+final$/i.test(c.razon.trim()))
      || this.list.find(c => /^consumidor\s+final$/i.test(c.nombre.trim()))
      || this.list.find(c => /consumidor\s+final/i.test(`${c.razon} ${c.nombre}`)) || null;
  }
};

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
  }).filter(c => c.id !== null && (c.razon || c.nombre))
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
  out.sort((a, b) => a.score - b.score || a.c.razon.localeCompare(b.c.razon));
  return out.slice(0, limit).map(x => x.c);
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
    const q = input.value.trim();
    const res = q ? cliSearch(q) : [];
    if (!res.length) {
      box.innerHTML = q && clientesStore.list.length ? `<div class="rel-result-empty">No hay clientes con ese texto.</div>`
        : (q && clientesStore.loading ? `<div class="rel-result-empty">Cargando clientes de YiQi…</div>` : "");
      box.classList.toggle("hidden", !box.innerHTML);
      return;
    }
    p.active = Math.min(p.active, res.length - 1);
    box.innerHTML = res.map((c, i) => `<div class="rel-result ${i === p.active ? "is-active" : ""}" data-i="${i}">
      <span>${escapeHtml(cliLabel(c))}</span><span class="marca">${escapeHtml(c.cuit)}</span></div>`).join("");
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
  input.addEventListener("focus", () => { clientesStore.ensureLoaded(); if (!p.selected) show(); });
  input.addEventListener("blur", () => setTimeout(() => box.classList.add("hidden"), 150));
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
      p.selected = c && c.id !== undefined ? c : null;
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
      const cf = clientesStore.consumidorFinal();
      return cf ? { id: cf.id, nombre: "Consumidor Final" } : { id: null, nombre: "Consumidor Final" };
    }
  };
  renderInfo();
  return api;
}

document.getElementById("syncCliBtn").addEventListener("click", () => {
  if (!getAuthToken()) return;
  clientesStore.manual = true;
  clientesStore.refresh();
});
