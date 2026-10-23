/* ============================================================
   MÓDULO ARTÍCULOS — CONSULTA DE STOCK (smartie 2377)
   ============================================================ */
const PRICE_TITLE = /lista|precio|costo|importe|\$/i;
const RAW_TITLE = /identificador|^id$|sku|c[oó]digo/i;
const QTY_TITLE = /dep[oó]sito|stock|cantidad/i;

function artColumnKind(col){
  const title = String(col.title || "");
  if (RAW_TITLE.test(title)) return "raw";
  if (PRICE_TITLE.test(title)) return "money";
  return "auto";
}

function artFormatCell(value, col){
  const kind = artColumnKind(col);
  if (value === null || value === undefined || value === "") return { text: "", num: kind === "money", zero: false };
  if (kind === "raw") return { text: String(value), num: typeof value === "number", zero: false };
  if (kind === "money") {
    const n = Number(value);
    return Number.isFinite(n)
      ? { text: priceFormatter.format(n).replace(/^\$\s?/, "$ "), num: true, zero: n === 0 }
      : { text: String(value), num: false, zero: false };
  }
  if (typeof value === "number") return { text: decimalFormatter.format(value), num: true, zero: value === 0 };
  return { text: String(value), num: false, zero: false };
}

function artResolveColumns(columns, rows){
  let cols = Array.isArray(columns) ? columns.filter(c => c && c.field) : [];
  cols.sort((a, b) => (Number(a.OrdenColumna) || 0) - (Number(b.OrdenColumna) || 0));
  if (cols.length) return cols;
  const first = rows[0] || {};
  return Object.keys(first)
    .filter(k => !["id", "ckeck", "check", "__s"].includes(k))
    .map(k => ({ field: k, title: k }));
}

/* Columnas que no se muestran en la tabla */
const ART_HIDDEN_TITLE = /^identificador$/i;
function artVisibleColumns(columns, rows){
  return artResolveColumns(columns, rows).filter(c => !ART_HIDDEN_TITLE.test(String(c.title || "").trim()));
}

/* Artículos que no se muestran ni se ofrecen para elegir:
   discontinuados, de Mercado Libre, "para fraccionar", "rep wm" y los que tienen todos los precios en cero o vacíos */
const ART_EXCLUDE = /discontinuad|mercado\s*libre|mercadolibre|para\s+fraccionar|\brep\s*wm\b/i;
let artExclCache = { columns: null, info: null, map: new WeakMap() };
function artExclInfo(){
  const columns = articulosModule.columns;
  if (artExclCache.columns === columns && artExclCache.info) return artExclCache.info;
  const cols = artResolveColumns(columns, articulosModule.rows);
  const info = {
    textCols: cols.filter(c => /sku|c[oó]digo|nombre|descripci/i.test(c.title || "")),
    priceCols: cols.filter(c => artColumnKind(c) === "money")
  };
  artExclCache = { columns, info, map: new WeakMap() };
  return info;
}
function artRowExcluded(row){
  const { textCols, priceCols } = artExclInfo();
  const memo = artExclCache.map;
  if (memo.has(row)) return memo.get(row);
  const text = textCols.map(c => row[c.field] ?? "").join(" ");
  const sinPrecio = priceCols.length > 0 && priceCols.every(c => !(Number(row[c.field]) > 0));
  const ex = ART_EXCLUDE.test(text) || sinPrecio;
  memo.set(row, ex);
  return ex;
}

