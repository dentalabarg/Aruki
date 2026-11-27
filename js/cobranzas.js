/* ============================================================
   COBRANZAS › CUENTAS CORRIENTES (v7.5)
   ------------------------------------------------------------
   Datos: 4 partes que arma el conector (/cobranzas?parte=…): facturas Emitidas y Entregadas con saldo
   pendiente (todas las fechas), clientes con saldo a favor (no imputado) y última fecha de recibo por cliente.
   Se guardan como los demás datos: en esta computadora (IndexedDB "cobranzas") y en el servidor
   (/cache/cobranzas, lo actualiza la tarea automática cada 3 horas).
   Se excluyen: Mercado Libre, facturas de $1, Consumidor Final, pruebas (Samandjian) y saldos < $1.
   Antigüedad = días desde la emisión (pedido del usuario).
   Vistas: por cliente / por factura / por vendedor; detalle (estado de cuenta) con notas de seguimiento.
   Tablas: se ordenan tocando el título y se cambia el ancho arrastrando el borde (se recuerda).
   ============================================================ */
const COB_ENDPOINT = `${WORKER_BASE}/cobranzas`;
const COB_PARTES = ["emitidas", "entregadas", "saldos", "pagos"];
const COB_MAX_AGE = 4 * 3600000;
/* v8.4: tramos como antes (0–30, 31–60…; decisión del usuario) + "más de 365", de verde a bordó */
const COB_BUCKETS = [
  { min: 0, max: 30, t: "0–30 días", c: "#2f9e6e" },
  { min: 31, max: 60, t: "31–60 días", c: "#c9a227" },
  { min: 61, max: 90, t: "61–90 días", c: "#e07b39" },
  { min: 91, max: 180, t: "91–180 días", c: "#d64545" },
  { min: 181, max: 365, t: "181–365 días", c: "#a52a3a" },
  { min: 366, max: Infinity, t: "Más de 365 días", c: "#5e1f33" },
];
const cob = {
  raw: null, data: null, savedAt: 0, loading: false, syncing: false, loaded: false, error: "",
  view: "clientes", search: "", vend: new Set(), min: 0, max: Infinity, favor: false,
  sort: { clientes: { k: "pendiente", d: -1 }, facturas: { k: "dias", d: -1 }, vendedores: { k: "pendiente", d: -1 }, detalle: { k: "emision", d: 1 } },
  detalle: null, notas: {}, notasLoaded: false, pieId: ""
};
const cobEl = id => document.getElementById(id);
/* v7.7: en Cobranzas los importes van siempre con 2 decimales (punto para miles, coma para decimales: 1.234,50) */
const COB_NUM = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cobMoney = (n, mon = "ARS") => (mon && mon !== "ARS" ? (mon === "USD" ? "US$ " : `${mon} `) : "$ ") + COB_NUM.format(Number(n) || 0);
const cobDate = d => d ? d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";
const DAY = 86400000;

