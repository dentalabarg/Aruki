/*
  ARUKI — Conector seguro con YiQi y autenticación privada
  ------------------------------------------------------------
  Secrets obligatorios en Cloudflare:
  - YIQI_USER
  - YIQI_PASSWORD
  - ARUKI_USER
  - ARUKI_PASSWORD
  - SESSION_SECRET

  Variable opcional:
  - ARUKI_DISPLAY_NAME
  - ALLOWED_ORIGIN
  - SCHEMA_ID
  - FACTURAS_ENTITY
  - FACTURAS_SMARTIE_ID
  - ARTICULOS_ENTITY (por defecto CONSULTA_DE_STOCK)
  - ARTICULOS_SMARTIE_ID (por defecto 2377)
  - CLIENTES_SMARTIE_ID (por defecto 1834, entidad CLIENTE)
  - CONSULTA_RAPIDA (opcional: "no" para volver a leer las smarties de a 50)
  - ORIGEN_PEDIDO_ID (opcional: id del Origen de pedido; por defecto 3 = "Local")
  - CONSUMIDOR_FINAL_ID (opcional: id del cliente Consumidor Final; por defecto 8192)
  - ORIGEN_PEDIDO_NOMBRE (opcional, por defecto "Local")

  Para la ayuda con IA en Cotizaciones (renglones dudosos):
  - GEMINI_API_KEY (secret, clave de Google AI Studio)
  - GEMINI_MODEL (opcional, por defecto gemini-3.6-flash)
  - GEMINI_FALLBACK_MODELS (opcional, de reserva si el principal está saturado;
    por defecto gemini-flash-latest,gemini-flash-lite-latest)

  Binding KV (Settings → Bindings):
  - ARUKI_KV  → guarda las Relaciones y los intentos fallidos de login
  ------------------------------------------------------------
*/

const AUTH_BASE = "https://api.yiqi.com.ar";
const API_BASE = "https://api.yiqi.com.ar/api/public";
const TOKEN_PATH = "/token";
const LOGIN_INFO_PATH = "/api/accountapi/GetLoginInformation";

const SESSION_HOURS = 12;
const REMEMBER_SESSION_DAYS = 30;

export default {
  async fetch(request, env) {
    const corsHeaders = buildCorsHeaders(request, env);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);

    try {
      if (url.pathname === "/auth/login" && request.method === "POST") {
        return await handleLogin(request, env, corsHeaders);
      }

      if (url.pathname === "/auth/session" && request.method === "GET") {
        const session = await requireSession(request, env);
        return json(
          { authenticated: true, name: session.name },
          corsHeaders
        );
      }

      const session = await requireSession(request, env);

      if (url.pathname === "/login-info" && request.method === "GET") {
        const info = await getLoginInfo(env);
        return json({ ...info, requestedBy: session.name }, corsHeaders);
      }

      if (url.pathname === "/facturas" && request.method === "GET") {
        const page = normalizePage(url.searchParams.get("page"));
        const data = await getFacturas(env, page, url.searchParams.get("modo") || "");
        return json(data, corsHeaders);
      }

      if (url.pathname === "/articulos" && request.method === "GET") {
        const page = normalizePage(url.searchParams.get("page"));
        const data = await getArticulos(env, page, url.searchParams.get("modo") || "");
        return json(data, corsHeaders);
      }

      if (url.pathname === "/clientes" && request.method === "GET") {
        const page = normalizePage(url.searchParams.get("page"));
        return json(await getClientesPage(env, page, url.searchParams.get("modo") || ""), corsHeaders);
      }

      if (url.pathname === "/pedido" && request.method === "POST") {
        return json(await crearPedido(request, env, session), corsHeaders);
      }

      if (url.pathname === "/yiqi/diagnostico" && request.method === "GET") {
        return json(await diagnosticoPedido(env), corsHeaders);
      }

      if (url.pathname === "/relaciones" && request.method === "GET") {
        return json(await readRelaciones(env), corsHeaders);
      }

      if (url.pathname === "/relaciones" && request.method === "PUT") {
        return json(await writeRelaciones(request, env, session), corsHeaders);
      }

      if (url.pathname === "/ia/elegir" && request.method === "POST") {
        return json(await iaElegir(request, env), corsHeaders);
      }

      if (url.pathname === "/ia/leer" && request.method === "POST") {
        return json(await iaLeer(request, env), corsHeaders);
      }

      throw new HttpError(
        404,
        "Ruta no encontrada. Usá /auth/login, /auth/session, /login-info, /facturas, /articulos, /clientes, /pedido, /relaciones, /ia/elegir o /ia/leer."
      );
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      const message = String(error?.message || error);
      return json({ error: message }, corsHeaders, status);
    }
  },
};

function buildCorsHeaders(request, env) {
  const requestOrigin = request.headers.get("Origin") || "";
  const configured = String(env.ALLOWED_ORIGIN || "*")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean);

  let allowedOrigin = "*";
  if (!configured.includes("*")) {
    allowedOrigin = configured.includes(requestOrigin)
      ? requestOrigin
      : (configured[0] || "");
  }

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
    "Cache-Control": "no-store",
  };
}

/* ---------- Acceso privado a Aruki ---------- */

async function handleLogin(request, env, corsHeaders) {
  requireAuthConfiguration(env);

  let body;
  try {
    body = await request.json();
  } catch {
    throw new HttpError(400, "La solicitud de acceso no tiene un formato válido.");
  }

  const ip = request.headers.get("CF-Connecting-IP") || "desconocida";
  await checkLoginLock(env, ip);

  const username = String(body?.username || "").trim();
  const password = String(body?.password || "");
  const remember = Boolean(body?.remember);

  const validUser = timingSafeEqual(username, String(env.ARUKI_USER));
  const validPassword = timingSafeEqual(password, String(env.ARUKI_PASSWORD));

  if (!validUser || !validPassword) {
    await registerLoginFailure(env, ip);
    throw new HttpError(401, "Usuario o contraseña incorrectos.");
  }
  await clearLoginFailures(env, ip);

  const now = Math.floor(Date.now() / 1000);
  const ttl = remember
    ? REMEMBER_SESSION_DAYS * 24 * 60 * 60
    : SESSION_HOURS * 60 * 60;

  const name = String(env.ARUKI_DISPLAY_NAME || env.ARUKI_USER);
  const token = await signSessionToken(
    {
      sub: "aruki-user",
      name,
      iat: now,
      exp: now + ttl,
    },
    env.SESSION_SECRET
  );

  return json(
    {
      token,
      name,
      expiresAt: (now + ttl) * 1000,
    },
    corsHeaders
  );
}

