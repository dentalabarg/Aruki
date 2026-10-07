/* ============================================================
   CONFIG: VERSIÓN Y CHANGELOG
   -----------------------------------------------------------
   Se actualiza en cada cambio pedido: subir LATEST_VERSION y
   agregar un bloque nuevo AL PRINCIPIO del array.
   ============================================================ */
const LATEST_VERSION = "1.5";
const CHANGELOG = [
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

