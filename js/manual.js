/* ============================================================
   PRESUPUESTO MANUAL
   Se agregan artículos a mano (búsqueda por SKU o nombre), se editan
   cantidad, precio y texto adicional. Deshacer/Rehacer, aviso flotante,
   Excel, PDF y envío del pedido a YiQi.
   ============================================================ */
const MAN_DRAFT_KEY = "aruki-manual";
const man = { rows: [], seq: 0, priceField: "", modo: "cantidad", stock: false, undo: [], redo: [], addActive: 0, lastSent: "" };
const manEl = id => document.getElementById(id);
const manCliente = clientePicker("manCliente", () => manSave());

/* ---------- Estado ---------- */
function manSetState(state, title, text){
  const b = manEl("manBanner");
  b.dataset.state = state;
  manEl("manKicker").textContent = { loading: "Preparando", connected: "Listo", error: "Atención" }[state] || "Presupuesto manual";
  manEl("manTitle").textContent = title;
  manEl("manText").textContent = text;
}
function manStatus(text, kind){
  const el = manEl("manStatus");
  el.textContent = text || "";
  el.className = `cot-status ${kind || ""}`;
}
function manRefreshState(){
  const cat = getArticulosCatalog();
  if (articulosModule.loading || (!articulosModule.loaded && !cat.list.length)) {
    manSetState("loading", "Cargando artículos desde YiQi", `${numberFormatter.format(articulosModule.rows.length)} de ${numberFormatter.format(articulosModule.total || 0)} artículos cargados.`);
  } else if (!cat.list.length) {
    manSetState("error", "No hay artículos cargados", "Abrí el módulo Artículos y presioná Actualizar.");
  } else {
    manSetState("connected", "Listo para armar el presupuesto", `${numberFormatter.format(cat.list.length)} artículos disponibles.`);
  }
  manFillPriceLists();
}

/* ---------- Lista de precios ---------- */
function manFillPriceLists(){
  const select = manEl("manLista");
  const cols = getArticulosCatalog().priceCols;
  const key = cols.map(c => c.field).join("|");
  if (select.dataset.key !== key) {
    select.dataset.key = key;
    select.innerHTML = cols.length
      ? cols.map(c => `<option value="${escapeHtml(c.field)}">${escapeHtml(c.title || c.field)}</option>`).join("")
      : `<option value="">(se cargan con los artículos)</option>`;
  }
  if (!cols.length) return;
  if (!cols.some(c => c.field === man.priceField)) {
    man.priceField = (cols.find(c => COT_DEFAULT_LIST.test(c.title || "")) || cols[cols.length - 1]).field;
  }
  select.value = man.priceField;
  manEl("manPriceHead").textContent = manPriceTitle();
}
function manPriceTitle(){
  const col = getArticulosCatalog().priceCols.find(c => c.field === man.priceField);
  return col ? (col.title || col.field) : "Precio";
}
function manListPrice(sku){
  const item = getArticulosCatalog().bySku.get(String(sku || ""));
  if (!item || !man.priceField) return null;
  const n = Number(item.row[man.priceField]);
  return Number.isFinite(n) ? n : null;
}
function manRowPrice(r){
  if (r.precio !== null && r.precio !== undefined && r.precio !== "" && Number.isFinite(Number(r.precio))) return Number(r.precio);
  return manListPrice(r.sku);
}
function manRowSubtotal(r){
  const p = manRowPrice(r);
  return p !== null ? p * (Number(r.cantidad) || 0) : null;
}