/* Ancho de columnas a mano (se guarda por columna en esta computadora) */
const ART_COLW_KEY = "aruki-art-colw";
function artLoadWidths(){
  try { const w = JSON.parse(localStorage.getItem(ART_COLW_KEY) || "null"); return w && typeof w === "object" ? w : null; }
  catch { return null; }
}
function artApplyWidths(table, ths, cols, w){
  const has = !!w && cols.some(c => w[c.field]);
  table.classList.toggle("is-resized", has);
  let total = has ? 112 : 0;                      // + columna de selección y cantidad
  ths.forEach((th, i) => {
    const px = has ? (w[cols[i].field] || 120) : 0;
    th.style.width = has ? `${px}px` : "";
    total += px;
  });
  table.style.width = has ? `${total}px` : "";
}
function artInitResize(cols){
  const head = document.getElementById("artHead");
  const table = head.closest("table");
  const ths = [...head.querySelectorAll("th[data-field]")];
  ths.forEach((th, i) => {
    const handle = document.createElement("span");
    handle.className = "col-resizer";
    handle.title = "Arrastrá para cambiar el ancho · doble clic: anchos originales";
    th.appendChild(handle);
    handle.addEventListener("pointerdown", e => {
      e.preventDefault(); e.stopPropagation();
      let w = artLoadWidths();
      if (!w || !cols.every(c => w[c.field])) {        // primera vez: se parte de los anchos que se ven
        w = { ...(w || {}) };
        ths.forEach((t, j) => { if (!w[cols[j].field]) w[cols[j].field] = Math.round(t.getBoundingClientRect().width); });
      }
      const field = cols[i].field, startX = e.clientX, startW = w[field];
      handle.classList.add("active");
      handle.setPointerCapture(e.pointerId);
      const move = ev => { w[field] = Math.max(50, Math.round(startW + ev.clientX - startX)); artApplyWidths(table, ths, cols, w); };
      const up = () => {
        handle.classList.remove("active");
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", up);
        try { localStorage.setItem(ART_COLW_KEY, JSON.stringify(w)); } catch {}
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", up);
    });
    handle.addEventListener("dblclick", e => {
      e.stopPropagation();
      try { localStorage.removeItem(ART_COLW_KEY); } catch {}
      artApplyWidths(table, ths, cols, null);
    });
  });
  artApplyWidths(table, ths, cols, artLoadWidths());
}

const articulosModule = createDataModule({
  endpoint: `${WORKER_BASE}/articulos`,
  viewSize: 100,
  cache: { key: "articulos", maxAgeHours: 4 },
  syncTitle: "Traer los artículos actualizados desde YiQi (se hace solo cada 4 horas)",   // guardado en la computadora, se actualiza solo cada 4 h
  loadingTitle: "Cargando todos los artículos desde YiQi",
  idleText: "Aruki carga todos los artículos al abrir este módulo.",
  emptyText: "Todavía no hay artículos cargados.",
  ids: {
    banner: "artBanner", kicker: "artKicker", title: "artTitle", text: "artText",
    progress: "artProgress", progressFill: "artProgressFill",
    stop: "artStopBtn", retry: "artRetryBtn", refresh: "artRefreshBtn",
    search: "artSearch", empty: "artEmpty",
    currentPage: "artCurrentPage", totalPages: "artTotalPages", totalRecords: "artTotalRecords",
    note: "artNote", pageButtons: "artPageButtons", first: "artFirstBtn", last: "artLastBtn"
  },
  filter(row){ return !artRowExcluded(row); },
  sortRows(rows, m){
    const skuCol = artResolveColumns(m.columns, rows).find(c => /sku|c[oó]digo/i.test(c.title || ""));
    return skuCol ? [...rows].sort((a, b) => skuCompare(a[skuCol.field], b[skuCol.field])) : rows;
  },
  searchText(row, m){
    const cols = artVisibleColumns(m.columns, m.rows);
    return cols.map(c => row[c.field]).join(" ");
  },
  renderRows(pageRows, filtered, m){
    const cols = artVisibleColumns(m.columns, m.rows);
    const headKey = cols.map(c => c.field).join("|");
    const head = document.getElementById("artHead");
    if (head.dataset.key !== headKey) {          // el encabezado se arma solo cuando cambian las columnas
      head.dataset.key = headKey;
      head.innerHTML = `<th class="art-check"><input type="checkbox" id="artCheckAll" title="Seleccionar todos los de esta página" aria-label="Seleccionar todos los de esta página"></th>` + cols.map(c => {
        const num = artColumnKind(c) === "money" || QTY_TITLE.test(c.title || "");
        return `<th class="${num ? "num" : ""}" data-field="${escapeHtml(c.field)}">${escapeHtml(c.title || c.field)}</th>`;
      }).join("");
      if (cols.length) artInitResize(cols);
    }
    const skuCol = cols.find(c => /sku|c[oó]digo/i.test(c.title || ""));
    artPageSkus = [];
    document.getElementById("artBody").innerHTML = pageRows.map(r => {
      const sku = skuCol ? String(r[skuCol.field] ?? "").trim() : "";
      if (sku) artPageSkus.push(sku);
      const sel = sku && artSel.has(sku);
      return `<tr data-sku="${escapeHtml(sku)}" class="${sel ? "is-selected" : ""}"><td class="art-check">${sku
        ? `<div class="art-pick"><input type="checkbox" ${sel ? "checked" : ""} aria-label="Seleccionar ${escapeHtml(sku)}"><input class="art-qty" type="number" min="1" step="1" value="${escapeHtml(sel ? artSel.get(sku) : 1)}" title="Cantidad para Armar presupuesto" aria-label="Cantidad de ${escapeHtml(sku)}"></div>` : ""}</td>${cols.map(c => {
        const cell = artFormatCell(r[c.field], c);
        const isName = /nombre|descripci/i.test(c.title || "");
        const cls = [cell.num ? "num" : "", cell.zero ? "zero" : "", isName ? "name" : ""].filter(Boolean).join(" ");
        // Nombre: botón para copiarlo (siempre ocupa su lugar, solo se ve al pasar el mouse → la fila no cambia de alto)
        // Precios: también se copian (sin el "$"); el botón va a la izquierda para que los números queden alineados
        const isMoney = artColumnKind(c) === "money" && cell.num && cell.text;
        const copyTxt = isName || isMoney ? cell.text : "";   // los precios se copian con el "$"
        const what = isName ? "nombre" : "precio";
        const copy = copyTxt ? `<button type="button" class="art-copy" data-copy data-text="${escapeHtml(copyTxt)}" title="Copiar ${what}" aria-label="Copiar ${what}">${ART_COPY_ICON}</button>` : "";
        return `<td class="${cls}${isMoney ? " money" : ""}">${isMoney ? copy : ""}${escapeHtml(cell.text)}${isMoney ? "" : copy}</td>`;
      }).join("")}</tr>`;
    }).join("");
    artRenderSel();
    fitScrollArea("view-articulos");
  },
  onReset(){
    artSel.clear();
    artRenderSel();
    document.getElementById("artHead").innerHTML = "";
    document.getElementById("artHead").dataset.key = "";
    document.getElementById("artBody").innerHTML = "";
  }
});


/* Catálogo simplificado (SKU, nombre, marca, precios) para Relaciones y Cotizaciones */
let artCatalogCache = { rows: null, length: -1, value: null };
function getArticulosCatalog(){
  const rows = articulosModule.rows;
  if (artCatalogCache.rows === rows && artCatalogCache.length === rows.length) return artCatalogCache.value;
  const cols = artResolveColumns(articulosModule.columns, rows);
  const skuCol = cols.find(c => /sku|c[oó]digo/i.test(c.title || ""));
  const nameCol = cols.find(c => /nombre|descripci/i.test(c.title || ""));
  const marcaCol = cols.find(c => /marca/i.test(c.title || ""));
  // Stock: solo importan "Deposito 1 - Local" y "Deposito Central"
  const stockCols = cols.filter(c => /dep[oó]sito\s*(1|central)|local/i.test(c.title || ""));
  const priceCols = cols.filter(c => artColumnKind(c) === "money");
  const list = [];
  const bySku = new Map();
  if (skuCol) {
    for (const row of rows) {
      const sku = String(row[skuCol.field] ?? "").trim();
      if (!sku) continue;
      const item = { sku, nombre: nameCol ? String(row[nameCol.field] ?? "") : "", marca: marcaCol ? String(row[marcaCol.field] ?? "").trim() : "", row,
        stock: stockCols.length ? stockCols.reduce((n, c) => n + (Number(row[c.field]) || 0), 0) : null };
      if (!artRowExcluded(row)) list.push(item);
      bySku.set(sku, item);
    }
    list.sort((a, b) => skuCompare(a.sku, b.sku));
  }
  const value = { list, bySku, priceCols, stockCols };
  artCatalogCache = { rows, length: rows.length, value };
  return value;
}


/* ---------- Copiar el nombre del artículo ---------- */
const ART_COPY_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
const ART_OK_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
async function artCopyName(btn){
  const text = (btn.dataset.text || "").trim();
  if (!text) return;
  try { await navigator.clipboard.writeText(text); }
  catch {
    const ta = Object.assign(document.createElement("textarea"), { value: text });
    ta.style.cssText = "position:fixed; opacity:0";
    document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); } catch {}
    ta.remove();
  }
  btn.innerHTML = ART_OK_ICON; btn.classList.add("is-done"); btn.title = "¡Copiado!";
  clearTimeout(btn._t);
  const old = btn.getAttribute("aria-label");
  btn._t = setTimeout(() => { btn.innerHTML = ART_COPY_ICON; btn.classList.remove("is-done"); btn.title = old; }, 1400);
}