function requireAuthConfiguration(env) {
  const missing = [
    "ARUKI_USER",
    "ARUKI_PASSWORD",
    "SESSION_SECRET",
  ].filter(key => !env[key]);

  if (missing.length) {
    throw new HttpError(
      500,
      `Faltan configurar estos secrets en Cloudflare: ${missing.join(", ")}.`
    );
  }
}

async function requireSession(request, env) {
  requireAuthConfiguration(env);

  const authorization = request.headers.get("Authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    throw new HttpError(401, "Falta una sesión válida.");
  }

  try {
    return await verifySessionToken(match[1], env.SESSION_SECRET);
  } catch {
    throw new HttpError(401, "La sesión es inválida o venció.");
  }
}

async function signSessionToken(payload, secret) {
  const encodedPayload = base64UrlEncodeText(JSON.stringify(payload));
  const signature = await hmacSign(encodedPayload, secret);
  return `${encodedPayload}.${base64UrlEncodeBytes(signature)}`;
}

async function verifySessionToken(token, secret) {
  const [encodedPayload, encodedSignature, extra] = String(token).split(".");
  if (!encodedPayload || !encodedSignature || extra) {
    throw new Error("Token inválido");
  }

  const key = await importHmacKey(secret, ["verify"]);
  const signature = base64UrlDecodeToBytes(encodedSignature);
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    signature,
    new TextEncoder().encode(encodedPayload)
  );

  if (!valid) throw new Error("Firma inválida");

  const payload = JSON.parse(base64UrlDecodeToText(encodedPayload));
  const now = Math.floor(Date.now() / 1000);

  if (!payload?.exp || payload.exp <= now) {
    throw new Error("Token vencido");
  }

  return payload;
}

async function hmacSign(value, secret) {
  const key = await importHmacKey(secret, ["sign"]);
  return new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(value)
    )
  );
}

async function importHmacKey(secret, usages) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(String(secret)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usages
  );
}

function timingSafeEqual(left, right) {
  const a = new TextEncoder().encode(String(left));
  const b = new TextEncoder().encode(String(right));
  const length = Math.max(a.length, b.length);
  let difference = a.length ^ b.length;

  for (let index = 0; index < length; index += 1) {
    difference |= (a[index % (a.length || 1)] || 0) ^
                  (b[index % (b.length || 1)] || 0);
  }
  return difference === 0;
}

function base64UrlEncodeText(value) {
  return base64UrlEncodeBytes(new TextEncoder().encode(value));
}

function base64UrlEncodeBytes(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/g, "");
}

