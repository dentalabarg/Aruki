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

## Menú (v3.4)
Presupuesto automático (Cotizaciones, Relaciones) → Presupuesto manual (Armar presupuesto, módulo `manual`) →
Consultas (Artículos, Control Facturas). Al entrar se abre Cotizaciones.

## Estructura
```
index.html          Solo estructura HTML (login, barra superior, menú lateral, secciones de módulos)
css/styles.css      Estilos (sistema de diseño YiQi, tema claro/oscuro)
js/changelog.js     LATEST_VERSION + array CHANGELOG (panel "Novedades")
js/core.js          Tema, login, menú lateral, utilidades, carga de smarties y createDataModule()
js/facturas.js      Módulo Control Facturas
js/articulos.js     Módulo Artículos + getArticulosCatalog() (SKU, nombre, columnas de precio)
js/relaciones.js    Presupuestos › Relaciones (CRUD contra /relaciones) + getRelacionesIndex()
js/cotizaciones.js  Presupuestos › Cotizaciones (lectura de lista, búsqueda, tabla editable, Excel)
js/cot-archivos.js  Cotizaciones: lectura de archivos (Excel/Word/PDF/txt) → texto en el cuadro → cotProcess()
js/cot-ia.js        Cotizaciones: revisión con IA (Gemini vía Worker /ia/elegir) de renglones dudosos/sin coincidencia
js/clientes.js      Clientes de YiQi (`clientesStore`, smartie 1834 vía /clientes, caché IndexedDB 4 h) + `clientePicker(inputId)`
js/presupuesto-comun.js  Compartido: `presExcel(doc)`, `presPdf(doc)` (jsPDF 2.5.1 + autotable 3.8.2 de cdnjs), `presSendYiqi()`
js/observaciones.js Observaciones + Etiquetas (v5.7): `etq` (GET/PUT /etiquetas, respaldo localStorage `aruki-etiquetas`
                    si el conector da 404), ventana `#etqModal`, `obsWidget(cfg)` y `obsEmpty()` para cada módulo
