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
   Fotos y PDF escaneados quedan para la Etapa 4 (Gemini).
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
  desc: /descrip|detalle|producto|art[ií]culo|insumo|material|nombre|concepto/i,
  qty: /^\s*(cant|cantidad|ctd|qty|unidades solicitadas|pedido)\b/i,
  pres: /presentaci/i,
  marca: /marca/i
};

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

const COT_PDF_END = /condiciones de pago|forma de pago|son pesos|sub\s*total|^total\b|importe total|observaciones|firma\b|lugar de entrega/i;

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
  if (chars < 15) {
    throw new Error("Este PDF parece escaneado (es una imagen, no tiene texto). Las fotos y los PDF escaneados se van a poder leer en la próxima etapa, con Gemini.");
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
    const v = { qty: [], desc: [], pres: [], marca: [], other: [] };
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

async function cotReadFile(file){
  const name = file.name || "";
  if (/\.(xlsx|xls|xlsm|ods|csv)$/i.test(name)) return cotReadExcel(file);
  if (/\.(docx|doc)$/i.test(name)) return cotReadWord(file);
  if (/\.pdf$/i.test(name) || file.type === "application/pdf") return cotReadPdf(file);
  if (/\.(jpe?g|png|webp|heic)$/i.test(name) || /^image\//.test(file.type)) {
    throw new Error("Las fotos se van a poder leer en la próxima etapa, con Gemini. Por ahora podés pegar la lista a mano.");
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
  try {
    const lines = (await cotReadFile(file)).map(l => String(l).trim()).filter(Boolean);
    if (!lines.length) throw new Error("No se encontró ninguna lista de artículos en el archivo.");
    const box = cotEl("cotTexto");
    if (box.value.trim() && !confirm("Ya hay texto en el cuadro. ¿Reemplazarlo por lo que dice el archivo?")) return;
    box.value = lines.join("\n");
    cotSave();
    cotFileHint(`Leído: ${file.name} · ${lines.length} renglones. Si algo salió mal, corregí el texto y tocá Armar presupuesto.`, "ok");
    if (!cotEl("cotProcessBtn").disabled) cotProcess();
    else cotFileHint(`Leído: ${file.name} · ${lines.length} renglones. Cuando terminen de cargar los artículos, tocá Armar presupuesto.`, "ok");
  } catch (error) {
    cotFileHint(String(error?.message || error), "error");
  } finally {
    drop.classList.remove("is-busy");
  }
}

cotEl("cotFileBtn").addEventListener("click", () => cotEl("cotFile").click());
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