function base64UrlDecodeToBytes(value) {
  const base64 = value
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");

  const binary = atob(base64);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function base64UrlDecodeToText(value) {
  return new TextDecoder().decode(base64UrlDecodeToBytes(value));
}

/* ---------- Bloqueo por intentos fallidos (usa ARUKI_KV) ---------- */

const LOGIN_MAX_FAILS = 5;
const LOGIN_LOCK_SECONDS = 15 * 60;

async function checkLoginLock(env, ip) {
  if (!env.ARUKI_KV) return;
  const fails = Number(await env.ARUKI_KV.get(`login-fail:${ip}`)) || 0;
  if (fails >= LOGIN_MAX_FAILS) {
    throw new HttpError(429, "Demasiados intentos fallidos. Esperá 15 minutos y volvé a probar.");
  }
}

async function registerLoginFailure(env, ip) {
  if (!env.ARUKI_KV) return;
  const key = `login-fail:${ip}`;
  const fails = (Number(await env.ARUKI_KV.get(key)) || 0) + 1;
  await env.ARUKI_KV.put(key, String(fails), { expirationTtl: LOGIN_LOCK_SECONDS });
}

async function clearLoginFailures(env, ip) {
  if (!env.ARUKI_KV) return;
  await env.ARUKI_KV.delete(`login-fail:${ip}`);
}

/* ---------- Relaciones (usa ARUKI_KV) ---------- */

const RELACIONES_KEY = "relaciones";
const RELACIONES_MAX = 20000;

function requireKv(env) {
  if (!env.ARUKI_KV) {
    throw new HttpError(
      500,
      "Falta conectar la base de datos: en Cloudflare agregá el binding KV llamado ARUKI_KV al Worker."
    );
  }
}

async function readRelaciones(env) {
  requireKv(env);
  const stored = await env.ARUKI_KV.get(RELACIONES_KEY, "json");
  return {
    relaciones: Array.isArray(stored?.relaciones) ? stored.relaciones : [],
    version: stored?.version || 0,
    updatedBy: stored?.updatedBy || null,
  };
}

function cleanRelacion(item) {
  const texto = String(item?.texto || "").trim().slice(0, 500);
  const skus = Array.isArray(item?.skus)
    ? [...new Set(item.skus.map(s => String(s || "").trim()).filter(Boolean))].slice(0, 20)
    : [];
  // Palabra equivalente: "autocurable" → "auto" (no apunta a artículos)
  const reemplazo = String(item?.reemplazo || "").trim().slice(0, 100);
  if (!texto || (!skus.length && !reemplazo)) return null;
  // Relaciones por condiciones: [{ op, valor }] (contiene, no_contiene, comienza, no_comienza, termina, no_termina)
  const reglas = Array.isArray(item?.reglas)
    ? item.reglas
        .filter(g => g && REL_OPS_VALIDAS.includes(g.op) && String(g.valor || "").trim())
        .map(g => ({ op: g.op, valor: String(g.valor).trim().slice(0, 100) }))
        .slice(0, 10)
    : [];
  return {
    id: String(item?.id || crypto.randomUUID()).slice(0, 64),
    texto,
    skus,
    ...(reglas.length ? { reglas } : {}),
    ...(reemplazo && !reglas.length ? { reemplazo } : {}),
    nota: String(item?.nota || "").trim().slice(0, 300),
    creado: Number(item?.creado) || Date.now(),
    actualizado: Number(item?.actualizado) || Date.now(),
  };
}

const REL_OPS_VALIDAS = ["contiene", "no_contiene", "comienza", "no_comienza", "termina", "no_termina"];

async function writeRelaciones(request, env, session) {
  requireKv(env);
  let body;
  try {
    body = await request.json();
  } catch {
    throw new HttpError(400, "Los datos enviados no tienen un formato válido.");
  }
  if (!Array.isArray(body?.relaciones)) {
    throw new HttpError(400, "Falta la lista de relaciones.");
  }
  if (body.relaciones.length > RELACIONES_MAX) {
    throw new HttpError(400, `Se permiten hasta ${RELACIONES_MAX} relaciones.`);
  }

  const current = await readRelaciones(env);
  if (Number(body.baseVersion) !== Number(current.version)) {
    throw new HttpError(
      409,
      "Las relaciones cambiaron desde otra computadora. Se recargaron: revisá y volvé a guardar."
    );
  }

  const relaciones = body.relaciones.map(cleanRelacion).filter(Boolean);
  const next = {
    relaciones,
    version: Date.now(),
    updatedBy: session?.name || null,
  };
  await env.ARUKI_KV.put(RELACIONES_KEY, JSON.stringify(next));
  return next;
}

/* ---------- Autenticación con YiQi ---------- */

let cachedToken = null;
let cachedTokenAt = 0;

async function getToken(env) {
  const stillFresh = cachedToken && Date.now() - cachedTokenAt < 45 * 60 * 1000;
  if (stillFresh) return cachedToken;

  if (!env.YIQI_USER || !env.YIQI_PASSWORD) {
    throw new HttpError(
      500,
      "Faltan configurar los secrets YIQI_USER y/o YIQI_PASSWORD en el Worker."
    );
  }

  const body = new URLSearchParams();
  body.set("grant_type", "password");
  body.set("username", env.YIQI_USER);
  body.set("password", env.YIQI_PASSWORD);

  const response = await fetch(AUTH_BASE + TOKEN_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new HttpError(
      502,
      `No se pudo autenticar contra YiQi (status ${response.status}): ${text}`
    );
  }

  const data = await response.json();
  cachedToken = data.access_token || data.token || data.accessToken;
  cachedTokenAt = Date.now();

  if (!cachedToken) {
    throw new HttpError(
      502,
      "YiQi respondió, pero no se encontró el token de acceso."
    );
  }

  return cachedToken;
}

async function getLoginInfo(env) {
  const token = await getToken(env);
  const response = await fetch(AUTH_BASE + LOGIN_INFO_PATH, {
    headers: { Authorization: "Bearer " + token },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new HttpError(
      502,
      `GetLoginInformation falló (status ${response.status}): ${text}`
    );
  }

  return response.json();
}

let cachedSchemaId = null;

async function getSchemaId(env) {
  if (env.SCHEMA_ID) return env.SCHEMA_ID;
  if (cachedSchemaId) return cachedSchemaId;

  const info = await getLoginInfo(env);
  const schemaId =
    info.schemaId ||
    info.SchemaId ||
    (info.schemas && info.schemas[0] && info.schemas[0].id);

  if (!schemaId) {
    throw new HttpError(
      502,
      "No se encontró schemaId en la respuesta de YiQi."
    );
  }

  cachedSchemaId = schemaId;
  return schemaId;
}

/* ---------- Facturas y Artículos (smartie, con consulta rápida si se puede) ---------- */

async function getFacturas(env, page, modo) {
  const smartieId = env.FACTURAS_SMARTIE_ID;
  if (!smartieId) throw new HttpError(500, "Falta configurar la variable FACTURAS_SMARTIE_ID en el Worker.");
  return fastSmartie(env, env.FACTURAS_ENTITY || "FACTURA", smartieId, page, modo);
}

async function getArticulos(env, page, modo) {
  return fastSmartie(env, env.ARTICULOS_ENTITY || "CONSULTA_DE_STOCK", env.ARTICULOS_SMARTIE_ID || "2377", page, modo);
}

async function fetchSmartie(env, entity, query, token) {
  const url = `${API_BASE}/${entity}/smartie?${query.toString()}`;
  let response = await fetch(url, { headers: { Authorization: "Bearer " + token } });
  if (response.status === 401) {
    // El token de YiQi venció: se pide uno nuevo y se reintenta una vez.
    cachedToken = null;
    const fresh = await getToken(env);
    response = await fetch(url, { headers: { Authorization: "Bearer " + fresh } });
  }
  return response;
}

function normalizePage(value) {
  const page = Number.parseInt(String(value || "1"), 10);
  if (!Number.isInteger(page) || page < 1) {
    throw new HttpError(400, "El número de página no es válido.");
  }
  return page;
}

/* ---------- Smartie genérica (Clientes) ---------- */

async function getSmartiePage(env, entity, smartieId, page) {
  const token = await getToken(env);
  const schemaId = await getSchemaId(env);
  const query = new URLSearchParams({ smartieId: String(smartieId), schemaId, page: String(page) });
  const response = await fetchSmartie(env, entity, query, token);
  if (!response.ok) {
    const text = await response.text();
    throw new HttpError(502, `La consulta a /${entity}/smartie falló (status ${response.status}): ${text}`);
  }
  return response.json();
}

/* ---------- Consulta rápida (POST /{ENTIDAD}/query, hasta 1000 por página) ----------
   La smartie entrega de a 50 filas; /query entrega hasta 1000. Para no cambiar nada en Aruki:
   1) se lee la página 1 de la smartie para saber sus columnas (field/title) y su total;
   2) se pide /query con esas mismas columnas y con los mismos filtros que tiene la smartie en YiQi
      (los filtros no vienen en la API: se copian a mano en FAST_FILTERS);
   3) solo si YiQi la acepta Y el total coincide con el de la smartie se usa la consulta rápida.
      Si no, se sigue con la smartie como siempre y se informa el motivo ("motivo").
   Como no se sabe de antemano cómo espera YiQi algunos valores (true / 1 / "S", formato de fecha), se prueban
   variantes con pageSize 1 (consultas livianas) hasta que el total coincide.
   Respuesta con el mismo formato que la smartie ({ data, total, columns }) + "modo": "rapido" | "smartie". */
const FAST_PAGE_SIZE = 1000;
const FAST_TTL = 15 * 60 * 1000;
const fastPlans = new Map();   // "ENTIDAD:smartie" → { ok, columns, queryColumns, filters, motivo, at }
const SKIP_FIELDS = new Set(["id", "ESTA_CODIGO", "ckeck", "check", "__s"]);

/* Filtros de cada smartie (copiados de YiQi). Cada entrada es una lista de variantes a probar, en orden. */
function fastFilterCandidates(entity) {
  const f = (columnName, operator, value) => ({ columnName, operator, value });
  if (entity === "CLIENTE") {
    // Smartie 1834: solo clientes con "Activo (cliente)" marcado
    return [true, 1, "true", "1", "S", "Si"].map(v => [f("CLIE_ACTIVO", "=", v)]).concat([[]]);
  }
  if (entity === "FACTURA") {
    // Smartie 2355: emitidas desde 01/07/2026, sin origen "Mercado Libre" y sin cliente "Consumidor Final"
    const desde = ["2026-07-01", "2026-07-01T00:00:00", "01/07/2026"];
    const out = [];
    for (const d of desde) {
      out.push([f("FACT_FECHA_EMISION", ">=", d), f("FACT_EXTE_NOMBRE", "!=", "Mercado Libre"), f("CLIE_ID_CLIE", "!=", 8192)]);
    }
    return out;
  }
  return [[]];
}

async function getClientesPage(env, page, modo) {
  return fastSmartie(env, "CLIENTE", env.CLIENTES_SMARTIE_ID || "1834", page, modo);
}

async function runQuery(env, entity, page, queryColumns, filters = [], pageSize = FAST_PAGE_SIZE) {
  const schemaId = await getSchemaId(env);
  const body = { page, pageSize, columns: queryColumns };
  if (filters.length) body.filters = filters;
  const response = await yiqiFetch(env, `/${entity}/query?schemaId=${encodeURIComponent(schemaId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let payload = null;
  try { payload = JSON.parse(text); } catch { /* no JSON */ }
  return { ok: response.ok && Array.isArray(payload?.data), status: response.status, payload, text };
}

function buildQueryColumns(columns) {
  const out = [];
  for (const c of columns || []) {
    const field = String(c?.field || "");
    if (!field || SKIP_FIELDS.has(field)) continue;
    const col = { field };
    // Si la smartie trae orden, se respeta (los nombres de esas propiedades pueden variar)
    const dir = String(c.sortDirection || c.SortDirection || c.direccionOrden || "").toUpperCase();
    if (dir === "ASC" || dir === "DESC") {
      col.sortDirection = dir;
      const ord = Number(c.sortOrder ?? c.SortOrder);
      if (Number.isFinite(ord)) col.sortOrder = ord;
    }
    out.push(col);
  }
  // Facturas sin orden conocido: las más nuevas primero
  if (!out.some(c => c.sortDirection)) {
    const fecha = out.find(c => /FECHA_EMISION/.test(c.field));
    if (fecha) { fecha.sortDirection = "DESC"; fecha.sortOrder = 1; }
  }
  return out;
}

const shortErr = r => String(r.payload?.errors ? JSON.stringify(r.payload.errors) : (r.payload?.error || r.payload?.message || r.payload?.title || r.text || "")).replace(/\s+/g, " ").slice(0, 160);

/* Arma el plan: qué columnas y filtros usar en /query para que dé lo mismo que la smartie */
async function buildFastPlan(env, entity, smartieId) {
  const smartie = await getSmartiePage(env, entity, smartieId, 1);
  const base = buildQueryColumns(smartie.columns);
  const plan = { ok: false, columns: smartie.columns, queryColumns: base, filters: [], motivo: "", at: Date.now(), smartie };
  if (!base.length) { plan.motivo = "la smartie no informa sus columnas"; return plan; }
  const total = Number(smartie.total);
  const needsId = (smartie.data || []).some(row => row && row.id !== undefined && row.id !== null);
  const notas = [];

  // 1) ¿Con qué columnas acepta YiQi la consulta? (primero con el id de cada fila)
  let cols = null;
  for (const c of [[{ field: "id" }, ...base], base]) {
    const r = await runQuery(env, entity, 1, c, [], 1);
    if (r.ok) {
      const row = r.payload.data[0];
      if (needsId && row && (row.id === undefined || row.id === null)) { notas.push("la consulta no trae el número (id) de cada fila"); continue; }
      cols = c; break;
    }
    if (r.status === 404) { plan.motivo = `YiQi no tiene consulta rápida para ${entity} (404)`; return plan; }
    notas.push(`${c[0]?.field === "id" ? "con id" : "sin id"}: error ${r.status} ${shortErr(r)}`);
  }
  if (!cols) {
    // Diagnóstico: se prueba cada columna sola para saber cuál no acepta YiQi
    const malas = [];
    for (const col of base.slice(0, 20)) {
      const r = await runQuery(env, entity, 1, [col], [], 1);
      if (!r.ok) {
        const t = (smartie.columns || []).find(x => x.field === col.field);
        malas.push(`${t?.title || col.field} [${col.field}]`);
      }
    }
    plan.motivo = (notas.join(" · ") || "YiQi rechazó la consulta")
      + (malas.length ? ` · columnas que YiQi no acepta: ${malas.join(", ")}` : " · cada columna sola anda; falla la combinación");
    return plan;
  }

  // 2) ¿Con qué filtros da el mismo total que la smartie?
  const totales = [];
  for (const filters of fastFilterCandidates(entity)) {
    const r = await runQuery(env, entity, 1, cols, filters, 1);
    if (!r.ok) { totales.push(`filtro rechazado (${r.status}): ${shortErr(r)}`); continue; }
    if (Number(r.payload.total) === total) {
      Object.assign(plan, { ok: true, queryColumns: cols, filters, motivo: "" });
      return plan;
    }
    totales.push(String(r.payload.total));
  }

  // 3) Sin filtros cargados: muchas smarties esconden solo los registros dados de baja (estado). Se cuentan los
  //    registros por estado y, si sacando algunos estados el total coincide, se usan esos filtros.
  let porEstado = "";
  if (fastFilterCandidates(entity).every(c => !c.length)) {
    try {
      const est = await estadoFilters(env, entity, smartie, base, total);
      porEstado = est.resumen;
      if (est.filters) {
        const r = await runQuery(env, entity, 1, cols, est.filters, 1);
        if (r.ok && Number(r.payload.total) === total) {
          Object.assign(plan, { ok: true, queryColumns: cols, filters: est.filters, motivo: "" });
          return plan;
        }
      }
    } catch (error) { porEstado = `no se pudo contar por estado: ${String(error?.message || error).slice(0, 80)}`; }
  }
  plan.motivo = `la smartie tiene ${total} registros y la consulta rápida dio ${[...new Set(totales)].join(" / ")}`
    + (porEstado ? ` · por estado: ${porEstado}` : "")
    + " (la smartie tiene filtros distintos a los cargados en Aruki)";
  return plan;
}

/* Cuenta registros por estado (ESTA_CODIGO / DESC_ESTADO) y busca qué estados excluir para llegar al total de la smartie */
async function estadoFilters(env, entity, smartie, base, total) {
  const key = (smartie.columns || []).find(c => /sku|c[oó]digo/i.test(String(c.title || "")))?.field || base[0].field;
  const r = await runQuery(env, entity, 1, [{ field: "ESTA_CODIGO" }, { field: "DESC_ESTADO" }, { field: key, aggregation: "COUNT" }], [], 100);
  if (!r.ok) return { resumen: `error ${r.status} ${shortErr(r)}`.slice(0, 120) };
  const grupos = r.payload.data.map(g => ({ code: g.ESTA_CODIGO, name: g.DESC_ESTADO, n: Number(g[key]) || 0 }));
  const resumen = grupos.map(g => `${g.name ?? g.code}=${g.n}`).join(", ");
  if (!grupos.length || grupos.length > 10) return { resumen };
  // Se buscan los estados a EXCLUIR (combinación más chica) para que la suma dé el total de la smartie
  let mejor = null;
  for (let mask = 1; mask < (1 << grupos.length); mask++) {
    const excl = grupos.filter((_, i) => mask & (1 << i));
    const quedan = grupos.reduce((s, g) => s + g.n, 0) - excl.reduce((s, g) => s + g.n, 0);
    if (quedan === total && (!mejor || excl.length < mejor.length)) mejor = excl;
  }
  if (!mejor) return { resumen };
  return {
    resumen,
    filters: mejor.map(g => (g.code !== undefined && g.code !== null)
      ? { columnName: "ESTA_CODIGO", operator: "!=", value: g.code }
      : { columnName: "DESC_ESTADO", operator: "!=", value: g.name }),
  };
}

async function fastSmartie(env, entity, smartieId, page, forced = "") {
  const key = `${entity}:${smartieId}`;
  let plan = fastPlans.get(key);
  if (plan && Date.now() - plan.at > FAST_TTL) plan = null;
  const disabled = env.CONSULTA_RAPIDA === "no" || (entity === "CLIENTE" && env.CLIENTES_MODO === "smartie");
  const viaSmartie = async (motivo) => ({ ...(await getSmartiePage(env, entity, smartieId, page)), modo: "smartie", ...(motivo ? { motivo } : {}) });

  if (disabled) return viaSmartie("lectura rápida apagada (CONSULTA_RAPIDA=no)");
  // Artículos (Consulta de stock): la consulta rápida de YiQi trae registros de más (8352 vs 7318) y da error 500 al
  // pedir el id o agrupar por estado, así que se lee siempre la smartie (se guarda 4 h en la computadora igual).
  // Para volver a probarla: variable ARTICULOS_RAPIDA = "si".
  if (entity === (env.ARTICULOS_ENTITY || "CONSULTA_DE_STOCK") && env.ARTICULOS_RAPIDA !== "si") {
    return viaSmartie(page === 1 ? "la consulta rápida de YiQi no sirve para esta smartie; se lee de a 50 (se guarda en la computadora 4 h)" : "");
  }
  if (forced === "smartie" && page > 1) return viaSmartie("");

  if (!plan || (page === 1 && forced !== "rapido")) {
    if (!plan || page === 1) {
      try { plan = await buildFastPlan(env, entity, smartieId); }
      catch (error) { plan = { ok: false, motivo: String(error?.message || error).slice(0, 200), at: Date.now() }; }
      fastPlans.set(key, plan);
    }
  }
  if (!plan.ok) {
    if (forced === "rapido" && page > 1) throw new HttpError(503, "La lectura rápida cambió a mitad de la descarga. Tocá Actualizar de nuevo.");
    if (page === 1 && plan.smartie) return { ...plan.smartie, modo: "smartie", motivo: plan.motivo };
    return viaSmartie(plan.motivo);
  }
  const r = await runQuery(env, entity, page, plan.queryColumns, plan.filters);
  if (!r.ok) throw new HttpError(502, `La consulta rápida a /${entity} falló (status ${r.status}): ${shortErr(r)}`);
  return { data: r.payload.data, total: r.payload.total, columns: plan.columns, modo: "rapido" };
}


/* ---------- Pedidos en YiQi (POST /PEDIDO) ----------
   Única escritura en YiQi de Aruki, a pedido del usuario: crea un pedido con
   Origen "Local", el cliente elegido (o Consumidor Final) y la lista de precios elegida. */

async function yiqiFetch(env, path, init = {}) {
  const url = `${API_BASE}${path}`;
  const run = async token => fetch(url, {
    ...init,
    headers: { Authorization: "Bearer " + token, Accept: "application/json", ...(init.headers || {}) },
  });
  let response = await run(await getToken(env));
  if (response.status === 401) {
    cachedToken = null;
    response = await run(await getToken(env));
  }
  return response;
}

async function yiqiSearch(env, entity, params = {}) {
  const schemaId = await getSchemaId(env);
  const query = new URLSearchParams({ schemaId: String(schemaId), ...params });
  const response = await yiqiFetch(env, `/${entity}/search?${query.toString()}`);
  if (!response.ok) {
    const text = await response.text();
    const error = new HttpError(502, `La búsqueda en /${entity} falló (status ${response.status}): ${text.slice(0, 300)}`);
    error.yiqiStatus = response.status;
    throw error;
  }
  const data = await response.json();
  return Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);
}

const foldName = value => String(value ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

let lookupCache = { at: 0, origenId: null, origenNombre: "", listas: null };
const LOOKUP_TTL = 30 * 60 * 1000;

async function getOrigenLocal(env) {
  // Origen "Local" = id 3 en YiQi (confirmado por el usuario). Se puede cambiar con la variable ORIGEN_PEDIDO_ID.
  return { id: Number(env.ORIGEN_PEDIDO_ID || 3), nombre: env.ORIGEN_PEDIDO_NOMBRE || "Local" };
  if (lookupCache.origenId && Date.now() - lookupCache.at < LOOKUP_TTL) return { id: lookupCache.origenId, nombre: lookupCache.origenNombre };
  const wanted = foldName(env.ORIGEN_PEDIDO_NOMBRE || "Local");
  const entities = (env.ORIGEN_PEDIDO_ENTITY ? [env.ORIGEN_PEDIDO_ENTITY] : [])
    .concat(["EXTERNAL_SYSTEM", "ORIGEN_DE_PEDIDO", "ORIGEN_PEDIDO", "SISTEMA_EXTERNO"]);
  const tried = [];
  for (const entity of entities) {
    let rows;
    try { rows = await yiqiSearch(env, entity); }
    catch (error) { tried.push(`${entity} (${error.yiqiStatus || "error"})`); continue; }
    const nameOf = r => {
      const k = Object.keys(r).find(key => /_NOMBRE$|_DESCRIPCION$|^NOMBRE$/i.test(key) && typeof r[key] === "string");
      return k ? r[k] : "";
    };
    const hit = rows.find(r => foldName(nameOf(r)) === wanted) || rows.find(r => foldName(nameOf(r)).includes(wanted));
    if (hit) {
      lookupCache = { ...lookupCache, at: Date.now(), origenId: Number(hit.id), origenNombre: nameOf(hit) };
      return { id: Number(hit.id), nombre: nameOf(hit) };
    }
    tried.push(`${entity} (sin "${env.ORIGEN_PEDIDO_NOMBRE || "Local"}" entre ${rows.length})`);
  }
  throw new HttpError(500,
    `No se encontró el Origen de pedido "${env.ORIGEN_PEDIDO_NOMBRE || "Local"}" en YiQi. Probé: ${tried.join(", ")}. ` +
    `Solución: cargar en el conector la variable ORIGEN_PEDIDO_ID con el id del origen "Local".`);
}

async function getListasPrecio(env) {
  if (lookupCache.listas && Date.now() - lookupCache.at < LOOKUP_TTL) return lookupCache.listas;
  const rows = await yiqiSearch(env, "LISTA_DE_PRECIO");
  const listas = rows.map(r => ({ id: Number(r.id), nombre: String(r.LIDP_NOMBRE || "") })).filter(l => l.id && l.nombre);
  lookupCache = { ...lookupCache, at: Date.now(), listas };
  return listas;
}

function matchLista(listas, title) {
  const t = foldName(title);
  const exact = listas.find(l => foldName(l.nombre) === t);
  if (exact) return exact;
  const contains = listas.filter(l => { const n = foldName(l.nombre); return n && (t.includes(n) || n.includes(t)); });
  if (contains.length === 1) return contains[0];
  // Por palabras: "Lista Reventa" ↔ "Reventa", "Lista 2 - General" ↔ "General"
  const stop = new Set(["lista", "de", "precio", "precios", "venta"]);
  const words = t.split(" ").filter(w => w && !stop.has(w));
  let best = null, bestScore = 0;
  for (const l of listas) {
    const lw = foldName(l.nombre).split(" ").filter(w => w && !stop.has(w));
    if (!lw.length || !words.length) continue;
    const common = words.filter(w => lw.includes(w)).length;
    const score = common / Math.max(words.length, lw.length);
    if (score > bestScore) { best = l; bestScore = score; }
  }
  return bestScore >= 0.5 ? best : null;
}

async function findConsumidorFinal(env) {
  for (const field of ["CLIE_RAZON_SOCIAL", "CLIE_NOMBRE"]) {
    try {
      const rows = await yiqiSearch(env, "CLIENTE", { [field]: "Consumidor Final" });
      if (rows.length) return Number(rows[0].id);
    } catch { /* se prueba el siguiente */ }
  }
  return null;
}

async function findMaterialIds(env, skus) {
  const ids = new Map();
  const missing = [];
  const queue = [...new Set(skus)];
  async function worker() {
    while (queue.length) {
      const sku = queue.shift();
      const rows = await yiqiSearch(env, "MATERIAL", { MATE_CODIGO: sku });
      const hit = rows.find(r => String(r.MATE_CODIGO || "").trim().toLowerCase() === sku.toLowerCase()) || (rows.length === 1 ? rows[0] : null);
      if (hit) ids.set(sku, Number(hit.id)); else missing.push(sku);
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, queue.length) }, worker));
  return { ids, missing };
}

async function crearPedido(request, env, session) {
  let body;
  try { body = await request.json(); } catch { throw new HttpError(400, "El pedido no tiene un formato válido."); }
  const items = Array.isArray(body?.items) ? body.items.filter(i => i && String(i.sku || "").trim()) : [];
  if (!items.length) throw new HttpError(400, "El pedido no tiene artículos.");
  if (items.length > 300) throw new HttpError(400, "El pedido tiene demasiados artículos (máximo 300).");

  const origen = await getOrigenLocal(env);

  const listas = await getListasPrecio(env);
  const lista = matchLista(listas, body.lista || "");
  if (!lista) {
    throw new HttpError(400, `No encontré en YiQi la lista de precios "${body.lista}". Listas en YiQi: ${listas.map(l => l.nombre).join(", ") || "(ninguna)"}.`);
  }

  let clienteId = Number(body.clienteId) || null;
  // Sin cliente elegido → "Consumidor Final" = id 8192 en YiQi (confirmado por el usuario; variable CONSUMIDOR_FINAL_ID lo cambia)
  if (!clienteId) clienteId = Number(env.CONSUMIDOR_FINAL_ID || 8192);
  if (!clienteId) throw new HttpError(400, "No se encontró el cliente \"Consumidor Final\" en YiQi. Elegí un cliente de la lista.");

  const { ids, missing } = await findMaterialIds(env, items.map(i => String(i.sku).trim()));
  if (missing.length) {
    throw new HttpError(400, `Estos SKU no se encontraron como artículos en YiQi: ${missing.slice(0, 15).join(", ")}${missing.length > 15 ? "…" : ""}.`);
  }

  const productos = items.map(i => {
    const p = {
      MATE_ID_MATE: ids.get(String(i.sku).trim()),
      DEDP_CANTIDAD: Number(i.cantidad) > 0 ? Number(i.cantidad) : 1,
    };
    const precio = Number(i.precio);
    if (i.precio !== null && i.precio !== undefined && i.precio !== "" && Number.isFinite(precio) && precio >= 0) p.DEDP_PRECIO_UNITARIO_FINA = precio;   // el precio que se escribe en Aruki es FINAL (con impuestos)
    const texto = String(i.texto || "").trim();
    if (texto) p.DEDP_TEXTO_ADICIONAL = texto.slice(0, 500);
    return p;
  });

  const schemaId = await getSchemaId(env);
  const data = {
    EXTE_ID_EXTE: origen.id,
    CLIE_ID_CLIE: clienteId,
    LIDP_ID_LIDP: lista.id,
    PEDI_OBSERVACIONES: `Creado desde Aruki por ${session?.name || "usuario"}`,
    Productos: productos,
  };
  const response = await yiqiFetch(env, "/PEDIDO", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ schemaId: Number(schemaId), data }),
  });
  const text = await response.text();
  let payload = null;
  try { payload = JSON.parse(text); } catch { /* respuesta no JSON */ }
  if (!response.ok) {
    const detail = payload?.errors ? JSON.stringify(payload.errors) : (payload?.error || payload?.message || text);
    throw new HttpError(502, `YiQi no aceptó el pedido (status ${response.status}): ${String(detail).slice(0, 500)}`);
  }
  if (!payload?.ok) throw new HttpError(502, `YiQi no aceptó el pedido: ${payload?.error || text.slice(0, 500)}`);

  let numero = "";
  try {
    const saved = typeof payload.parameter === "string" ? JSON.parse(payload.parameter) : payload.parameter;
    numero = String(saved?.PEDI_NRO_PEDIDO || saved?.PEDI_NUMERO || "").trim();
  } catch { /* sin número */ }
  return { ok: true, id: payload.newId, numero: numero ? `N° ${numero}` : "", lista: lista.nombre, origen: origen.nombre };
}

async function diagnosticoPedido(env) {
  const out = {};
  try { out.origen = await getOrigenLocal(env); } catch (e) { out.origenError = String(e.message || e); }
  try { out.listas = await getListasPrecio(env); } catch (e) { out.listasError = String(e.message || e); }
  try { out.consumidorFinalId = await findConsumidorFinal(env); } catch (e) { out.consumidorFinalError = String(e.message || e); }
  return out;
}

/* ---------- Helpers ---------- */

/* ---------- IA (Gemini) ----------
   geminiJSON(): llama a Gemini pidiendo JSON con un esquema. Prueba el modelo principal y,
   si está saturado (429/500/503) o no existe (404), los de reserva. */
async function geminiJSON(env, { system, parts, schema }) {
  if (!env.GEMINI_API_KEY) {
    throw new HttpError(503, "Falta configurar la clave de Gemini (GEMINI_API_KEY) en el conector de Cloudflare.");
  }
  const models = [...new Set([
    env.GEMINI_MODEL || "gemini-3.6-flash",
    ...String(env.GEMINI_FALLBACK_MODELS || "gemini-flash-latest,gemini-flash-lite-latest").split(",").map(m => m.trim()).filter(Boolean),
  ])];
  const payload = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts }],
    generationConfig: { temperature: 0.1, responseMimeType: "application/json", responseSchema: schema },
  };
  const body = JSON.stringify(payload);
  const waits = [2000, 5000];
  let lastStatus = 0, lastText = "", saturado = false;
  for (const m of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`;
    for (let attempt = 0; attempt <= waits.length; attempt++) {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
        body,
      });
      if (response.ok) {
        const data = await response.json();
        const raw = data?.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "";
        try { return { result: JSON.parse(raw), model: m }; }
        catch { throw new HttpError(502, "Gemini devolvió una respuesta que no se pudo leer."); }
      }
      lastStatus = response.status;
      lastText = await response.text();
      if (response.status === 404) break;                       // ese modelo no existe: probar el siguiente
      if (![429, 500, 503].includes(response.status)) {
        throw new HttpError(502, `Gemini respondió con un error (${response.status}): ${lastText.slice(0, 300)}`);
      }
      saturado = true;
      if (attempt < waits.length) await new Promise(r => setTimeout(r, waits[attempt]));
    }
  }
  if (saturado) throw new HttpError(503, "Gemini está saturado en este momento (es algo temporal de Google)");
  throw new HttpError(502, `Gemini respondió con un error (${lastStatus}): ${lastText.slice(0, 300)}`);
}