js/manual.js        Presupuesto manual (estado `man`, borrador localStorage `aruki-manual`)
js/main.js          Navegación entre módulos (MODULES) + inicio
worker/aruki-worker.js  Copia del conector de Cloudflare (ver abajo)
```
Los scripts son clásicos (no módulos ES) y comparten el ámbito global; el orden de carga en
`index.html` importa: changelog → core → facturas → articulos → relaciones → clientes → presupuesto-comun → observaciones →
cotizaciones → cot-archivos → cot-ia → manual → main.

## Reglas de cada cambio (obligatorias)
1. Subir `LATEST_VERSION` en `js/changelog.js` (1.5 → 1.6 …; después de X.9 sigue la (X+1).0, ej. 3.9 → 4.0).
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
- Guarda como secretos: `YIQI_USER`, `YIQI_PASSWORD`, `ARUKI_USER`, `ARUKI_PASSWORD`, `SESSION_SECRET`, `GEMINI_API_KEY`.
  **Nunca** poner credenciales en el HTML/JS del repo (el repo es público).
- Rutas de datos (requieren `Authorization: Bearer <token>`): `/facturas?page=N`, `/articulos?page=N`,
  `GET /relaciones` → `{ relaciones, version }` y `PUT /relaciones` con `{ relaciones, baseVersion }`
  (lista completa; 409 si `baseVersion` no coincide → recargar).
- Binding KV **`ARUKI_KV`**: clave `relaciones` y claves `login-fail:<ip>` (bloqueo de 15 min tras 5 intentos fallidos).
- Relación: `{ id, texto, skus: [..], nota, creado, actualizado }`; por condiciones agrega `reglas: [{op, valor}]`;
  **palabra equivalente** (v2.9) tiene `reemplazo` y `skus: []`; **regla para la IA** (v4.6) tiene `ia: true`, `skus: []` y la
  instrucción en `texto` (`relTipo()` → ia | reglas | palabra | texto; `relEsIa()`). v5.0: palabra equivalente = grupo: `reemplazo`
  admite varias palabras separadas por coma (`relPalabras()`); `cotUserAliases()` lleva todas a la primera de `reemplazo`;
  `relFindDup` palabra = comparten alguna palabra; v5.2: formulario = izquierda "La palabra o palabras…" (`#relPalabrasWrap`, un renglón por
  palabra en `rel.formEquivs`/`#relEquivs`, "+ Nuevo equivalente") → se guardan en `texto` separadas por coma; derecha
  "Es lo mismo que…" (`#relReemplazo`, uno solo) → `reemplazo`. `relEquivLados(r)` / `relEquivCanon(r)` / `relGrupo(r)`
  (compatibles con las de v5.0 que tenían varias en `reemplazo`). Tabla: palabras en la 1.ª columna, equivalente en Artículo(s); Worker guarda `reemplazo` hasta 400 caracteres. Botón "Reglas de Aruki"
  (`#relBuiltinBtn`, `relBuiltinHtml()`): ventana solo lectura armada con COT_UNIT_ONLY, COT_ALIAS, COT_STOP,
  COT_GENERO_KEEP, COT_MAX_OPTIONS y `COT_IA_REGLAS_FIJAS` (cot-ia.js) — si se agrega una regla programada, sumarla ahí. Las equivalencias se aplican
  en `cotTokens()` (pedido y catálogo) además de `COT_ALIAS`.
  v3.1: filtros por tipo (`rel.filtro`), aviso en vivo de relación igual (`relFindDup()`: texto igual, mismas
  condiciones en cualquier orden, o mismo par de palabras en cualquier sentido). Cotizaciones: "Guardar todas como
  relaciones" (`cotSaveAllRelations()`; renglones con un solo SKU, sin relación previa; undo `rel.type = "bulk"`). Comparar textos con `relKey()` (sin tildes/mayúsculas).
- v5.7 Etiquetas: KV `etiquetas` = `{ etiquetas:[{id,titulo,cuerpo,creado,actualizado}], version }`, GET/PUT `/etiquetas`
  (409 si `baseVersion` no coincide). Cada presupuesto guarda `obs = { texto, etiquetaId, base }` en su borrador
  (`cot.obs` / `man.obs`): `texto === base` → no se editó y sigue a la etiqueta si cambia. Desplegable arriba (`#cotObsSel`,
  `#manObsSel`, vacío "…" por defecto) + botón Etiquetas; caja abajo (`#…ObsText`, `#…ObsSel2`, Guardar en la etiqueta /
  Guardar como etiqueta nueva). Va en `doc.observaciones` (Excel y PDF abajo de todo) y en `pedido.observaciones` →
  Worker `PEDI_OBSERVACIONES` (si el front viejo no lo manda, queda "Creado desde Aruki por …").