/* ---------- X para borrar la búsqueda ---------- */
(function(){
  const input = document.getElementById("artSearch");
  const clear = document.getElementById("artSearchClear");
  const sync = () => clear.classList.toggle("hidden", !input.value);
  input.addEventListener("input", sync);
  clear.addEventListener("click", () => {
    input.value = "";
    input.dispatchEvent(new Event("input"));   // el módulo vuelve a mostrar todo
    input.focus();
  });
  document.addEventListener("aruki:loaded", sync);
})();

/* ---------- Selección de artículos → Armar presupuesto ---------- */
const artSel = new Map();   // SKU → cantidad a mandar a Armar presupuesto
let artPageSkus = [];
function artRenderSel(){
  const n = artSel.size;
  const bar = document.getElementById("artSelBar");
  const wasHidden = bar.classList.contains("hidden");
  bar.classList.toggle("hidden", !n);
  if (wasHidden !== !n) fitScrollArea("view-articulos");
  const u = artTotalUnits();
  document.getElementById("artSelCount").textContent = `${numberFormatter.format(n)} artículo${n === 1 ? "" : "s"} seleccionado${n === 1 ? "" : "s"}${u !== n ? ` · ${numberFormatter.format(u)} unidades` : ""}`;
  const all = document.getElementById("artCheckAll");
  if (all) {
    const onPage = artPageSkus.filter(s => artSel.has(s)).length;
    all.checked = artPageSkus.length > 0 && onPage === artPageSkus.length;
    all.indeterminate = onPage > 0 && onPage < artPageSkus.length;
  }
}
function artToggle(sku, on, qty){
  if (!sku) return;
  const tr = document.querySelector(`#artBody tr[data-sku="${CSS.escape(sku)}"]`);
  const qInput = tr && tr.querySelector(".art-qty");
  if (on) artSel.set(sku, Math.max(1, Number(qty ?? (qInput ? qInput.value : artSel.get(sku))) || 1));
  else artSel.delete(sku);
  if (tr) {
    tr.classList.toggle("is-selected", on);
    const cb = tr.querySelector("input[type=checkbox]"); if (cb) cb.checked = on;
    if (qInput && on) qInput.value = artSel.get(sku);
  }
  artRenderSel();
}
function artTotalUnits(){ let n = 0; artSel.forEach(q => { n += q; }); return n; }
document.getElementById("artBody").addEventListener("click", e => {
  const copyBtn = e.target.closest("[data-copy]");
  if (copyBtn) { artCopyName(copyBtn); return; }              // copiar no cambia la selección
  const tr = e.target.closest("tr[data-sku]");
  if (!tr || !tr.dataset.sku) return;
  if (e.target.matches(".art-qty")) return;                 // tocar la cantidad no cambia la selección
  if (window.getSelection && String(window.getSelection()).length && !e.target.matches("input")) return;   // estaba seleccionando texto
  const on = e.target.matches("input[type=checkbox]") ? e.target.checked : !artSel.has(tr.dataset.sku);
  artToggle(tr.dataset.sku, on);
});
/* Cambiar la cantidad selecciona el artículo con esa cantidad */
document.getElementById("artBody").addEventListener("input", e => {
  if (!e.target.matches(".art-qty")) return;
  const tr = e.target.closest("tr[data-sku]");
  const q = Number(e.target.value);
  if (tr && q > 0) artToggle(tr.dataset.sku, true, q);
});
document.getElementById("artBody").addEventListener("keydown", e => {
  if (e.target.matches(".art-qty") && e.key === "Enter") { e.preventDefault(); e.target.blur(); }
});
document.getElementById("artHead").addEventListener("change", e => {
  if (e.target.id !== "artCheckAll") return;
  const on = e.target.checked;   // leerlo antes: cada artToggle vuelve a calcular la casilla
  artPageSkus.forEach(sku => artToggle(sku, on));
});
document.getElementById("artSelClear").addEventListener("click", () => {
  [...artSel.keys()].forEach(sku => artToggle(sku, false));
});
document.getElementById("artSelAdd").addEventListener("click", () => {
  const items = [...artSel].map(([sku, qty]) => ({ sku, qty }));
  if (!items.length) return;
  const texto = manAddSkus(items);   // se queda en Artículos: solo aviso flotante
  artSel.clear();
  articulosModule.render();
  if (texto) artShowToast(`Agregados a Armar presupuesto: ${texto}`);
});

/* Aviso flotante de Artículos (5 s) con Deshacer y acceso a Armar presupuesto */
let artToastTimer = null;
function artShowToast(text){
  document.getElementById("artToastText").textContent = text;
  const t = document.getElementById("artToast");
  t.classList.remove("hidden");
  t.style.animation = "none"; void t.offsetWidth; t.style.animation = "";
  clearTimeout(artToastTimer);
  artToastTimer = setTimeout(artHideToast, 5000);
}
function artHideToast(){ clearTimeout(artToastTimer); document.getElementById("artToast").classList.add("hidden"); }
document.getElementById("artToastUndo").addEventListener("click", () => { artHideToast(); manUndo(); });
document.getElementById("artToastGo").addEventListener("click", () => { artHideToast(); showModule("manual"); });
document.getElementById("artToastClose").addEventListener("click", artHideToast);
