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
        const data = await getFacturas(env, page);
        return json(data, corsHeaders);
      }

      if (url.pathname === "/articulos" && request.method === "GET") {
        const page = normalizePage(url.searchParams.get("page"));
        const data = await getArticulos(env, page);
        return json(data, corsHeaders);
      }

      if (url.pathname === "/relaciones" && request.method === "GET") {
        return json(await readRelaciones(env), corsHeaders);
      }

      if (url.pathname === "/relaciones" && request.method === "PUT") {
        return json(await writeRelaciones(request, env, session), corsHeaders);
      }

      throw new HttpError(
        404,
        "Ruta no encontrada. Usá /auth/login, /auth/session, /login-info, /facturas, /articulos o /relaciones."
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
  if (!texto || !skus.length) return null;
  return {
    id: String(item?.id || crypto.randomUUID()).slice(0, 64),
    texto,
    skus,
    nota: String(item?.nota || "").trim().slice(0, 300),
    creado: Number(item?.creado) || Date.now(),
    actualizado: Number(item?.actualizado) || Date.now(),
  };
}

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

/* ---------- Facturas ---------- */

async function getFacturas(env, page) {
  const token = await getToken(env);
  const schemaId = await getSchemaId(env);
  const entity = env.FACTURAS_ENTITY || "FACTURA";
  const smartieId = env.FACTURAS_SMARTIE_ID;

  if (!smartieId) {
    throw new HttpError(
      500,
      "Falta configurar la variable FACTURAS_SMARTIE_ID en el Worker."
    );
  }

  const query = new URLSearchParams({
    smartieId,
    schemaId,
    page: String(page),
  });

  const response = await fetchSmartie(env, entity, query, token);

  if (!response.ok) {
    const text = await response.text();
    throw new HttpError(
      502,
      `La consulta a /${entity}/smartie falló (status ${response.status}): ${text}`
    );
  }

  return response.json();
}

/* ---------- Artículos (Stock > Consulta de Stock) ---------- */

async function getArticulos(env, page) {
  const token = await getToken(env);
  const schemaId = await getSchemaId(env);
  const entity = env.ARTICULOS_ENTITY || "CONSULTA_DE_STOCK";
  const smartieId = env.ARTICULOS_SMARTIE_ID || "2377";

  const query = new URLSearchParams({
    smartieId,
    schemaId,
    page: String(page),
  });

  const response = await fetchSmartie(env, entity, query, token);

  if (!response.ok) {
    const text = await response.text();
    throw new HttpError(
      502,
      `La consulta a /${entity}/smartie falló (status ${response.status}): ${text}`
    );
  }

  return response.json();
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

/* ---------- Helpers ---------- */

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