/* /ia/elegir: elegir el artículo para renglones dudosos.
   Recibe { renglones: [{ id, solicitado, candidatos: [{ sku, nombre, marca }] }] }
   y devuelve { resultados: [{ id, sku, motivo }] }. Solo se mandan el renglón y sus
   candidatos (nunca el catálogo entero), así el costo es mínimo. */
const IA_PROMPT = `Sos el asistente de cotizaciones de Dentalab, distribuidora de insumos odontológicos de Argentina.
Para cada renglón que pidió un cliente te paso una lista de artículos candidatos de nuestro catálogo.
Elegí el SKU del candidato que corresponde al mismo producto que pidió el cliente.
Reglas:
- Solo podés elegir SKU que estén en los candidatos de ese renglón. Nunca inventes.
- Si el cliente nombra una marca y hay un candidato de esa marca, elegí esa marca.
- Después priorizá el mismo tipo de producto, y entre esos la medida/presentación/color/número más parecido.
- Tené en cuenta sinónimos y abreviaturas odontológicas (ej.: "fresa" = "piedra", "FG" = turbina, "CA" = contraángulo, "jer." = jeringa).
- Si ningún candidato es razonablemente el mismo producto, devolvé sku vacío ("").
- En "motivo" explicá en pocas palabras (máximo 15) por qué elegiste ese artículo.`;

