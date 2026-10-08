/* ============================================================
   PRESUPUESTOS › COTIZACIONES — LECTURA DE ARCHIVOS (Etapa 3)
   ------------------------------------------------------------
   Convierte el archivo del cliente en texto, un artículo por renglón,
   lo pone en el cuadro de texto y arma el presupuesto. Todo en el
   navegador, gratis (sin IA):
     · Excel / CSV / ODS → SheetJS
     · Word (.docx)      → mammoth (tablas y párrafos)
     · PDF con texto     → pdf.js (arma renglones y columnas por posición)
     · .txt              → directo
     · PDF (con texto o escaneado) y fotos JPG/PNG → Gemini vía el conector (/ia/leer),
       (las fotos siempre; los PDF si la casilla "Leer PDF con IA" está marcada). Si falla, el PDF usa la lectura común.
   Las tablas con encabezado (Descripción / Cantidad / Presentación / Marca)
   se convierten en "cantidad<TAB>descripción presentación marca".
   ============================================================ */
const COT_LIBS = {
  mammoth: "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.13.0/mammoth.browser.min.js",
  pdf: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
  pdfWorker: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"
};

const cotScriptCache = {};
function cotLoadScript(url, globalName){
  if (window[globalName]) return Promise.resolve(window[globalName]);
  if (!cotScriptCache[url]) {
    cotScriptCache[url] = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = url;
      s.onload = () => window[globalName] ? resolve(window[globalName]) : reject(new Error("No se pudo cargar el lector de archivos."));
      s.onerror = () => { delete cotScriptCache[url]; reject(new Error("No se pudo cargar el lector de archivos. Revisá la conexión a internet.")); };
      document.head.appendChild(s);
    });
  }
  return cotScriptCache[url];
}

/* ---------- Tablas → renglones ---------- */
const COT_COL = {
  desc: /descrip|denominaci|detalle|producto|art[ií]culo|insumo|material|nombre|concepto/i,
  qty: /^\s*(cant|cantidad|ctd|qty|unidades solicitadas|pedido)\b/i,
  pres: /presentaci|^u\.?\s?m\.?$|^u\/m$|unidad de medida|^unidad$/i,
  marca: /marca/i,
  item: /^(r|rengl[oó]n|[ií]tem|it\.?|n[°º]|nro\.?|orden)$/i
};
/* Unidad sola ("U", "Unidad"): no aporta nada al texto solicitado */
const COT_BARE_UNIT = /^(u|un|unid|unidad|und|uds?)\.?$/i;

function cotCell(v){
  return String(v ?? "").replace(/\s+/g, " ").trim();
}

function cotRowsToLines(rows){
  rows = rows.map(r => (r || []).map(cotCell)).filter(r => r.some(Boolean));
  // Buscar la fila de títulos entre las primeras 25
  let h = -1, cols = null;
  for (let i = 0; i < Math.min(25, rows.length) && h < 0; i++) {
    const r = rows[i];
    const find = re => r.findIndex(c => c && c.length < 40 && re.test(c));
    const desc = find(COT_COL.desc);
    if (desc >= 0 && r.filter(Boolean).length >= 2) {
      h = i;
      cols = { desc, qty: find(COT_COL.qty), pres: find(COT_COL.pres), marca: find(COT_COL.marca) };
    }
  }
  if (h < 0) return rows.map(r => r.filter(Boolean).join("\t"));

  const headerDesc = rows[h][cols.desc];
  const out = [];
  for (const r of rows.slice(h + 1)) {
    const desc = r[cols.desc];
    if (!desc || desc === headerDesc) continue;          // vacío o título repetido (PDF de varias páginas)
    const parts = [desc];
    if (cols.pres >= 0 && r[cols.pres]) parts.push(r[cols.pres]);
    if (cols.marca >= 0 && r[cols.marca]) parts.push(r[cols.marca]);
    const texto = parts.join(" ");
    const q = cols.qty >= 0 ? r[cols.qty] : "";
    if (q && /^\d+([.,]\d+)?$/.test(q)) out.push(`${q}\t${texto}`);
    else if (q) out.push(`${texto} - ${q}`);
    else out.push(texto);
  }
  return out;
}