/* ---------- Datos ---------- */
function cobParseDate(v){
  if (!v) return null;
  const d = new Date(String(v).length <= 10 ? `${v}T12:00:00` : v);
  return isNaN(d) ? null : d;
}
function cobComprobante(r){
  const pv = String(r.PUVE_NOMBRE ?? "").match(/\d+/)?.[0] || "";
  const num = String(r.FACT_NUMERO ?? "");
  const tipo = String(r.TIFA_NOMBRE ?? "").trim();
  return `FC ${tipo ? tipo + " " : ""}${pv ? pv.padStart(4, "0") + "-" : ""}${/^\d+$/.test(num) ? num.padStart(8, "0") : num}`.trim();
}
function cobExcluida(f){
  if (/mercado\s*libre/.test(foldText(f.origen))) return true;
  if (f.total <= 1 || f.pendiente < 1) return true;
  const n = foldText(f.cliente);
  if (String(f.clienteId) === String(CLI_CONSUMIDOR_FINAL_ID) || n.includes("consumidor final")) return true;
  if (n.includes("samandjian")) return true;
  return false;
}
function cobBuild(raw){
  const today = new Date(); today.setHours(12, 0, 0, 0);
  const cli = new Map((clientesStore.list || []).map(c => [String(c.id), c]));
  const facturas = [];
  for (const r of raw.rows || []) {
    const emision = cobParseDate(r.FACT_FECHA_EMISION);
    const total = toNumber(r.FACT_TOTAL), pendiente = toNumber(r.FACT_PENDIENTE_CANCELACIO);
    const clienteId = String(r.CLIE_ID_CLIE ?? "");
    const info = cli.get(clienteId);
    const f = {
      id: r.id ?? r.ID ?? null, clienteId,
      cliente: String(r.CLIE_RAZON_SOCIAL || r.CLIE_NOMBRE || info?.razon || "(sin nombre)").trim(),
      cuit: info?.cuit || "", iva: info?.iva || "",
      vendedor: String(r.VEHA_NOMBRE || "").trim() || "(sin vendedor)",
      condicion: String(r.COVE_DESCRIPCION || "").trim(),
      origen: String(r.FACT_EXTE_NOMBRE || "").trim(),
      estado: String(r.DESC_ESTADO || ""),
      comp: cobComprobante(r),
      emision, vence: cobParseDate(r.FACT_FECHA_VENCIMIENTO),
      dias: emision ? Math.max(0, Math.floor((today - emision) / DAY)) : 0,
      total, pendiente, cobrado: Math.max(0, total - pendiente),
      moneda: String(r.MON1_NOMBRE || "ARS").trim().toUpperCase() || "ARS",
    };
    if (!cobExcluida(f)) facturas.push(f);
  }
  const saldos = new Map((raw.saldos || []).map(s => [String(s.id ?? s.ID ?? ""), toNumber(s.CLIE_SALDO_CLIENTE)]));
  const pagos = new Map((raw.pagos || []).map(p => [String(p.CLIE_ID_CLIE ?? ""), cobParseDate(p.FACT_FECHA_DE_ULTIMO_COBR)]));
  const vendedores = [...new Set(facturas.map(f => f.vendedor))].sort((a, b) => a.localeCompare(b, "es"));
  const condiciones = [...new Set(facturas.map(f => f.condicion).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
  facturas.forEach(f => { f.s = foldText(`${f.cliente} ${f.cuit} ${f.cuit.replace(/\D/g, "")} ${f.comp} ${f.vendedor}`); });
  return { facturas, saldos, pagos, vendedores, condiciones };
}

/* Facturas que pasan los filtros de arriba */
function cobFiltered(){
  const d = cob.data; if (!d) return [];
  const terms = foldText(cob.search).split(/\s+/).filter(Boolean);
  return d.facturas.filter(f =>
    (!cob.vend.size || cob.vend.has(f.vendedor)) &&
    f.dias >= cob.min && f.dias <= cob.max &&
    (!cob.favor || (d.saldos.get(f.clienteId) || 0) > 0) &&
    terms.every(t => f.s.includes(t)));
}
function cobClientes(facts){
  const d = cob.data, map = new Map();
  for (const f of facts) {
    let c = map.get(f.clienteId);
    if (!c) {
      c = { id: f.clienteId, cliente: f.cliente, cuit: f.cuit, iva: f.iva, vendedor: f.vendedor, condicion: f.condicion,
        facturas: 0, pendiente: 0, mas30: 0, mas90: 0, dias: 0, otras: {}, _vfecha: 0 };
      map.set(f.clienteId, c);
    }
    c.facturas++;
    if (f.moneda === "ARS") {
      c.pendiente += f.pendiente;
      if (f.dias > 30) c.mas30 += f.pendiente;
      if (f.dias > 90) c.mas90 += f.pendiente;
    } else c.otras[f.moneda] = (c.otras[f.moneda] || 0) + f.pendiente;
    c.dias = Math.max(c.dias, f.dias);
    const t = f.emision ? +f.emision : 0;
    if (t >= c._vfecha) { c._vfecha = t; c.vendedor = f.vendedor; c.condicion = f.condicion || c.condicion; }   // vendedor de la factura más nueva
  }
  for (const c of map.values()) {
    c.favor = d.saldos.get(c.id) || 0;
    c.neto = c.pendiente - c.favor;
    c.pago = d.pagos.get(c.id) || null;
    const n = cob.notas[c.id] || [];
    c.nota = n[0] || null;
    c.recordar = n.map(x => x.recordar).filter(Boolean).sort()[0] || "";
  }
  return [...map.values()];
}
function cobVendedores(facts){
  const map = new Map();
  for (const f of facts) {
    let v = map.get(f.vendedor);
    if (!v) { v = { vendedor: f.vendedor, clientes: new Set(), facturas: 0, pendiente: 0, mas30: 0, mas90: 0 }; map.set(f.vendedor, v); }
    v.clientes.add(f.clienteId); v.facturas++;
    if (f.moneda === "ARS") { v.pendiente += f.pendiente; if (f.dias > 30) v.mas30 += f.pendiente; if (f.dias > 90) v.mas90 += f.pendiente; }
  }
  return [...map.values()].map(v => ({ ...v, clientes: v.clientes.size }));
}

/* ---------- Tablas (gridRender está en core.js) ---------- */
function cobRenderTable(wrap, key, cols, rows, footHtml, onRow){
  return gridRender(wrap, `cob-colw-${key}`, cols, rows, footHtml, onRow, cob.sort[key], st => { cob.sort[key] = st; cobRender(); });
}

/* ---------- Columnas de cada vista ---------- */
/* v8.0: "hoy", "hace 1 día", "hace 12 días" (días de calendario) */
function cobHaceDias(d){
  const dia = x => { const t = new Date(x); return Date.UTC(t.getFullYear(), t.getMonth(), t.getDate()); };
  const n = Math.max(0, Math.round((dia(Date.now()) - dia(d)) / 86400000));
  return n === 0 ? "hoy" : n === 1 ? "hace 1 día" : `hace ${n.toLocaleString("es-AR")} días`;
}
const cobDiasBadge = d => `<span class="badge ${d > 90 ? "badge-red" : d > 30 ? "badge-amber" : "badge-green"}">${d} días</span>`;
const cobAmt = (n, mon) => n ? escapeHtml(cobMoney(n, mon)) : `<span class="cob-muted">—</span>`;
function cobOtras(o){ return Object.entries(o || {}).map(([m, v]) => `<div class="cob-muted cob-small">+ ${escapeHtml(cobMoney(v, m))}</div>`).join(""); }
function cobNotaCell(c){
  if (!c.nota && !c.recordar) return `<span class="cob-muted">—</span>`;
  const hoy = new Date().toISOString().slice(0, 10);
  const due = c.recordar && c.recordar <= hoy;
  return `${c.recordar ? `<span class="badge ${due ? "badge-red" : "badge-cyan"}" title="Recordatorio">⏰ ${escapeHtml(c.recordar.split("-").reverse().slice(0, 2).join("/"))}</span> ` : ""}${c.nota ? `<span class="cob-muted cob-small" title="${escapeHtml(c.nota.texto)}">${escapeHtml(c.nota.texto.slice(0, 40))}${c.nota.texto.length > 40 ? "…" : ""}</span>` : ""}`;
}
const COB_COLS = {
  clientes: [
    { k: "cliente", t: "Cliente", w: 300, html: c => `<span class="cob-cli">${yiqiCtaCteLinkHtml(c.id).replace('class="yiqi-link"', 'class="yiqi-link yiqi-first"')}<b title="${escapeHtml(c.cliente)}">${escapeHtml(c.cliente)}</b></span>` },
    { k: "vendedor", t: "Vendedor", w: 150, html: c => escapeHtml(c.vendedor) },
    { k: "facturas", t: "Facturas", w: 90, num: true, html: c => String(c.facturas) },
    { k: "dias", t: "Más antigua", w: 120, num: true, html: c => cobDiasBadge(c.dias) },
    { k: "pendiente", t: "Pendiente", w: 140, num: true, html: c => `<b>${cobAmt(c.pendiente)}</b>${cobOtras(c.otras)}` },
    { k: "mas30", t: "+30 días", w: 130, num: true, html: c => c.mas30 ? `<span class="cob-red">${cobAmt(c.mas30)}</span>` : cobAmt(0) },
    { k: "favor", t: "Saldo a favor", w: 130, num: true, html: c => c.favor ? `<span class="cob-green">${cobAmt(c.favor)}</span>` : cobAmt(0) },
    { k: "neto", t: "Saldo neto", w: 140, num: true, html: c => `<b>${escapeHtml(cobMoney(c.neto))}</b>` },
    { k: "pago", t: "Último pago", w: 120, sv: c => c.pago ? +c.pago : null, html: c => c.pago ? `${cobDate(c.pago)}<div class="cob-muted cob-small">${cobHaceDias(c.pago)}</div>` : `<span class="cob-muted">—</span>` },
    { k: "recordar", t: "Seguimiento", w: 200, sv: c => c.recordar || (c.nota ? "~" : null), html: cobNotaCell },
  ],
  facturas: [
    { k: "emision", t: "Emisión", w: 105, sv: f => f.emision ? +f.emision : null, html: f => cobDate(f.emision) },
    { k: "comp", t: "Comprobante", w: 240, html: f => `<span class="comp-cell">${yiqiLinkHtml(f.id)}<b>${escapeHtml(f.comp)}</b></span>` },
    { k: "cliente", t: "Cliente", w: 260, html: f => `<a href="#" class="cob-link" data-cli="${escapeHtml(f.clienteId)}">${escapeHtml(f.cliente)}</a>` },
    { k: "vendedor", t: "Vendedor", w: 140, html: f => escapeHtml(f.vendedor) },
    { k: "condicion", t: "Condición", w: 130, html: f => escapeHtml(f.condicion || "—") },
    { k: "dias", t: "Días", w: 100, num: true, html: f => cobDiasBadge(f.dias) },
    { k: "total", t: "Total", w: 130, num: true, html: f => cobAmt(f.total, f.moneda) },
    { k: "cobrado", t: "Cobrado", w: 120, num: true, html: f => cobAmt(f.cobrado, f.moneda) },
    { k: "pendiente", t: "Pendiente", w: 130, num: true, html: f => `<b>${cobAmt(f.pendiente, f.moneda)}</b>` },
  ],
  vendedores: [
    { k: "vendedor", t: "Vendedor", w: 220, html: v => `<b>${escapeHtml(v.vendedor)}</b>` },
    { k: "clientes", t: "Clientes", w: 100, num: true, html: v => String(v.clientes) },
    { k: "facturas", t: "Facturas", w: 100, num: true, html: v => String(v.facturas) },
    { k: "pendiente", t: "Pendiente", w: 150, num: true, html: v => `<b>${cobAmt(v.pendiente)}</b>` },
    { k: "mas30", t: "+30 días", w: 140, num: true, html: v => `<span class="cob-red">${cobAmt(v.mas30)}</span>` },
    { k: "mas90", t: "+90 días", w: 140, num: true, html: v => `<span class="cob-red">${cobAmt(v.mas90)}</span>` },
  ],
  detalle: [
    { k: "emision", t: "Emisión", w: 105, sv: f => f.emision ? +f.emision : null, html: f => cobDate(f.emision) },
    { k: "comp", t: "Comprobante", w: 240, html: f => `<span class="comp-cell">${yiqiLinkHtml(f.id)}<b>${escapeHtml(f.comp)}</b></span>` },
    { k: "vence", t: "Vencimiento", w: 110, sv: f => f.vence ? +f.vence : null, html: f => cobDate(f.vence) },
    { k: "dias", t: "Días", w: 100, num: true, html: f => cobDiasBadge(f.dias) },
    { k: "total", t: "Total", w: 130, num: true, html: f => cobAmt(f.total, f.moneda) },
    { k: "cobrado", t: "Cobrado", w: 120, num: true, html: f => cobAmt(f.cobrado, f.moneda) },
    { k: "pendiente", t: "Pendiente", w: 130, num: true, html: f => `<b>${cobAmt(f.pendiente, f.moneda)}</b>` },
  ],
};
const cobSum = (rows, k) => rows.reduce((s, r) => s + (r.moneda && r.moneda !== "ARS" ? 0 : (r[k] || 0)), 0);
function cobFoot(cols, rows, label){
  return cols.map((c, i) => {
    if (i === 0) return `<td><b>${label}</b></td>`;
    if (["pendiente", "mas30", "mas90", "favor", "neto", "total", "cobrado"].includes(c.k)) return `<td class="num"><b>${escapeHtml(cobMoney(cobSum(rows, c.k)))}</b></td>`;
    if (["facturas", "clientes"].includes(c.k)) return `<td class="num"><b>${rows.reduce((s, r) => s + (r[c.k] || 0), 0)}</b></td>`;
    return "<td></td>";
  }).join("");
}

/* ---------- Pantalla principal ---------- */
function cobMsg(text, kind = ""){
  const el = cobEl("cobMsg");
  el.classList.toggle("hidden", !text);
  el.dataset.kind = kind;
  el.innerHTML = text;
}
function cobKpis(facts, clientes){
  const ars = facts.filter(f => f.moneda === "ARS");
  const total = ars.reduce((s, f) => s + f.pendiente, 0);
  const sum = (min, max) => ars.filter(f => f.dias >= min && f.dias <= max).reduce((s, f) => s + f.pendiente, 0);
  const otras = {};
  facts.filter(f => f.moneda !== "ARS").forEach(f => { otras[f.moneda] = (otras[f.moneda] || 0) + f.pendiente; });
  const pct = n => total ? `${Math.round(n / total * 100)} % del total` : "—";
  const otrasTxt = Object.entries(otras).map(([m, v]) => ` · + ${cobMoney(v, m)}`).join("");
  // v8.3: cinco cuadros (pedido del usuario): total, 31–60, 61–90, 91–180 y más de 180
  // v8.5: el importe con el color de su tramo en la barra de antigüedad
  const tramo = (t, sub, min, max) => { const v = sum(min, max), c = COB_BUCKETS.find(b => b.min === min).c;
    return `<div class="card"><div class="card-kicker">${t}</div>
    <div class="kpi-value cob-tramo" style="color:${c}">${escapeHtml(cobMoney(v))}</div><div class="kpi-sub">${sub} · ${pct(v)}</div></div>`; };
  cobEl("cobKpis").innerHTML = `
    <div class="card"><div class="card-kicker">Total a cobrar</div><div class="kpi-value">${escapeHtml(cobMoney(total))}</div>
      <div class="kpi-sub">${numberFormatter.format(facts.length)} facturas · ${numberFormatter.format(clientes.length)} clientes${escapeHtml(otrasTxt)}</div></div>
    ${tramo("Más de 30 días", "31 a 60 días", 31, 60)}
    ${tramo("Más de 60 días", "61 a 90 días", 61, 90)}
    ${tramo("Más de 90 días", "91 a 180 días", 91, 180)}
    ${tramo("Más de 180 días", "181 días o más", 181, Infinity)}`;
}
function cobAging(facts){
  const ars = facts.filter(f => f.moneda === "ARS");
  const sums = COB_BUCKETS.map(b => ars.filter(f => f.dias >= b.min && f.dias <= b.max).reduce((s, f) => s + f.pendiente, 0));
  const tot = sums.reduce((a, b) => a + b, 0) || 1;
  const active = i => cob.min === COB_BUCKETS[i].min && cob.max === COB_BUCKETS[i].max;
  cobEl("cobAging").innerHTML = COB_BUCKETS.map((b, i) => sums[i] ? `<div data-b="${i}" class="${active(i) ? "is-active" : ""}" title="${escapeHtml(`${b.t}: ${cobMoney(sums[i])}`)}" style="width:${sums[i] / tot * 100}%;background:${b.c}"><span>${escapeHtml(cobMoney(sums[i]))}</span></div>` : "").join("");
  // v8.3: el importe va adentro del color; si no entra, no se muestra (está en la leyenda de abajo)
  requestAnimationFrame(() => cobEl("cobAging").querySelectorAll("span").forEach(sp => {
    sp.style.visibility = sp.scrollWidth > sp.parentElement.clientWidth - 12 ? "hidden" : "";
  }));
  cobEl("cobAgingLegend").innerHTML = COB_BUCKETS.map((b, i) => `<button type="button" data-b="${i}" class="${active(i) ? "is-active" : ""}"><span style="background:${b.c}"></span>${b.t} <b>${escapeHtml(cobMoney(sums[i]))}</b></button>`).join("");
  document.querySelectorAll("#cobAging [data-b], #cobAgingLegend [data-b]").forEach(el => el.addEventListener("click", () => {
    const b = COB_BUCKETS[Number(el.dataset.b)];
    if (cob.min === b.min && cob.max === b.max) { cob.min = 0; cob.max = Infinity; } else { cob.min = b.min; cob.max = b.max; }
    cobSyncEdadChips(); cobRender();
  }));
}
function cobSyncEdadChips(){
  document.querySelectorAll("#cobEdad .range-btn").forEach(b => b.classList.toggle("is-active", Number(b.dataset.min) === cob.min && cob.max === Infinity));
}
function cobFillSelect(sel, items, first){
  const cur = sel.value;
  sel.innerHTML = `<option value="">${first}</option>` + items.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");
  sel.value = items.includes(cur) ? cur : "";
}
function cobUpdatedText(){
  const el = cobEl("cobUpdated");
  if (!cob.savedAt) { el.textContent = cob.loading ? "Cargando…" : "—"; return; }
  el.textContent = `Datos de YiQi del ${new Date(cob.savedAt).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })} (${fmtAgo(Date.now() - cob.savedAt)}) · se actualizan solos cada 3 horas`;
}
function cobRender(){
  cobUpdatedText();
  if (!cob.data) return;
  if (cob.detalle) return cobRenderDetalle();
  const facts = cobFiltered();
  const clientes = cobClientes(facts);
  cobKpis(facts, clientes);
  cobAging(cob.data.facturas.filter(f =>
    !cob.vend.size || cob.vend.has(f.vendedor)));
  const wrap = cobEl("cobTableWrap");
  const cols = COB_COLS[cob.view];
  if (cob.view === "clientes") {
    cob.lastRows = cobRenderTable(wrap, "clientes", cols, clientes, cobFoot(cols, clientes, `Total (${clientes.length} clientes)`), c => cobOpenDetalle(c.id));
  } else if (cob.view === "facturas") {
    cob.lastRows = cobRenderTable(wrap, "facturas", cols, facts, cobFoot(cols, facts, `Total (${facts.length} facturas)`), f => facDetOpen(f));
    wrap.querySelectorAll(".cob-link").forEach(a => a.addEventListener("click", e => { e.preventDefault(); cobOpenDetalle(a.dataset.cli); }));
  } else {
    const vend = cobVendedores(facts);
    cob.lastRows = cobRenderTable(wrap, "vendedores", cols, vend, cobFoot(cols, vend, "Total"), v => {
      cob.vend.clear(); cob.vend.add(v.vendedor); cobVendRender(); cobSetView("clientes");
    });
  }
}
function cobSetView(v){
  cob.view = v;
  document.querySelectorAll("#cobViewTabs .range-btn").forEach(b => b.classList.toggle("is-active", b.dataset.view === v));
  cobRender();
}

/* ---------- Estado de cuenta de un cliente ---------- */
function cobOpenDetalle(id){
  cob.detalle = String(id);
  cob.scrollY = window.scrollY;   // v8.0: al volver se queda donde estaba
  cobEl("cobLista").classList.add("hidden");
  cobEl("cobDetalle").classList.remove("hidden");
  window.scrollTo({ top: 0 });
  cobRenderDetalle();
}
function cobCloseDetalle(){
  cob.detalle = null;
  cobEl("cobDetalle").classList.add("hidden");
  cobEl("cobLista").classList.remove("hidden");
  cobRender();
  const y = cob.scrollY || 0;
  requestAnimationFrame(() => window.scrollTo({ top: y }));
}
function cobClienteData(id){
  const facts = cob.data.facturas.filter(f => f.clienteId === id);
  const c = cobClientes(facts)[0] || { id, cliente: "", facturas: 0, pendiente: 0, mas30: 0, favor: cob.data.saldos.get(id) || 0, pago: cob.data.pagos.get(id) || null, otras: {} };
  const info = (clientesStore.list || []).find(x => String(x.id) === id);
  if (info) { c.cuit = c.cuit || info.cuit; c.iva = info.iva; c.cliente = c.cliente || info.razon; }
  return { c, facts };
}
function cobRenderDetalle(){
  const box = cobEl("cobDetalle");
  const { c, facts } = cobClienteData(cob.detalle);
  const notas = cob.notas[cob.detalle] || [];
  const etqOpts = (etq.items || []).map(e => `<option value="${escapeHtml(e.id)}" ${e.id === cob.pieId ? "selected" : ""}>${escapeHtml(e.titulo)}</option>`).join("");
  const datos = [c.cuit && `CUIT ${c.cuit}`, c.iva, c.vendedor && `Vendedor: ${c.vendedor}`, c.condicion && `Condición: ${c.condicion}`].filter(Boolean).join(" · ");
  box.innerHTML = `
    <div class="page-head">
      <div><div class="page-kicker"><a href="#" id="cobBack" class="cob-crumb">Cobranzas › Cuentas corrientes</a></div>
        <h1 class="page-title">${escapeHtml(c.cliente || "(cliente)")}</h1>
        <div class="cob-sub">${escapeHtml(datos)}</div></div>
      <div class="page-head-actions">
        <button class="btn btn-secondary" id="cobBackBtn" type="button">‹ Volver</button>
        <a class="btn btn-secondary" href="${yiqiCtaCteUrl(cob.detalle)}" target="_blank" rel="noopener" title="Abrir el reporte de cuenta corriente de este cliente en YiQi">Cuenta corriente en YiQi ↗</a>
        <button class="btn btn-secondary" id="cobWaBtn" type="button">Copiar para WhatsApp</button>
        <button class="btn btn-secondary" id="cobDetExcel" type="button">Excel</button>
        <button class="btn btn-new" id="cobDetPdf" type="button">PDF estado de cuenta</button>
      </div>
    </div>
    <div class="kpi-grid">
      <div class="card"><div class="card-kicker">Saldo pendiente</div><div class="kpi-value">${escapeHtml(cobMoney(c.pendiente))}</div><div class="kpi-sub">${c.facturas} facturas${escapeHtml(Object.entries(c.otras || {}).map(([m, v]) => ` · + ${cobMoney(v, m)}`).join(""))}</div></div>
      <div class="card"><div class="card-kicker">Más de 30 días</div><div class="kpi-value cob-red">${escapeHtml(cobMoney(c.mas30))}</div><div class="kpi-sub">La más antigua tiene ${c.dias || 0} días</div></div>
      <div class="card"><div class="card-kicker">Saldo a favor sin imputar</div><div class="kpi-value cob-green">${escapeHtml(cobMoney(c.favor))}</div><div class="kpi-sub">${c.favor > 0 ? `Saldo neto ${escapeHtml(cobMoney(c.pendiente - c.favor))} · aplicarlo en YiQi` : "No tiene pagos sin aplicar"}</div></div>
      <div class="card"><div class="card-kicker">Último pago</div><div class="kpi-value">${c.pago ? cobDate(c.pago) : "—"}</div><div class="kpi-sub">${c.pago ? cobHaceDias(c.pago) : "Sin recibos en los últimos 2 años"}</div></div>
    </div>
    <div class="cob-det-grid">
      <div class="panel"><div class="panel-head"><div class="panel-title">Facturas con saldo</div>
        <label class="cob-pie">Texto al pie del PDF <select class="ds-input" id="cobPie"><option value="">(ninguno)</option>${etqOpts}</select></label></div>
        <div class="cob-table-wrap" id="cobDetTable"></div></div>
      <div class="panel cob-notas"><div class="panel-head"><div class="panel-title">Seguimiento de cobranza</div></div>
        <textarea class="ds-input" id="cobNotaTxt" rows="3" placeholder="Anotá un llamado, una promesa de pago…"></textarea>
        <div class="cob-nota-row"><label>Recordarme el <input class="ds-input" type="date" id="cobNotaFecha"></label>
          <button class="btn btn-secondary" id="cobNotaAdd" type="button">Agregar nota</button></div>
        <div class="cob-nota-list">${notas.length ? notas.map(n => `<div class="cob-nota ${n.recordar ? "has-rec" : ""}">
            <div class="cob-muted cob-small">${new Date(n.fecha).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })} · ${escapeHtml(n.autor || "")}
              <button type="button" class="cob-nota-del" data-id="${escapeHtml(n.id)}" title="Borrar nota">✕</button></div>
            ${n.recordar ? `<div class="cob-small"><b>⏰ Recordatorio: ${escapeHtml(n.recordar.split("-").reverse().join("/"))}</b></div>` : ""}
            <div>${escapeHtml(n.texto).replace(/\n/g, "<br>")}</div></div>`).join("") : `<div class="cob-muted cob-small">Todavía no hay notas para este cliente.</div>`}</div>
      </div>
    </div>`;
  const cols = COB_COLS.detalle;
  cob.detRows = cobRenderTable(cobEl("cobDetTable"), "detalle", cols, facts, cobFoot(cols, facts, "Total"), f => facDetOpen(f));   // v8.8: ver artículos
  const back = e => { e?.preventDefault(); cobCloseDetalle(); };
  cobEl("cobBack").addEventListener("click", back);
  cobEl("cobBackBtn").addEventListener("click", back);
  cobEl("cobWaBtn").addEventListener("click", () => cobCopyWhatsapp(c, cob.detRows));
  cobEl("cobDetExcel").addEventListener("click", () => cobExcelDetalle(c, cob.detRows).catch(e => alert(e.message)));
  cobEl("cobDetPdf").addEventListener("click", () => cobPdfDetalle(c, cob.detRows).catch(e => alert(e.message)));
  cobEl("cobPie").addEventListener("change", e => { cob.pieId = e.target.value; });
  cobEl("cobNotaAdd").addEventListener("click", () => cobNotaSave({ accion: "agregar", clienteId: cob.detalle, texto: cobEl("cobNotaTxt").value, recordar: cobEl("cobNotaFecha").value }));
  box.querySelectorAll(".cob-nota-del").forEach(b => b.addEventListener("click", () => {
    if (confirm("¿Borrar esta nota?")) cobNotaSave({ accion: "borrar", clienteId: cob.detalle, id: b.dataset.id });
  }));
}

