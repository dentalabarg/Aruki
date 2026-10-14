/* ============================================================
   PRESUPUESTOS › COTIZACIONES — AYUDA CON IA (Gemini)
   ------------------------------------------------------------
   Los renglones que quedan "con opciones" (amarillo) o "sin coincidencia"
   (rojo) se mandan al conector (/ia/elegir) con sus ~12 artículos más
   parecidos. Gemini elige uno (o ninguno). Nunca se manda el catálogo
   entero, y la clave de Gemini vive solo en Cloudflare.
   Puede correr solo después de "Armar presupuesto" (casilla) o con el botón.
   ============================================================ */
const COT_IA_KEY = "aruki-cot-ia";
const COT_IA_LOTE = 20;          // renglones por consulta
const COT_IA_PARALELO = 3;       // consultas a la vez
const COT_IA_CANDIDATOS = 12;
const COT_IA_EJ_POR_RENGLON = 3;  // relaciones parecidas que se mandan como ejemplo por renglón
const COT_IA_EJ_MAX = 30;          // máximo de ejemplos por consulta
const COT_IA_REGLAS_MAX = 60;
let cotIaBusy = false;

/* ---------- "Entrenamiento" con Relaciones (v4.6) ----------
   · Reglas para la IA (instrucciones libres) + equivalencias de palabras → van siempre.
   · Relaciones de texto / por condiciones más parecidas a cada renglón → van como ejemplos
     ("el cliente escribió X → era el artículo Y"). Así Gemini aprende de lo que ya corregiste. */
function cotIaReglas(){
  const ia = [], eq = [];
  for (const r of rel.items) {
    if (relEsIa(r)) ia.push(r.texto);
    else if (relEsPalabra(r)) eq.push(`"${r.texto}" es lo mismo que "${r.reemplazo}".`);
  }
  return [...ia, ...eq].slice(0, COT_IA_REGLAS_MAX);
}

function cotIaBaseEjemplos(){
  const cat = getArticulosCatalog();
  const out = [];
  for (const r of rel.items) {
    const tipo = relTipo(r);
    if ((tipo !== "texto" && tipo !== "reglas") || !r.skus.length) continue;
    const texto = tipo === "reglas" ? r.reglas.filter(g => REL_OPS[g.op]?.pos).map(g => g.valor).join(" ") : r.texto;
    const tokens = new Set(cotTokens(texto));
    if (!tokens.size) continue;
    out.push({
      tokens,
      ejemplo: {
        escribio: tipo === "reglas" ? `(cualquier renglón que ${relReglasTexto(r.reglas)})` : r.texto,
        articulos: r.skus.slice(0, 4).map(sku => ({ sku, nombre: cat.bySku.get(String(sku))?.nombre || "" })),
        ...(r.nota ? { nota: r.nota } : {})
      }
    });
  }
  return out;
}

function cotIaEjemplos(lote, base){
  if (!base.length) return [];
  const elegidos = new Map();
  for (const p of lote) {
    const t = new Set(cotTokens(p.solicitado));
    if (!t.size) continue;
    const scored = [];
    for (const b of base) {
      let comunes = 0;
      t.forEach(x => { if (b.tokens.has(x)) comunes++; });
      if (!comunes) continue;
      const score = comunes / Math.sqrt(t.size * b.tokens.size);
      if (score >= 0.3) scored.push({ b, score });
    }
    scored.sort((x, y) => y.score - x.score);
    scored.slice(0, COT_IA_EJ_POR_RENGLON).forEach(({ b, score }) => {
      if ((elegidos.get(b)?.score || 0) < score) elegidos.set(b, { score });
    });
  }
  return [...elegidos.entries()].sort((x, y) => y[1].score - x[1].score).slice(0, COT_IA_EJ_MAX).map(([b]) => b.ejemplo);
}

function cotRenglones(n){ return `${n} ${n === 1 ? "renglón" : "renglones"}`; }

