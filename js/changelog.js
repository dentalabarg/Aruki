/* ============================================================
   CONFIG: VERSIÓN Y CHANGELOG
   -----------------------------------------------------------
   Se actualiza en cada cambio pedido: subir LATEST_VERSION y
   agregar un bloque nuevo AL PRINCIPIO del array.
   ============================================================ */
const LATEST_VERSION = "2.5";
const CHANGELOG = [
  {
    version: "2.5",
    date: "2026-10-08",
    title: "Cotizaciones: PDF y fotos leídos con IA",
    items: [
      { type: "nuevo", text: "Los PDF (también los escaneados) y las fotos JPG o PNG los lee Gemini, que une los artículos que ocupan varios renglones del mismo casillero" },
      { type: "nuevo", text: "Casilla \"Leer PDF y fotos con IA\" (viene marcada) en la zona para subir archivos" },
      { type: "mejora", text: "Si Gemini no responde, los PDF con texto se leen igual con la lectura común y aparece un aviso para revisar" },
      { type: "mejora", text: "Las fotos grandes del celular se achican antes de enviarlas, para que sea más rápido" }
    ]
  },
  {
    version: "2.4",
    date: "2026-10-08",
    title: "IA: modelo de reserva cuando Gemini está saturado",
    items: [
      { type: "mejora", text: "Si el modelo de Gemini está saturado, el conector reintenta y pasa solo a un modelo de reserva" },
      { type: "mejora", text: "Si todos están saturados, aparece un aviso claro para probar de nuevo en unos minutos" }
    ]
  },
  {
    version: "2.3",
    date: "2026-10-08",
    title: "Cotizaciones: ayuda con IA para los renglones dudosos",
    items: [
      { type: "nuevo", text: "Los renglones en amarillo o rojo se pueden revisar con IA (Gemini): se le manda solo ese renglón y los artículos más parecidos, y elige el correcto" },
      { type: "nuevo", text: "Casilla \"Revisar con IA los renglones dudosos\" para que pase solo al armar el presupuesto, y botón \"Revisar dudosos con IA\" para hacerlo cuando quieras" },
      { type: "nuevo", text: "Los elegidos por la IA aparecen como \"Elegido por IA\"; pasando el mouse se ve el motivo. Se puede deshacer" }
    ]
  },
  {
    version: "2.2",
    date: "2026-10-07",
    title: "Cotizaciones y Relaciones: marcas, condiciones, precio editable y disponibilidad",
    items: [
      { type: "nuevo", text: "Opción Cantidad: \"Respetar cantidad solicitada\" o \"Disponibilidad simplificada\" (En stock / Pocas unidades / Sin stock, sumando Depósito 1 - Local y Depósito Central). Se puede cambiar en cualquier momento" },
      { type: "nuevo", text: "El precio de cada renglón se puede cambiar a mano; \"volver a lista\" lo restablece" },
      { type: "nuevo", text: "Relaciones por condiciones: contiene, no contiene, comienza con, no comienza con, termina con, no termina con. Se pueden combinar varias en la misma relación" },
      { type: "mejora", text: "Si el cliente nombra una de nuestras marcas, se prioriza esa marca y después la medida más parecida" },
      { type: "mejora", text: "Singular y plural: \"vaso\" encuentra \"vasos\", \"flores\" encuentra \"flor\", \"luces\" encuentra \"luz\"" },
      { type: "correccion", text: "Ahora también se puede cambiar el ancho de la columna de la lista de precios" }
    ]
  },
  {
    version: "2.2",
    date: "2026-10-07",
    title: "Cotizaciones: lectura de pliegos de licitación en PDF",
    items: [
      { type: "mejora", text: "Reconoce tablas con columnas R (renglón), Denominación, U.M. (unidad de medida) y Cantidad" },
      { type: "mejora", text: "Junta bien los artículos cuya descripción ocupa varias líneas arriba del número de renglón" },
      { type: "correccion", text: "Ya no agrega como artículos el membrete y el pie de página que se repiten en cada hoja" },
      { type: "correccion", text: "Ya no agrega como artículos los textos y aclaraciones que aparecen después de la tabla" },
      { type: "mejora", text: "La unidad de medida se suma al texto solicitado, salvo cuando dice solo \"U\"" }
    ]
  },
  {
    version: "2.1",
    date: "2026-10-07",
    title: "Cotizaciones: mejor lectura de PDF",
    items: [
      { type: "correccion", text: "Se leen bien los PDF con títulos centrados (por ejemplo órdenes de compra hechas en Google Sheets), que antes decían que no había ninguna lista" },
      { type: "mejora", text: "Los artículos que ocupan varios renglones en el PDF se juntan en uno, con su cantidad" },
      { type: "mejora", text: "Se separa la cantidad cuando el PDF la trae pegada al texto (\"4 Cavitador…\")" },
      { type: "mejora", text: "Se ignora el pie de la orden (total, condiciones de pago, lugar de entrega)" }
    ]
  },
  {
    version: "2.0",
    date: "2026-10-07",
    title: "Cotizaciones: lectura de Excel, Word y PDF",
    items: [
      { type: "nuevo", text: "Subí el archivo del cliente (o arrastralo) y Aruki arma el presupuesto solo: Excel, Word, PDF con texto y archivos de texto" },
      { type: "nuevo", text: "En tablas con títulos (Descripción, Cantidad, Presentación, Marca) toma cada columna por separado" },
      { type: "mejora", text: "Lo leído queda en el cuadro de texto para corregirlo y volver a armar si hace falta" }
    ]
  },
  {
    version: "1.9",
    date: "2026-10-07",
    title: "Cotizaciones: Rehacer y aviso con Deshacer",
    items: [
      { type: "nuevo", text: "Botón Rehacer (y Ctrl+Y) para volver a aplicar lo que deshiciste" },
      { type: "nuevo", text: "Al eliminar un renglón, elegir una opción o guardar una relación aparece un aviso abajo al centro durante 5 segundos, con Deshacer y una x para cerrarlo" },
      { type: "mejora", text: "Agregar artículo, Deshacer y Rehacer ahora están debajo del presupuesto, a la izquierda" }
    ]
  },
  {
    version: "1.8",
    date: "2026-10-07",
    title: "Cotizaciones: mejoras en la tabla del presupuesto",
    items: [
      { type: "correccion", text: "Ahora también se puede buscar el artículo tocando el Nombre (no solo el SKU); al elegirlo se completan SKU, nombre, marca y precio" },
      { type: "nuevo", text: "Botón Deshacer (y Ctrl+Z) para volver atrás si eliminás un renglón, elegís una opción o guardás una relación" },
      { type: "nuevo", text: "Se puede cambiar el ancho de cada columna arrastrando el borde del título; doble clic vuelve al ancho original" },
      { type: "nuevo", text: "Columna Marca en Cotizaciones (y en el Excel), leída de la consulta de stock de YiQi" },
      { type: "mejora", text: "Los renglones con varias opciones quedan encerrados en un recuadro amarillo, y los sin coincidencia en rojo" },
      { type: "mejora", text: "Cuando hay una sola opción posible se marca como Coincide" },
      { type: "mejora", text: "Letra un punto más grande en tablas, listas y resultados en todo Aruki" }
    ]
  },
  {
    version: "1.7",
    date: "2026-10-07",
    title: "Presupuestos: Cotizaciones con texto pegado",
    items: [
      { type: "nuevo", text: "Cotizaciones: pegá la lista que manda el cliente y Aruki arma el presupuesto con los artículos que encuentra" },
      { type: "nuevo", text: "Busca primero en Relaciones y después por parecido, dando más peso a medidas, colores y códigos" },
      { type: "nuevo", text: "Cuando hay dudas muestra varias opciones para el mismo renglón: elegí una con ✓ o borrá las que no sirvan" },
      { type: "nuevo", text: "Tabla editable: cambiar SKU (con buscador), texto adicional y cantidad, agregar y eliminar renglones, arrastrar para ordenar" },
      { type: "nuevo", text: "Elegí la lista de precios; el total se recalcula solo" },
      { type: "nuevo", text: "Botón para guardar un renglón como relación, así la próxima vez lo encuentra solo" },
      { type: "nuevo", text: "Exportar el presupuesto a Excel" },
      { type: "mejora", text: "El presupuesto en curso queda guardado en este navegador aunque cierres la página" }
    ]
  },
  {
    version: "1.6",
    date: "2026-10-07",
    title: "Presupuestos: módulo Relaciones",
    items: [
      { type: "nuevo", text: "Nuevo grupo Presupuestos en el menú, con los submódulos Cotizaciones (en construcción) y Relaciones" },
      { type: "nuevo", text: "Relaciones: indicá que cuando un cliente escribe algo, el artículo es uno o varios SKU, buscándolos por SKU o nombre" },
      { type: "nuevo", text: "Las relaciones se guardan en Cloudflare y se ven igual desde cualquier computadora" },
      { type: "nuevo", text: "Botones para descargar un respaldo de las relaciones e importarlo" },
      { type: "mejora", text: "El acceso se bloquea 15 minutos después de 5 contraseñas incorrectas" }
    ]
  },
  {
    version: "1.5",
    date: "2026-10-07",
    title: "Reorganización interna",
    items: [
      { type: "mejora", text: "Aruki se divide en varios archivos (estilos y un archivo por módulo) para que los próximos cambios sean más rápidos y seguros" },
      { type: "mejora", text: "El código del conector de Cloudflare queda guardado en el repositorio como respaldo" }
    ]
  },
  {
    version: "1.4",
    date: "2026-10-06",
    title: "Carga completa y búsqueda en todos los resultados",
    items: [
      { type: "mejora", text: "Control Facturas y Artículos cargan automáticamente todas las páginas de YiQi, sin necesidad de apretar Actualizar" },
      { type: "mejora", text: "La búsqueda y los filtros ahora recorren todos los registros cargados, no solo los de una página" },
      { type: "nuevo", text: "Barra de progreso de carga y botón Detener; se puede buscar mientras sigue cargando" },
      { type: "mejora", text: "La búsqueda ignora mayúsculas y tildes, y acepta varias palabras (por ejemplo: forceps adultos)" },
      { type: "mejora", text: "Los totales de Control Facturas se calculan sobre todas las facturas que coinciden con la búsqueda" },
      { type: "mejora", text: "Actualizar vuelve a cargar todo desde YiQi; la paginación inferior ahora es solo para navegar en pantalla" }
    ]
  },
  {
    version: "1.3",
    date: "2026-10-06",
    title: "Nuevo módulo Artículos (Consulta de Stock)",
    items: [
      { type: "nuevo", text: "Módulo Artículos en el menú lateral, con la misma tabla de la smartie 2377 de YiQi (Stock > Consulta de Stock)" },
      { type: "nuevo", text: "Las columnas se arman solas según lo que devuelve YiQi, en el mismo orden que la smartie" },
      { type: "nuevo", text: "Buscador por SKU o nombre, paginación y botón Actualizar (consulta manual, igual que Facturas)" },
      { type: "mejora", text: "El menú lateral ahora permite cambiar entre módulos" }
    ]
  },
  {
    version: "1.2",
    date: "2026-08-03",
    title: "Vista ampliada, consulta manual, nueva paginación y acceso seguro",
    items: [
      { type: "mejora", text: "El módulo de facturas amplía su ancho máximo un 50% y reorganiza la tabla para aprovechar el espacio disponible" },
      { type: "mejora", text: "Aruki ya no consulta facturas automáticamente al iniciar sesión; la carga se realiza únicamente al presionar Actualizar" },
      { type: "mejora", text: "La paginación utiliza cinco botones numéricos y accesos directos a la primera y última página" },
      { type: "correccion", text: "El usuario y la contraseña de acceso fueron eliminados del HTML y pasan a validarse de forma privada en Cloudflare" }
    ]
  },
  {
    version: "1.1",
    date: "2026-08-03",
    title: "Nueva identidad Aruki y conexión real con YiQi",
    items: [
      { type: "nuevo", text: "Conexión en vivo con la smartie de facturas de YiQi mediante el Worker de Cloudflare" },
      { type: "nuevo", text: "Paginación, actualización manual y estados de carga, conexión y error" },
      { type: "mejora", text: "La aplicación, el título y el nombre del archivo pasan a llamarse Aruki" },
      { type: "mejora", text: "El logo SVG de Aruki se utiliza en el acceso, la barra superior y el favicon" },
      { type: "mejora", text: "Tabla adaptada a las columnas reales devueltas por YiQi" }
    ]
  },
  {
    version: "1.0",
    date: "2026-08-01",
    title: "Primera versión de Aruki",
    items: [
      { type: "nuevo", text: "Pantalla de acceso con usuario y contraseña" },
      { type: "nuevo", text: "Menú lateral desplegable, con posibilidad de contraerlo" },
      { type: "nuevo", text: "Selector de tema Oscuro / Sistema / Claro" },
      { type: "nuevo", text: "Módulo Control Facturas con datos de ejemplo (KPIs, búsqueda y filtros)" },
      { type: "nuevo", text: "Historial de novedades" }
    ]
  }
];

