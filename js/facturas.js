/* ============================================================
   MÓDULO CONTROL FACTURAS
   ============================================================ */
function invoiceLabel(f){
  const type = String(f.TIFA_NOMBRE ?? "").trim();
  const number = String(f.FACT_NUMERO ?? "").trim();
  return [type, number].filter(Boolean).join(" ") || "—";
}
function hasPendingBalance(f){
  return Math.abs(toNumber(f.FACT_PENDIENTE_CANCELACIO)) > 0.10;
}
function statusBadge(estado){
  const normalized = String(estado || "Sin estado").toLowerCase();
  let cls = "badge-amber";
  if (normalized.includes("cobr")) cls = "badge-green";
  else if (normalized.includes("entreg")) cls = "badge-cyan";
  else if (normalized.includes("anul") || normalized.includes("cancel")) cls = "badge-red";
  else if (normalized.includes("pend")) cls = "badge-purple";
  return `<span class="badge ${cls}">${escapeHtml(estado || "Sin estado")}</span>`;
}

let currentStatus = "todas";

const facturasModule = createDataModule({
  endpoint: `${WORKER_BASE}/facturas`,
  viewSize: 50,
  loadingTitle: "Cargando todas las facturas desde YiQi",
  idleText: "Aruki carga todas las facturas al abrir este módulo.",
  emptyText: "Todavía no hay facturas cargadas.",
  ids: {
    banner: "runtimeBanner", kicker: "runtimeKicker", title: "runtimeTitle", text: "runtimeText",
    progress: "loadProgress", progressFill: "loadProgressFill",
    stop: "stopBtn", retry: "retryBtn", refresh: "refreshBtn",
    search: "searchInput", empty: "emptyState",
    currentPage: "currentPageLabel", totalPages: "totalPagesLabel", totalRecords: "totalRecordsLabel",
    note: "facNote", pageButtons: "pageNumberButtons", first: "firstPageBtn", last: "lastPageBtn"
  },
  filter(f){
    const estado = String(f.DESC_ESTADO || "").toLowerCase();
    return currentStatus === "todas" ||
      (currentStatus === "cobradas" && estado.includes("cobr")) ||
      (currentStatus === "saldo" && hasPendingBalance(f)) ||
      (currentStatus === "entregadas" && estado.includes("entreg"));
  },
  searchText(f){
    return [invoiceLabel(f), f.FACT_NUMERO, f.CLIE_RAZON_SOCIAL, f.PUVE_NOMBRE, f.COVE_DESCRIPCION,
      f.FACT_EXTE_NOMBRE, f.VEHA_NOMBRE, f.DESC_ESTADO, f.FACT_TOTAL].join(" ");
  },
  renderRows(pageRows, filtered, m){
    document.getElementById("facturasBody").innerHTML = pageRows.map(f => `
      <tr>
        <td>${escapeHtml(invoiceLabel(f))}</td>
        <td>${escapeHtml(f.CLIE_RAZON_SOCIAL || "—")}</td>
        <td class="muted-cell">${fmtDateTime(f.FACT_FECHA_EMISION)}</td>
        <td class="muted-cell">${escapeHtml(f.PUVE_NOMBRE || "—")}</td>
        <td class="muted-cell">${escapeHtml(f.COVE_DESCRIPCION || "—")}</td>
        <td class="muted-cell">${escapeHtml(f.FACT_EXTE_NOMBRE || "—")}</td>
        <td class="muted-cell">${escapeHtml(f.VEHA_NOMBRE || "—")}</td>
        <td>${money(f.FACT_TOTAL)}</td>
        <td>${money(f.FACT_PENDIENTE_CANCELACIO)}</td>
        <td>${statusBadge(f.DESC_ESTADO)}</td>
      </tr>`).join("");

    const totalVisible = filtered.reduce((sum, f) => sum + toNumber(f.FACT_TOTAL), 0);
    const pendingRows = filtered.filter(hasPendingBalance);
    const pendingVisible = pendingRows.reduce((sum, f) => sum + toNumber(f.FACT_PENDIENTE_CANCELACIO), 0);
    const avg = filtered.length ? totalVisible / filtered.length : 0;

    document.getElementById("kpiTotal").textContent = money(totalVisible);
    document.getElementById("kpiTotalSub").textContent = "Suma de las facturas que coinciden con la búsqueda";
    document.getElementById("kpiCount").textContent = numberFormatter.format(filtered.length);
    document.getElementById("kpiCountSub").textContent =
      `${numberFormatter.format(m.rows.length)} cargadas · ${m.total ? numberFormatter.format(m.total) : "—"} en YiQi`;
    document.getElementById("kpiPending").textContent = money(pendingVisible);
    document.getElementById("kpiPendingSub").textContent =
      `${numberFormatter.format(pendingRows.length)} factura(s) con saldo`;
    document.getElementById("kpiAvg").textContent = money(avg);
  }
});

document.querySelectorAll("#statusFilter .range-btn").forEach(btn => {
  btn.addEventListener("click", function(){
    document.querySelectorAll("#statusFilter .range-btn").forEach(b => b.classList.remove("is-active"));
    this.classList.add("is-active");
    currentStatus = this.dataset.status;
    facturasModule.viewPage = 1;
    facturasModule.render();
  });
});

