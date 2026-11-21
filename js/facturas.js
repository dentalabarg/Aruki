/* ============================================================
   COBRANZAS › FACTURAS DE VENTA (antes "Control Facturas")
   v7.6: filtros por período, vendedor, origen y estado; columnas que se ordenan (tocando el título)
   y se ensanchan (arrastrando el borde) con gridRender (core.js); totales; Excel/PDF de lo filtrado;
   link para abrir cada factura en YiQi.
   Los datos vienen de la smartie 2355 (facturas desde el 01/07/2026, sin Mercado Libre ni Consumidor Final).
   ============================================================ */
function invoiceLabel(f){
  const type = String(f.TIFA_NOMBRE ?? "").trim();
  const number = String(f.FACT_NUMERO ?? "").trim();
  return [type, number].filter(Boolean).join(" ") || "—";
}
function hasPendingBalance(f){
  return Math.abs(toNumber(f.FACT_PENDIENTE_CANCELACIO)) > 0.10;
}
function statusBadge(estado){
  const normalized = String(estado || "Sin estado").toLowerCase();
  let cls = "badge-amber";
  if (normalized.includes("cobr")) cls = "badge-green";
  else if (normalized.includes("entreg")) cls = "badge-cyan";
  else if (normalized.includes("anul") || normalized.includes("cancel")) cls = "badge-red";
  else if (normalized.includes("pend")) cls = "badge-purple";
  return `<span class="badge ${cls}">${escapeHtml(estado || "Sin estado")}</span>`;
}

/* Fila de YiQi → objeto con los datos ya listos (se guarda aparte para no ensuciar el caché) */
const facNormMap = new WeakMap();
function facNorm(f){
  let n = facNormMap.get(f);
  if (n) return n;
  const emision = f.FACT_FECHA_EMISION ? new Date(f.FACT_FECHA_EMISION) : null;
  const total = toNumber(f.FACT_TOTAL), pendiente = toNumber(f.FACT_PENDIENTE_CANCELACIO);
  n = {
    id: f.id ?? f.ID ?? null,
    comp: typeof cobComprobante === "function" ? cobComprobante(f) : invoiceLabel(f),
    cliente: String(f.CLIE_RAZON_SOCIAL || "—"),
    emision: emision && !isNaN(emision) ? emision : null,
    fechaKey: emision && !isNaN(emision) ? emision.toISOString().slice(0, 10) : "",
    pv: String(f.PUVE_NOMBRE || "—"),
    condicion: String(f.COVE_DESCRIPCION || "—"),
    origen: String(f.FACT_EXTE_NOMBRE || "—"),
    vendedor: String(f.VEHA_NOMBRE || "—"),
    estado: String(f.DESC_ESTADO || "Sin estado"),
    total, pendiente: Math.abs(pendiente) > 0.10 ? pendiente : 0, moneda: "ARS",
  };
  n.cobrado = Math.max(0, n.total - n.pendiente);
  facNormMap.set(f, n);
  return n;
}

const fac = { status: "todas", desde: "", hasta: "", vendedor: "", origen: "", sort: { k: "emision", d: -1 }, optsFor: null };
const FAC_COLS = [
  { k: "comp", t: "Factura", w: 240, html: f => `<span class="comp-cell">${yiqiLinkHtml(f.id)}<b>${escapeHtml(f.comp)}</b></span>` },
  { k: "cliente", t: "Cliente", w: 260, html: f => escapeHtml(f.cliente) },
  { k: "emision", t: "Emisión", w: 110, sv: f => f.emision ? +f.emision : null, html: f => f.emision ? f.emision.toLocaleDateString("es-AR") : "—" },
  { k: "condicion", t: "Condición", w: 120, html: f => `<span class="muted-cell">${escapeHtml(f.condicion)}</span>` },
  { k: "origen", t: "Origen", w: 120, html: f => `<span class="muted-cell">${escapeHtml(f.origen)}</span>` },
  { k: "vendedor", t: "Vendedor", w: 140, html: f => `<span class="muted-cell">${escapeHtml(f.vendedor)}</span>` },
  { k: "total", t: "Total", w: 120, num: true, html: f => money(f.total) },
  { k: "pendiente", t: "Pendiente", w: 120, num: true, html: f => f.pendiente ? `<b>${money(f.pendiente)}</b>` : `<span class="muted-cell">—</span>` },
  { k: "estado", t: "Estado", w: 120, html: f => statusBadge(f.estado) },
];