/* ---------- Lectores por tipo ---------- */
async function cotReadExcel(file){
  const XLSX = await cotLoadXlsx();
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const lines = [];
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false, defval: "" });
    lines.push(...cotRowsToLines(rows));
  }
  return lines;
}

async function cotReadWord(file){
  if (/\.doc$/i.test(file.name)) throw new Error("Los archivos .doc viejos no se pueden leer. Abrilo en Word y guardalo como .docx.");
  const mammoth = await cotLoadScript(COT_LIBS.mammoth, "mammoth");
  const { value: html } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const lines = [];
  const walk = node => {
    for (const el of node.children) {
      if (el.tagName === "TABLE") {
        const rows = [...el.querySelectorAll("tr")].map(tr => [...tr.children].map(td => td.textContent));
        lines.push(...cotRowsToLines(rows));
      } else if (/^(P|LI|H[1-6])$/.test(el.tagName)) {
        const t = cotCell(el.textContent);
        if (t) lines.push(t);
      } else {
        walk(el);
      }
    }
  };
  walk(doc.body.firstElementChild);
  return lines;
}

let cotPdfReady = null;
async function cotLoadPdf(){
  const pdfjs = await cotLoadScript(COT_LIBS.pdf, "pdfjsLib");
  if (!cotPdfReady) {
    // El "worker" se carga desde un blob para que funcione aunque venga de otro dominio
    cotPdfReady = fetch(COT_LIBS.pdfWorker)
      .then(r => { if (!r.ok) throw new Error(); return r.text(); })
      .then(code => { pdfjs.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([code], { type: "text/javascript" })); })
      .catch(() => { pdfjs.GlobalWorkerOptions.workerSrc = COT_LIBS.pdfWorker; });
  }
  await cotPdfReady;
  return pdfjs;
}

/* PDF: se agrupan los textos por renglón (misma altura).
   Si aparece una fila de títulos (Cant. / Descripción / …):
     · cada texto va a la columna del título que tiene encima (el que más se superpone,
       o el más cercano), así funciona aunque el título esté centrado y el texto no;
     · los artículos que ocupan varios renglones (descripción en 2 líneas, cantidad
       centrada abajo, precios en otro renglón) se juntan en uno solo.
   Si no hay títulos, se separan columnas donde hay un hueco grande. */
function cotPdfRole(title){
  if (COT_COL.item.test(title.trim())) return "item";
  if (COT_COL.qty.test(title)) return "qty";
  if (COT_COL.desc.test(title)) return "desc";
  if (COT_COL.pres.test(title)) return "pres";
  if (COT_COL.marca.test(title)) return "marca";
  return "other";
}

function cotPdfColumn(cell, cols, descX){
  let best = -1, bestOverlap = 0;
  cols.forEach((c, i) => {
    const ov = Math.min(cell.x + cell.w, c.x + c.w) - Math.max(cell.x, c.x);
    if (ov > bestOverlap) { bestOverlap = ov; best = i; }
  });
  if (best >= 0) return best;
  // Texto corto que no queda debajo de ningún título: si arranca donde arrancan las descripciones, es descripción
  const d = cols.findIndex(c => c.role === "desc");
  if (d >= 0 && Number.isFinite(descX) && cell.x >= descX - 3 && cell.x < cols[d].x + cols[d].w) return d;
  const mid = cell.x + cell.w / 2;
  let dist = Infinity;
  cols.forEach((c, i) => { const d = Math.abs(c.x + c.w / 2 - mid); if (d < dist) { dist = d; best = i; } });
  return best;
}

/* Membrete y pie de página: renglones que se repiten arriba (o abajo) en la mayoría de
   las hojas ("MINISTERIO…", "PLIEG-…", "Página 3 de 9"). Se sacan de arriba y de abajo de
   cada hoja junto con los renglones de solo símbolos (*****) y los números de página. */