/* ---------- Deshacer / Rehacer ---------- */
function manPushUndo(label){
  man.undo.push({ label, rows: cloneRows(man.rows) });
  if (man.undo.length > 40) man.undo.shift();
  man.redo = [];
}
function manRenderUndo(){
  const u = man.undo[man.undo.length - 1], r = man.redo[man.redo.length - 1];
  manEl("manUndoBtn").disabled = !u; manEl("manRedoBtn").disabled = !r;
  manEl("manUndoBtn").title = u ? `Deshacer: ${u.label} (Ctrl+Z)` : "No hay nada para deshacer";
  manEl("manRedoBtn").title = r ? `Rehacer: ${r.label} (Ctrl+Y)` : "No hay nada para rehacer";
}
function manUndo(){
  const u = man.undo.pop();
  if (!u) return;
  man.redo.push({ label: u.label, rows: cloneRows(man.rows) });
  man.rows = u.rows;
  manRender(); manSave();
  manToast(`Se deshizo: ${u.label}`, false);
}
function manRedo(){
  const r = man.redo.pop();
  if (!r) return;
  man.undo.push({ label: r.label, rows: cloneRows(man.rows) });
  man.rows = r.rows;
  manRender(); manSave();
  manToast(`Se rehízo: ${r.label}`, true);
}

/* ---------- Aviso flotante ---------- */
let manToastTimer = null;
function manToast(text, withUndo = true){
  manEl("manToastText").textContent = text;
  manEl("manToastUndo").classList.toggle("hidden", !withUndo || !man.undo.length);
  const t = manEl("manToast");
  t.classList.remove("hidden");
  t.style.animation = "none"; void t.offsetWidth; t.style.animation = "";
  clearTimeout(manToastTimer);
  manToastTimer = setTimeout(manHideToast, 5000);
}
function manHideToast(){ clearTimeout(manToastTimer); manEl("manToast").classList.add("hidden"); }

/* ---------- Tabla ---------- */
function manRender(){
  const cat = getArticulosCatalog();
  const disp = man.modo === "disponibilidad";
  let total = 0;
  manEl("manBody").innerHTML = man.rows.map(r => {
    const item = cat.bySku.get(r.sku);
    const price = manRowPrice(r);
    const sub = manRowSubtotal(r);
    const edited = r.precio !== null && r.precio !== undefined && r.precio !== "";
    const d = disp ? cotDisponibilidad(r.sku) : null;
    if (sub !== null) total += sub;
    return `
      <tr data-id="${r.id}">
        <td><input class="cell-input sku ${item ? "" : "is-missing"}" data-field="sku" value="${escapeHtml(r.sku)}" placeholder="SKU" autocomplete="off"></td>
        <td class="cot-name">
          <div class="name-view" tabindex="0" title="Tocá para buscar otro artículo">${item ? escapeHtml(item.nombre) : `<span class="missing">No está en Artículos</span>`}</div>
          <input class="cell-input name hidden" data-field="nombre" value="${escapeHtml(item ? item.nombre : "")}" placeholder="Buscá por nombre o SKU" autocomplete="off">
        </td>
        <td><input class="cell-input extra" data-field="extra" value="${escapeHtml(r.extra || "")}" placeholder="—" maxlength="300"></td>
        <td class="cot-marca">${item && item.marca ? escapeHtml(item.marca) : "—"}</td>
        <td class="num">${disp
          ? `<span class="cot-disp">${d ? `<span class="badge ${d.cls}">${d.txt}</span>` : "—"}</span>`
          : `<input class="cell-input qty" data-field="cantidad" type="number" min="0" step="any" value="${escapeHtml(r.cantidad)}">`}</td>
        <td class="num col-stock" data-stock>${presStockHtml(item, r.cantidad)}</td>
        <td class="num">
          <input class="cell-input price ${edited ? "is-edited" : ""}" data-field="precio" type="text" inputmode="decimal" autocomplete="off"
            value="${price !== null ? escapeHtml(cotPriceInput(price)) : ""}" placeholder="—" title="${edited ? "Precio cambiado a mano" : "Precio de la lista elegida (podés cambiarlo)"}">
          ${edited ? `<button type="button" class="price-reset" data-price-reset title="Volver al precio de la lista">volver a lista</button>` : ""}
        </td>
        <td class="num col-sub" data-sub>${sub !== null ? escapeHtml(cotMoney(sub)) : "—"}</td>
        <td class="num"><div class="row-actions">
          <button class="btn-icon danger" type="button" data-delete title="Eliminar renglón" aria-label="Eliminar renglón">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg></button>
        </div></td>
      </tr>`;
  }).join("");
  manEl("manTotal").textContent = cotMoney(total);
  manEl("manRowCount").textContent = numberFormatter.format(man.rows.length);
  manEl("manQtyHead").textContent = disp ? "Disponibilidad" : "Cantidad";
  manEl("manPriceHead").textContent = manPriceTitle();
  manEl("manTable").classList.toggle("mode-disp", disp);
  manEl("manTable").classList.toggle("show-stock", man.stock && !disp);
  manEl("manStockWrap").classList.toggle("hidden", disp);
  manEl("manStock").checked = !!man.stock;
  manEl("manClearBtn").disabled = !man.rows.length;
  manEl("manEmpty").classList.toggle("hidden", man.rows.length > 0);
  ["manExcelBtn", "manPdfBtn", "manYiqiBtn"].forEach(id => { manEl(id).disabled = !man.rows.length; });
  manRenderUndo();
}
function manUpdateTotals(){
  let total = 0;
  man.rows.forEach(r => {
    const sub = manRowSubtotal(r);
    if (sub !== null) total += sub;
    const td = manEl("manBody").querySelector(`tr[data-id="${r.id}"] [data-sub]`);
    if (td) td.textContent = sub !== null ? cotMoney(sub) : "—";
    const st = manEl("manBody").querySelector(`tr[data-id="${r.id}"] [data-stock]`);
    if (st) st.innerHTML = presStockHtml(getArticulosCatalog().bySku.get(r.sku), r.cantidad);
  });
  manEl("manTotal").textContent = cotMoney(total);
}
const manRowById = id => man.rows.find(r => r.id === id);