async function iaElegir(request, env) {
  let body;
  try { body = await request.json(); } catch { throw new HttpError(400, "Los datos enviados no tienen un formato válido."); }
  const renglones = (Array.isArray(body?.renglones) ? body.renglones : []).slice(0, 40).map(r => ({
    id: String(r?.id || "").slice(0, 40),
    solicitado: String(r?.solicitado || "").slice(0, 400),
    candidatos: (Array.isArray(r?.candidatos) ? r.candidatos : []).slice(0, 15).map(c => ({
      sku: String(c?.sku || "").slice(0, 60),
      nombre: String(c?.nombre || "").slice(0, 200),
      marca: String(c?.marca || "").slice(0, 60),
    })).filter(c => c.sku),
  })).filter(r => r.id && r.solicitado && r.candidatos.length);
  if (!renglones.length) return { resultados: [] };

  const { result, model } = await geminiJSON(env, {
    system: IA_PROMPT,
    parts: [{ text: JSON.stringify({ renglones }) }],
    schema: {
      type: "OBJECT",
      properties: {
        resultados: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: { id: { type: "STRING" }, sku: { type: "STRING" }, motivo: { type: "STRING" } },
            required: ["id", "sku"],
          },
        },
      },
      required: ["resultados"],
    },
  });

  // Solo se aceptan SKU que estaban entre los candidatos de ese renglón
  const byId = new Map(renglones.map(r => [r.id, new Set(r.candidatos.map(c => c.sku))]));
  const resultados = (Array.isArray(result?.resultados) ? result.resultados : [])
    .map(r => ({ id: String(r?.id || ""), sku: String(r?.sku || "").trim(), motivo: String(r?.motivo || "").slice(0, 200) }))
    .filter(r => byId.has(r.id))
    .map(r => (byId.get(r.id).has(r.sku) ? r : { ...r, sku: "" }));
  return { resultados, modelo: model };
}