function cotPdfStripPageChrome(pages){
  if (pages.length < 2) return;
  const K = 8;
  const rowText = r => r.items.map(it => it.s).join(" ");
  const norm = r => foldText(rowText(r)).replace(/\d+/g, "#").replace(/\s+/g, " ").trim();
  const letters = r => (rowText(r).match(/\p{L}/gu) || []).length;
  const count = rows => {
    const m = {};
    pages.forEach(p => new Set(rows(p).map(norm)).forEach(t => { m[t] = (m[t] || 0) + 1; }));
    return m;
  };
  const need = Math.max(2, Math.ceil(pages.length / 2));
  const top = count(p => p.slice(0, K));
  const bottom = count(p => p.slice(-K));
  const junk = r => !/[\p{L}\d]/u.test(rowText(r));
  const pageNo = r => /^(p[aá]g(ina)?\.?\s*)?\d+(\s*(de|\/)\s*\d+)?$/i.test(rowText(r).trim());
  pages.forEach(rows => {
    while (rows.length && (junk(rows[0]) || (letters(rows[0]) >= 6 && top[norm(rows[0])] >= need))) rows.shift();
    while (rows.length) {
      const r = rows[rows.length - 1];
      if (junk(r) || pageNo(r) || (letters(r) >= 6 && bottom[norm(r)] >= need)) rows.pop();
      else break;
    }
  });
}

const COT_PDF_END = /condiciones de pago|forma de pago|son pesos|sub\s*total|^total\b|importe total|observaciones|firma\b|lugar de entrega/i;

/* Párrafo que cruza de la columna de descripción hasta las columnas de la derecha:
   ya no es parte de la tabla (condiciones, aclaraciones, etc.). Solo con columna de renglón. */
function cotPdfIsProse(items, cols){
  if (!cols.some(c => c.role === "item")) return false;
  const d = cols.find(c => c.role === "desc");
  const right = cols.filter(c => c.role === "pres" || c.role === "qty").sort((a, b) => a.x - b.x)[0];
  if (!d || !right) return false;
  return items.some(it => it.x < d.x + d.w / 2 && it.x + it.w > right.x + right.w);
}

/* Planillas con columna de renglón (R / Ítem / N°): cada artículo termina en el renglón
   que trae número o cantidad. La descripción puede estar arriba de ese renglón (varias
   líneas) o en la misma línea. Una línea que empieza con una palabra en MAYÚSCULAS es un
   artículo nuevo; si empieza en minúscula, número o símbolo, sigue el anterior. */
function cotPdfGroupByItem(marked, descX){
  const out = [];
  let pending = null;
  const startsNew = text => {
    const w = (text.match(/^[\p{L}]+/u) || [""])[0];
    return w.length >= 2 && w === w.toUpperCase() && w !== w.toLowerCase();
  };
  const flush = () => {
    if (pending && pending.desc.length && (pending.qty || pending.item)) {
      const texto = [...pending.desc, ...pending.extra].join(" ")
        .replace(/(\p{L})- (\p{Ll})/gu, "$1$2")          // "es- malte" → "esmalte"
        .replace(/\s+/g, " ").trim();
      const q = pending.qty;
      if (q && /^\d+([.,]\d+)?$/.test(q)) out.push(`${q}\t${texto}`);
      else if (q) out.push(`${texto} - ${q}`);
      else out.push(texto);
    }
    pending = null;
  };
  for (const m of marked) {
    if (m.header) continue;
    const v = { item: [], qty: [], desc: [], pres: [], marca: [], other: [] };
    for (const { role, it } of m.parts) {
      const glued = it.s.match(/^(\d{1,4})\s+(.*\p{L}.*)$/u);
      if (glued && (role === "item" || (role === "desc" && Number.isFinite(descX) && it.x < descX - 3))) {
        v.item.push(glued[1]); v.desc.push(glued[2]);    // número de renglón pegado al texto
      } else {
        v[role].push(it.s);
      }
    }
    const item = v.item.join(" ").trim();
    const qty = v.qty.join(" ").trim();
    const desc = v.desc.join(" ").trim();
    const extra = [...v.pres.filter(p => !COT_BARE_UNIT.test(p.trim())), ...v.marca].join(" ").trim();
    if (!item && !qty && !desc && !extra) continue;

    if (item || qty) {                                   // renglón que cierra un artículo
      if (pending && !pending.closed) {
        if (desc) pending.desc.push(desc);
      } else {
        flush();
        pending = { desc: desc ? [desc] : [], extra: [] };
      }
      if (extra) pending.extra.push(extra);
      if (qty) pending.qty = qty;
      if (item) pending.item = item;
      pending.closed = true;
    } else if (desc) {
      if (pending && pending.closed && startsNew(desc)) flush();
      if (!pending) pending = { desc: [], extra: [], closed: false };
      pending.desc.push(desc);
      if (extra) pending.extra.push(extra);
    } else if (pending && extra) {
      pending.extra.push(extra);
    }
  }
  flush();
  return out;
}

