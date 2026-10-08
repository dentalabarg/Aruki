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
const COT_IA_LOTE = 25;          // renglones por consulta
const COT_IA_CANDIDATOS = 12;
let cotIaBusy = false;

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

async function cotIaPost(renglones){
  const token = getAuthToken();
  if (!token) throw new SessionExpired("Sesión vencida.");
  const response = await fetch(`${WORKER_BASE}/ia/elegir`, {
    method: "POST",
    headers: { "Accept": "application/json", "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
    body: JSON.stringify({ renglones }),
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
  return payload.resultados || [];
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
  try {
    for (let i = 0; i < pedidos.length; i += COT_IA_LOTE) {
      const lote = pedidos.slice(i, i + COT_IA_LOTE);
      if (pedidos.length > COT_IA_LOTE) cotStatus(`La IA está revisando… ${Math.min(i + COT_IA_LOTE, pedidos.length)} de ${pedidos.length}`);
      (await cotIaPost(lote)).forEach(r => resultados.set(r.id, r));
    }
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
  cotStatus(`${msg} Pasá el mouse sobre "Elegido por IA" para ver por qué. Si está bien, podés guardarlo como relación.`, "ok");
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