/* ---------- Notas ---------- */
async function cobNotasLoad(){
  try {
    const r = await srvFetch("/notas");
    if (!r.ok) return;
    const j = await r.json();
    cob.notas = j.notas || {}; cob.notasLoaded = true;
    cobRender();
  } catch {}
}
async function cobNotaSave(body){
  if (body.accion === "agregar" && !String(body.texto || "").trim()) { alert("Escribí la nota primero."); return; }
  const btn = cobEl("cobNotaAdd"); if (btn) btn.disabled = true;
  try {
    const r = await srvFetch("/notas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (r.status === 404) throw new Error("Hay que actualizar el conector de Cloudflare para guardar notas.");
    if (!r.ok) throw new Error(j.error || `Error HTTP ${r.status}`);
    cob.notas = j.notas || {};
    cobRender();
  } catch (error) {
    if (error instanceof SessionExpired) { clearSession(); showLogin("La sesión venció. Volvé a ingresar."); return; }
    alert(`No se pudo guardar la nota: ${error.message}`);
  } finally { if (btn) btn.disabled = false; }
}

/* ---------- Exportar ---------- */
const cobFileSafe = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w .,-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
function cobCellValue(c, r){
  if (["emision", "vence", "pago"].includes(c.k)) { const d = r[c.k]; return d ? d.toLocaleDateString("es-AR") : ""; }
  if (c.k === "recordar") return [r.recordar ? `Recordar ${r.recordar.split("-").reverse().join("/")}` : "", r.nota?.texto || ""].filter(Boolean).join(" · ");
  const v = r[c.k];
  return v === null || v === undefined ? "" : v;
}
const COB_MONEY_KEYS = new Set(["pendiente", "mas30", "mas90", "favor", "neto", "total", "cobrado"]);
async function cobExcel(name, title, cols, rows, extraTop = []){
  const XLSX = await cotLoadXlsx();
  const head = cols.map(c => c.t);
  const aoa = [...extraTop, head, ...rows.map(r => cols.map(c => cobCellValue(c, r)))];
  const totals = cols.map((c, i) => i === 0 ? "Total" : COB_MONEY_KEYS.has(c.k) ? cobSum(rows, c.k) : (c.k === "facturas" || c.k === "clientes") ? rows.reduce((s, r) => s + (r[c.k] || 0), 0) : "");
  aoa.push(totals);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = cols.map(c => ({ wch: Math.max(10, Math.round((c.w || 120) / 8)) }));
  const start = extraTop.length + 1;
  cols.forEach((c, ci) => {
    if (!COB_MONEY_KEYS.has(c.k)) return;
    for (let ri = start; ri < aoa.length; ri++) {
      const cell = ws[XLSX.utils.encode_cell({ r: ri, c: ci })];
      if (cell && typeof cell.v === "number") cell.z = '"$" #,##0.00';
    }
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, title.slice(0, 31));
  XLSX.writeFile(wb, `${name} - ${new Date().toISOString().slice(0, 10)}.xlsx`);
}
function cobFiltrosTxt(){
  const f = [];
  if (cob.search) f.push(`Búsqueda: "${cob.search}"`);
  if (cob.vend.size) f.push(`${cob.vend.size === 1 ? "Vendedor" : "Vendedores"}: ${[...cob.vend].join(", ")}`);
  if (cob.min > 0 || cob.max !== Infinity) f.push(cob.max === Infinity ? `Más de ${cob.min - 1} días` : `${cob.min}–${cob.max} días`);
  if (cob.favor) f.push("Con saldo a favor");
  return f.join(" · ");
}
function cobPdfList(){
  return cobPdfTable({
    title: { clientes: "Cuentas corrientes por cliente", facturas: "Facturas con saldo pendiente", vendedores: "Saldos por vendedor" }[cob.view],
    subtitle: `Al ${new Date().toLocaleDateString("es-AR")}${cobFiltrosTxt() ? " · " + cobFiltrosTxt() : ""}`,
    cols: COB_COLS[cob.view].filter(c => c.k !== "recordar"), rows: cob.lastRows || [],
    file: `Cuentas corrientes - ${new Date().toISOString().slice(0, 10)}.pdf`
  });
}
/* PDF apaisado de una tabla (lo usan Cuentas corrientes y Facturas de venta) */
async function cobPdfTable({ title, subtitle, cols, rows, file }){
  const JsPDF = await presLoadPdf(); const logo = await presLoadLogo();
  const pdf = new JsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  const W = pdf.internal.pageSize.getWidth(), M = 12, cyan = [27, 96, 171], gray = [100, 110, 120];
  if (logo) pdf.addImage(logo, "PNG", M, 9, 11 * PRES_LOGO.ratio, 11, "dentalab-logo", "FAST");
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(15); pdf.setTextColor(...cyan);
  pdf.text(title, W - M, 15, { align: "right" });
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(9); pdf.setTextColor(...gray);
  pdf.text(subtitle, W - M, 20.5, { align: "right" });
  const txt = (c, r) => { const v = cobCellValue(c, r); return COB_MONEY_KEYS.has(c.k) ? (v ? cobMoney(v, r.moneda) : "—") : c.k === "dias" ? `${v} d` : String(v); };
  const body = rows.map(r => cols.map(c => txt(c, r)));
  const foot = [cols.map((c, i) => i === 0 ? "Total" : COB_MONEY_KEYS.has(c.k) ? cobMoney(cobSum(rows, c.k)) : (c.k === "facturas" || c.k === "clientes") ? String(rows.reduce((s, r) => s + (r[c.k] || 0), 0)) : "")];
  const right = {}; cols.forEach((c, i) => { if (c.num) right[i] = { halign: "right" }; });
  pdf.autoTable({ startY: 26, head: [cols.map(c => c.t)], body, foot, margin: { left: M, right: M }, columnStyles: right,
    styles: { font: "helvetica", fontSize: 8, cellPadding: 1.6 }, headStyles: { fillColor: cyan, textColor: 255 },
    footStyles: { fillColor: [235, 240, 246], textColor: 20, fontStyle: "bold" }, alternateRowStyles: { fillColor: [246, 248, 250] },
    didParseCell: d => { if ((d.section === "head" || d.section === "foot") && cols[d.column.index]?.num) d.cell.styles.halign = "right"; } });
  const pages = pdf.internal.getNumberOfPages();
  for (let i = 1; i <= pages; i++) { pdf.setPage(i); pdf.setFontSize(8); pdf.setTextColor(...gray); pdf.text(`Página ${i} de ${pages}`, W - M, pdf.internal.pageSize.getHeight() - 6, { align: "right" }); }
  pdf.save(file);
}
async function cobPdfDetalle(c, rows){
  const JsPDF = await presLoadPdf(); const logo = await presLoadLogo();
  const pdf = new JsPDF({ unit: "mm", format: "a4" });
  const W = pdf.internal.pageSize.getWidth(), H = pdf.internal.pageSize.getHeight(), M = 14;
  const cyan = [27, 96, 171], gray = [100, 110, 120], dark = [25, 30, 35];
  if (logo) pdf.addImage(logo, "PNG", M, 11.5, 13 * PRES_LOGO.ratio, 13, "dentalab-logo", "FAST");
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(15); pdf.setTextColor(...cyan);
  pdf.text("ESTADO DE CUENTA", W - M, 20, { align: "right" });
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(10); pdf.setTextColor(...gray);
  pdf.text(`Al ${new Date().toLocaleDateString("es-AR")}`, W - M, 25.5, { align: "right" });
  pdf.setDrawColor(...cyan); pdf.setLineWidth(0.6); pdf.line(M, 30, W - M, 30);
  let y = 38;
  pdf.setFontSize(10);
  [["Cliente", c.cliente], c.cuit && ["CUIT/Documento", c.cuit], c.iva && ["Condición IVA", c.iva]].filter(Boolean).forEach(([k, v]) => {
    pdf.setFont("helvetica", "bold"); pdf.setTextColor(...dark); pdf.text(`${k}:`, M, y);
    pdf.setFont("helvetica", "normal"); pdf.text(String(v), M + 34, y); y += 5.5;
  });
  const body = rows.map(f => [cobDate(f.emision), f.comp, cobDate(f.vence), String(f.dias), cobMoney(f.total, f.moneda), cobMoney(f.cobrado, f.moneda), cobMoney(f.pendiente, f.moneda)]);
  const R = { halign: "right" };
  pdf.autoTable({ startY: y + 2, head: [["Emisión", "Comprobante", "Vencimiento", "Días", "Total", "Cobrado", "Pendiente"]], body, margin: { left: M, right: M },
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 2, textColor: dark, lineColor: [225, 230, 235], lineWidth: 0.1 },
    headStyles: { fillColor: cyan, textColor: 255, fontStyle: "bold" }, alternateRowStyles: { fillColor: [246, 248, 250] },
    columnStyles: { 3: R, 4: R, 5: R, 6: { ...R, fontStyle: "bold" } },
    didParseCell: d => { if (d.section === "head" && d.column.index >= 3) d.cell.styles.halign = "right"; } });
  let yy = pdf.lastAutoTable.finalY + 8;
  if (yy > H - 45) { pdf.addPage(); yy = 20; }
  const pend = rows.filter(f => f.moneda === "ARS").reduce((s, f) => s + f.pendiente, 0);
  const lines = [["Saldo pendiente", cobMoney(pend), dark, true]];
  Object.entries(c.otras || {}).forEach(([m, v]) => lines.push([`Pendiente en ${m}`, cobMoney(v, m), dark, false]));
  if (c.favor > 0) {
    lines.push(["Pagos a cuenta sin aplicar", `- ${cobMoney(c.favor)}`, [46, 125, 50], false]);
    lines.push(["Saldo neto", cobMoney(pend - c.favor), dark, true]);
  }
  lines.forEach(([k, v, col, bold]) => {
    pdf.setFont("helvetica", bold ? "bold" : "normal"); pdf.setFontSize(bold ? 11.5 : 10); pdf.setTextColor(...(bold ? dark : gray));
    pdf.text(k, W - M - 55, yy, { align: "right" }); pdf.setTextColor(...col); pdf.text(v, W - M, yy, { align: "right" }); yy += 6.5;
  });
  const pie = etqById(cob.pieId)?.cuerpo || "";
  if (pie) {
    yy += 4;
    const ls = pdf.splitTextToSize(pie, W - 2 * M);
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(9.5); pdf.setTextColor(...dark);
    ls.forEach(l => { if (yy > H - 14) { pdf.addPage(); yy = 20; } pdf.text(l, M, yy); yy += 4.6; });
  }
  const pages = pdf.internal.getNumberOfPages();
  for (let i = 1; i <= pages; i++) { pdf.setPage(i); pdf.setFontSize(8); pdf.setTextColor(...gray); pdf.text(`Página ${i} de ${pages}`, W - M, H - 8, { align: "right" }); }
  pdf.save(`Estado de cuenta - ${cobFileSafe(c.cliente)} - ${new Date().toISOString().slice(0, 10)}.pdf`);
}
function cobExcelDetalle(c, rows){
  return cobExcel(`Estado de cuenta - ${cobFileSafe(c.cliente)}`, "Estado de cuenta", COB_COLS.detalle, rows,
    [[`Estado de cuenta: ${c.cliente}`], [[c.cuit && `CUIT ${c.cuit}`, c.iva].filter(Boolean).join(" · ")], [`Al ${new Date().toLocaleDateString("es-AR")}`], []]);
}
async function cobCopyWhatsapp(c, rows){
  const pend = rows.filter(f => f.moneda === "ARS").reduce((s, f) => s + f.pendiente, 0);
  const txt = [`Hola! Te paso el estado de cuenta de *${c.cliente}* al ${new Date().toLocaleDateString("es-AR")}:`, "",
    ...rows.map(f => `• ${f.comp} del ${cobDate(f.emision)}: ${cobMoney(f.pendiente, f.moneda)}`), "",
    `*Total pendiente: ${cobMoney(pend)}*`,
    ...(c.favor > 0 ? [`Tenés pagos a cuenta por ${cobMoney(c.favor)} que vamos a aplicar: saldo neto ${cobMoney(pend - c.favor)}.`] : []),
    "", "Cualquier consulta, avisanos. ¡Gracias!"].join("\n");
  try { await navigator.clipboard.writeText(txt); alert("Copiado. Pegalo en WhatsApp."); }
  catch { prompt("Copiá este texto:", txt); }
}

/* ---------- Carga ---------- */
function cobApply(raw, fecha){
  cob.raw = raw; cob.savedAt = fecha; cob.loaded = true; cob.error = "";
  cob.data = cobBuild(raw);
  [...cob.vend].forEach(v => { if (!cob.data.vendedores.includes(v)) cob.vend.delete(v); });
  cobVendRender();
  cobMsg("");
  cobRender();
}
async function cobSyncFromServer(force = false){
  if (cob.syncing || cob.loading) return false;
  const meta = await srvMeta(force);
  const info = meta && meta.cobranzas;
  if (!info || !(Number(info.fecha) > cob.savedAt)) return false;
  cob.syncing = true;
  try {
    const data = await srvGet("cobranzas");
    if (!data || !Array.isArray(data.rows) || cob.loading) return false;
    const fecha = Number(data.fecha) || Number(info.fecha);
    if (fecha <= cob.savedAt) return false;
    cobApply(data, fecha);
    cacheSet("cobranzas", { ...data, fecha });
    return true;
  } catch (error) {
    if (error instanceof SessionExpired) { clearSession(); showLogin("La sesión venció. Volvé a ingresar."); }
    return false;
  } finally { cob.syncing = false; }
}
async function cobFetchParte(parte, onPage){
  const first = await fetchSmartiePage(COB_ENDPOINT, 1, null, `&parte=${parte}`);
  const size = Number(first.pageSize) || first.data.length || 1;
  const pages = Math.max(1, Math.ceil((Number(first.total) || first.data.length) / size));
  const rows = [...first.data]; onPage();
  for (let p = 2; p <= pages; p++) { rows.push(...(await fetchSmartiePage(COB_ENDPOINT, p, null, `&parte=${parte}`)).data); onPage(); }
  return rows;
}
async function cobRefresh(){
  if (cob.loading) return;
  cob.loading = true;
  const btn = cobEl("cobRefreshBtn");
  btn.disabled = true;
  let done = 0;
  const step = () => { done++; btn.textContent = `Actualizando… (${done})`; };
  if (!cob.data) cobMsg("Trayendo de YiQi las facturas con saldo, los saldos a favor y los últimos pagos… (puede tardar un minuto)");
  try {
    const parts = {};
    for (const p of COB_PARTES) parts[p] = await cobFetchParte(p, step);
    const fecha = Date.now();
    const raw = { rows: [...parts.emitidas, ...parts.entregadas], saldos: parts.saldos, pagos: parts.pagos, fecha };
    cob.loading = false;
    cobApply(raw, fecha);
    cacheSet("cobranzas", raw);
    srvPut("cobranzas", raw);
  } catch (error) {
    if (error instanceof SessionExpired) { clearSession(); showLogin("La sesión venció. Volvé a ingresar."); return; }
    const old = /ruta|not found|404|parte desconocida/i.test(String(error.message));
    cob.error = old ? "Para ver las cuentas corrientes hay que actualizar el conector de Cloudflare (pegar el código nuevo y Deploy)." : `No se pudo actualizar: ${error.message}`;
    cobMsg(escapeHtml(cob.error), "error");
  } finally {
    cob.loading = false;
    btn.disabled = false; btn.textContent = "Actualizar desde YiQi";
    cobUpdatedText();
  }
}

const cobranzasModule = {
  async ensureLoaded(){
    if (!clientesStore.loaded) clientesStore.ensureLoaded();
    if (typeof etqEnsure === "function") etqEnsure();
    if (!cob.notasLoaded) cobNotasLoad();
    if (cob.loaded || cob.loading || cob.syncing) { cobRender(); return; }
    const saved = await cacheGet("cobranzas");
    if (saved && Array.isArray(saved.rows)) {
      cobApply(saved, Number(saved.fecha) || 0);
      if (!(await cobSyncFromServer()) && Date.now() - cob.savedAt >= COB_MAX_AGE) cobRefresh();
      return;
    }
    cobMsg("Trayendo los datos guardados…");
    if (await cobSyncFromServer()) return;
    cobRefresh();
  },
  reset(){
    Object.assign(cob, { raw: null, data: null, savedAt: 0, loaded: false, detalle: null, notas: {}, notasLoaded: false });
  }
};

/* ---------- Eventos ---------- */
cobEl("cobRefreshBtn").addEventListener("click", cobRefresh);
cobEl("cobExcelBtn").addEventListener("click", () => {
  const titles = { clientes: "Por cliente", facturas: "Por factura", vendedores: "Por vendedor" };
  return cobExcel("Cuentas corrientes", titles[cob.view], COB_COLS[cob.view], cob.lastRows || [],
    [[`Cuentas corrientes · ${titles[cob.view]}`], [`Al ${new Date().toLocaleDateString("es-AR")}${cobFiltrosTxt() ? " · " + cobFiltrosTxt() : ""}`], []])
    .catch(e => alert(e.message));
});
cobEl("cobPdfBtn").addEventListener("click", () => cobPdfList().catch(e => alert(e.message)));
cobEl("cobViewTabs").addEventListener("click", e => { const b = e.target.closest("[data-view]"); if (b) cobSetView(b.dataset.view); });
cobEl("cobSearch").addEventListener("input", e => { cob.search = e.target.value; cobRender(); });
/* v8.3: vendedores con selección múltiple (v8.8: componente común multiSelect de core.js) */
const cobVendMS = multiSelect(cobEl("cobVendWrap"), { set: cob.vend, allText: "Todos los vendedores", manyText: n => `${n} vendedores`,
  title: "Elegí uno o varios vendedores", onChange: () => cobRender() });
function cobVendRender(){ cobVendMS.render(cob.data ? cob.data.vendedores : []); }
cobVendRender();
cobEl("cobFavor").addEventListener("change", e => { cob.favor = e.target.checked; cobRender(); });
cobEl("cobEdad").addEventListener("click", e => {
  const b = e.target.closest("[data-min]"); if (!b) return;
  cob.min = Number(b.dataset.min); cob.max = Infinity; cobSyncEdadChips(); cobRender();
});
/* Cuando llegan los clientes (CUIT, condición IVA), se rearman los datos */
let cobCliCount = 0;
clientesStore.listeners.add(() => {
  if (!cob.raw || clientesStore.loading || clientesStore.list.length === cobCliCount) return;
  cobCliCount = clientesStore.list.length;
  cob.data = cobBuild(cob.raw);
  if (!cobEl("view-cobranzas").classList.contains("hidden")) cobRender();
});
setInterval(async () => {
  if (!cob.loaded || !getAuthToken()) return;
  if (!(await cobSyncFromServer())) cobUpdatedText();
}, 10 * 60000);