/* ---------- Agregar artículos ---------- */
function manAddSku(sku){
  const item = getArticulosCatalog().bySku.get(sku);
  if (!item) return;
  const existing = man.rows.find(r => r.sku === sku);
  if (existing) {
    manPushUndo(`sumar 1 a ${sku}`);
    existing.cantidad = (Number(existing.cantidad) || 0) + 1;
    manRender(); manSave();
    manToast(`Ya estaba: se sumó 1 a ${item.nombre} (ahora ${decimalFormatter.format(existing.cantidad)})`);
  } else {
    manPushUndo(`agregar ${sku}`);
    man.rows.push({ id: `m${++man.seq}`, sku, cantidad: 1, precio: null, extra: "" });
    manRender(); manSave();
    manToast(`Artículo agregado: ${item.nombre}`);
    const tr = manEl("manBody").querySelector(`tr[data-id="m${man.seq}"]`);
    if (tr) tr.scrollIntoView({ block: "nearest" });
  }
}
/* Agregar varios de una vez (desde el módulo Artículos). Devuelve cuántos se agregaron / sumaron. */
function manAddSkus(items){
  const cat = getArticulosCatalog();
  // Acepta ["SKU", …] o [{ sku, qty }, …]
  const valid = items.map(it => typeof it === "string" ? { sku: it, qty: 1 } : { sku: it.sku, qty: Math.max(1, Number(it.qty) || 1) })
    .filter(it => cat.bySku.has(it.sku));
  if (!valid.length) return 0;
  manPushUndo(`agregar ${valid.length} artículo(s) desde Artículos`);
  let nuevos = 0, sumados = 0;
  valid.forEach(({ sku, qty }) => {
    const existing = man.rows.find(r => r.sku === sku);
    if (existing) { existing.cantidad = (Number(existing.cantidad) || 0) + qty; sumados++; }
    else { man.rows.push({ id: `m${++man.seq}`, sku, cantidad: qty, precio: null, extra: "" }); nuevos++; }
  });
  manRender(); manSave();
  const partes = [];
  if (nuevos) partes.push(`${nuevos} agregado${nuevos === 1 ? "" : "s"}`);
  if (sumados) partes.push(`${sumados} ya estaba${sumados === 1 ? "" : "n"} (se sumó la cantidad)`);
  return partes.join(", ");   // Artículos muestra su propio aviso (no cambia de módulo)
}

/* Vaciar: saca todos los artículos (deja cliente, lista y modo) */
function manEmpty(){
  if (!man.rows.length) return;
  manPushUndo(`vaciar el presupuesto (${man.rows.length} renglones)`);
  man.rows = [];
  manRender(); manSave();
  manToast("Presupuesto vaciado");
}

