/*
  ARUKI — Tarea automática (GitHub Actions, cada 3 horas)
  ------------------------------------------------------------
  Baja Clientes, Artículos y Facturas de YiQi a través del conector de Cloudflare
  (las mismas rutas que usa la página) y los deja guardados, comprimidos, en el conector
  (PUT /cache/<nombre>). Así, al abrir Aruki los datos ya están listos.

  Necesita el secreto ARUKI_CACHE_KEY (GitHub → Settings → Secrets and variables → Actions),
  igual al secreto CACHE_KEY del conector en Cloudflare.

  IMPORTANTE: el repositorio es público y los registros de las tareas también.
  Este script nunca imprime datos de YiQi: solo cantidades y tiempos.
*/
import { gzipSync } from "node:zlib";

const BASE = process.env.ARUKI_URL || "https://aruki.dentalabarg.workers.dev";
const KEY = process.env.ARUKI_CACHE_KEY || "";
const NAMES = ["clientes", "articulos", "facturas"];
const CONCURRENCY = 4;
const RETRIES = 3;
/* v7.9: cada pedido tiene un tiempo máximo. Antes, si YiQi no contestaba una página de Facturas, la tarea se
   quedaba esperando hasta que GitHub la cortaba a los 30 min (y Facturas nunca se guardaba). */
const PAGE_TIMEOUT_MS = 60 * 1000;
const PUT_TIMEOUT_MS = 120 * 1000;
const DATASET_MAX_MS = 12 * 60 * 1000;

if (KEY.length < 20) {
  console.error("Falta el secreto ARUKI_CACHE_KEY (o es muy corto). Cargalo en GitHub → Settings → Secrets and variables → Actions.");
  process.exit(1);
}

const headers = { "X-Aruki-Key": KEY, "Accept": "application/json" };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getPage(name, page, extra = "") {
  let last;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    try {
      const res = await fetch(`${BASE}/${name}?page=${page}${extra}`, { headers, signal: AbortSignal.timeout(PAGE_TIMEOUT_MS) });
      let body;
      try { body = await res.json(); } catch { throw new Error(`respuesta inválida (HTTP ${res.status})`); }
      if (res.status === 401) throw Object.assign(new Error("el conector no aceptó la clave (revisá que CACHE_KEY y ARUKI_CACHE_KEY sean iguales)"), { fatal: true });
      if (!res.ok || body?.error) throw new Error(body?.error || `HTTP ${res.status}`);
      if (!Array.isArray(body?.data)) throw new Error("la respuesta no trae una lista");
      return body;
    } catch (error) {
      last = error?.name === "TimeoutError" ? new Error(`la página ${page} no contestó en ${PAGE_TIMEOUT_MS / 1000} s`) : error;
      if (error.fatal) throw error;
      if (attempt < RETRIES) await sleep(1500 * (attempt + 1));
    }
  }
  throw last;
}

async function getAll(name) {
  const first = await getPage(name, 1);
  const extra = first.modo ? `&modo=${encodeURIComponent(first.modo)}` : "";
  const pageSize = first.data.length || 1;
  const total = Number(first.total) || first.data.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pages = new Array(totalPages + 1);
  pages[1] = first.data;
  const failed = [];
  let lastError = "";
  const t0 = Date.now();
  let next = 2;
  const worker = async () => {
    while (true) {
      const p = next++;
      if (p > totalPages) return;
      if (Date.now() - t0 > DATASET_MAX_MS) { failed.push(p); continue; }   // se pasó del tiempo: no pide más
      try { pages[p] = (await getPage(name, p, extra)).data; }
      catch (error) { if (error.fatal) throw error; failed.push(p); lastError = error.message; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, totalPages - 1) }, worker));
  // Las que fallaron se prueban una vez más, de a una (YiQi a veces se traba con varias a la vez)
  for (const p of failed.splice(0)) {
    if (Date.now() - t0 > DATASET_MAX_MS) { failed.push(p); continue; }
    try { pages[p] = (await getPage(name, p, extra)).data; }
    catch (error) { if (error.fatal) throw error; failed.push(p); lastError = error.message; }
  }
  const rows = [];
  for (let p = 1; p <= totalPages; p++) if (pages[p]) rows.push(...pages[p]);
  return { rows, columns: first.columns, total, modo: first.modo || "", motivo: first.motivo || "", failed, totalPages, lastError };
}

