/* ============================================================
   NAVEGACIÓN ENTRE MÓDULOS
   ============================================================ */
const MODULES = ["facturas", "articulos", "cotizaciones", "relaciones"];

function showModule(name){
  if (!MODULES.includes(name)) return;
  MODULES.forEach(m => {
    document.getElementById(`view-${m}`).classList.toggle("hidden", m !== name);
  });
  document.querySelectorAll(".sidebar .nav-item[data-module]").forEach(item => {
    item.classList.toggle("active", item.dataset.module === name);
  });
  if (window.innerWidth <= 980) {
    sidebar.classList.remove("mobile-open");
    sidebarBackdrop.classList.add("hidden");
  }
  window.scrollTo({ top: 0 });
  if (name === "facturas") facturasModule.ensureLoaded();
  if (name === "articulos") articulosModule.ensureLoaded();
  if (name === "relaciones") relacionesModule.ensureLoaded();
  if (name === "cotizaciones") cotizacionesModule.ensureLoaded();
}

document.querySelectorAll(".sidebar .nav-item[data-module]").forEach(item => {
  item.addEventListener("click", () => showModule(item.dataset.module));
});

/* ============================================================
   INIT
   ============================================================ */
facturasModule.reset();
articulosModule.reset();
relacionesModule.reset();
checkSession();