async function cotReadPdf(file){
  const pdfjs = await cotLoadPdf();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  let chars = 0;

  // 1) Leer todas las páginas y agrupar los textos por renglón
  const pages = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const content = await (await pdf.getPage(p)).getTextContent();
    const items = content.items
      .filter(it => it.str && it.str.trim())
      .map(it => ({ s: it.str.trim(), x: it.transform[4], y: it.transform[5], w: it.width || 0, h: Math.abs(it.transform[3]) || 10 }));
    chars += items.reduce((n, it) => n + it.s.length, 0);
    items.sort((a, b) => b.y - a.y || a.x - b.x);
    const rows = [];
    for (const it of items) {
      const row = rows.find(r => Math.abs(r.y - it.y) <= Math.max(2.5, it.h * 0.35));
      if (row) row.items.push(it); else rows.push({ y: it.y, items: [it] });
    }
    rows.sort((a, b) => b.y - a.y);
    rows.forEach(r => r.items.sort((a, b) => a.x - b.x));
    pages.push(rows);
  }
  cotPdfStripPageChrome(pages);
  if (chars < 15) {
    throw new Error("Este PDF parece escaneado (es una imagen, no tiene texto). Para leerlo marcá la casilla \"Leer PDF y fotos con IA\".");
  }

  // Unir textos muy pegados (para reconocer la fila de títulos)
  const joinCells = items => {
    const cells = [];
    for (const it of items) {
      const last = cells[cells.length - 1];
      if (last && it.x - (last.x + last.w) < Math.max(4, it.h * 0.5)) { last.s += " " + it.s; last.w = it.x + it.w - last.x; }
      else cells.push({ ...it });
    }
    return cells;
  };
  const isHeaderRow = cells => cells.length >= 2 && cells.every(c => c.s.length < 40) && cells.some(c => COT_COL.desc.test(c.s));

  // Dónde arrancan normalmente las descripciones: el x más repetido de los textos que pasan por debajo
  // del título "Descripción" (sirve si el título está centrado y el texto alineado a la izquierda)
  const xs = {};
  {
    let dcol = null;
    pages.forEach(rows => rows.forEach(r => {
      const cells = joinCells(r.items);
      if (isHeaderRow(cells)) { const c = cells.find(c => COT_COL.desc.test(c.s)); dcol = c ? { x: c.x, w: c.w } : null; return; }
      if (!dcol) return;
      r.items.forEach(it => {
        if (Math.min(it.x + it.w, dcol.x + dcol.w) - Math.max(it.x, dcol.x) > 0) { const k = Math.round(it.x); xs[k] = (xs[k] || 0) + 1; }
      });
    }));
  }
  const descX = Number(Object.keys(xs).sort((a, b) => xs[b] - xs[a])[0] ?? NaN);

  // 2) Marcar títulos y asignar cada texto a una columna
  let cols = null, ended = false;
  const marked = [];        // { page, y, h, header?, cols, parts:[{role, it}] }
  const plainLines = [];
  pages.forEach((rows, pi) => {
    for (const r of rows) {
      const cells = joinCells(r.items);
      if (isHeaderRow(cells)) {
        cols = cells.map(c => ({ x: c.x, w: c.w, role: cotPdfRole(c.s), title: c.s }));
        ended = false;
        marked.push({ page: pi, header: true });
        continue;
      }
      if (!cols) {
        let line = "", end = null;
        for (const c of cells) {
          if (end !== null) line += c.x - end > Math.max(12, c.h * 1.2) ? "\t" : " ";
          line += c.s; end = c.x + c.w;
        }
        plainLines.push(line);
        continue;
      }
      if (ended) continue;
      if (r.items.some(it => COT_PDF_END.test(it.s))) { ended = true; continue; }   // pie de la orden
      if (cotPdfIsProse(r.items, cols)) { ended = true; continue; }               // texto corrido después de la tabla
      const h = Math.max(...r.items.map(it => it.h));
      marked.push({ page: pi, y: r.y, h, cols, parts: r.items.map(it => ({ role: cols[cotPdfColumn(it, cols, descX)].role, it })) });
    }
  });
  if (!cols) {
    const tabbed = plainLines.filter(l => l.includes("\t")).length;
    if (tabbed >= plainLines.length * 0.4) return cotRowsToLines(plainLines.map(l => l.split("\t")));
    return plainLines;
  }


  // 3) Armar los artículos (juntando los que ocupan varios renglones)
  if (marked.some(m => m.cols && m.cols.some(c => c.role === "item"))) return cotPdfGroupByItem(marked, descX);
  const out = [];
  let pending = null, last = null;
  const flush = () => {
    if (pending && pending.desc.length) {
      const texto = [...pending.desc, ...pending.extra].join(" ").replace(/\s+/g, " ").trim();
      const q = pending.qty;
      if (q && /^\d+([.,]\d+)?$/.test(q)) out.push(`${q}\t${texto}`);
      else if (q) out.push(`${texto} - ${q}`);
      else out.push(texto);
    }
    pending = null;
  };

  for (const m of marked) {
    if (m.header) { flush(); last = null; continue; }
    if (last && last.page !== m.page) { flush(); last = null; }
    const v = { qty: [], desc: [], pres: [], marca: [], other: [], item: [] };
    for (const { role, it } of m.parts) {
      const glued = it.s.match(/^(\d+(?:[.,]\d+)?)\s+(.*\p{L}.*)$/u);
      if (glued && (role === "qty" || (role === "desc" && Number.isFinite(descX) && it.x < descX - 3))) {
        v.qty.push(glued[1]); v.desc.push(glued[2]);       // cantidad y texto pegados
      } else {
        v[role].push(it.s);
      }
    }
    const qty = v.qty.join(" ").trim();
    const desc = v.desc.join(" ").trim();
    const extra = [...v.pres, ...v.marca].join(" ").trim();
    const hasOther = v.other.length > 0;
    const hasOtherCols = m.cols.some(c => c.role === "other");
    if (desc && m.cols.some(c => c.role === "desc" && c.title === desc)) continue;   // título repetido
    if (!qty && !desc && !extra && !hasOther) continue;

    // ¿Empieza otro artículo? Hueco más grande que el interlineado, ya teníamos cantidad y llega otra,
    // o ya teníamos la fila de precios y llega otra.
    const gap = last ? last.y - m.y : 0;
    if (pending && (gap > Math.max(last.h, m.h) * 1.45 || (qty && pending.qty) || (hasOther && pending.other))) flush();
    last = m;

    if (qty && desc && (hasOther || !hasOtherCols) && !pending) {
      pending = { qty, desc: [desc], extra: extra ? [extra] : [], other: true };
      flush();
      continue;
    }
    if (!pending) pending = { qty: "", desc: [], extra: [], other: false };
    if (hasOther) pending.other = true;
    if (qty) pending.qty = qty;
    if (desc) pending.desc.push(desc);
    if (extra) pending.extra.push(extra);
  }
  flush();
  return out;
}

