// js/invoice-tracking.js
(() => {
  const MODULE_NAME = "InvoiceTracking"; // Identificador único para el módulo

  // Evita que el script se reinicialice si ya está en memoria
  if (window.gmxModulesInitialized && window.gmxModulesInitialized[MODULE_NAME]) {
    return;
  }

  // SECTION 1: DOM Element Selection & Supabase Client
  const createManualInvoiceBtn = document.getElementById(
    "createManualInvoiceBtn"
  );
  const filterCustomerInput = document.getElementById("filterCustomer");
  const filterDateStartInput = document.getElementById("filterDateStart");
  const filterDateEndInput = document.getElementById("filterDateEnd");
  const filterStatusSelect = document.getElementById("filterStatus");
  const filterCurrencySelect = document.getElementById("filterCurrency");
  const applyFiltersBtn = document.getElementById("applyFiltersBtn");
  const resetFiltersBtn = document.getElementById("resetFiltersBtn");
  const invoicesTableHtmlElement = document.getElementById("invoicesTable");
  let invoicesDataTable;

  // Modals
  const viewInvoiceModal = document.getElementById("viewInvoiceModal");
  const closeViewInvoiceModalBtn = document.getElementById(
    "closeViewInvoiceModalBtn"
  );
  const closeViewInvoiceFooterBtn = document.getElementById(
    "closeViewInvoiceFooterBtn"
  );
  const viewInvoiceNumberSpan = document.getElementById("viewInvoiceNumber");
  const invoiceContentContainer = document.getElementById(
    "invoiceContentContainer"
  );
  const downloadInvoicePdfBtn = document.getElementById(
    "downloadInvoicePdfBtn"
  );

  const manualInvoiceModal = document.getElementById("manualInvoiceModal");
  const manualInvoiceModalTitle = document.getElementById(
    "manualInvoiceModalTitle"
  );
  const closeManualInvoiceModalBtn = document.getElementById(
    "closeManualInvoiceModalBtn"
  );
  const manualInvoiceForm = document.getElementById("manualInvoiceForm");
  const cancelManualInvoiceBtn = document.getElementById(
    "cancelManualInvoiceBtn"
  );
  const saveManualInvoiceBtn = document.getElementById("saveManualInvoiceBtn");
  const manualInvoiceIdInput = document.getElementById("manualInvoiceId");
  const manualChargesContainer = document.getElementById(
    "manualChargesContainer"
  );
  const addChargeLineBtn = document.getElementById("itAddChargeLineBtn");
  const manualTotalsByCurrencyDiv = document.getElementById(
    "manualTotalsByCurrency"
  );

  const changeInvoiceStatusModal = document.getElementById(
    "changeInvoiceStatusModal"
  );
  const changeStatusModalTitle = document.getElementById(
    "changeStatusModalTitle"
  );
  const closeChangeStatusModalBtn = document.getElementById(
    "closeChangeStatusModalBtn"
  );
  const changeStatusMessage = document.getElementById("changeStatusMessage");
  const newInvoiceStatusSelect = document.getElementById("newInvoiceStatus");
  const cancelChangeStatusBtn = document.getElementById(
    "cancelChangeStatusBtn"
  );
  const confirmChangeStatusBtn = document.getElementById(
    "confirmChangeStatusBtn"
  );

  const itCustomConfirmModal = document.getElementById("itCustomConfirmModal");
  const itCustomConfirmTitle = document.getElementById("itCustomConfirmTitle");
  const itCustomConfirmMessage = document.getElementById(
    "itCustomConfirmMessage"
  );
  const itCustomConfirmOkBtn = document.getElementById("itCustomConfirmOkBtn");
  const itCustomConfirmCancelBtn = document.getElementById(
    "itCustomConfirmCancelBtn"
  );
  const itCustomConfirmCloseBtn = document.getElementById(
    "itCustomConfirmCloseBtn"
  );
  let currentItConfirmCallback = null;

  const dbTotalInvoicesEl = document.getElementById("db-total-invoices");
  const dbPaidInvoicesEl = document.getElementById("db-paid-invoices");
  const dbPendingInvoicesEl = document.getElementById("db-pending-invoices");
  const dbOverdueInvoicesEl = document.getElementById("db-overdue-invoices");

  // --- New History Modal Elements ---
  const openInvoiceHistoryModalBtn = document.getElementById(
    "openInvoiceHistoryModalBtn"
  );
  const invoiceHistoryModal = document.getElementById("invoiceHistoryModal");
  const closeInvoiceHistoryModalBtn = document.getElementById(
    "closeInvoiceHistoryModalBtn"
  );
  const historyFilterCustomerInput = document.getElementById(
    "historyFilterCustomer"
  );
  const historyFilterMonthSelect =
    document.getElementById("historyFilterMonth");
  const historyFilterYearSelect = document.getElementById("historyFilterYear");
  const historyFilterStatusSelect = document.getElementById(
    "historyFilterStatus"
  );
  const applyHistoryFiltersBtn = document.getElementById(
    "applyHistoryFiltersBtn"
  );
  const invoiceHistoryTableHtmlElement = document.getElementById(
    "invoiceHistoryTable"
  );
  const historyTotalResultsEl = document.getElementById("historyTotalResults");
  const noHistoryResultsMessageEl = document.getElementById(
    "noHistoryResultsMessage"
  );
  const closeInvoiceHistoryFooterBtn = document.getElementById(
    "closeInvoiceHistoryFooterBtn"
  );
  let invoiceHistoryDataTable;
  let historyYearsPopulated = false;

  const INVOICES_TABLE_NAME = "invoices";
  const INVOICE_STATUS_PAID = "Paid";
  const INVOICE_STATUS_CANCELLED = "Cancelled";
  const ALL_STATUSES_FILTER = "all";

  let allInvoicesData = [];
  let currentEditingInvoiceId = null;
  let isDownloadingPdf = false;
  let invoiceSubscription = null;
  let currentUser = null;
  
  let isProcessingRealtimeUpdate = false;

  let highestZIndex = 1100;

  if (typeof supabase === "undefined" || !supabase) {
    console.error("Supabase client is not available in invoice-tracking.js.");
    const itContainer = document.querySelector(".invoice-tracking-container");
    if (itContainer) {
      itContainer.innerHTML = `<div style="padding: 2rem; text-align: center;"><h2>Module Error</h2><p style="color: var(--goldmex-accent-color);">Cannot connect to the database.</p><p>Please ensure you are logged in or try refreshing. If issues persist, contact support.</p></div>`;
    }
    return;
  }

  // SECTION 2: UTILITY FUNCTIONS

  function openItModal(modalElement) {
    if (!modalElement) return;
    highestZIndex++;
    modalElement.style.zIndex = highestZIndex;
    modalElement.style.display = "flex";
    setTimeout(() => modalElement.classList.add("it-modal-open"), 10);
    document.body.style.overflow = "hidden";
  }

  function closeItModal(modalElement) {
    if (!modalElement) return;
    modalElement.classList.remove("it-modal-open");
    setTimeout(() => {
      modalElement.style.display = "none";
      const anyOtherItModalOpen = document.querySelector(
        ".it-modal.it-modal-open"
      );
      if (!anyOtherItModalOpen) {
        document.body.style.overflow = "";
        highestZIndex = 1100;
      }
    }, 300);
  }

  function showItNotification(message, type = "info", duration = 3800) {
    const containerId = "customNotificationContainerIT";
    let notificationContainer = document.getElementById(containerId);
    if (!notificationContainer) {
      notificationContainer = document.createElement("div");
      notificationContainer.id = containerId;
      notificationContainer.className = "custom-notification-it-container";
      document.body.appendChild(notificationContainer);
    }

    if (duration === 0) {
      const existingNotifications = notificationContainer.querySelectorAll(
        `.custom-notification-st.${type}`
      );
      existingNotifications.forEach((notif) => {
        if (
          notif
            .querySelector("span")
            .textContent.includes(message.substring(0, 10))
        ) {
          notif.remove();
        }
      });
    }

    const notification = document.createElement("div");
    notification.className = `custom-notification-st ${type}`;
    let iconClass = "bx bx-info-circle";
    if (type === "success") iconClass = "bx bx-check-circle";
    else if (type === "error") iconClass = "bx bx-x-circle";
    else if (type === "warning") iconClass = "bx bx-error-circle";

    notification.innerHTML = `<i class='${iconClass}'></i><span>${message}</span><button class='custom-notification-st-close' aria-label="Close notification">&times;</button>`;
    notificationContainer.appendChild(notification);
    notificationContainer.style.display = "flex";

    void notification.offsetWidth;
    notification.classList.add("show");

    const closeButton = notification.querySelector(
      ".custom-notification-st-close"
    );
    const removeNotification = () => {
      if (notification.parentNode) {
        notification.classList.remove("show");
        notification.classList.add("hide");
        setTimeout(() => {
          notification.remove();
          if (notificationContainer.childElementCount === 0) {
            notificationContainer.style.display = "none";
          }
        }, 400);
      }
    };
    closeButton.addEventListener("click", removeNotification);
    if (duration > 0) {
      setTimeout(removeNotification, duration);
    }
  }

  function showItConfirm(title, message, onOkCallback) {
    if (
      !itCustomConfirmModal ||
      !itCustomConfirmTitle ||
      !itCustomConfirmMessage ||
      !itCustomConfirmOkBtn ||
      !itCustomConfirmCancelBtn ||
      !itCustomConfirmCloseBtn
    ) {
      if (window.confirm(message.replace(/<strong>|<\/strong>/g, ""))) {
        if (typeof onOkCallback === "function") onOkCallback();
      }
      return;
    }
    itCustomConfirmTitle.textContent = title;
    itCustomConfirmMessage.innerHTML = message;
    currentItConfirmCallback = onOkCallback;
    openItModal(itCustomConfirmModal);
  }

  function hideItConfirmModal() {
    if (!itCustomConfirmModal) return;
    closeItModal(itCustomConfirmModal);
    currentItConfirmCallback = null;
  }

  async function generateNextInvoiceNumberSupabase() {
    const now = new Date();
    const year = String(now.getFullYear()).slice(-2);
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const prefix = `GMX${year}${month}-`;

    const { data, error } = await supabase
      .from(INVOICES_TABLE_NAME)
      .select("invoice_number")
      .like("invoice_number", `${prefix}%`)
      .order("invoice_number", { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== "PGRST116") {
      console.error("Error fetching last invoice number:", error);
      return `${prefix}ERR${Date.now().toString().slice(-3)}`;
    }

    let nextSequence = 1;
    if (data && data.invoice_number) {
      const lastNumStr = data.invoice_number.split("-").pop();
      const lastNum = parseInt(lastNumStr, 10);
      if (!isNaN(lastNum)) {
        nextSequence = lastNum + 1;
      }
    }
    return `${prefix}${String(nextSequence).padStart(4, "0")}`;
  }

  // SECTION 3: SUPABASE DATA FETCHING
  async function fetchInvoicesFromSupabase(
    forHistory = false,
    historyFilters = {}
  ) {
    try {
      let query = supabase.from(INVOICES_TABLE_NAME).select("*");

      if (forHistory) {
        let statusesToFetch = [INVOICE_STATUS_PAID, INVOICE_STATUS_CANCELLED];
        if (
          historyFilters.status &&
          historyFilters.status !== ALL_STATUSES_FILTER
        ) {
          statusesToFetch = [historyFilters.status];
        }
        query = query.in("status", statusesToFetch);

        if (historyFilters.customer) {
          query = query.ilike("customer_name", `%${historyFilters.customer}%`);
        }
        if (historyFilters.year && historyFilters.month) {
          const year = parseInt(historyFilters.year);
          const month = parseInt(historyFilters.month);
          const startDate = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
          const endDate = new Date(
            Date.UTC(year, month + 1, 0, 23, 59, 59, 999)
          );

          query = query.gte(
            "invoice_date",
            startDate.toISOString().split("T")[0]
          );
          query = query.lte(
            "invoice_date",
            endDate.toISOString().split("T")[0]
          );
        }
        query = query.order("invoice_date", { ascending: false });
      } else {
        query = query
          .not(
            "status",
            "in",
            `(${INVOICE_STATUS_PAID},${INVOICE_STATUS_CANCELLED})`
          )
          .order("invoice_date", { ascending: false });
      }

      const { data, error } = await query;

      if (error) {
        console.error("Error fetching invoices from Supabase:", error);
        showItNotification(`Error loading invoices: ${error.message}`, "error");
        return [];
      } else {
        const transformedData = data.map(transformInvoiceDataForUI);
        if (!forHistory) {
          allInvoicesData = transformedData;
          initializeInvoicesTable(allInvoicesData);
          updateDashboardSummary(allInvoicesData);
        }
        return transformedData;
      }
    } catch (e) {
      console.error("Exception while fetching invoices:", e);
      showItNotification(`An unexpected error occurred: ${e.message}`, "error");
      if (!forHistory) {
        allInvoicesData = [];
        initializeInvoicesTable([]);
        updateDashboardSummary([]);
      }
      return [];
    }
  }

  function transformInvoiceDataForUI(invoice) {
    const toLocalDateString = (dateStr) => {
      if (!dateStr) return "N/A";
      const date = new Date(dateStr + "T00:00:00Z");
      return date.toLocaleDateString("en-CA");
    };

    return {
      ...invoice,
      invoice_date: toLocalDateString(invoice.invoice_date),
      due_date: toLocalDateString(invoice.due_date),
      charges: parseJsonbField(invoice.charges, []),
      totals_by_currency: parseJsonbField(invoice.totals_by_currency, {}),
    };
  }

  function parseJsonbField(field, defaultValue) {
    if (typeof field === "string") {
      try {
        return JSON.parse(field);
      } catch (e) {
        console.warn("Failed to parse JSONB string field:", field, e);
        return defaultValue;
      }
    }
    return field || defaultValue;
  }

  // SECTION 4: INVOICE TABLE INITIALIZATION AND RENDERING (MAIN TABLE)
  function initializeInvoicesTable(invoicesData = []) {
    if ($.fn.DataTable.isDataTable(invoicesTableHtmlElement)) {
      invoicesDataTable.clear().destroy();
    }
    const activeInvoices = invoicesData.filter(
      (inv) =>
        inv.status !== INVOICE_STATUS_PAID &&
        inv.status !== INVOICE_STATUS_CANCELLED
    );

    invoicesDataTable = $(invoicesTableHtmlElement).DataTable({
      data: activeInvoices,
      columns: [
        { data: "invoice_number", title: "Invoice #" },
        {
          data: "service_display_id",
          title: "Service ID",
          defaultContent: "N/A",
        },
        { data: "customer_name", title: "Customer", defaultContent: "N/A" },
        {
          data: "invoice_date",
          title: "Invoice Date",
          render: (data, type) =>
            type === "display" && data !== "N/A"
              ? new Date(data + "T00:00:00Z").toLocaleDateString()
              : data,
        },
        {
          data: "due_date",
          title: "Due Date",
          render: (data, type) =>
            type === "display" && data !== "N/A"
              ? new Date(data + "T00:00:00Z").toLocaleDateString()
              : data,
        },
        {
          data: "totals_by_currency",
          title: "Total Amount",
          className: "text-right",
          render: function (data, type, row) {
            if (type === "display" || type === "filter") {
              if (
                data &&
                typeof data === "object" &&
                Object.keys(data).length > 0
              ) {
                let displayCurrency = "USD";
                if (!data.hasOwnProperty("USD")) {
                  if (data.hasOwnProperty("MXN")) displayCurrency = "MXN";
                  else displayCurrency = Object.keys(data)[0];
                }
                return `${parseFloat(data[displayCurrency] || 0).toFixed(
                  2
                )} ${displayCurrency}`;
              }
              return "N/A";
            }
            if (data && data.hasOwnProperty("USD")) return parseFloat(data.USD);
            if (
              data &&
              typeof data === "object" &&
              Object.keys(data).length > 0
            )
              return parseFloat(data[Object.keys(data)[0]]);
            return 0;
          },
        },
        {
          data: "totals_by_currency",
          title: "Currency",
          render: function (data) {
            if (data && typeof data === "object") {
              if (data.hasOwnProperty("USD")) return "USD";
              if (data.hasOwnProperty("MXN")) return "MXN";
              const currencies = Object.keys(data);
              return currencies.length > 0 ? currencies[0] : "N/A";
            }
            return "N/A";
          },
        },
        {
          data: "status",
          title: "Status",
          render: (data) =>
            `<span class="it-status-badge status-${(data || "unknown")
              .toLowerCase()
              .replace(/\s+/g, "-")}">${data || "Unknown"}</span>`,
        },
        {
          data: null,
          title: "Actions",
          orderable: false,
          searchable: false,
          className: "it-table-actions",
          render: function (data, type, row) {
            return `
              <button data-action="view" data-id="${row.id}" title="View Invoice"><i class='bx bx-show'></i></button>
              <button data-action="edit" data-id="${row.id}" title="Edit Invoice"><i class='bx bx-edit'></i></button>
              <button data-action="download" data-id="${row.id}" title="Download PDF"><i class='bx bxs-file-pdf'></i></button>
              <button data-action="mark-paid" data-id="${row.id}" title="Mark as Paid"><i class='bx bx-money'></i></button>
              <button data-action="cancel" data-id="${row.id}" title="Cancel Invoice"><i class='bx bx-x-circle'></i></button>
            `;
          },
        },
      ],
      responsive: true,
      scrollX: true,
      autoWidth: false,
      language: {
        search: "Search Invoices:",
        lengthMenu: "Show _MENU_ invoices",
        info: "Showing _START_ to _END_ of _TOTAL_ active invoices",
        infoEmpty: "No active invoices to display",
        infoFiltered: "(filtered from _MAX_ total active invoices)",
        paginate: {
          first: "<i class='bx bx-chevrons-left'></i>",
          last: "<i class='bx bx-chevrons-right'></i>",
          next: "<i class='bx bx-chevron-right'></i>",
          previous: "<i class='bx bx-chevron-left'></i>",
        },
        emptyTable: "No active invoices found.",
      },
      order: [[3, "desc"]],
      drawCallback: function (settings) {
        var api = new $.fn.dataTable.Api(settings);
        if ($.fn.dataTable.Responsive && api.responsive)
          api.responsive.recalc();
      },
    });
  }

  // --- HISTORY MODAL FUNCTIONS ---
  function openHistoryModal() {
    if (!invoiceHistoryModal) return;
    populateHistoryFilterDropdowns();
    handleFilterHistoryInvoices();
    openItModal(invoiceHistoryModal);
  }

  function closeHistoryModal() {
    if (!invoiceHistoryModal) return;
    closeItModal(invoiceHistoryModal);
  }

  function populateHistoryFilterDropdowns() {
    if (!historyFilterMonthSelect || !historyFilterYearSelect) return;

    if (historyFilterMonthSelect.options.length <= 1) {
      const months = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December",
      ];
      historyFilterMonthSelect.innerHTML =
        '<option value="">All Months</option>';
      months.forEach((month, index) => {
        const option = document.createElement("option");
        option.value = index;
        option.textContent = month;
        historyFilterMonthSelect.appendChild(option);
      });
    }

    if (!historyYearsPopulated) {
      const currentYear = new Date().getFullYear();
      historyFilterYearSelect.innerHTML = '<option value="">All Years</option>';
      for (let i = 0; i < 5; i++) {
        const year = currentYear - i;
        const option = document.createElement("option");
        option.value = year;
        option.textContent = year;
        historyFilterYearSelect.appendChild(option);
      }
      historyFilterYearSelect.value = currentYear;
      historyYearsPopulated = true;
    }
  }

  async function handleFilterHistoryInvoices() {
    if (!currentUser) {
      showItNotification("Please log in to view history.", "info");
      if (invoiceHistoryDataTable) invoiceHistoryDataTable.clear().draw();
      if (historyTotalResultsEl)
        historyTotalResultsEl.textContent = "Results: 0";
      if (noHistoryResultsMessageEl)
        noHistoryResultsMessageEl.style.display = "block";
      return;
    }

    const filters = {
      customer: historyFilterCustomerInput.value.trim(),
      month: historyFilterMonthSelect.value,
      year: historyFilterYearSelect.value,
      status: historyFilterStatusSelect.value,
    };

    const originalButtonText = applyHistoryFiltersBtn.innerHTML;
    applyHistoryFiltersBtn.innerHTML =
      "<i class='bx bx-loader-alt bx-spin'></i> Filtering...";
    applyHistoryFiltersBtn.disabled = true;

    const historicalInvoices = await fetchInvoicesFromSupabase(true, filters);

    applyHistoryFiltersBtn.innerHTML = originalButtonText;
    applyHistoryFiltersBtn.disabled = false;

    initializeInvoiceHistoryTable(historicalInvoices);

    if (historyTotalResultsEl)
      historyTotalResultsEl.textContent = `Results: ${historicalInvoices.length}`;
    if (noHistoryResultsMessageEl) {
      noHistoryResultsMessageEl.style.display =
        historicalInvoices.length === 0 ? "block" : "none";
    }
  }

  function initializeInvoiceHistoryTable(historyData = []) {
    if ($.fn.DataTable.isDataTable(invoiceHistoryTableHtmlElement)) {
      invoiceHistoryDataTable.clear().destroy();
    }
    invoiceHistoryDataTable = $(invoiceHistoryTableHtmlElement).DataTable({
      data: historyData,
      columns: [
        { data: "invoice_number", title: "Invoice #" },
        {
          data: "service_display_id",
          title: "Service ID",
          defaultContent: "N/A",
        },
        { data: "customer_name", title: "Customer", defaultContent: "N/A" },
        {
          data: "invoice_date",
          title: "Invoice Date",
          render: (data, type) =>
            type === "display" && data !== "N/A"
              ? new Date(data + "T00:00:00Z").toLocaleDateString()
              : data,
        },
        {
          data: "due_date",
          title: "Due Date",
          render: (data, type) =>
            type === "display" && data !== "N/A"
              ? new Date(data + "T00:00:00Z").toLocaleDateString()
              : data,
        },
        {
          data: "totals_by_currency",
          title: "Total Amount",
          className: "text-right",
          render: function (data) {
            if (
              data &&
              typeof data === "object" &&
              Object.keys(data).length > 0
            ) {
              const currency = Object.keys(data)[0];
              return `${parseFloat(data[currency] || 0).toFixed(
                2
              )} ${currency}`;
            }
            return "N/A";
          },
        },
        {
          data: "totals_by_currency",
          title: "Currency",
          render: function (data) {
            if (data && typeof data === "object") {
              if (data.hasOwnProperty("USD")) return "USD";
              if (data.hasOwnProperty("MXN")) return "MXN";
              const currencies = Object.keys(data);
              return currencies.length > 0 ? currencies[0] : "N/A";
            }
            return "N/A";
          },
        },
        {
          data: "status",
          title: "Status",
          render: (data) =>
            `<span class="it-status-badge status-${(data || "unknown")
              .toLowerCase()
              .replace(/\s+/g, "-")}">${data || "Unknown"}</span>`,
        },
        {
          data: null,
          title: "Actions",
          orderable: false,
          searchable: false,
          className: "it-table-actions",
          render: function (data, type, row) {
            return `
              <button data-action="view" data-id="${row.id}" title="View Invoice"><i class='bx bx-show'></i></button>
              <button data-action="download" data-id="${row.id}" title="Download PDF"><i class='bx bxs-file-pdf'></i></button>
            `;
          },
        },
      ],
      responsive: true,
      scrollX: true,
      autoWidth: false,
      language: {
        search: "Search History:",
        lengthMenu: "Show _MENU_ entries",
        info: "Showing _START_ to _END_ of _TOTAL_ historical invoices",
        infoEmpty: "No historical invoices to display",
        infoFiltered: "(filtered from _MAX_ total historical invoices)",
        paginate: {
          first: "<i class='bx bx-chevrons-left'></i>",
          last: "<i class='bx bx-chevrons-right'></i>",
          next: "<i class='bx bx-chevron-right'></i>",
          previous: "<i class='bx bx-chevron-left'></i>",
        },
        emptyTable: "No historical invoices found for the selected criteria.",
      },
      order: [[3, "desc"]],
      drawCallback: function (settings) {
        var api = new $.fn.dataTable.Api(settings);
        if ($.fn.dataTable.Responsive && api.responsive)
          api.responsive.recalc();
      },
    });
  }

  // SECTION 5: DASHBOARD SUMMARY & MANUAL INVOICE FORM HELPERS

  function updateDashboardSummary(invoices = []) {
    const activeInvoices = invoices.filter(
      (inv) =>
        inv.status !== INVOICE_STATUS_PAID &&
        inv.status !== INVOICE_STATUS_CANCELLED
    );

    if (dbTotalInvoicesEl)
      dbTotalInvoicesEl.textContent = activeInvoices.length;

    const paidCount = 0;
    if (dbPaidInvoicesEl) dbPaidInvoicesEl.textContent = paidCount;

    let pendingCount = 0,
      overdueCount = 0;
    activeInvoices.forEach((inv) => {
      const status = String(inv.status || "").toLowerCase();
      if (status === "pending") pendingCount++;
      else if (status === "overdue") overdueCount++;
    });
    if (dbPendingInvoicesEl) dbPendingInvoicesEl.textContent = pendingCount;
    if (dbOverdueInvoicesEl) dbOverdueInvoicesEl.textContent = overdueCount;
  }

  function addChargeLine(chargeData = null) {
    const chargeLineDiv = document.createElement("div");
    chargeLineDiv.className = "it-charge-line";
    chargeLineDiv.innerHTML = `
        <input type="text" name="charge_name[]" placeholder="Service Description" value="${
          chargeData?.name || ""
        }" required>
        <input type="number" name="charge_quantity[]" placeholder="1" step="0.01" min="0" value="${
          chargeData?.quantity || 1
        }" required>
        <input type="number" name="charge_unit_price[]" placeholder="0.00" step="0.01" min="0" value="${
          chargeData?.unit_price || 0
        }" required>
        <select name="charge_currency[]" required>
            <option value="USD" ${
              chargeData?.currency === "USD" || !chargeData ? "selected" : ""
            }>USD</option>
            <option value="MXN" ${
              chargeData?.currency === "MXN" ? "selected" : ""
            }>MXN</option>
        </select>
        <input type="number" name="charge_amount[]" placeholder="0.00" readonly step="0.01" value="${
          chargeData?.amount || 0
        }">
        <button type="button" class="btn-goldmex-danger btn-goldmex-small it-remove-charge-line-btn" title="Delete Charge"><i class='bx bx-trash'></i></button>
    `;
    manualChargesContainer.appendChild(chargeLineDiv);

    const inputs = chargeLineDiv.querySelectorAll(
      'input[name="charge_quantity[]"], input[name="charge_unit_price[]"]'
    );
    inputs.forEach((input) => {
      input.addEventListener("input", () =>
        calculateAndUpdateChargeLineAmount(chargeLineDiv)
      );
    });

    calculateAndUpdateChargeLineAmount(chargeLineDiv);
  }

  function calculateAndUpdateChargeLineAmount(chargeLineElement) {
    const qty =
      parseFloat(
        chargeLineElement.querySelector('input[name="charge_quantity[]"]').value
      ) || 0;
    const unitPrice =
      parseFloat(
        chargeLineElement.querySelector('input[name="charge_unit_price[]"]')
          .value
      ) || 0;
    const amountInput = chargeLineElement.querySelector(
      'input[name="charge_amount[]"]'
    );
    amountInput.value = (qty * unitPrice).toFixed(2);
    updateManualTotals();
  }

  function updateManualTotals() {
    const totals = {};
    manualChargesContainer
      .querySelectorAll(".it-charge-line")
      .forEach((line) => {
        const currency = line.querySelector(
          'select[name="charge_currency[]"]'
        ).value;
        const amount =
          parseFloat(
            line.querySelector('input[name="charge_amount[]"]').value
          ) || 0;
        if (currency) {
          totals[currency] = (totals[currency] || 0) + amount;
        }
      });

    let totalsHtml = "<p><strong>Totals by Currency:</strong></p>";
    if (Object.keys(totals).length === 0) {
      totalsHtml +=
        '<p class="total-currency-line"><span>N/A</span> <span>0.00</span></p>';
    } else {
      for (const curr in totals) {
        totalsHtml += `<p class="total-currency-line"><span>${curr}:</span> <span>${totals[
          curr
        ].toFixed(2)}</span></p>`;
      }
    }
    manualTotalsByCurrencyDiv.innerHTML = totalsHtml;
  }

  function resetManualInvoiceForm() {
    if (manualInvoiceForm) manualInvoiceForm.reset();
    if (manualInvoiceIdInput) manualInvoiceIdInput.value = "";
    if (manualChargesContainer)
      manualChargesContainer.innerHTML = `
      <div class="it-charge-line-headers">
          <span>Description <span class="it-required">*</span></span>
          <span>Qty <span class="it-required">*</span></span>
          <span>Unit Price <span class="it-required">*</span></span>
          <span>Currency <span class="it-required">*</span></span>
          <span>Amount</span>
          <span>Action</span>
      </div>`;
    if (manualTotalsByCurrencyDiv)
      manualTotalsByCurrencyDiv.innerHTML =
        '<p><strong>Totals by Currency:</strong></p><p class="total-currency-line"><span>N/A</span> <span>0.00</span></p>';
    currentEditingInvoiceId = null;
    const today = new Date().toISOString().split("T")[0];
    const manualInvoiceDateInput = document.getElementById("manualInvoiceDate");
    if (manualInvoiceDateInput) manualInvoiceDateInput.value = today;
    const manualStatusSelect = document.getElementById("manualStatus");
    if (manualStatusSelect) manualStatusSelect.value = "Pending";
  }

  // SECTION 6: EVENT HANDLERS

  function handleFilterApply() {
    const customerFilter = filterCustomerInput.value.toLowerCase().trim();
    const dateStartFilter = filterDateStartInput.value;
    const dateEndFilter = filterDateEndInput.value;
    const statusFilter = filterStatusSelect.value;
    const currencyFilter = filterCurrencySelect.value;

    const filteredData = allInvoicesData.filter((inv) => {
      let match = true;
      if (
        customerFilter &&
        !(inv.customer_name || "").toLowerCase().includes(customerFilter)
      )
        match = false;

      const invDate = inv.invoice_date;
      if (dateStartFilter && invDate !== "N/A" && invDate < dateStartFilter)
        match = false;
      if (dateEndFilter && invDate !== "N/A" && invDate > dateEndFilter)
        match = false;

      if (
        statusFilter !== ALL_STATUSES_FILTER &&
        (inv.status || "").toLowerCase() !== statusFilter.toLowerCase()
      )
        match = false;

      if (currencyFilter !== ALL_STATUSES_FILTER) {
        const currenciesInInvoice = inv.totals_by_currency
          ? Object.keys(inv.totals_by_currency)
          : [];
        if (!currenciesInInvoice.includes(currencyFilter)) {
          match = false;
        }
      }
      return match;
    });
    initializeInvoicesTable(filteredData);
    updateDashboardSummary(filteredData);
  }

  function handleFilterReset() {
    filterCustomerInput.value = "";
    filterDateStartInput.value = "";
    filterDateEndInput.value = "";
    filterStatusSelect.value = ALL_STATUSES_FILTER;
    filterCurrencySelect.value = ALL_STATUSES_FILTER;
    initializeInvoicesTable(allInvoicesData);
    updateDashboardSummary(allInvoicesData);
  }

  function renderInvoiceDetail(invoiceId) {
    let invoice = allInvoicesData.find((inv) => inv.id === invoiceId);

    if (!invoice) {
      if ($.fn.DataTable.isDataTable(invoiceHistoryTableHtmlElement)) {
        const historyTableInstance = $(
          invoiceHistoryTableHtmlElement
        ).DataTable();
        const historyRowData = historyTableInstance
          .rows()
          .data()
          .toArray()
          .find((inv) => inv.id === invoiceId);
        if (historyRowData) invoice = historyRowData;
      }
    }

    if (!invoice) {
      invoiceContentContainer.innerHTML = "<p>Invoice details not found.</p>";
      openItModal(viewInvoiceModal);
      return;
    }

    if (viewInvoiceNumberSpan)
      viewInvoiceNumberSpan.textContent = invoice.invoice_number;

    let chargesHtml = "";
    (invoice.charges || []).forEach((charge) => {
      chargesHtml += `
        <tr>
          <td>${charge.name || "N/A"}</td>
          <td style="text-align:right;">${(charge.quantity || 0).toFixed(2)}</td>
          <td style="text-align:right;">${(charge.unit_price || 0).toFixed(2)}</td>
          <td style="text-align:center;">${charge.currency || "USD"}</td>
          <td style="text-align:right;">${(charge.amount || 0).toFixed(2)}</td>
        </tr>`;
    });

    let totalsHtml = "";
    const displayTotals =
      invoice.totals_by_currency &&
      typeof invoice.totals_by_currency === "object" &&
      Object.keys(invoice.totals_by_currency).length > 0
        ? invoice.totals_by_currency
        : (invoice.charges || []).reduce((acc, charge) => {
            const currency = charge.currency || "USD";
            acc[currency] = (acc[currency] || 0) + (charge.amount || 0);
            return acc;
          }, {});

    for (const curr in displayTotals) {
      totalsHtml += `<tr><td colspan="4" style="text-align:right; font-weight:bold;">TOTAL (${curr}):</td><td style="text-align:right; font-weight:bold;">${parseFloat(
        displayTotals[curr] || 0
      ).toFixed(2)}</td></tr>`;
    }

    const displayInvoiceDate =
      invoice.invoice_date !== "N/A"
        ? new Date(invoice.invoice_date + "T00:00:00Z").toLocaleDateString()
        : "N/A";
    const displayDueDate =
      invoice.due_date !== "N/A"
        ? new Date(invoice.due_date + "T00:00:00Z").toLocaleDateString()
        : "N/A";

    invoiceContentContainer.innerHTML = `
      <div class="invoice-preview" style="padding:15px; background: #fff; border: 1px solid #eee; border-radius: 5px;">
        <div class="invoice-header" style="display:flex; justify-content:space-between; margin-bottom:20px; padding-bottom:10px; border-bottom:1px solid #eee;">
          <div class="invoice-logo">
            <img src="/assets/goldmex-logo-light.svg" alt="Goldmex Logo" style="height: 50px; max-width: 180px;" onerror="this.style.display='none'; this.outerHTML='<span>Goldmex Logo</span>'"/>
            <p style="font-size:0.8em; color:#777; margin-top:5px;">GMX E-Commerce Services, LLC</p>
          </div>
          <div class="invoice-company-details" style="text-align:right; font-size:0.9em;">
            2345 Michael Faraday Dr. Ste. 8<br>San Diego CA 92154, USA
          </div>
        </div>
        <div class="invoice-parties" style="display:flex; justify-content:space-between; margin-bottom:20px; font-size:0.9em;">
          <div class="invoice-customer">
            <strong>Bill To:</strong><br>
            ${invoice.customer_name || "N/A"}<br>
            ${invoice.customer_address || "Address not available"}<br>
            ${invoice.customer_tax_id ? `Tax ID: ${invoice.customer_tax_id}`: ""}
          </div>
          <div class="invoice-meta" style="text-align:right;">
            <strong>Invoice Number:</strong> ${invoice.invoice_number}<br>
            ${invoice.service_display_id ? `<strong>Service ID:</strong> ${invoice.service_display_id}<br>`: ""}
            <strong>Invoice Date:</strong> ${displayInvoiceDate}<br>
            <strong>Due Date:</strong> ${displayDueDate}
          </div>
        </div>
        <table class="invoice-items-table" style="width:100%; border-collapse:collapse; font-size:0.85em;">
          <thead>
            <tr>
              <th style="border:1px solid #ddd; padding:8px; background:#f9f9f9; text-align:left;">Description</th>
              <th style="border:1px solid #ddd; padding:8px; background:#f9f9f9; text-align:right;">Quantity</th>
              <th style="border:1px solid #ddd; padding:8px; background:#f9f9f9; text-align:right;">Unit Price</th>
              <th style="border:1px solid #ddd; padding:8px; background:#f9f9f9; text-align:center;">Currency</th>
              <th style="border:1px solid #ddd; padding:8px; background:#f9f9f9; text-align:right;">Amount</th>
            </tr>
          </thead>
          <tbody>${chargesHtml}</tbody>
          <tfoot>${totalsHtml}</tfoot>
        </table>
        <div class="invoice-footer" style="margin-top:20px; font-size:0.8em; text-align:center; color:#777;">
          ${invoice.payment_communication ? `<p><strong>Payment Communication:</strong> ${invoice.payment_communication}</p>`: ""}
          ${invoice.notes ? `<p><strong>Notes:</strong> ${invoice.notes}</p>` : ""}
          <p>Thank you for your business!</p>
        </div>
      </div>`;
    openItModal(viewInvoiceModal);
  }

  async function handleTableActions(event, tableType = "main") {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const invoiceId = button.dataset.id;
    const action = button.dataset.action;

    let invoiceRow;
    if (tableType === "history") {
      if ($.fn.DataTable.isDataTable(invoiceHistoryTableHtmlElement)) {
        const historyTableInstance = $(
          invoiceHistoryTableHtmlElement
        ).DataTable();
        invoiceRow = historyTableInstance
          .rows()
          .data()
          .toArray()
          .find((inv) => inv.id === invoiceId);
      }
    } else {
      invoiceRow = allInvoicesData.find((inv) => inv.id === invoiceId);
    }

    if (!invoiceRow) {
      try {
        const { data, error } = await supabase
          .from(INVOICES_TABLE_NAME)
          .select("*")
          .eq("id", invoiceId)
          .single();
        if (error && error.code !== "PGRST116") throw error;
        if (data) {
          invoiceRow = transformInvoiceDataForUI(data);
        } else {
          showItNotification("Could not find invoice data for this action.", "error");
          return;
        }
      } catch (e) {
        console.error("Error fetching specific invoice for action:", e);
        showItNotification(`Error retrieving invoice: ${e.message}`, "error");
        return;
      }
    }

    switch (action) {
      case "view":
        renderInvoiceDetail(invoiceId);
        break;
      case "edit":
        if (tableType === "history") {
          showItNotification("Historical invoices cannot be edited.", "info");
          return;
        }
        resetManualInvoiceForm();
        currentEditingInvoiceId = invoiceId;
        if (manualInvoiceModalTitle)
          manualInvoiceModalTitle.innerHTML = `<i class='bx bx-edit-alt'></i> Edit Invoice ${invoiceRow.invoice_number}`;
        if (manualInvoiceIdInput) manualInvoiceIdInput.value = invoiceRow.id;

        document.getElementById("manualCustomerName").value = invoiceRow.customer_name || "";
        document.getElementById("manualCustomerAddress").value = invoiceRow.customer_address || "";
        document.getElementById("manualCustomerTaxId").value = invoiceRow.customer_tax_id || "";
        document.getElementById("manualInvoiceDate").value = invoiceRow.invoice_date !== "N/A" ? invoiceRow.invoice_date : new Date().toISOString().split("T")[0];
        document.getElementById("manualDueDate").value = invoiceRow.due_date !== "N/A" ? invoiceRow.due_date : "";
        document.getElementById("manualServiceDisplayId").value = invoiceRow.service_display_id || "";
        document.getElementById("manualInvoiceNumber").value = invoiceRow.invoice_number || "";
        document.getElementById("manualStatus").value = invoiceRow.status || "Pending";
        document.getElementById("manualPaymentCommunication").value = invoiceRow.payment_communication || "";
        document.getElementById("manualNotes").value = invoiceRow.notes || "";

        (invoiceRow.charges || []).forEach((charge) => addChargeLine(charge));
        if ((invoiceRow.charges || []).length === 0) addChargeLine();

        updateManualTotals();
        openItModal(manualInvoiceModal);
        break;
      case "download":
        handleDownloadPdf(invoiceId);
        break;
      case "mark-paid":
        if (tableType === "history") return;
        if (changeStatusModalTitle)
          changeStatusModalTitle.textContent = `Mark Invoice ${invoiceRow.invoice_number} as Paid`;
        if (changeStatusMessage)
          changeStatusMessage.textContent = `Are you sure you want to mark invoice ${invoiceRow.invoice_number} as PAID? This will move it to history.`;
        if (newInvoiceStatusSelect)
          newInvoiceStatusSelect.value = INVOICE_STATUS_PAID;
        if (confirmChangeStatusBtn)
          confirmChangeStatusBtn.dataset.invoiceId = invoiceId;
        openItModal(changeInvoiceStatusModal);
        break;
      case "cancel":
        if (tableType === "history") return;
        if (changeStatusModalTitle)
          changeStatusModalTitle.textContent = `Cancel Invoice ${invoiceRow.invoice_number}`;
        if (changeStatusMessage)
          changeStatusMessage.textContent = `Are you sure you want to CANCEL invoice ${invoiceRow.invoice_number}? This will move it to history.`;
        if (newInvoiceStatusSelect)
          newInvoiceStatusSelect.value = INVOICE_STATUS_CANCELLED;
        if (confirmChangeStatusBtn)
          confirmChangeStatusBtn.dataset.invoiceId = invoiceId;
        openItModal(changeInvoiceStatusModal);
        break;
      default:
        console.warn("Unknown invoice action:", action);
    }
  }

  async function handleChangeInvoiceStatus() {
    const invoiceId = confirmChangeStatusBtn.dataset.invoiceId;
    const newStatus = newInvoiceStatusSelect.value;

    if (!invoiceId || !newStatus) {
      showItNotification("Error: Missing invoice ID or new status.", "error");
      closeItModal(changeInvoiceStatusModal);
      return;
    }

    try {
      showItNotification(`Updating invoice status...`, "info", 0);
      const { data, error } = await supabase
        .from(INVOICES_TABLE_NAME)
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", invoiceId)
        .select()
        .single();

      if (error) throw error;

      showItNotification("", "info", 1);
      showItNotification(`Invoice status updated to ${newStatus}.`, "success");
      
      // The realtime listener will handle the UI update, so no need for manual refresh here.
      
    } catch (e) {
      console.error("Error updating invoice status:", e);
      showItNotification("", "info", 1);
      showItNotification(`Failed to update status: ${e.message}`, "error");
    } finally {
      closeItModal(changeInvoiceStatusModal);
    }
  }

  async function handleSaveManualInvoice(event) {
    event.preventDefault();
    const saveBtn = document.getElementById("saveManualInvoiceBtn");
    saveBtn.disabled = true;
    saveBtn.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Saving...";

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      showItNotification("User not authenticated.", "error");
      saveBtn.disabled = false;
      saveBtn.innerHTML = "Save Invoice";
      return;
    }
    const formData = new FormData(manualInvoiceForm);
    const invoiceId = formData.get("manualInvoiceId");

    const charges = [];
    manualChargesContainer
      .querySelectorAll(".it-charge-line")
      .forEach((line) => {
        const name = line.querySelector('input[name="charge_name[]"]').value.trim();
        const quantity = parseFloat(line.querySelector('input[name="charge_quantity[]"]').value);
        const unit_price = parseFloat(line.querySelector('input[name="charge_unit_price[]"]').value);
        const currency = line.querySelector('select[name="charge_currency[]"]').value;
        if (name && !isNaN(quantity) && !isNaN(unit_price) && currency) {
          charges.push({
            name, quantity, unit_price, currency,
            amount: parseFloat((quantity * unit_price).toFixed(2)),
          });
        }
      });

    if (charges.length === 0) {
      showItNotification("Please add at least one valid charge line.", "warning");
      saveBtn.disabled = false;
      saveBtn.innerHTML = "Save Invoice";
      return;
    }

    const totals_by_currency = charges.reduce((acc, charge) => {
      acc[charge.currency] = (acc[charge.currency] || 0) + charge.amount;
      return acc;
    }, {});

    let invoice_number = formData.get("invoice_number").trim();
    if (!invoice_number && !invoiceId) {
      invoice_number = await generateNextInvoiceNumberSupabase();
    }

    const invoiceData = {
      customer_name: formData.get("customer_name").trim(),
      customer_address: formData.get("customer_address").trim() || null,
      customer_tax_id: formData.get("customer_tax_id").trim() || null,
      invoice_date: formData.get("invoice_date"),
      due_date: formData.get("due_date") || null,
      service_display_id: formData.get("service_display_id").trim() || null,
      invoice_number: invoice_number,
      status: formData.get("status"),
      payment_communication: formData.get("payment_communication").trim() || null,
      notes: formData.get("notes").trim() || null,
      charges: charges,
      totals_by_currency: totals_by_currency,
    };

    if (!invoiceData.customer_name || !invoiceData.invoice_date || !invoiceData.status) {
      showItNotification("Customer Name, Invoice Date, and Status are required.", "warning");
      saveBtn.disabled = false;
      saveBtn.innerHTML = "Save Invoice";
      return;
    }

    try {
      let result;
      if (invoiceId) {
        invoiceData.updated_at = new Date().toISOString();
        const { data, error } = await supabase
          .from(INVOICES_TABLE_NAME)
          .update(invoiceData)
          .eq("id", invoiceId)
          .select()
          .single();
        if (error) throw error;
        result = data;
        showItNotification(`Invoice ${result.invoice_number} updated!`, "success");
      } else {
        invoiceData.user_id = user.id;
        invoiceData.user_email = user.email;
        const { data, error } = await supabase
          .from(INVOICES_TABLE_NAME)
          .insert(invoiceData)
          .select()
          .single();
        if (error) throw error;
        result = data;
        showItNotification(`Invoice ${result.invoice_number} created!`, "success");
      }
      closeItModal(manualInvoiceModal);
      resetManualInvoiceForm();
      // Realtime listener will handle the update.
    } catch (error) {
      console.error("Error saving invoice:", error);
      showItNotification(`Error saving invoice: ${error.message}`, "error");
    } finally {
      saveBtn.disabled = false;
      saveBtn.innerHTML = "Save Invoice";
    }
  }

  async function handleDownloadPdf(invoiceId) {
    if (isDownloadingPdf) {
        showItNotification("A PDF download is in progress.", "warning");
        return;
    }
    isDownloadingPdf = true;

    // Simplified invoice fetching logic
    const { data: invoice, error } = await supabase
        .from(INVOICES_TABLE_NAME)
        .select('*')
        .eq('id', invoiceId)
        .single();
    
    if (error || !invoice) {
        showItNotification("Invoice not found for PDF generation.", "error");
        isDownloadingPdf = false;
        return;
    }

    showItNotification(`Generating PDF for ${invoice.invoice_number}...`, "info", 0);
    
    // Transform data just in case it wasn't already
    const transformedInvoice = transformInvoiceDataForUI(invoice);

    if (typeof html2pdf === "undefined") {
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";
      script.integrity = "sha512-GsLlZN/3F2ErC5ifS5QtgpiJtWd43JWSuIgh7mbzZ8zBps+dvLusV+eNQATqgA/HdeKFVgA5v3S/cIrLF7QnIg==";
      script.crossOrigin = "anonymous";
      script.referrerPolicy = "no-referrer";
      script.onload = () => generatePdfContentAndDownload(transformedInvoice);
      script.onerror = () => {
        showItNotification("", "info", 1);
        showItNotification("Failed to load PDF library.", "error");
        isDownloadingPdf = false;
      };
      document.head.appendChild(script);
    } else {
      generatePdfContentAndDownload(transformedInvoice);
    }
  }

  async function generatePdfContentAndDownload(invoice) {
    // This function remains largely the same as it correctly generates HTML content.
    // No changes are needed here unless the PDF layout itself is problematic.
    // ... (The long HTML string generation from your original code goes here)
    const formatDateForDisplay = (dateString) => {
        if (!dateString || dateString === "N/A") return "N/A";
        const date = new Date(dateString + "T00:00:00Z");
        return date.toLocaleDateString();
    };
    const displayInvoiceDate = formatDateForDisplay(invoice.invoice_date);
    const displayDueDate = formatDateForDisplay(invoice.due_date);
    let chargesHtmlPdf = "";
    (invoice.charges || []).forEach((charge) => {
        chargesHtmlPdf += `
        <tr>
          <td>${charge.name || "N/A"}</td>
          <td class="text-right">${(charge.quantity || 0).toFixed(2)}</td>
          <td class="text-right">${(charge.unit_price || 0).toFixed(2)}</td>
          <td class="text-center">${charge.currency || "USD"}</td>
          <td class="text-right">${(charge.amount || 0).toFixed(2)}</td>
        </tr>`;
    });
    let totalsHtmlPdf = "";
    const validTotals = invoice.totals_by_currency && typeof invoice.totals_by_currency === "object" ? invoice.totals_by_currency : {};
    for (const curr in validTotals) {
        totalsHtmlPdf += `<tr class="total-row"><td colspan="4">TOTAL (${curr}):</td><td>${parseFloat(validTotals[curr] || 0).toFixed(2)}</td></tr>`;
    }
    const logoUrl = "/assets/goldmex-logo-light.svg";
    const invoiceHtmlContent = `
        <html>
            <head><meta charset="UTF-8"><title>Invoice ${invoice.invoice_number}</title>
            <style>
                html, body { height: auto !important; margin: 0 !important; padding: 0 !important; background-color: #ffffff !important; font-family: 'Segoe UI', sans-serif; color: #333; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; line-height: 1.4; }
                .invoice-box { max-width: 190mm; min-height: 0; height: auto; margin: 0 auto; background: #ffffff; border-left: 6px solid #c4a037; border-radius: 10px; padding: 25px 30px; box-shadow: 0 12px 35px rgba(0, 0, 0, 0.1); position: relative; box-sizing: border-box; }
                .top-section { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #c4a037; padding-bottom: 15px; margin-bottom: 20px; }
                .logo img { height: 55px; display: block; }
                .company-info { text-align: right; font-size: 13px; line-height: 1.4; }
                .company-info strong { font-size: 15px; color: #c4a037; display: block; margin-bottom: 2px; }
                .bill-section { display: flex; justify-content: space-between; margin-top: 25px; gap: 20px; font-size: 13px; margin-bottom: 20px; }
                .bill-to, .invoice-details-wrapper { width: 48%; }
                .bill-to strong.meta-title { color: #c4a037; text-transform: uppercase; font-size: 12px; display: block; margin-bottom: 4px; }
                .invoice-details-wrapper { text-align: right; }
                .invoice-details div.detail-item { margin-bottom: 4px; display: flex; justify-content: flex-end; align-items: baseline; }
                .invoice-details div.detail-item strong.detail-label { color: #c4a037; font-weight: bold; text-align: right; margin-right: 6px; white-space: nowrap; min-width: 90px; }
                .invoice-details div.detail-item span.detail-value { text-align: left; white-space: nowrap; }
                table.items-table { width: 100%; border-collapse: collapse; margin-top: 25px; font-size: 13px; margin-bottom: 20px; }
                table.items-table th, table.items-table td { padding: 8px 10px; border: 0.5pt solid #999999; text-align: left; vertical-align: top; }
                table.items-table th { background-color: #f9f4e9 !important; color: #222; text-transform: uppercase; font-size: 12px; text-align: center; font-weight: 600; }
                table.items-table tr:nth-child(even) td { background-color: #fafafa !important; }
                .text-right { text-align: right !important; } .text-center { text-align: center !important; }
                .total-row td { background-color: #fff8e5 !important; font-weight: bold; text-align: right; color: #c4a037; padding-top: 10px; padding-bottom: 10px; }
                .footer { margin-top: 30px; font-size: 12px; text-align: center; color: #777; border-top: 1px solid #cccccc; padding-top: 10px; line-height: 1.5; }
                .footer .highlight { color: #000; font-weight: 600; }
            </style>
            </head>
            <body>
                <div class="invoice-box">
                    <div class="top-section"><div class="logo"><img src="${logoUrl}" alt="GMX Logo"/></div><div class="company-info"><strong>GMX E-Commerce Services, LLC</strong>2345 Michael Faraday Dr. Ste. 8<br>San Diego CA 92154, USA</div></div>
                    <div class="bill-section"><div class="bill-to"><strong class="meta-title">Bill To:</strong>${invoice.customer_name || "N/A"}<br>${invoice.customer_address || "Address not available"}<br>${invoice.customer_tax_id ? `Tax ID: ${invoice.customer_tax_id}`: ""}</div><div class="invoice-details-wrapper"><div class="invoice-details"><div class="detail-item"><strong class="detail-label">Invoice Number:</strong><span class="detail-value">${invoice.invoice_number}</span></div>${invoice.service_display_id ? `<div class="detail-item"><strong class="detail-label">Service ID:</strong><span class="detail-value">${invoice.service_display_id}</span></div>`: ""}<div class="detail-item"><strong class="detail-label">Invoice Date:</strong><span class="detail-value">${displayInvoiceDate}</span></div><div class="detail-item"><strong class="detail-label">Due Date:</strong><span class="detail-value">${displayDueDate}</span></div></div></div></div>
                    <table class="items-table"><thead><tr><th>Description</th><th>Quantity</th><th>Unit Price</th><th>Currency</th><th>Amount</th></tr></thead><tbody>${chargesHtmlPdf}${totalsHtmlPdf}</tbody></table>
                    <div class="footer"><span class="highlight">Payment Communication:</span> ${invoice.payment_communication || `Ref: ${invoice.invoice_number}`}<br>${invoice.notes ? `<span class="highlight">Notes:</span> ${invoice.notes}<br>`: ""}Thank you for your business!</div>
                </div>
            </body>
        </html>`;

    const opt = {
      margin: [8, 8, 8, 8],
      filename: `Invoice-${invoice.invoice_number || "INV"}.pdf`,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, logging: false, letterRendering: true, backgroundColor: "#ffffff" },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      pagebreak: { mode: ["avoid-all", "css", "legacy"] },
    };
    try {
      await html2pdf().from(invoiceHtmlContent).set(opt).save();
      showItNotification("", "info", 1);
      showItNotification("PDF generated and download started!", "success");
    } catch (pdfError) {
      console.error("Error generating PDF:", pdfError);
      showItNotification("", "info", 1);
      showItNotification("Error generating PDF.", "error");
    } finally {
      isDownloadingPdf = false;
    }
  }

  // SECTION 7: EVENT LISTENERS SETUP
  function setupEventListeners() {
    if (applyFiltersBtn) applyFiltersBtn.addEventListener("click", handleFilterApply);
    if (resetFiltersBtn) resetFiltersBtn.addEventListener("click", handleFilterReset);
    if (createManualInvoiceBtn) {
      createManualInvoiceBtn.addEventListener("click", () => {
        resetManualInvoiceForm();
        if (manualInvoiceModalTitle) manualInvoiceModalTitle.innerHTML = "<i class='bx bx-plus-circle'></i> Create New Invoice";
        addChargeLine();
        openItModal(manualInvoiceModal);
      });
    }
    if (addChargeLineBtn) addChargeLineBtn.addEventListener("click", () => addChargeLine());
    if (manualChargesContainer) {
      manualChargesContainer.addEventListener("click", (event) => {
        if (event.target.closest(".it-remove-charge-line-btn")) {
          event.target.closest(".it-charge-line").remove();
          updateManualTotals();
        }
      });
    }
    // All other modal and button listeners...
    if (closeViewInvoiceModalBtn) closeViewInvoiceModalBtn.addEventListener("click", () => closeItModal(viewInvoiceModal));
    if (closeViewInvoiceFooterBtn) closeViewInvoiceFooterBtn.addEventListener("click", () => closeItModal(viewInvoiceModal));
    if (viewInvoiceModal) viewInvoiceModal.addEventListener("click", (e) => { if (e.target === viewInvoiceModal) closeItModal(viewInvoiceModal); });
    if (closeManualInvoiceModalBtn) closeManualInvoiceModalBtn.addEventListener("click", () => { closeItModal(manualInvoiceModal); resetManualInvoiceForm(); });
    if (cancelManualInvoiceBtn) cancelManualInvoiceBtn.addEventListener("click", () => { closeItModal(manualInvoiceModal); resetManualInvoiceForm(); });
    if (manualInvoiceModal) manualInvoiceModal.addEventListener("click", (e) => { if (e.target === manualInvoiceModal) { closeItModal(manualInvoiceModal); resetManualInvoiceForm(); } });
    if (manualInvoiceForm) manualInvoiceForm.addEventListener("submit", handleSaveManualInvoice);
    if (closeChangeStatusModalBtn) closeChangeStatusModalBtn.addEventListener("click", () => closeItModal(changeInvoiceStatusModal));
    if (cancelChangeStatusBtn) cancelChangeStatusBtn.addEventListener("click", () => closeItModal(changeInvoiceStatusModal));
    if (changeInvoiceStatusModal) changeInvoiceStatusModal.addEventListener("click", (e) => { if (e.target === changeInvoiceStatusModal) closeItModal(changeInvoiceStatusModal); });
    if (confirmChangeStatusBtn) confirmChangeStatusBtn.addEventListener("click", handleChangeInvoiceStatus);
    if (invoicesTableHtmlElement) {
      $(invoicesTableHtmlElement).off("click").on("click", "button[data-action]", (event) => handleTableActions(event, "main"));
    }
    if (invoiceHistoryTableHtmlElement) {
      $(invoiceHistoryTableHtmlElement).off("click").on("click", "button[data-action]", (event) => handleTableActions(event, "history"));
    }
    if (downloadInvoicePdfBtn) {
      downloadInvoicePdfBtn.addEventListener("click", () => {
        const invoiceNumber = viewInvoiceNumberSpan ? viewInvoiceNumberSpan.textContent : null;
        if (invoiceNumber) {
          const invoiceToDownload = [...allInvoicesData, ...($('#invoiceHistoryTable').DataTable().rows().data().toArray())]
                                    .find(inv => inv.invoice_number === invoiceNumber);
          if (invoiceToDownload) handleDownloadPdf(invoiceToDownload.id);
          else showItNotification("Could not find invoice for PDF.", "error");
        }
      });
    }
    if (openInvoiceHistoryModalBtn) openInvoiceHistoryModalBtn.addEventListener("click", openHistoryModal);
    if (closeInvoiceHistoryModalBtn) closeInvoiceHistoryModalBtn.addEventListener("click", closeHistoryModal);
    if (closeInvoiceHistoryFooterBtn) closeInvoiceHistoryFooterBtn.addEventListener("click", closeHistoryModal);
    if (invoiceHistoryModal) invoiceHistoryModal.addEventListener("click", (e) => { if (e.target === invoiceHistoryModal) closeHistoryModal(); });
    if (applyHistoryFiltersBtn) applyHistoryFiltersBtn.addEventListener("click", handleFilterHistoryInvoices);
    if (historyFilterMonthSelect) historyFilterMonthSelect.addEventListener("change", handleFilterHistoryInvoices);
    if (historyFilterYearSelect) historyFilterYearSelect.addEventListener("change", handleFilterHistoryInvoices);
    if (historyFilterStatusSelect) historyFilterStatusSelect.addEventListener("change", handleFilterHistoryInvoices);

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        document.querySelectorAll('.it-modal.it-modal-open').forEach(closeItModal);
      }
    });

    if (itCustomConfirmOkBtn) itCustomConfirmOkBtn.addEventListener("click", () => { if (typeof currentItConfirmCallback === "function") currentItConfirmCallback(); hideItConfirmModal(); });
    if (itCustomConfirmCancelBtn) itCustomConfirmCancelBtn.addEventListener("click", hideItConfirmModal);
    if (itCustomConfirmCloseBtn) itCustomConfirmCloseBtn.addEventListener("click", hideItConfirmModal);
  }

  // SECTION 8: REALTIME SUBSCRIPTIONS
  async function removeCurrentSubscription() {
    if (invoiceSubscription) {
      try {
        await supabase.removeChannel(invoiceSubscription);
      } catch (error) {
        console.error(`${MODULE_NAME}: Error removing channel`, error);
      } finally {
        invoiceSubscription = null;
      }
    }
  }

  async function subscribeToInvoiceChanges() {
    await removeCurrentSubscription();

    const channelName = `public:${INVOICES_TABLE_NAME}`;
    invoiceSubscription = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: INVOICES_TABLE_NAME },
        async (payload) => {
          console.log(`${MODULE_NAME}: Change received!`, payload);
          if (isProcessingRealtimeUpdate) return;
          isProcessingRealtimeUpdate = true;
          try {
            await fetchInvoicesFromSupabase();
            if (invoiceHistoryModal?.style.display === "flex") {
              await handleFilterHistoryInvoices();
            }
          } finally {
            isProcessingRealtimeUpdate = false;
          }
        }
      )
      .subscribe((status, err) => {
        if (status === "SUBSCRIBED") {
          console.log(`${MODULE_NAME}: Successfully subscribed to ${channelName}!`);
        } else if (err) {
          console.error(`${MODULE_NAME}: Subscription FAILED`, err);
        }
      });
  }

  // SECTION 9: INITIALIZATION
  async function manageSubscriptionAndData(session) {
    if (session?.user) {
      if (!currentUser || currentUser.id !== session.user.id) {
        currentUser = session.user;
        await fetchInvoicesFromSupabase();
      }
      await subscribeToInvoiceChanges();
    } else {
      currentUser = null;
      allInvoicesData = [];
      initializeInvoicesTable([]);
      if (invoiceHistoryDataTable) invoiceHistoryDataTable.clear().draw();
      updateDashboardSummary([]);
      await removeCurrentSubscription();
    }
  }

  function initializeApp() {
    console.log(`${MODULE_NAME}: Initializing...`);
    setupEventListeners();
    initializeInvoicesTable([]);
    updateDashboardSummary([]);

    const handleAuthStateChange = (event) => {
      console.log(`${MODULE_NAME}: Received supabaseAuthStateChange event.`);
      const { session } = event.detail;
      manageSubscriptionAndData(session);
    };

    document.addEventListener("supabaseAuthStateChange", handleAuthStateChange);

    supabase.auth.getSession().then(({ data: { session } }) => {
      manageSubscriptionAndData(session);
    });

    // Marcar el módulo como inicializado para prevenir ejecuciones futuras
    if (!window.gmxModulesInitialized) window.gmxModulesInitialized = {};
    window.gmxModulesInitialized[MODULE_NAME] = true;
  }

  initializeApp();
})();
