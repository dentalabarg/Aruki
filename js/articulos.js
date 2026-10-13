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
  let total = 0;
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
  const ths = [...head.querySelectorAll("th")];
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
  cache: { key: "articulos", maxAgeHours: 4 },   // guardado en la computadora, se actualiza solo cada 4 h
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
      head.innerHTML = cols.map(c => {
        const num = artColumnKind(c) === "money" || QTY_TITLE.test(c.title || "");
        return `<th class="${num ? "num" : ""}">${escapeHtml(c.title || c.field)}</th>`;
      }).join("");
      if (cols.length) artInitResize(cols);
    }
    document.getElementById("artBody").innerHTML = pageRows.map(r => `<tr>${cols.map(c => {
      const cell = artFormatCell(r[c.field], c);
      const isName = /nombre|descripci/i.test(c.title || "");
      const cls = [cell.num ? "num" : "", cell.zero ? "zero" : "", isName ? "name" : ""].filter(Boolean).join(" ");
      return `<td class="${cls}">${escapeHtml(cell.text)}</td>`;
    }).join("")}</tr>`).join("");
  },
  onReset(){
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
  }
  const value = { list, bySku, priceCols, stockCols };
  artCatalogCache = { rows, length: rows.length, value };
  return value;
}