/* ---------- Lectura con IA (PDF, PDF escaneado, fotos) ---------- */
const COT_IA_LEER_KEY = "aruki-cot-ia-leer";

async function cotWorkerPost(path, body){
  const token = getAuthToken();
  if (!token) throw new SessionExpired("Sesión vencida.");
  const response = await fetch(`${WORKER_BASE}${path}`, {
    method: "POST",
    headers: { "Accept": "application/json", "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
    body: JSON.stringify(body),
    cache: "no-store"
  });
  let payload = null;
  try { payload = await response.json(); } catch {}
  if (response.status === 401) throw new SessionExpired("Sesión vencida.");
  if (response.status === 404) throw new Error("el conector de Cloudflare todavía no tiene esta función (hay que pegar el código nuevo y tocar Deploy)");
  if (!response.ok || payload?.error || !payload) throw new Error(payload?.error || `error HTTP ${response.status}`);
  return payload;
}

function cotBlobToBase64(blob){
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] || "");
    r.onerror = () => reject(new Error("No se pudo leer el archivo."));
    r.readAsDataURL(blob);
  });
}

/* Fotos grandes del celular: se achican (máx. 2000 px, JPG) para que viajen rápido y gasten menos */
async function cotPrepareImage(file){
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 1.5 * 1024 * 1024) return { blob: file, mime: file.type || "image/jpeg" };
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d").drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(res => canvas.toBlob(res, "image/jpeg", 0.85));
    return blob ? { blob, mime: "image/jpeg" } : { blob: file, mime: file.type || "image/jpeg" };
  } catch {
    return { blob: file, mime: file.type || "image/jpeg" };
  }
}

