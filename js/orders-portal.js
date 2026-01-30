// js/orders-portal.js - V6.4 (History Table Fix: Include Client Profiles for BOL)
(function () {
  // --- 0. PREVENIR DOBLE INICIALIZACIÓN (SINGLETON) ---
  if (document.body.dataset.ordersPortalInitialized === "true") {
    console.warn("Orders Portal already initialized. Skipping re-init.");
    // [MODIFIED] Even if we skip init, we ensure we don't have duplicate listeners
    // But usually, returning here is enough if the DOM persists. 
    // The main fix is handling the event listener below.
    return;
  }
  document.body.dataset.ordersPortalInitialized = "true";

  // --- 1. DEPENDENCY CHECK ---
  if (!window.supabase) {
    console.error("Supabase client missing.");
    return;
  }
  if (typeof Swal === "undefined") {
    console.warn("SweetAlert2 is missing. UI alerts will degrade.");
  }
  if (typeof html2pdf === "undefined") {
    console.warn("html2pdf library is missing. BOL download will not work.");
  }

  const moduleContainer = document.querySelector(".ord-container");
  if (!moduleContainer) return;

  // --- CONFIG ---
  const ATTACHMENT_BUCKET = "order-attachments";
  const ORDERS_TABLE = "client_orders";
  const CHANNEL_NAME = "orders_portal_updates";

  // --- STATE ---
  let currentUser = null;
  let productsCache = [];

  // State for Creation & Editing
  let currentOrderDraft = [];
  let tempConfigProduct = null;

  // Editing Mode Flags
  let isEditingMode = false;
  let editingOrderCode = null;
  let editingOrderIsExpedited = false;
  let editingOrderClientId = null;

  // Tables & Subs
  let activeOrdersTable = null;
  let historyOrdersTable = null;
  let realtimeSubscription = null;
  let realtimeDebounceTimer = null;

  // Data Cache
  let groupedActiveOrders = [];
  let groupedHistoryOrders = [];

  // --- DOM ELEMENTS ---
  const scorePending = document.getElementById("score-pending");
  const scoreProcessing = document.getElementById("score-processing");
  const scoreShipped = document.getElementById("score-shipped");
  const scoreExpedited = document.getElementById("score-expedited");

  const tableActiveEl = document.getElementById("ordersTable");
  const tableHistoryEl = document.getElementById("orderHistoryTable");
  const btnRefresh = document.getElementById("btn-refresh-orders");

  // Modals & Forms
  const newOrderModal = document.getElementById("newOrderModal");
  const viewOrderModal = document.getElementById("viewOrderModal");
  const productSelectorModal = document.getElementById("productSelectorModal");
  const historyModal = document.getElementById("historyModal");
  const itemConfigModal = document.getElementById("ordItemConfigModal");

  // Evidence Modal Elements
  const evidenceModal = document.getElementById("evidenceModal");
  const closeEvidenceBtn = document.getElementById("closeEvidenceModal");
  const btnCloseEvidenceFooter = document.getElementById(
    "btnCloseEvidenceFooter",
  );
  const btnLinkToDocs = document.getElementById("btn-link-to-docs");

  const evOrderCode = document.getElementById("ev-order-code");
  const evTransUnit = document.getElementById("ev-trans-unit");
  const evTransPlate = document.getElementById("ev-trans-plate");
  const evTransSeals = document.getElementById("ev-trans-seals");
  const evPhotoGrid = document.getElementById("ev-photo-grid");

  // BOL Preview Modal Elements
  const bolPreviewModal = document.getElementById("ordBolPreviewModal");
  const bolRenderContainer = document.getElementById(
    "ord-bol-render-container",
  );
  const btnCloseBolPreview = document.getElementById("closeBolPreview");
  const btnBolModalClose = document.getElementById("btn-bol-modal-close");
  const btnBolModalPrint = document.getElementById("btn-bol-modal-print");
  const btnBolModalDownload = document.getElementById("btn-bol-modal-download");
  const btnLinkToEvidence = document.getElementById("btn-link-to-evidence");

  // Lightbox Elements
  const imageViewerModal = document.getElementById("ordImageViewerModal");
  const closeImageViewerBtn = document.getElementById("closeImageViewer");
  const lightboxImg = document.getElementById("ord-lightbox-img");
  const lightboxDownloadLink = document.getElementById("ord-lightbox-download");

  // Buttons - Main
  const btnNewOrder = document.getElementById("btn-new-order");
  const btnHistory = document.getElementById("btn-order-history");

  // Form Elements
  const modalTitle = document.querySelector("#newOrderModal h3");
  const closeNewOrderBtn = document.getElementById("closeNewOrderModal");
  const cancelNewOrderBtn = document.getElementById("cancelNewOrderBtn");
  const submitOrderBtn = document.getElementById("submitNewOrderBtn");
  const ordDeliveryDateInput = document.getElementById("ord-delivery-date");
  const ordAttachmentInput = document.getElementById("ord-attachment");
  const draftItemsList = document.getElementById("ord-new-items-list");
  const btnOpenSelector = document.getElementById("btn-open-product-selector");

  const closeSelectorBtn = document.getElementById("closeProductSelector");
  const productSearchInput = document.getElementById("ord-product-search");
  const productGridContainer = document.getElementById(
    "ord-product-grid-container",
  );

  const closeItemConfigBtn = document.getElementById("closeItemConfigModal");
  const cancelItemConfigBtn = document.getElementById("cancelItemConfigBtn");
  const confirmAddItemBtn = document.getElementById("confirmAddItemBtn");
  const confItemName = document.getElementById("conf-item-name");
  const confItemId = document.getElementById("conf-item-id");
  const confItemQty = document.getElementById("conf-item-qty");
  const confItemUnit = document.getElementById("conf-item-unit");
  const confItemCalc = document.getElementById("conf-item-calc");

  const closeViewOrderBtn = document.getElementById("closeViewOrderModal");
  const btnCloseViewFooter = document.getElementById("btnCloseViewFooter");

  // History Filters
  const histMonthSelect = document.getElementById("hist-month");
  const histYearSelect = document.getElementById("hist-year");
  const histSearchInput = document.getElementById("hist-search");
  const btnFilterHistory = document.getElementById("btn-filter-history");

  // --- INITIALIZATION ---
  async function init() {
    console.log("Orders Portal V6.4: Initializing...");

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      console.error("No active user found.");
      return;
    }
    currentUser = user;

    setupEventListeners();
    setMinDate();
    populateHistoryFilters();
    await loadProducts();
    await loadActiveOrders();
    subscribeToRealtime();

    document.addEventListener("moduleWillUnload", cleanupModule, {
      once: true,
    });
  }

  // [MODIFIED] Helper function for Visibility Change to prevent duplicates
  // This must be a named function so we can removeEventListener it later
  function handleVisibilityChange() {
    if (document.visibilityState === "visible") {
      console.log("Tab became visible. Refreshing data...");
      loadActiveOrders();

      // Zombie connection check
      if (!realtimeSubscription || realtimeSubscription.state === 'closed' || realtimeSubscription.state === 'errored') {
        console.log("Re-activating zombie subscription...");
        if (realtimeSubscription) supabase.removeChannel(realtimeSubscription);
        realtimeSubscription = null;
        subscribeToRealtime();
      }
    }
  }

  function cleanupModule() {
    if (realtimeSubscription) supabase.removeChannel(realtimeSubscription);
    // [MODIFIED] Explicitly remove the named listener
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    document.body.dataset.ordersPortalInitialized = "false";
  }

  function setMinDate() {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const yyyy = tomorrow.getFullYear();
    const mm = String(tomorrow.getMonth() + 1).padStart(2, "0");
    const dd = String(tomorrow.getDate()).padStart(2, "0");
    const minDateStr = `${yyyy}-${mm}-${dd}`;
    if (ordDeliveryDateInput) ordDeliveryDateInput.min = minDateStr;
  }

  function formatStringDate(dateStr) {
    if (!dateStr) return "-";
    const parts = dateStr.split("-");
    if (parts.length !== 3) return dateStr;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }

  function subscribeToRealtime() {
    if (realtimeSubscription && (realtimeSubscription.state === 'joined' || realtimeSubscription.state === 'joining')) {
      return;
    }

    console.log("Starting Realtime Subscription...");
    realtimeSubscription = supabase
      .channel(CHANNEL_NAME)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: ORDERS_TABLE },
        () => {
          clearTimeout(realtimeDebounceTimer);
          realtimeDebounceTimer = setTimeout(() => {
            if (document.visibilityState === "visible") {
              loadActiveOrders();
              if (historyModal.classList.contains("open")) loadHistory();
            }
          }, 500);
        },
      )
      .subscribe((status) => {
        console.log("Realtime status:", status);
      });
  }

  // --- DATA LOADING ---
  async function loadProducts() {
    const { data, error } = await supabase
      .from("production_products")
      .select("*")
      .order("name");
    if (error) return console.error("Error loading products:", error);
    productsCache = data || [];
    renderProductGrid(productsCache);
  }

  function calculateWeightLbs(productPartial, totalCases) {
    if (!totalCases) return 0;
    let product = productPartial;
    if (!product || !product.value_per_piece) {
      if (productPartial && productPartial.id) {
        const cached = productsCache.find((p) => p.id === productPartial.id);
        if (cached) product = cached;
      } else if (
        typeof productPartial === "string" ||
        typeof productPartial === "number"
      ) {
        const cached = productsCache.find((p) => p.id === productPartial);
        if (cached) product = cached;
      }
    }
    if (!product) return 0;

    let netContentG = parseFloat(product.value_per_piece) || 0;
    const uom = (product.unit_of_measure || "g").toLowerCase();
    if (uom === "kg" || uom === "l") netContentG *= 1000;

    const pkgWeightG = parseFloat(product.packaging_weight_g) || 0;
    const itemWeightG = netContentG + pkgWeightG;
    const unitsPerCase = parseInt(product.units_per_case) || 1;
    const contentWeightPerCaseG = itemWeightG * unitsPerCase;
    const caseWeightG = parseFloat(product.case_weight_g) || 0;
    const totalWeightPerCaseG = contentWeightPerCaseG + caseWeightG;
    const grandTotalG = totalWeightPerCaseG * totalCases;

    return grandTotalG * 0.00220462;
  }

  async function loadActiveOrders() {
    const { data, error } = await supabase
      .from(ORDERS_TABLE)
      .select(`*, production_products (*), profiles (*)`)
      .neq("status", "cancelled")
      .neq("status", "archived")
      .order("created_at", { ascending: false });

    if (error) return console.error("Error fetching orders:", error);

    const rawData = data || [];
    const groups = {};

    rawData.forEach((row) => {
      const code = row.unique_order_code;
      if (!groups[code]) {
        groups[code] = {
          ...row,
          items: [],
          total_pallets: 0,
          total_weight_lbs: 0,
          is_multi: false,
        };
      }
      groups[code].items.push(row);
      groups[code].total_pallets += row.qty_calculated_pallets || 0;
      const itemWeight = calculateWeightLbs(
        row.production_products,
        row.qty_calculated_cases,
      );
      groups[code].total_weight_lbs += itemWeight;
    });

    Object.values(groups).forEach((g) => {
      if (g.items.length > 1) g.is_multi = true;
    });
    groupedActiveOrders = Object.values(groups);

    updateScorecards(groupedActiveOrders);
    renderActiveTable(groupedActiveOrders);
  }

  function updateScorecards(groupedOrders) {
    const pendingCount = groupedOrders.filter(
      (o) => o.status === "pending",
    ).length;
    const processingCount = groupedOrders.filter((o) =>
      ["processing", "loading", "ready_to_load"].includes(o.status),
    ).length;
    const shippedCount = groupedOrders.filter((o) =>
      ["shipped", "completed"].includes(o.status),
    ).length;
    const expeditedCount = groupedOrders.filter(
      (o) => o.is_expedited === true,
    ).length;

    if (scorePending) scorePending.textContent = pendingCount;
    if (scoreProcessing) scoreProcessing.textContent = processingCount;
    if (scoreShipped) scoreShipped.textContent = shippedCount;
    if (scoreExpedited) scoreExpedited.textContent = expeditedCount;
  }

  // --- ORDER CREATION & EDITING LOGIC ---

  function generateShortId(length = 5) {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let result = "";
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  function openItemConfig(product) {
    tempConfigProduct = product;
    confItemName.value = `${product.sku} - ${product.name}`;
    confItemId.value = product.id;
    confItemQty.value = 1;
    confItemUnit.value = "pallets";

    calculateConfigConversion();
    closeModal(productSelectorModal);
    openModal(itemConfigModal);
    setTimeout(() => confItemQty.focus(), 100);
  }

  function calculateConfigConversion() {
    const qty = parseFloat(confItemQty.value);
    const unit = confItemUnit.value;
    const prod = tempConfigProduct;

    if (!prod || !qty || qty <= 0) {
      confItemCalc.value = "0 Cases / 0 Pallets / 0 lbs";
      return;
    }

    const cpp = prod.cases_per_pallet || 1;
    const upc = prod.units_per_case || 1;
    let totalCases = 0,
      totalPallets = 0;

    if (unit === "cases") {
      totalCases = qty;
      totalPallets = qty / cpp;
    } else if (unit === "units") {
      totalCases = qty / upc;
      totalPallets = totalCases / cpp;
    } else if (unit === "pallets") {
      totalPallets = qty;
      totalCases = qty * cpp;
    }

    const estWeight = calculateWeightLbs(prod, totalCases);

    confItemCalc.value = `${Number.isInteger(totalCases) ? totalCases : totalCases.toFixed(2)
      } Cases / ${Number.isInteger(totalPallets) ? totalPallets : totalPallets.toFixed(2)
      } Plt / ${Math.round(estWeight).toLocaleString()} lbs`;
  }

  function handleAddItemToDraft() {
    if (!tempConfigProduct) return;
    const qty = parseFloat(confItemQty.value);
    const unit = confItemUnit.value;
    if (qty <= 0) {
      Swal.fire(
        "Invalid Quantity",
        "Please enter a valid quantity.",
        "warning",
      );
      return;
    }

    const cpp = tempConfigProduct.cases_per_pallet || 1;
    const upc = tempConfigProduct.units_per_case || 1;
    let calcCases = 0,
      calcPallets = 0;

    if (unit === "cases") {
      calcCases = qty;
      calcPallets = qty / cpp;
    } else if (unit === "units") {
      calcCases = qty / upc;
      calcPallets = calcCases / cpp;
    } else if (unit === "pallets") {
      calcPallets = qty;
      calcCases = qty * cpp;
    }

    currentOrderDraft.push({
      product_id: tempConfigProduct.id,
      product_name: tempConfigProduct.name,
      sku: tempConfigProduct.sku,
      qty_requested: qty,
      unit_type: unit,
      qty_calculated_cases: calcCases,
      qty_calculated_pallets: calcPallets,
      product_details: tempConfigProduct,
    });

    closeModal(itemConfigModal);
    renderDraftTable();
    tempConfigProduct = null;
  }

  function renderDraftTable() {
    draftItemsList.innerHTML = "";

    if (currentOrderDraft.length === 0) {
      draftItemsList.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 2rem; color: var(--color-text-secondary);">No items added yet. Click "Add Product" to begin.</td></tr>`;
      return;
    }

    let grandTotalLbs = 0;

    currentOrderDraft.forEach((item, index) => {
      const tr = document.createElement("tr");
      const pallets = parseFloat(item.qty_calculated_pallets).toFixed(2);

      const weightLbs = calculateWeightLbs(
        item.product_id,
        item.qty_calculated_cases,
      );
      grandTotalLbs += weightLbs;

      const statusBadge = item.id
        ? `<small style="color:#666;">(Existing)</small>`
        : `<small style="color:#28a745; font-weight:bold;">(New)</small>`;
      const displayStatus = isEditingMode ? statusBadge : "";

      tr.innerHTML = `
            <td><strong>${item.sku}</strong> ${displayStatus}<br><small>${item.product_name}</small></td>
            <td>${item.qty_requested} ${item.unit_type}</td>
            <td>${pallets}</td>
            <td style="font-weight:600;">${Math.round(weightLbs).toLocaleString()} lbs</td>
            <td><button class="btn-remove-item" onclick="window.ordRemoveDraftItem(${index})"><i class='bx bx-trash'></i></button></td>
        `;
      draftItemsList.appendChild(tr);
    });

    const totalRow = document.createElement("tr");
    totalRow.style.backgroundColor = "#f0f9ff";
    totalRow.style.fontWeight = "bold";
    totalRow.innerHTML = `
        <td colspan="3" style="text-align:right; padding-right:1rem;">ESTIMATED TOTAL:</td>
        <td style="color:var(--goldmex-primary-color);">${Math.round(grandTotalLbs).toLocaleString()} lbs</td>
        <td></td>
    `;
    draftItemsList.appendChild(totalRow);
  }

  window.ordRemoveDraftItem = function (index) {
    currentOrderDraft.splice(index, 1);
    renderDraftTable();
  };

  // --- SUBMIT HANDLERS ---
  async function handleSubmitOrder(e) {
    if (e) e.preventDefault();

    if (currentOrderDraft.length === 0) {
      return Swal.fire(
        "Empty Order",
        "Please add at least one product.",
        "warning",
      );
    }
    const deliveryDate = ordDeliveryDateInput.value;
    if (!deliveryDate) {
      return Swal.fire(
        "Missing Date",
        "Please select a delivery date.",
        "warning",
      );
    }

    submitOrderBtn.disabled = true;
    submitOrderBtn.innerHTML =
      "<i class='bx bx-loader-alt bx-spin'></i> Processing...";

    try {
      if (isEditingMode) {
        await processUpdateOrder(deliveryDate);
      } else {
        await processCreateOrder(deliveryDate);
      }
    } catch (err) {
      console.error(err);
      Swal.fire("Error", err.message, "error");
    } finally {
      submitOrderBtn.disabled = false;
      submitOrderBtn.textContent = isEditingMode
        ? "Update Order"
        : "Submit Order";
    }
  }

  async function processCreateOrder(deliveryDate) {
    let attachmentUrl = await uploadAttachmentIfPresent();
    const orderCode = `ORD-${generateShortId()}`;

    const rowsToInsert = currentOrderDraft.map((item) => ({
      unique_order_code: orderCode,
      client_id: currentUser.id,
      product_id: item.product_id,
      qty_requested: item.qty_requested,
      unit_type: item.unit_type,
      qty_calculated_cases: item.qty_calculated_cases,
      qty_calculated_pallets: item.qty_calculated_pallets,
      requested_delivery_date: deliveryDate,
      attachment_url: attachmentUrl,
      status: "pending",
      is_expedited: false,
    }));

    const { error } = await supabase.from(ORDERS_TABLE).insert(rowsToInsert);
    if (error) throw error;

    Swal.fire({
      title: "Success!",
      text: `Order ${orderCode} with ${rowsToInsert.length} items created.`,
      icon: "success",
      confirmButtonColor: "var(--goldmex-primary-color)",
    });
    closeModal(newOrderModal);
    resetNewOrderForm();
  }

  async function processUpdateOrder(deliveryDate) {
    if (!editingOrderCode) throw new Error("Order Code Missing");

    const { data: dbItems, error: fetchErr } = await supabase
      .from(ORDERS_TABLE)
      .select("id")
      .eq("unique_order_code", editingOrderCode);
    if (fetchErr) throw fetchErr;

    const dbIds = dbItems.map((i) => i.id);
    const draftIds = currentOrderDraft.filter((i) => i.id).map((i) => i.id);

    const idsToDelete = dbIds.filter((id) => !draftIds.includes(id));

    if (idsToDelete.length > 0) {
      const { error: delErr } = await supabase
        .from(ORDERS_TABLE)
        .delete()
        .in("id", idsToDelete);
      if (delErr) throw delErr;
    }

    const itemsToInsert = currentOrderDraft.filter((i) => !i.id);
    const itemsToUpdate = currentOrderDraft.filter((i) => i.id);

    if (itemsToInsert.length > 0) {
      let attachmentUrl = await uploadAttachmentIfPresent();

      const insertPayload = itemsToInsert.map((item) => ({
        unique_order_code: editingOrderCode,
        client_id: editingOrderClientId || currentUser.id,
        product_id: item.product_id,
        qty_requested: item.qty_requested,
        unit_type: item.unit_type,
        qty_calculated_cases: item.qty_calculated_cases,
        qty_calculated_pallets: item.qty_calculated_pallets,
        requested_delivery_date: deliveryDate,
        attachment_url: attachmentUrl,
        status: "pending",
        is_expedited: editingOrderIsExpedited,
      }));

      const { error: insErr } = await supabase
        .from(ORDERS_TABLE)
        .insert(insertPayload);
      if (insErr) throw insErr;
    }

    for (const item of itemsToUpdate) {
      const { error: updErr } = await supabase
        .from(ORDERS_TABLE)
        .update({
          qty_requested: item.qty_requested,
          unit_type: item.unit_type,
          qty_calculated_cases: item.qty_calculated_cases,
          qty_calculated_pallets: item.qty_calculated_pallets,
          requested_delivery_date: deliveryDate,
        })
        .eq("id", item.id);
      if (updErr) throw updErr;
    }

    const { error: globalErr } = await supabase
      .from(ORDERS_TABLE)
      .update({ requested_delivery_date: deliveryDate })
      .eq("unique_order_code", editingOrderCode);
    if (globalErr) throw globalErr;

    Swal.fire({
      title: "Updated!",
      text: "Order updated successfully.",
      icon: "success",
    });
    closeModal(newOrderModal);
    resetNewOrderForm();
  }

  async function uploadAttachmentIfPresent() {
    if (ordAttachmentInput.files.length > 0) {
      const file = ordAttachmentInput.files[0];
      const fileName = `${currentUser.id}/${Date.now()}.${file.name
        .split(".")
        .pop()}`;
      const { error } = await supabase.storage
        .from(ATTACHMENT_BUCKET)
        .upload(fileName, file);
      if (!error) {
        const { data } = supabase.storage
          .from(ATTACHMENT_BUCKET)
          .getPublicUrl(fileName);
        return data.publicUrl;
      }
    }
    return null;
  }

  function resetNewOrderForm() {
    currentOrderDraft = [];
    isEditingMode = false;
    editingOrderCode = null;
    editingOrderIsExpedited = false;
    editingOrderClientId = null;
    modalTitle.innerHTML = "<i class='bx bxs-cart-add'></i> Create New Order";
    submitOrderBtn.textContent = "Submit Order";
    renderDraftTable();
    ordDeliveryDateInput.value = "";
    ordAttachmentInput.value = "";
    setMinDate();
  }

  // --- HISTORY LOGIC ---
  function populateHistoryFilters() {
    const months = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];
    histMonthSelect.innerHTML = '<option value="">All Months</option>';
    months.forEach((m, i) => {
      histMonthSelect.innerHTML += `<option value="${i + 1}">${m}</option>`;
    });
    const currentYear = new Date().getFullYear();
    histYearSelect.innerHTML = '<option value="">All Years</option>';
    for (let i = 0; i < 5; i++) {
      histYearSelect.innerHTML += `<option value="${currentYear - i}">${currentYear - i}</option>`;
    }
  }

  async function loadHistory() {
    let query = supabase
      .from(ORDERS_TABLE)
      .select(`*, production_products!inner (*), profiles (*)`)
      .or("status.eq.cancelled,status.eq.archived")
      .order("created_at", { ascending: false });

    const month = histMonthSelect.value;
    const year = histYearSelect.value;
    const search = histSearchInput.value.trim().toLowerCase();

    if (year) {
      let startDate, endDate;
      if (month) {
        startDate = new Date(year, month - 1, 1).toISOString();
        endDate = new Date(year, month, 0, 23, 59, 59).toISOString();
      } else {
        startDate = new Date(year, 0, 1).toISOString();
        endDate = new Date(year, 11, 31, 23, 59, 59).toISOString();
      }
      query = query.gte("created_at", startDate).lte("created_at", endDate);
    } else if (month) {
      const currentY = new Date().getFullYear();
      const startDate = new Date(currentY, month - 1, 1).toISOString();
      const endDate = new Date(currentY, month, 0, 23, 59, 59).toISOString();
      query = query.gte("created_at", startDate).lte("created_at", endDate);
    }

    const { data, error } = await query;
    if (error) {
      console.error("History Error", error);
      return;
    }

    let rawData = data || [];
    if (search) {
      rawData = rawData.filter((row) => {
        const code = (row.unique_order_code || "").toLowerCase();
        const prodName = (row.production_products?.name || "").toLowerCase();
        const sku = (row.production_products?.sku || "").toLowerCase();
        return (
          code.includes(search) ||
          prodName.includes(search) ||
          sku.includes(search)
        );
      });
    }

    const groups = {};
    rawData.forEach((row) => {
      const code = row.unique_order_code;
      if (!groups[code]) {
        groups[code] = {
          ...row,
          items: [],
          total_pallets: 0,
          total_weight_lbs: 0,
          is_multi: false,
        };
      }
      groups[code].items.push(row);
      groups[code].total_pallets += row.qty_calculated_pallets || 0;
      const itemWeight = calculateWeightLbs(
        row.production_products,
        row.qty_calculated_cases,
      );
      groups[code].total_weight_lbs += itemWeight;
    });

    Object.values(groups).forEach((g) => {
      if (g.items.length > 1) g.is_multi = true;
    });
    groupedHistoryOrders = Object.values(groups);

    renderHistoryTable(groupedHistoryOrders);
  }

  // --- UI HELPERS ---

  window.ordEdit = async function (id) {
    const { data: targetRow } = await supabase
      .from(ORDERS_TABLE)
      .select("unique_order_code, status, is_expedited, client_id")
      .eq("id", id)
      .single();
    if (!targetRow) return Swal.fire("Error", "Order not found", "error");
    if (targetRow.status !== "pending")
      return Swal.fire(
        "Restricted",
        "Only pending orders can be edited.",
        "warning",
      );

    const { data: allItems, error } = await supabase
      .from(ORDERS_TABLE)
      .select(`*, production_products (*), profiles (*)`)
      .eq("unique_order_code", targetRow.unique_order_code);

    if (error || !allItems.length)
      return Swal.fire("Error", "Could not load order details.", "error");

    isEditingMode = true;
    editingOrderCode = targetRow.unique_order_code;
    editingOrderIsExpedited = targetRow.is_expedited || false;
    editingOrderClientId = targetRow.client_id;

    currentOrderDraft = allItems.map((item) => ({
      id: item.id,
      product_id: item.product_id,
      product_name: item.production_products.name,
      sku: item.production_products.sku,
      qty_requested: item.qty_requested,
      unit_type: item.unit_type,
      qty_calculated_cases: item.qty_calculated_cases,
      qty_calculated_pallets: item.qty_calculated_pallets,
      product_details: item.production_products,
    }));

    ordDeliveryDateInput.value = allItems[0].requested_delivery_date;
    modalTitle.innerHTML = `<i class='bx bx-edit'></i> Edit Order <span style="font-family:monospace;">${editingOrderCode}</span>`;
    submitOrderBtn.textContent = "Update Order";

    renderDraftTable();
    openModal(newOrderModal);
  };

  function renderProductGrid(products) {
    productGridContainer.innerHTML = "";
    if (products.length === 0) {
      productGridContainer.innerHTML =
        '<p style="grid-column:1/-1; text-align:center; color:#888;">No products found.</p>';
      return;
    }
    products.forEach((p) => {
      const card = document.createElement("div");
      card.className = "ord-prod-card";
      card.dataset.id = p.id;
      card.innerHTML = `<i class='bx bx-package'></i><h5>${p.name
        }</h5><span>SKU: <strong>${p.sku || "N/A"}</strong></span>`;
      card.onclick = () => openItemConfig(p);
      productGridContainer.appendChild(card);
    });
  }

  // --- ACTION HELPERS ---

  window.ordCancel = async function (id) {
    const result = await Swal.fire({
      title: "Cancel Order?",
      text: "This cancels ALL items in the order.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#dc2626",
      confirmButtonText: "Yes, cancel",
    });
    if (result.isConfirmed) {
      const { data: targetRow } = await supabase
        .from(ORDERS_TABLE)
        .select("unique_order_code")
        .eq("id", id)
        .single();
      if (targetRow) {
        const { error } = await supabase
          .from(ORDERS_TABLE)
          .update({ status: "cancelled" })
          .eq("unique_order_code", targetRow.unique_order_code);
        if (error) Swal.fire("Error", error.message, "error");
        else Swal.fire("Cancelled!", "Order cancelled.", "success");
      }
    }
  };

  window.ordArchive = async function (id) {
    const { data: targetRow } = await supabase
      .from(ORDERS_TABLE)
      .select("unique_order_code")
      .eq("id", id)
      .single();
    if (!targetRow) return;
    const result = await Swal.fire({
      title: "Archive Order?",
      text: "Move entire order to history?",
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: "#059669",
      confirmButtonText: "Yes, Archive",
    });
    if (result.isConfirmed) {
      const { error } = await supabase
        .from(ORDERS_TABLE)
        .update({ status: "archived" })
        .eq("unique_order_code", targetRow.unique_order_code);
      if (error) Swal.fire("Error", error.message, "error");
      else Swal.fire("Archived!", "Order moved to history.", "success");
    }
  };

  window.ordExpedite = async function (orderId) {
    const { data: targetRow } = await supabase
      .from(ORDERS_TABLE)
      .select("unique_order_code")
      .eq("id", orderId)
      .single();
    if (!targetRow) return;
    const result = await Swal.fire({
      title: "Mark Urgent?",
      text: "Flag entire order?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#ef4444",
      confirmButtonText: "Yes",
    });
    if (result.isConfirmed) {
      const { error } = await supabase
        .from(ORDERS_TABLE)
        .update({ is_expedited: true })
        .eq("unique_order_code", targetRow.unique_order_code);
      if (error) Swal.fire("Error", error.message, "error");
      else Swal.fire("Expedited!", "Marked as urgent.", "success");
    }
  };

  window.viewOrderItemsList = function (code) {
    let group = groupedActiveOrders.find((g) => g.unique_order_code === code);
    if (!group)
      group = groupedHistoryOrders.find((g) => g.unique_order_code === code);
    if (!group) return;

    let htmlList = `<ul style="text-align:left; list-style:none; padding:0;">`;
    group.items.forEach((item) => {
      const weight = calculateWeightLbs(
        item.product_id,
        item.qty_calculated_cases,
      );
      htmlList += `
        <li style="padding:5px 0; border-bottom:1px solid #eee;">
            <strong>${item.production_products.name}</strong><br>
            <small>${item.qty_requested} ${item.unit_type} | ${Math.round(weight).toLocaleString()} lbs</small>
        </li>`;
    });
    htmlList += `</ul>`;
    Swal.fire({
      title: `Items in ${code}`,
      html: htmlList,
      confirmButtonColor: "var(--goldmex-primary-color)",
    });
  };

  window.ordView = function (rowBase64) {
    const row = JSON.parse(decodeURIComponent(rowBase64));
    document.getElementById("view-code").textContent = row.unique_order_code;
    document.getElementById("view-status").innerHTML =
      `<span class="ord-status-badge status-${row.status}">${row.status}</span>`;
    document.getElementById("view-date").textContent = formatStringDate(
      row.requested_delivery_date,
    );

    const dynamicContainer = document.getElementById("view-dynamic-content");

    let itemsHtml = `
        <div>
            <h5 style="border-bottom:1px solid #eee; padding-bottom:5px; margin-bottom:10px;">Order Items</h5>
            <table style="width:100%; font-size:0.9rem; border-collapse:collapse;">
                <tr style="background:#f9fafb; color:#666;">
                    <th style="padding:5px; text-align:left;">Product</th>
                    <th style="padding:5px; text-align:left;">Qty</th>
                    <th style="padding:5px; text-align:left;">Pallets</th>
                    <th style="padding:5px; text-align:left;">Weight</th>
                </tr>
    `;

    row.items.forEach((item) => {
      const lineWeight = calculateWeightLbs(
        item.product_id,
        item.qty_calculated_cases,
      );

      itemsHtml += `
            <tr style="border-bottom:1px solid #f0f0f0;">
                <td style="padding:8px 5px;">${item.production_products?.name}</td>
                <td style="padding:8px 5px;">${item.qty_requested} ${item.unit_type}</td>
                <td style="padding:8px 5px;">${parseFloat(item.qty_calculated_pallets).toFixed(2)}</td>
                <td style="padding:8px 5px;">${Math.round(lineWeight).toLocaleString()} lbs</td>
            </tr>
        `;
    });

    itemsHtml += `<tr style="background:#f0f9ff; font-weight:bold;">
        <td style="padding:8px 5px; text-align:right;">TOTALS:</td>
        <td style="padding:8px 5px;">-</td>
        <td style="padding:8px 5px;">${row.total_pallets.toFixed(2)}</td>
        <td style="padding:8px 5px;">${Math.round(row.total_weight_lbs).toLocaleString()} lbs</td>
    </tr></table></div>`;

    dynamicContainer.innerHTML = itemsHtml;

    const docsContainer = document.getElementById("view-docs");
    docsContainer.innerHTML = "";
    if (row.attachment_url)
      docsContainer.innerHTML += `<a href="${row.attachment_url}" target="_blank" style="color:var(--goldmex-primary-color)"><i class='bx bx-file'></i> PO Attachment</a><br>`;
    if (row.bol_url && row.bol_url !== "GENERATED_MANUALLY")
      docsContainer.innerHTML += `<a href="${row.bol_url}" target="_blank" style="color:var(--goldmex-primary-color)"><i class='bx bxs-file-pdf'></i> BOL Document</a>`;
    if (!row.attachment_url && !row.bol_url)
      docsContainer.textContent = "No documents attached.";
    openModal(viewOrderModal);
  };

  // --- SPLIT VIEW FUNCTIONS ---

  window.ordViewDocs = function (rowBase64) {
    const row = JSON.parse(decodeURIComponent(rowBase64));
    bolRenderContainer.innerHTML = renderBolHtml(row);
    btnBolModalClose.onclick = () => closeModal(bolPreviewModal);
    if (btnCloseBolPreview)
      btnCloseBolPreview.onclick = () => closeModal(bolPreviewModal);

    btnBolModalPrint.onclick = () => {
      const content = bolRenderContainer.innerHTML;
      const win = window.open("", "", "height=700,width=900");
      win.document.write("<html><head><title>Print BOL</title></head><body>");
      win.document.write(content);
      win.document.write("</body></html>");
      win.document.close();
      win.print();
    };

    btnBolModalDownload.onclick = () => downloadBolPdf(row);

    btnLinkToEvidence.onclick = () => {
      closeModal(bolPreviewModal);
      setTimeout(() => window.ordViewEvidence(rowBase64), 200);
    };

    openModal(bolPreviewModal);
  };

  window.ordViewEvidence = function (rowBase64) {
    const row = JSON.parse(decodeURIComponent(rowBase64));
    evOrderCode.textContent = row.unique_order_code;
    evTransUnit.textContent = row.transport_unit || "--";
    evTransPlate.textContent = row.transport_plates || "--";
    evTransSeals.textContent = row.transport_seals || "--";

    evPhotoGrid.innerHTML = "";
    if (row.evidence_photos && row.evidence_photos.length > 0) {
      row.evidence_photos.forEach((url) => {
        const imgContainer = document.createElement("div");
        imgContainer.className = "ord-prod-card";
        imgContainer.style.padding = "0";
        imgContainer.style.overflow = "hidden";
        imgContainer.style.height = "120px";
        imgContainer.style.position = "relative";
        imgContainer.innerHTML = `
                <img src="${url}" style="width:100%; height:100%; object-fit:cover; cursor:pointer;">
                <div style="position:absolute; bottom:0; left:0; right:0; background:rgba(0,0,0,0.5); padding:5px; text-align:right;">
                    <i class='bx bx-zoom-in' style="color:white; font-size:1.2rem;"></i>
                </div>
              `;
        imgContainer.onclick = () => openLightbox(url);
        evPhotoGrid.appendChild(imgContainer);
      });
    } else {
      evPhotoGrid.innerHTML = `<p style="grid-column:1/-1; color:#999; text-align:center;">No photos uploaded.</p>`;
    }

    if (closeEvidenceBtn)
      closeEvidenceBtn.onclick = () => closeModal(evidenceModal);
    if (btnCloseEvidenceFooter)
      btnCloseEvidenceFooter.onclick = () => closeModal(evidenceModal);
    if (btnLinkToDocs) {
      btnLinkToDocs.onclick = () => {
        closeModal(evidenceModal);
        setTimeout(() => window.ordViewDocs(rowBase64), 200);
      };
    }
    openModal(evidenceModal);
  };

  function openLightbox(url) {
    lightboxImg.src = url;
    lightboxDownloadLink.href = url;
    openModal(imageViewerModal);
  }

  function renderBolHtml(row) {
    const bolNumber = row.bol_number || `PENDING-${row.unique_order_code}`;
    const client = row.profiles || {};
    const fullAddress = `${client.address || ""}<br>${client.city || ""}, ${client.state || ""} ${client.zip || ""}`;
    const clientEmail = client.email
      ? client.email.split("@")[0].toUpperCase()
      : "CLIENT";
    const dateObj = row.completed_at ? new Date(row.completed_at) : new Date();
    const todayDate = dateObj.toLocaleDateString("en-US");

    const styles = `
        <style>
            .hoja { width: 100%; background: white; margin: 0; position: relative; box-sizing: border-box; overflow: hidden; }
            .negrita{font-weight:bold}.centro{text-align:center;justify-content:center;display:flex;align-items:center}.texto-fino{font-size:11px;line-height:1.2}.texto-mini{font-size:8px;line-height:1.1;text-align:justify}.header-gris{background-color:#e0e0e0;font-weight:bold;font-size:10px;text-transform:uppercase;padding:3px;display:flex;align-items:center;justify-content:center;border-bottom:1px solid black;width:100%}.celda-sup,.celda-orden,.celda-carrier,.celda-firma{border-right:1px solid black;border-bottom:1px solid black;padding:3px;display:flex;flex-direction:column;overflow:hidden}.fin-fila{border-right:none!important}.titulo-pagina{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:10px;font-weight:bold;padding:0 5px}.titulo-texto{font-size:18px;text-align:center;width:100%;margin-left:60px}.paginacion{font-size:12px;white-space:nowrap}.bloque-superior{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:90px 90px 60px 100px;border:1px solid black;border-bottom:none;box-sizing:border-box}.contenido-celda{padding:5px;flex-grow:1}.celda-partida{padding:0!important}.mitad-arriba{width:100%;height:55%;display:flex;flex-direction:column;align-items:center;justify-content:center;border-bottom:1px solid black;font-size:10px;text-align:center;padding:2px;box-sizing:border-box}.mitad-abajo{width:100%;height:45%;display:flex;align-items:center;justify-content:center;font-size:9px;text-align:center;padding:2px}.bloque-orden{display:grid;grid-template-columns:2.5fr 0.8fr 1fr 0.4fr 0.4fr 3fr;border-left:1px solid black;border-right:1px solid black;border-bottom:1px solid black;box-sizing:border-box}.span-2{grid-column:span 2}.span-3{grid-column:span 3}.span-all{grid-column:1 / -1}.fondo-gris-claro{background-color:#f2f2f2}.bloque-carrier{display:grid;grid-template-columns:0.5fr 0.8fr 0.5fr 0.8fr 1fr 0.4fr 4fr 1fr 0.8fr;border-left:1px solid black;border-right:1px solid black;border-bottom:1px solid black;box-sizing:border-box}.col-desc{flex-direction:column;justify-content:flex-start;text-align:center}.span-handling{grid-column:span 2}.span-package{grid-column:span 2}.span-middle{grid-column:span 3}.span-ltl{grid-column:span 2}.align-left{justify-content:flex-start;text-align:left;padding-left:5px}.bloque-legal{display:flex;justify-content:space-between;align-items:center;border-left:1px solid black;border-right:1px solid black;border-bottom:1px solid black;padding:5px 10px;font-size:10px;min-height:40px;box-sizing:border-box}.legal-izq{width:58%;text-align:justify;line-height:1.2}.legal-der{width:40%;display:flex;flex-direction:column;padding-left:10px}.underlined{border-bottom:1px solid black;display:inline-block;width:60px}.bloque-firmas{display:grid;grid-template-columns:4fr 1fr 2.5fr 2.5fr;border-left:1px solid black;border-right:1px solid black;border-bottom:1px solid black;font-size:10px;box-sizing:border-box}.span-mitad-izq{grid-column:span 2}.span-mitad-der{grid-column:span 2}.titulo-nota{background-color:white;font-weight:bold;font-size:10px;text-align:center;padding:5px;border-bottom:1px solid black}.check-item{margin-bottom:3px;display:block}
        </style>
      `;

    let totalPallets = 0;
    let totalWeight = 0;
    const itemRows = [];

    row.items.forEach((item) => {
      const actualPallets = Math.ceil(item.qty_calculated_pallets);
      const actualCases =
        actualPallets * (item.production_products?.cases_per_pallet || 1);
      const weightLbs = calculateWeightLbs(
        item.production_products,
        actualCases,
      );
      totalPallets += actualPallets;
      totalWeight += weightLbs;
      itemRows.push({
        palletQty: actualPallets,
        palletType: "Pallet",
        caseQty: actualCases,
        caseType: "Cases",
        weight: weightLbs,
        desc: item.production_products?.name || "Item",
        nmfc: "",
      });
    });

    const ITEMS_PER_PAGE = 8;
    const totalPages = Math.ceil(itemRows.length / ITEMS_PER_PAGE);
    let pagesHtml = "";

    for (let i = 0; i < totalPages; i++) {
      const pageItems = itemRows.slice(
        i * ITEMS_PER_PAGE,
        (i + 1) * ITEMS_PER_PAGE,
      );
      let rowsHtml = pageItems
        .map(
          (r) => `
            <div class="celda-carrier align-left">${r.palletQty || ""}</div>
            <div class="celda-carrier align-left">${r.palletType || ""}</div>
            <div class="celda-carrier align-left">${r.caseQty || ""}</div>
            <div class="celda-carrier align-left">${r.caseType || ""}</div>
            <div class="celda-carrier align-left">${r.weight ? Math.round(r.weight).toLocaleString() : ""}</div>
            <div class="celda-carrier"></div>
            <div class="celda-carrier align-left">${r.desc || ""}</div>
            <div class="celda-carrier">${r.nmfc || ""}</div>
            <div class="celda-carrier fin-fila"></div>
          `,
        )
        .join("");

      const pageBreak =
        i < totalPages - 1 ? 'style="page-break-after: always;"' : "";
      pagesHtml += `
            <div class="hoja" ${pageBreak}>
                <div class="titulo-pagina">
                    <div class="titulo-texto">BILL OF LADING</div>
                    <div class="paginacion">Page ${i + 1} of ${totalPages}</div>
                </div>
                <div class="bloque-superior texto-fino">
                    <div class="celda-sup" style="border-right:1px solid black; border-bottom:1px solid black;">
                        <div class="header-gris">SHIP FROM</div>
                        <div class="contenido-celda">
                            <strong>Goldmex International</strong><br>
                            Blvd. Gustavo Diaz Ordaz 2221<br>
                            Balcon las Huertas 22116 Tijuana B.C.
                        </div>
                    </div>
                    <div class="celda-sup centro" style="border-bottom:1px solid black;">
                        <strong>Bill of Lading Number:</strong><br>
                        <span style="font-size: 14px; margin-top: 5px;">${bolNumber}</span>
                    </div>
                    <div class="celda-sup" style="border-right:1px solid black; border-bottom:1px solid black;">
                        <div class="header-gris">SHIP TO</div>
                        <div class="contenido-celda">
                            <strong>${clientEmail}</strong><br>
                            ${fullAddress}
                        </div>
                    </div>
                    <div class="celda-sup" style="border-bottom:1px solid black; display:flex; flex-direction:column; justify-content:center; align-items:center;">
                        <div><strong>Trailer:</strong> ${row.transport_unit || "--"}</div>
                        <div><strong>Container:</strong> ${row.transport_plates || "--"}</div>
                        <div><strong>Seals:</strong> ${row.transport_seals || "--"}</div>
                    </div>
                    <div class="celda-sup" style="border-right:1px solid black; border-bottom:1px solid black;">
                        <div class="header-gris">THIRD PARTY FREIGHT CHARGES BILL TO</div>
                        <div class="contenido-celda"></div>
                    </div>
                    <div class="celda-sup" style="border-bottom:1px solid black;"></div>
                    <div class="celda-sup contenido-celda" style="border-right:1px solid black;">
                        <strong>Special Instructions:</strong><br>
                        ${row.notes || ""}
                    </div>
                    <div class="celda-sup celda-partida">
                        <div class="mitad-arriba">
                            <span class="negrita" style="margin-bottom: 3px;">Freight Charge Terms (Freight charges are prepaid unless marked otherwise):</span>
                            <div style="width: 100%; display: flex; justify-content: space-around; margin-top: 2px;">
                                <span>Prepaid</span><span>Collect</span><span>3rd Party</span>
                            </div>
                        </div>
                        <div class="mitad-abajo">
                            () Master bill of lading with attached underlying bills of lading.
                        </div>
                    </div>
                </div>
                <div class="bloque-orden texto-fino">
                    <div class="celda-orden span-all header-gris fin-fila">CUSTOMER ORDER INFORMATION</div>
                    <div class="celda-orden negrita centro">Customer Order No.</div>
                    <div class="celda-orden negrita centro"># of<br>Pallets</div>
                    <div class="celda-orden negrita centro">Weight</div>
                    <div class="celda-orden negrita centro span-2">Pallet/Slip<br>(circle one)</div>
                    <div class="celda-orden negrita centro fin-fila">Additional Shipper Information</div>
                    <div class="celda-orden centro" style="height: 30px;">${row.unique_order_code}</div>
                    <div class="celda-orden centro">${totalPallets}</div>
                    <div class="celda-orden centro">${Math.round(totalWeight).toLocaleString()} (LBS)</div>
                    <div class="celda-orden centro">Y</div>
                    <div class="celda-orden centro">N</div>
                    <div class="celda-orden fin-fila"></div>
                    <div class="celda-orden negrita centro">Grand Total</div>
                    <div class="celda-orden fondo-gris-claro"></div>
                    <div class="celda-orden fondo-gris-claro"></div>
                    <div class="celda-orden span-3 fondo-gris-claro fin-fila"></div> 
                </div>
                <div class="bloque-carrier texto-fino">
                    <div class="celda-carrier span-all header-gris fin-fila">CARRIER INFORMATION</div>
                    <div class="celda-carrier negrita span-handling">Handling Unit</div>
                    <div class="celda-carrier negrita span-package">Package</div>
                    <div class="celda-carrier span-middle"></div>
                    <div class="celda-carrier negrita span-ltl fin-fila">LTL Only</div>
                    <div class="celda-carrier negrita">Qty</div>
                    <div class="celda-carrier negrita">Type</div>
                    <div class="celda-carrier negrita">Qty</div>
                    <div class="celda-carrier negrita">Type</div>
                    <div class="celda-carrier negrita">Weight<br>( LBS )</div>
                    <div class="celda-carrier negrita">HM (X)</div>
                    <div class="celda-carrier col-desc negrita">
                        Commodity Description
                        <span class="texto-mini" style="font-weight: normal;">
                            Commodities requiring special or additional care or attention in handling or stowing must be so marked and packaged as to ensure safe transportation with ordinary care. See Section 2(e) of NMFC item 360
                        </span>
                    </div>
                    <div class="celda-carrier negrita">NMFC No.</div>
                    <div class="celda-carrier negrita fin-fila">Class</div>
                    ${rowsHtml}
                </div>
                <div class="bloque-legal">
                    <div class="legal-izq">
                        Where the rate is dependent on value, shippers are required to state specifically in writing the agreed
                        or declared value of the property as follows: “The agreed or declared value of the property is
                        specifically stated by the shipper to be not exceeding ________ per ________.”
                    </div>
                    <div class="legal-der">
                        <div style="margin-bottom: 5px;">
                            <strong>COD Amount: $</strong> 
                        </div>
                        <div>
                            Fee terms: Collect ( ) &nbsp; Prepaid ( ) &nbsp; Customer check acceptable ( )
                        </div>
                    </div>
                </div>
                <div class="bloque-firmas">
                    <div class="celda-firma span-all titulo-nota fin-fila">
                        Note: Liability limitation for loss or damage in this shipment may be applicable. See 49 USC § 14706(c)(1)(A) and (B).
                    </div>
                    <div class="celda-firma span-mitad-izq">
                        <p class="texto-mini" style="margin: 0; font-size: 10px; line-height: 1.25;">
                            Received, subject to individually determined rates or contracts that have been agreed upon in writing between the carrier and shipper, if applicable, otherwise to the rates, classifications, and rules that have been established by the carrier and are available to the shipper, on request, and to all applicable state and federal regulations.
                        </p>
                    </div>
                    <div class="celda-firma span-mitad-der fin-fila" style="justify-content: space-between;">
                        <div class="centro" style="padding: 5px;">
                            The carrier shall not make delivery of this shipment without payment of charges and all other lawful fees.
                        </div>
                        <div style="font-weight: bold; padding: 5px;">
                            Shipper Signature
                        </div>
                    </div>
                    <div class="celda-firma">
                        <div class="negrita" style="margin-bottom: 10px;">Shipper Signature/Date</div>
                        <p class="texto-mini" style="font-size: 10px; line-height: 1.2;">
                            This is to certify that the above named materials are properly classified, packaged, marked, and labeled, and are in proper condition for transportation according to the applicable regulations of the DOT.
                        </p>
                    </div>
                    <div class="celda-firma">
                        <div class="negrita centro">Trailer Loaded:</div>
                        <div style="margin-top: 5px;">
                            <span class="check-item">() By shipper</span>
                            <span class="check-item">() By driver</span>
                        </div>
                    </div>
                    <div class="celda-firma">
                        <div class="negrita centro">Freight Counted:</div>
                        <div style="margin-top: 5px;">
                            <span class="check-item">() By shipper</span>
                            <span class="check-item">() By driver/pallets said to contain</span>
                            <span class="check-item">() By driver/pieces</span>
                        </div>
                    </div>
                    <div class="celda-firma fin-fila">
                        <div class="negrita" style="margin-bottom: 5px;">Carrier Signature/Pickup Date</div>
                        <div style="color: #999; font-size: 10px; margin-bottom: 5px;">${todayDate}</div>
                        <p class="texto-mini">
                            Carrier acknowledges receipt of packages and required placards. Carrier certifies emergency response information was made available and/or carrier has the DOT emergency response guidebook or equivalent documentation in the vehicle. <strong>Property described above is received in good order, except as noted.</strong>
                        </p>
                    </div>
                </div>
            </div>
          `;
    }
    return styles + pagesHtml;
  }

  function downloadBolPdf(row) {
    const element = document.getElementById("ord-bol-render-container");
    const opt = {
      margin: 0,
      filename: `BOL-${row.unique_order_code}.pdf`,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        logging: false,
        letterRendering: true,
      },
      jsPDF: { unit: "in", format: "letter", orientation: "portrait" },
    };
    html2pdf().set(opt).from(element).save();
  }

  function renderActiveTable(data) {
    // [MODIFIED] More robust check using the DOM element reference to avoid variable stale state
    if ($.fn.DataTable.isDataTable(tableActiveEl)) {
      // Retrieve the instance directly from the element instead of the variable
      const dt = $(tableActiveEl).DataTable();
      dt.clear().rows.add(data).draw(false);
      activeOrdersTable = dt;
    } else {
      activeOrdersTable = $(tableActiveEl).DataTable({
        destroy: true, // [MODIFIED] Forces cleanup of any existing table structure to prevent header duplication
        data: data,
        dom: '<"ord-dt-header"lf>rt<"ord-dt-footer"ip>',
        scrollY: "50vh",
        scrollCollapse: true,
        responsive: false,
        paging: true,
        pageLength: 10,
        columns: [
          {
            title: "Order #",
            data: "unique_order_code",
            render: (d) =>
              `<span style="font-weight:700; color:var(--goldmex-primary-color)">${d}</span>`,
          },
          {
            title: "Product",
            data: null,
            render: (row) =>
              row.is_multi
                ? `<span class="text-link-action" onclick="window.viewOrderItemsList('${row.unique_order_code}')"><i class='bx bx-layer'></i> Multi-Item Order (${row.items.length})</span>`
                : row.production_products.name || "Unknown",
          },
          {
            title: "Request (Total)",
            data: null,
            render: (row) =>
              `<div><strong>${parseFloat(row.total_pallets).toFixed(1)} Pallets</strong><br><small style="color:var(--goldmex-primary-color); font-weight:600;">${Math.round(row.total_weight_lbs).toLocaleString()} Lbs</small></div>`,
          },
          {
            title: "Date",
            data: "requested_delivery_date",
            render: (d) => formatStringDate(d),
          },
          {
            title: "Status",
            data: "status",
            render: (status) =>
              `<span class="ord-status-badge status-${status}">${status}</span>`,
          },
          {
            title: "Docs / Evidence",
            data: null,
            className: "dt-center",
            render: (row) => {
              if (
                row.status === "shipped" ||
                row.status === "completed" ||
                row.status === "archived"
              ) {
                const rowStr = encodeURIComponent(JSON.stringify(row));
                return `<div class="ord-actions-flex"><button class="btn-view-docs" onclick="window.ordViewDocs('${rowStr}')" title="View BOL Document"><i class='bx bxs-file-pdf'></i> Docs</button><button class="btn-view-evidence" onclick="window.ordViewEvidence('${rowStr}')" title="View Evidence Photos"><i class='bx bxs-camera'></i> Photos</button></div>`;
              }
              if (row.attachment_url)
                return `<i class='bx bx-file' style="color:#666"></i>`;
              return "-";
            },
          },
          {
            title: "Urgent",
            data: null,
            className: "dt-center",
            render: (row) =>
              row.is_expedited
                ? `<i class='bx bxs-hot' style="color:#ef4444"></i>`
                : row.status === "pending"
                  ? `<button class="btn-expedite" onclick="window.ordExpedite('${row.id}')"><i class='bx bxs-zap'></i></button>`
                  : "-",
          },
          {
            title: "Actions",
            data: null,
            className: "dt-center",
            render: (row) => {
              const rowStr = encodeURIComponent(JSON.stringify(row));
              let btns = `<div class="ord-actions-flex"><button class="btn-action-icon btn-action-view" onclick="window.ordView('${rowStr}')"><i class='bx bx-show'></i></button>`;
              if (row.status === "pending") {
                btns += `<button class="btn-action-icon btn-action-edit" onclick="window.ordEdit('${row.id}')"><i class='bx bx-pencil'></i></button><button class="btn-action-icon btn-action-cancel" onclick="window.ordCancel('${row.id}')"><i class='bx bx-x'></i></button>`;
              } else {
                btns += `<button class="btn-action-icon disabled"><i class='bx bx-pencil'></i></button><button class="btn-action-icon disabled"><i class='bx bx-x'></i></button>`;
              }
              if (row.status === "shipped" || row.status === "completed")
                btns += `<button class="btn-action-icon btn-action-archive" onclick="window.ordArchive('${row.id}')"><i class='bx bx-check'></i></button>`;
              btns += `</div>`;
              return btns;
            },
          },
        ],
        order: [[3, "asc"]],
      });
    }
  }

  function renderHistoryTable(data) {
    // [MODIFIED] Added destroy: true and safer instance check
    if ($.fn.DataTable.isDataTable(tableHistoryEl)) {
      const dt = $(tableHistoryEl).DataTable();
      dt.clear().rows.add(data).draw(false);
      historyOrdersTable = dt;
    } else {
      historyOrdersTable = $(tableHistoryEl).DataTable({
        destroy: true, // [MODIFIED] Prevents duplication if re-initialized
        data: data,
        dom: '<"ord-dt-header"lf>rt<"ord-dt-footer"ip>',
        scrollY: "50vh",
        scrollCollapse: true,
        responsive: false,
        paging: true,
        pageLength: 20,
        columns: [
          { title: "Order #", data: "unique_order_code" },
          {
            title: "Date",
            data: "requested_delivery_date",
            render: (d) => formatStringDate(d),
          },
          {
            title: "Product",
            data: null,
            render: (row) =>
              row.is_multi
                ? `Multi (${row.items.length})`
                : row.production_products.name,
          },
          {
            title: "Status",
            data: "status",
            render: (d) =>
              `<span class="ord-status-badge status-${d}">${d}</span>`,
          },
          {
            title: "Docs / Evidence",
            data: null,
            className: "dt-center",
            render: (row) => {
              const rowStr = encodeURIComponent(JSON.stringify(row));
              return `
                  <div class="ord-actions-flex">
                      <button class="btn-view-docs" onclick="window.ordViewDocs('${rowStr}')" title="View BOL Document">
                          <i class='bx bxs-file-pdf'></i> Docs
                      </button>
                      <button class="btn-view-evidence" onclick="window.ordViewEvidence('${rowStr}')" title="View Evidence Photos">
                          <i class='bx bxs-camera'></i> Photos
                      </button>
                  </div>
              `;
            },
          },
          {
            title: "Actions",
            data: null,
            render: (row) =>
              `<button class="btn-action-icon btn-action-view" onclick="window.ordView('${encodeURIComponent(JSON.stringify(row))}')"><i class='bx bx-show'></i></button>`,
          },
        ],
      });
    }
  }

  function openModal(modal) {
    modal.classList.add("open");
  }
  function closeModal(modal) {
    modal.classList.remove("open");
  }

  function setupEventListeners() {
    btnNewOrder.onclick = () => {
      resetNewOrderForm();
      openModal(newOrderModal);
    };
    closeNewOrderBtn.onclick = () => closeModal(newOrderModal);
    cancelNewOrderBtn.onclick = () => closeModal(newOrderModal);
    submitOrderBtn.onclick = handleSubmitOrder;

    btnOpenSelector.onclick = () => {
      productSearchInput.value = "";
      openModal(productSelectorModal);
      setTimeout(() => productSearchInput.focus(), 100);
    };
    closeSelectorBtn.onclick = () => closeModal(productSelectorModal);
    productSearchInput.oninput = (e) => {
      const term = e.target.value.toLowerCase();
      productGridContainer
        .querySelectorAll(".ord-prod-card")
        .forEach(
          (c) =>
          (c.style.display = c.innerText.toLowerCase().includes(term)
            ? "block"
            : "none"),
        );
    };

    closeItemConfigBtn.onclick = () => closeModal(itemConfigModal);
    if (cancelItemConfigBtn) {
      cancelItemConfigBtn.onclick = () => closeModal(itemConfigModal);
    }

    confirmAddItemBtn.onclick = handleAddItemToDraft;
    confItemQty.oninput = calculateConfigConversion;
    confItemUnit.onchange = calculateConfigConversion;

    btnHistory.onclick = () => {
      openModal(historyModal);
      loadHistory();
    };
    if (document.getElementById("closeHistoryModal"))
      document.getElementById("closeHistoryModal").onclick = () =>
        closeModal(historyModal);
    btnFilterHistory.onclick = loadHistory;

    closeViewOrderBtn.onclick = () => closeModal(viewOrderModal);
    if (btnCloseViewFooter)
      btnCloseViewFooter.onclick = () => closeModal(viewOrderModal);
    btnRefresh.onclick = loadActiveOrders;

    if (closeEvidenceBtn)
      closeEvidenceBtn.onclick = () => closeModal(evidenceModal);
    if (btnCloseBolPreview)
      btnCloseBolPreview.onclick = () => closeModal(bolPreviewModal);
    if (closeImageViewerBtn)
      closeImageViewerBtn.onclick = () => closeModal(imageViewerModal);
    if (btnBolModalClose)
      btnBolModalClose.onclick = () => closeModal(bolPreviewModal);

    // [MODIFIED] Explicitly remove any existing listener before adding a new one
    // This prevents the "stacking" of visibility events if the script is reloaded
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    document.addEventListener("visibilitychange", handleVisibilityChange);
  }

  init();
})();