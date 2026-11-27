/* ============================================================
   COBRANZAS › FACTURAS DE VENTA (antes "Control Facturas")
   v7.6: filtros por período, vendedor, origen y estado; columnas que se ordenan (tocando el título)
   y se ensanchan (arrastrando el borde) con gridRender (core.js); totales; Excel/PDF de lo filtrado;
   link para abrir cada factura en YiQi. v7.7: importes con 2 decimales (cobMoney de cobranzas.js).
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
    tipo: String(f.TIFA_NOMBRE || "—").trim() || "—",
    condicion: String(f.COVE_DESCRIPCION || "—"),
    origen: String(f.FACT_EXTE_NOMBRE || "—"),
    vendedor: String(f.VEHA_NOMBRE || "—"),
    estado: String(f.DESC_ESTADO || "Sin estado"),
    total, pendiente: Math.abs(pendiente) > 0.10 ? pendiente : 0, moneda: "ARS",
  };
  n.cobrado = Math.max(0, n.total - n.pendiente);
  n.dias = n.emision ? Math.max(0, Math.floor((Date.now() - +n.emision) / 86400000)) : null;
  facNormMap.set(f, n);
  return n;
}

/* v8.8: filtros de varios a la vez (vendedor, origen, tipo, punto de venta) y un solo calendario desde–hasta */
const fac = { status: "todas", vend: new Set(), orig: new Set(), tipo: new Set(), pv: new Set(), sort: { k: "emision", d: -1 }, optsFor: null };
const FAC_COLS = [
  { k: "cliente", t: "Cliente", w: 280, html: f => `<b>${escapeHtml(f.cliente)}</b>` },
  { k: "comp", t: "Factura", w: 220, html: f => `<span class="comp-cell">${yiqiLinkHtml(f.id)}${escapeHtml(f.comp)}</span>` },
  { k: "emision", t: "Emisión", w: 110, sv: f => f.emision ? +f.emision : null, html: f => f.emision ? f.emision.toLocaleDateString("es-AR") : "—" },
  { k: "dias", t: "Antigüedad", w: 110, num: true, html: f => f.dias === null ? "—" : cobDiasBadge(f.dias) },
  { k: "condicion", t: "Condición", w: 120, html: f => `<span class="muted-cell">${escapeHtml(f.condicion)}</span>` },
  { k: "origen", t: "Origen", w: 120, html: f => `<span class="muted-cell">${escapeHtml(f.origen)}</span>` },
  { k: "vendedor", t: "Vendedor", w: 140, html: f => `<span class="muted-cell">${escapeHtml(f.vendedor)}</span>` },
  { k: "total", t: "Total", w: 120, num: true, html: f => cobMoney(f.total) },
  { k: "pendiente", t: "Pendiente", w: 120, num: true, html: f => f.pendiente ? `<b>${cobMoney(f.pendiente)}</b>` : `<span class="muted-cell">—</span>` },
  { k: "estado", t: "Estado", w: 120, html: f => statusBadge(f.estado) },
];
const facMS = {};
function facFillSelects(m){
  if (fac.optsFor === m.rows && fac.optsLen === m.rows.length) return;
  fac.optsFor = m.rows; fac.optsLen = m.rows.length;
  const uniq = k => [...new Set(m.rows.map(r => facNorm(r)[k]).filter(v => v && v !== "—"))]
    .sort((a, b) => a.localeCompare(b, "es", { numeric: true, sensitivity: "base" }));
  [["vend", "vendedor"], ["orig", "origen"], ["tipo", "tipo"], ["pv", "pv"]].forEach(([s, k]) => {
    const list = uniq(k);
    [...fac[s]].forEach(v => { if (!list.includes(v)) fac[s].delete(v); });
    facMS[s].render(list);
  });
}
function facFiltrosTxt(){
  const f = [];
  const dr = facMS.fechas;
  if (dr && (dr.desde || dr.hasta)) f.push(dr.hasta ? `Del ${_drFmt(dr.desde)} al ${_drFmt(dr.hasta)}` : `Desde ${_drFmt(dr.desde)}`);
  const lst = (set, uno, varios) => { if (set.size) f.push(`${set.size === 1 ? uno : varios}: ${[...set].join(", ")}`); };
  lst(fac.vend, "Vendedor", "Vendedores"); lst(fac.orig, "Origen", "Orígenes");
  lst(fac.tipo, "Tipo", "Tipos"); lst(fac.pv, "Punto de venta", "Puntos de venta");
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
    const dr = facMS.fechas;
    if (dr && dr.desde && (!n.fechaKey || n.fechaKey < dr.desde)) return false;
    if (dr && dr.hasta && (!n.fechaKey || n.fechaKey > dr.hasta)) return false;
    if (fac.vend.size && !fac.vend.has(n.vendedor)) return false;
    if (fac.orig.size && !fac.orig.has(n.origen)) return false;
    if (fac.tipo.size && !fac.tipo.has(n.tipo)) return false;
    if (fac.pv.size && !fac.pv.has(n.pv)) return false;
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
      : (c.k === "total" || c.k === "pendiente") ? `<td class="num"><b>${cobMoney(sum(c.k))}</b></td>` : "<td></td>").join("");
    facturasModule.lastFiltered = filtered;
    gridRender(wrap, "fac-colw", FAC_COLS, pageRows, foot, f => facDetOpen(f), fac.sort, st => { fac.sort = st; m.viewPage = 1; m.render(); }, true);

    const totalVisible = sum("total");
    const pendingRows = filtered.filter(f => f.pendiente > 0);
    const pendingVisible = sum("pendiente");
    const avg = filtered.length ? totalVisible / filtered.length : 0;
    document.getElementById("kpiTotal").textContent = cobMoney(totalVisible);
    document.getElementById("kpiTotalSub").textContent = facFiltrosTxt() || "Todas las facturas cargadas";
    document.getElementById("kpiCount").textContent = numberFormatter.format(filtered.length);
    document.getElementById("kpiCountSub").textContent =
      `${numberFormatter.format(m.rows.length)} cargadas · ${m.total ? numberFormatter.format(m.total) : "—"} en YiQi`;
    document.getElementById("kpiPending").textContent = cobMoney(pendingVisible);
    document.getElementById("kpiPendingSub").textContent =
      `${numberFormatter.format(pendingRows.length)} factura(s) con saldo · cobrado ${cobMoney(sum("cobrado"))}`;
    document.getElementById("kpiAvg").textContent = cobMoney(avg);
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
const facMsOpts = (allText, plural, title) => ({ allText, manyText: n => `${n} ${plural}`, title, onChange: () => facRefresh() });
facMS.vend = multiSelect(document.getElementById("facVendWrap"), { set: fac.vend, ...facMsOpts("Vendedor", "vendedores", "Elegí uno o varios vendedores") });
facMS.orig = multiSelect(document.getElementById("facOrigWrap"), { set: fac.orig, ...facMsOpts("Origen", "orígenes", "Elegí uno o varios orígenes") });
facMS.tipo = multiSelect(document.getElementById("facTipoWrap"), { set: fac.tipo, minWidth: 110, ...facMsOpts("Tipo", "tipos", "Tipo de factura: elegí uno o varios") });
facMS.pv = multiSelect(document.getElementById("facPvWrap"), { set: fac.pv, ...facMsOpts("Punto de venta", "puntos de venta", "Punto de venta: elegí uno o varios") });
Object.values(facMS).forEach(ms => ms.render([]));
facMS.fechas = dateRange(document.getElementById("facFechas"), { placeholder: "Fecha de emisión", onChange: () => facRefresh() });
document.getElementById("facExcelBtn").addEventListener("click", () => {
  const rows = facturasModule.lastFiltered || [];
  cobExcel("Facturas de venta", "Facturas", FAC_COLS, rows,
    [["Facturas de venta"], [`Al ${new Date().toLocaleDateString("es-AR")}${facFiltrosTxt() ? " · " + facFiltrosTxt() : ""}`], []]).catch(e => alert(e.message));
});
document.getElementById("facPdfBtn").addEventListener("click", () => {
  cobPdfTable({ title: "Facturas de venta", subtitle: `Al ${new Date().toLocaleDateString("es-AR")}${facFiltrosTxt() ? " · " + facFiltrosTxt() : ""}`,
    cols: FAC_COLS, rows: facturasModule.lastFiltered || [], file: `Facturas de venta - ${new Date().toISOString().slice(0, 10)}.pdf` }).catch(e => alert(e.message));
});