/* v7.5 Cobranzas: 4 partes (facturas emitidas y entregadas con saldo, saldos a favor, últimos pagos) */
async function getParte(parte) {
  const extra = `&parte=${parte}`;
  const first = await getPage("cobranzas", 1, extra);
  const pageSize = Number(first.pageSize) || first.data.length || 1;
  const total = Number(first.total) || first.data.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const rows = [...first.data];
  for (let p = 2; p <= pages; p++) rows.push(...(await getPage("cobranzas", p, extra)).data);
  return rows;
}
async function getCobranzas() {
  const [emitidas, entregadas, saldos, pagos] = [await getParte("emitidas"), await getParte("entregadas"), await getParte("saldos"), await getParte("pagos")];
  return { facturas: [...emitidas, ...entregadas], saldos, pagos };
}

/* v7.8: la tarea se intenta cada hora; si la última actualización automática es reciente, no hace nada
   (a mano, con "Run workflow", siempre actualiza). */
const MIN_HORAS = 2.75;
if (process.env.FORZAR !== "si") {
  try {
    const r = await fetch(`${BASE}/cache`, { headers, signal: AbortSignal.timeout(PAGE_TIMEOUT_MS) });
    const meta = r.ok ? (await r.json()).datos || {} : {};
    const last = Math.max(0, ...Object.values(meta).map(d => Number(d.robot) || 0));
    const horas = (Date.now() - last) / 3600000;
    if (last && horas < MIN_HORAS) {
      console.log(`Sin cambios: la última actualización automática fue hace ${horas.toFixed(1)} h (se actualiza cada ~3 h).`);
      process.exit(0);
    }
  } catch { /* si no se puede saber, se actualiza igual */ }
}

let errors = 0;
{
  const t0 = Date.now();
  try {
    const c = await getCobranzas();
    const fecha = Date.now();
    const gz = gzipSync(JSON.stringify({ rows: c.facturas, saldos: c.saldos, pagos: c.pagos, fecha }));
    const res = await fetch(`${BASE}/cache/cobranzas?registros=${c.facturas.length}&fecha=${fecha}`, {
      method: "PUT", headers: { ...headers, "Content-Type": "application/octet-stream" }, body: gz,
      signal: AbortSignal.timeout(PUT_TIMEOUT_MS)
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || out.error) throw new Error(out.error || `no se pudo guardar (HTTP ${res.status})`);
    console.log(`✔ cobranzas: ${c.facturas.length} facturas con saldo, ${c.saldos.length} saldos a favor, ${c.pagos.length} últimos pagos, ${Math.round(gz.length / 1024)} KB, ${Math.round((Date.now() - t0) / 1000)} s`);
  } catch (error) {
    errors++;
    console.error(`✘ cobranzas: ${error.message}`);
  }
}
for (const name of NAMES) {
  const t0 = Date.now();
  try {
    const r = await getAll(name);
    if (r.failed.length) throw new Error(`no se pudieron bajar ${r.failed.length} de ${r.totalPages} páginas${r.lastError ? ` (${r.lastError})` : ""}`);
    if (!r.rows.length) throw new Error("YiQi no devolvió registros");
    const fecha = Date.now();
    const gz = gzipSync(JSON.stringify({ rows: r.rows, columns: r.columns, total: r.total, modo: r.modo, motivo: r.motivo, fecha }));
    const res = await fetch(`${BASE}/cache/${name}?registros=${r.rows.length}&fecha=${fecha}`, {
      method: "PUT", headers: { ...headers, "Content-Type": "application/octet-stream" }, body: gz,
      signal: AbortSignal.timeout(PUT_TIMEOUT_MS)
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || out.error) throw new Error(out.error || `no se pudo guardar (HTTP ${res.status})`);
    console.log(`✔ ${name}: ${r.rows.length} registros (${r.totalPages} páginas, ${r.modo || "?"}), ${Math.round(gz.length / 1024)} KB comprimidos, ${Math.round((Date.now() - t0) / 1000)} s`);
  } catch (error) {
    errors++;
    const msg = error?.name === "TimeoutError" ? "no contestó a tiempo" : error.message;
    console.error(`✘ ${name}: ${msg} (${Math.round((Date.now() - t0) / 1000)} s)`);
  }
}
process.exit(errors ? 1 : 0);