/* /ia/leer: leer un PDF (con texto o escaneado) o una foto JPG/PNG y devolver la lista
   de artículos pedidos, un renglón por artículo (une los casilleros de varios renglones).
   Recibe { archivo: base64, mimeType, nombre } → { renglones: [{ cantidad, descripcion, presentacion, marca }] } */
const IA_LEER_PROMPT = `Sos el asistente de cotizaciones de Dentalab, distribuidora de insumos odontológicos de Argentina.
Te paso un archivo (PDF o foto) donde un cliente pide artículos: una orden de compra, una licitación, una lista, una foto de un papel o de una pantalla.
Extraé la lista de artículos pedidos, exactamente un elemento por artículo.
Reglas:
- Si la descripción de un artículo ocupa varios renglones dentro del mismo casillero o celda, unila en una sola descripción.
- "cantidad": la cantidad pedida de ese artículo (número). No confundas con el número de ítem/renglón, el precio, el total ni la presentación ("x 100 u", "caja x 50"). Si no figura, null.
- "descripcion": el texto del artículo tal como lo escribió el cliente (sin corregir ni traducir), sin precios ni número de ítem.
- "presentacion" y "marca": solo si están en columnas o datos aparte; si no, vacío.
- Ignorá encabezados, títulos de columnas, datos del cliente o proveedor, subtotales, totales, condiciones de pago, firmas y pies de página.
- Mantené el orden del documento.
- Si no hay una lista de artículos, devolvé la lista vacía.`;