async function cotReadWithIA(file, isPdf){
  let blob = file, mime = "application/pdf";
  if (!isPdf) ({ blob, mime } = await cotPrepareImage(file));
  if (blob.size > 14 * 1024 * 1024) throw new Error("el archivo es demasiado grande para leerlo con IA (máximo 14 MB)");
  const data = await cotWorkerPost("/ia/leer", { archivo: await cotBlobToBase64(blob), mimeType: mime, nombre: file.name || "" });
  return (data.renglones || []).map(r => {
    const texto = [r.descripcion, r.presentacion, r.marca].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    return r.cantidad ? `${r.cantidad}\t${texto}` : texto;
  }).filter(Boolean);
}

async function cotReadFile(file){
  const name = file.name || "";
  const isPdf = /\.pdf$/i.test(name) || file.type === "application/pdf";
  const isImg = /\.(jpe?g|png|webp)$/i.test(name) || /^image\/(jpeg|png|webp)$/.test(file.type);
  if (/\.heic$/i.test(name) || /heic|heif/i.test(file.type)) {
    throw new Error("Las fotos HEIC del iPhone no se pueden leer. Mandala como JPG (o sacale captura de pantalla) y subila de nuevo.");
  }
  // Las fotos siempre van por IA (no hay otra forma de leerlas); los PDF, según la casilla
  if (isImg || (isPdf && cotEl("cotIaLeer").checked)) {
    cotFileHint(`La IA está leyendo ${name}… (puede tardar unos segundos)`);
    try {
      const lines = await cotReadWithIA(file, isPdf);
      if (!lines.length) throw new Error("la IA no encontró una lista de artículos en el archivo");
      cotReadFile.via = "IA";
      return lines;
    } catch (error) {
      if (error instanceof SessionExpired) throw error;
      const motivo = String(error.message || error).replace(/[.\s]+$/, "");
      if (!isPdf) throw new Error(`No se pudo leer la foto con IA: ${motivo}.`);
      cotReadFile.motivo = motivo;
      cotReadFile.aviso = `No se pudo leer con IA (${motivo}); se usó la lectura común, revisá el texto.`;
    }
  }
  cotReadFile.via = "";
  if (/\.(xlsx|xls|xlsm|ods|csv)$/i.test(name)) return cotReadExcel(file);
  if (/\.(docx|doc)$/i.test(name)) return cotReadWord(file);
  if (isPdf) {
    try { return await cotReadPdf(file); }
    catch (e) {
      // PDF escaneado y la IA no pudo: no hay otra forma de leerlo
      if (cotReadFile.aviso && /escaneado/.test(e.message)) {
        throw new Error(`No se pudo leer con IA (${cotReadFile.motivo}) y este PDF es escaneado, así que no hay otra forma de leerlo. Probá de nuevo en unos minutos.`);
      }
      throw e;
    }
  }
  if (/^image\//.test(file.type)) {
    throw new Error("Ese formato de imagen no se puede leer. Usá JPG o PNG.");
  }
  if (/\.txt$/i.test(name) || /^text\//.test(file.type)) return (await file.text()).split(/\r?\n/);
  throw new Error("Ese tipo de archivo no se puede leer. Usá Excel, Word, PDF o texto.");
}

/* ---------- Pantalla ---------- */
function cotFileHint(text, kind){
  const el = cotEl("cotInputHint");
  el.textContent = text;
  el.style.color = kind === "error" ? "var(--red)" : kind === "ok" ? "var(--green)" : "";
}

async function cotHandleFile(file){
  if (!file) return;
  const drop = cotEl("cotDrop");
  drop.classList.add("is-busy");
  cotFileHint(`Leyendo ${file.name}…`);
  cotReadFile.aviso = ""; cotReadFile.via = ""; cotReadFile.motivo = "";
  try {
    const lines = (await cotReadFile(file)).map(l => String(l).trim()).filter(Boolean);
    if (!lines.length) throw new Error("No se encontró ninguna lista de artículos en el archivo.");
    const box = cotEl("cotTexto");
    if (box.value.trim() && !confirm("Ya hay texto en el cuadro. ¿Reemplazarlo por lo que dice el archivo?")) return;
    box.value = lines.join("\n");
    cotSave();
    const via = cotReadFile.via === "IA" ? " con IA" : "";
    if (cotReadFile.aviso) cotFileHint(`${file.name} · ${lines.length} renglones. ${cotReadFile.aviso}`, "error");
    else cotFileHint(`Leído${via}: ${file.name} · ${lines.length} renglones. Si algo salió mal, corregí el texto y tocá Armar presupuesto.`, "ok");
    if (!cotEl("cotProcessBtn").disabled) {
      const hint = cotEl("cotInputHint").textContent, color = cotEl("cotInputHint").style.color;
      cotProcess();
      cotEl("cotInputHint").textContent = hint; cotEl("cotInputHint").style.color = color;
    }
    else cotFileHint(`Leído: ${file.name} · ${lines.length} renglones. Cuando terminen de cargar los artículos, tocá Armar presupuesto.`, "ok");
  } catch (error) {
    if (error instanceof SessionExpired) { clearSession(); showLogin("La sesión venció. Volvé a ingresar."); return; }
    cotFileHint(String(error?.message || error), "error");
  } finally {
    drop.classList.remove("is-busy");
  }
}

cotEl("cotFileBtn").addEventListener("click", () => cotEl("cotFile").click());
(function(){
  const box = cotEl("cotIaLeer");
  try { const v = localStorage.getItem(COT_IA_LEER_KEY); if (v !== null) box.checked = v === "1"; } catch {}
  box.addEventListener("change", () => { try { localStorage.setItem(COT_IA_LEER_KEY, box.checked ? "1" : "0"); } catch {} });
})();
cotEl("cotFile").addEventListener("change", function(){
  const f = this.files[0];
  this.value = "";
  cotHandleFile(f);
});
/* Arrastrar y soltar sobre el panel 1 (zona del archivo o cuadro de texto) */
(function(){
  const panel = cotEl("cotInputPanel");
  const drop = cotEl("cotDrop");
  let depth = 0;
  const hasFiles = e => [...(e.dataTransfer?.types || [])].includes("Files");
  panel.addEventListener("dragenter", e => { if (!hasFiles(e)) return; e.preventDefault(); depth++; drop.classList.add("is-over"); });
  panel.addEventListener("dragover", e => { if (hasFiles(e)) e.preventDefault(); });
  panel.addEventListener("dragleave", e => { if (!hasFiles(e)) return; depth = Math.max(0, depth - 1); if (!depth) drop.classList.remove("is-over"); });
  panel.addEventListener("drop", e => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth = 0; drop.classList.remove("is-over");
    cotHandleFile(e.dataTransfer.files[0]);
  });
})();
