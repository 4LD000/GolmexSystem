// js/service-tracking.js
(() => {
  // SECTION 1: INITIALIZATION AND CONFIGURATION
  if (typeof supabase === "undefined" || !supabase) {
    console.error("Supabase client is not available in service-tracking.js.");
    const stContainer = document.querySelector(".service-tracking-container");
    if (stContainer) {
      stContainer.innerHTML = `<div style="padding: 2rem; text-align: center;"><h2>Module Error</h2><p style="color: var(--goldmex-accent-color);">Cannot connect to the database.</p><p>Please ensure you are logged in or try refreshing. If issues persist, contact support.</p></div>`;
    }
    return;
  }

  const documentCategories = {
    "Shipping & Transport Documents": [
      "Bill of Lading (B/L) – Master and House B/L",
      "Sea Waybill",
      "Booking Confirmation",
      "Shipping Instructions",
      "Arrival Notice",
      "Container Load Plan (CLP)",
      "Freight Invoice / Charges Sheet",
    ],
    "Customs Documentation": [
      "Commercial Invoice",
      "Packing List",
      "Certificate of Origin",
      "Customs Entry / Declaration Forms",
      "Import/Export Licenses",
      "HS Classification Documentation",
      "Customs Release/Disposition Notices",
    ],
    "Regulatory and Compliance Documents": [
      "Dangerous Goods Declaration (DGD)",
      "Material Safety Data Sheet (MSDS)",
      "Fumigation Certificate",
      "Inspection Certificates",
      "ISF Filing Confirmation",
      "AMS/ACI/ENS Filing Confirmations",
    ],
    "Trade & Financial Documents": [
      "Letter of Credit (if applicable)",
      "Payment Receipts",
      "Proof of Delivery (POD)",
      "Purchase Order",
      "Sales Contract",
    ],
    "Internal & Client-Specific Docs": [
      "Client Instructions",
      "Internal Notes or Checklists",
      "Email Correspondence",
      "Service Level Agreements (SLAs)",
    ],
  };

  const SERVICE_CHARGES_MAP = {
    ocean: [
      "Ocean Freight",
      "ISF (Importer Security Filing)",
      "THC (Terminal Handling Charges)",
      "BL Fee (Bill of Lading Fee)",
      "Devanning / Unstuffing",
      "Customs Inspection Fee",
      "Port Handling",
      "Local Transport (Port Drayage)",
      "Warehouse Storage (Port/CFS)",
      "Detention / Demurrage",
      "Cargo Insurance",
      "Customs Brokerage",
      "Duties & Taxes",
      "Administrative Fee",
      "Container Cleaning",
      "Endorsement Fee",
      "VGM (Verified Gross Mass) Fee",
      "Documentation Fee",
      "Port Congestion Surcharge",
    ],
    air: [
      "Air Freight",
      "AWB Fee (Air Waybill Fee)",
      "Airport THC (Terminal Handling Charges)",
      "Airline Handling",
      "Customs Inspection Fee (Airport)",
      "Airport Handling",
      "Local Transport (Airport Pickup/Delivery)",
      "Warehouse Storage (Airport)",
      "Cargo Insurance",
      "Customs Brokerage",
      "Duties & Taxes",
      "Airline Fees (Misc)",
      "Administrative Fee",
      "Dangerous Goods (DG) Fee",
      "Fuel Surcharge",
      "Security Surcharge",
      "Screening Fee",
    ],
    truck: [
      "Trucking Freight (FTL/LTL)",
      "Loading / Unloading Fee",
      "Inland Cargo Insurance",
      "Escort / Security Fee",
      "Layover / Waiting Time",
      "Border Crossing Fee",
      "Special Permits",
      "Customs Brokerage (Border)",
      "Tolls",
      "Warehouse Storage (Origin/Destination)",
      "Forklift Charges",
      "Palletizing / Shrink-wrapping",
      "Fuel Surcharge (Trucking)",
      "Lift Gate Service",
    ],
    currencies: ["USD", "MXN"],
    defaultCurrency: "USD",
  };
  let cleanupServiceModule;
  let currentServiceIdForDocs = null;
  const COMPLETED_STATUSES = ["Completed", "Delivered"];
  const CANCELLED_STATUS = "Cancelled";
  const IN_PROGRESS_STATUSES = [
    "Pending",
    "Booked",
    "In Transit",
    "At Destination",
    "On Hold",
  ];
  const SERVICE_TABLES = {
    ocean: "ServiceOcean",
    air: "ServiceAir",
    truck: "ServiceTruck",
  };
  const INVOICES_TABLE_NAME = "invoices";
  const BUCKET_NAME = "DocsTracking";

  const TIJUANA_UTC_OFFSET = -7; // Tijuana is UTC-7 during PDT (most of the year)
  const OPERATING_HOUR_START_TIJUANA = 8; // 8 AM Tijuana time
  const OPERATING_HOUR_END_TIJUANA = 17; // 5 PM Tijuana time (exclusive)
  const NOTIFICATION_TIMES_TIJUANA = [9, 13, 16]; // 9 AM, 1 PM, 4 PM Tijuana time
  let scheduledNotificationTimeouts = [];

  let highestZIndexST = 1050; // Base z-index for ST modals

  // DOM Element Selectors (cached for performance)
  const openServiceModalBtn = document.getElementById("openServiceModalBtn");
  const createServiceModal = document.getElementById("serviceModal");
  const closeCreateServiceModalBtn = document.getElementById(
    "closeServiceModalBtn"
  );
  const cancelCreateServiceBtn = document.getElementById("cancelServiceBtn");
  const newServiceForm = document.getElementById("newServiceForm");
  const serviceCategoryModalSelect = document.getElementById(
    "serviceCategoryModal"
  );
  const oceanFieldsModal = document.getElementById("oceanFieldsModal");
  const airFieldsModal = document.getElementById("airFieldsModal");
  const truckFieldsModal = document.getElementById("truckFieldsModal");
  const isfFileInputModal = document.getElementById("isfFileModal");
  const addIsfLaterCheckboxModal = document.getElementById("addIsfLaterModal");
  const isfErrorModal = document.getElementById("isfErrorModal");
  const isfRequiredIndicatorModal = document.getElementById(
    "isfRequiredIndicatorModal"
  );
  const flightNumberGroupModal = document.getElementById(
    "flightNumberGroupModal"
  );
  const hblHawbGroupModal = document.getElementById("hblHawbGroupModal");
  const containerFieldsModal = document.getElementById("containerFieldsModal");
  const dimensionsCbmGroupModal = document.getElementById(
    "dimensionsCbmGroupModal"
  );
  const viewServiceModal = document.getElementById("viewServiceModal");
  const viewServiceTypeBadge = document.getElementById("viewServiceTypeBadge");
  const viewServiceId = document.getElementById("viewServiceId");
  const viewCustomer = document.getElementById("viewCustomer");
  const viewEtd = document.getElementById("viewEtd");
  const viewEta = document.getElementById("viewEta");
  const viewShipper = document.getElementById("viewShipper");
  const viewConsignee = document.getElementById("viewConsignee");
  const viewCarrier = document.getElementById("viewCarrier");
  const viewFlightNumber = document.getElementById("viewFlightNumber");
  const viewPol = document.getElementById("viewPol");
  const viewPod = document.getElementById("viewPod");
  const viewFinalDestination = document.getElementById("viewFinalDestination");
  const viewMblHawbPro = document.getElementById("viewMblHawbPro");
  const viewOceanSpecificDetails = document.getElementById(
    "viewOceanSpecificDetails"
  );
  const viewAirSpecificDetails = document.getElementById(
    "viewAirSpecificDetails"
  );
  const viewHblOcean = document.getElementById("viewHblOcean");
  const viewHblAir = document.getElementById("viewHblAir"); // Assuming this is for HAWB in air view
  const viewOceanServiceType = document.getElementById("viewOceanServiceType");
  const viewOceanService = document.getElementById("viewOceanService");
  const viewContainerNumber = document.getElementById("viewContainerNumber");
  const viewContainerType = document.getElementById("viewContainerType");
  const viewSealNumber = document.getElementById("viewSealNumber");
  const viewTruckSpecificDetails = document.getElementById(
    "viewTruckSpecificDetails"
  );
  const viewTruckServiceType = document.getElementById("viewTruckServiceType");
  const viewDimensionsAir = document.getElementById("viewDimensionsAir");
  const viewDimensionsTruck = document.getElementById("viewDimensionsTruck");
  const viewCbm = document.getElementById("viewCbm");
  const viewNumPackages = document.getElementById("viewNumPackages");
  const viewGrossWeight = document.getElementById("viewGrossWeight");
  const viewCommodityDescription = document.getElementById(
    "viewCommodityDescription"
  );
  const viewHtsCode = document.getElementById("viewHtsCode");
  const viewServiceStatus = document.getElementById("viewServiceStatus");
  const viewServiceNotes = document.getElementById("viewServiceNotes");
  const closeViewServiceModalBtn = document.getElementById(
    "closeViewServiceModalBtn"
  );
  const closeViewModalFooterBtn = document.getElementById(
    "closeViewModalFooterBtn"
  );
  const editServiceModal = document.getElementById("editServiceModal");
  const editServiceForm = document.getElementById("editServiceForm");
  const editServiceIdInput = document.getElementById("editServiceId");
  const editServiceDisplayIdHeader = document.getElementById(
    "editServiceDisplayIdHeader"
  );
  const editServiceCategoryModalSelect = document.getElementById(
    "editServiceCategoryModal"
  );
  const closeEditServiceModalBtn = document.getElementById(
    "closeEditServiceModalBtn"
  );
  const cancelEditServiceBtn = document.getElementById("cancelEditServiceBtn");
  const editOceanFieldsModal = document.getElementById("editOceanFieldsModal");
  const editAirFieldsModal = document.getElementById("editAirFieldsModal");
  const editTruckFieldsModal = document.getElementById("editTruckFieldsModal");
  const editOceanServiceTypeModalSelect = document.getElementById(
    "editOceanServiceTypeModal"
  );
  const editOceanServiceModalSelect = document.getElementById(
    "editOceanServiceModal"
  );
  const editIsfFileModalInput = document.getElementById("editIsfFileModal");
  const currentIsfFileDisplay = document.getElementById("currentIsfFile");
  const editAddIsfLaterModalCheckbox = document.getElementById(
    "editAddIsfLaterModal"
  );
  const editIsfErrorModal = document.getElementById("editIsfErrorModal");
  const editIsfRequiredIndicatorModal = document.getElementById(
    "editIsfRequiredIndicatorModal"
  );
  const editTruckServiceTypeModalSelect = document.getElementById(
    "editTruckServiceTypeModal"
  );
  const editCustomerModalInput = document.getElementById("editCustomerModal");
  const editEtdModalInput = document.getElementById("editEtdModal");
  const editEtaModalInput = document.getElementById("editEtaModal");
  const editShipperModalInput = document.getElementById("editShipperModal");
  const editConsigneeModalInput = document.getElementById("editConsigneeModal");
  const editCarrierModalInput = document.getElementById("editCarrierModal");
  const editFlightNumberGroupModal = document.getElementById(
    "editFlightNumberGroupModal"
  );
  const editFlightNumberModalInput = document.getElementById(
    "editFlightNumberModal"
  );
  const editPolModalInput = document.getElementById("editPolModal");
  const editPodModalInput = document.getElementById("editPodModal");
  const editFinalDestinationModalInput = document.getElementById(
    "editFinalDestinationModal"
  );
  const editMblHawbModalInput = document.getElementById("editMblHawbModal");
  const editHblHawbGroupModal = document.getElementById(
    "editHblHawbGroupModal"
  );
  const editHblModalInput = document.getElementById("editHblModal"); // Used for both Ocean HBL and Air HAWB
  const editContainerFieldsModal = document.getElementById(
    "editContainerFieldsModal"
  );
  const editContainerNumberModalInput = document.getElementById(
    "editContainerNumberModal"
  );
  const editContainerTypeModalInput = document.getElementById(
    "editContainerTypeModal"
  );
  const editSealNumberModalInput = document.getElementById(
    "editSealNumberModal"
  );
  const editNumPackagesModalInput = document.getElementById(
    "editNumPackagesModal"
  );
  const editGrossWeightModalInput = document.getElementById(
    "editGrossWeightModal"
  );
  const editDimensionsCbmGroupModal = document.getElementById(
    "editDimensionsCbmGroupModal"
  );
  const editDimensionsModalInput = document.getElementById(
    "editDimensionsModal"
  );
  const editCbmModalInput = document.getElementById("editCbmModal");
  const editCommodityDescriptionModalTextarea = document.getElementById(
    "editCommodityDescriptionModal"
  );
  const editHtsCodeModalInput = document.getElementById("editHtsCodeModal");
  const editServiceStatusModalSelect = document.getElementById(
    "editServiceStatusModal"
  );
  const editServiceNotesModalTextarea = document.getElementById(
    "editServiceNotesModal"
  );
  const tableViewTypeSelect = document.getElementById("tableViewType");
  const servicesTableHtmlElement = document.getElementById("servicesTable");
  let servicesDataTable; // Instance of the main DataTable
  let allServicesData = []; // Holds all fetched and transformed service data
  let confirmModalElement,
    confirmTitleElement,
    confirmMessageElement,
    confirmOkBtn,
    confirmCancelBtn,
    confirmCloseBtn;
  let currentConfirmCallback = null;
  const docManagementModal = document.getElementById("documentManagementModal");
  const docModalServiceIdSpan = document.getElementById("docModalServiceId");
  const closeDocModalBtn = document.getElementById("closeDocModalBtn");
  const docCategorySelect = document.getElementById("docCategorySelect");
  const docTypeSelect = document.getElementById("docTypeSelect");
  const docFileInput = document.getElementById("docFileInput");
  const uploadDocBtn = document.getElementById("uploadDocBtn");
  const docListContainer = document.getElementById("docListContainer");
  const noDocsMessage = document.getElementById("noDocsMessage");
  const closeDocModalFooterBtn = document.getElementById(
    "closeDocModalFooterBtn"
  );
  const dbTotalServicesEl = document.getElementById("db-total-services");
  const dbOceanServicesEl = document.getElementById("db-ocean-services");
  const dbAirServicesEl = document.getElementById("db-air-services");
  const dbTruckServicesEl = document.getElementById("db-truck-services");
  const dbCompletedServicesEl = document.getElementById(
    "db-completed-services"
  );
  const dbInProgressServicesEl = document.getElementById(
    "db-inprogress-services"
  );
  const dbUpcomingListEl = document.getElementById("db-upcoming-list");
  const openArchiveModalBtn = document.getElementById("openArchiveModalBtn");
  const archiveServiceModal = document.getElementById("archiveServiceModal");
  const closeArchiveServiceModalBtn = document.getElementById(
    "closeArchiveServiceModalBtn"
  );
  const archiveMonthSelect = document.getElementById("archiveMonthSelect");
  const archiveYearSelect = document.getElementById("archiveYearSelect");
  const archiveServiceTypeSelect = document.getElementById(
    "archiveServiceTypeSelect"
  );
  const filterArchiveBtn = document.getElementById("filterArchiveBtn");
  const archiveTotalResultsEl = document.getElementById("archiveTotalResults");
  const archiveServicesTableHtmlElement = document.getElementById(
    "archiveServicesTable"
  );
  const noArchiveResultsMessageEl = document.getElementById(
    "noArchiveResultsMessage"
  );
  const closeArchiveModalFooterBtn = document.getElementById(
    "closeArchiveModalFooterBtn"
  );
  let archiveServicesDataTable; // Instance of the archive DataTable
  let archiveYearsPopulated = false;
  const progressNotificationModal = document.getElementById(
    "progressNotificationModal"
  );
  const closeProgressNotificationModalBtn = document.getElementById(
    "closeProgressNotificationModalBtn"
  );
  const closeProgressNotificationFooterBtn = document.getElementById(
    "closeProgressNotificationFooterBtn"
  );
  const progressNotificationTableBody = document.getElementById(
    "progressNotificationTableBody"
  );
  const noProgressServicesMessage = document.getElementById(
    "noProgressServicesMessage"
  );
  const openProgressNotificationModalBtnManual = document.getElementById(
    "openProgressNotificationModalBtnManual"
  );
  const chargesContainerCreate = document.getElementById(
    "chargesContainerModal_create"
  );
  const addChargeBtnCreate = document.getElementById("addChargeBtn_create");
  const chargesContainerEdit = document.getElementById(
    "chargesContainerModal_edit"
  );
  const addChargeBtnEdit = document.getElementById("addChargeBtn_edit");
  const viewServiceChargesContainer = document.getElementById(
    "viewServiceChargesContainer"
  );
  const viewNoChargesMessage = document.getElementById("viewNoChargesMessage");

  // --- State variables for Service Tracking module ---
  let currentUserST = null; // Holds the Supabase user object for this module
  let isServiceTrackingInitialized = false;
  let isSubscribingST = false; // Flag to prevent concurrent subscription operations
  let serviceChannels = []; // Array to keep track of active Supabase Realtime channel subscriptions

  // SECTION 2: UTILITY FUNCTIONS
  function isWithinOperatingHours() {
    const now = new Date();
    const currentUTCHour = now.getUTCHours();
    let tijuanaHour = currentUTCHour + TIJUANA_UTC_OFFSET;
    if (tijuanaHour < 0) tijuanaHour += 24;
    else if (tijuanaHour >= 24) tijuanaHour -= 24;
    return (
      tijuanaHour >= OPERATING_HOUR_START_TIJUANA &&
      tijuanaHour < OPERATING_HOUR_END_TIJUANA
    );
  }
  function getCategoryTextAndClass(category) {
    switch (category) {
      case "ocean":
        return {
          text: "🌊 Ocean",
          class: "service-type-ocean",
          rowClass: "row-type-ocean",
          prefix: "OCN",
        };
      case "air":
        return {
          text: "✈️ Air",
          class: "service-type-air",
          rowClass: "row-type-air",
          prefix: "AIR",
        };
      case "truck":
        return {
          text: "🚚 Truck",
          class: "service-type-truck",
          rowClass: "row-type-truck",
          prefix: "TRK",
        };
      default:
        return { text: "N/A", class: "", rowClass: "", prefix: "SRV" };
    }
  }
  function getFileIconClass(fileName) {
    if (!fileName) return "bxs-file-blank";
    const extension = fileName.split(".").pop().toLowerCase();
    switch (extension) {
      case "pdf":
        return "bxs-file-pdf";
      case "doc":
      case "docx":
        return "bxs-file-doc";
      case "xls":
      case "xlsx":
      case "csv":
        return "bxs-spreadsheet";
      case "jpg":
      case "jpeg":
      case "png":
      case "gif":
        return "bxs-file-image";
      case "txt":
        return "bxs-file-txt";
      default:
        return "bxs-file-blank";
    }
  }
  function showCustomNotification(message, type = "info", duration = 3800) {
    const existingNotifications = document.querySelectorAll(
      ".custom-notification-st"
    );
    existingNotifications.forEach((notif) => notif.remove()); // Remove old notifications of this type
    const notification = document.createElement("div");
    notification.className = `custom-notification-st ${type}`;
    let iconClass = "bx bx-info-circle";
    if (type === "success") iconClass = "bx bx-check-circle";
    else if (type === "error") iconClass = "bx bx-x-circle";
    else if (type === "warning") iconClass = "bx bx-error-circle";
    notification.innerHTML = `<i class='${iconClass}'></i><span>${message}</span><button class='custom-notification-st-close'>&times;</button>`;
    const notificationContainer =
      document.getElementById("customNotificationContainerST") ||
      createNotificationContainer();
    notificationContainer.appendChild(notification);
    notificationContainer.style.display = "block"; // Ensure container is visible
    void notification.offsetWidth; // Trigger reflow for animation
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
          if (notificationContainer.childElementCount === 0)
            notificationContainer.style.display = "none";
        }, 400); // Match CSS animation duration
      }
    };
    closeButton.addEventListener("click", removeNotification);
    if (duration > 0) setTimeout(removeNotification, duration);
  }
  function createNotificationContainer() {
    let container = document.getElementById("customNotificationContainerST");
    if (!container) {
      container = document.createElement("div");
      container.id = "customNotificationContainerST";
      container.className = "custom-notification-st-container";
      document.body.appendChild(container);
    }
    return container;
  }
  function getConfirmModalElements() {
    if (confirmModalElement) return true; // Already initialized
    confirmModalElement = document.getElementById("stCustomConfirmModal");
    confirmTitleElement = document.getElementById("stCustomConfirmTitle");
    confirmMessageElement = document.getElementById("stCustomConfirmMessage");
    confirmOkBtn = document.getElementById("stCustomConfirmOkBtn");
    confirmCancelBtn = document.getElementById("stCustomConfirmCancelBtn");
    confirmCloseBtn = document.getElementById("stCustomConfirmCloseBtn");
    if (
      !confirmModalElement ||
      !confirmTitleElement ||
      !confirmMessageElement ||
      !confirmOkBtn ||
      !confirmCancelBtn ||
      !confirmCloseBtn
    ) {
      console.error(
        "ST Module: One or more custom confirm modal elements are missing from the DOM."
      );
      return false;
    }
    confirmOkBtn.addEventListener("click", () => {
      if (typeof currentConfirmCallback === "function")
        currentConfirmCallback();
      hideCustomConfirmModal();
    });
    confirmCancelBtn.addEventListener("click", hideCustomConfirmModal);
    confirmCloseBtn.addEventListener("click", hideCustomConfirmModal);
    return true;
  }
  function showCustomConfirm(title, message, onOkCallback) {
    if (!getConfirmModalElements()) {
      // Fallback to browser confirm if custom modal elements are not found
      console.warn(
        "ST Module: Custom confirm modal elements not found, falling back to window.confirm."
      );
      if (window.confirm(message.replace(/<strong>|<\/strong>/g, ""))) {
        // Strip HTML for basic confirm
        if (typeof onOkCallback === "function") onOkCallback();
      }
      return;
    }
    confirmTitleElement.textContent = title;
    confirmMessageElement.innerHTML = message; // Allows HTML in message
    currentConfirmCallback = onOkCallback;
    openModal(confirmModalElement);
  }
  function hideCustomConfirmModal() {
    if (!confirmModalElement) return;
    closeModal(confirmModalElement);
    currentConfirmCallback = null;
  }
  function openModal(modalElement) {
    if (!modalElement) {
      console.warn("openModal: modalElement is null");
      return;
    }
    highestZIndexST++;
    modalElement.style.zIndex = highestZIndexST;
    modalElement.style.display = "none"; // Ensure it's hidden before animation starts
    void modalElement.offsetHeight; // Trigger reflow
    modalElement.style.display = "flex"; // Set display to flex to enable centering
    setTimeout(() => {
      // Delay adding class to ensure transition works
      modalElement.classList.add("st-modal-open");
      document.body.style.overflow = "hidden"; // Prevent background scrolling
    }, 10); // Small delay
  }
  function closeModal(modalElement, formToReset = null) {
    if (!modalElement) {
      console.warn("closeModal: modalElement is null");
      return;
    }
    modalElement.classList.remove("st-modal-open");
    setTimeout(() => {
      modalElement.style.display = "none";
      // Check if any other ST modal is still open before restoring body overflow
      const anyOtherSTModalOpen = Array.from(
        document.querySelectorAll(".st-modal.st-modal-open")
      ).some((m) => m !== modalElement && m.style.display !== "none"); // Check active display too
      if (!anyOtherSTModalOpen) {
        document.body.style.overflow = ""; // Restore background scrolling
        highestZIndexST = 1050; // Reset z-index counter if all ST modals are closed
      }
      if (formToReset && typeof formToReset.reset === "function")
        formToReset.reset();
      if (formToReset === newServiceForm) {
        resetCreateFormSpecifics();
        if (chargesContainerCreate) chargesContainerCreate.innerHTML = ""; // Clear charges
      } else if (formToReset === editServiceForm) {
        resetEditFormSpecifics();
        if (chargesContainerEdit) chargesContainerEdit.innerHTML = ""; // Clear charges
      } else if (modalElement === docManagementModal) resetDocUploadForm();
    }, 300); // Match CSS transition duration
  }

  // SECTION 3: DATA HANDLING AND TRANSFORMATION
  async function generateNextServiceDisplayId(category) {
    const categoryInfo = getCategoryTextAndClass(category);
    const tableName = SERVICE_TABLES[category];
    if (!tableName)
      throw new Error(
        `Invalid service category for ID generation: ${category}`
      );
    // Count existing services for this category
    const { count, error } = await supabase
      .from(tableName)
      .select("*", { count: "exact", head: true }); // head:true makes it faster

    if (error) {
      console.error(`Error counting all services for ${category}:`, error);
      return `${categoryInfo.prefix}-ERR-${Date.now().toString().slice(-3)}`; // Fallback ID
    }
    const nextNumber = (count || 0) + 1;
    return `${categoryInfo.prefix}-${String(nextNumber).padStart(3, "0")}`;
  }
  async function generateNextInvoiceNumber() {
    const now = new Date();
    const year = String(now.getFullYear()).slice(-2); // Last two digits of year
    const month = String(now.getMonth() + 1).padStart(2, "0"); // Month (01-12)
    const prefix = `GMX${year}${month}-`;

    // Find the last invoice number for the current month and year
    const { data: lastInvoice, error: queryError } = await supabase
      .from(INVOICES_TABLE_NAME)
      .select("invoice_number")
      .like("invoice_number", `${prefix}%`) // Filter by "GMXYYMM-"
      .order("invoice_number", { ascending: false }) // Get the highest one
      .limit(1)
      .single(); // Expect one or none

    if (queryError && queryError.code !== "PGRST116") {
      // PGRST116 means no rows found, which is fine
      console.error("Error fetching last invoice number:", queryError);
      return `${prefix}${Math.floor(Math.random() * 10000)
        .toString()
        .padStart(4, "0")}-ERR`; // Fallback
    }

    let nextSequence = 1;
    if (lastInvoice && lastInvoice.invoice_number) {
      const lastSequenceStr = lastInvoice.invoice_number.split("-").pop();
      const lastSequenceNum = parseInt(lastSequenceStr, 10);
      if (!isNaN(lastSequenceNum)) {
        nextSequence = lastSequenceNum + 1;
      }
    }
    return `${prefix}${String(nextSequence).padStart(4, "0")}`;
  }
  function transformServiceDataForUI(row, categoryInternal) {
    const categoryInfo = getCategoryTextAndClass(categoryInternal);
    const transformed = {
      // Common fields
      id: row.id, // PK
      service_display_id:
        row.service_display_id || row.id.substring(0, 8) + "...", // User-facing ID
      user_id: row.user_id, // Creator's user ID
      user_email: row.user_email || "N/A", // Creator's email
      created_at: row.created_at,
      updated_at: row.updated_at,
      serviceCategoryInternal: categoryInternal, // e.g., "ocean", "air"
      serviceCategoryIcon: `<span class="${categoryInfo.class}">${categoryInfo.text}</span>`, // HTML for icon
      customer: row.customer || "N/A",
      etd: row.etd || "N/A",
      eta: row.eta || "N/A",
      shipper: row.shipper || "N/A",
      consignee: row.consignee || "N/A",
      carrier: row.carrier || "N/A",
      pol: row.pol || "N/A", // Port/Point of Loading
      pod: row.pod || "N/A", // Port/Point of Discharge
      finalDestination: row.final_destination || "N/A",
      mblHawbPro: row.mbl_hawb_pro || "N/A", // Master Bill of Lading / Master Air Waybill / PRO Number
      numPackages: row.num_packages !== null ? row.num_packages : "N/A",
      grossWeight: row.gross_weight !== null ? `${row.gross_weight} kg` : "N/A",
      commodityDescription: row.commodity_description || "N/A",
      htsCode: row.hts_code || "N/A",
      status: row.status || "Pending",
      notes: row.notes || "",
      documents: row.documents_metadata || [], // Array of document metadata objects
      service_charges: row.service_charges || [], // Array of charge objects
      isfFiledLater: row.isf_filed_later || false,

      // Category-specific fields, default to "N/A" if not applicable
      oceanServiceType:
        categoryInternal === "ocean" ? row.ocean_service_type || "N/A" : "N/A",
      oceanService:
        categoryInternal === "ocean" ? row.ocean_service || "N/A" : "N/A",
      hbl: categoryInternal === "ocean" ? row.hbl || "N/A" : "N/A", // House Bill of Lading (Ocean)
      hawb: categoryInternal === "air" ? row.hawb || "N/A" : "N/A", // House Air Waybill (Air)
      containerNumber:
        categoryInternal === "ocean" ? row.container_number || "N/A" : "N/A",
      containerType:
        categoryInternal === "ocean" ? row.container_type || "N/A" : "N/A",
      sealNumber:
        categoryInternal === "ocean" ? row.seal_number || "N/A" : "N/A",
      flightNumber:
        categoryInternal === "air" ? row.flight_number || "N/A" : "N/A",
      dimensions:
        categoryInternal === "air" || categoryInternal === "truck"
          ? row.dimensions || "N/A"
          : "N/A",
      truckServiceType:
        categoryInternal === "truck" ? row.truck_service_type || "N/A" : "N/A",
      cbm: categoryInternal === "truck" && row.cbm !== null ? row.cbm : "N/A", // Cubic Meters
    };
    // Handle cases where HAWB might have been stored in HBL field from older forms for Air
    if (
      categoryInternal === "air" &&
      transformed.hawb === "N/A" &&
      row.hbl &&
      row.hbl !== "N/A"
    ) {
      transformed.hawb = row.hbl; // Use HBL value for HAWB if HAWB is N/A but HBL has a value for Air
    }
    return transformed;
  }
  async function prepareDataForSupabase(
    formData,
    category,
    isNewRecord = false,
    chargesContainer
  ) {
    if (!currentUserST) {
      showCustomNotification(
        "User not authenticated for this module. Cannot save data.",
        "error"
      );
      throw new Error("User not authenticated for Service Tracking module.");
    }
    const user = currentUserST; // Get current authenticated user
    const dbData = { user_id: user.id };

    if (isNewRecord) {
      dbData.service_display_id = await generateNextServiceDisplayId(category);
      dbData.user_email = user.email; // Store email on creation
    }

    // Mapping from form field names (suffixed with "Modal") to database column names
    const fieldMapping = {
      customerModal: "customer",
      etdModal: "etd",
      etaModal: "eta",
      shipperModal: "shipper",
      consigneeModal: "consignee",
      carrierModal: "carrier",
      polModal: "pol",
      podModal: "pod",
      finalDestinationModal: "final_destination",
      mblHawbModal: "mbl_hawb_pro",
      numPackagesModal: "num_packages",
      grossWeightModal: "gross_weight",
      commodityDescriptionModal: "commodity_description",
      htsCodeModal: "hts_code",
      serviceStatusModal: "status",
      serviceNotesModal: "notes",
      // Category specific fields (Ocean)
      oceanServiceTypeModal: "ocean_service_type",
      oceanServiceModal: "ocean_service",
      hblModal: "hbl", // This will be HBL for Ocean, HAWB for Air (handled below)
      containerNumberModal: "container_number",
      containerTypeModal: "container_type",
      sealNumberModal: "seal_number",
      addIsfLaterModal: "isf_filed_later",
      // Category specific fields (Air)
      flightNumberModal: "flight_number",
      dimensionsModal: "dimensions", // also for Truck
      // Category specific fields (Truck)
      truckServiceTypeModal: "truck_service_type",
      cbmModal: "cbm",
    };

    for (const formKey in fieldMapping) {
      const dbKey = fieldMapping[formKey];
      if (formData.has(formKey)) {
        let value = formData.get(formKey);
        // Type conversions and cleaning
        if (dbKey === "etd" || dbKey === "eta") {
          dbData[dbKey] = value ? value : null; // Dates or null
        } else if (
          dbKey === "num_packages" ||
          dbKey === "gross_weight" ||
          dbKey === "cbm"
        ) {
          dbData[dbKey] =
            value === "" || isNaN(parseFloat(value)) ? null : parseFloat(value); // Numbers or null
        } else if (dbKey === "isf_filed_later") {
          dbData[dbKey] = formData.get(formKey) === "on"; // Boolean for checkbox
        } else if (typeof value === "string") {
          dbData[dbKey] = value.trim() === "" ? null : value.trim(); // Trim strings, or null if empty
        } else {
          dbData[dbKey] = value;
        }
      } else if (dbKey === "isf_filed_later") {
        // Ensure boolean fields have a default if not in form
        dbData[dbKey] = false;
      }
    }

    // Handle HBL/HAWB distinction based on category
    if (category === "air") {
      if (dbData.hbl !== undefined) {
        // If 'hblModal' was in form (meaning HAWB for Air)
        dbData.hawb = dbData.hbl; // Map to 'hawb' column for Air table
        delete dbData.hbl; // Remove 'hbl' key as Air table doesn't have it
      }
    } else if (category === "ocean") {
      // Ensure 'hawb' key is not present for Ocean, it might be in dbData if the form logic was complex
      delete dbData.hawb;
    }

    // Clean up fields not relevant to the specific category to avoid DB errors
    const allPossibleCategorySpecificFields = {
      ocean: [
        "ocean_service_type",
        "ocean_service",
        "hbl",
        "container_number",
        "container_type",
        "seal_number",
        "isf_filed_later",
      ],
      air: ["flight_number", "hawb", "dimensions"],
      truck: ["truck_service_type", "dimensions", "cbm"],
    };

    for (const catKey in allPossibleCategorySpecificFields) {
      if (catKey !== category) {
        allPossibleCategorySpecificFields[catKey].forEach(
          (field) => delete dbData[field]
        );
      }
    }

    // Collect service charges
    const collectedCharges = [];
    if (chargesContainer) {
      const chargeRows = chargesContainer.querySelectorAll(".st-charge-row");
      chargeRows.forEach((row) => {
        const nameSelect = row.querySelector('select[name="chargeName[]"]');
        const costInput = row.querySelector('input[name="chargeCost[]"]');
        const currencySelect = row.querySelector(
          'select[name="chargeCurrency[]"]'
        );
        if (nameSelect && costInput && currencySelect && nameSelect.value) {
          // Ensure name is selected
          const cost = parseFloat(costInput.value);
          if (!isNaN(cost)) {
            // Ensure cost is a valid number
            collectedCharges.push({
              name: nameSelect.value,
              cost: cost,
              currency: currencySelect.value,
            });
          }
        }
      });
    }
    dbData.service_charges = collectedCharges; // Store as JSONB array

    if (isNewRecord && !dbData.documents_metadata) {
      dbData.documents_metadata = [];
    }

    return dbData;
  }

  // SECTION 4: SUPABASE CORE LOGIC
  async function fetchAllServices() {
    if (!currentUserST) {
      console.warn("ST Module: User not authenticated. Cannot fetch services.");
      allServicesData = []; // Clear local data
      if (tableViewTypeSelect)
        initializeOrUpdateTable(
          tableViewTypeSelect.value,
          servicesTableHtmlElement,
          null,
          []
        ); // Update table with empty data
      if (archiveYearSelect && !archiveYearsPopulated)
        populateArchiveYearSelect(); // Populate archive years (might show default range)
      updateDashboard([]); // Update dashboard with empty data
      return;
    }
    console.log("ST Module: Fetching all services for user:", currentUserST.id);
    try {
      const selectQuery = "*, service_display_id, user_email, service_charges"; // Ensure all needed columns are fetched
      const [oceanRes, airRes, truckRes] = await Promise.all([
        supabase
          .from(SERVICE_TABLES.ocean)
          .select(selectQuery)
          .order("created_at", { ascending: false }),
        supabase
          .from(SERVICE_TABLES.air)
          .select(selectQuery)
          .order("created_at", { ascending: false }),
        supabase
          .from(SERVICE_TABLES.truck)
          .select(selectQuery)
          .order("created_at", { ascending: false }),
      ]);

      // Error handling for each fetch
      if (oceanRes.error) throw { type: "ocean", ...oceanRes.error };
      if (airRes.error) throw { type: "air", ...airRes.error };
      if (truckRes.error) throw { type: "truck", ...truckRes.error };

      const oceanData = oceanRes.data.map((row) =>
        transformServiceDataForUI(row, "ocean")
      );
      const airData = airRes.data.map((row) =>
        transformServiceDataForUI(row, "air")
      );
      const truckData = truckRes.data.map((row) =>
        transformServiceDataForUI(row, "truck")
      );

      allServicesData = [...oceanData, ...airData, ...truckData];
      console.log(
        "ST Module: Data fetched successfully, total services:",
        allServicesData.length
      );

      refreshMainServicesTable(); // Refresh main table with new data
      if (archiveYearSelect && !archiveYearsPopulated)
        populateArchiveYearSelect(); // Populate years if not done
    } catch (error) {
      console.error("ST Module: Error fetching services from Supabase:", error);
      showCustomNotification(
        `Error fetching ${error.type || ""} services: ${
          error.message || "Unknown error"
        }`,
        "error"
      );
      allServicesData = []; // Clear data on error
      if (tableViewTypeSelect)
        initializeOrUpdateTable(
          tableViewTypeSelect.value,
          servicesTableHtmlElement,
          null,
          []
        );
      if (archiveYearSelect && !archiveYearsPopulated)
        populateArchiveYearSelect();
      updateDashboard([]);
    }
  }

  async function unsubscribeAllServiceChanges() {
    if (serviceChannels.length > 0) {
      console.log(
        "ST Module: Unsubscribing from all service channels:",
        serviceChannels.map((c) => c.topic)
      );
      const removalPromises = serviceChannels.map((channel) => {
        return channel
          .unsubscribe()
          .then(() => supabase.removeChannel(channel))
          .catch((error) =>
            console.error(
              `ST Module: Error during unsubscribe/removeChannel for ${channel.topic}:`,
              error
            )
          );
      });
      try {
        await Promise.all(removalPromises);
        console.log(
          "ST Module: All realtime channels unsubscribed and removal attempts completed."
        );
      } catch (aggregateError) {
        console.error(
          "ST Module: Error during Promise.all for channel removal:",
          aggregateError
        );
      }
      serviceChannels = []; // Clear the array of managed channel instances
    } else {
      console.log("ST Module: No active realtime channels to unsubscribe.");
    }
  }

  async function subscribeToServiceChanges() {
    if (!supabase || !currentUserST) {
      console.warn(
        "ST Module: Supabase client not available or user not authenticated for Realtime subscriptions."
      );
      return;
    }

    if (serviceChannels.length > 0) {
      console.warn(
        "ST Module: Stale channels detected before new subscription. Attempting cleanup."
      );
      await unsubscribeAllServiceChanges();
    }

    console.log(
      "ST Module: Attempting to subscribe to service changes for user:",
      currentUserST.id
    );
    const newChannels = [];

    Object.keys(SERVICE_TABLES).forEach((categoryKey) => {
      const tableName = SERVICE_TABLES[categoryKey];
      const channelName = `realtime-services-${tableName}-st-${currentUserST.id.slice(
        0,
        8
      )}`;

      console.log(`ST Module: Setting up channel: ${channelName}`);
      let channel = supabase.channel(channelName, {
        config: { broadcast: { ack: true } },
      });

      if (typeof channel.off === "function") {
        channel.off("postgres_changes");
      } else {
        console.warn(
          `ST Module: Channel object for ${channelName} does NOT have 'off' method. State: ${channel.state}. Skipping .off() call.`
        );
      }

      try {
        channel.on(
          "postgres_changes",
          { event: "*", schema: "public", table: tableName },
          (payload) => {
            handleRealtimeChangeST(payload, categoryKey);
          }
        );

        if (channel.state !== "joined" && channel.state !== "joining") {
          channel.subscribe((status, err) => {
            if (status === "SUBSCRIBED") {
              console.log(
                `ST Module: RT Successfully SUBSCRIBED to ${tableName} (${channelName})`
              );
            } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
              console.error(
                `ST Module: RT Subscription FAILED/TIMED_OUT for ${tableName} (${channelName}). Error:`,
                err
              );
              supabase
                .removeChannel(channel)
                .catch((e) =>
                  console.error(
                    `ST Module: Error removing failed channel ${channelName}`,
                    e
                  )
                );
              const indexInNew = newChannels.indexOf(channel);
              if (indexInNew > -1) newChannels.splice(indexInNew, 1);
            } else if (status === "CLOSED") {
              console.warn(
                `ST Module: RT Subscription to ${tableName} (${channelName}) was CLOSED.`
              );
            }
          });
        } else {
          console.log(
            `ST Module: Channel ${channelName} already in state ${channel.state}. Listeners attached. Not calling subscribe() again.`
          );
        }
        newChannels.push(channel);
      } catch (e) {
        console.error(
          `ST Module: CRITICAL error setting up listeners or subscribing to channel ${channelName}.`,
          e
        );
      }
    });
    serviceChannels = newChannels;
    console.log(
      "ST Module: Service change subscriptions setup complete for channels:",
      serviceChannels.map((c) => c.topic)
    );
  }

  function handleRealtimeChangeST(payload, tableCategory) {
    console.log(
      `ST Module: Realtime change on ${tableCategory}:`,
      payload.eventType,
      payload
    );
    const eventType = payload.eventType;
    let changedRecordUI;
    let needsMainTableRefresh = false;
    let notificationMessage = "";
    let notificationType = "info";

    if (eventType === "INSERT") {
      changedRecordUI = transformServiceDataForUI(payload.new, tableCategory);
      const existingIndex = allServicesData.findIndex(
        (s) => s.id === changedRecordUI.id
      );
      if (existingIndex === -1) {
        allServicesData.push(changedRecordUI);
        notificationMessage = `New service ${changedRecordUI.service_display_id} (${tableCategory}) added.`;
        notificationType = "success";
      } else {
        allServicesData[existingIndex] = changedRecordUI;
        notificationMessage = `Service data for ${changedRecordUI.service_display_id} (${tableCategory}) refreshed (received INSERT for existing).`;
      }
      allServicesData.sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at)
      );
      needsMainTableRefresh = true;
    } else if (eventType === "UPDATE") {
      changedRecordUI = transformServiceDataForUI(payload.new, tableCategory);
      const index = allServicesData.findIndex(
        (s) => s.id === changedRecordUI.id
      );
      if (index !== -1) {
        const oldStatus = allServicesData[index].status;
        allServicesData[index] = changedRecordUI;
        notificationMessage = `Service ${changedRecordUI.service_display_id} (${tableCategory}) updated.`;
        if (oldStatus !== changedRecordUI.status) {
          notificationMessage += ` Status: ${oldStatus} -> ${changedRecordUI.status}.`;
        }
        needsMainTableRefresh = true;
      } else {
        allServicesData.push(changedRecordUI);
        allServicesData.sort(
          (a, b) => new Date(b.created_at) - new Date(a.created_at)
        );
        notificationMessage = `Service ${changedRecordUI.service_display_id} (${tableCategory}) added via update event.`;
        needsMainTableRefresh = true;
      }
    } else if (eventType === "DELETE") {
      const deletedId = payload.old.id;
      if (deletedId) {
        const serviceToDelete = allServicesData.find((s) => s.id === deletedId);
        const displayIdForNotification =
          serviceToDelete?.service_display_id ||
          deletedId.substring(0, 8) + "...";
        allServicesData = allServicesData.filter((s) => s.id !== deletedId);
        notificationMessage = `Service ${displayIdForNotification} (${tableCategory}) deleted.`;
        needsMainTableRefresh = true;
      }
    }

    if (needsMainTableRefresh) {
      console.log(
        "ST Module: Triggering main table refresh due to Realtime event."
      );
      refreshMainServicesTable();
      if (notificationMessage) {
        showCustomNotification(notificationMessage, notificationType);
      }
    }

    if (
      archiveServiceModal &&
      archiveServiceModal.style.display === "flex" &&
      archiveServiceModal.classList.contains("st-modal-open")
    ) {
      console.log(
        "ST Module: Archive modal is open, refreshing archive data due to Realtime event."
      );
      handleFilterArchive();
    }
  }

  // SECTION 5: SUPABASE STORAGE HELPERS
  async function uploadServiceDocument(
    serviceId,
    serviceCategory,
    docCategory,
    docType,
    file
  ) {
    if (!file) {
      showCustomNotification("No file selected for upload.", "warning");
      return null;
    }
    if (!currentUserST) {
      showCustomNotification(
        "User not authenticated for this module. Cannot upload file.",
        "error"
      );
      return null;
    }
    const user = currentUserST;
    const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const timestamp = Date.now();
    const filePath = `${serviceCategory}/${user.id}/${serviceId}/${timestamp}_${sanitizedFileName}`;

    try {
      const uploadButtonInDocModal = document.getElementById("uploadDocBtn");
      if (uploadButtonInDocModal) uploadButtonInDocModal.disabled = true;
      showCustomNotification(`Uploading "${file.name}"...`, "info", 10000);

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadButtonInDocModal) uploadButtonInDocModal.disabled = false;

      if (uploadError) {
        console.error("Error uploading file to Supabase Storage:", uploadError);
        showCustomNotification(`Upload Error: ${uploadError.message}`, "error");
        return null;
      }

      const documentMetadata = {
        id: `doc_${timestamp}_${Math.random().toString(36).substring(2, 9)}`,
        file_name: file.name,
        file_path: uploadData.path,
        file_size: file.size,
        content_type: file.type,
        doc_category: docCategory,
        doc_type: docType,
        uploaded_at: new Date().toISOString(),
        user_id: user.id,
      };
      return documentMetadata;
    } catch (error) {
      const uploadButtonInDocModal = document.getElementById("uploadDocBtn");
      if (uploadButtonInDocModal) uploadButtonInDocModal.disabled = false;
      console.error("Exception during file upload:", error);
      showCustomNotification(`Upload Exception: ${error.message}`, "error");
      return null;
    }
  }

  // SECTION 6: CRUD OPERATIONS
  if (newServiceForm) {
    newServiceForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!currentUserST) {
        showCustomNotification(
          "Authentication required to create service.",
          "error"
        );
        return;
      }

      const createServiceBtn = document.getElementById("createServiceBtn");
      if (createServiceBtn) createServiceBtn.disabled = true;
      showCustomNotification("Processing new service...", "info", 4000);

      const serviceCategory = serviceCategoryModalSelect.value;
      if (!serviceCategory) {
        showCustomNotification("Please select a service type.", "warning");
        if (createServiceBtn) createServiceBtn.disabled = false;
        return;
      }
      if (serviceCategory === "ocean" && !validateIsfCreateModal()) {
        if (createServiceBtn) createServiceBtn.disabled = false;
        return;
      }

      const formData = new FormData(newServiceForm);
      let serviceDataForDb;
      try {
        serviceDataForDb = await prepareDataForSupabase(
          formData,
          serviceCategory,
          true,
          chargesContainerCreate
        );
        const isfFile = formData.get("isfFileModal");
        const tableName = SERVICE_TABLES[serviceCategory];
        if (!tableName)
          throw new Error(`Invalid service category: ${serviceCategory}`);

        Object.keys(serviceDataForDb).forEach((key) => {
          if (serviceDataForDb[key] === undefined) delete serviceDataForDb[key];
        });

        if (!serviceDataForDb.documents_metadata)
          serviceDataForDb.documents_metadata = [];

        const { data: newService, error } = await supabase
          .from(tableName)
          .insert(serviceDataForDb)
          .select()
          .single();

        if (error) {
          console.error(
            `Error creating ${serviceCategory} service in Supabase:`,
            error
          );
          showCustomNotification(`DB Error: ${error.message}`, "error");
          if (createServiceBtn) createServiceBtn.disabled = false;
          return;
        }

        if (
          serviceCategory === "ocean" &&
          isfFile &&
          isfFile.name &&
          !newService.isf_filed_later
        ) {
          const isfMetadata = await uploadServiceDocument(
            newService.id,
            serviceCategory,
            "Regulatory and Compliance Documents",
            "ISF Filing Confirmation",
            isfFile
          );
          if (isfMetadata) {
            const updatedDocsMetadata = [
              ...(newService.documents_metadata || []),
              isfMetadata,
            ];
            const { error: updateError } = await supabase
              .from(tableName)
              .update({
                documents_metadata: updatedDocsMetadata,
                updated_at: new Date().toISOString(),
              })
              .eq("id", newService.id);
            if (updateError)
              console.error(
                "Error updating service with ISF metadata:",
                updateError
              );
          }
        }
        closeModal(createServiceModal, newServiceForm);
      } catch (e) {
        console.error("Exception during service creation:", e);
        showCustomNotification(
          `An unexpected error occurred: ${e.message}`,
          "error"
        );
      } finally {
        if (createServiceBtn) createServiceBtn.disabled = false;
      }
    });
  }
  if (editServiceForm) {
    editServiceForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!currentUserST) {
        showCustomNotification(
          "Authentication required to edit service.",
          "error"
        );
        return;
      }

      const saveChangesBtn = document.getElementById("saveServiceChangesBtn");
      if (saveChangesBtn) saveChangesBtn.disabled = true;
      showCustomNotification("Saving changes...", "info", 4000);

      const serviceIdToUpdate = editServiceIdInput.value;
      const serviceCategory = editServiceCategoryModalSelect.value;
      if (!serviceIdToUpdate || !serviceCategory) {
        showCustomNotification(
          "Missing service ID or category for update.",
          "error"
        );
        if (saveChangesBtn) saveChangesBtn.disabled = false;
        return;
      }

      const formData = new FormData(editServiceForm);
      let serviceDataForDb;
      try {
        serviceDataForDb = await prepareDataForSupabase(
          formData,
          serviceCategory,
          false,
          chargesContainerEdit
        );
        const newIsfFile = formData.get("editIsfFileModal");
        const tableName = SERVICE_TABLES[serviceCategory];
        if (!tableName)
          throw new Error(
            `Invalid service category for update: ${serviceCategory}`
          );

        const originalService = allServicesData.find(
          (s) => s.id === serviceIdToUpdate
        );
        let finalDocumentsMetadata = originalService
          ? [...originalService.documents]
          : [];

        if (serviceCategory === "ocean" && newIsfFile && newIsfFile.name) {
          const isfMetadata = await uploadServiceDocument(
            serviceIdToUpdate,
            serviceCategory,
            "Regulatory and Compliance Documents",
            "ISF Filing Confirmation",
            newIsfFile
          );
          if (isfMetadata) {
            finalDocumentsMetadata = finalDocumentsMetadata.filter(
              (doc) => doc.doc_type !== "ISF Filing Confirmation"
            );
            finalDocumentsMetadata.push(isfMetadata);
            serviceDataForDb.isf_filed_later = false;
          }
        }
        serviceDataForDb.documents_metadata = finalDocumentsMetadata;
        serviceDataForDb.updated_at = new Date().toISOString();

        delete serviceDataForDb.user_id;
        delete serviceDataForDb.user_email;
        delete serviceDataForDb.service_display_id;
        delete serviceDataForDb.id;
        delete serviceDataForDb.created_at;

        const { data: updatedService, error } = await supabase
          .from(tableName)
          .update(serviceDataForDb)
          .eq("id", serviceIdToUpdate)
          .select()
          .single();

        if (error) {
          console.error(
            `Error updating ${serviceCategory} service ${serviceIdToUpdate}:`,
            error
          );
          showCustomNotification(`DB Update Error: ${error.message}`, "error");
          if (saveChangesBtn) saveChangesBtn.disabled = false;
          return;
        }
        closeModal(editServiceModal, editServiceForm);
      } catch (e) {
        console.error("Exception during service update:", e);
        showCustomNotification(
          `An unexpected error occurred during update: ${e.message}`,
          "error"
        );
      } finally {
        if (saveChangesBtn) saveChangesBtn.disabled = false;
      }
    });
  }
  async function deleteService(serviceId, serviceCategoryInternal) {
    if (!currentUserST) {
      showCustomNotification(
        "Authentication required to delete service.",
        "error"
      );
      return;
    }
    if (!serviceId || !serviceCategoryInternal) {
      showCustomNotification(
        "Cannot delete: Service ID or category is missing.",
        "error"
      );
      return;
    }

    const tableName = SERVICE_TABLES[serviceCategoryInternal];
    if (!tableName) {
      showCustomNotification(
        `Cannot delete: Invalid service category "${serviceCategoryInternal}".`,
        "error"
      );
      return;
    }

    const serviceToDelete = allServicesData.find((s) => s.id === serviceId);

    if (
      serviceToDelete &&
      serviceToDelete.documents &&
      serviceToDelete.documents.length > 0
    ) {
      const filePathsToDelete = serviceToDelete.documents
        .map((doc) => doc.file_path)
        .filter(Boolean);
      if (filePathsToDelete.length > 0) {
        console.log(
          "ST Module: Deleting documents from storage:",
          filePathsToDelete
        );
        const { error: storageError } = await supabase.storage
          .from(BUCKET_NAME)
          .remove(filePathsToDelete);
        if (storageError) {
          console.error(
            "Error deleting documents from storage, but proceeding with DB record deletion:",
            storageError
          );
          showCustomNotification(
            `Warning: Could not delete all associated files: ${storageError.message}`,
            "warning",
            6000
          );
        }
      }
    }

    const { error } = await supabase
      .from(tableName)
      .delete()
      .eq("id", serviceId);

    if (error) {
      console.error(
        `Error deleting ${serviceCategoryInternal} service ${serviceId}:`,
        error
      );
      showCustomNotification(
        `Error deleting service: ${error.message}`,
        "error"
      );
    }
  }
  async function completeService(serviceId, serviceCategoryInternal) {
    if (!currentUserST) {
      showCustomNotification(
        "Authentication required to complete service.",
        "error"
      );
      return;
    }
    if (!serviceId || !serviceCategoryInternal) {
      showCustomNotification(
        "Cannot complete: Service ID or category is missing.",
        "error"
      );
      return;
    }
    const tableName = SERVICE_TABLES[serviceCategoryInternal];
    if (!tableName) {
      showCustomNotification(
        `Cannot complete: Invalid service category "${serviceCategoryInternal}".`,
        "error"
      );
      return;
    }

    const user = currentUserST;

    const { data: updatedServiceData, error: updateServiceError } =
      await supabase
        .from(tableName)
        .update({ status: "Completed", updated_at: new Date().toISOString() })
        .eq("id", serviceId)
        .select()
        .single();

    if (updateServiceError) {
      console.error(
        `Error completing service ${serviceId}:`,
        updateServiceError
      );
      showCustomNotification(
        `Error completing service: ${updateServiceError.message}`,
        "error"
      );
      return;
    }

    const fullServiceDetails = transformServiceDataForUI(
      updatedServiceData,
      serviceCategoryInternal
    );
    const newInvoiceNumber = await generateNextInvoiceNumber();
    const currentDate = new Date().toISOString().split("T")[0];
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);
    const formattedDueDate = dueDate.toISOString().split("T")[0];

    const invoiceCharges = (fullServiceDetails.service_charges || []).map(
      (sc) => ({
        name: sc.name,
        quantity: 1,
        unit_price: sc.cost || 0,
        currency: sc.currency || SERVICE_CHARGES_MAP.defaultCurrency,
        amount: sc.cost || 0,
      })
    );

    const totalsByCurrency = invoiceCharges.reduce((acc, charge) => {
      const currency = charge.currency || SERVICE_CHARGES_MAP.defaultCurrency;
      acc[currency] = (acc[currency] || 0) + (charge.amount || 0);
      return acc;
    }, {});

    const invoicePayload = {
      invoice_number: newInvoiceNumber,
      service_id_fk: fullServiceDetails.id,
      service_display_id: fullServiceDetails.service_display_id,
      customer_name: fullServiceDetails.customer,
      invoice_date: currentDate,
      due_date: formattedDueDate,
      charges: invoiceCharges,
      totals_by_currency: totalsByCurrency,
      status: "Pending",
      payment_communication: `Ref: ${newInvoiceNumber} / Service: ${fullServiceDetails.service_display_id}`,
      notes: `Invoice automatically generated from completed service ${fullServiceDetails.service_display_id}.`,
      user_id: user.id,
      user_email: user.email,
    };

    const { data: newInvoice, error: insertInvoiceError } = await supabase
      .from(INVOICES_TABLE_NAME)
      .insert(invoicePayload)
      .select()
      .single();

    if (insertInvoiceError) {
      console.error(
        `Error creating invoice for service ${serviceId}:`,
        insertInvoiceError
      );
      showCustomNotification(
        `Service completed, but failed to create invoice: ${insertInvoiceError.message}`,
        "error",
        7000
      );
    } else {
      showCustomNotification(
        `Invoice ${newInvoice.invoice_number} created for service ${fullServiceDetails.service_display_id}.`,
        "success",
        5000
      );
      console.log("ST Module: New invoice created in Supabase:", newInvoice);
    }
  }

  // SECTION 7: MODAL SPECIFIC LOGIC & UI SETUP
  function createChargeRowElement(
    serviceType,
    charge = null,
    isEditable = true
  ) {
    const chargeRow = document.createElement("div");
    chargeRow.className = "st-charge-row";

    const availableCharges = SERVICE_CHARGES_MAP[serviceType] || [];
    const availableCurrencies = SERVICE_CHARGES_MAP.currencies || [
      SERVICE_CHARGES_MAP.defaultCurrency,
    ];

    const nameSelect = document.createElement("select");
    nameSelect.name = "chargeName[]";
    if (!isEditable) nameSelect.disabled = true;
    let nameOptionsHtml = '<option value="">Select Charge...</option>';
    availableCharges.forEach((chargeName) => {
      nameOptionsHtml += `<option value="${chargeName}" ${
        charge && charge.name === chargeName ? "selected" : ""
      }>${chargeName}</option>`;
    });
    nameSelect.innerHTML = nameOptionsHtml;

    const costInput = document.createElement("input");
    costInput.type = "number";
    costInput.name = "chargeCost[]";
    costInput.placeholder = "Cost";
    costInput.step = "0.01";
    costInput.value =
      charge && charge.cost !== undefined ? charge.cost.toFixed(2) : "";
    if (!isEditable) costInput.disabled = true;

    const currencySelect = document.createElement("select");
    currencySelect.name = "chargeCurrency[]";
    if (!isEditable) currencySelect.disabled = true;
    let currencyOptionsHtml = "";
    availableCurrencies.forEach((currencyCode) => {
      currencyOptionsHtml += `<option value="${currencyCode}" ${
        charge && charge.currency === currencyCode
          ? "selected"
          : !charge && currencyCode === SERVICE_CHARGES_MAP.defaultCurrency
          ? "selected"
          : ""
      }>${currencyCode}</option>`;
    });
    currencySelect.innerHTML = currencyOptionsHtml;

    chargeRow.appendChild(nameSelect);
    chargeRow.appendChild(costInput);
    chargeRow.appendChild(currencySelect);

    if (isEditable) {
      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "st-charge-delete-btn";
      deleteBtn.innerHTML = "<i class='bx bx-trash'></i>";
      deleteBtn.title = "Remove Charge";
      deleteBtn.addEventListener("click", () => {
        chargeRow.remove();
      });
      chargeRow.appendChild(deleteBtn);
    }
    return chargeRow;
  }
  function populateChargesUI(
    container,
    serviceType,
    chargesData = [],
    isEditable = true
  ) {
    if (!container) return;
    container.innerHTML = "";

    if (chargesData && chargesData.length > 0) {
      chargesData.forEach((charge) => {
        container.appendChild(
          createChargeRowElement(serviceType, charge, isEditable)
        );
      });
      if (viewNoChargesMessage && !isEditable)
        viewNoChargesMessage.style.display = "none";
    } else if (!isEditable && viewNoChargesMessage) {
      viewNoChargesMessage.style.display = "block";
      viewNoChargesMessage.textContent =
        "No charges associated with this service.";
    }
  }
  function resetCreateFormSpecifics() {
    if (oceanFieldsModal) oceanFieldsModal.style.display = "none";
    if (airFieldsModal) airFieldsModal.style.display = "none";
    if (truckFieldsModal) truckFieldsModal.style.display = "none";
    if (flightNumberGroupModal) flightNumberGroupModal.style.display = "none";
    if (hblHawbGroupModal) hblHawbGroupModal.style.display = "none";
    if (containerFieldsModal) containerFieldsModal.style.display = "none";
    if (dimensionsCbmGroupModal) dimensionsCbmGroupModal.style.display = "none";
    if (isfErrorModal) isfErrorModal.style.display = "none";
    if (isfRequiredIndicatorModal)
      isfRequiredIndicatorModal.style.display = "inline";
    if (isfFileInputModal) isfFileInputModal.value = "";
    if (addIsfLaterCheckboxModal) addIsfLaterCheckboxModal.checked = false;
    if (chargesContainerCreate) chargesContainerCreate.innerHTML = "";
  }
  function handleCreateCategoryChange() {
    const category = serviceCategoryModalSelect.value;
    resetCreateFormSpecifics();

    const hblLabel = document.querySelector('label[for="hblModal"]');

    if (category === "ocean") {
      if (oceanFieldsModal) oceanFieldsModal.style.display = "block";
      if (hblHawbGroupModal) hblHawbGroupModal.style.display = "block";
      if (hblLabel) hblLabel.textContent = "HBL (Ocean):";
      if (containerFieldsModal) containerFieldsModal.style.display = "block";
      if (isfRequiredIndicatorModal)
        isfRequiredIndicatorModal.style.display = "inline";
    } else if (category === "air") {
      if (airFieldsModal) airFieldsModal.style.display = "block";
      if (flightNumberGroupModal)
        flightNumberGroupModal.style.display = "block";
      if (hblHawbGroupModal) hblHawbGroupModal.style.display = "block";
      if (hblLabel) hblLabel.textContent = "HAWB (Air):";
      if (document.getElementById("dimensionsModal"))
        document
          .getElementById("dimensionsModal")
          .closest(".st-form-group").style.display = "block";
      if (document.getElementById("cbmModal"))
        document
          .getElementById("cbmModal")
          .closest(".st-form-group").style.display = "none";
      if (dimensionsCbmGroupModal)
        dimensionsCbmGroupModal.style.display = "block";
      if (isfRequiredIndicatorModal)
        isfRequiredIndicatorModal.style.display = "none";
    } else if (category === "truck") {
      if (truckFieldsModal) truckFieldsModal.style.display = "block";
      if (document.getElementById("dimensionsModal"))
        document
          .getElementById("dimensionsModal")
          .closest(".st-form-group").style.display = "block";
      if (document.getElementById("cbmModal"))
        document
          .getElementById("cbmModal")
          .closest(".st-form-group").style.display = "block";
      if (dimensionsCbmGroupModal)
        dimensionsCbmGroupModal.style.display = "block";
      if (hblHawbGroupModal) hblHawbGroupModal.style.display = "none";
      if (isfRequiredIndicatorModal)
        isfRequiredIndicatorModal.style.display = "none";
    }

    if (category && chargesContainerCreate) {
      chargesContainerCreate.appendChild(
        createChargeRowElement(category, null, true)
      );
    }
    validateIsfCreateModal();
  }
  function validateIsfCreateModal() {
    if (
      !isfErrorModal ||
      !serviceCategoryModalSelect ||
      !isfFileInputModal ||
      !addIsfLaterCheckboxModal
    )
      return true;
    const category = serviceCategoryModalSelect.value;
    if (
      category === "ocean" &&
      !addIsfLaterCheckboxModal.checked &&
      (!isfFileInputModal.files || isfFileInputModal.files.length === 0)
    ) {
      isfErrorModal.textContent =
        'For Ocean services, ISF file or "Add ISF Later" is required.';
      isfErrorModal.style.display = "block";
      return false;
    }
    if (isfErrorModal) isfErrorModal.style.display = "none";
    return true;
  }
  function populateViewModal(serviceData) {
    if (!viewServiceModal || !serviceData) return;

    const categoryInfo = getCategoryTextAndClass(
      serviceData.serviceCategoryInternal
    );
    if (viewServiceTypeBadge) {
      viewServiceTypeBadge.innerHTML = categoryInfo.text;
      viewServiceTypeBadge.className = `st-type-badge ${categoryInfo.class}`;
    }

    viewServiceId.textContent = serviceData.service_display_id || "N/A";
    viewCustomer.textContent = serviceData.customer || "N/A";
    viewEtd.textContent = serviceData.etd || "N/A";
    viewEta.textContent = serviceData.eta || "N/A";
    viewShipper.textContent = serviceData.shipper || "N/A";
    viewConsignee.textContent = serviceData.consignee || "N/A";
    viewCarrier.textContent = serviceData.carrier || "N/A";
    viewPol.textContent = serviceData.pol || "N/A";
    viewPod.textContent = serviceData.pod || "N/A";
    viewFinalDestination.textContent = serviceData.finalDestination || "N/A";
    viewMblHawbPro.textContent = serviceData.mblHawbPro || "N/A";
    viewNumPackages.textContent = serviceData.numPackages || "N/A";
    viewGrossWeight.textContent = serviceData.grossWeight || "N/A";
    viewCommodityDescription.textContent =
      serviceData.commodityDescription || "N/A";
    viewHtsCode.textContent = serviceData.htsCode || "N/A";
    viewServiceStatus.textContent = serviceData.status || "N/A";
    viewServiceNotes.textContent = serviceData.notes || "N/A";
    const creatorInfoEl = viewServiceModal.querySelector("#viewServiceCreator");
    if (creatorInfoEl)
      creatorInfoEl.textContent = serviceData.user_email || "N/A";

    viewOceanSpecificDetails.style.display = "none";
    viewAirSpecificDetails.style.display = "none";
    viewTruckSpecificDetails.style.display = "none";

    if (serviceData.serviceCategoryInternal === "ocean") {
      viewOceanSpecificDetails.style.display = "block";
      viewHblOcean.textContent = serviceData.hbl || "N/A";
      viewOceanServiceType.textContent = serviceData.oceanServiceType || "N/A";
      viewOceanService.textContent = serviceData.oceanService || "N/A";
      viewContainerNumber.textContent = serviceData.containerNumber || "N/A";
      viewContainerType.textContent = serviceData.containerType || "N/A";
      viewSealNumber.textContent = serviceData.sealNumber || "N/A";
    } else if (serviceData.serviceCategoryInternal === "air") {
      viewAirSpecificDetails.style.display = "block";
      viewHblAir.textContent = serviceData.hawb || "N/A";
      viewFlightNumber.textContent = serviceData.flightNumber || "N/A";
      viewDimensionsAir.textContent = serviceData.dimensions || "N/A";
    } else if (serviceData.serviceCategoryInternal === "truck") {
      viewTruckSpecificDetails.style.display = "block";
      viewTruckServiceType.textContent = serviceData.truckServiceType || "N/A";
      viewCbm.textContent = serviceData.cbm || "N/A";
      viewDimensionsTruck.textContent = serviceData.dimensions || "N/A";
    }

    if (viewServiceChargesContainer && viewNoChargesMessage) {
      viewServiceChargesContainer.innerHTML = "";
      viewNoChargesMessage.style.display = "none";
      const charges = serviceData.service_charges || [];
      if (charges.length > 0) {
        const totalsByCurrency = {};
        charges.forEach((charge) => {
          const chargeDiv = document.createElement("div");
          chargeDiv.className = "st-detail-group charge-item-view";
          chargeDiv.innerHTML = `
                    <span class="st-detail-value charge-name-view">${
                      charge.name
                    }</span>
                    <span class="st-detail-value charge-cost-view">${(
                      charge.cost || 0
                    ).toFixed(2)} ${
            charge.currency || SERVICE_CHARGES_MAP.defaultCurrency
          }</span>
                `;
          viewServiceChargesContainer.appendChild(chargeDiv);

          const currency =
            charge.currency || SERVICE_CHARGES_MAP.defaultCurrency;
          totalsByCurrency[currency] =
            (totalsByCurrency[currency] || 0) + (charge.cost || 0);
        });

        Object.keys(totalsByCurrency).forEach((currency) => {
          const totalDiv = document.createElement("div");
          totalDiv.className = "charge-total-view";
          totalDiv.innerHTML = `
                    <span class="charge-total-label-view">TOTAL (${currency}):</span>
                    <span class="charge-total-amount-view">${totalsByCurrency[
                      currency
                    ].toFixed(2)} ${currency}</span>
                `;
          viewServiceChargesContainer.appendChild(totalDiv);
        });
      } else {
        viewNoChargesMessage.style.display = "block";
        viewNoChargesMessage.textContent =
          "No charges associated with this service.";
      }
    }
  }
  function resetEditFormSpecifics() {
    if (editOceanFieldsModal) editOceanFieldsModal.style.display = "none";
    if (editAirFieldsModal) editAirFieldsModal.style.display = "none";
    if (editTruckFieldsModal) editTruckFieldsModal.style.display = "none";
    if (editFlightNumberGroupModal)
      editFlightNumberGroupModal.style.display = "none";
    if (editHblHawbGroupModal) editHblHawbGroupModal.style.display = "none";
    if (editContainerFieldsModal)
      editContainerFieldsModal.style.display = "none";
    if (editDimensionsCbmGroupModal)
      editDimensionsCbmGroupModal.style.display = "none";
    if (editIsfErrorModal) editIsfErrorModal.style.display = "none";
    if (editIsfRequiredIndicatorModal)
      editIsfRequiredIndicatorModal.style.display = "inline";
    if (editIsfFileModalInput) {
      editIsfFileModalInput.value = "";
      editIsfFileModalInput.style.display = "block";
    }
    if (currentIsfFileDisplay) currentIsfFileDisplay.textContent = "";
    if (editAddIsfLaterModalCheckbox) {
      editAddIsfLaterModalCheckbox.checked = false;
      editAddIsfLaterModalCheckbox.disabled = false;
    }
    if (chargesContainerEdit) chargesContainerEdit.innerHTML = "";
  }
  function handleEditCategoryChange() {
    const category = editServiceCategoryModalSelect.value;
    if (editOceanFieldsModal) editOceanFieldsModal.style.display = "none";
    if (editAirFieldsModal) editAirFieldsModal.style.display = "none";
    if (editTruckFieldsModal) editTruckFieldsModal.style.display = "none";
    if (editFlightNumberGroupModal)
      editFlightNumberGroupModal.style.display = "none";
    if (editHblHawbGroupModal) editHblHawbGroupModal.style.display = "none";
    if (editContainerFieldsModal)
      editContainerFieldsModal.style.display = "none";
    if (editDimensionsCbmGroupModal)
      editDimensionsCbmGroupModal.style.display = "none";
    if (editIsfRequiredIndicatorModal)
      editIsfRequiredIndicatorModal.style.display = "none";

    const hblLabelEdit = document.querySelector('label[for="editHblModal"]');

    if (category === "ocean") {
      if (editOceanFieldsModal) editOceanFieldsModal.style.display = "block";
      if (editHblHawbGroupModal) editHblHawbGroupModal.style.display = "block";
      if (hblLabelEdit) hblLabelEdit.textContent = "HBL (Ocean):";
      if (editContainerFieldsModal)
        editContainerFieldsModal.style.display = "block";
      if (editIsfRequiredIndicatorModal)
        editIsfRequiredIndicatorModal.style.display = "inline";
    } else if (category === "air") {
      if (editAirFieldsModal) editAirFieldsModal.style.display = "block";
      if (editFlightNumberGroupModal)
        editFlightNumberGroupModal.style.display = "block";
      if (editHblHawbGroupModal) editHblHawbGroupModal.style.display = "block";
      if (hblLabelEdit) hblLabelEdit.textContent = "HAWB (Air):";
      if (document.getElementById("editDimensionsModal"))
        document
          .getElementById("editDimensionsModal")
          .closest(".st-form-group").style.display = "block";
      if (document.getElementById("editCbmModal"))
        document
          .getElementById("editCbmModal")
          .closest(".st-form-group").style.display = "none";
      if (editDimensionsCbmGroupModal)
        editDimensionsCbmGroupModal.style.display = "block";
    } else if (category === "truck") {
      if (editTruckFieldsModal) editTruckFieldsModal.style.display = "block";
      if (document.getElementById("editDimensionsModal"))
        document
          .getElementById("editDimensionsModal")
          .closest(".st-form-group").style.display = "block";
      if (document.getElementById("editCbmModal"))
        document
          .getElementById("editCbmModal")
          .closest(".st-form-group").style.display = "block";
      if (editDimensionsCbmGroupModal)
        editDimensionsCbmGroupModal.style.display = "block";
    }

    if (chargesContainerEdit) {
      const currentCharges = [];
      const existingChargeRows =
        chargesContainerEdit.querySelectorAll(".st-charge-row");
      existingChargeRows.forEach((row) => {
        const nameSelect = row.querySelector('select[name="chargeName[]"]');
        const costInput = row.querySelector('input[name="chargeCost[]"]');
        const currencySelect = row.querySelector(
          'select[name="chargeCurrency[]"]'
        );
        if (
          nameSelect &&
          costInput &&
          currencySelect &&
          nameSelect.value &&
          !isNaN(parseFloat(costInput.value))
        ) {
          currentCharges.push({
            name: nameSelect.value,
            cost: parseFloat(costInput.value),
            currency: currencySelect.value,
          });
        }
      });
      populateChargesUI(chargesContainerEdit, category, currentCharges, true);
    }
    validateIsfEditModal();
  }
  function validateIsfEditModal() {
    if (editIsfErrorModal) editIsfErrorModal.style.display = "none";
    return true;
  }
  function populateEditModal(serviceData) {
    if (!editServiceForm || !serviceData) {
      console.error(
        "populateEditModal: Form or serviceData missing.",
        serviceData
      );
      return;
    }
    editServiceForm.reset();
    resetEditFormSpecifics();

    editServiceIdInput.value = serviceData.id;
    if (editServiceDisplayIdHeader)
      editServiceDisplayIdHeader.textContent = `(${
        serviceData.service_display_id || "N/A"
      })`;
    editServiceCategoryModalSelect.value = serviceData.serviceCategoryInternal;
    editServiceCategoryModalSelect.disabled = true;
    handleEditCategoryChange();

    editCustomerModalInput.value =
      serviceData.customer !== "N/A" ? serviceData.customer : "";
    editEtdModalInput.value = serviceData.etd !== "N/A" ? serviceData.etd : "";
    editEtaModalInput.value = serviceData.eta !== "N/A" ? serviceData.eta : "";
    editShipperModalInput.value =
      serviceData.shipper !== "N/A" ? serviceData.shipper : "";
    editConsigneeModalInput.value =
      serviceData.consignee !== "N/A" ? serviceData.consignee : "";
    editCarrierModalInput.value =
      serviceData.carrier !== "N/A" ? serviceData.carrier : "";
    editPolModalInput.value = serviceData.pol !== "N/A" ? serviceData.pol : "";
    editPodModalInput.value = serviceData.pod !== "N/A" ? serviceData.pod : "";
    editFinalDestinationModalInput.value =
      serviceData.finalDestination !== "N/A"
        ? serviceData.finalDestination
        : "";
    editMblHawbModalInput.value =
      serviceData.mblHawbPro !== "N/A" ? serviceData.mblHawbPro : "";
    editNumPackagesModalInput.value =
      serviceData.numPackages !== "N/A" ? serviceData.numPackages : "";
    editGrossWeightModalInput.value =
      serviceData.grossWeight && serviceData.grossWeight !== "N/A"
        ? parseFloat(String(serviceData.grossWeight).replace(" kg", ""))
        : "";
    editCommodityDescriptionModalTextarea.value =
      serviceData.commodityDescription !== "N/A"
        ? serviceData.commodityDescription
        : "";
    editHtsCodeModalInput.value =
      serviceData.htsCode !== "N/A" ? serviceData.htsCode : "";
    editServiceStatusModalSelect.value = serviceData.status || "Pending";
    editServiceNotesModalTextarea.value =
      serviceData.notes !== "N/A" ? serviceData.notes : "";

    if (serviceData.serviceCategoryInternal === "ocean") {
      editOceanServiceTypeModalSelect.value =
        serviceData.oceanServiceType !== "N/A"
          ? serviceData.oceanServiceType
          : "";
      editOceanServiceModalSelect.value =
        serviceData.oceanService !== "N/A" ? serviceData.oceanService : "";
      editHblModalInput.value =
        serviceData.hbl !== "N/A" ? serviceData.hbl : "";
      const isfDoc = serviceData.documents?.find(
        (doc) => doc.doc_type === "ISF Filing Confirmation"
      );
      if (isfDoc) {
        currentIsfFileDisplay.textContent = `Current ISF: ${isfDoc.file_name} (manage in Docs).`;
        if (editIsfFileModalInput) editIsfFileModalInput.style.display = "none";
        if (editAddIsfLaterModalCheckbox)
          editAddIsfLaterModalCheckbox.disabled = true;
      } else {
        currentIsfFileDisplay.textContent =
          "No ISF on file. Upload new or check 'Add Later'.";
        if (editIsfFileModalInput)
          editIsfFileModalInput.style.display = "block";
        if (editAddIsfLaterModalCheckbox)
          editAddIsfLaterModalCheckbox.disabled = false;
      }
      if (editAddIsfLaterModalCheckbox)
        editAddIsfLaterModalCheckbox.checked =
          serviceData.isfFiledLater || false;
      editContainerNumberModalInput.value =
        serviceData.containerNumber !== "N/A"
          ? serviceData.containerNumber
          : "";
      editContainerTypeModalInput.value =
        serviceData.containerType !== "N/A" ? serviceData.containerType : "";
      editSealNumberModalInput.value =
        serviceData.sealNumber !== "N/A" ? serviceData.sealNumber : "";
    } else if (serviceData.serviceCategoryInternal === "air") {
      editFlightNumberModalInput.value =
        serviceData.flightNumber !== "N/A" ? serviceData.flightNumber : "";
      editHblModalInput.value =
        serviceData.hawb !== "N/A" ? serviceData.hawb : "";
      editDimensionsModalInput.value =
        serviceData.dimensions !== "N/A" ? serviceData.dimensions : "";
    } else if (serviceData.serviceCategoryInternal === "truck") {
      editTruckServiceTypeModalSelect.value =
        serviceData.truckServiceType !== "N/A"
          ? serviceData.truckServiceType
          : "";
      editCbmModalInput.value =
        serviceData.cbm !== "N/A" ? serviceData.cbm : "";
      editDimensionsModalInput.value =
        serviceData.dimensions !== "N/A" ? serviceData.dimensions : "";
    }
    populateChargesUI(
      chargesContainerEdit,
      serviceData.serviceCategoryInternal,
      serviceData.service_charges || [],
      true
    );
    validateIsfEditModal();
  }

  // SECTION 8: DOCUMENT MANAGEMENT MODAL UI LOGIC
  function populateDocCategorySelect() {
    if (!docCategorySelect) return;
    docCategorySelect.innerHTML =
      '<option value="" selected disabled>Select a category...</option>';
    for (const category in documentCategories) {
      const option = document.createElement("option");
      option.value = category;
      option.textContent = category;
      docCategorySelect.appendChild(option);
    }
  }
  function handleDocCategoryChange() {
    if (!docCategorySelect || !docTypeSelect) return;
    const selectedCategory = docCategorySelect.value;
    docTypeSelect.innerHTML =
      '<option value="" selected disabled>Select a type...</option>';
    if (selectedCategory && documentCategories[selectedCategory]) {
      documentCategories[selectedCategory].forEach((type) => {
        const option = document.createElement("option");
        option.value = type;
        option.textContent = type;
        docTypeSelect.appendChild(option);
      });
      docTypeSelect.disabled = false;
    } else {
      docTypeSelect.disabled = true;
    }
  }
  function resetDocUploadForm() {
    if (docCategorySelect) docCategorySelect.value = "";
    if (docTypeSelect) {
      docTypeSelect.innerHTML =
        '<option value="" selected disabled>Select a type...</option>';
      docTypeSelect.disabled = true;
    }
    if (docFileInput) docFileInput.value = "";
    const uploadButtonInDocModal = document.getElementById("uploadDocBtn");
    if (uploadButtonInDocModal) uploadButtonInDocModal.disabled = false;
  }
  function renderServiceDocuments(serviceIdForDocs) {
    if (!docListContainer || !noDocsMessage) return;
    const service = allServicesData.find((s) => s.id === serviceIdForDocs);
    docListContainer.innerHTML = "";

    if (service && service.documents && service.documents.length > 0) {
      noDocsMessage.style.display = "none";
      service.documents.forEach((doc) => {
        const card = document.createElement("div");
        card.className = "st-doc-card";
        const iconClass = getFileIconClass(doc.file_name);
        card.innerHTML = `
                <div class="st-doc-card-icon"><i class='bx ${iconClass}'></i></div>
                <div class="st-doc-card-info">
                    <span class="st-doc-card-name">${doc.file_name}</span>
                    <span class="st-doc-card-type">${doc.doc_category} / ${doc.doc_type}</span>
                </div>
                <div class="st-doc-card-actions">
                    <button class="st-doc-card-download" data-doc-path="${doc.file_path}" data-file-name="${doc.file_name}" title="Download Document"><i class='bx bx-download'></i></button>
                    <button class="st-doc-card-delete" data-doc-id="${doc.id}" data-doc-path="${doc.file_path}" data-file-name="${doc.file_name}" title="Delete Document"><i class='bx bx-trash'></i></button>
                </div>`;
        docListContainer.appendChild(card);
      });
    } else {
      noDocsMessage.style.display = "block";
      noDocsMessage.textContent = "No documents uploaded for this service yet.";
    }
  }
  async function handleDocumentUpload() {
    if (
      !currentServiceIdForDocs ||
      !docCategorySelect ||
      !docTypeSelect ||
      !docFileInput ||
      !docFileInput.files[0]
    ) {
      showCustomNotification(
        "Please select service, category, type, and file.",
        "warning"
      );
      return;
    }
    if (!currentUserST) {
      showCustomNotification(
        "Authentication required to upload document.",
        "error"
      );
      return;
    }

    const uploadButton = document.getElementById("uploadDocBtn");
    if (uploadButton) uploadButton.disabled = true;

    const service = allServicesData.find(
      (s) => s.id === currentServiceIdForDocs
    );
    if (!service) {
      showCustomNotification("Service not found for document upload.", "error");
      if (uploadButton) uploadButton.disabled = false;
      return;
    }

    const file = docFileInput.files[0];
    const docCategory = docCategorySelect.value;
    const docType = docTypeSelect.value;
    const serviceCategoryForStoragePath = service.serviceCategoryInternal;

    try {
      const newDocumentMetadata = await uploadServiceDocument(
        currentServiceIdForDocs,
        serviceCategoryForStoragePath,
        docCategory,
        docType,
        file
      );
      if (newDocumentMetadata) {
        const currentDocuments = service.documents || [];
        const updatedDocumentsMetadata = [
          ...currentDocuments,
          newDocumentMetadata,
        ];

        const tableName = SERVICE_TABLES[service.serviceCategoryInternal];
        const { error: updateError } = await supabase
          .from(tableName)
          .update({
            documents_metadata: updatedDocumentsMetadata,
            updated_at: new Date().toISOString(),
          })
          .eq("id", currentServiceIdForDocs);

        if (updateError) {
          console.error(
            "Error updating service with new document metadata:",
            updateError
          );
          showCustomNotification(
            "File uploaded, but failed to update service record.",
            "warning"
          );
        } else {
          service.documents = updatedDocumentsMetadata;
          renderServiceDocuments(currentServiceIdForDocs);
          resetDocUploadForm();
        }
      }
    } catch (e) {
      console.error("Exception in handleDocumentUpload:", e);
      showCustomNotification(
        "An unexpected error occurred during document upload.",
        "error"
      );
    } finally {
      if (uploadButton) uploadButton.disabled = false;
    }
  }
  async function handleDocumentAction(event) {
    const targetButton = event.target.closest(
      "button[data-doc-path], button[data-doc-id]"
    );
    if (!targetButton || !currentServiceIdForDocs) return;
    if (!currentUserST) {
      showCustomNotification(
        "Authentication required for document action.",
        "error"
      );
      return;
    }

    const service = allServicesData.find(
      (s) => s.id === currentServiceIdForDocs
    );
    if (!service) {
      showCustomNotification("Service not found for document action.", "error");
      return;
    }

    const docPath = targetButton.dataset.docPath;
    const docIdInMetadata = targetButton.dataset.docId;
    const docFileName =
      targetButton.dataset.fileName ||
      (docPath ? docPath.split("/").pop() : "document");

    if (targetButton.classList.contains("st-doc-card-download") && docPath) {
      try {
        showCustomNotification(
          `Preparing download for "${docFileName}"...`,
          "info",
          2000
        );
        const { data, error } = await supabase.storage
          .from(BUCKET_NAME)
          .download(docPath);
        if (error) throw error;
        const blob = data;
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = docFileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
        showCustomNotification(`Downloading "${docFileName}"...`, "success");
      } catch (error) {
        console.error("Error downloading document:", error);
        showCustomNotification(`Download Error: ${error.message}`, "error");
      }
    } else if (
      targetButton.classList.contains("st-doc-card-delete") &&
      docPath &&
      docIdInMetadata
    ) {
      showCustomConfirm(
        "Confirm Document Deletion",
        `Are you sure you want to delete the document "${docFileName}"? This action cannot be undone.`,
        async () => {
          try {
            targetButton.disabled = true;
            const { error: deleteStorageError } = await supabase.storage
              .from(BUCKET_NAME)
              .remove([docPath]);
            if (deleteStorageError && deleteStorageError.statusCode !== "404") {
              console.error(
                "Error deleting document from storage:",
                deleteStorageError
              );
            }

            const currentDocuments = service.documents || [];
            const updatedDocumentsMetadata = currentDocuments.filter(
              (doc) => doc.id !== docIdInMetadata
            );
            const tableName = SERVICE_TABLES[service.serviceCategoryInternal];
            const { error: updateDbError } = await supabase
              .from(tableName)
              .update({
                documents_metadata: updatedDocumentsMetadata,
                updated_at: new Date().toISOString(),
              })
              .eq("id", currentServiceIdForDocs);

            if (updateDbError) {
              console.error(
                "Error updating document metadata in DB after storage delete:",
                updateDbError
              );
              showCustomNotification(
                "Storage file handled, but DB update for metadata failed. Please refresh.",
                "warning"
              );
            } else {
              service.documents = updatedDocumentsMetadata;
              renderServiceDocuments(currentServiceIdForDocs);
            }
          } catch (error) {
            console.error("Exception during document deletion:", error);
            showCustomNotification(
              `Error deleting document: ${error.message}`,
              "error"
            );
          } finally {
            targetButton.disabled = false;
          }
        }
      );
    }
  }

  // SECTION 9: DATATABLE SETUP AND DASHBOARD FUNCTIONS
  const commonColumnConfig = {
    className: "dt-center",
    manageStatusActions: {
      title: "Actions",
      data: null,
      orderable: false,
      searchable: false,
      className: "dt-center st-actions-column",
      render: function (data, type, row) {
        let completeButtonDisabled =
          COMPLETED_STATUSES.includes(row.status) ||
          row.status === CANCELLED_STATUS
            ? "disabled"
            : "";
        return `<div class="st-table-actions">
                        <button data-action="complete" title="Complete Service" class="complete-action" ${completeButtonDisabled}><i class='bx bx-check-square'></i></button>
                        <button data-action="delete" title="Delete Service" class="delete"><i class='bx bx-trash'></i></button>
                    </div>`;
      },
    },
    viewEditActions: {
      title: "View/Edit",
      data: null,
      orderable: false,
      searchable: false,
      className: "dt-center st-actions-column",
      render: function (data, type, row) {
        return `<div class="st-table-actions">
                        <button data-action="view" title="View Details"><i class='bx bx-show'></i></button>
                        <button data-action="edit" title="Edit Service"><i class='bx bx-edit'></i></button>
                    </div>`;
      },
    },
    docsAction: {
      title: "Docs",
      data: null,
      orderable: false,
      searchable: false,
      className: "dt-center st-actions-column",
      render: function (data, type, row) {
        return `<div class="st-table-actions">
                        <button data-action="docs" title="Manage Documents"><i class='bx bx-file'></i> Docs</button>
                    </div>`;
      },
    },
    service_display_id: {
      title: "Service ID",
      data: "service_display_id",
      className: "dt-left",
    },
    user_email: {
      title: "Created By",
      data: "user_email",
      className: "dt-left",
    },
    customer: { title: "Customer", data: "customer", className: "dt-left" },
    etd: { title: "ETD", data: "etd", type: "date", className: "dt-center" },
    eta: { title: "ETA", data: "eta", type: "date", className: "dt-center" },
    pol: { title: "Origin", data: "pol", className: "dt-left" },
    pod: { title: "Destination", data: "pod", className: "dt-left" },
    mblHawbPro: {
      title: "Main Ref.",
      data: "mblHawbPro",
      className: "dt-left",
    },
    status: { title: "Status", data: "status", className: "dt-center" },
    internal_id: { title: "Internal ID", data: "id", visible: false },
    serviceCategoryIcon: {
      title: "Type",
      data: "serviceCategoryIcon",
      className: "dt-center",
    },
    oceanServiceType: {
      title: "Ocean Service Type",
      data: "oceanServiceType",
      className: "dt-left",
    },
    oceanService: {
      title: "Ocean Service",
      data: "oceanService",
      className: "dt-left",
    },
    hbl: { title: "HBL", data: "hbl", className: "dt-left" },
    containerNumber: {
      title: "Container #",
      data: "containerNumber",
      className: "dt-left",
    },
    containerType: {
      title: "Cont. Type",
      data: "containerType",
      className: "dt-left",
    },
    sealNumber: { title: "Seal #", data: "sealNumber", className: "dt-left" },
    flightNumber: {
      title: "Flight #",
      data: "flightNumber",
      className: "dt-left",
    },
    hawb: { title: "HAWB", data: "hawb", className: "dt-left" },
    dimensions: {
      title: "Dimensions",
      data: "dimensions",
      className: "dt-left",
    },
    truckServiceType: {
      title: "Truck Service Type",
      data: "truckServiceType",
      className: "dt-left",
    },
    cbm: { title: "CBM", data: "cbm", type: "num", className: "dt-right" },
    shipper: { title: "Shipper", data: "shipper", className: "dt-left" },
    consignee: { title: "Consignee", data: "consignee", className: "dt-left" },
    carrier: { title: "Carrier", data: "carrier", className: "dt-left" },
    finalDestination: {
      title: "Final Dest.",
      data: "finalDestination",
      className: "dt-left",
    },
    numPackages: {
      title: "# Packages",
      data: "numPackages",
      type: "num",
      className: "dt-right",
    },
    grossWeight: {
      title: "Gross Wt.",
      data: "grossWeight",
      type: "num",
      className: "dt-right",
    },
    commodityDescription: {
      title: "Commodity",
      data: "commodityDescription",
      className: "dt-left",
    },
    htsCode: { title: "HTS Code", data: "htsCode", className: "dt-left" },
  };
  const columnDefinitions = {
    all: [
      commonColumnConfig.service_display_id,
      commonColumnConfig.serviceCategoryIcon,
      commonColumnConfig.customer,
      commonColumnConfig.user_email,
      commonColumnConfig.etd,
      commonColumnConfig.eta,
      commonColumnConfig.pol,
      commonColumnConfig.pod,
      commonColumnConfig.mblHawbPro,
      commonColumnConfig.status,
      commonColumnConfig.manageStatusActions,
      commonColumnConfig.viewEditActions,
      commonColumnConfig.docsAction,
      commonColumnConfig.internal_id,
    ],
    ocean: [
      commonColumnConfig.service_display_id,
      commonColumnConfig.customer,
      commonColumnConfig.user_email,
      commonColumnConfig.oceanServiceType,
      commonColumnConfig.oceanService,
      commonColumnConfig.etd,
      commonColumnConfig.eta,
      commonColumnConfig.shipper,
      commonColumnConfig.consignee,
      commonColumnConfig.carrier,
      { ...commonColumnConfig.pol, title: "POL (Ocean)" },
      { ...commonColumnConfig.pod, title: "POD (Ocean)" },
      commonColumnConfig.finalDestination,
      { ...commonColumnConfig.mblHawbPro, title: "MBL" },
      commonColumnConfig.hbl,
      commonColumnConfig.containerNumber,
      commonColumnConfig.containerType,
      commonColumnConfig.sealNumber,
      commonColumnConfig.numPackages,
      commonColumnConfig.grossWeight,
      commonColumnConfig.commodityDescription,
      commonColumnConfig.htsCode,
      commonColumnConfig.status,
      commonColumnConfig.manageStatusActions,
      commonColumnConfig.viewEditActions,
      commonColumnConfig.docsAction,
      commonColumnConfig.internal_id,
    ],
    air: [
      commonColumnConfig.service_display_id,
      commonColumnConfig.customer,
      commonColumnConfig.user_email,
      commonColumnConfig.etd,
      commonColumnConfig.eta,
      commonColumnConfig.shipper,
      commonColumnConfig.consignee,
      commonColumnConfig.carrier,
      commonColumnConfig.flightNumber,
      { ...commonColumnConfig.pol, title: "POL (Air)" },
      { ...commonColumnConfig.pod, title: "POD (Air)" },
      commonColumnConfig.finalDestination,
      { ...commonColumnConfig.mblHawbPro, title: "MAWB" },
      commonColumnConfig.hawb,
      commonColumnConfig.numPackages,
      commonColumnConfig.grossWeight,
      commonColumnConfig.dimensions,
      commonColumnConfig.commodityDescription,
      commonColumnConfig.htsCode,
      commonColumnConfig.status,
      commonColumnConfig.manageStatusActions,
      commonColumnConfig.viewEditActions,
      commonColumnConfig.docsAction,
      commonColumnConfig.internal_id,
    ],
    truck: [
      commonColumnConfig.service_display_id,
      commonColumnConfig.customer,
      commonColumnConfig.user_email,
      commonColumnConfig.truckServiceType,
      commonColumnConfig.etd,
      commonColumnConfig.eta,
      commonColumnConfig.shipper,
      commonColumnConfig.consignee,
      commonColumnConfig.carrier,
      { ...commonColumnConfig.pol, title: "Origin (Truck)" },
      { ...commonColumnConfig.pod, title: "Destination (Truck)" },
      commonColumnConfig.finalDestination,
      { ...commonColumnConfig.mblHawbPro, title: "PRO #" },
      commonColumnConfig.numPackages,
      commonColumnConfig.grossWeight,
      commonColumnConfig.dimensions,
      commonColumnConfig.cbm,
      commonColumnConfig.commodityDescription,
      commonColumnConfig.htsCode,
      commonColumnConfig.status,
      commonColumnConfig.manageStatusActions,
      commonColumnConfig.viewEditActions,
      commonColumnConfig.docsAction,
      commonColumnConfig.internal_id,
    ],
  };
  function getCurrentMonthRange() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();

    const startDate = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));

    const nextMonthFirstDay = new Date(
      Date.UTC(year, month + 1, 1, 0, 0, 0, 0)
    );
    const lastDayCurrentMonth = new Date(nextMonthFirstDay.getTime() - 1);
    const displayEndDate = new Date(
      Date.UTC(
        lastDayCurrentMonth.getUTCFullYear(),
        lastDayCurrentMonth.getUTCMonth(),
        lastDayCurrentMonth.getUTCDate(),
        23,
        59,
        59,
        999
      )
    );

    const todayUTC = new Date(
      Date.UTC(year, month, now.getUTCDate(), 0, 0, 0, 0)
    );

    return { startDate, displayEndDate, todayUTC };
  }
  function filterServicesForCurrentMonthDisplay(services) {
    const { startDate, displayEndDate, todayUTC } = getCurrentMonthRange();

    return services.filter((service) => {
      if (
        COMPLETED_STATUSES.includes(service.status) ||
        service.status === CANCELLED_STATUS
      ) {
        return false;
      }

      const etdString =
        service.etd && service.etd !== "N/A" ? service.etd : null;
      const etaString =
        service.eta && service.eta !== "N/A" ? service.eta : null;

      const etdDate = etdString
        ? new Date(
            etdString.includes("T") || etdString.includes("Z")
              ? etdString
              : etdString + "T00:00:00Z"
          )
        : null;
      const etaDate = etaString
        ? new Date(
            etaString.includes("T") || etaString.includes("Z")
              ? etaString
              : etaString + "T00:00:00Z"
          )
        : null;

      const etdInMonth =
        etdDate && etdDate >= startDate && etdDate <= displayEndDate;
      const etaInMonth =
        etaDate && etaDate >= startDate && etaDate <= displayEndDate;

      if (etdInMonth || etaInMonth) return true;

      if (
        etdDate &&
        etdDate < startDate &&
        etaDate &&
        etaDate >= todayUTC &&
        etaDate <= displayEndDate
      ) {
        return true;
      }
      if (etaDate && etaDate >= startDate && etaDate < todayUTC) {
        return true;
      }

      return false;
    });
  }
  function updateDashboard(servicesForDashboard) {
    if (!dbTotalServicesEl) return;

    const currentMonthServicesForDashboard =
      filterServicesForCurrentMonthDisplay(servicesForDashboard);

    dbTotalServicesEl.textContent = currentMonthServicesForDashboard.length;
    dbOceanServicesEl.textContent = currentMonthServicesForDashboard.filter(
      (s) => s.serviceCategoryInternal === "ocean"
    ).length;
    dbAirServicesEl.textContent = currentMonthServicesForDashboard.filter(
      (s) => s.serviceCategoryInternal === "air"
    ).length;
    dbTruckServicesEl.textContent = currentMonthServicesForDashboard.filter(
      (s) => s.serviceCategoryInternal === "truck"
    ).length;

    const { startDate: monthStart, displayEndDate: monthEnd } =
      getCurrentMonthRange();
    dbCompletedServicesEl.textContent = servicesForDashboard.filter((s) => {
      if (!COMPLETED_STATUSES.includes(s.status)) return false;
      const etdDate =
        s.etd && s.etd !== "N/A" ? new Date(s.etd + "T00:00:00Z") : null;
      const etaDate =
        s.eta && s.eta !== "N/A" ? new Date(s.eta + "T00:00:00Z") : null;
      return (
        (etdDate && etdDate >= monthStart && etdDate <= monthEnd) ||
        (etaDate && etaDate >= monthStart && etaDate <= monthEnd)
      );
    }).length;

    dbInProgressServicesEl.textContent =
      currentMonthServicesForDashboard.filter((s) =>
        IN_PROGRESS_STATUSES.includes(s.status)
      ).length;

    updateUpcomingDeadlines(currentMonthServicesForDashboard);
  }
  function updateUpcomingDeadlines(servicesData) {
    if (!dbUpcomingListEl) return;

    const todayStartOfDayUTC = new Date(new Date().setUTCHours(0, 0, 0, 0));

    const upcomingServices = servicesData
      .filter(
        (s) =>
          !COMPLETED_STATUSES.includes(s.status) &&
          s.status !== CANCELLED_STATUS
      )
      .map((s) => {
        const etd =
          s.etd && s.etd !== "N/A"
            ? new Date(
                s.etd.includes("T") || s.etd.includes("Z")
                  ? s.etd
                  : s.etd + "T00:00:00Z"
              )
            : null;
        const eta =
          s.eta && s.eta !== "N/A"
            ? new Date(
                s.eta.includes("T") || s.eta.includes("Z")
                  ? s.eta
                  : s.eta + "T00:00:00Z"
              )
            : null;
        let relevantDate = null;
        let dateType = "";

        const upcomingEtd = etd && etd >= todayStartOfDayUTC ? etd : null;
        const upcomingEta = eta && eta >= todayStartOfDayUTC ? eta : null;

        if (upcomingEtd && upcomingEta) {
          relevantDate = upcomingEtd <= upcomingEta ? upcomingEtd : upcomingEta;
          dateType = upcomingEtd <= upcomingEta ? "ETD" : "ETA";
        } else if (upcomingEtd) {
          relevantDate = upcomingEtd;
          dateType = "ETD";
        } else if (upcomingEta) {
          relevantDate = upcomingEta;
          dateType = "ETA";
        }
        return { ...s, relevantDate, dateType };
      })
      .filter((s) => s.relevantDate)
      .sort((a, b) => a.relevantDate - b.relevantDate);

    dbUpcomingListEl.innerHTML = "";
    if (upcomingServices.length === 0) {
      dbUpcomingListEl.innerHTML = `<li class="no-upcoming-data">No upcoming services to display.</li>`;
      return;
    }

    upcomingServices.slice(0, 3).forEach((service) => {
      const li = document.createElement("li");
      const dateString = service.relevantDate.toLocaleDateString("en-US", {
        timeZone: "UTC",
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      let categoryEmoji = getCategoryTextAndClass(
        service.serviceCategoryInternal
      ).text.split(" ")[0];
      li.innerHTML = `<span class="service-id">${categoryEmoji} ${
        service.service_display_id
      }</span><span class="service-customer">${
        service.customer || "N/A"
      }</span><span class="service-date"><strong>${
        service.dateType
      }:</strong> ${dateString}</span>`;
      dbUpcomingListEl.appendChild(li);
    });
  }

  function refreshMainServicesTable() {
    if (!servicesTableHtmlElement || !tableViewTypeSelect) {
      console.warn(
        "ST Module: Main services table HTML element or tableViewTypeSelect not found for refresh."
      );
      return;
    }
    if (
      !servicesDataTable ||
      !$.fn.DataTable.isDataTable(servicesTableHtmlElement)
    ) {
      console.log(
        "ST Module: Main DataTable not initialized or JS instance lost, calling initializeOrUpdateTable for setup."
      );
      initializeOrUpdateTable(
        tableViewTypeSelect.value,
        servicesTableHtmlElement,
        null,
        null
      );
      return;
    }

    const viewType = tableViewTypeSelect.value;
    console.log(
      "ST Module: Refreshing main table data. ViewType:",
      viewType,
      "allServicesData count:",
      allServicesData.length
    );

    const tableData = allServicesData.filter((s) => {
      if (
        COMPLETED_STATUSES.includes(s.status) ||
        s.status === CANCELLED_STATUS
      ) {
        return false;
      }
      if (viewType !== "all" && s.serviceCategoryInternal !== viewType) {
        return false;
      }
      return filterServicesForCurrentMonthDisplay([s]).length > 0;
    });

    console.log(
      "ST Module: Data for main table refresh (after filtering):",
      tableData.length
    );
    servicesDataTable.clear().rows.add(tableData).draw(false);
    updateDashboard(allServicesData);
  }

  function initializeOrUpdateTable(
    viewType = "all",
    tableElement = servicesTableHtmlElement,
    columns = null,
    dataToLoad = null,
    orderByIdx = null
  ) {
    if (!tableElement) {
      console.warn(
        "ST Module: initializeOrUpdateTable - Table element not found for view:",
        viewType
      );
      return null;
    }
    $(tableElement).attr("data-viewtype", viewType);

    let tableDataForInit;
    const isMainServicesTable = tableElement === servicesTableHtmlElement;
    const currentDtInstance = $.fn.DataTable.isDataTable(tableElement)
      ? $(tableElement).DataTable()
      : null;
    const newColumnsDefinition =
      columns || columnDefinitions[viewType] || columnDefinitions.all;

    const isStructuralChange =
      columns !== null ||
      !currentDtInstance ||
      currentDtInstance.columns().count() !== newColumnsDefinition.length;

    if (dataToLoad !== null) {
      tableDataForInit = dataToLoad;
    } else if (isMainServicesTable) {
      tableDataForInit = allServicesData.filter((s) => {
        if (
          COMPLETED_STATUSES.includes(s.status) ||
          s.status === CANCELLED_STATUS
        )
          return false;
        if (viewType !== "all" && s.serviceCategoryInternal !== viewType)
          return false;
        return filterServicesForCurrentMonthDisplay([s]).length > 0;
      });
    } else {
      tableDataForInit = allServicesData.filter(
        (s) => viewType === "all" || s.serviceCategoryInternal === viewType
      );
    }

    if (
      isMainServicesTable &&
      currentDtInstance &&
      !isStructuralChange &&
      dataToLoad === null
    ) {
      console.log(
        "ST Module: initializeOrUpdateTable redirecting to refreshMainServicesTable for data-only update on main table."
      );
      refreshMainServicesTable();
      return servicesDataTable;
    }

    console.log(
      `ST Module: Full (Re)Initialization of table for viewType: ${viewType}. Data count: ${tableDataForInit?.length}. Structural Change: ${isStructuralChange}`
    );

    const defaultOrderIdx =
      orderByIdx !== null
        ? orderByIdx
        : newColumnsDefinition.findIndex(
            (c) =>
              c.data === "service_display_id" ||
              c.data === "etd" ||
              c.data === "created_at"
          );
    const orderDirection =
      newColumnsDefinition[defaultOrderIdx]?.data === "etd" &&
      viewType === "all" &&
      isMainServicesTable
        ? "asc"
        : "desc";

    if (isMainServicesTable) {
      updateDashboard(allServicesData);
    }

    if (currentDtInstance) {
      console.log(
        `ST Module: Destroying existing DataTable for ${tableElement.id}`
      );
      currentDtInstance.clear().destroy();
      if (isMainServicesTable) {
        servicesDataTable = null;
      } else if (tableElement === archiveServicesTableHtmlElement) {
        archiveServicesDataTable = null;
      }
    }

    if (!tableElement.querySelector("thead")) {
      const thead = document.createElement("thead");
      tableElement.appendChild(thead);
    }
    if (!tableElement.querySelector("tbody")) {
      const tbody = document.createElement("tbody");
      tableElement.appendChild(tbody);
    }

    const thead = tableElement.querySelector("thead");
    if (!thead) {
      console.error(
        "ST Module: Could not find or create thead in tableElement for view:",
        viewType
      );
      return null;
    }

    let headerHtml = "<tr>";
    newColumnsDefinition.forEach((col) => {
      if (col.visible !== false) headerHtml += `<th>${col.title}</th>`;
    });
    headerHtml += "</tr>";
    thead.innerHTML = headerHtml;

    let dtInstance = null;
    try {
      if (typeof $ === "function" && $.fn.DataTable) {
        dtInstance = $(tableElement).DataTable({
          data: tableDataForInit,
          columns: newColumnsDefinition,
          scrollX: true,
          autoWidth: false,
          responsive: true,
          language: {
            search: "Search:",
            lengthMenu: "Show _MENU_ entries",
            info: "Showing _START_ to _END_ of _TOTAL_ entries",
            infoEmpty: "No services to display",
            infoFiltered: "(filtered from _MAX_ total)",
            paginate: {
              first: "<i class='bx bx-chevrons-left'></i>",
              last: "<i class='bx bx-chevrons-right'></i>",
              next: "<i class='bx bx-chevron-right'></i>",
              previous: "<i class='bx bx-chevron-left'></i>",
            },
            emptyTable: `No ${
              viewType !== "all" ? viewType : ""
            } services found${
              isMainServicesTable ? " for the current month" : ""
            }.`,
          },
          order: [[defaultOrderIdx >= 0 ? defaultOrderIdx : 0, orderDirection]],
          createdRow: function (row, data, dataIndex) {
            if (data && data.serviceCategoryInternal)
              $(row).addClass(
                getCategoryTextAndClass(data.serviceCategoryInternal).rowClass
              );
          },
          drawCallback: function (settings) {
            var api = new $.fn.dataTable.Api(settings);
            if (api.responsive) {
              api.responsive.recalc();
            }
            api.columns.adjust();
          },
        });
      } else {
        showCustomNotification(
          "Critical Error: Table functionality (jQuery/DataTables) is unavailable.",
          "error",
          7000
        );
      }
    } catch (e) {
      showCustomNotification(
        `Error initializing table for ${viewType}: ${e.message}.`,
        "error",
        7000
      );
      console.error(
        `ST Module: EXCEPTION initializing DataTables for view '${viewType}':`,
        e
      );
    }

    if (isMainServicesTable) {
      servicesDataTable = dtInstance;
    } else if (tableElement === archiveServicesTableHtmlElement) {
      archiveServicesDataTable = dtInstance;
    }
    return dtInstance;
  }

  // SECTION 10: ARCHIVE MODAL LOGIC
  function populateArchiveMonthSelect() {
    if (!archiveMonthSelect) return;
    archiveMonthSelect.innerHTML = "";
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
    const currentMonth = new Date().getMonth();
    months.forEach((month, index) => {
      const option = document.createElement("option");
      option.value = index;
      option.textContent = month;
      if (index === currentMonth) option.selected = true;
      archiveMonthSelect.appendChild(option);
    });
  }
  function populateArchiveYearSelect() {
    if (!archiveYearSelect) return;

    archiveYearSelect.innerHTML = "";
    const serviceYears = new Set();
    allServicesData.forEach((service) => {
      if (service.etd && service.etd !== "N/A")
        serviceYears.add(new Date(service.etd + "T00:00:00Z").getUTCFullYear());
      if (service.eta && service.eta !== "N/A")
        serviceYears.add(new Date(service.eta + "T00:00:00Z").getUTCFullYear());
    });

    const currentYear = new Date().getFullYear();
    serviceYears.add(currentYear);

    const minServiceYear =
      serviceYears.size > 0
        ? Math.min(...Array.from(serviceYears).filter((y) => !isNaN(y)))
        : currentYear;
    const startYear = Math.min(currentYear - 5, minServiceYear);
    const endYear = Math.max(
      currentYear + 1,
      ...Array.from(serviceYears).filter((y) => !isNaN(y)),
      currentYear
    );

    for (let y = endYear; y >= startYear; y--) {
      serviceYears.add(y);
    }

    const sortedYears = Array.from(serviceYears)
      .filter((y) => !isNaN(y))
      .sort((a, b) => b - a);
    if (sortedYears.length === 0) sortedYears.push(currentYear);

    sortedYears.forEach((year) => {
      const option = document.createElement("option");
      option.value = year;
      option.textContent = year;
      if (year === currentYear) option.selected = true;
      archiveYearSelect.appendChild(option);
    });
    archiveYearsPopulated = true;
    console.log("ST Module: Archive years populated.");
  }
  function handleFilterArchive() {
    if (
      !archiveMonthSelect ||
      !archiveYearSelect ||
      !archiveServiceTypeSelect ||
      !archiveTotalResultsEl ||
      !noArchiveResultsMessageEl
    )
      return;

    const selectedMonth = parseInt(archiveMonthSelect.value, 10);
    const selectedYear = parseInt(archiveYearSelect.value, 10);
    const selectedServiceType = archiveServiceTypeSelect.value;

    const dataForArchive = allServicesData.filter((service) => {
      const isCompletedOrCancelled =
        COMPLETED_STATUSES.includes(service.status) ||
        service.status === CANCELLED_STATUS;
      if (!isCompletedOrCancelled) return false;

      const typeMatches =
        selectedServiceType === "all" ||
        service.serviceCategoryInternal === selectedServiceType;
      if (!typeMatches) return false;

      const etdDate =
        service.etd && service.etd !== "N/A"
          ? new Date(
              service.etd.includes("T") || service.etd.includes("Z")
                ? service.etd
                : service.etd + "T00:00:00Z"
            )
          : null;
      const etaDate =
        service.eta && service.eta !== "N/A"
          ? new Date(
              service.eta.includes("T") || service.eta.includes("Z")
                ? service.eta
                : service.eta + "T00:00:00Z"
            )
          : null;

      const dateMatchesSelection = (date) =>
        date &&
        date.getUTCFullYear() === selectedYear &&
        date.getUTCMonth() === selectedMonth;

      return (
        (etdDate && dateMatchesSelection(etdDate)) ||
        (etaDate && dateMatchesSelection(etaDate))
      );
    });

    archiveTotalResultsEl.textContent = `Results: ${dataForArchive.length}`;
    if (dataForArchive.length === 0) {
      if (
        archiveServicesDataTable &&
        $.fn.DataTable.isDataTable(archiveServicesTableHtmlElement)
      ) {
        archiveServicesDataTable.clear().draw();
      } else if (archiveServicesTableHtmlElement.querySelector("tbody")) {
        archiveServicesTableHtmlElement.querySelector("tbody").innerHTML = "";
      }
      noArchiveResultsMessageEl.style.display = "block";
      noArchiveResultsMessageEl.textContent =
        "No services found for the selected month, year, and type.";
    } else {
      noArchiveResultsMessageEl.style.display = "none";
      const archiveColumns = [...columnDefinitions.all];
      archiveServicesDataTable = initializeOrUpdateTable(
        selectedServiceType,
        archiveServicesTableHtmlElement,
        archiveColumns,
        dataForArchive,
        0
      );
    }
  }

  // SECTION 11: PROGRESS NOTIFICATION MODAL LOGIC
  function getEtaProximityClass(etaStr) {
    if (!etaStr || etaStr === "N/A") return "";
    const now = new Date();
    const todayStartOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );

    const etaDateUTC = new Date(
      etaStr.includes("T") || etaStr.includes("Z")
        ? etaStr
        : etaStr + "T00:00:00Z"
    );
    if (isNaN(etaDateUTC.getTime())) return "";

    const etaYear = etaDateUTC.getUTCFullYear();
    const etaMonth = etaDateUTC.getUTCMonth();
    const etaDay = etaDateUTC.getUTCDate();
    const etaStartOfDayLocal = new Date(etaYear, etaMonth, etaDay);

    const diffTime = etaStartOfDayLocal.getTime() - todayStartOfDay.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return "progress-overdue";
    if (diffDays === 0) return "progress-red";
    if (diffDays === 1) return "progress-red";
    if (diffDays <= 3) return "progress-orange";
    return "progress-yellow";
  }
  function showProgressNotificationModal(isManualCall = false) {
    if (
      !progressNotificationModal ||
      !progressNotificationTableBody ||
      !noProgressServicesMessage
    )
      return;

    if (!isManualCall) {
      const criticalModals = [
        createServiceModal,
        viewServiceModal,
        editServiceModal,
        docManagementModal,
        archiveServiceModal,
        confirmModalElement,
      ];
      if (
        criticalModals.some(
          (modal) => modal && modal.classList.contains("st-modal-open")
        )
      ) {
        console.log(
          "ST Module: Progress notification skipped, a critical modal is open."
        );
        return;
      }
    }

    const now = new Date();
    const todayStartOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );

    const relevantServices = allServicesData.filter((service) => {
      const etdValid = service.etd && service.etd !== "N/A";
      const etaValid = service.eta && service.eta !== "N/A";
      if (!etdValid || !etaValid) return false;

      const etdDate = new Date(
        service.etd.includes("T") || service.etd.includes("Z")
          ? service.etd
          : service.etd + "T00:00:00Z"
      );
      const etaDate = new Date(
        service.eta.includes("T") || service.eta.includes("Z")
          ? service.eta
          : service.eta + "T00:00:00Z"
      );
      if (isNaN(etdDate.getTime()) || isNaN(etaDate.getTime())) return false;

      const isEligibleByStatus =
        !COMPLETED_STATUSES.includes(service.status) &&
        service.status !== CANCELLED_STATUS;

      const etdStartOfDayLocal = new Date(
        etdDate.getUTCFullYear(),
        etdDate.getUTCMonth(),
        etdDate.getUTCDate()
      );
      const etaStartOfDayLocal = new Date(
        etaDate.getUTCFullYear(),
        etaDate.getUTCMonth(),
        etaDate.getUTCDate()
      );

      const isAfterETD = todayStartOfDay >= etdStartOfDayLocal;
      let isBeforeRelevantETA;
      if (isManualCall) {
        isBeforeRelevantETA = todayStartOfDay <= etaStartOfDayLocal;
      } else {
        isBeforeRelevantETA = todayStartOfDay < etaStartOfDayLocal;
      }
      return isEligibleByStatus && isAfterETD && isBeforeRelevantETA;
    });

    if (relevantServices.length === 0) {
      noProgressServicesMessage.style.display = "block";
      noProgressServicesMessage.textContent =
        "No active services currently in transit to display.";
      progressNotificationTableBody.innerHTML = "";
      if (isManualCall) {
        openModal(progressNotificationModal);
      }
      return;
    }

    noProgressServicesMessage.style.display = "none";
    progressNotificationTableBody.innerHTML = "";

    const servicesToDisplay = relevantServices
      .map((service) => {
        const etaDateForSort = new Date(
          service.eta.includes("T") || service.eta.includes("Z")
            ? service.eta
            : service.eta + "T00:00:00Z"
        );
        return { ...service, etaDateForSort };
      })
      .sort((a, b) => a.etaDateForSort - b.etaDateForSort);

    servicesToDisplay.forEach((service) => {
      const row = progressNotificationTableBody.insertRow();
      const proximityClass = getEtaProximityClass(service.eta);
      if (proximityClass) row.classList.add(proximityClass);

      row.insertCell().innerHTML = service.service_display_id || "N/A";
      row.insertCell().innerHTML = service.serviceCategoryIcon || "N/A";
      row.insertCell().textContent = service.customer || "N/A";
      row.insertCell().textContent = service.etd || "N/A";
      row.insertCell().textContent = service.eta || "N/A";
      row.insertCell().textContent = service.status || "N/A";
    });
    openModal(progressNotificationModal);
  }
  function scheduleDailyNotifications() {
    scheduledNotificationTimeouts.forEach((timeoutId) =>
      clearTimeout(timeoutId)
    );
    scheduledNotificationTimeouts = [];
    const now = new Date();

    NOTIFICATION_TIMES_TIJUANA.forEach((targetHour) => {
      if (
        targetHour >= OPERATING_HOUR_START_TIJUANA &&
        targetHour < OPERATING_HOUR_END_TIJUANA
      ) {
        let notificationTimeToday = new Date();
        let targetUTCHour = (targetHour - TIJUANA_UTC_OFFSET + 24) % 24;

        notificationTimeToday.setUTCHours(targetUTCHour, 0, 0, 0);

        if (notificationTimeToday.getTime() <= now.getTime()) {
          notificationTimeToday.setUTCDate(
            notificationTimeToday.getUTCDate() + 1
          );
        }

        const delay = notificationTimeToday.getTime() - now.getTime();
        if (delay > 0) {
          console.log(
            `ST Module: Scheduling progress notification for ${notificationTimeToday.toLocaleString(
              "en-US",
              { timeZone: "America/Tijuana" }
            )} (in ${Math.round(delay / 60000)} mins)`
          );
          const timeoutId = setTimeout(() => {
            if (isWithinOperatingHours()) {
              showProgressNotificationModal(false);
            }
          }, delay);
          scheduledNotificationTimeouts.push(timeoutId);
        }
      }
    });

    let tomorrow = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
      0,
      5,
      0
    );
    let delayUntilTomorrow = tomorrow.getTime() - now.getTime();
    if (delayUntilTomorrow < 0) delayUntilTomorrow += 24 * 60 * 60 * 1000;

    console.log(
      `ST Module: Scheduling daily re-scheduler for ${tomorrow.toLocaleString(
        "en-US",
        { timeZone: "America/Tijuana" }
      )}`
    );
    const dailyRescheduleTimeout = setTimeout(
      scheduleDailyNotifications,
      delayUntilTomorrow
    );
    scheduledNotificationTimeouts.push(dailyRescheduleTimeout);
  }
  function setupProgressNotifications() {
    scheduledNotificationTimeouts.forEach((timeoutId) =>
      clearTimeout(timeoutId)
    );
    scheduledNotificationTimeouts = [];
    scheduleDailyNotifications();
  }

  // SECTION 12: GENERAL EVENT LISTENERS
  function initCreateModalListeners() {
    if (openServiceModalBtn)
      openServiceModalBtn.addEventListener("click", () => {
        if (createServiceModal) {
          if (serviceCategoryModalSelect) serviceCategoryModalSelect.value = "";
          if (chargesContainerCreate) chargesContainerCreate.innerHTML = "";
          handleCreateCategoryChange();
          openModal(createServiceModal);
        }
      });
    if (closeCreateServiceModalBtn)
      closeCreateServiceModalBtn.addEventListener("click", () =>
        closeModal(createServiceModal, newServiceForm)
      );
    if (cancelCreateServiceBtn)
      cancelCreateServiceBtn.addEventListener("click", () =>
        closeModal(createServiceModal, newServiceForm)
      );
    if (createServiceModal)
      createServiceModal.addEventListener("click", (event) => {
        if (event.target === createServiceModal)
          closeModal(createServiceModal, newServiceForm);
      });
    if (serviceCategoryModalSelect)
      serviceCategoryModalSelect.addEventListener(
        "change",
        handleCreateCategoryChange
      );
    if (addIsfLaterCheckboxModal)
      addIsfLaterCheckboxModal.addEventListener(
        "change",
        validateIsfCreateModal
      );
    if (isfFileInputModal)
      isfFileInputModal.addEventListener("change", validateIsfCreateModal);
    if (
      addChargeBtnCreate &&
      chargesContainerCreate &&
      serviceCategoryModalSelect
    ) {
      addChargeBtnCreate.addEventListener("click", () => {
        const currentServiceType = serviceCategoryModalSelect.value;
        if (!currentServiceType) {
          showCustomNotification(
            "Please select a service type first to add charges.",
            "warning"
          );
          return;
        }
        chargesContainerCreate.appendChild(
          createChargeRowElement(currentServiceType, null, true)
        );
      });
    }
  }
  function initViewModalListeners() {
    if (closeViewServiceModalBtn)
      closeViewServiceModalBtn.addEventListener("click", () =>
        closeModal(viewServiceModal)
      );
    if (closeViewModalFooterBtn)
      closeViewModalFooterBtn.addEventListener("click", () =>
        closeModal(viewServiceModal)
      );
    if (viewServiceModal)
      viewServiceModal.addEventListener("click", (event) => {
        if (event.target === viewServiceModal) closeModal(viewServiceModal);
      });
  }
  function initEditModalListeners() {
    if (closeEditServiceModalBtn)
      closeEditServiceModalBtn.addEventListener("click", () =>
        closeModal(editServiceModal, editServiceForm)
      );
    if (cancelEditServiceBtn)
      cancelEditServiceBtn.addEventListener("click", () =>
        closeModal(editServiceModal, editServiceForm)
      );
    if (editServiceModal)
      editServiceModal.addEventListener("click", (event) => {
        if (event.target === editServiceModal)
          closeModal(editServiceModal, editServiceForm);
      });
    if (editAddIsfLaterModalCheckbox)
      editAddIsfLaterModalCheckbox.addEventListener(
        "change",
        validateIsfEditModal
      );
    if (editIsfFileModalInput)
      editIsfFileModalInput.addEventListener("change", validateIsfEditModal);
    if (
      addChargeBtnEdit &&
      chargesContainerEdit &&
      editServiceCategoryModalSelect
    ) {
      addChargeBtnEdit.addEventListener("click", () => {
        const currentServiceType = editServiceCategoryModalSelect.value;
        if (!currentServiceType) {
          showCustomNotification(
            "Service type is not defined for editing charges.",
            "error"
          );
          return;
        }
        chargesContainerEdit.appendChild(
          createChargeRowElement(currentServiceType, null, true)
        );
      });
    }
  }
  function initDocManagementModalListeners() {
    if (closeDocModalBtn)
      closeDocModalBtn.addEventListener("click", () =>
        closeModal(docManagementModal)
      );
    if (closeDocModalFooterBtn)
      closeDocModalFooterBtn.addEventListener("click", () =>
        closeModal(docManagementModal)
      );
    if (docManagementModal)
      docManagementModal.addEventListener("click", (event) => {
        if (event.target === docManagementModal) closeModal(docManagementModal);
      });
  }
  function initArchiveModalListeners() {
    if (openArchiveModalBtn) {
      openArchiveModalBtn.addEventListener("click", () => {
        if (archiveServiceModal) {
          populateArchiveMonthSelect();
          if (!archiveYearsPopulated) populateArchiveYearSelect();
          handleFilterArchive();
          openModal(archiveServiceModal);
        }
      });
    }
    if (closeArchiveServiceModalBtn)
      closeArchiveServiceModalBtn.addEventListener("click", () =>
        closeModal(archiveServiceModal)
      );
    if (closeArchiveModalFooterBtn)
      closeArchiveModalFooterBtn.addEventListener("click", () =>
        closeModal(archiveServiceModal)
      );
    if (archiveServiceModal)
      archiveServiceModal.addEventListener("click", (event) => {
        if (event.target === archiveServiceModal)
          closeModal(archiveServiceModal);
      });
    if (filterArchiveBtn)
      filterArchiveBtn.addEventListener("click", handleFilterArchive);
  }
  function initProgressNotificationModalListeners() {
    if (closeProgressNotificationModalBtn)
      closeProgressNotificationModalBtn.addEventListener("click", () =>
        closeModal(progressNotificationModal)
      );
    if (closeProgressNotificationFooterBtn)
      closeProgressNotificationFooterBtn.addEventListener("click", () =>
        closeModal(progressNotificationModal)
      );
    if (progressNotificationModal)
      progressNotificationModal.addEventListener("click", (event) => {
        if (event.target === progressNotificationModal)
          closeModal(progressNotificationModal);
      });
    if (openProgressNotificationModalBtnManual) {
      openProgressNotificationModalBtnManual.addEventListener(
        "click",
        (event) => {
          showProgressNotificationModal(true);
        }
      );
    }
  }
  function initModalListeners() {
    initCreateModalListeners();
    initViewModalListeners();
    initEditModalListeners();
    initDocManagementModalListeners();
    initArchiveModalListeners();
    initProgressNotificationModalListeners();

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        const openModals = Array.from(
          document.querySelectorAll(".st-modal.st-modal-open")
        ).sort(
          (a, b) =>
            parseInt(b.style.zIndex || 0) - parseInt(a.style.zIndex || 0)
        );
        if (openModals.length > 0) {
          const topModal = openModals[0];
          if (topModal === createServiceModal)
            closeModal(createServiceModal, newServiceForm);
          else if (topModal === viewServiceModal) closeModal(viewServiceModal);
          else if (topModal === editServiceModal)
            closeModal(editServiceModal, editServiceForm);
          else if (topModal === docManagementModal)
            closeModal(docManagementModal);
          else if (topModal === archiveServiceModal)
            closeModal(archiveServiceModal);
          else if (topModal === progressNotificationModal)
            closeModal(progressNotificationModal);
          else if (topModal === confirmModalElement) hideCustomConfirmModal();
        }
      }
    });
  }
  if (tableViewTypeSelect) {
    tableViewTypeSelect.addEventListener("change", (event) => {
      initializeOrUpdateTable(
        event.target.value,
        servicesTableHtmlElement,
        null,
        null
      );
    });
  }
  function handleTableActions(event, tableInstance, dataArray) {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    if (!tableInstance) {
      console.warn("handleTableActions: tableInstance is null/undefined");
      return;
    }

    const rowElement = button.closest("tr");
    if (!rowElement) {
      console.warn(
        "handleTableActions: Could not find TR element for action button"
      );
      return;
    }

    let rowData;
    try {
      rowData = tableInstance.row(rowElement).data();
    } catch (e) {
      console.error("Error getting DataTable row data:", e);
      return;
    }

    if (!rowData || !rowData.id) {
      showCustomNotification(
        "Could not retrieve service ID for action. Please refresh.",
        "warning"
      );
      return;
    }

    const action = button.dataset.action;
    const serviceToProcess =
      dataArray.find((s) => s.id === rowData.id) || rowData;
    const displayIdForModalsAndConfirm =
      serviceToProcess.service_display_id ||
      serviceToProcess.id.substring(0, 8) + "...";

    switch (action) {
      case "docs":
        currentServiceIdForDocs = serviceToProcess.id;
        if (docModalServiceIdSpan)
          docModalServiceIdSpan.textContent = displayIdForModalsAndConfirm;
        populateDocCategorySelect();
        handleDocCategoryChange();
        renderServiceDocuments(currentServiceIdForDocs);
        openModal(docManagementModal);
        break;
      case "view":
        populateViewModal(serviceToProcess);
        openModal(viewServiceModal);
        break;
      case "edit":
        populateEditModal(serviceToProcess);
        openModal(editServiceModal);
        break;
      case "complete":
        if (
          COMPLETED_STATUSES.includes(serviceToProcess.status) ||
          serviceToProcess.status === CANCELLED_STATUS
        ) {
          showCustomNotification(
            "This service is already completed or cancelled.",
            "info"
          );
          return;
        }
        showCustomConfirm(
          "Confirm Completion",
          `Are you sure you want to mark service <strong>${displayIdForModalsAndConfirm}</strong> as "Completed"? This will prepare its invoice data.`,
          () =>
            completeService(
              serviceToProcess.id,
              serviceToProcess.serviceCategoryInternal
            )
        );
        break;
      case "delete":
        const categoryInfoDel = getCategoryTextAndClass(
          serviceToProcess.serviceCategoryInternal
        );
        showCustomConfirm(
          "Confirm Deletion",
          `Are you sure you want to delete service <strong>${displayIdForModalsAndConfirm} (${categoryInfoDel.text})</strong>? Associated documents will also be deleted. This action cannot be undone.`,
          () =>
            deleteService(
              serviceToProcess.id,
              serviceToProcess.serviceCategoryInternal
            )
        );
        break;
      default:
        console.warn("Unknown table action:", action);
    }
  }
  if (servicesTableHtmlElement) {
    servicesTableHtmlElement.removeEventListener(
      "click",
      mainTableActionHandler
    );
    servicesTableHtmlElement.addEventListener("click", mainTableActionHandler);
  }
  if (archiveServicesTableHtmlElement) {
    archiveServicesTableHtmlElement.removeEventListener(
      "click",
      archiveTableActionHandler
    );
    archiveServicesTableHtmlElement.addEventListener(
      "click",
      archiveTableActionHandler
    );
  }
  function mainTableActionHandler(event) {
    if (!servicesDataTable) {
      if ($.fn.DataTable.isDataTable(servicesTableHtmlElement))
        servicesDataTable = $(servicesTableHtmlElement).DataTable();
      else {
        console.warn("Main DataTable not initialized for action handling.");
        return;
      }
    }
    handleTableActions(event, servicesDataTable, allServicesData);
  }
  function archiveTableActionHandler(event) {
    if (!archiveServicesDataTable) {
      if ($.fn.DataTable.isDataTable(archiveServicesTableHtmlElement))
        archiveServicesDataTable = $(
          archiveServicesTableHtmlElement
        ).DataTable();
      else {
        console.warn("Archive DataTable not initialized for action handling.");
        return;
      }
    }
    handleTableActions(event, archiveServicesDataTable, allServicesData);
  }

  // SECTION 13: MODULE INITIALIZATION AND AUTH STATE HANDLING (OPTIMIZED AND CORRECTED)
  async function handleServiceTrackingAuthChange(sessionUser) {
    console.log(
      "ST Module: handleServiceTrackingAuthChange called with user:",
      sessionUser?.id || "No user"
    );
    if (isSubscribingST) {
      console.warn(
        "ST Module: Subscription/auth change process already in progress, skipping."
      );
      return;
    }
    isSubscribingST = true;

    try {
      const userChanged =
        (!currentUserST && sessionUser) ||
        (currentUserST && !sessionUser) ||
        (currentUserST && sessionUser && currentUserST.id !== sessionUser.id);

      if (userChanged) {
        console.log(
          `ST Module: Auth change - User state has changed. New User: ${sessionUser?.id}, Old User: ${currentUserST?.id}`
        );
        await unsubscribeAllServiceChanges();
        currentUserST = sessionUser;

        if (sessionUser) {
          await fetchAllServices();
          await subscribeToServiceChanges();
          setupProgressNotifications();
          archiveYearsPopulated = false;
          if (archiveYearSelect) populateArchiveYearSelect();
        } else {
          allServicesData = [];
          if (
            servicesDataTable &&
            $.fn.DataTable.isDataTable(servicesTableHtmlElement)
          )
            servicesDataTable.clear().rows.add([]).draw();
          else refreshMainServicesTable();
          if (
            archiveServicesDataTable &&
            $.fn.DataTable.isDataTable(archiveServicesTableHtmlElement)
          )
            archiveServicesDataTable.clear().rows.add([]).draw();
          updateDashboard([]);
          scheduledNotificationTimeouts.forEach((timeoutId) =>
            clearTimeout(timeoutId)
          );
          scheduledNotificationTimeouts = [];
          archiveYearsPopulated = false;
          if (archiveYearSelect) populateArchiveYearSelect();
        }
      } else if (sessionUser) {
        console.log(
          `ST Module: Auth change - User session confirmed (SAME user: ${currentUserST.id}). Ensuring subscriptions are healthy.`
        );
        if (
          serviceChannels.length === 0 ||
          serviceChannels.some((ch) => ch.state !== "joined")
        ) {
          console.warn(
            "ST Module: Subscriptions not healthy or not present for current user. Re-subscribing."
          );
          await unsubscribeAllServiceChanges();
          await subscribeToServiceChanges();
        } else {
          console.log(
            "ST Module: Subscriptions appear healthy for the current user."
          );
        }
      } else {
        console.log(
          "ST Module: No active session and no previous user. Ensuring no subscriptions are active."
        );
        await unsubscribeAllServiceChanges();
        updateDashboard([]);
      }
    } catch (error) {
      console.error(
        "ST Module: Error in handleServiceTrackingAuthChange:",
        error
      );
    } finally {
      isSubscribingST = false;
      console.log("ST Module: handleServiceTrackingAuthChange finished.");
    }
  }

  window.moduleAuthChangeHandler = async function (event) {
    console.log(
      "ST Module: Detected global supabaseAuthStateChange event. Source:",
      event.detail?.source
    );
    const sessionUser = event.detail?.user;
    const accessDenied = event.detail?.accessDenied || false;

    if (accessDenied) {
      console.warn(
        "ST Module: Access denied. Module will reflect no user state."
      );
      await handleServiceTrackingAuthChange(null);
    } else {
      await handleServiceTrackingAuthChange(sessionUser);
    }
  };

  function initializeServiceTrackingModule() {
    console.log("ST Module: Initializing module...");
    if (!isServiceTrackingInitialized) {
      console.log("ST Module: Performing one-time DOM setup...");
      initModalListeners();
      getConfirmModalElements();
      // ... (el resto de tu setup inicial)
      updateDashboard([]);
      isServiceTrackingInitialized = true;
    }
    // --- INICIO DE LA LÓGICA DE LIMPIEZA ---
    cleanupServiceModule = async () => {
      console.log(">>>> ST Module: Cleaning up before unload... <<<<");
      document.removeEventListener(
        "supabaseAuthStateChange",
        window.moduleAuthChangeHandler
      );
      document.removeEventListener("moduleWillUnload", cleanupServiceModule);
      await unsubscribeAllServiceChanges(); // Tu función para cancelar todas las suscripciones
      isServiceTrackingInitialized = false;
      scheduledNotificationTimeouts.forEach((timeoutId) =>
        clearTimeout(timeoutId)
      ); // Limpia los temporizadores
      scheduledNotificationTimeouts = [];
      if (servicesDataTable) {
        servicesDataTable.destroy();
        servicesDataTable = null;
      }
      if (archiveServicesDataTable) {
        archiveServicesDataTable.destroy();
        archiveServicesDataTable = null;
      }
      console.log(">>>> ST Module: Cleanup complete. <<<<");
    };

    // Limpia cualquier oyente de descarga anterior y añade el nuevo
    document.removeEventListener("moduleWillUnload", window.cleanupHandler);
    window.cleanupHandler = cleanupServiceModule; // Asigna la función actual a una referencia global
    document.addEventListener("moduleWillUnload", window.cleanupHandler);

    // --- FIN DE LA LÓGICA DE LIMPIEZA ---

    // Esta rutina asegura que solo el oyente de este módulo esté activo.
    document.removeEventListener(
      "supabaseAuthStateChange",
      window.moduleAuthChangeHandler
    );
    document.addEventListener(
      "supabaseAuthStateChange",
      window.moduleAuthChangeHandler
    );

    // Simula un evento de cambio de autenticación en la carga del módulo para obtener el estado inicial
    if (supabase) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        const detail = {
          user: session ? session.user : null,
          event: "INITIAL_LOAD",
          accessDenied: false,
          source: "script.js",
        };
        window.moduleAuthChangeHandler({ detail });
      });
    }

    // Add resize handlers for DataTables responsiveness
    $(window).off("resize.serviceTrackingST layoutChange.serviceTrackingST");
    $(window).on(
      "resize.serviceTrackingST layoutChange.serviceTrackingST",
      function () {
        setTimeout(() => {
          if (servicesDataTable && servicesDataTable.responsive) {
            servicesDataTable.responsive.recalc();
          }
          if (archiveServicesDataTable && archiveServicesDataTable.responsive) {
            archiveServicesDataTable.responsive.recalc();
          }
        }, 150);
      }
    );
  }

  // Ensure the module initializes when the DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      initializeServiceTrackingModule
    );
  } else {
    initializeServiceTrackingModule();
  }
})();
