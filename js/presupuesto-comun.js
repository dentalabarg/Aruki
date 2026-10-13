/* ============================================================
   PRESUPUESTOS — funciones compartidas (Cotizaciones y Manual)
   Excel, PDF y envío del pedido a YiQi.
   doc = { cliente: {nombre, cuit, iva}, lista, disp, conSolicitado, conExtra,
           rows: [{ solicitado, sku, nombre, extra, marca, cantidad, dispTxt, precio }] }
   ============================================================ */
function presLoadScript(src){
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = () => { s.remove(); reject(new Error("No se pudo cargar una librería. Revisá la conexión a internet.")); };
    document.head.appendChild(s);
  });
}
let presPdfPromise = null;
function presLoadPdf(){
  if (window.jspdf?.jsPDF?.API?.autoTable) return Promise.resolve(window.jspdf.jsPDF);
  if (!presPdfPromise) {
    presPdfPromise = presLoadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js")
      .then(() => presLoadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js"))
      .then(() => window.jspdf.jsPDF)
      .catch(e => { presPdfPromise = null; throw e; });
  }
  return presPdfPromise;
}

function presFileName(doc, ext){
  // Sin tildes ni símbolos raros: algunos navegadores cambian el nombre a "download" si los tiene
  const safe = (doc.cliente.nombre || "cliente").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w .,-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
  return `Presupuesto - ${safe} - ${new Date().toISOString().slice(0, 10)}.${ext}`;
}
function presDownload(blob, name){
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
const presSub = r => r.precio !== null && r.precio !== undefined ? r.precio * (Number(r.cantidad) || 0) : null;
const presMoney = n => priceFormatter.format(n).replace(/^\$\s?/, "$ ");

/* Stock real (Depósito 1 - Local + Depósito Central) para la columna opcional.
   En rojo y remarcado si no alcanza para la cantidad pedida. */
function presStockHtml(item, cantidad){
  if (!item || item.stock === null || item.stock === undefined) return "—";
  const n = Number(item.stock) || 0;
  const falta = n < (Number(cantidad) || 0);
  return `<span class="stock-num ${falta ? "is-short" : ""}"${falta ? ` title="No alcanza: hay ${escapeHtml(decimalFormatter.format(n))} y se piden ${escapeHtml(decimalFormatter.format(Number(cantidad) || 0))}"` : ""}>${escapeHtml(decimalFormatter.format(n))}</span>`;
}

/* ---------- Excel ---------- */
async function presExcel(doc){
  const XLSX = await cotLoadXlsx();
  const cols = [];
  if (doc.conSolicitado) cols.push({ t: "Solicitado", w: 40, v: r => r.solicitado || "" });
  cols.push({ t: "SKU", w: 14, v: r => r.sku || "" });
  cols.push({ t: "Nombre del artículo", w: 52, v: r => r.nombre || "" });
  if (doc.conExtra) cols.push({ t: "Texto adicional", w: 28, v: r => r.extra || "" });
  cols.push({ t: "Marca", w: 18, v: r => r.marca || "" });
  const qtyIdx = cols.length;
  cols.push(doc.disp ? { t: "Disponibilidad", w: 16, v: r => r.dispTxt || "" } : { t: "Cantidad", w: 10, v: r => Number(r.cantidad) || 0 });
  const priceIdx = cols.length;
  cols.push({ t: "Precio unitario", w: 16, v: r => r.precio ?? "", money: true });
  const L = i => XLSX.utils.encode_col(i);

  const aoa = [
    ["Presupuesto Dentalab"],
    ["Cliente", doc.cliente.nombre],
    ...(doc.cliente.cuit ? [["CUIT/Documento", doc.cliente.cuit]] : []),
    ...(doc.cliente.iva ? [["Condición IVA", doc.cliente.iva]] : []),
    ["Fecha", new Date().toLocaleDateString("es-AR")],
    ["Lista de precios", doc.lista],
    [],
    [...cols.map(c => c.t), ...(doc.disp ? [] : ["Subtotal"])]
  ];
  const first = aoa.length + 1;
  doc.rows.forEach((r, i) => {
    const n = first + i;
    const line = cols.map(c => c.v(r));
    if (!doc.disp) {
      const sub = presSub(r);
      line.push(r.precio !== null && r.precio !== undefined ? { t: "n", f: `${L(qtyIdx)}${n}*${L(priceIdx)}${n}`, v: sub } : "");
    }
    aoa.push(line);
  });
  const last = first + doc.rows.length - 1;
  const subIdx = cols.length;
  if (!doc.disp) {
    const total = doc.rows.reduce((s, r) => s + (presSub(r) || 0), 0);
    aoa.push([]);
    const tot = new Array(subIdx + 1).fill("");
    tot[subIdx - 1] = "Total";
    tot[subIdx] = { t: "n", f: `SUM(${L(subIdx)}${first}:${L(subIdx)}${last})`, v: total };
    aoa.push(tot);
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [...cols.map(c => ({ wch: c.w })), { wch: 16 }];
  const fmt = '"$" #,##0.00';
  for (let r = first; r <= last + 2; r++) {
    [L(priceIdx), L(subIdx)].forEach(c => { const cell = ws[`${c}${r}`]; if (cell && typeof cell.v === "number") cell.z = fmt; });
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Presupuesto");
  const data = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  presDownload(new Blob([data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), presFileName(doc, "xlsx"));
}

/* ---------- PDF ---------- */
async function presPdf(doc){
  const JsPDF = await presLoadPdf();
  const pdf = new JsPDF({ unit: "mm", format: "a4" });
  const W = pdf.internal.pageSize.getWidth();
  const M = 14;
  const cyan = [8, 145, 178], gray = [100, 110, 120], dark = [25, 30, 35];

  pdf.setFont("helvetica", "bold"); pdf.setFontSize(20); pdf.setTextColor(...dark);
  pdf.text("Dentalab", M, 20);
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(10); pdf.setTextColor(...gray);
  pdf.text("Insumos odontológicos", M, 25.5);
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(15); pdf.setTextColor(...cyan);
  pdf.text("PRESUPUESTO", W - M, 20, { align: "right" });
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(10); pdf.setTextColor(...gray);
  pdf.text(`Fecha: ${new Date().toLocaleDateString("es-AR")}`, W - M, 25.5, { align: "right" });
  pdf.setDrawColor(...cyan); pdf.setLineWidth(0.6); pdf.line(M, 30, W - M, 30);

  let y = 38;
  const info = [["Cliente", doc.cliente.nombre]];
  if (doc.cliente.cuit) info.push(["CUIT/Documento", doc.cliente.cuit]);
  if (doc.cliente.iva) info.push(["Condición IVA", doc.cliente.iva]);
  info.push(["Lista de precios", doc.lista]);
  pdf.setFontSize(10);
  info.forEach(([k, v]) => {
    pdf.setFont("helvetica", "bold"); pdf.setTextColor(...dark); pdf.text(`${k}:`, M, y);
    pdf.setFont("helvetica", "normal"); pdf.text(String(v || "—"), M + 34, y);
    y += 5.5;
  });

  const head = ["SKU", "Artículo", "Marca", doc.disp ? "Disponibilidad" : "Cant.", "Precio unit.", ...(doc.disp ? [] : ["Subtotal"])];
  const body = doc.rows.map(r => {
    const name = r.extra ? `${r.nombre || ""}\n${r.extra}` : (r.nombre || "");
    const sub = presSub(r);
    return [r.sku || "", name, r.marca || "", doc.disp ? (r.dispTxt || "") : decimalFormatter.format(Number(r.cantidad) || 0),
      r.precio !== null && r.precio !== undefined ? presMoney(r.precio) : "—",
      ...(doc.disp ? [] : [sub !== null ? presMoney(sub) : "—"])];
  });
  const right = { halign: "right" };
  pdf.autoTable({
    startY: y + 2, head: [head], body, margin: { left: M, right: M },
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 2, textColor: dark, lineColor: [225, 230, 235], lineWidth: 0.1 },
    headStyles: { fillColor: cyan, textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [246, 248, 250] },
    columnStyles: doc.disp
      ? { 0: { cellWidth: 24 }, 2: { cellWidth: 26 }, 3: { cellWidth: 28 }, 4: { cellWidth: 26, ...right } }
      : { 0: { cellWidth: 24 }, 2: { cellWidth: 24 }, 3: { cellWidth: 14, ...right }, 4: { cellWidth: 25, ...right }, 5: { cellWidth: 27, ...right } },
    didParseCell: d => { if (d.section === "head" && d.column.index >= 3) d.cell.styles.halign = "right"; }
  });

  let endY = pdf.lastAutoTable.finalY + 8;
  if (!doc.disp) {
    const total = doc.rows.reduce((s, r) => s + (presSub(r) || 0), 0);
    if (endY > pdf.internal.pageSize.getHeight() - 20) { pdf.addPage(); endY = 20; }
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(12); pdf.setTextColor(...dark);
    pdf.text(`Total: ${presMoney(total)}`, W - M, endY, { align: "right" });
  }
  const pages = pdf.internal.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i);
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(8); pdf.setTextColor(...gray);
    pdf.text(`Página ${i} de ${pages}`, W - M, pdf.internal.pageSize.getHeight() - 8, { align: "right" });
  }
  pdf.save(presFileName(doc, "pdf"));
}

/* ---------- Enviar el pedido a YiQi ----------
   pedido = { clienteId, cliente, lista, items: [{ sku, cantidad, precio (solo si se cambió a mano), texto }] } */
async function presSendYiqi(pedido){
  const token = getAuthToken();
  if (!token) { clearSession(); showLogin("La sesión venció. Volvé a ingresar."); throw new Error("Sesión vencida."); }
  const response = await fetch(`${WORKER_BASE}/pedido`, {
    method: "POST",
    headers: { "Accept": "application/json", "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
    body: JSON.stringify(pedido)
  });
  let payload = {};
  try { payload = await response.json(); } catch {}
  if (response.status === 401) { clearSession(); showLogin("La sesión venció. Volvé a ingresar."); throw new Error("Sesión vencida."); }
  if (response.status === 404 && !payload.error?.includes("pedido")) {
    throw new Error("El conector de Cloudflare todavía no tiene esta función. Hay que pegar el código nuevo del conector y tocar Deploy.");
  }
  if (!response.ok || !payload.ok) throw new Error(payload.error || `Error HTTP ${response.status}.`);
  return payload;   // { ok, id, numero }
}

/* Confirmación + envío con el botón deshabilitado mientras tanto */
async function presConfirmAndSend(btn, pedido, lastSent, onStatus, note = ""){
  const n = pedido.items.length;
  const warn = lastSent ? `\n\nAtención: este presupuesto ya se envió antes (pedido ${lastSent}). Si seguís se crea otro pedido.` : "";
  if (!confirm(`¿Crear el pedido en YiQi?\n\nCliente: ${pedido.cliente}\nLista de precios: ${pedido.lista}\nArtículos: ${n}${note}${warn}`)) return null;
  btn.disabled = true;
  const label = btn.innerHTML;
  btn.textContent = "Enviando a YiQi…";
  onStatus("Creando el pedido en YiQi…", "");
  try {
    const res = await presSendYiqi(pedido);
    return res;
  } finally {
    btn.innerHTML = label;
    btn.disabled = false;
  }
}