- v5.8: logo `img/logo-dentalab.png` (1200×345, sin modificar el diseño) en el PDF (`presLoadLogo()`, alto 13 mm); PDF y Excel
  sin "Lista de precios" ni "Condición IVA" ni "Insumos odontológicos". Azul de la marca **#1B60AB** (27,96,171): `--cyan`
  del tema claro y color del PDF (el tema oscuro sigue con #00ccff). En Artículos las casillas son comunes (no interruptores).
- v5.9: recuadro de opciones con sombras internas por celda (`--sl/--sr/--st/--sb`, 3 px; los bordes de tabla no se veían
  arriba) y filas alternadas `box-alt` (dos amarillos). Listas `.rel-results` sin barra horizontal (`overflow-wrap:anywhere`).
  `select.ds-input` con `appearance: base-select` (Chrome/Edge) para que la lista abierta tenga el diseño de la de clientes.
  Casillas de Artículos propias (cuadrado redondeado, tilde blanca, azul). Favicon en #1b60ab.
- v5.7: todas las casillas son interruptores por CSS global (`html input[type="checkbox"]`, appearance none) y se pueden
  arrastrar (core.js, al final). Cotizaciones: acciones (`.cot-actions` + `#cotStatus`) arriba de la tabla; `#cotIaAuto`
  ("Revisar con IA (Gemini)") junto a `#cotIaLeer` en `.cot-file-checks`.
- Evento `aruki:loaded` (`detail.endpoint`) se dispara en `document` cuando un módulo de datos termina de cargar.
- `ALLOWED_ORIGIN` debe ser `https://dentalabarg.github.io` (no `*`). Variables opcionales: `SCHEMA_ID`, `FACTURAS_ENTITY`, `FACTURAS_SMARTIE_ID`,
  `ARTICULOS_ENTITY`, `ARTICULOS_SMARTIE_ID`.

## API de YiQi (lo que ya está confirmado)
- Token: `POST https://api.yiqi.com.ar/token` (form: grant_type=password, username, password).
- schemaId: `GET https://api.yiqi.com.ar/api/accountapi/GetLoginInformation` → `{ userId, userName, schemaName, host, schemaId }`.
  **Desde 2026-10-19 hay dos esquemas en YiQi con el mismo usuario** y el login cae por defecto en el último creado (incorrecto).
  Aruki usa el **esquema 328**: variable `SCHEMA_ID=328` cargada en el Worker de Cloudflare (`getSchemaId()` la usa primero).
  Si alguna vez dan "Smartie … not found", revisar esa variable.
- Smartie: `GET https://api.yiqi.com.ar/api/public/{ENTIDAD}/smartie?smartieId=&schemaId=&page=` (página base 1,
  ~50 filas) → `{ data: [...], total, columns: [{ title, field, dataType, OrdenColumna, … }] }`.
- Facturas: entidad `FACTURA`, smartie "Z. Facturas Github" (ID **2355**, en la variable `FACTURAS_SMARTIE_ID`;
  ~40.000 registros). Campos: `CLIE_RAZON_SOCIAL, PUVE_NOMBRE, TIFA_NOMBRE, FACT_NUMERO, COVE_DESCRIPCION,
  FACT_EXTE_NOMBRE, VEHA_NOMBRE, FACT_PENDIENTE_CANCELACIO, FACT_TOTAL, FACT_FECHA_EMISION, DESC_ESTADO, id`.
- Artículos: entidad `CONSULTA_DE_STOCK`, smartie **2377**. Columnas: Identificador, SKU, Nombre,
  Deposito 1 - Local, Deposito Central, Lista Reventa, Precio Mayorista, Lista 1 - Contado, Lista 2 - General.
  La tabla se arma sola desde `columns`.
- Materiales: entidad `MATERIAL`, smartie 1539 (`MATE_CODIGO` = SKU, `id`, `MATE_NOMBRE`).
- Aruki es **solo lectura**: no crear ni modificar nada en YiQi salvo pedido explícito del usuario.
  **Única escritura (v3.4, pedida por el usuario): crear Pedido.** Worker `POST /pedido` `{ clienteId, cliente, lista, items:[{sku,cantidad,precio|null,texto}] }`
  → `POST /PEDIDO` `{ schemaId, data:{ EXTE_ID_EXTE (Origen "Local"), CLIE_ID_CLIE, LIDP_ID_LIDP, PEDI_OBSERVACIONES,
  Productos:[{ MATE_ID_MATE, DEDP_CANTIDAD, DEDP_PRECIO_UNITARIO_FINA (precio FINAL, solo si se cambió a mano), DEDP_TEXTO_ADICIONAL }] } }`;
  respuesta `{ ok, newId, error, parameter(JSON string) }` (HTTP 200 con ok=false = error de negocio).
  Búsquedas: `GET /{ENTIDAD}/search?schemaId&CAMPO=valor` (array plano, filtros por igualdad): MATERIAL por MATE_CODIGO,
  LISTA_DE_PRECIO (LIDP_NOMBRE, se compara con el título de la columna de precio), CLIENTE "Consumidor Final".
  Cliente vacío → "Consumidor Final" = **id 8192** (hay otro "consumidor final" en minúsculas que NO se usa); el
  picker lo autoselecciona al quedar vacío y despliega todos los clientes al hacer foco (`cliAll()`). (`CLI_CONSUMIDOR_FINAL_ID` en clientes.js; Worker `CONSUMIDOR_FINAL_ID`).
  Origen de pedido "Local" = **id 3** (confirmado por el usuario; variable `ORIGEN_PEDIDO_ID` lo cambia). Las entidades
  EXTERNAL_SYSTEM / ORIGEN_DE_PEDIDO / ORIGEN_PEDIDO / SISTEMA_EXTERNO dan 404.
  `GET /yiqi/diagnostico` muestra origen, listas y Consumidor Final encontrados.
- Lectura rápida (v3.7, `fastSmartie()` en el Worker) para /clientes, /articulos y /facturas: lee la página 1 de la
  smartie (columnas + total), pide `POST /{ENTIDAD}/query?schemaId=` `{ page, pageSize: 1000, columns:[{field,…}] }` con esas
  mismas columnas y la usa solo si YiQi la acepta y el `total` coincide (si no, smartie de a 50). Responde `modo`
  ("rapido" | "smartie"); v3.10: pide también `{field:"id"}` (si YiQi lo rechaza, sin id; si la smartie trae id y la
  consulta no, usa la smartie). v4.1: los filtros de cada smartie NO vienen por API: se copian en `fastFilterCandidates()`
  (CLIENTE: CLIE_ACTIVO = true/1/"S"…; FACTURA: FACT_FECHA_EMISION >= 2026-07-01, FACT_EXTE_NOMBRE != "Mercado Libre",
  CLIE_ID_CLIE != 8192) y se prueban variantes con pageSize 1 hasta que el total coincide. Si no, responde `motivo`
  (se ve en el tooltip del botón Actualizar vía `modoTexto()`). v4.2: ante error 500 prueba sin id y diagnostica columna
  por columna. v4.3: si no hay filtros cargados y el total no coincide, `estadoFilters()` agrupa por ESTA_CODIGO/DESC_ESTADO
  (COUNT del SKU) y excluye (!=) los estados cuya suma explica la diferencia. CONSULTA_DE_STOCK: con `id` da 500;
  sin filtros da 8352 vs 7318 de la smartie y el agrupado por estado da 500 → v4.4: Artículos va SIEMPRE por smartie
  (variable `ARTICULOS_RAPIDA=si` para reintentar). Clientes y Facturas confirmados por lectura rápida. Si el usuario cambia filtros en YiQi, actualizar ahí.
  `loadAllPages()` manda `&modo=` en las páginas siguientes para no mezclar. `CONSULTA_RAPIDA=no` la apaga.
  `/{ENTIDAD}/file` y `/{ENTIDAD}/report` son archivos/PDF de UNA instancia (no exportan listas a Excel).
- Clientes: entidad `CLIENTE`, smartie **1834** (columnas Nombre, Razón Social, CUIT/Documento, Condición IVA - Descripción, `id`).
  v6.0: `cliOculto(c)` saca de la lista (y del caché) los que dicen discontinuado/descontinuado o tienen ≥3 asteriscos
  en nombre o razón social; Consumidor Final (8192) nunca se oculta.
- Las especificaciones de la API (OpenAPI) se descargan de `https://apidoc.yiqi.com.ar/erpdemo.schema-<Módulo>-api.json`
  (desde acá el dominio está bloqueado: pedirle al usuario que las adjunte).
- Uso responsable: pocas consultas en paralelo (hoy 4), reintentos con espera.

## Cómo funcionan los módulos de datos
`createDataModule(cfg)` (en `js/core.js`) descarga **todas** las páginas de la smartie al abrir el
módulo (barra de progreso, botón Detener), y la búsqueda/filtros/paginación se hacen en el navegador
sobre todo lo cargado (sin tildes ni mayúsculas, varias palabras = todas deben aparecer).
v3.2: `cfg.cache = { key, maxAgeHours }` (hoy solo Artículos, 4 h) guarda filas/columnas en **IndexedDB**
(`aruki-cache`, helpers `cacheGet/cacheSet/cacheClearAll`). Al entrar se usan las guardadas (sin descargar); si
pasaron las horas, o con Actualizar, `refreshInBackground()` descarga todo sin tocar `m.rows` (flag `m.refreshing`,
`m.loading` queda false) y reemplaza solo si terminó completo. Un `setInterval` de 1 min revisa la antigüedad.
Al cerrar sesión se borra el caché.
v3.3 (`js/articulos.js`): `artRowExcluded(row)` oculta en Artículos (cfg.filter) y saca de `getArticulosCatalog().list`
(Cotizaciones/Relaciones) los que tienen en SKU/nombre `ART_EXCLUDE` (discontinuado, mercado libre, para fraccionar, rep wm)
o **todos** los precios en 0/vacíos; `bySku` sigue teniendo todos (para mostrar nombres de relaciones viejas).
Columna Identificador oculta (`ART_HIDDEN_TITLE`). v6.3: orden por SKU con `skuCompare()` (core.js: partes por "-", `Intl.Collator` numérico, números antes que letras) en la tabla de Artículos (`cfg.sortRows` de `createDataModule`, se reordena solo si cambian las filas), en `getArticulosCatalog().list` y en `relSearchArticulos()` (buscadores de Cotizaciones, Relaciones y Armar presupuesto: exacto → empieza con → resto, cada grupo por SKU). v5.4: botón `.art-copy` (`data-copy`, `artCopyName()`) al final del nombre: siempre
ocupa lugar con `visibility:hidden` y se ve con `tr:hover` (no cambia el alto); el clic no selecciona la fila. Buscador
`#view-articulos .search-wrap` min 340 px. v5.5: precios (`td.money`) también con `.art-copy` (botón a la izquierda; copia sin "$",
`data-text`); `.art-main td{vertical-align:middle}`; X `#artSearchClear` (vacía y dispara `input`). Armar presupuesto:
SKU (`data-field="sku"`) y nombre (`.name-view` → `data-field="nombre"`) editables como en Cotizaciones, lista flotante
`#manSkuResults`, `manSetSku()` con Deshacer (borra el precio a mano). Anchos de columna a mano en localStorage `aruki-art-colw` ({field: px}).
v3.5: los `.runtime-banner` solo se ven con `data-state="error"` (CSS). Los botones de actualizar están en la barra
superior (`.sync-btn`: `#syncCliBtn` → `clientesStore.refresh()`, `#artRefreshBtn` y `#refreshBtn` = `ids.refresh` de
Artículos y Facturas); `syncBtnProgress(btn, progress|null, error, done)` los rellena (`--p`, `data-pct`); tocarlos mientras cargan detiene (v3.6). Artículos: selección por SKU
(`artSel` = Map SKU→cantidad, input `.art-qty` al lado de la casilla, barra `#artSelBar`) → `manAddSkus([{sku, qty}])`
(v4.7: no cambia de módulo; `manAddSkus` devuelve el texto y Artículos muestra `#artToast` con Deshacer = `manUndo()` y Ver presupuesto). Columna optativa "Stock real" (`.col-stock`,
clase `show-stock` en la tabla, `presStockHtml(item, cantidad)` → rojo si stock < cantidad); v3.8: va después de Cantidad
(en Cotizaciones col 6 = Cantidad, 7 = Stock; 11 columnas). `fitScrollArea(viewId)` (core.js) ajusta el alto de `.art-scroll`
en Artículos y Relaciones para que la página no tenga scroll propio (ResizeObserver sobre `.content`).
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
1. ✅ Relaciones (v1.6).
2. ✅ Cotizaciones con texto pegado (v1.7). Detalles de `js/cotizaciones.js`:
   - `cotParseLine()` lee cada renglón: columnas con tab o " | " (Excel/Word) o texto libre; cantidad al
     principio ("10 guantes"), al final con "-", ":", "(n)", "cant", unidad ("2 cajas") o "x n" solo si n ≤ 20
     (más grande se toma como presentación: "algodón x 500"). Sin cantidad → 1. Saltea encabezados.
     v4.8: abreviatura de unidad antes del número final (`COT_UNIT_ONLY`: uns, und, unid, uni, u…): "Guantes Uns 10" → 10
     (se saca la abreviatura); si antes hay un número ("x100 und. 5") es presentación + cantidad. `cotIaReglas()` agrega
     siempre la aclaración de unidades para Gemini.
     v5.0: `COT_COMBO` (nombre "COMBO - …") → `it.combo` en el índice; `cotSearch()` los saltea (no se eligen solos ni van a la IA;
     la búsqueda manual de SKU/agregar sí los muestra). `cotGenero()` después de `cotSingular`: palabra ≥4 letras terminada en "a"
     → "o" (anodizada = anodizado), salvo `COT_GENERO_KEEP` (punta, manga, cera, bolsa, plata…).
     v4.9: `COT_STOP` incluye rótulos de licitación (presentacion, forma farmaceutica, droga generica, uso, producto,
     descripcion, capacidad, proceso, similar, p, t, si, envase, odontologico…), también después de `cotSingular`; las
     palabras que no están en ningún artículo restaban mucho puntaje. Probado con un Excel real `RGN | DESCRIPCION | CANTIDAD`
     (cantidad "10 Uns", presentación en la descripción: "Caja x 10UNs.", "CAJA X 6 UNs.", "(Bolsa por 100 unidades)").
   - `cotSearch()`: índice de palabras del catálogo (excluye discontinuado / mercadolibre / "rep "), peso tipo IDF,
     palabras con números ×1,5, prefijos 0,75, plurales simples, penaliza medidas distintas (4g vs 2g),
     excluye artículos con precio 0 en la lista elegida.
   - `cotResolve()`: Relación (texto exacto con `relKey`) → "relacion"; score ≥ 0,75 y 0,08 de ventaja → "buena";
     ≥ 0,4 → hasta `COT_MAX_OPTIONS` (10) opciones "dudosa" (mismo `grupo`); si no, "sin". Enviar a YiQi manda todas
     las opciones; solo frenan los renglones "sin" (rojo) o sin SKU. Umbrales a ajustar con listas reales.
   - Excel con SheetJS desde cdnjs (se carga al exportar). Borrador en localStorage `aruki-cotizacion`.
   - v1.8: nombre buscable (`.name-view` → input `data-field="nombre"`), Deshacer (`cot.undo`, snapshots de filas;
     revierte también la relación creada/actualizada), anchos de columna en localStorage `aruki-cot-colw`
     (`colgroup` + `table-layout:fixed`), recuadro por grupo (`box`, `is-option` amarillo / `is-none` rojo),
     columna Marca (`getArticulosCatalog()` toma la columna cuyo título contiene "marca").
   - v1.9: Rehacer (`cot.redo`; `cotApplyRel()` revierte o reaplica la relación), barra `.cot-actions` debajo de la
     tabla (Agregar artículo → Deshacer → Rehacer), aviso flotante `#cotToast` 5 s con Deshacer (`cotShowToast()`).
   - v2.2: `cotSingular()` (vasos→vaso, flores→flor, luces→luz) en pedido y catálogo; marca pedida (`idx.brands`
     desde la columna Marca, `cotBrandKey()`): ×1,4 a esa marca, ×0,7 a otra marca conocida; medida más parecida
     (g≈ml, kg/l ×1000) resta hasta 20 % según distancia. Precio editable por renglón (`row.precio`, null = lista;
     `cotRowPrice()`), se borra al cambiar el SKU. Selector "Cantidad" (`cot.modo`: cantidad | disponibilidad):
     `cotDisponibilidad()` con `item.stock` (suma de columnas "Deposito 1 - Local" + "Deposito Central"):
     >5 En stock, 1–5 Pocas unidades, 0 Sin stock; en ese modo se ocultan Subtotal y Total (`.mode-disp`).
     Relaciones por condiciones: campo `reglas: [{op, valor}]` (ops en `REL_OPS` de relaciones.js), todas deben
     cumplirse sobre `relKey(renglón)`; `findRelacionPorReglas()` se usa después del texto exacto. El Worker guarda
     `reglas` desde esta versión (`cleanRelacion`).
   - v2.3 IA para dudosos (`js/cot-ia.js`): grupos con estado mostrado "dudosa"/"sin" y sin `iaRevisado` → POST
     `/ia/elegir` `{ renglones: [{ id: grupo, solicitado, candidatos: [{sku,nombre,marca}] }] }` (opciones actuales +
     `cotSearch(…, 12)`, máx. 15; lotes de 25). El Worker llama a Gemini (`GEMINI_API_KEY`, `GEMINI_MODEL` opcional,
     default gemini-3.6-flash, JSON con responseSchema, reintentos 3 s/8 s) y solo acepta SKU que estaban entre los
     candidatos. Resultado → fila con estado "ia" (`iaMotivo` en el title del badge); sin elección → `iaRevisado`.
     Casilla `#cotIaAuto` (localStorage `aruki-cot-ia`) la corre después de Armar; botón `#cotIaBtn` a mano. Con Deshacer.
     v4.5: lotes de 20 (`COT_IA_LOTE`), 3 en paralelo (`COT_IA_PARALELO`); `/ia/elegir` usa `geminiJSON({fast:true})` →
     `thinkingConfig` mínimo (`fastThinking()`: Gemini 3 `thinkingLevel:"minimal"`, 2.5 `thinkingBudget:0`; si da 400 se
     reintenta sin), esperas 1,5 s/3 s; responde `modelo` y `ms`, y el aviso muestra modelo y segundos. /ia/leer sin cambios.
     v4.6 "entrenamiento" desde Relaciones: `/ia/elegir` recibe además `reglas` (textos de las "Reglas para la IA" +
     equivalencias como frase; `cotIaReglas()`, máx. 60) y `ejemplos` (`cotIaEjemplos()`: hasta 3 relaciones texto/condiciones
     parecidas por renglón por palabras en común con `cotTokens`, máx. 30 por tanda: `{escribio, articulos:[{sku,nombre}], nota}`).
     El Worker los suma al JSON del usuario y al prompt, responde `guia: true` (si falta, el aviso dice que hay que actualizar el conector).
     v6.1: `COT_IA_CANDIDATOS` = 20 (opciones actuales + búsqueda, máx. 20 por renglón); el Worker acepta hasta 25 y compara
     el SKU elegido sin mayúsculas/espacios (`skuKey`) contra los candidatos.
     v4.7: las `reglas` van en el `systemInstruction` (IA_PROMPT + "Reglas de Dentalab"); los `ejemplos` en el JSON del usuario, antes de `renglones`.
     v2.4: el Worker prueba `GEMINI_MODEL` y después `GEMINI_FALLBACK_MODELS` (default gemini-flash-latest,
     gemini-flash-lite-latest): 3 intentos por modelo (esperas 2 s/5 s) ante 429/500/503, salta al siguiente si 404;
     si todos saturados → 503 con mensaje claro. Responde `modelo` usado.
   - v2.7: equivalencias `COT_ALIAS` en `cotTokens()` (después de `cotSingular`). v5.1: quedó VACÍO a pedido del usuario
     (autocurable/termocurable las carga él como Relaciones); no volver a agregar equivalencias fijas sin que lo pida.
     Para sumar otra, agregar una entrada (palabra completa en singular → como figura en el artículo).
   - Tipografía: los datos (tablas, listas, chips, resultados) van 1px más grandes que la interfaz fija.
   - v5.6: `priceFormatter` (core.js) es `{format}`: entero → sin decimales, si no 2 (`priceIsWhole()`); igual `cotPriceInput`
     y el formato de Excel. En `cotRender()` un renglón "manual"/"ia" de un grupo que todavía tiene opciones "dudosa"
     (`conOpciones`) queda en el recuadro con el ✓ `data-pick` (etiqueta "Manual"; "Opción n de N" solo para las dudosas).
     Grupos de relación con varios SKU no se tocan. Artículos copia precios con "$".
3. ✅ Lectura de Excel, Word y PDF con texto (v2.0, `js/cot-archivos.js`). Librerías desde cdnjs, cargadas al usarse:
   SheetJS 0.18.5, mammoth 1.13.0 (docx → HTML: tablas fila por fila, párrafos), pdf.js 3.11.174 (worker vía blob;
   renglones por coordenada Y, columnas con TAB si hay hueco grande). `cotRowsToLines()` detecta la fila de títulos
   (descripción / cant / presentación / marca) y genera `cantidad<TAB>descripción presentación marca`.
   PDF sin texto o fotos → mensaje "próxima etapa".
   v2.1 PDF con títulos: columna por superposición con el título; si no se superpone y arranca en `descX`
   (x más repetido bajo "Descripción") va a descripción; si no, la más cercana. Artículos de varios renglones:
   se cierran con hueco > 1,45×alto de letra, nueva cantidad o nueva fila de precios. Cantidad pegada
   ("4 Cavitador") se separa. Corta en el pie (`COT_PDF_END`: total, condiciones de pago, etc.).
   Probado con una orden de compra real de Google Sheets (43 artículos, 2 páginas).
4. ✅ PDF, PDF escaneados y fotos con Gemini (v2.5). Casilla `#cotIaLeer` (localStorage `aruki-cot-ia-leer`, marcada
   por defecto): `cotReadWithIA()` manda el archivo en base64 a `POST /ia/leer` `{ archivo, mimeType, nombre }`
   (fotos achicadas a 2000 px JPG; máx. 14 MB) → `{ renglones: [{ cantidad, descripcion, presentacion, marca }] }`
   → líneas `cantidad<TAB>texto` en el cuadro. Si falla: PDF → lectura común (`cotReadPdf`) con aviso; foto → error.
   En el Worker, `geminiJSON()` es el helper común (modelo principal + reserva) de /ia/elegir y /ia/leer.
   v2.8: las fotos van siempre por IA; la casilla `#cotIaLeer` solo decide para los PDF.
   Excel y Word siguen sin IA.
   v6.2: `#cotFile` con `multiple` y soltar varios: `cotHandleFiles(files)` los lee de a uno (`cotFileProg` = "(n de N) " en
   el aviso), junta todos los renglones en `#cotTexto` (un solo presupuesto) y sigue aunque alguno falle (lo dice en el aviso).
   HTML (.html/.htm, ej. mail de Gmail guardado): `cotReadHtml()` (DOMParser, charset del `<meta>`) toma las tablas cuyas filas
   propias tienen títulos (`cotRowsToLines.header`; mails = tablas dentro de tablas); si no hay, `cotHtmlTextLines()`.
   `cotNodeText()` pone espacio entre párrafos de una celda (también en Word). Título "Unidades" = cantidad (`COT_COL.qty`).

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