const manAdd = manEl("manAddSearch");
function manRenderAddResults(){
  const box = manEl("manAddResults");
  const q = manAdd.value.trim();
  if (!q) { box.classList.add("hidden"); return; }
  const res = relSearchArticulos(q);
  if (!res.length) {
    box.innerHTML = `<div class="rel-result-empty">${getArticulosCatalog().list.length ? "No hay artículos con ese texto." : "Los artículos todavía se están cargando…"}</div>`;
  } else {
    man.addActive = Math.min(man.addActive, res.length - 1);
    box.innerHTML = res.map((a, i) => cotResultHtml(a, i === man.addActive)).join("") + artMoreNote(res);
    box.querySelectorAll("[data-sku]").forEach(el => el.addEventListener("mousedown", e => {
      e.preventDefault(); manAddSku(el.dataset.sku); manAdd.value = ""; box.classList.add("hidden"); manAdd.focus();
    }));
  }
  box.classList.remove("hidden");
  cotFitMarcas(box);
}
manAdd.addEventListener("input", () => { man.addActive = 0; manRenderAddResults(); });
manAdd.addEventListener("focus", manRenderAddResults);
manAdd.addEventListener("blur", () => setTimeout(() => manEl("manAddResults").classList.add("hidden"), 150));
manAdd.addEventListener("keydown", e => {
  const box = manEl("manAddResults");
  const items = box.classList.contains("hidden") ? [] : box.querySelectorAll("[data-sku]");
  if ((e.key === "ArrowDown" || e.key === "ArrowUp") && items.length) {
    e.preventDefault();
    man.addActive = (man.addActive + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    manRenderAddResults();
  } else if (e.key === "Enter") {
    e.preventDefault();
    const el = items[man.addActive];
    if (el) { manAddSku(el.dataset.sku); manAdd.value = ""; box.classList.add("hidden"); }
  } else if (e.key === "Escape") box.classList.add("hidden");
});

/* ---------- Edición en la tabla ---------- */
const manBody = manEl("manBody");
manBody.addEventListener("change", e => {
  const input = e.target;
  const row = manRowById(input.closest("tr")?.dataset.id);
  if (!row || !input.dataset.field) return;
  const field = input.dataset.field;
  if (field === "cantidad") {
    const v = Math.max(0, Number(String(input.value).replace(",", ".")) || 0);
    if (v === Number(row.cantidad)) return;
    manPushUndo(`cambiar cantidad de ${row.sku}`);
    row.cantidad = v;
    manUpdateTotals(); manRenderUndo(); manSave();
    manToast(`Cantidad de ${row.sku}: ${decimalFormatter.format(v)}`);
  } else if (field === "precio") {
    const v = cotParsePrice(input.value);
    const list = manListPrice(row.sku);
    const next = v === null || (list !== null && Math.abs(v - list) < 0.005) ? null : v;
    if (next === (row.precio ?? null)) { input.value = manRowPrice(row) !== null ? cotPriceInput(manRowPrice(row)) : ""; return; }
    manPushUndo(`cambiar precio de ${row.sku}`);
    row.precio = next;
    manRender(); manSave();
    manToast(next === null ? `${row.sku}: vuelve al precio de la lista` : `Precio de ${row.sku}: ${cotMoney(next)}`);
  } else if (field === "extra") {
    const v = input.value.trim();
    if (v === (row.extra || "")) return;
    manPushUndo(`texto adicional de ${row.sku}`);
    row.extra = v;
    manRenderUndo(); manSave();
    manToast(`Texto adicional guardado en ${row.sku}`);
  }
});
manBody.addEventListener("keydown", e => {
  if (e.target.matches(MAN_PICK)) return;                 // SKU / nombre: lo maneja el buscador de abajo
  if (e.key === "Enter" && e.target.matches(".cell-input")) { e.preventDefault(); e.target.blur(); }
});

/* ---------- Cambiar el artículo de un renglón (SKU o nombre), igual que en Cotizaciones ---------- */
const MAN_PICK = '[data-field="sku"],[data-field="nombre"]';
let manPickInput = null, manPickActive = 0;
function manSetSku(row, value){
  const cat = getArticulosCatalog();
  let sku = String(value || "").trim();
  if (sku && !cat.bySku.has(sku)) { const ci = cat.list.find(a => a.sku.toLowerCase() === sku.toLowerCase()); if (ci) sku = ci.sku; }
  if (!sku || sku === row.sku) return false;
  manPushUndo(`cambiar ${row.sku} por ${sku}`);
  const prev = row.sku;
  row.sku = sku;
  row.precio = null;                                      // el precio a mano era del artículo anterior
  manRender(); manSave();
  const item = cat.bySku.get(sku);
  manToast(`${prev} → ${sku}${item ? ` · ${item.nombre}` : " (no está en Artículos)"}`);
  return true;
}
function manPickClose(input, row){
  manEl("manSkuResults").classList.add("hidden");
  if (input.dataset.field === "sku") { input.value = row ? row.sku : input.value; return; }
  const item = row ? getArticulosCatalog().bySku.get(row.sku) : null;
  input.value = item ? item.nombre : "";
  input.classList.add("hidden");
  input.parentElement.querySelector(".name-view")?.classList.remove("hidden");
}
function manPickCommit(input, sku){
  manEl("manSkuResults").classList.add("hidden");
  const row = manRowById(input.closest("tr")?.dataset.id);
  if (!row) return;
  if (!manSetSku(row, sku)) manPickClose(input, row);
}
function manPickShow(input){
  const box = manEl("manSkuResults");
  const q = input.value.trim();
  const res = q ? relSearchArticulos(q) : [];
  if (!res.length) { box.classList.add("hidden"); return; }
  manPickActive = Math.min(manPickActive, res.length - 1);
  box.innerHTML = res.map((a, i) => cotResultHtml(a, i === manPickActive)).join("") + artMoreNote(res);
  box.classList.remove("hidden");
  cotFloatPlace(box, input);
  box.querySelectorAll("[data-sku]").forEach(el => el.addEventListener("mousedown", ev => { ev.preventDefault(); manPickCommit(input, el.dataset.sku); }));
}
function manOpenName(view){
  const input = view.parentElement.querySelector('[data-field="nombre"]');
  view.classList.add("hidden");
  input.classList.remove("hidden");
  input.focus();
}
manBody.addEventListener("input", e => {
  if (e.target.matches(MAN_PICK)) { manPickActive = 0; manPickShow(e.target); }
});
manBody.addEventListener("focusin", e => {
  if (e.target.matches(MAN_PICK)) { manPickInput = e.target; manPickActive = 0; e.target.select(); }
  else if (e.target.matches(".name-view")) manOpenName(e.target);
});
manBody.addEventListener("focusout", e => {
  if (!e.target.matches(MAN_PICK)) return;
  const input = e.target;
  setTimeout(() => {
    if (!document.body.contains(input) || document.activeElement === input) return;
    const row = manRowById(input.closest("tr")?.dataset.id);
    // En el SKU, lo escrito se toma como código; en el nombre solo cuenta lo elegido de la lista
    if (input.dataset.field === "sku" && row && input.value.trim() && input.value.trim() !== row.sku) manPickCommit(input, input.value);
    else manPickClose(input, row);
  }, 150);
});
manBody.addEventListener("keydown", e => {
  const input = e.target;
  if (!input.matches(MAN_PICK)) return;
  const box = manEl("manSkuResults");
  const items = box.classList.contains("hidden") ? [] : box.querySelectorAll("[data-sku]");
  if ((e.key === "ArrowDown" || e.key === "ArrowUp") && items.length) {
    e.preventDefault();
    manPickActive = (manPickActive + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    manPickShow(input);
  } else if (e.key === "Enter") {
    e.preventDefault();
    const picked = items[manPickActive]?.dataset.sku;
    if (picked) manPickCommit(input, picked);
    else if (input.dataset.field === "sku") manPickCommit(input, input.value);
    else if (input.value.trim()) { manPickActive = 0; manPickShow(input); }
  } else if (e.key === "Escape") {
    manPickClose(input, manRowById(input.closest("tr")?.dataset.id));
    input.blur();
  }
});
window.addEventListener("scroll", e => {
  const box = manEl("manSkuResults");
  if (e.target === box || box.classList.contains("hidden")) return;
  if (!manPickInput || document.activeElement !== manPickInput) box.classList.add("hidden");
  else manPickShow(manPickInput);
}, true);
manBody.addEventListener("click", e => {
  const tr = e.target.closest("tr");
  const row = tr && manRowById(tr.dataset.id);
  if (!row) return;
  if (e.target.closest(".name-view")) { manOpenName(e.target.closest(".name-view")); return; }
  if (e.target.closest("[data-delete]")) {
    manPushUndo(`eliminar ${row.sku}`);
    man.rows = man.rows.filter(r => r !== row);
    manRender(); manSave();
    manToast(`Renglón eliminado: ${row.sku}`);
  } else if (e.target.closest("[data-price-reset]")) {
    manPushUndo(`volver a la lista en ${row.sku}`);
    row.precio = null;
    manRender(); manSave();
    manToast(`${row.sku}: vuelve al precio de la lista`);
  }
});

/* ---------- Datos del presupuesto ---------- */
manEl("manLista").addEventListener("change", e => {
  man.priceField = e.target.value;
  manRender(); manSave();
  manToast(`Lista de precios: ${manPriceTitle()}`, false);
});
manEl("manStock").addEventListener("change", e => {
  man.stock = e.target.checked;
  manRender(); manSave();
});
manEl("manClearBtn").addEventListener("click", manEmpty);
manEl("manModo").addEventListener("change", e => {
  man.modo = e.target.value === "disponibilidad" ? "disponibilidad" : "cantidad";
  manRender(); manSave();
});

/* ---------- Exportar y enviar ---------- */
/* Observaciones (etiquetas compartidas con Cotizaciones) */
man.obs = obsEmpty();
const manObs = obsWidget({ sel: "manObsSel", tagsBtn: "manTagsBtn", text: "manObsText", chip: "manObsChip", bottomSel: "manObsSel2",
  saveBtn: "manObsSave", newBtn: "manObsNew", get: () => man.obs, save: () => manSave() });

function manDoc(){
  const cat = getArticulosCatalog();
  return {
    observaciones: (man.obs.texto || "").trim(),
    cliente: manCliente.display(), lista: manPriceTitle(), disp: man.modo === "disponibilidad",
    conSolicitado: false, conExtra: man.rows.some(r => r.extra),
    rows: man.rows.map(r => {
      const item = cat.bySku.get(r.sku);
      const d = cotDisponibilidad(r.sku);
      return { sku: r.sku, nombre: item ? item.nombre : "", extra: r.extra || "", marca: item ? item.marca : "",
        cantidad: r.cantidad, dispTxt: d ? d.txt : "", precio: manRowPrice(r) };
    })
  };
}
async function manRunExport(btnId, fn, okText){
  const btn = manEl(btnId);
  btn.disabled = true;
  try { await fn(manDoc()); manStatus(okText, "ok"); manToast(okText, false); }
  catch (error) { manStatus(String(error?.message || error), "error"); }
  finally { btn.disabled = !man.rows.length; }
}
manEl("manExcelBtn").addEventListener("click", () => manRunExport("manExcelBtn", presExcel, "Excel descargado."));
manEl("manPdfBtn").addEventListener("click", () => manRunExport("manPdfBtn", presPdf, "PDF descargado."));
manEl("manYiqiBtn").addEventListener("click", async () => {
  if (!man.rows.length) return;
  const cli = manCliente.forYiqi();
  if (cli.error) { manStatus(cli.error, "error"); manEl("manCliente").focus(); return; }
  const sinCant = man.rows.filter(r => !(Number(r.cantidad) > 0));
  if (sinCant.length && man.modo === "cantidad") { manStatus(`Hay ${sinCant.length} renglón(es) con cantidad 0. Corregilos o borralos antes de enviar.`, "error"); return; }
  const pedido = {
    clienteId: cli.id, cliente: cli.nombre, lista: manPriceTitle(), observaciones: (man.obs.texto || "").trim(),
    items: man.rows.map(r => ({ sku: r.sku, cantidad: Number(r.cantidad) || 1,
      precio: r.precio !== null && r.precio !== undefined && r.precio !== "" ? Number(r.precio) : null, texto: r.extra || "" }))
  };
  try {
    const res = await presConfirmAndSend(manEl("manYiqiBtn"), pedido, man.lastSent, manStatus);
    if (!res) return;
    man.lastSent = res.numero || `ID ${res.id}`;
    manSave();
    manStatus(`Pedido creado en YiQi: ${man.lastSent}.`, "ok");
    manToast(`Pedido creado en YiQi: ${man.lastSent}`, false);
  } catch (error) {
    manStatus(`No se pudo crear el pedido: ${String(error?.message || error)}`, "error");
  }
});

/* ---------- Borrador ---------- */
function manSave(){
  try {
    localStorage.setItem(MAN_DRAFT_KEY, JSON.stringify({
      rows: man.rows, seq: man.seq, priceField: man.priceField, modo: man.modo, lastSent: man.lastSent, stock: !!man.stock,
      cliente: manCliente.get(), clienteTexto: manCliente.text(), obs: man.obs
    }));
  } catch {}
}
function manRestore(){
  try {
    const d = JSON.parse(localStorage.getItem(MAN_DRAFT_KEY) || "null");
    if (!d) return;
    man.rows = Array.isArray(d.rows) ? d.rows : [];
    man.seq = Number(d.seq) || man.rows.length;
    man.priceField = d.priceField || "";
    man.modo = d.modo === "disponibilidad" ? "disponibilidad" : "cantidad";
    man.lastSent = d.lastSent || "";
    man.stock = !!d.stock;
    manEl("manModo").value = man.modo;
    manCliente.set(d.cliente || null, d.clienteTexto || "");
    man.obs = { ...obsEmpty(), ...(d.obs || {}) };
  } catch {}
}
function manClear(){
  if (man.rows.length && !confirm("¿Borrar el presupuesto actual y empezar uno nuevo?")) return;
  man.rows = []; man.undo = []; man.redo = []; man.lastSent = "";
  manCliente.clear();
  man.obs = obsEmpty(); manObs.render();
  try { localStorage.removeItem(MAN_DRAFT_KEY); } catch {}
  manStatus(""); manHideToast();
  manRender();
  manAdd.focus();
}

const manualModule = {
  ensureLoaded(){
    articulosModule.ensureLoaded();
    clientesStore.ensureLoaded();
    etqEnsure(); manObs.render();
    manRefreshState();
    manRender();
  },
  reset(){
    man.rows = []; man.undo = []; man.redo = []; man.priceField = ""; man.lastSent = "";
    manCliente.clear(); man.obs = obsEmpty(); manObs.render();
    try { localStorage.removeItem(MAN_DRAFT_KEY); } catch {}
    manStatus("");
    manRender();
  }
};

manEl("manNewBtn").addEventListener("click", manClear);
manEl("manUndoBtn").addEventListener("click", manUndo);
manEl("manRedoBtn").addEventListener("click", manRedo);
manEl("manToastUndo").addEventListener("click", () => { manHideToast(); manUndo(); });
manEl("manToastClose").addEventListener("click", manHideToast);
document.addEventListener("keydown", e => {
  if (manEl("view-manual").classList.contains("hidden")) return;
  if (e.target.matches("input, textarea, select")) return;
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === "z" && !e.shiftKey) { e.preventDefault(); manUndo(); }
  else if ((e.ctrlKey || e.metaKey) && (k === "y" || (k === "z" && e.shiftKey))) { e.preventDefault(); manRedo(); }
});
document.addEventListener("aruki:loaded", e => {
  if (e.detail?.endpoint !== `${WORKER_BASE}/articulos`) return;
  manRefreshState(); manRender();
});
setInterval(() => {
  if (!manEl("view-manual").classList.contains("hidden") && (articulosModule.loading || !getArticulosCatalog().list.length)) manRefreshState();
}, 1000);

manRestore();
manRender();