/* Grupos (renglones pedidos) que conviene revisar */
function cotIaPendientes(){
  const groups = cotGroupInfo();
  const seen = new Set();
  const out = [];
  for (const r of cot.rows) {
    if (seen.has(r.grupo)) continue;
    seen.add(r.grupo);
    const estado = cotShownEstado(r, groups);
    if ((estado === "dudosa" || estado === "sin") && r.solicitado && !r.iaRevisado) out.push(r.grupo);
  }
  return out;
}

function cotIaRefresh(){
  const btn = cotEl("cotIaBtn");
  if (!btn) return;
  const n = cotIaPendientes().length;
  btn.disabled = cotIaBusy || !n;
  btn.classList.toggle("is-busy", cotIaBusy);
  btn.lastChild.textContent = cotIaBusy ? "La IA está revisando…" : n ? `Revisar ${n} dudoso${n === 1 ? "" : "s"} con IA` : "Revisar dudosos con IA";
}

async function cotIaPost(renglones, reglas = [], ejemplos = []){
  const token = getAuthToken();
  if (!token) throw new SessionExpired("Sesión vencida.");
  const response = await fetch(`${WORKER_BASE}/ia/elegir`, {
    method: "POST",
    headers: { "Accept": "application/json", "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
    body: JSON.stringify({ renglones, reglas, ejemplos }),
    cache: "no-store"
  });
  let payload;
  try { payload = await response.json(); }
  catch {
    if (response.status === 404) throw new Error("El conector de Cloudflare todavía no tiene la función de IA. Hay que pegar el código nuevo del conector (Deploy).");
    throw new Error(`El conector respondió con un formato inválido (HTTP ${response.status}).`);
  }
  if (response.status === 401) throw new SessionExpired("Sesión vencida.");
  if (response.status === 404) throw new Error("El conector de Cloudflare todavía no tiene la función de IA. Hay que pegar el código nuevo del conector (Deploy).");
  if (!response.ok || payload?.error) throw new Error(payload?.error || `Error HTTP ${response.status}.`);
  return { resultados: payload.resultados || [], modelo: payload.modelo || "", usoGuia: payload.guia === true };
}

async function cotIaRevisar(){
  if (cotIaBusy) return;
  const grupos = cotIaPendientes();
  if (!grupos.length) return;
  const cat = getArticulosCatalog();

  // Armar cada renglón con sus candidatos: las opciones actuales + lo más parecido del catálogo
  const pedidos = [];
  for (const g of grupos) {
    const rows = cot.rows.filter(r => r.grupo === g);
    const first = rows[0];
    const skus = [];
    rows.forEach(r => { if (r.sku && cat.bySku.has(r.sku)) skus.push(r.sku); });
    cotSearch(first.solicitado, COT_IA_CANDIDATOS).forEach(x => skus.push(x.a.sku));
    const unique = [...new Set(skus)].slice(0, 15);
    if (!unique.length) { rows.forEach(r => { r.iaRevisado = true; }); continue; }   // nada parecido para comparar
    pedidos.push({
      id: String(g),
      solicitado: first.solicitado,
      candidatos: unique.map(sku => { const a = cat.bySku.get(sku); return { sku, nombre: a.nombre, marca: a.marca || "" }; })
    });
  }
  if (!pedidos.length) {
    grupos.forEach(g => cot.rows.filter(r => r.grupo === g).forEach(r => { r.iaRevisado = true; }));
    cotRender(); cotSave();
    cotStatus("La IA no tiene artículos parecidos para comparar en esos renglones. Buscalos a mano.", "error");
    return;
  }

  cotIaBusy = true;
  cotIaRefresh();
  cotStatus(`La IA está revisando ${cotRenglones(pedidos.length)}…`);
  const resultados = new Map();
  const modelos = new Set();
  const reglas = cotIaReglas();
  const baseEj = cotIaBaseEjemplos();
  let totalEj = 0, usoGuia = false;
  const inicio = Date.now();
  try {
    // Tandas de 20 renglones, hasta 3 a la vez
    const lotes = [];
    for (let i = 0; i < pedidos.length; i += COT_IA_LOTE) lotes.push(pedidos.slice(i, i + COT_IA_LOTE));
    let next = 0, hechos = 0;
    const worker = async () => {
      while (next < lotes.length) {
        const lote = lotes[next++];
        const ejemplos = cotIaEjemplos(lote, baseEj);
        totalEj += ejemplos.length;
        const res = await cotIaPost(lote, reglas, ejemplos);
        if (res.usoGuia) usoGuia = true;
        res.resultados.forEach(r => resultados.set(r.id, r));
        if (res.modelo) modelos.add(res.modelo);
        hechos += lote.length;
        if (lotes.length > 1) cotStatus(`La IA está revisando… ${Math.min(hechos, pedidos.length)} de ${pedidos.length}`);
      }
    };
    await Promise.all(Array.from({ length: Math.min(COT_IA_PARALELO, lotes.length) }, worker));
  } catch (error) {
    cotIaBusy = false;
    cotIaRefresh();
    if (error instanceof SessionExpired) { clearSession(); showLogin("La sesión venció. Volvé a ingresar."); return; }
    const motivo = String(error.message || error).replace(/[.\s]+$/, "");
    cotStatus(`No se pudo revisar con IA: ${motivo}.${/saturado/i.test(motivo) ? " Probá de nuevo en unos minutos con el botón \"Revisar dudosos con IA\"." : ""}`, "error");
    return;
  }
  cotIaBusy = false;

  // Aplicar (con Deshacer)
  cotPushUndo("la revisión con IA");
  let elegidos = 0, sinRespuesta = 0;
  const next = [];
  const hechos = new Set();
  for (const r of cot.rows) {
    const res = resultados.get(String(r.grupo));
    if (!res) { next.push(r); continue; }
    if (hechos.has(r.grupo)) continue;            // el grupo ya se reemplazó por la elección
    if (res.sku) {
      hechos.add(r.grupo);
      elegidos++;
      next.push({ ...r, id: `r${++cot.seq}`, sku: res.sku, precio: null, estado: "ia", iaMotivo: res.motivo || "", iaRevisado: true });
    } else {
      r.iaRevisado = true;
      next.push(r);
    }
  }
  sinRespuesta = pedidos.length - elegidos;
  cot.rows = next;
  cotRender(); cotSave();
  const msg = `IA: ${cotRenglones(elegidos)} resuelto${elegidos === 1 ? "" : "s"}` +
    (sinRespuesta ? `, ${sinRespuesta} sin un artículo que corresponda (buscalos a mano)` : "") + ".";
  const seg = Math.max(1, Math.round((Date.now() - inicio) / 1000));
  const nIa = rel.items.filter(relEsIa).length;
  const guia = [];
  if (usoGuia && nIa) guia.push(`${nIa} regla${nIa === 1 ? "" : "s"} tuya${nIa === 1 ? "" : "s"}`);
  if (usoGuia && totalEj) guia.push(`${totalEj} ejemplo${totalEj === 1 ? "" : "s"} de tus relaciones`);
  const partes = [...(modelos.size ? [[...modelos].join(", ")] : []), `${seg} s`];
  if (guia.length) partes.push(`usó ${guia.join(" y ")}`);
  else if (!usoGuia && (reglas.length || totalEj)) partes.push("no usó tus relaciones: falta actualizar el conector de Cloudflare");
  const conModelo = ` (${partes.join(" · ")})`;
  cotStatus(`${msg.replace(/\.$/, "")}${conModelo}. Pasá el mouse sobre "Elegido por IA" para ver por qué. Si está bien, podés guardarlo como relación.`, "ok");
  cotShowToast(`IA: ${elegidos} resuelto${elegidos === 1 ? "" : "s"}`);
}

/* Después de "Armar presupuesto", si la casilla está marcada */
function cotIaAfterProcess(){
  if (cotEl("cotIaAuto").checked && cotIaPendientes().length) cotIaRevisar();
}

/* ---------- Eventos ---------- */
(function(){
  const box = cotEl("cotIaAuto");
  try { const v = localStorage.getItem(COT_IA_KEY); if (v !== null) box.checked = v === "1"; } catch {}
  box.addEventListener("change", () => { try { localStorage.setItem(COT_IA_KEY, box.checked ? "1" : "0"); } catch {} });
  cotEl("cotIaBtn").addEventListener("click", cotIaRevisar);
  cotIaRefresh();
})();
