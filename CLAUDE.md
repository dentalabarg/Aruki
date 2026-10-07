# Aruki — instrucciones para Claude

Aruki es la herramienta web interna de **Dentalab** (insumos odontológicos, Argentina).
Lee datos del ERP **YiQi** (solo lectura) y los muestra por módulos.
Publicada con GitHub Pages: https://dentalabarg.github.io/Aruki/

## Sobre el usuario
- Alex Samandjian, dueño de Dentalab. **No programa**: hablarle en español rioplatense simple,
  sin jerga, y guiarlo paso a paso cuando tenga que hacer algo (Cloudflare, YiQi, GitHub).
- Quiere todo **simple, gratuito y permanente**.
- Valora gastar pocos tokens: leer solo los archivos necesarios, editar con cambios puntuales,
  no reescribir archivos enteros.

## Estructura
```
index.html          Solo estructura HTML (login, barra superior, menú lateral, secciones de módulos)
css/styles.css      Estilos (sistema de diseño YiQi, tema claro/oscuro)
js/changelog.js     LATEST_VERSION + array CHANGELOG (panel "Novedades")
js/core.js          Tema, login, menú lateral, utilidades, carga de smarties y createDataModule()
js/facturas.js      Módulo Control Facturas
js/articulos.js     Módulo Artículos
js/main.js          Navegación entre módulos (MODULES) + inicio
worker/aruki-worker.js  Copia del conector de Cloudflare (ver abajo)
```
Los scripts son clásicos (no módulos ES) y comparten el ámbito global; el orden de carga en
`index.html` importa: changelog → core → módulos → main.

## Reglas de cada cambio (obligatorias)
1. Subir `LATEST_VERSION` en `js/changelog.js` (1.5 → 1.6 …).
2. Agregar un bloque **al inicio** de `CHANGELOG`: `version`, `date` (AAAA-MM-DD, hoy),
   `title`, `items` con `type` = `nuevo` | `mejora` | `correccion`.
3. Actualizar el `?v=X.X` de **todos** los `<link>`/`<script>` de `index.html` para que el
   navegador no use archivos viejos en caché.
4. Probar antes de subir (ver "Pruebas").
5. Commit y push directo a `main` (el usuario no revisa pull requests). GitHub Pages publica solo
   en 1–2 minutos.
6. Si cambia el Worker: actualizar `worker/aruki-worker.js` y darle al usuario los pasos para
   pegarlo en Cloudflare (Workers & Pages → `aruki` → Edit code → pegar todo → **Deploy**).
   El Worker **no** se publica solo.

