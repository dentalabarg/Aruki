/* ============================================================
   PRESUPUESTOS › COTIZACIONES  (Etapa 2: texto pegado)
   ------------------------------------------------------------
   1. Lee la lista pegada → renglones { solicitado, cantidad }.
   2. Busca cada renglón SIN IA: primero en Relaciones (texto exacto,
      sin tildes/mayúsculas), después por parecido contra todos los
      artículos (palabras con peso, medidas y códigos valen más).
   3. Arma una tabla editable: SKU con autocompletado, texto adicional,
      cantidad, precio de la lista elegida, opciones para renglones dudosos,
      arrastrar para ordenar, guardar como relación y exportar a Excel.
   El borrador se guarda en este navegador (localStorage) para no perderlo.
   ============================================================ */
const COT_DRAFT_KEY = "aruki-cotizacion";
const COT_DEFAULT_LIST = /lista 2|general/i;
const COT_UNIT_WORDS = "u|un|und|unid|unidad|unidades|uds|cajas?|cjs?|packs?|pzas?|piezas?|frascos?|potes?|sobres?|bolsas?|blisters?";
const COT_SIZE_UNITS = /^(?:gr|grs|g|gramos?|ml|cc|mm|cm|kg|kgs|mts?|lts?|l)\b/i;

const cot = {
  rows: [], seq: 0, cliente: "", priceField: "", texto: "",
  activeSkuInput: null, skuActive: 0, addActive: 0, dragId: null
};

function cotEl(id){ return document.getElementById(id); }

/* ---------- Estado y avisos ---------- */
function cotSetState(state, title, text){
  const banner = cotEl("cotBanner");
  banner.dataset.state = state;
  const labels = { idle: "Cotizaciones", loading: "Preparando", connected: "Listo para cotizar", error: "Atención" };
  cotEl("cotKicker").textContent = labels[state] || "Estado";
  cotEl("cotTitle").textContent = title;
  cotEl("cotText").textContent = text;
}

function cotStatus(text, kind){
  const el = cotEl("cotStatus");
  el.textContent = text || "";
  el.className = `cot-status ${kind || ""}`;
}

function cotRefreshState(){
  const cat = getArticulosCatalog();
  const loadingArt = articulosModule.loading || (!articulosModule.loaded && !cat.list.length);
  if (loadingArt) {
    cotSetState("loading", "Cargando artículos desde YiQi",
      `${numberFormatter.format(articulosModule.rows.length)} de ${numberFormatter.format(articulosModule.total || 0)} artículos cargados. Podés ir pegando la lista mientras tanto.`);
  } else if (!cat.list.length) {
    cotSetState("error", "No hay artículos cargados", "Abrí el módulo Artículos y presioná Actualizar o Reintentar.");
  } else {
    const relTxt = rel.loaded ? `${numberFormatter.format(rel.items.length)} relaciones` : (rel.loading ? "relaciones cargando…" : "relaciones no disponibles");
    cotSetState("connected", "Listo para cotizar",
      `${numberFormatter.format(cat.list.length)} artículos y ${relTxt}.`);
  }
  cotEl("cotProcessBtn").disabled = loadingArt || !cat.list.length || rel.loading;
  cotFillPriceLists();
}

/* ---------- Listas de precios ---------- */
function cotFillPriceLists(){
  const select = cotEl("cotLista");
  const cols = getArticulosCatalog().priceCols;
  const key = cols.map(c => c.field).join("|");
  if (select.dataset.key !== key) {
    select.dataset.key = key;
    select.innerHTML = cols.length
      ? cols.map(c => `<option value="${escapeHtml(c.field)}">${escapeHtml(c.title || c.field)}</option>`).join("")
      : `<option value="">(se cargan con los artículos)</option>`;
  }
  if (!cols.length) return;
  if (!cols.some(c => c.field === cot.priceField)) {
    cot.priceField = (cols.find(c => COT_DEFAULT_LIST.test(c.title || "")) || cols[cols.length - 1]).field;
  }
  select.value = cot.priceField;
  cotEl("cotPriceHead").textContent = cotPriceTitle();
}

function cotPriceTitle(){
  const col = getArticulosCatalog().priceCols.find(c => c.field === cot.priceField);
  return col ? (col.title || col.field) : "Precio";
}

function cotPrice(sku){
  const item = getArticulosCatalog().bySku.get(String(sku || ""));
  if (!item || !cot.priceField) return null;
  const n = Number(item.row[cot.priceField]);
  return Number.isFinite(n) ? n : null;
}

/* ============================================================
   1. LEER LA LISTA PEGADA
   ============================================================ */
const COT_HEADER_WORDS = /^(it|it\.|item|ítem|n|nº|n°|nro|cant|cant\.|cantidad|descripcion|descripción|detalle|articulo|artículo|producto|productos|presentacion|presentación|unidad|unidades|codigo|código|marca|precio|observaciones?)$/i;