/* ============================================================
   v8.8 Detalle de una factura (artículos): se abre tocando una factura en Facturas de venta o en Cuentas corrientes.
   Worker GET /factura-detalle?id=<id factura> → { renglones: [{COFA_CODIGO (SKU), FADE_CONCEPTO_COMPLETO, FADE_CANTIDAD,
   FADE_NRO_SERIE, FADE_SUBTOTAL, …}] }. Se recuerda lo ya traído mientras la página está abierta.
   ============================================================ */
const facDetCache = new Map();
const FAD_COLS = [
  { k: "sku", t: "SKU", w: 110, html: r => `<span class="mono">${escapeHtml(r.sku || "—")}</span>` },
  { k: "concepto", t: "Concepto", w: 420, html: r => escapeHtml(r.concepto || "—") },
  { k: "cantidad", t: "Cantidad", w: 90, num: true, html: r => r.cantidad === null ? "—" : escapeHtml(numberFormatter.format(r.cantidad)) },
  { k: "serie", t: "Nro de serie", w: 130, html: r => r.serie ? escapeHtml(r.serie) : `<span class="muted-cell">—</span>` },
  { k: "subtotal", t: "Subtotal", w: 130, num: true, html: r => escapeHtml(cobMoney(r.subtotal)) },
];
function facDetModal(){
  let m = document.getElementById("facDetModal");
  if (m) return m;
  m = document.createElement("div");
  m.className = "modal-backdrop hidden"; m.id = "facDetModal";
  m.innerHTML = `<div class="modal fad-modal" role="dialog" aria-modal="true"></div>`;
  document.body.appendChild(m);
  m.addEventListener("click", e => { if (e.target === m) m.classList.add("hidden"); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") m.classList.add("hidden"); });
  return m;
}
async function facDetOpen(f){
  if (!f || f.id === null || f.id === undefined) return;
  const m = facDetModal(), box = m.querySelector(".modal");
  const fecha = f.emision ? f.emision.toLocaleDateString("es-AR") : "";
  const datos = [fecha && `Emitida el ${fecha}`, f.vendedor && f.vendedor !== "—" && `Vendedor: ${f.vendedor}`, f.condicion && f.condicion !== "—" && `Condición: ${f.condicion}`].filter(Boolean).join(" · ");
  box.innerHTML = `<div class="modal-head fad-head">
      <div><div class="page-kicker">Detalle de factura</div>
        <h3>${escapeHtml(f.cliente || "")}</h3>
        <div class="cob-sub">${escapeHtml(f.comp || "")}${datos ? " · " + escapeHtml(datos) : ""}${f.estado ? " " + statusBadge(f.estado) : ""}</div></div>
      <div class="fad-actions">
        <a class="btn btn-secondary" href="${yiqiFacturaUrl(f.id)}" target="_blank" rel="noopener" title="Abrir esta factura en YiQi">Factura en YiQi ↗</a>
        <button class="close-btn" type="button" aria-label="Cerrar" title="Cerrar"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div></div>
    <div class="cob-table-wrap fad-table"><div class="cob-muted" style="padding:18px 4px">Buscando los artículos en YiQi…</div></div>`;
  box.querySelector(".close-btn").addEventListener("click", () => m.classList.add("hidden"));
  m.classList.remove("hidden");
  const wrap = box.querySelector(".fad-table");
  try {
    let rows = facDetCache.get(String(f.id));
    if (!rows) {
      const r = await srvFetch(`/factura-detalle?id=${encodeURIComponent(f.id)}`);
      const j = await r.json().catch(() => ({}));
      if (r.status === 404 && !j.error) throw new Error("Hay que actualizar el conector de Cloudflare para ver los artículos de las facturas.");
      if (!r.ok || j.error) throw new Error(j.error || `No se pudo leer el detalle (HTTP ${r.status})`);
      rows = (j.renglones || []).map(x => ({
        sku: String(x.COFA_CODIGO ?? "").trim(),
        concepto: String(x.FADE_CONCEPTO_COMPLETO ?? "").trim(),
        cantidad: x.FADE_CANTIDAD === null || x.FADE_CANTIDAD === undefined ? null : toNumber(x.FADE_CANTIDAD),
        serie: String(x.FADE_NRO_SERIE ?? "").trim(),
        subtotal: toNumber(x.FADE_SUBTOTAL),
      }));
      facDetCache.set(String(f.id), rows);
    }
    if (m.classList.contains("hidden")) return;
    const sumSub = rows.reduce((s, r) => s + r.subtotal, 0);
    const foot = FAD_COLS.map((c, i) => i === 0 ? `<td><b>Total</b></td>` : c.k === "concepto" ? `<td class="cob-muted">${rows.length} ${rows.length === 1 ? "artículo" : "artículos"}</td>`
      : c.k === "subtotal" ? `<td class="num"><b>${escapeHtml(cobMoney(sumSub))}</b></td>` : "<td></td>").join("");
    const st = { k: "", d: 1 };
    const draw = () => gridRender(wrap, "fad-colw", FAD_COLS, rows, foot, null, st, s2 => { st.k = s2.k; st.d = s2.d; draw(); });
    draw();
    const extra = [];
    if (Math.abs((f.total || 0) - sumSub) > 1 && f.total) extra.push(`Total de la factura: <b>${escapeHtml(cobMoney(f.total))}</b> (incluye percepciones u otros importes)`);
    if (f.pendiente) extra.push(`Pendiente de cobro: <b>${escapeHtml(cobMoney(f.pendiente))}</b>`);
    if (extra.length) wrap.insertAdjacentHTML("afterend", `<div class="fad-extra">${extra.join(" · ")}</div>`);
  } catch (error) {
    wrap.innerHTML = `<div class="cob-red" style="padding:18px 4px">${escapeHtml(error.message)}</div>`;
  }
}