const IA_LEER_TIPOS = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

async function iaLeer(request, env) {
  let body;
  try { body = await request.json(); } catch { throw new HttpError(400, "Los datos enviados no tienen un formato válido."); }
  const mimeType = String(body?.mimeType || "").toLowerCase();
  const data = String(body?.archivo || "");
  if (!IA_LEER_TIPOS.includes(mimeType)) throw new HttpError(400, "Solo se pueden leer con IA archivos PDF, JPG o PNG.");
  if (!data) throw new HttpError(400, "No llegó el archivo.");
  if (data.length > 19 * 1024 * 1024) throw new HttpError(413, "El archivo es demasiado grande para leerlo con IA (máximo unos 14 MB).");

  const { result, model } = await geminiJSON(env, {
    system: IA_LEER_PROMPT,
    parts: [
      { inline_data: { mime_type: mimeType, data } },
      { text: "Extraé la lista de artículos pedidos de este archivo." },
    ],
    schema: {
      type: "OBJECT",
      properties: {
        renglones: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              cantidad: { type: "NUMBER", nullable: true },
              descripcion: { type: "STRING" },
              presentacion: { type: "STRING" },
              marca: { type: "STRING" },
            },
            required: ["descripcion"],
          },
        },
      },
      required: ["renglones"],
    },
  });

  const renglones = (Array.isArray(result?.renglones) ? result.renglones : []).slice(0, 500).map(r => ({
    cantidad: Number.isFinite(Number(r?.cantidad)) && Number(r.cantidad) > 0 ? Number(r.cantidad) : null,
    descripcion: String(r?.descripcion || "").replace(/\s+/g, " ").trim().slice(0, 400),
    presentacion: String(r?.presentacion || "").replace(/\s+/g, " ").trim().slice(0, 120),
    marca: String(r?.marca || "").replace(/\s+/g, " ").trim().slice(0, 80),
  })).filter(r => r.descripcion);
  return { renglones, modelo: model };
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function json(object, headers, status = 200) {
  return new Response(JSON.stringify(object, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      ...headers,
    },
  });
}