## Diseño
Sistema de diseño YiQi (https://github.com/diguardia/yiqi-imagen, `yiqi-design.md`):
tokens CSS en `:root` y `html[data-theme="light"]`, filosofía *borderless* (sombras, no bordes,
salvo inputs), fuentes Plus Jakarta Sans / Inter / IBM Plex Mono, íconos SVG inline,
toggle de tema Oscuro / Sistema / Claro. Reutilizar las clases existentes (`.panel`, `.card`,
`.btn`, `.badge-*`, `.runtime-banner`, `.pagination`, `.art-table`…).

## Conector (Cloudflare Worker)
URL: `https://aruki.dentalabarg.workers.dev` (constante `WORKER_BASE` en `js/core.js`).
- Valida el login de Aruki (`/auth/login`, `/auth/session`) con token firmado.
- Guarda como secretos: `YIQI_USER`, `YIQI_PASSWORD`, `ARUKI_USER`, `ARUKI_PASSWORD`, `SESSION_SECRET`.
  **Nunca** poner credenciales en el HTML/JS del repo (el repo es público).
- Rutas de datos (requieren `Authorization: Bearer <token>`): `/facturas?page=N`, `/articulos?page=N`.
- Variables opcionales: `ALLOWED_ORIGIN`, `SCHEMA_ID`, `FACTURAS_ENTITY`, `FACTURAS_SMARTIE_ID`,
  `ARTICULOS_ENTITY`, `ARTICULOS_SMARTIE_ID`.

## API de YiQi (lo que ya está confirmado)
- Token: `POST https://api.yiqi.com.ar/token` (form: grant_type=password, username, password).
- schemaId: `GET https://api.yiqi.com.ar/api/accountapi/GetLoginInformation` → `{ userId, userName, schemaName, host, schemaId }`.
- Smartie: `GET https://api.yiqi.com.ar/api/public/{ENTIDAD}/smartie?smartieId=&schemaId=&page=` (página base 1,
  ~50 filas) → `{ data: [...], total, columns: [{ title, field, dataType, OrdenColumna, … }] }`.
- Facturas: entidad `FACTURA`, smartie "Z. Facturas Github" (ID en la variable `FACTURAS_SMARTIE_ID`;
  ~40.000 registros). Campos: `CLIE_RAZON_SOCIAL, PUVE_NOMBRE, TIFA_NOMBRE, FACT_NUMERO, COVE_DESCRIPCION,
  FACT_EXTE_NOMBRE, VEHA_NOMBRE, FACT_PENDIENTE_CANCELACIO, FACT_TOTAL, FACT_FECHA_EMISION, DESC_ESTADO, id`.
- Artículos: entidad `CONSULTA_DE_STOCK`, smartie **2377**. Columnas: Identificador, SKU, Nombre,
  Deposito 1 - Local, Deposito Central, Lista Reventa, Precio Mayorista, Lista 1 - Contado, Lista 2 - General.
  La tabla se arma sola desde `columns`.
- Materiales: entidad `MATERIAL`, smartie 1539 (`MATE_CODIGO` = SKU, `id`, `MATE_NOMBRE`).
- Aruki es **solo lectura**: no crear ni modificar nada en YiQi salvo pedido explícito del usuario.
- Uso responsable: pocas consultas en paralelo (hoy 4), reintentos con espera.

## Cómo funcionan los módulos de datos
`createDataModule(cfg)` (en `js/core.js`) descarga **todas** las páginas de la smartie al abrir el
módulo (barra de progreso, botón Detener), y la búsqueda/filtros/paginación se hacen en el navegador
sobre todo lo cargado (sin tildes ni mayúsculas, varias palabras = todas deben aparecer).
Para un módulo nuevo: sección `view-<nombre>` + ítem `data-module="<nombre>"` en `index.html`,
archivo `js/<nombre>.js`, sumarlo a `MODULES` en `js/main.js` y a los `<script>`.

## Pruebas
Probar en Chromium headless con Playwright (ya instalado; no correr `playwright install`) abriendo
`file:///home/claude/aruki/index.html` e interceptando `*workers.dev*` con respuestas simuladas
(`/auth/login` → `{token,name}`; `/facturas` y `/articulos` → `{data,total,columns}`).
Verificar que no haya errores de JavaScript (`pageerror`) y que login, carga, búsqueda y navegación anden.

---

## En desarrollo: módulo Presupuestos
Dos submódulos dentro de "Presupuestos" en el menú lateral:

### Cotizaciones
Los clientes mandan listas largas de artículos (texto, PDF, fotos, Excel, Word) sin SKU, solo nombre,
presentación y cantidad. Aruki tiene que armar el presupuesto con los artículos del módulo Artículos.
- Antes de procesar: nombre del cliente (opcional) y **lista de precios** a usar (columnas de precio de
  Artículos: Lista Reventa, Precio Mayorista, Lista 1 - Contado, Lista 2 - General).
- Columnas del resultado: **Solicitado** (texto tal cual lo pidió el cliente), **SKU**, **Nombre del
  artículo**, **Texto adicional editable**, **Cantidad**, **Precio** (de la lista elegida).
- Si no hay coincidencia clara, varias filas-opción para el mismo renglón.
- Acciones: exportar a Excel, reordenar arrastrando, editar SKU (autocompleta nombre y precio),
  eliminar renglones, agregar renglones con búsqueda por SKU o nombre, "Guardar como relación".

### Relaciones
Relaciones manuales: "si el cliente escribe X → el artículo es SKU A (o A y B)". Se consultan antes que la
búsqueda automática. Guardado en **Cloudflare KV** a través del Worker (persistente y compartido entre
computadoras), con botón de respaldo (descargar/importar).

### Arquitectura acordada (para gastar pocos tokens de IA)
1. **Leer el archivo** → lista limpia `{ solicitado, cantidad, presentacion }`:
   - texto pegado, Excel (SheetJS), Word (mammoth) y PDF con texto (pdf.js) en el navegador, gratis;
   - fotos y PDF escaneados (y listas muy desordenadas) con **Gemini** desde el Worker
     (clave como secreto `GEMINI_API_KEY`, nunca en el navegador).
2. **Buscar cada renglón** en el navegador, sin IA: primero Relaciones, después búsqueda por parecido contra
   todos los artículos (normalizar tildes/mayúsculas, dar peso a medidas y presentaciones: "x 500 und", "4gr",
   colores A2/A3, números de fresa, marca).
3. **Renglones dudosos**: opcionalmente Gemini, mandando solo ese renglón + ~10 candidatos (nunca el catálogo entero).

### Etapas
1. Relaciones (KV + pantalla de alta/baja/edición + respaldo).
2. Cotizaciones con texto pegado: búsqueda, tabla editable, arrastrar, lista de precios, exportar Excel.
3. Lectura de Excel, Word y PDF con texto.
4. Fotos y PDF escaneados con Gemini.

### Aprendizajes del sistema "Licitaciones" (Google Sheets + Apps Script, del mismo usuario)
- Gemini: `POST https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=…`
  con `generationConfig: { responseMimeType: "application/json", responseSchema }`; reintentos ante 429/500/503
  (esperas 3 s y 8 s). Archivos como `inline_data { mime_type, data(base64) }`.
- Ese sistema manda el catálogo completo a Gemini en cada análisis (muchos tokens): **no** repetirlo en Aruki.
- Excluir del catálogo para sugerir: descripciones con "discontinuado", "mercadolibre"/"mercado libre",
  repuestos (SKU o descripción que empieza con "rep "), y artículos con precio 0.
- Regla de marcas: renglones del mismo tipo de producto en distintos colores/variantes (p. ej. compresas
  de colores) deberían usar marcas distintas entre sí.
- Aprende de correcciones (solicitado → SKU correcto): en Aruki eso es "Guardar como relación".
- Sacar todas las opciones razonables cuando hay duda; mejor que sobren a que falten.
- Para stock solo importan "Depósito 1 - Local" y "Depósito Central".

### Ejemplos de listas reales
El usuario tiene ejemplos (un Excel con columnas `IT. | Cant. | Descripción`, ~65 renglones de fresas,
composites, agujas, etc.; y una tabla en imagen con `DESCRIPCIÓN | PRESENTACIÓN | CANTIDAD`).
No se guardan en el repo (es público): pedírselos al usuario cuando haga falta.