function facFillSelects(m){
  if (fac.optsFor === m.rows && fac.optsLen === m.rows.length) return;
  fac.optsFor = m.rows; fac.optsLen = m.rows.length;
  const uniq = k => [...new Set(m.rows.map(r => facNorm(r)[k]).filter(v => v && v !== "—"))].sort((a, b) => a.localeCompare(b, "es"));
  const fill = (id, items, first, cur) => {
    const sel = document.getElementById(id);
    sel.innerHTML = `<option value="">${first}</option>` + items.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");
    sel.value = items.includes(cur) ? cur : "";
  };
  fill("facVendedor", uniq("vendedor"), "Todos los vendedores", fac.vendedor);
  fill("facOrigen", uniq("origen"), "Todos los orígenes", fac.origen);
}
function facFiltrosTxt(){
  const f = [];
  if (fac.desde || fac.hasta) f.push(`${fac.desde ? "Desde " + fac.desde.split("-").reverse().join("/") : ""}${fac.hasta ? " hasta " + fac.hasta.split("-").reverse().join("/") : ""}`.trim());
  if (fac.vendedor) f.push(`Vendedor: ${fac.vendedor}`);
  if (fac.origen) f.push(`Origen: ${fac.origen}`);
  if (fac.status !== "todas") f.push({ cobradas: "Cobradas", saldo: "Con saldo", entregadas: "Entregadas" }[fac.status]);
  const q = document.getElementById("searchInput").value.trim();
  if (q) f.push(`Búsqueda: "${q}"`);
  return f.join(" · ");
}

const facturasModule = createDataModule({
  endpoint: `${WORKER_BASE}/facturas`,
  cache: { key: "facturas", maxAgeHours: 4 },   // v7.3: guardadas en la computadora y en el servidor
  serverCache: "facturas",
  syncTitle: "Traer las facturas actualizadas desde YiQi",
  viewSize: 50,
  loadingTitle: "Cargando todas las facturas desde YiQi",
  idleText: "Aruki carga todas las facturas al abrir este módulo.",
  emptyText: "Todavía no hay facturas cargadas.",
  ids: {
    banner: "runtimeBanner", kicker: "runtimeKicker", title: "runtimeTitle", text: "runtimeText",
    progress: "loadProgress", progressFill: "loadProgressFill",
    stop: "stopBtn", retry: "retryBtn", refresh: "refreshBtn",
    search: "searchInput", empty: "emptyState",
    currentPage: "currentPageLabel", totalPages: "totalPagesLabel", totalRecords: "totalRecordsLabel",
    note: "facNote", pageButtons: "pageNumberButtons", first: "firstPageBtn", last: "lastPageBtn"
  },
  filter(f){
    const n = facNorm(f);
    const estado = n.estado.toLowerCase();
    if (fac.desde && (!n.fechaKey || n.fechaKey < fac.desde)) return false;
    if (fac.hasta && (!n.fechaKey || n.fechaKey > fac.hasta)) return false;
    if (fac.vendedor && n.vendedor !== fac.vendedor) return false;
    if (fac.origen && n.origen !== fac.origen) return false;
    return fac.status === "todas" ||
      (fac.status === "cobradas" && estado.includes("cobr")) ||
      (fac.status === "saldo" && n.pendiente > 0) ||
      (fac.status === "entregadas" && estado.includes("entreg"));
  },
  sortFiltered(rows){ return gridSortRows(rows.map(facNorm), FAC_COLS, fac.sort); },
  searchText(f){
    const n = facNorm(f);
    return [n.comp, invoiceLabel(f), f.FACT_NUMERO, n.cliente, n.pv, n.condicion, n.origen, n.vendedor, n.estado, f.FACT_TOTAL].join(" ");
  },
  renderRows(pageRows, filtered, m){
    facFillSelects(m);
    const wrap = document.getElementById("facTableWrap");
    const sum = k => filtered.reduce((s, f) => s + (f[k] || 0), 0);
    const foot = FAC_COLS.map((c, i) => i === 0 ? `<td><b>Total (${numberFormatter.format(filtered.length)} facturas)</b></td>`
      : (c.k === "total" || c.k === "pendiente") ? `<td class="num"><b>${money(sum(c.k))}</b></td>` : "<td></td>").join("");
    facturasModule.lastFiltered = filtered;
    gridRender(wrap, "fac-colw", FAC_COLS, pageRows, foot, null, fac.sort, st => { fac.sort = st; m.viewPage = 1; m.render(); }, true);

    const totalVisible = sum("total");
    const pendingRows = filtered.filter(f => f.pendiente > 0);
    const pendingVisible = sum("pendiente");
    const avg = filtered.length ? totalVisible / filtered.length : 0;
    document.getElementById("kpiTotal").textContent = money(totalVisible);
    document.getElementById("kpiTotalSub").textContent = facFiltrosTxt() || "Todas las facturas cargadas";
    document.getElementById("kpiCount").textContent = numberFormatter.format(filtered.length);
    document.getElementById("kpiCountSub").textContent =
      `${numberFormatter.format(m.rows.length)} cargadas · ${m.total ? numberFormatter.format(m.total) : "—"} en YiQi`;
    document.getElementById("kpiPending").textContent = money(pendingVisible);
    document.getElementById("kpiPendingSub").textContent =
      `${numberFormatter.format(pendingRows.length)} factura(s) con saldo · cobrado ${money(sum("cobrado"))}`;
    document.getElementById("kpiAvg").textContent = money(avg);
  }
});

