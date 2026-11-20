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
      const res = await fetch(`${BASE}/${name}?page=${page}${extra}`, { headers });
      let body;
      try { body = await res.json(); } catch { throw new Error(`respuesta inválida (HTTP ${res.status})`); }
      if (res.status === 401) throw Object.assign(new Error("el conector no aceptó la clave (revisá que CACHE_KEY y ARUKI_CACHE_KEY sean iguales)"), { fatal: true });
      if (!res.ok || body?.error) throw new Error(body?.error || `HTTP ${res.status}`);
      if (!Array.isArray(body?.data)) throw new Error("la respuesta no trae una lista");
      return body;
    } catch (error) {
      last = error;
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
  let next = 2;
  const worker = async () => {
    while (true) {
      const p = next++;
      if (p > totalPages) return;
      try { pages[p] = (await getPage(name, p, extra)).data; }
      catch (error) { if (error.fatal) throw error; failed.push(p); }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, totalPages - 1) }, worker));
  const rows = [];
  for (let p = 1; p <= totalPages; p++) if (pages[p]) rows.push(...pages[p]);
  return { rows, columns: first.columns, total, modo: first.modo || "", motivo: first.motivo || "", failed, totalPages };
}

let errors = 0;
for (const name of NAMES) {
  const t0 = Date.now();
  try {
    const r = await getAll(name);
    if (r.failed.length) throw new Error(`no se pudieron bajar ${r.failed.length} de ${r.totalPages} páginas`);
    if (!r.rows.length) throw new Error("YiQi no devolvió registros");
    const fecha = Date.now();
    const gz = gzipSync(JSON.stringify({ rows: r.rows, columns: r.columns, total: r.total, modo: r.modo, motivo: r.motivo, fecha }));
    const res = await fetch(`${BASE}/cache/${name}?registros=${r.rows.length}&fecha=${fecha}`, {
      method: "PUT", headers: { ...headers, "Content-Type": "application/octet-stream" }, body: gz
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || out.error) throw new Error(out.error || `no se pudo guardar (HTTP ${res.status})`);
    console.log(`✔ ${name}: ${r.rows.length} registros (${r.totalPages} páginas, ${r.modo || "?"}), ${Math.round(gz.length / 1024)} KB comprimidos, ${Math.round((Date.now() - t0) / 1000)} s`);
  } catch (error) {
    errors++;
    console.error(`✘ ${name}: ${error.message}`);
  }
}
process.exit(errors ? 1 : 0);
