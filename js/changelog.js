/* ============================================================
   CONFIG: VERSIÓN Y CHANGELOG
   -----------------------------------------------------------
   Se actualiza en cada cambio pedido: subir LATEST_VERSION y
   agregar un bloque nuevo AL PRINCIPIO del array.
   ============================================================ */
const LATEST_VERSION = "9.0";
const CHANGELOG = [
  {
    version: "9.0",
    date: "2026-11-27",
    title: "Cobranzas: textos en un solo renglón",
    items: [
      { type: "mejora", text: "En Cuentas corrientes y Facturas de venta, al achicar una columna el texto ya no baja a otro renglón: queda en una sola línea y se corta con «…». Pasando el mouse por encima se ve completo." }
    ]
  },
  {
    version: "8.9",
    date: "2026-11-27",
    title: "Cobranzas primero",
    items: [
      { type: "mejora", text: "Cobranzas pasa a ser el primer grupo del menú lateral y Aruki abre directo en Cuentas corrientes." }
    ]
  },
  {
    version: "8.8",
    date: "2026-11-27",
    title: "Detalle de factura y nuevos filtros en Facturas de venta",
    items: [
      { type: "nuevo", text: "Tocando una factura (en Facturas de venta o en Cuentas corrientes) se ven sus artículos: SKU, concepto, cantidad, número de serie y subtotal, con el total y un botón para abrirla en YiQi. Necesita el conector actualizado." },
      { type: "mejora", text: "Facturas de venta: todos los filtros en una fila, el buscador a la izquierda; vendedor, origen, tipo de factura y punto de venta se pueden elegir de a varios." },
      { type: "nuevo", text: "Facturas de venta: un solo calendario para elegir desde y hasta (con la X para borrar), en lugar de los dos cuadros de fecha y los botones de período." },
      { type: "mejora", text: "Facturas de venta: el cliente va primero y en negrita, la factura al lado con su ícono de YiQi, y una columna nueva «Antigüedad» con los días desde la emisión." },
      { type: "mejora", text: "Las listas desplegables con casillas tienen el mismo ancho que su botón. El logo de Aruki es azul, como el ícono de la pestaña." }
    ]
  },
  {
    version: "8.7",
    date: "2026-11-25",
    title: "Borrar la búsqueda con la «x»",
    items: [
      { type: "mejora", text: "Los buscadores de Cuentas corrientes y Facturas de venta tienen la «x» para borrar la búsqueda, como en Artículos." }
    ]
  },
  {
    version: "8.6",
    date: "2026-11-24",
    title: "Cuentas corrientes: letra un poco más grande",
    items: [
      { type: "mejora", text: "Los títulos de los cuadros (Total a cobrar, Más de 30 días…) y la cantidad de días de la columna «Más antigua» van un punto más grandes." }
    ]
  },
  {
    version: "8.5",
    date: "2026-11-24",
    title: "Cuadros con los colores de cada tramo",
    items: [
      { type: "mejora", text: "En Cuentas corrientes, los importes de los cuadros «Más de 30/60/90/180 días» tienen el mismo color que su tramo en la barra de antigüedad. «Total a cobrar» sigue en negro." }
    ]
  },
  {
    version: "8.4",
    date: "2026-11-24",
    title: "Cuentas corrientes: tramos como antes",
    items: [
      { type: "mejora", text: "Los tramos de antigüedad vuelven a ser 0–30, 31–60, 61–90, 91–180, 181–365 y más de 365 días (cuadros, barra y filtros)." },
      { type: "correccion", text: "El nombre del cliente queda centrado con el ícono y con el resto de la fila; si es muy largo termina en «…»." },
      { type: "mejora", text: "Con el menú lateral contraído también se ven las líneas que separan los grupos." }
    ]
  },
  {
    version: "8.3",
    date: "2026-11-24",
    title: "Cuentas corrientes: tramos de antigüedad y varios vendedores",
    items: [
      { type: "mejora", text: "Cinco cuadros arriba: Total a cobrar, Más de 30 días (30 a 59), Más de 60 (60 a 89), Más de 90 (90 a 179) y Más de 180 días. Se sacó «Saldo a favor para aplicar» (el filtro «Con saldo a favor» sigue)." },
      { type: "mejora", text: "La barra de antigüedad suma el tramo «365 días o más», con colores de verde a bordó, y muestra el importe adentro de cada color." },
      { type: "nuevo", text: "Se pueden elegir varios vendedores a la vez." },
      { type: "mejora", text: "Se sacó la lista de condición de venta. Filtro «+365» junto a +30, +60, +90 y +180." },
      { type: "mejora", text: "Menú lateral: todo alineado a la izquierda y cada grupo separado con una línea." }
    ]
  },
  {
    version: "8.2",
    date: "2026-11-24",
    title: "Cobranzas: anchos de columna y detalles de diseño",
    items: [
      { type: "correccion", text: "En Cobranzas, al cambiar el ancho de una columna ya no se mueven las demás (funciona como en Artículos). Doble clic en el borde de una columna vuelve a los anchos originales." },
      { type: "correccion", text: "Ya no aparece la barra para moverse hacia los costados debajo de las tablas cuando todas las columnas entran." },
      { type: "mejora", text: "En el estado de cuenta los botones quedan siempre a la derecha, aunque el nombre del cliente sea largo." },
      { type: "mejora", text: "En la lista de Cuentas corrientes ya no se muestra el CUIT debajo del nombre (sigue en el estado de cuenta y en la búsqueda)." }
    ]
  },
  {
    version: "8.1",
    date: "2026-11-24",
    title: "Ícono de cuenta corriente adelante",
    items: [
      { type: "mejora", text: "En Cuentas corrientes, el ícono para abrir la cuenta corriente en YiQi va antes del nombre del cliente." }
    ]
  },
  {
    version: "8.0",
    date: "2026-11-24",
    title: "Cuentas corrientes: link a YiQi y volver al mismo lugar",
    items: [
      { type: "nuevo", text: "Ícono al lado del nombre de cada cliente y botón «Cuenta corriente en YiQi» en el estado de cuenta, que abren el reporte de cuenta corriente del cliente en YiQi." },
      { type: "mejora", text: "Al volver del estado de cuenta, la lista queda en el mismo lugar donde estabas." },
      { type: "mejora", text: "«Último pago» dice hace cuántos días fue (hoy, hace 1 día, hace 12 días) en vez de horas." }
    ]
  },
  {
    version: "7.9",
    date: "2026-11-24",
    title: "Tarea automática sin cuelgues",
    items: [
      { type: "correccion", text: "La tarea automática se quedaba esperando a YiQi al bajar Facturas hasta que GitHub la cortaba a los 30 minutos, así que Facturas no se guardaba. Ahora cada pedido tiene un tiempo máximo y, si YiQi no contesta, reintenta y termina en pocos minutos." },
      { type: "correccion", text: "La lista de Facturas de YiQi ahora trae todas las fechas (unas 66.000 facturas): el conector la lee de a 1000 en vez de a 50 (hay que actualizar el conector en Cloudflare)." },
      { type: "nuevo", text: "El conector de Cloudflare puede despertar la tarea cada 3 horas (GitHub sola corre muy pocas veces)." },
      { type: "mejora", text: "El aviso de datos atrasados dice cuál dato está atrasado (Clientes, Artículos, Facturas o Cuentas corrientes) y tiene en cuenta las actualizaciones hechas a mano." }
    ]
  },
  {
    version: "7.8",
    date: "2026-11-21",
    title: "Actualización automática más confiable",
    items: [
      { type: "correccion", text: "GitHub a veces se saltea las corridas programadas y los datos quedaban sin actualizar más de 6 horas. Ahora la tarea se intenta cada hora y solo trabaja si pasaron casi 3 horas desde la última, así siempre queda alguna que corre." },
      { type: "mejora", text: "El aviso de datos atrasados explica cómo forzar la actualización desde GitHub (Run workflow)." }
    ]
  },
  {
    version: "7.7",
    date: "2026-11-21",
    title: "Cobranzas con 2 decimales",
    items: [
      { type: "mejora", text: "En Cobranzas (Cuentas corrientes y Facturas de venta) todos los importes se muestran con 2 decimales: punto para los miles y coma para los decimales ($ 1.234,50), también en el PDF, el Excel y el texto para WhatsApp." }
    ]
  },
  {
    version: "7.6",
    date: "2026-11-21",
    title: "Facturas de venta renovado y link a YiQi",
    items: [
      { type: "nuevo", text: "Cada factura tiene un botoncito ↗ que la abre directamente en YiQi (en Facturas de venta y en Cuentas corrientes)." },
      { type: "nuevo", text: "Facturas de venta: filtros por período (este mes, mes anterior, últimos 30 días o fechas a elección), vendedor y origen, además de estado y búsqueda; totales de lo filtrado y exportar a Excel o PDF." },
      { type: "mejora", text: "Facturas de venta: las columnas se ordenan tocando el título y se ensanchan arrastrando el borde, como en Cuentas corrientes." }
    ]
  },
  {
    version: "7.5",
    date: "2026-11-21",
    title: "Cobranzas: cuentas corrientes",
    items: [
      { type: "nuevo", text: "Nueva sección Cobranzas en el menú. «Cuentas corrientes» muestra cuánto debe cada cliente (todas las facturas con saldo, de cualquier fecha), la antigüedad desde la emisión, el saldo a favor sin imputar, el saldo neto y el último pago." },
      { type: "nuevo", text: "Se puede ver por cliente, por factura o por vendedor, filtrar (búsqueda, vendedor, condición de venta, antigüedad, con saldo a favor) y exportar lo que se ve a Excel o PDF. Las columnas se ordenan tocando el título y se ensanchan arrastrando el borde." },
      { type: "nuevo", text: "Estado de cuenta de cada cliente: sus facturas con saldo, PDF con el logo para mandarle (con un texto al pie elegido de las Etiquetas), Excel, texto para WhatsApp y notas de seguimiento con recordatorio." },
      { type: "mejora", text: "Quedan afuera Mercado Libre, las facturas de $1, Consumidor Final y las pruebas. «Control Facturas» pasa a llamarse «Facturas de venta» dentro de Cobranzas." }
    ]
  },
  {
    version: "7.4",
    date: "2026-11-20",
    title: "Modo oscuro gris neutro",
    items: [
      { type: "mejora", text: "El modo oscuro pasa a un gris neutro (sin el tinte anaranjado) y un poco más claro." }
    ]
  },
  {
    version: "7.3",
    date: "2026-11-20",
    title: "Datos guardados en el servidor",
    items: [
      { type: "nuevo", text: "Clientes, Artículos y Facturas quedan guardados en el servidor y una tarea automática los actualiza desde YiQi cada 3 horas. Al entrar a Aruki ya están listos, en cualquier computadora." },
      { type: "nuevo", text: "Cuando actualizás con los botones de arriba, lo que se baja de YiQi también queda guardado para todos." },
      { type: "mejora", text: "Facturas se guarda en la computadora como Artículos y Clientes: ya no se vuelve a bajar cada vez que entrás." },
      { type: "nuevo", text: "Si la tarea automática deja de actualizar por más de 6 horas, aparece un aviso arriba con los pasos para reactivarla." }
    ]
  },
  {
    version: "7.2",
    date: "2026-11-20",
    title: "Nuevo modo oscuro gris cálido",
    items: [
      { type: "mejora", text: "El modo oscuro pasa de negro a grises cálidos (como el de Claude): se distinguen mejor el fondo, los recuadros, los cuadros de texto y los bordes. El azul es más claro para leerse bien." },
      { type: "mejora", text: "El fondo de la página es de un solo tono, sin el degradé que tenía en una esquina (en los dos temas)." }
    ]
  },
  {
    version: "7.1",
    date: "2026-11-20",
    title: "Cuadros de Nueva relación alineados",
    items: [
      { type: "mejora", text: "En Nueva relación, los cuadros de abajo (\"…el artículo es\" y \"Es lo mismo que…\") tienen el mismo ancho que el cuadro de arriba, en todos los tipos." }
    ]
  },
  {
    version: "7.0",
    date: "2026-11-20",
    title: "Botones de agregar sin contorno",
    items: [
      { type: "mejora", text: "\"+ Agregar condición\" y \"+ Nuevo equivalente\" quedan solo con el fondo celeste clarito, sin contorno azul." }
    ]
  },
  {
    version: "6.9",
    date: "2026-11-20",
    title: "Formulario de relaciones más claro",
    items: [
      { type: "mejora", text: "Los botones \"+ Agregar condición\" y \"+ Nuevo equivalente\" tienen color propio y se distinguen del recuadro." },
      { type: "mejora", text: "En Palabras equivalentes la Nota va a la derecha, como en los otros tipos, y \"Es lo mismo que…\" queda abajo." }
    ]
  },
  {
    version: "6.8",
    date: "2026-11-20",
    title: "Barra de arriba más simple",
    items: [
      { type: "mejora", text: "Los botones para traer datos de YiQi dicen solo Clientes, Artículos y Facturas, con el ícono de actualizar." },
      { type: "mejora", text: "El tema ahora es un solo botón redondo con el ícono del tema actual: al tocarlo se abre y elegís luna (oscuro) o sol (claro)." }
    ]
  },
  {
    version: "6.7",
    date: "2026-10-23",
    title: "Más resultados en los buscadores",
    items: [
      { type: "mejora", text: "Los buscadores de artículos (Cotizaciones, Relaciones y Armar presupuesto) muestran hasta 30 resultados en vez de 12. Si hay más, al final avisa cuántos son en total para que escribas algo más preciso." }
    ]
  },
  {
    version: "6.6",
    date: "2026-10-23",
    title: "Más lugar para el nombre en los buscadores",
    items: [
      { type: "mejora", text: "En los buscadores de artículos la columna del SKU mide lo justo para el SKU más largo de la lista, y el nombre aprovecha el resto del ancho." }
    ]
  },
  {
    version: "6.5",
    date: "2026-10-23",
    title: "Buscadores de artículos más prolijos",
    items: [
      { type: "mejora", text: "La marca usa los renglones que ya ocupa el nombre del artículo (sin agregar renglones de más); solo se corta con \"…\" si aun así no entra." },
      { type: "mejora", text: "La lista de resultados al cambiar un artículo en la tabla es tan ancha como el cuadro donde buscás, si ese cuadro es más ancho que la lista." }
    ]
  },
  {
    version: "6.4",
    date: "2026-10-23",
    title: "Marca más chica en los buscadores",
    items: [
      { type: "mejora", text: "En los buscadores de artículos la marca ocupa poco lugar y va con letra más chica, así el SKU y el nombre se leen en un renglón. Si la marca es larga se corta con \"…\"; dejando el mouse encima se ve completa." }
    ]
  },
  {
    version: "6.3",
    date: "2026-10-23",
    title: "Artículos ordenados por SKU",
    items: [
      { type: "mejora", text: "Los buscadores de artículos (Cotizaciones, Relaciones y Armar presupuesto) y la lista de Artículos ordenan por SKU: primero lo que está antes del guion y después lo que sigue, con los números de menor a mayor y antes que las letras (50-30, 50-946, 50-a1, 55-n3, 60-99, 60-b8)." }
    ]
  },
  {
    version: "6.2",
    date: "2026-10-20",
    title: "Varios archivos a la vez y mails en HTML",
    items: [
      { type: "nuevo", text: "Cotizaciones: se pueden subir o arrastrar varios archivos juntos (PDF, fotos, Excel, Word, HTML o texto). Aruki los lee de a uno y junta todos los renglones en un solo presupuesto." },
      { type: "nuevo", text: "Cotizaciones: lee archivos .html, como un mail de Gmail guardado como página. Toma la tabla de artículos (Descripción, Cantidad…) y, si no hay tabla, el texto renglón por renglón." },
      { type: "mejora", text: "Una columna llamada \"Unidades\" se toma como cantidad, y los textos de varios renglones dentro de una celda (Word y HTML) ya no quedan pegados." }
    ]
  },
  {
    version: "6.1",
    date: "2026-10-19",
    title: "Más candidatos para la IA",
    items: [
      { type: "mejora", text: "Revisar con IA: Gemini recibe hasta 20 artículos por renglón para elegir (antes 15). Requiere actualizar el conector" },
      { type: "mejora", text: "Si Gemini escribe el SKU con otras mayúsculas o con espacios, igual se acepta la elección" }
    ]
  },
  {
    version: "6.0",
    date: "2026-10-15",
    title: "Clientes ocultos",
    items: [
      { type: "mejora", text: "La lista de clientes ya no muestra los que dicen \"discontinuado\" (o \"descontinuado\") ni los que tienen 3 o más asteriscos" }
    ]
  },
  {
    version: "5.9",
    date: "2026-10-15",
    title: "Recuadros de opciones, listas y casillas",
    items: [
      { type: "correccion", text: "Cotizaciones: el recuadro de las opciones ahora se ve completo (también arriba), es más grueso y las filas alternan entre dos amarillos" },
      { type: "correccion", text: "La lista de clientes ya no muestra barra para moverse a los costados: los nombres largos pasan al renglón de abajo" },
      { type: "mejora", text: "Las listas desplegables (Lista de precios, Cantidad, Observaciones…) se ven con el mismo diseño que la de clientes" },
      { type: "mejora", text: "Artículos: casillas con el estilo de Aruki" },
      { type: "mejora", text: "El ícono de la pestaña pasa al azul de Dentalab y el botón de Relaciones dice solo \"Por condiciones\"" }
    ]
  },
  {
    version: "5.8",
    date: "2026-10-15",
    title: "Logo de Dentalab y azul de la marca",
    items: [
      { type: "mejora", text: "PDF: el logo de Dentalab reemplaza al texto \"Dentalab\"; se sacan \"Insumos odontológicos\", la lista de precios y la condición de IVA" },
      { type: "mejora", text: "Excel: se sacan la lista de precios y la condición de IVA" },
      { type: "mejora", text: "El celeste oscuro de Aruki (tema claro) y del PDF pasa a ser el azul del logo" },
      { type: "correccion", text: "Artículos vuelve a usar casillas comunes en lugar de interruptores" }
    ]
  },
  {
    version: "5.7",
    date: "2026-10-15",
    title: "Observaciones con etiquetas e interruptores",
    items: [
      { type: "nuevo", text: "Cotizaciones y Armar presupuesto: caja \"Observaciones\" para elegir una etiqueta (empieza vacía con …) y botón \"Etiquetas\" para crearlas y modificarlas. Las etiquetas son las mismas en los dos módulos" },
      { type: "nuevo", text: "Abajo de la lista de artículos, caja editable con las observaciones del pedido: se puede cambiar de etiqueta, escribir a mano, guardar los cambios en la etiqueta o guardarlo como etiqueta nueva" },
      { type: "nuevo", text: "Las observaciones van abajo de todo en el Excel y el PDF, y en las observaciones del pedido de YiQi (reemplazan \"Creado desde Aruki\"). Requiere actualizar el conector" },
      { type: "mejora", text: "Cotizaciones: Agregar artículo, Deshacer, Rehacer, Guardar relaciones y Revisar dudosos pasan arriba de la lista; se saca la aclaración larga; \"Revisar con IA (Gemini)\" queda junto al archivo" },
      { type: "mejora", text: "Todas las casillas de Aruki ahora son interruptores (se tocan o se arrastran)" }
    ]
  },
  {
    version: "5.6",
    date: "2026-10-15",
    title: "Precios sin decimales de más y opciones editadas a mano",
    items: [
      { type: "mejora", text: "Los precios enteros se muestran sin decimales ($ 34.700) en Cotizaciones, Armar presupuesto, Artículos, PDF y Excel. Si tienen centavos, se siguen viendo ($ 34.700,50)" },
      { type: "mejora", text: "Artículos: los precios se copian con el \"$\"" },
      { type: "mejora", text: "Cotizaciones: si cambiás a mano una de las opciones, sigue dentro del recuadro de opciones y con el ✓ \"Quedarme con esta opción y borrar las otras\"" }
    ]
  },
  {
    version: "5.5",
    date: "2026-10-15",
    title: "Editar artículos en Armar presupuesto y mejoras en Artículos",
    items: [
      { type: "nuevo", text: "Armar presupuesto: se puede cambiar el artículo de cada renglón escribiendo otro SKU o buscando por nombre, igual que en Cotizaciones (con Deshacer)" },
      { type: "nuevo", text: "Artículos: los precios también tienen el botón para copiar" },
      { type: "nuevo", text: "Artículos: X en el buscador para borrar la búsqueda" },
      { type: "mejora", text: "Artículos: los datos de cada fila quedan centrados en vertical cuando el nombre ocupa dos renglones" }
    ]
  },
  {
    version: "5.4",
    date: "2026-10-15",
    title: "Copiar el nombre de un artículo",
    items: [
      { type: "nuevo", text: "Artículos: al pasar el mouse por una fila aparece un botón al final del nombre para copiarlo (sin cambiar el alto de la fila)" },
      { type: "correccion", text: "Artículos: el buscador es más ancho y su texto se ve completo" }
    ]
  },
  {
    version: "5.3",
    date: "2026-10-15",
    title: "Pequeños ajustes de textos",
    items: [
      { type: "mejora", text: "Relaciones: el tipo \"Palabra equivalente\" ahora se llama \"Palabras equivalentes\"" },
      { type: "correccion", text: "Artículos: el texto gris del buscador (\"Buscar en todos los artículos\") ahora se ve completo" }
    ]
  },
  {
    version: "5.2",
    date: "2026-10-15",
    title: "Palabra equivalente: palabras a la izquierda, equivalente a la derecha",
    items: [
      { type: "mejora", text: "En el formulario, \"La palabra o palabras…\" va a la izquierda con \"+ Nuevo equivalente\" abajo, y \"Es lo mismo que…\" es un solo casillero a la derecha" },
      { type: "mejora", text: "En la lista, las palabras se ven en la columna \"Cuando el cliente escribe\" y el equivalente en \"Artículo(s)\". Todas siguen siendo equivalentes entre sí" }
    ]
  },
  {
    version: "5.1",
    date: "2026-10-15",
    title: "Palabras equivalentes de a una por renglón",
    items: [
      { type: "mejora", text: "Palabra equivalente: cada equivalente va en su propio renglón con el botón \"+ Nuevo equivalente\" (como en Condiciones), en vez de separarlas con comas. Todas las palabras de la relación siguen siendo equivalentes entre sí" },
      { type: "mejora", text: "Se sacan de la programación las equivalencias autocurable = auto y termocurable = termo (se cargan como Relaciones)" }
    ]
  },
  {
    version: "5.0",
    date: "2026-10-15",
    title: "Equivalencias de varias palabras, combos y masculino/femenino",
    items: [
      { type: "nuevo", text: "Relaciones: botón \"Reglas de Aruki\" que muestra, solo para leer, todas las reglas que ya vienen programadas" },
      { type: "mejora", text: "Palabra equivalente: ahora se pueden poner varias palabras separadas por coma (ej.: mix = surtido, kit, combo). Todas se toman como lo mismo en la búsqueda y para la IA" },
      { type: "mejora", text: "Cotizaciones: los artículos que empiezan con \"COMBO -\" ya no se eligen solos; se pueden buscar y elegir a mano" },
      { type: "mejora", text: "Cotizaciones: masculino y femenino se toman igual (anodizada = anodizado, importada = importado)" }
    ]
  },
  {
    version: "4.9",
    date: "2026-10-15",
    title: "Mejor búsqueda con descripciones de licitación",
    items: [
      { type: "mejora", text: "Los rótulos de licitación (\"PRESENTACION:\", \"DROGA GENERICA:\", \"FORMA FARMACEUTICA:\", \"USO:\", \"t/… o SIMILAR\", \"p/…\") ya no cuentan en la búsqueda: el artículo correcto sale con más puntaje y quedan menos renglones dudosos" },
      { type: "mejora", text: "Se saca el punto suelto del final de cada renglón (\"CEMENTO IRM .\")" }
    ]
  },
  {
    version: "4.8",
    date: "2026-10-15",
    title: "Cotizaciones entiende mejor \"Uns\", \"Und\" y \"Uni\"",
    items: [
      { type: "mejora", text: "Cuando la cantidad va después de la abreviatura (\"Guantes Uns 10\", \"Guantes - Und: 10\") ahora se toma bien la cantidad, y la abreviatura no ensucia la búsqueda" },
      { type: "mejora", text: "Presentación + cantidad: en \"Eyectores x100 und. 5\" o \"Gasas x 100 und 2\", \"x100 und\" se toma como presentación y el último número como cantidad (antes quedaba cantidad 1)" },
      { type: "mejora", text: "Se suma \"Uni\" como abreviatura de unidad, y la IA recibe siempre la aclaración de que Uns/Und/Unid/U. significan unidades" }
    ]
  },
  {
    version: "4.7",
    date: "2026-10-14",
    title: "Correcciones en Artículos y Relaciones",
    items: [
      { type: "correccion", text: "Artículos: la casilla de arriba ahora selecciona o deselecciona todos los artículos de la página (antes dejaba marcado el primero)" },
      { type: "correccion", text: "Artículos: el botón \"Quitar selección\" vuelve a funcionar" },
      { type: "mejora", text: "Artículos: \"Agregar a Armar presupuesto\" ya no te cambia de módulo; aparece un aviso flotante con Deshacer y Ver presupuesto" },
      { type: "correccion", text: "Relaciones: al guardar o cancelar una relación, el cuadro de relaciones guardadas vuelve a su tamaño" },
      { type: "mejora", text: "Relaciones: el botón \"Nueva relación\" se destaca igual que \"Nueva cotización\" y \"Nuevo presupuesto\"" },
      { type: "mejora", text: "IA: las Reglas para la IA y las palabras equivalentes van en las instrucciones principales de Gemini, que las lee antes que todo. Requiere actualizar el conector" }
    ]
  },
  {
    version: "4.6",
    date: "2026-10-13",
    title: "La IA aprende de tus Relaciones",
    items: [
      { type: "nuevo", text: "Relaciones: nuevo tipo \"Regla para la IA\" para escribirle instrucciones a Gemini (por ejemplo, qué marca preferir o cómo interpretar un pedido). Tiene su propio filtro \"Reglas IA\"" },
      { type: "mejora", text: "Revisar con IA: además de las reglas, Gemini recibe como ejemplo las relaciones más parecidas a cada renglón y las palabras equivalentes, así elige como ya lo corregiste antes" },
      { type: "mejora", text: "El aviso final dice cuántas reglas y ejemplos usó. Requiere actualizar el conector" }
    ]
  },
  {
    version: "4.5",
    date: "2026-10-13",
    title: "IA más rápida en Cotizaciones",
    items: [
      { type: "mejora", text: "Revisar con IA: Gemini elige los artículos sin el \"pensamiento\" previo (no hace falta para elegir entre candidatos), lo que la hace bastante más rápida. Requiere actualizar el conector" },
      { type: "mejora", text: "Los renglones dudosos se mandan en tandas de 20, hasta 3 a la vez (antes de a una)" },
      { type: "nuevo", text: "Al terminar, el aviso muestra qué modelo de IA se usó y cuántos segundos tardó" }
    ]
  },
  {
    version: "4.4",
    date: "2026-10-13",
    title: "Artículos vuelve a leerse por smartie",
    items: [
      { type: "mejora", text: "Artículos se lee siempre por smartie: la consulta rápida de YiQi trae registros de más para esa smartie. Se siguen guardando en la computadora y actualizando solos cada 4 horas. Clientes y Facturas siguen con lectura rápida" }
    ]
  },
  {
    version: "4.3",
    date: "2026-10-13",
    title: "Lectura rápida de Artículos: detecta los artículos dados de baja",
    items: [
      { type: "mejora", text: "Si la consulta rápida trae más registros que la smartie, Aruki cuenta los registros por estado (activo, baja, etc.) y excluye solo los estados que la smartie no muestra. Requiere actualizar el conector" }
    ]
  },
  {
    version: "4.2",
    date: "2026-10-13",
    title: "Diagnóstico de la lectura rápida",
    items: [
      { type: "mejora", text: "Si YiQi da error en la lectura rápida, se prueba también sin pedir el número de fila y, si sigue fallando, el motivo indica qué columna de la smartie no acepta YiQi. Requiere actualizar el conector" }
    ]
  },
  {
    version: "4.1",
    date: "2026-10-13",
    title: "Lectura rápida con los filtros de las smarties",
    items: [
      { type: "mejora", text: "Clientes: la lectura rápida aplica el mismo filtro que la smartie (solo clientes activos)" },
      { type: "mejora", text: "Facturas: la lectura rápida aplica los mismos filtros que la smartie (desde 01/07/2026, sin origen Mercado Libre y sin Consumidor Final)" },
      { type: "mejora", text: "Si alguna lectura sigue yendo por smartie, al pasar el mouse por el botón Actualizar se ve el motivo. Requiere actualizar el conector de Cloudflare" }
    ]
  },
  {
    version: "4.0",
    date: "2026-10-13",
    title: "Clientes, cantidades desde Artículos y opciones en Cotizaciones",
    items: [
      { type: "correccion", text: "Cliente: al tocar el campo se despliega la lista de todos los clientes (Consumidor Final primero) y se puede elegir cualquiera. Si queda vacío se elige solo \"Consumidor Final\" (id 8192)" },
      { type: "correccion", text: "Lectura rápida: ahora se pide también el número de cada cliente/factura para que se puedan elegir (requiere actualizar el conector)" },
      { type: "nuevo", text: "Artículos: al lado de la casilla se elige la cantidad que se manda a Armar presupuesto" },
      { type: "mejora", text: "Cotizaciones: hasta 10 opciones cuando hay dudas (antes 4)" },
      { type: "mejora", text: "Cotizaciones: se puede enviar el pedido a YiQi con opciones sin elegir (se mandan todas). Los renglones en rojo, sin artículo, siguen frenando el envío" }
    ]
  },
  {
    version: "3.9",
    date: "2026-10-13",
    title: "Pedidos a YiQi: precio final y Consumidor Final",
    items: [
      { type: "correccion", text: "Enviar pedido a YiQi: el precio cambiado a mano se manda como precio FINAL (con impuestos), no como neto" },
      { type: "correccion", text: "Sin cliente elegido se usa siempre el cliente Consumidor Final de YiQi (id 8192)" }
    ]
  },
  {
    version: "3.8",
    date: "2026-10-13",
    title: "Stock real después de Cantidad, aviso de stock insuficiente y páginas sin scroll de más",
    items: [
      { type: "mejora", text: "Cotizaciones y Armar presupuesto: la columna Stock real va después de Cantidad" },
      { type: "mejora", text: "El Stock real se marca en rojo y remarcado solo cuando no alcanza para la cantidad pedida" },
      { type: "correccion", text: "Artículos y Relaciones: la página entra en la pantalla; solo se scrollea dentro del cuadro" },
      { type: "correccion", text: "Enviar pedido a YiQi: Origen de pedido \"Local\" (id 3). Requiere actualizar el conector de Cloudflare" }
    ]
  },
  {
    version: "3.7",
    date: "2026-10-13",
    title: "Lectura rápida también para Artículos y Facturas",
    items: [
      { type: "mejora", text: "Clientes, Artículos y Facturas se descargan de a 1000 por consulta (antes 50), usando las mismas columnas de cada smartie. Requiere actualizar el conector de Cloudflare" },
      { type: "mejora", text: "Si la smartie tiene filtros que la lectura rápida no conoce (el total no coincide), Aruki sigue leyendo la smartie como antes" },
      { type: "mejora", text: "Al pasar el mouse por Actualizar Clientes / Artículos se ve cuántos registros se trajeron y si fue por lectura rápida o por smartie" }
    ]
  },
  {
    version: "3.6",
    date: "2026-10-13",
    title: "Detener la actualización desde el mismo botón y clientes más rápidos",
    items: [
      { type: "nuevo", text: "Los botones Actualizar de la barra superior muestran el % de avance y, si los tocás mientras actualizan, se detienen (al pasar el mouse dicen \"Detener\")" },
      { type: "mejora", text: "Clientes: se descargan de a 1000 por consulta en vez de 50 (requiere actualizar el conector de Cloudflare)" }
    ]
  },
  {
    version: "3.5",
    date: "2026-10-13",
    title: "Botones de actualizar arriba, selección en Artículos y Stock real",
    items: [
      { type: "nuevo", text: "Barra superior: botones Actualizar Clientes, Actualizar Artículos y Actualizar Facturas, que se van rellenando a medida que avanza la descarga desde YiQi" },
      { type: "mejora", text: "Se sacaron los recuadros de estado (\"Conectado a YiQi\", \"Listo para cotizar\", etc.). Solo aparecen si hay un error" },
      { type: "nuevo", text: "Artículos: se pueden seleccionar artículos (tocando la fila o la casilla) y agregarlos todos juntos a Armar presupuesto" },
      { type: "nuevo", text: "Armar presupuesto y Cotizaciones: columna optativa Stock real (Depósito 1 - Local + Depósito Central), solo con \"Respetar cantidad solicitada\"" },
      { type: "nuevo", text: "Armar presupuesto: botón Vaciar presupuesto (se puede deshacer)" },
      { type: "mejora", text: "Botones Nueva cotización y Nuevo presupuesto más visibles" },
      { type: "correccion", text: "Armar presupuesto: separación entre el recuadro de datos y el de artículos" },
      { type: "correccion", text: "Barra lateral retraída más angosta y con los íconos centrados" }
    ]
  },
  {
    version: "3.4",
    date: "2026-10-13",
    title: "Presupuesto manual, PDF, clientes de YiQi y envío de pedidos a YiQi",
    items: [
      { type: "nuevo", text: "Menú dividido en Presupuesto automático (Cotizaciones y Relaciones) y Presupuesto manual" },
      { type: "nuevo", text: "Presupuesto manual: cliente, lista de precios y modo de cantidad; agregar artículos por SKU o nombre, cambiar cantidad, precio y texto adicional, Deshacer/Rehacer y aviso flotante de cada acción" },
      { type: "nuevo", text: "Generar PDF del presupuesto (Manual y Cotizaciones)" },
      { type: "mejora", text: "Exportar a Excel ahora está abajo de todo, junto a Generar PDF y Enviar pedido a YiQi" },
      { type: "nuevo", text: "El campo Cliente busca entre los clientes reales de YiQi (nombre, razón social o CUIT). Vacío = Consumidor Final" },
      { type: "nuevo", text: "Enviar pedido a YiQi: crea el pedido con Origen Local, el cliente y la lista de precios elegidos (requiere actualizar el conector de Cloudflare)" }
    ]
  },
  {
    version: "3.3",
    date: "2026-10-13",
    title: "Artículos más limpios y columnas con ancho a gusto",
    items: [
      { type: "mejora", text: "Ya no aparecen (ni en Artículos ni al elegir o agregar artículos en Cotizaciones y Relaciones) los que dicen Discontinuado, Mercado Libre, Para fraccionar o REP WM" },
      { type: "mejora", text: "Tampoco aparecen los artículos que tienen todos los precios en cero o vacíos" },
      { type: "mejora", text: "Artículos: se oculta la columna Identificador" },
      { type: "nuevo", text: "Artículos: el ancho de cada columna se puede cambiar arrastrando el borde del título (doble clic vuelve a los anchos originales)" }
    ]
  },
  {
    version: "3.2",
    date: "2026-10-10",
    title: "Artículos guardados: ya no se descargan cada vez que entrás",
    items: [
      { type: "mejora", text: "Los artículos quedan guardados en la computadora: al entrar aparecen al instante, sin esperar la descarga desde YiQi" },
      { type: "nuevo", text: "Se actualizan solos cada 4 horas, por detrás, sin dejar de usarlos mientras tanto" },
      { type: "nuevo", text: "Botón Actualizar en Artículos para traerlos al momento, y aviso de cuándo fue la última actualización" },
      { type: "mejora", text: "Al cerrar sesión se borran los artículos guardados en esa computadora" }
    ]
  },
  {
    version: "3.1",
    date: "2026-10-09",
    title: "Filtros en Relaciones y guardar todas las relaciones de una vez",
    items: [
      { type: "nuevo", text: "Relaciones: filtros Todas, Texto exacto, Condiciones y Equivalencias, con la cantidad de cada tipo" },
      { type: "nuevo", text: "Al crear o editar una relación, avisa en el momento si ya existe una igual (mismo texto, mismas condiciones o el mismo par de palabras)" },
      { type: "nuevo", text: "Cotizaciones: botón \"Guardar todas como relaciones\" que crea en un clic las relaciones de todos los renglones con un artículo elegido (se puede deshacer)" },
      { type: "correccion", text: "Cotizaciones: separación entre el recuadro de la lista y el del presupuesto" }
    ]
  },
  {
    version: "3.0",
    date: "2026-10-08",
    title: "Palabras equivalentes en los dos sentidos",
    items: [
      { type: "mejora", text: "Las palabras equivalentes se muestran como \"⇄ equivale a\": funcionan en los dos sentidos (si el cliente escribe cualquiera de las dos, aparecen los artículos que dicen una u otra)" }
    ]
  },
  {
    version: "2.9",
    date: "2026-10-08",
    title: "Palabras equivalentes, nuevo orden del menú e ícono",
    items: [
      { type: "nuevo", text: "Relaciones: nuevo tipo \"Palabra equivalente\" para indicar que una palabra del pedido figura de otra forma en los artículos (por ejemplo, autocurable → auto)" },
      { type: "mejora", text: "El menú lateral muestra primero Presupuestos (Cotizaciones y Relaciones), después Artículos y Control Facturas" },
      { type: "mejora", text: "Al entrar a Aruki se abre Cotizaciones" },
      { type: "mejora", text: "Nuevo ícono de la pestaña: el gato celeste sobre fondo transparente" },
      { type: "mejora", text: "La pestaña del navegador y la pantalla de acceso dicen solamente Aruki" }
    ]
  },
  {
    version: "2.8",
    date: "2026-10-08",
    title: "Cotizaciones: las fotos siempre se leen con IA",
    items: [
      { type: "mejora", text: "Las fotos (JPG o PNG) se leen siempre con IA, aunque la casilla \"Leer PDF con IA\" esté destildada. La casilla ahora solo decide cómo se leen los PDF" }
    ]
  },
  {
    version: "2.7",
    date: "2026-10-08",
    title: "Cotizaciones: autocurable = auto, termocurable = termo",
    items: [
      { type: "mejora", text: "\"Autocurable\" (o \"autocurables\") encuentra artículos que dicen \"auto\", y \"termocurable\" (o \"termocurables\") los que dicen \"termo\"" },
      { type: "correccion", text: "Mejor singular de palabras como \"descartables\" → \"descartable\"" }
    ]
  },
  {
    version: "2.6",
    date: "2026-10-08",
    title: "Cotizaciones: textos de las casillas de IA",
    items: [
      { type: "mejora", text: "Las casillas ahora dicen \"Leer PDF con IA (Gemini)\" y \"Revisar con IA (Gemini) los renglones sin coincidencias\"" }
    ]
  },
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