function facRefresh(){ facturasModule.viewPage = 1; facturasModule.render(); }
document.querySelectorAll("#statusFilter .range-btn").forEach(btn => {
  btn.addEventListener("click", function(){
    document.querySelectorAll("#statusFilter .range-btn").forEach(b => b.classList.remove("is-active"));
    this.classList.add("is-active");
    fac.status = this.dataset.status;
    facRefresh();
  });
});
function facSetPeriodo(per){
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const now = new Date();
  if (per === "mes") { fac.desde = iso(new Date(now.getFullYear(), now.getMonth(), 1)); fac.hasta = ""; }
  else if (per === "mesant") { fac.desde = iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)); fac.hasta = iso(new Date(now.getFullYear(), now.getMonth(), 0)); }
  else if (per === "30") { fac.desde = iso(new Date(now - 29 * 86400000)); fac.hasta = ""; }
  else { fac.desde = ""; fac.hasta = ""; }
  document.getElementById("facDesde").value = fac.desde;
  document.getElementById("facHasta").value = fac.hasta;
  document.querySelectorAll("#facPeriodo .range-btn").forEach(b => b.classList.toggle("is-active", b.dataset.per === per));
  facRefresh();
}
document.getElementById("facPeriodo").addEventListener("click", e => { const b = e.target.closest("[data-per]"); if (b) facSetPeriodo(b.dataset.per); });
["facDesde", "facHasta"].forEach(id => document.getElementById(id).addEventListener("change", () => {
  fac.desde = document.getElementById("facDesde").value; fac.hasta = document.getElementById("facHasta").value;
  document.querySelectorAll("#facPeriodo .range-btn").forEach(b => b.classList.toggle("is-active", !fac.desde && !fac.hasta && b.dataset.per === "todo"));
  facRefresh();
}));
document.getElementById("facVendedor").addEventListener("change", e => { fac.vendedor = e.target.value; facRefresh(); });
document.getElementById("facOrigen").addEventListener("change", e => { fac.origen = e.target.value; facRefresh(); });
document.getElementById("facExcelBtn").addEventListener("click", () => {
  const rows = facturasModule.lastFiltered || [];
  cobExcel("Facturas de venta", "Facturas", FAC_COLS, rows,
    [["Facturas de venta"], [`Al ${new Date().toLocaleDateString("es-AR")}${facFiltrosTxt() ? " · " + facFiltrosTxt() : ""}`], []]).catch(e => alert(e.message));
});
document.getElementById("facPdfBtn").addEventListener("click", () => {
  cobPdfTable({ title: "Facturas de venta", subtitle: `Al ${new Date().toLocaleDateString("es-AR")}${facFiltrosTxt() ? " · " + facFiltrosTxt() : ""}`,
    cols: FAC_COLS, rows: facturasModule.lastFiltered || [], file: `Facturas de venta - ${new Date().toISOString().slice(0, 10)}.pdf` }).catch(e => alert(e.message));
});