function cotNum(value){
  const n = Number(String(value).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}
function cotQtyNum(value){
  const s = String(value).trim();
  // "1.000" = mil, "2,5" = 2.5
  const n = /^\d{1,3}(\.\d{3})+$/.test(s) ? cotNum(s) : Number(s.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : NaN;
}

function cotIsHeader(cells){
  const words = cells.join(" ").split(/[\s|;:/]+/).filter(Boolean);
  return words.length > 0 && words.every(w => COT_HEADER_WORDS.test(w));
}

function cotParseLine(raw){
  let line = String(raw).replace(/ /g, " ").trim();
  if (!line) return null;

  // Copiado de Excel / Word: columnas separadas por tabulación o "|"
  if (/\t|\s\|\s/.test(line)) {
    const cells = line.split(/\t|\s\|\s/).map(c => c.trim()).filter(Boolean);
    if (!cells.length || cotIsHeader(cells)) return null;
    const isNum = c => /^\d+([.,]\d+)?$/.test(c);
    const nums = cells.map((c, i) => ({ c, i })).filter(x => isNum(x.c));
    const texts = cells.filter(c => !isNum(c));
    if (!texts.length) return null;
    let qtyCell = null;
    if (nums.length >= 2 && nums[0].i === 0) qtyCell = nums[1];      // IT. | Cant. | Descripción
    else if (nums.length) qtyCell = nums[0].i === 0 && cells.length > 2 ? nums[0] : nums[nums.length - 1];
    const cantidad = qtyCell ? cotQtyNum(qtyCell.c) : NaN;
    return { solicitado: texts.join(" "), cantidad: Number.isFinite(cantidad) ? cantidad : 1, original: line };
  }

  if (cotIsHeader([line])) return null;
  const original = line;
  line = line.replace(/^[-–•*·●▪►>✓✔]+\s*/, "");
  // Numeración de ítem: "1)", "1.-", "12. "
  line = line.replace(/^\d{1,3}\s*(?:\)|\.-|\.(?=\s))\s*/, "");

  const U = COT_UNIT_WORDS;
  let m, cantidad = NaN, texto = line;

  if ((m = line.match(new RegExp(`^(.+?)[\\s,;:-]*\\bcant(?:idad)?\\.?\\s*:?\\s*(\\d+(?:[.,]\\d+)?)\\s*(?:${U})?\\.?$`, "i")))) {
    texto = m[1]; cantidad = cotQtyNum(m[2]);
  } else if ((m = line.match(new RegExp(`^(\\d+(?:[.,]\\d+)?)\\s*(?:(?:${U})\\.?\\s*(?:de\\s+)?|x\\s+|×\\s*)?[-–:.)]?\\s+(.+)$`, "i"))) && !COT_SIZE_UNITS.test(m[2])) {
    cantidad = cotQtyNum(m[1]); texto = m[2];
  } else if ((m = line.match(new RegExp(`^(.+?)\\s*(?:[-–:=]|\\(|\\bx\\b|×)\\s*(\\d+(?:[.,]\\d+)?)\\s*(${U})?\\.?\\)?$`, "i")))) {
    const n = cotQtyNum(m[2]);
    const byX = /^[x×]/i.test(line.slice(m[1].length).trim());
    // "x 500" / "x 50" suele ser presentación (algodón x 500, caja x 50): con "x" solo es cantidad si es chica
    if (!byX || n <= 20) { texto = m[1]; cantidad = n; }
  } else if ((m = line.match(new RegExp(`^(.+?)\\s+(\\d+(?:[.,]\\d+)?)\\s*(?:${U})\\.?$`, "i")))) {
    texto = m[1]; cantidad = cotQtyNum(m[2]);
  }
  texto = texto.replace(/[\s,;:\-–]+$/, "").trim();
  if (!texto) return null;
  return { solicitado: texto, cantidad: Number.isFinite(cantidad) ? cantidad : 1, original };
}

function cotParseText(text){
  return String(text || "").split(/\r?\n/).map(cotParseLine).filter(Boolean);
}

/* ============================================================
   2. BUSCAR CADA RENGLÓN
   ============================================================ */
const COT_STOP = new Set("de del la el los las para con en y por a al o e un una sin c x n nro no marca tipo color".split(" "));

function cotNorm(text){
  return foldText(text)
    .replace(/(\d),(\d)/g, "$1.$2")
    .replace(/(\d+(?:\.\d+)?)\s*(?:grs?|gramos?|g)\b/g, " $1g ")
    .replace(/(\d+(?:\.\d+)?)\s*(?:ml|cc|cm3)\b/g, " $1ml ")
    .replace(/(\d+(?:\.\d+)?)\s*(?:kgs?|kilos?)\b/g, " $1kg ")
    .replace(/(\d+(?:\.\d+)?)\s*mm\b/g, " $1mm ")
    .replace(/(\d+(?:\.\d+)?)\s*(?:mts?|metros?)\b/g, " $1m ")
    .replace(/(\d+)\s*(?:unidades|unidad|unid|und|uds|un|u)\b/g, " $1 ")
    .replace(/\bx\s*(\d)/g, " $1");
}

function cotTokens(text){
  const out = [];
  for (let t of cotNorm(text).split(/[^a-z0-9ñ.]+/)) {
    t = t.replace(/^\.+|\.+$/g, "");
    if (!t || COT_STOP.has(t)) continue;
    if (!/\d/.test(t) && t.length > 4 && t.endsWith("s")) t = t.slice(0, -1);   // plurales simples
    out.push(t);
  }
  return out;
}

const COT_EXCLUDE = /discontinuad|mercado\s*libre|mercadolibre/i;
let cotIdxCache = { list: null, value: null };

function cotIndex(){
  const cat = getArticulosCatalog();
  if (cotIdxCache.list === cat.list && cotIdxCache.value) return cotIdxCache.value;
  const items = [];
  const df = new Map();
  const inv = new Map();
  for (const a of cat.list) {
    if (COT_EXCLUDE.test(a.nombre) || /^rep /i.test(a.sku) || /^rep /i.test(a.nombre)) continue;
    const toks = [...new Set(cotTokens(`${a.sku} ${a.nombre}`))];
    const i = items.length;
    items.push({ a, toks });
    for (const t of toks) {
      df.set(t, (df.get(t) || 0) + 1);
      if (!inv.has(t)) inv.set(t, []);
      inv.get(t).push(i);
    }
  }
  const value = { items, df, inv, vocab: [...df.keys()] };
  cotIdxCache = { list: cat.list, value };
  return value;
}

const COT_MEASURE = /^(\d+(?:\.\d+)?)(g|ml|kg|mm|m)$/;

function cotSearch(text, limit = 6){
  const idx = cotIndex();
  const q = [...new Set(cotTokens(text))];
  if (!q.length || !idx.items.length) return [];
  const N = idx.items.length;
  const scores = new Map();   // i → { w, hits }
  let totalW = 0;

  for (const t of q) {
    const df = idx.df.get(t) || 0;
    const hasDigit = /\d/.test(t);
    let w = Math.log(1 + N / (1 + df));
    if (!df) w = Math.log(1 + N) * 0.5;            // palabra que no está en ningún artículo: pesa algo
    if (hasDigit) w *= 1.5;                         // medidas, colores (a2), códigos de fresa
    totalW += w;

    const best = new Map();
    for (const i of idx.inv.get(t) || []) best.set(i, 1);
    if (!hasDigit && t.length >= 4) {
      for (const v of idx.vocab) {
        if (v === t || /\d/.test(v)) continue;
        if (v.startsWith(t) || (v.length >= 4 && t.startsWith(v))) {
          for (const i of idx.inv.get(v)) if (!best.has(i)) best.set(i, 0.75);
        }
      }
    }
    for (const [i, f] of best) {
      const s = scores.get(i) || { w: 0, hits: 0 };
      s.w += w * f; s.hits += 1;
      scores.set(i, s);
    }
  }
  if (!totalW) return [];

  const qMeasures = q.map(t => t.match(COT_MEASURE)).filter(Boolean);
  const priceField = cot.priceField;
  const results = [];
  for (const [i, s] of scores) {
    const it = idx.items[i];
    if (priceField) {
      const p = Number(it.a.row[priceField]);
      if (Number.isFinite(p) && p === 0) continue;   // sin precio en esta lista
    }
    const recall = s.w / totalW;
    const precision = s.hits / Math.max(it.toks.length, 1);
    let score = 0.85 * recall + 0.15 * Math.min(1, precision);
    // Medida distinta (pide 4g y el artículo dice 2g): penalizar
    for (const qm of qMeasures) {
      const conflict = it.toks.some(t => { const m = t.match(COT_MEASURE); return m && m[2] === qm[2] && m[1] !== qm[1]; });
      const same = it.toks.includes(qm[0]);
      if (conflict && !same) score *= 0.8;
    }
    results.push({ a: it.a, score });
  }
  results.sort((x, y) => y.score - x.score || x.a.nombre.length - y.a.nombre.length);
  return results.slice(0, limit);
}

/* Decide qué filas genera un renglón pedido */
function cotResolve(item, relIndex){
  const grupo = ++cot.seq;
  const base = { grupo, solicitado: item.solicitado, cantidad: item.cantidad, extra: "" };
  const relHit = relIndex.get(relKey(item.solicitado)) || relIndex.get(relKey(item.original || ""));
  if (relHit && relHit.skus.length) {
    return relHit.skus.map(sku => cotMakeRow({ ...base, sku, estado: "relacion" }));
  }
  const found = cotSearch(item.solicitado, 6);
  const top = found[0];
  if (!top || top.score < 0.4) {
    return [cotMakeRow({ ...base, sku: "", estado: "sin" })];
  }
  const second = found[1];
  if (top.score >= 0.75 && (!second || top.score - second.score >= 0.08)) {
    return [cotMakeRow({ ...base, sku: top.a.sku, estado: "buena" })];
  }
  const options = found.filter(r => r.score >= top.score * 0.8).slice(0, 4);
  return options.map(r => cotMakeRow({ ...base, sku: r.a.sku, estado: "dudosa" }));
}

function cotMakeRow(data){
  return { id: `r${++cot.seq}`, grupo: data.grupo ?? ++cot.seq, solicitado: data.solicitado || "",
    sku: data.sku || "", extra: data.extra || "", cantidad: data.cantidad || 1, estado: data.estado || "manual" };
}

function cotProcess(){
  const items = cotParseText(cotEl("cotTexto").value);
  if (!items.length) { cotStatus("Pegá al menos un renglón con artículos.", "error"); return; }
  const relIndex = getRelacionesIndex();
  const t0 = performance.now();
  const newRows = items.flatMap(it => cotResolve(it, relIndex));
  const replace = !cot.rows.length || confirm("Ya hay un presupuesto armado. ¿Reemplazarlo? (Cancelar = agregar estos renglones al final)");
  cot.rows = replace ? newRows : [...cot.rows, ...newRows];
  cotRender();
  cotSave();
  const ms = Math.round(performance.now() - t0);
  cotStatus(`${items.length} renglones leídos en ${ms < 1000 ? ms + " ms" : (ms / 1000).toFixed(1) + " s"}. Revisá los marcados en amarillo y rojo.`, "ok");
  cotEl("cotResultPanel").scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ============================================================
   3. TABLA EDITABLE
   ============================================================ */
const COT_BADGES = {
  relacion: ["badge-purple", "Relación"],
  buena: ["badge-green", "Coincide"],
  dudosa: ["badge-amber", "Opción"],
  sin: ["badge-red", "Sin coincidencia"],
  manual: ["badge-cyan", "Manual"]
};

function cotGroupInfo(){
  const info = new Map();
  cot.rows.forEach(r => {
    if (!info.has(r.grupo)) info.set(r.grupo, []);
    info.get(r.grupo).push(r.id);
  });
  return info;
}

function cotRender(){
  const cat = getArticulosCatalog();
  const groups = cotGroupInfo();
  const body = cotEl("cotBody");
  let total = 0;
  body.innerHTML = cot.rows.map(r => {
    const item = r.sku ? cat.bySku.get(r.sku) : null;
    const missing = r.sku && !item && cat.list.length > 0;
    const price = r.sku ? cotPrice(r.sku) : null;
    const sub = price !== null ? price * (Number(r.cantidad) || 0) : null;
    if (sub !== null) total += sub;
    const siblings = groups.get(r.grupo) || [r.id];
    const isOption = siblings.length > 1 && r.estado === "dudosa";
    const [badgeCls, badgeTxt] = COT_BADGES[r.estado] || COT_BADGES.manual;
    const label = isOption ? `Opción ${siblings.indexOf(r.id) + 1} de ${siblings.length}` : badgeTxt;
    return `
      <tr data-id="${r.id}" class="${isOption ? "is-option" : ""}">
        <td><span class="cot-handle" draggable="true" title="Arrastrar para ordenar">⠿</span></td>
        <td class="cot-sol">${escapeHtml(r.solicitado) || "<span class=\"source-note\">(agregado a mano)</span>"}<div><span class="badge ${badgeCls}">${label}</span></div></td>
        <td><input class="cell-input sku ${missing ? "is-missing" : ""}" data-field="sku" value="${escapeHtml(r.sku)}" placeholder="SKU" autocomplete="off"></td>
        <td class="cot-name">${item ? escapeHtml(item.nombre) : (missing ? "<span class=\"missing\">No está en Artículos</span>" : "<span class=\"source-note\">Escribí o buscá el SKU</span>")}</td>
        <td><input class="cell-input extra" data-field="extra" value="${escapeHtml(r.extra)}" placeholder="—" maxlength="300"></td>
        <td class="num"><input class="cell-input qty" data-field="cantidad" type="number" min="0" step="any" value="${escapeHtml(r.cantidad)}"></td>
        <td class="num">${price !== null ? escapeHtml(cotMoney(price)) : "—"}</td>
        <td class="num" data-sub>${sub !== null ? escapeHtml(cotMoney(sub)) : "—"}</td>
        <td class="num"><div class="row-actions">
          ${isOption ? `<button class="btn-icon ok" type="button" data-pick title="Quedarme con esta opción y borrar las otras" aria-label="Elegir esta opción">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></button>` : ""}
          <button class="btn-icon" type="button" data-relate title="Guardar como relación (la próxima vez lo encuentra solo)" aria-label="Guardar como relación" ${r.solicitado && r.sku && !missing ? "" : "disabled"}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg></button>
          <button class="btn-icon danger" type="button" data-delete title="Eliminar renglón" aria-label="Eliminar renglón">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg></button>
        </div></td>
      </tr>`;
  }).join("");

  cotEl("cotTotal").textContent = cotMoney(total);
  cotEl("cotRowCount").textContent = numberFormatter.format(cot.rows.length);
  cotEl("cotPriceHead").textContent = cotPriceTitle();
  cotEl("cotResultPanel").classList.toggle("hidden", !cot.rows.length);
  cotEl("cotExportBtn").disabled = !cot.rows.length;

  // Resumen por estado (contando renglones pedidos, no filas)
  const byGroup = new Map();
  cot.rows.forEach(r => { if (!byGroup.has(r.grupo)) byGroup.set(r.grupo, r.estado); });
  const counts = {};
  byGroup.forEach(e => { counts[e] = (counts[e] || 0) + 1; });
  const names = { relacion: "por relación", buena: "coinciden", dudosa: "con opciones", sin: "sin coincidencia", manual: "manuales" };
  cotEl("cotSummary").innerHTML = Object.keys(names).filter(k => counts[k])
    .map(k => `<span class="badge ${COT_BADGES[k][0]}">${counts[k]} ${names[k]}</span>`).join("");
}

function cotMoney(n){
  return priceFormatter.format(n).replace(/^\$\s?/, "$ ");
}

function cotRowById(id){ return cot.rows.find(r => r.id === id); }

function cotUpdateTotals(){
  let total = 0;
  cot.rows.forEach(r => {
    const p = r.sku ? cotPrice(r.sku) : null;
    const sub = p !== null ? p * (Number(r.cantidad) || 0) : null;
    if (sub !== null) total += sub;
    const td = cotEl("cotBody").querySelector(`tr[data-id="${r.id}"] [data-sub]`);
    if (td) td.textContent = sub !== null ? cotMoney(sub) : "—";
  });
  cotEl("cotTotal").textContent = cotMoney(total);
}

function cotSetSku(row, value){
  const cat = getArticulosCatalog();
  const v = String(value || "").trim();
  let sku = v;
  if (v && !cat.bySku.has(v)) {
    const ci = cat.list.find(a => a.sku.toLowerCase() === v.toLowerCase());
    if (ci) sku = ci.sku;
  }
  if (sku === row.sku) return false;
  row.sku = sku;
  // Si era una opción, al tocarla pasa a ser la elegida a mano
  row.estado = sku ? "manual" : "sin";
  return true;
}

/* ---------- Autocompletado del SKU (lista flotante) ---------- */
function cotShowSkuResults(input){
  const box = cotEl("cotSkuResults");
  const query = input.value.trim();
  if (!query) { box.classList.add("hidden"); return; }
  const results = relSearchArticulos(query, 10);
  if (!results.length) { box.classList.add("hidden"); return; }
  cot.skuActive = Math.min(cot.skuActive, results.length - 1);
  box.innerHTML = results.map((a, i) => `
    <div class="rel-result ${i === cot.skuActive ? "is-active" : ""}" data-sku="${escapeHtml(a.sku)}">
      <span class="sku">${escapeHtml(a.sku)}</span><span>${escapeHtml(a.nombre)}</span>
    </div>`).join("");
  const rect = input.getBoundingClientRect();
  const below = window.innerHeight - rect.bottom > 260;
  box.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 470))}px`;
  box.style.top = below ? `${rect.bottom + 4}px` : "auto";
  box.style.bottom = below ? "auto" : `${window.innerHeight - rect.top + 4}px`;
  box.classList.remove("hidden");
  box.querySelectorAll("[data-sku]").forEach(el => {
    el.addEventListener("mousedown", e => { e.preventDefault(); cotCommitSku(input, el.dataset.sku); });
  });
}

function cotCommitSku(input, sku){
  cotEl("cotSkuResults").classList.add("hidden");
  const tr = input.closest("tr");
  const row = tr && cotRowById(tr.dataset.id);
  if (!row) return;
  if (cotSetSku(row, sku)) { cotRender(); cotSave(); }
  else input.value = row.sku;
}

/* ---------- Agregar renglón a mano ---------- */
function cotRenderAddResults(){
  const box = cotEl("cotAddResults");
  const query = cotEl("cotAddSearch").value.trim();
  if (!query) { box.classList.add("hidden"); box.innerHTML = ""; return; }
  const results = relSearchArticulos(query, 12);
  box.innerHTML = results.length
    ? results.map((a, i) => `
      <div class="rel-result ${i === cot.addActive ? "is-active" : ""}" data-sku="${escapeHtml(a.sku)}">
        <span class="sku">${escapeHtml(a.sku)}</span><span>${escapeHtml(a.nombre)}</span>
      </div>`).join("")
    : `<div class="rel-result-empty">No se encontraron artículos con esa búsqueda.</div>`;
  box.classList.remove("hidden");
  box.querySelectorAll("[data-sku]").forEach(el => {
    el.addEventListener("mousedown", e => { e.preventDefault(); cotAddRow(el.dataset.sku); });
  });
}

function cotAddRow(sku){
  cot.rows.push(cotMakeRow({ sku, cantidad: 1, estado: "manual" }));
  cotEl("cotAddSearch").value = "";
  cot.addActive = 0;
  cotRenderAddResults();
  cotRender();
  cotSave();
  const last = cotEl("cotBody").lastElementChild;
  if (last) last.querySelector('[data-field="cantidad"]').focus();
}

/* ---------- Guardar como relación ---------- */
async function cotSaveRelation(row){
  if (!row.solicitado || !row.sku) return;
  if (!rel.loaded) { cotStatus("Las relaciones todavía no se cargaron. Probá de nuevo en unos segundos.", "error"); relacionesModule.ensureLoaded(); return; }
  const key = relKey(row.solicitado);
  const existing = rel.items.find(r => relKey(r.texto) === key);
  const now = Date.now();
  let next;
  if (existing) {
    if (existing.skus.length === 1 && existing.skus[0] === row.sku) { cotStatus("Esa relación ya estaba guardada.", "ok"); return; }
    if (!confirm(`Ya existe una relación para "${existing.texto}" → ${existing.skus.join(", ")}.\n\n¿Reemplazarla por ${row.sku}?`)) return;
    next = rel.items.map(r => r.id === existing.id ? { ...r, skus: [row.sku], actualizado: now } : r);
  } else {
    next = [{ id: crypto.randomUUID(), texto: row.solicitado, nota: "Creada desde Cotizaciones", skus: [row.sku], creado: now, actualizado: now }, ...rel.items];
  }
  cotStatus("Guardando relación…");
  const ok = await relSave(next, existing ? "Relación actualizada" : "Relación creada");
  if (ok) {
    cotStatus(`Relación guardada: "${row.solicitado}" → ${row.sku}. La próxima vez se encuentra sola.`, "ok");
    // Si era una opción, queda elegida
    cot.rows = cot.rows.filter(r => r.grupo !== row.grupo || r.id === row.id);
    row.estado = "relacion";
    cotRender(); cotSave();
  } else {
    cotStatus("No se pudo guardar la relación. Revisá el aviso en el módulo Relaciones.", "error");
  }
}

/* ---------- Arrastrar para ordenar ---------- */
function cotClearDrop(){
  cotEl("cotBody").querySelectorAll(".drop-before,.drop-after,.dragging").forEach(tr => tr.classList.remove("drop-before", "drop-after", "dragging"));
}

/* ============================================================
   4. EXPORTAR A EXCEL (SheetJS, se carga solo cuando se usa)
   ============================================================ */
let cotXlsxPromise = null;
function cotLoadXlsx(){
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (!cotXlsxPromise) {
    cotXlsxPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
      s.onload = () => window.XLSX ? resolve(window.XLSX) : reject(new Error("No se pudo cargar el generador de Excel."));
      s.onerror = () => { cotXlsxPromise = null; reject(new Error("No se pudo cargar el generador de Excel. Revisá la conexión a internet.")); };
      document.head.appendChild(s);
    });
  }
  return cotXlsxPromise;
}

async function cotExport(){
  if (!cot.rows.length) return;
  const pending = new Set(cot.rows.filter(r => r.estado === "dudosa" && cot.rows.some(o => o.grupo === r.grupo && o.id !== r.id)).map(r => r.grupo)).size;
  if (pending && !confirm(`Hay ${pending} renglón(es) con varias opciones sin elegir. Se van a exportar todas las opciones. ¿Continuar?`)) return;
  const btn = cotEl("cotExportBtn");
  btn.disabled = true;
  try {
    const XLSX = await cotLoadXlsx();
    const cat = getArticulosCatalog();
    const cliente = cotEl("cotCliente").value.trim();
    const fecha = new Date().toLocaleDateString("es-AR");
    const aoa = [
      ["Presupuesto Dentalab"],
      ["Cliente", cliente || "—"],
      ["Fecha", fecha],
      ["Lista de precios", cotPriceTitle()],
      [],
      ["Solicitado", "SKU", "Nombre del artículo", "Texto adicional", "Cantidad", "Precio unitario", "Subtotal"]
    ];
    const firstData = aoa.length + 1;
    cot.rows.forEach((r, i) => {
      const item = r.sku ? cat.bySku.get(r.sku) : null;
      const price = r.sku ? cotPrice(r.sku) : null;
      const rowNum = firstData + i;
      aoa.push([r.solicitado, r.sku, item ? item.nombre : "", r.extra, Number(r.cantidad) || 0,
        price ?? "", price !== null ? { t: "n", f: `E${rowNum}*F${rowNum}`, v: price * (Number(r.cantidad) || 0) } : ""]);
    });
    const lastData = firstData + cot.rows.length - 1;
    const total = cot.rows.reduce((s, r) => { const p = r.sku ? cotPrice(r.sku) : null; return s + (p !== null ? p * (Number(r.cantidad) || 0) : 0); }, 0);
    aoa.push([]);
    aoa.push(["", "", "", "", "", "Total", { t: "n", f: `SUM(G${firstData}:G${lastData})`, v: total }]);

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 40 }, { wch: 14 }, { wch: 52 }, { wch: 28 }, { wch: 10 }, { wch: 16 }, { wch: 16 }];
    const fmt = '"$" #,##0.00';
    for (let r = firstData; r <= lastData + 2; r++) {
      ["F", "G"].forEach(c => { const cell = ws[`${c}${r}`]; if (cell && (typeof cell.v === "number")) cell.z = fmt; });
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Presupuesto");
    const safe = (cliente || "cliente").replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 60);
    const data = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Presupuesto - ${safe} - ${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    cotStatus("Excel descargado.", "ok");
  } catch (error) {
    cotStatus(String(error?.message || error), "error");
  } finally {
    btn.disabled = !cot.rows.length;
  }
}

/* ---------- Borrador en este navegador ---------- */
function cotSave(){
  try {
    localStorage.setItem(COT_DRAFT_KEY, JSON.stringify({
      rows: cot.rows, seq: cot.seq, cliente: cotEl("cotCliente").value,
      priceField: cot.priceField, texto: cotEl("cotTexto").value
    }));
  } catch {}
}
function cotRestore(){
  try {
    const d = JSON.parse(localStorage.getItem(COT_DRAFT_KEY) || "null");
    if (!d) return;
    cot.rows = Array.isArray(d.rows) ? d.rows : [];
    cot.seq = Number(d.seq) || cot.rows.length * 10;
    cot.priceField = d.priceField || "";
    cotEl("cotCliente").value = d.cliente || "";
    cotEl("cotTexto").value = d.texto || "";
  } catch {}
}

function cotClear(){
  if (cot.rows.length && !confirm("¿Borrar el presupuesto actual y empezar uno nuevo?")) return;
  cot.rows = [];
  cotEl("cotCliente").value = "";
  cotEl("cotTexto").value = "";
  try { localStorage.removeItem(COT_DRAFT_KEY); } catch {}
  cotStatus("");
  cotRender();
  cotEl("cotTexto").focus();
}

const cotizacionesModule = {
  ensureLoaded(){
    relacionesModule.ensureLoaded();   // carga artículos + relaciones
    cotRefreshState();
    cotRender();
  },
  reset(){
    cot.rows = []; cot.priceField = "";
    cotEl("cotCliente").value = "";
    cotEl("cotTexto").value = "";
    try { localStorage.removeItem(COT_DRAFT_KEY); } catch {}
    cotStatus("");
    cotSetState("idle", "Preparando", "Se cargan los artículos y las relaciones al abrir este módulo.");
    cotRender();
  }
};

/* ---------- Eventos ---------- */
cotEl("cotProcessBtn").addEventListener("click", cotProcess);
cotEl("cotNewBtn").addEventListener("click", cotClear);
cotEl("cotExportBtn").addEventListener("click", cotExport);
cotEl("cotCliente").addEventListener("input", cotSave);
cotEl("cotTexto").addEventListener("input", cotSave);
cotEl("cotTexto").addEventListener("keydown", e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); cotProcess(); } });
cotEl("cotLista").addEventListener("change", function(){
  cot.priceField = this.value;
  cotRender(); cotSave();
});

const cotBody = cotEl("cotBody");
cotBody.addEventListener("input", e => {
  const input = e.target.closest("[data-field]");
  if (!input) return;
  const row = cotRowById(input.closest("tr").dataset.id);
  if (!row) return;
  if (input.dataset.field === "sku") { cot.skuActive = 0; cotShowSkuResults(input); return; }
  if (input.dataset.field === "extra") row.extra = input.value;
  if (input.dataset.field === "cantidad") { row.cantidad = input.value === "" ? 0 : Number(input.value); cotUpdateTotals(); }
  cotSave();
});
cotBody.addEventListener("focusin", e => {
  if (e.target.matches('[data-field="sku"]')) { cot.activeSkuInput = e.target; cot.skuActive = 0; e.target.select(); }
});
cotBody.addEventListener("focusout", e => {
  if (!e.target.matches('[data-field="sku"]')) return;
  const input = e.target;
  setTimeout(() => {
    if (!document.body.contains(input)) return;
    cotEl("cotSkuResults").classList.add("hidden");
    const row = cotRowById(input.closest("tr").dataset.id);
    if (row && input.value.trim() !== row.sku) cotCommitSku(input, input.value);
  }, 120);
});
cotBody.addEventListener("keydown", e => {
  const input = e.target;
  if (input.matches('[data-field="sku"]')) {
    const box = cotEl("cotSkuResults");
    const items = box.classList.contains("hidden") ? [] : box.querySelectorAll("[data-sku]");
    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && items.length) {
      e.preventDefault();
      cot.skuActive = (cot.skuActive + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      cotShowSkuResults(input);
    } else if (e.key === "Enter") {
      e.preventDefault();
      cotCommitSku(input, items[cot.skuActive] ? items[cot.skuActive].dataset.sku : input.value);
    } else if (e.key === "Escape") {
      box.classList.add("hidden");
      const row = cotRowById(input.closest("tr").dataset.id);
      if (row) input.value = row.sku;
    }
  } else if (e.key === "Enter" && input.matches(".cell-input")) {
    e.preventDefault(); input.blur();
  }
});
cotBody.addEventListener("click", e => {
  const tr = e.target.closest("tr[data-id]");
  if (!tr) return;
  const row = cotRowById(tr.dataset.id);
  if (!row) return;
  if (e.target.closest("[data-delete]")) {
    cot.rows = cot.rows.filter(r => r.id !== row.id);
    // Si queda una sola opción del grupo, pasa a ser la elegida
    const rest = cot.rows.filter(r => r.grupo === row.grupo);
    if (rest.length === 1 && rest[0].estado === "dudosa") rest[0].estado = "manual";
    cotRender(); cotSave();
  } else if (e.target.closest("[data-pick]")) {
    cot.rows = cot.rows.filter(r => r.grupo !== row.grupo || r.id === row.id);
    row.estado = "manual";
    cotRender(); cotSave();
  } else if (e.target.closest("[data-relate]")) {
    cotSaveRelation(row);
  }
});

/* Arrastrar */
cotBody.addEventListener("dragstart", e => {
  const tr = e.target.closest("tr[data-id]");
  if (!tr || !e.target.classList.contains("cot-handle")) { e.preventDefault(); return; }
  cot.dragId = tr.dataset.id;
  tr.classList.add("dragging");
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", cot.dragId);
  try { e.dataTransfer.setDragImage(tr, 20, 20); } catch {}
});
cotBody.addEventListener("dragover", e => {
  if (!cot.dragId) return;
  const tr = e.target.closest("tr[data-id]");
  if (!tr) return;
  e.preventDefault();
  const after = e.clientY > tr.getBoundingClientRect().top + tr.offsetHeight / 2;
  cotBody.querySelectorAll(".drop-before,.drop-after").forEach(x => x.classList.remove("drop-before", "drop-after"));
  if (tr.dataset.id !== cot.dragId) tr.classList.add(after ? "drop-after" : "drop-before");
});
cotBody.addEventListener("drop", e => {
  if (!cot.dragId) return;
  e.preventDefault();
  const tr = e.target.closest("tr[data-id]");
  const fromId = cot.dragId;
  cot.dragId = null;
  if (!tr || tr.dataset.id === fromId) { cotClearDrop(); return; }
  const after = e.clientY > tr.getBoundingClientRect().top + tr.offsetHeight / 2;
  const moving = cotRowById(fromId);
  cot.rows = cot.rows.filter(r => r.id !== fromId);
  let to = cot.rows.findIndex(r => r.id === tr.dataset.id);
  if (after) to += 1;
  cot.rows.splice(to, 0, moving);
  cotRender(); cotSave();
});
cotBody.addEventListener("dragend", () => { cot.dragId = null; cotClearDrop(); });

/* Agregar renglón */
const cotAdd = cotEl("cotAddSearch");
cotAdd.addEventListener("input", () => { cot.addActive = 0; cotRenderAddResults(); });
cotAdd.addEventListener("focus", cotRenderAddResults);
cotAdd.addEventListener("blur", () => cotEl("cotAddResults").classList.add("hidden"));
cotAdd.addEventListener("keydown", e => {
  const items = cotEl("cotAddResults").querySelectorAll("[data-sku]");
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    if (!items.length) return;
    cot.addActive = (cot.addActive + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    cotRenderAddResults();
  } else if (e.key === "Enter") {
    e.preventDefault();
    if (items[cot.addActive]) cotAddRow(items[cot.addActive].dataset.sku);
  } else if (e.key === "Escape") {
    cotEl("cotAddResults").classList.add("hidden");
  }
});

window.addEventListener("scroll", e => {
  if (e.target === cotEl("cotSkuResults")) return;
  cotEl("cotSkuResults").classList.add("hidden");
}, true);
document.addEventListener("aruki:loaded", e => {
  if (e.detail?.endpoint !== `${WORKER_BASE}/articulos`) return;
  cotRefreshState();
  cotRender();
});
/* Refrescar el aviso mientras cargan artículos o relaciones */
setInterval(() => {
  if (!cotEl("view-cotizaciones").classList.contains("hidden")) {
    const btnWasDisabled = cotEl("cotProcessBtn").disabled;
    if (btnWasDisabled || articulosModule.loading) cotRefreshState();
  }
}, 1000);

cotRestore();
