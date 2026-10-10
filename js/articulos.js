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
  searchText(row, m){
    const cols = artResolveColumns(m.columns, m.rows);
    return cols.map(c => row[c.field]).join(" ");
  },
  renderRows(pageRows, filtered, m){
    const cols = artResolveColumns(m.columns, m.rows);
    document.getElementById("artHead").innerHTML = cols.map(c => {
      const num = artColumnKind(c) === "money" || QTY_TITLE.test(c.title || "");
      return `<th class="${num ? "num" : ""}">${escapeHtml(c.title || c.field)}</th>`;
    }).join("");
    document.getElementById("artBody").innerHTML = pageRows.map(r => `<tr>${cols.map(c => {
      const cell = artFormatCell(r[c.field], c);
      const isName = /nombre|descripci/i.test(c.title || "");
      const cls = [cell.num ? "num" : "", cell.zero ? "zero" : "", isName ? "name" : ""].filter(Boolean).join(" ");
      return `<td class="${cls}">${escapeHtml(cell.text)}</td>`;
    }).join("")}</tr>`).join("");
  },
  onReset(){
    document.getElementById("artHead").innerHTML = "";
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
      list.push(item);
      bySku.set(sku, item);
    }
  }
  const value = { list, bySku, priceCols, stockCols };
  artCatalogCache = { rows, length: rows.length, value };
  return value;
}
