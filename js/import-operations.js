// js/import-operations.js
(() => {
    // SECTION 1: INITIALIZATION AND CONFIGURATION
    if (document.body.dataset.iopModuleInitialized === "true") {
        return;
    }
    document.body.dataset.iopModuleInitialized = "true";
    console.log(
        "Import Operations (IOP) Module Initialized - v13 (RPC Payment Fix)"
    );

    if (typeof supabase === "undefined" || !supabase) {
        console.error("Supabase client is not available in import-operations.js.");
        return;
    }

    // --- Config & State ---
    const SHIPMENTS_TABLE = "import_shipments";
    const CLIENT_ACCOUNTS_TABLE = "client_accounts";
    const LEDGER_ENTRIES_TABLE = "ledger_entries";
    const ACCOUNT_LEDGERS_TABLE = "account_ledgers";
    const BUCKET_NAME = "import-documents";

    let currentUserIOP = null;
    let activeShipmentsTable, historyTable, transactionHistoryTable;
    let allClients = [];
    let allHistoryRequests = [];
    let selectedLedgerClientId = null;
    let currentShipmentData = null;
    let currentWorkspaceStep = 1;
    let maxStepReached = 1;
    let finalFilesToUpload = [];

    // --- DOM Element Caching ---
    const ledgerManagementBtn = document.getElementById(
        "iop-ledger-management-btn"
    );
    const ledgerModal = document.getElementById("iop-ledger-modal");
    const closeLedgerBtn = document.getElementById("iop-close-ledger-btn");
    const ledgerCloseFooterBtn = document.getElementById(
        "iop-ledger-close-footer-btn"
    );
    const clientSelectLedger = document.getElementById(
        "iop-client-select-ledger"
    );
    const currentBalanceSpan = document.getElementById(
        "iop-ledger-current-balance"
    );
    const addDepositForm = document.getElementById("iop-add-deposit-form");
    const depositAmountInput = document.getElementById("iop-deposit-amount");
    const depositReferenceInput = document.getElementById(
        "iop-deposit-reference"
    );
    const transactionHistoryTableEl = document.getElementById(
        "iop-transaction-history-table"
    );
    const activeShipmentsTableEl = document.getElementById(
        "iopActiveShipmentsTable"
    );
    const historyBtn = document.getElementById("iop-history-btn");
    const historyModal = document.getElementById("iop-history-modal");
    const closeHistoryModalBtn = document.getElementById(
        "iop-close-history-modal-btn"
    );
    const closeHistoryFooterBtn = document.getElementById(
        "iop-close-history-footer-btn"
    );
    const historyTableEl = document.getElementById("iop-history-table");
    const histMonthSelect = document.getElementById("iop-hist-month");
    const histYearSelect = document.getElementById("iop-hist-year");
    const histSearchInput = document.getElementById("iop-hist-search");
    const applyFiltersBtn = document.getElementById("iop-apply-filters-btn");

    // Workspace Elements
    const workspaceModal = document.getElementById("iop-workspace-modal");
    const closeWorkspaceBtn = document.getElementById("iop-close-workspace-btn");
    const workspaceTitle = document.getElementById("iop-workspace-title");
    const stepperContainer = document.querySelector(".iop-workspace-stepper");
    const stepContents = document.querySelectorAll(".iop-step-content");
    const footerSteps = document.querySelectorAll(".iop-footer-step");
    const shipmentDetailsContainer = document.getElementById(
        "iop-shipment-details-container"
    );
    const clientDocumentsContainer = document.getElementById(
        "iop-client-documents-container"
    );
    const statusSelect = document.getElementById("iop-status-select");

    // Step 1 Elements
    const rfiDetailsTextarea = document.getElementById("iop-rfi-details");
    const sendRfiBtn = document.getElementById("iop-send-rfi-btn");
    const docsOkBtn = document.getElementById("iop-docs-ok-btn");

    // Step 2 Elements
    const chargesContainer = document.getElementById("iop-charges-container");
    const addChargeBtn = document.getElementById("iop-add-charge-btn");
    const confirmChargesCheckbox = document.getElementById(
        "iop-confirm-charges-checkbox"
    );
    const previewReportBtn = document.getElementById("iop-preview-report-btn");
    const processPaymentBtn = document.getElementById("iop-process-payment-btn");

    // Step 3 Elements
    const finalDocInput = document.getElementById("iop-final-doc-input");
    const finalDocList = document.getElementById("iop-final-doc-list");
    const saveFinalDocsBtn = document.getElementById("iop-save-final-docs-btn");

    // Report Modal Elements
    const reportModal = document.getElementById("iop-view-report-modal");
    const reportTitle = document.getElementById("iop-report-title");
    const reportBody = document.getElementById("iop-report-body");
    const closeReportModalBtn = document.getElementById(
        "iop-close-report-modal-btn"
    );
    const closeReportFooterBtn = document.getElementById(
        "iop-close-report-footer-btn"
    );
    const downloadReportPdfBtn = document.getElementById(
        "iop-download-report-pdf-btn"
    );
    const sendReportBtn = document.getElementById("iop-send-report-btn");

    // New Quote Viewer Modal Elements
    const quoteViewerModal = document.getElementById("iop-quote-viewer-modal");
    const quoteViewerTitle = document.getElementById("iop-quote-viewer-title");
    const quoteViewerBody = document.getElementById("iop-quote-viewer-body");
    const closeQuoteViewerBtn = document.getElementById(
        "iop-close-quote-viewer-btn"
    );
    const downloadQuoteViewerPdfBtn = document.getElementById(
        "iop-download-quote-viewer-pdf-btn"
    );

    // New Docs Viewer Modal Elements
    const docsViewerModal = document.getElementById("iop-docs-viewer-modal");
    const docsViewerTitle = document.getElementById("iop-docs-viewer-title");
    const clientDocsCol = document.getElementById("iop-client-docs-col");
    const finalDocsCol = document.getElementById("iop-final-docs-col");
    const closeDocsViewerBtn = document.getElementById(
        "iop-close-docs-viewer-btn"
    );

    function openIopModal(modalElement) {
        if (modalElement) {
            modalElement.style.display = "flex";
            setTimeout(() => modalElement.classList.add("iop-modal-open"), 10);
        }
    }

    function closeIopModal(modalElement) {
        if (modalElement) {
            modalElement.classList.remove("iop-modal-open");
            setTimeout(() => {
                modalElement.style.display = "none";
            }, 300);
        }
    }

    function showIOPNotification(message, type = "info", duration = 4000) {
        if (window.showCustomNotificationST) {
            window.showCustomNotificationST(message, type, duration);
        } else {
            console.log(`IOP Notification (${type}): ${message}`);
        }
    }

    async function fetchInitialData() {
        if (!currentUserIOP) return;

        const { data, error } = await supabase
            .from(SHIPMENTS_TABLE)
            .select("*, client_accounts(account_name)")
            .neq("status", "Archived")
            .eq("is_archived_operator", false);
        if (error) {
            showIOPNotification(
                `Error fetching shipments: ${error.message}`,
                "error"
            );
            return;
        }

        updateIOPDashboardMetrics(data);

        const activeShipments = data.filter(
            (s) => s.status !== "Cancelled" && s.status !== "Archived"
        );

        const columns = [
            {
                data: "id",
                title: "Shipment ID",
                render: (d) => (d ? d.substring(0, 8).toUpperCase() : ""),
            },
            {
                data: "client_accounts.account_name",
                title: "Client",
                defaultContent: "N/A",
            },
            {
                data: "created_at",
                title: "Date Submitted",
                render: (d) => new Date(d).toLocaleDateString(),
            },
            {
                data: "entry_type",
                title: "Entry Type",
                render: (d) => (d ? `Type ${d}` : "N/A"),
            },
            {
                data: "status",
                title: "Status",
                render: (d) =>
                    `<span class="iop-status-badge status-${(d || "pending")
                        .toLowerCase()
                        .replace(/\s+/g, "-")}">${d}</span>`,
            },
            {
                data: null,
                title: "Quote",
                orderable: false,
                searchable: false,
                render: (data, type, row) => {
                    const canViewQuote = [
                        "Quote Sent",
                        "Clarification",
                        "Approved",
                        "Paid",
                        "Completed",
                    ].includes(row.status);
                    return `<button class="btn-sm iop-btn-view-quote" data-action="view_quote" ${!canViewQuote ? "disabled" : ""
                        }>View</button>`;
                },
            },
            {
                data: null,
                title: "Actions",
                orderable: false,
                searchable: false,
                render: () => {
                    return `
                        <div class="iop-table-btn-group">
                             <button class="btn-goldmex-primary btn-sm iop-btn-process" data-action="process">Process</button>
                        </div>
                    `;
                },
            },
            {
                data: null,
                title: "Complete",
                orderable: false,
                searchable: false,
                render: (data, type, row) => {
                    if (row.status === "Completed") {
                        return `<div class="iop-table-btn-group">
                                <button class="btn-sm iop-btn-view-docs" data-action="view_docs" title="View All Documents">Docs</button>
                                <button data-action="archive" class="btn-iop-archive" title="Archive Request"><i class='bx bx-archive'></i></button>
                            </div>`;
                    }
                    return "";
                },
            },
        ];

        activeShipmentsTable = initializeDataTable(
            "#iopActiveShipmentsTable",
            activeShipments,
            columns
        );
    }

    function updateIOPDashboardMetrics(shipments) {
        const newRequests = shipments.filter(
            (s) => s.status === "Submitted"
        ).length;
        const pendingClient = shipments.filter((s) =>
            ["Info Needed", "Quote Sent", "Clarification"].includes(s.status)
        ).length;
        const inProgress = shipments.filter((s) =>
            ["In Review", "Client Reply", "Docs OK", "Approved", "Paid"].includes(
                s.status
            )
        ).length;

        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const completedLast7Days = shipments.filter(
            (s) => s.status === "Completed" && new Date(s.updated_at) >= sevenDaysAgo
        ).length;

        document.getElementById("iop-db-new-requests").textContent = newRequests;
        document.getElementById("iop-db-pending-client").textContent =
            pendingClient;
        document.getElementById("iop-db-in-progress").textContent = inProgress;
        document.getElementById("iop-db-completed").textContent =
            completedLast7Days;
    }

    async function handleArchiveShipmentIOP(shipmentId) {
        const { error } = await supabase
            .from(SHIPMENTS_TABLE)
            .update({ is_archived_operator: true })
            .eq("id", shipmentId);

        if (error) {
            showIOPNotification(
                `Error archiving shipment: ${error.message}`,
                "error"
            );
        } else {
            showIOPNotification("Shipment has been archived.", "success");
            fetchInitialData();
        }
    }

    function initializeDataTable(tableSelector, data, columnsConfig) {
        const table = $(tableSelector);
        if ($.fn.DataTable.isDataTable(table)) {
            table
                .DataTable()
                .clear()
                .rows.add(data || [])
                .draw();
            return table.DataTable();
        }
        return table.DataTable({
            data: data || [],
            responsive: true,
            columns: columnsConfig,
            order: [[2, "desc"]],
        });
    }

    function navigateToStep(step) {
        currentWorkspaceStep = step;
        maxStepReached = Math.max(maxStepReached, step); // Update max step reached

        stepperContainer.querySelectorAll(".iop-step").forEach((s, index) => {
            const stepNumber = index + 1;
            s.classList.toggle("active", stepNumber === step);
            // Unlock step if it's been reached before
            if (stepNumber <= maxStepReached) {
                s.classList.add("unlocked");
            } else {
                s.classList.remove("unlocked");
            }
        });

        stepContents.forEach((sc, index) => {
            sc.classList.toggle("active", index + 1 === step);
        });

        footerSteps.forEach((fs, index) => {
            fs.classList.toggle("active", index + 1 === step);
        });
    }

    async function openWorkspaceModal(shipmentId) {
        const { data, error } = await supabase
            .from(SHIPMENTS_TABLE)
            .select(
                "*, client_accounts(id, account_name, contact_name, contact_email)"
            )
            .eq("id", shipmentId)
            .single();

        if (error) {
            return showIOPNotification(
                `Error fetching shipment details: ${error.message}`,
                "error"
            );
        }

        currentShipmentData = data;
        finalFilesToUpload = [];
        updateFinalFilesList();

        // Reset UI elements
        stepperContainer.querySelectorAll(".iop-step").forEach((s) => {
            s.classList.remove("unlocked");
            s.style.pointerEvents = "auto";
        });
        rfiDetailsTextarea.value = data.broker_notes || "";
        chargesContainer.innerHTML = "";
        confirmChargesCheckbox.checked = false;
        finalDocInput.value = "";
        processPaymentBtn.style.display = "none";
        previewReportBtn.style.display = "inline-flex";

        workspaceTitle.textContent = `Processing Shipment #${data.id
            .substring(0, 8)
            .toUpperCase()}`;
        statusSelect.value = data.status || "Submitted";

        // If shipment is already completed, jump to step 3 and lock others
        if (data.status === "Completed") {
            renderFinalFilesList(data.final_attachments);
            navigateToStep(3);
            stepperContainer.querySelectorAll(".iop-step").forEach((s) => {
                if (parseInt(s.dataset.step, 10) !== 3) {
                    s.classList.remove("unlocked");
                    s.style.pointerEvents = "none";
                }
            });
            openIopModal(workspaceModal);
            return;
        }

        const details = data.shipment_details || {};
        shipmentDetailsContainer.innerHTML = `
            <div class="iop-detail-group"><span class="iop-detail-label">Client</span><span class="iop-detail-value">${data.client_accounts?.account_name || "N/A"
            }</span></div>
            <div class="iop-detail-group"><span class="iop-detail-label">Entry Type</span><span class="iop-detail-value">Type ${data.entry_type || "N/A"
            }</span></div>
            <div class="iop-detail-group"><span class="iop-detail-label">Arrival Date</span><span class="iop-detail-value">${details.arrival_date || "N/A"
            }</span></div>
            <div class="iop-detail-group"><span class="iop-detail-label">Transport</span><span class="iop-detail-value">${details.transport_type || "N/A"
            }</span></div>
        `;
        const attachments = data.attachments || [];
        clientDocumentsContainer.innerHTML =
            attachments.length > 0
                ? `<ul>${attachments
                    .map(
                        (doc) =>
                            `<li><span>${doc.file_name}</span><button class="iop-doc-download-btn" data-path="${doc.file_path}" title="Download"><i class='bx bxs-download'></i></button></li>`
                    )
                    .join("")}</ul>`
                : `<p>No documents attached.</p>`;

        const status = data.status;
        let initialStep = 1;

        const quotingStatuses = [
            "Client Reply",
            "Docs OK",
            "Quote Sent",
            "Clarification",
            "Approved",
        ];
        if (quotingStatuses.includes(status)) {
            initialStep = 2;
        } else if (["Paid", "Completed"].includes(status)) {
            initialStep = 3;
        }

        // Calculate max step reached based on current status
        maxStepReached = initialStep;

        if (data.quote_details && data.quote_details.charges) {
            data.quote_details.charges.forEach((charge) =>
                createChargeRow(charge.name, charge.amount, charge.currency)
            );
        } else {
            createChargeRow();
        }

        // Button visibility logic
        const canContinue = ["Submitted", "Client Reply"].includes(status);
        docsOkBtn.style.display = canContinue ? "inline-flex" : "none";
        sendRfiBtn.style.display = canContinue ? "inline-flex" : "none";

        if (status === "Approved") {
            processPaymentBtn.style.display = "inline-flex";
            previewReportBtn.style.display = "none";
        }

        renderFinalFilesList(data.final_attachments);
        navigateToStep(initialStep);
        openIopModal(workspaceModal);
    }

    function createChargeRow(name = "", amount = "", currency = "USD") {
        const row = document.createElement("div");
        row.className = "iop-charge-row";
        row.innerHTML = `
            <input type="text" class="iop-charge-name" placeholder="Charge Description" value="${name}">
            <input type="number" class="iop-charge-amount" placeholder="Amount" step="0.01" value="${amount}">
            <select class="iop-charge-currency">
                <option value="USD" ${currency === "USD" ? "selected" : ""
            }>USD</option>
                <option value="MXN" ${currency === "MXN" ? "selected" : ""
            }>MXN</option>
            </select>
            <button type="button" class="iop-remove-charge-btn"><i class="bx bx-trash"></i></button>
        `;
        chargesContainer.appendChild(row);
    }

    async function updateShipmentStatus(newStatus, dataToSave = {}) {
        const { error } = await supabase
            .from(SHIPMENTS_TABLE)
            .update({
                status: newStatus,
                ...dataToSave,
            })
            .eq("id", currentShipmentData.id);

        if (error) {
            showIOPNotification(`Error updating status: ${error.message}`, "error");
            return false;
        }

        currentShipmentData.status = newStatus;
        statusSelect.value = newStatus;
        fetchInitialData();
        return true;
    }

    function getChargesFromForm() {
        const charges = [];
        let totalUSD = 0;
        chargesContainer.querySelectorAll(".iop-charge-row").forEach((row) => {
            const name = row.querySelector(".iop-charge-name").value;
            const amount = parseFloat(row.querySelector(".iop-charge-amount").value);
            const currency = row.querySelector(".iop-charge-currency").value;
            if (name && !isNaN(amount)) {
                charges.push({ name, amount, currency });
                if (currency === "USD") totalUSD += amount;
                // Note: MXN conversion logic would be needed for a single currency total
            }
        });
        return { charges, totalUSD };
    }

    function generateImportReportHtml(data, charges, notes) {
        const clientInfo = data.client_accounts || {};
        const shipmentInfo = data.shipment_details || {};
        const attachments = data.attachments || [];
        const attachmentsHtml =
            attachments.length > 0
                ? `<ul>${attachments
                    .map((doc) => `<li>${doc.file_name}</li>`)
                    .join("")}</ul>`
                : "<li>None</li>";

        const totals = {};
        const feesHtml = charges
            .map((charge) => {
                totals[charge.currency] =
                    (totals[charge.currency] || 0) + charge.amount;
                return `<tr><td>${charge.name}</td><td class="text-right">${parseFloat(
                    charge.amount || 0
                ).toFixed(2)} ${charge.currency}</td></tr>`;
            })
            .join("");

        const totalHtml = Object.keys(totals)
            .map(
                (currency) => `
            <tr class="grand-total">
                <td>Grand Total Estimate (${currency})</td>
                <td class="text-right">${totals[currency].toFixed(
                    2
                )} ${currency}</td>
            </tr>
        `
            )
            .join("");

        return `
            <div class="iop-report-printable-area">
                <div class="iop-report-header">
                    <h3>Import Operations Report</h3>
                    <p>Shipment ID: ${data.id
                .substring(0, 8)
                .toUpperCase()} | Date: ${new Date().toLocaleDateString()}</p>
                </div>
                <div class="iop-report-grid">
                    <div class="iop-report-section">
                        <h4><i class='bx bx-user'></i> Client Information</h4>
                        <div class="iop-report-item"><span class="iop-report-label">Client:</span><span class="iop-report-value">${clientInfo.account_name || "N/A"
            }</span></div>
                        <div class="iop-report-item"><span class="iop-report-label">Contact:</span><span class="iop-report-value">${clientInfo.contact_name || "N/A"
            }</span></div>
                        <div class="iop-report-item"><span class="iop-report-label">Email:</span><span class="iop-report-value">${clientInfo.contact_email || "N/A"
            }</span></div>
                    </div>
                    <div class="iop-report-section">
                        <h4><i class='bx bxs-truck'></i> Shipment Details</h4>
                        <div class="iop-report-item"><span class="iop-report-label">Entry Type:</span><span class="iop-report-value">${data.entry_type || "N/A"
            }</span></div>
                        <div class="iop-report-item"><span class="iop-report-label">Arrival Date:</span><span class="iop-report-value">${shipmentInfo.arrival_date || "N/A"
            }</span></div>
                        <div class="iop-report-item"><span class="iop-report-label">Transport:</span><span class="iop-report-value">${shipmentInfo.transport_type || "N/A"
            }</span></div>
                    </div>
                    <div class="iop-report-section iop-report-full-width">
                        <h4><i class='bx bxs-file-archive'></i> Associated Documents</h4>
                        ${attachmentsHtml}
                    </div>
                    <div class="iop-report-section iop-report-full-width">
                        <h4><i class='bx bx-dollar-circle'></i> Quotation Details</h4>
                        <table class="iop-report-quote-table">
                            <thead><tr><th style="text-align: left;">Description</th><th class="text-right">Amount</th></tr></thead>
                            <tbody>${feesHtml}${totalHtml}</tbody>
                        </table>
                    </div>
                    <div class="iop-report-section iop-report-full-width">
                        <h4><i class='bx bx-note'></i> Operator Notes</h4>
                        <div class="iop-report-notes">${notes || "No additional notes."
            }</div>
                    </div>
                </div>
            </div>`;
    }

    function openReportModal() {
        if (!reportModal || !reportBody || !currentShipmentData) return;
        const { charges } = getChargesFromForm();
        if (charges.length === 0) {
            return showIOPNotification(
                "Please add at least one charge before generating a report.",
                "warning"
            );
        }
        const notes = rfiDetailsTextarea.value;
        const reportHtml = generateImportReportHtml(
            currentShipmentData,
            charges,
            notes
        );
        reportBody.innerHTML = reportHtml;
        reportTitle.textContent = `Report for Shipment #${currentShipmentData.id
            .substring(0, 8)
            .toUpperCase()}`;
        sendReportBtn.disabled = !confirmChargesCheckbox.checked;
        openIopModal(reportModal);
    }

    async function downloadImportReportAsPdf(printableArea) {
        if (
            typeof html2canvas === "undefined" ||
            typeof window.jspdf === "undefined"
        ) {
            return showIOPNotification(
                "PDF generation libraries are not available.",
                "error"
            );
        }
        if (!printableArea) {
            return showIOPNotification("Could not find report content.", "error");
        }
        const tempContainer = document.createElement("div");
        tempContainer.classList.add("iop-pdf-render-mode");
        tempContainer.style.position = "absolute";
        tempContainer.style.left = "-9999px";
        tempContainer.style.width = "8.5in";
        tempContainer.innerHTML = printableArea.outerHTML;
        document.body.appendChild(tempContainer);
        try {
            const canvas = await html2canvas(
                tempContainer.querySelector(".iop-report-printable-area"),
                {
                    scale: 2,
                    useCORS: true,
                    backgroundColor: "#ffffff",
                }
            );
            const imgData = canvas.toDataURL("image/png");
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF({
                orientation: "portrait",
                unit: "in",
                format: "letter",
            });
            const pageMargin = 0.5;
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const contentWidth = pdfWidth - pageMargin * 2;
            const ratio = canvas.height / canvas.width;
            const contentHeight = contentWidth * ratio;
            pdf.addImage(
                imgData,
                "PNG",
                pageMargin,
                pageMargin,
                contentWidth,
                contentHeight
            );
            const clientName = (
                currentShipmentData.client_accounts?.account_name || "report"
            ).replace(/\s/g, "_");
            const filename = `Import_Report_${clientName}_${currentShipmentData.id
                .substring(0, 8)
                .toUpperCase()}.pdf`;
            pdf.save(filename);
        } catch (error) {
            console.error("PDF generation failed:", error);
            showIOPNotification("An error occurred during PDF generation.", "error");
        } finally {
            document.body.removeChild(tempContainer);
        }
    }

    async function sendReportToClient() {
        const { charges } = getChargesFromForm();
        const quote_details = {
            charges: charges,
            notes: rfiDetailsTextarea.value,
        };

        sendReportBtn.disabled = true;
        sendReportBtn.innerHTML =
            "<i class='bx bx-loader-alt bx-spin'></i> Sending...";

        const success = await updateShipmentStatus("Quote Sent", {
            quote_details,
        });

        sendReportBtn.disabled = false;
        sendReportBtn.innerHTML = "Send to Client";

        if (success) {
            showIOPNotification("Quote sent to client successfully!", "success");
            closeIopModal(reportModal);
            closeIopModal(workspaceModal);
        }
    }

    async function openLedgerModal() {
        openIopModal(ledgerModal);
        clientSelectLedger.innerHTML =
            '<option value="">Loading clients...</option>';
        const { data, error } = await supabase
            .from(CLIENT_ACCOUNTS_TABLE)
            .select("id, account_name")
            .order("account_name");

        if (error) {
            showIOPNotification(`Failed to load clients: ${error.message}`, "error");
            clientSelectLedger.innerHTML =
                '<option value="">Error loading clients</option>';
            return;
        }

        allClients = data;
        let optionsHtml = '<option value="">Select a client</option>';
        allClients.forEach((client) => {
            optionsHtml += `<option value="${client.id}">${client.account_name}</option>`;
        });
        clientSelectLedger.innerHTML = optionsHtml;
        currentBalanceSpan.textContent = "$0.00";
        if (transactionHistoryTable) {
            transactionHistoryTable.clear().draw();
        } else {
            const transColumns = [
                {
                    data: "created_at",
                    title: "Date",
                    render: (d) => new Date(d).toLocaleDateString(),
                },
                {
                    data: "type",
                    title: "Type",
                },
                {
                    data: "amount",
                    title: "Amount",
                    render: (d) => `$${parseFloat(d).toFixed(2)}`,
                },
                {
                    data: "reference",
                    title: "Reference",
                },
                {
                    data: "associated_shipment_id",
                    title: "Shipment ID",
                    defaultContent: "",
                    render: (d) => (d ? d.substring(0, 8).toUpperCase() : ""),
                },
            ];
            transactionHistoryTable = initializeDataTable(
                "#iop-transaction-history-table",
                [],
                transColumns
            );
        }
    }

    async function updateLedgerDetails(clientAccountId) {
        selectedLedgerClientId = clientAccountId;
        if (!clientAccountId) {
            currentBalanceSpan.textContent = "$0.00";
            if (transactionHistoryTable) transactionHistoryTable.clear().draw();
            return;
        }
        const { data: ledgerData, error: ledgerError } = await supabase
            .from(ACCOUNT_LEDGERS_TABLE)
            .select("balance")
            .eq("client_account_id", clientAccountId)
            .single();

        if (ledgerError && ledgerError.code !== "PGRST116") {
            showIOPNotification("Error fetching client balance.", "error");
            currentBalanceSpan.textContent = "Error";
        } else {
            currentBalanceSpan.textContent = `$${(ledgerData?.balance || 0).toFixed(
                2
            )}`;
        }

        const { data: transactions, error: transError } = await supabase
            .from(LEDGER_ENTRIES_TABLE)
            .select("*")
            .eq("client_account_id", clientAccountId)
            .order("created_at", {
                ascending: false,
            });

        if (transError) {
            showIOPNotification("Error fetching transaction history.", "error");
        } else if (transactionHistoryTable) {
            transactionHistoryTable.clear().rows.add(transactions).draw();
        }
    }

    async function handleAddDeposit(event) {
        event.preventDefault();
        if (!selectedLedgerClientId) {
            showIOPNotification("Please select a client first.", "warning");
            return;
        }
        const amount = parseFloat(depositAmountInput.value);
        const reference = depositReferenceInput.value.trim();
        if (isNaN(amount) || amount <= 0) {
            showIOPNotification("Please enter a valid positive amount.", "error");
            return;
        }
        const { error } = await supabase.rpc("add_deposit", {
            p_client_account_id: selectedLedgerClientId,
            p_amount: amount,
            p_reference: reference,
        });
        if (error) {
            showIOPNotification(`Failed to add deposit: ${error.message}`, "error");
        } else {
            showIOPNotification("Deposit registered successfully!", "success");
            addDepositForm.reset();
            updateLedgerDetails(selectedLedgerClientId);
        }
    }

    async function openHistoryModal() {
        openIopModal(historyModal);
        const { data, error } = await supabase
            .from(SHIPMENTS_TABLE)
            .select("*, client_accounts(account_name)")
            .in("status", ["Completed", "Cancelled", "Archived"]);
        if (error) {
            showIOPNotification(`Error fetching history: ${error.message}`, "error");
            allHistoryRequests = [];
        } else {
            allHistoryRequests = data;
        }
        populateHistoryFilters();
        applyHistoryFilters();
    }

    function populateHistoryFilters() {
        histMonthSelect.innerHTML = '<option value="all">All Months</option>';
        for (let i = 0; i < 12; i++) {
            const monthName = new Date(0, i).toLocaleString("default", {
                month: "long",
            });
            histMonthSelect.innerHTML += `<option value="${i}">${monthName}</option>`;
        }
        const years = [
            ...new Set(
                allHistoryRequests.map((r) => new Date(r.created_at).getFullYear())
            ),
        ].sort((a, b) => b - a);
        histYearSelect.innerHTML = '<option value="all">All Years</option>';
        years.forEach(
            (year) =>
                (histYearSelect.innerHTML += `<option value="${year}">${year}</option>`)
        );
    }

    function applyHistoryFilters() {
        const month = histMonthSelect.value;
        const year = histYearSelect.value;
        const searchTerm = histSearchInput.value.toLowerCase();
        const filteredData = allHistoryRequests.filter((req) => {
            const date = new Date(req.created_at);
            const yearMatch = year === "all" || date.getFullYear() == year;
            const monthMatch = month === "all" || date.getMonth() == month;
            const searchMatch =
                searchTerm === "" ||
                (req.client_accounts?.account_name || "")
                    .toLowerCase()
                    .includes(searchTerm) ||
                (req.id || "").toLowerCase().includes(searchTerm);
            return yearMatch && monthMatch && searchMatch;
        });
        const columns = [
            {
                data: "id",
                title: "Shipment ID",
                render: (d) => (d ? d.substring(0, 8).toUpperCase() : ""),
            },
            {
                data: "client_accounts.account_name",
                title: "Client",
                defaultContent: "N/A",
            },
            {
                data: "updated_at",
                title: "Date Closed",
                render: (d) => new Date(d).toLocaleDateString(),
            },
            {
                data: "status",
                title: "Final Status",
            },
            {
                data: null,
                title: "Actions",
                orderable: false,
                searchable: false,
                render: (data, type, row) => {
                    const canViewQuote =
                        ["Completed", "Cancelled", "Archived"].includes(row.status) &&
                        row.quote_details;
                    return `<div class="iop-table-btn-group">
                                <button class="btn-sm iop-btn-view-docs" data-action="view_docs" title="View All Documents">Docs</button>
                                <button class="btn-sm iop-btn-view-quote" data-action="view_quote" ${!canViewQuote ? "disabled" : ""
                        }>View Quote</button>
                            </div>`;
                },
            },
        ];
        historyTable = initializeDataTable(
            "#iop-history-table",
            filteredData,
            columns
        );
    }

    function updateFinalFilesList() {
        finalDocList.innerHTML = finalFilesToUpload
            .map(
                (file, index) =>
                    `<div class="iop-file-item"><span>${file.name}</span><button type="button" class="iop-remove-final-file" data-index="${index}">&times;</button></div>`
            )
            .join("");
    }

    function renderFinalFilesList(files = []) {
        if (!files || files.length === 0) {
            finalDocList.innerHTML = "<p>No final documents uploaded yet.</p>";
            return;
        }
        finalDocList.innerHTML = files
            .map(
                (file) =>
                    `<div class="iop-file-item"><span>${file.file_name}</span><button class="iop-doc-download-btn" data-path="${file.file_path}" title="Download"><i class='bx bxs-download'></i></button></div>`
            )
            .join("");
    }

    async function saveFinalDocuments() {
        saveFinalDocsBtn.disabled = true;
        saveFinalDocsBtn.innerHTML =
            "<i class='bx bx-loader-alt bx-spin'></i> Saving...";

        try {
            const existingFiles = currentShipmentData.final_attachments || [];
            const newFileMetadata = [];

            for (const file of finalFilesToUpload) {
                const filePath = `${currentShipmentData.client_accounts.id}/${currentShipmentData.id
                    }/final/${Date.now()}_${file.name}`;
                const { error } = await supabase.storage
                    .from(BUCKET_NAME)
                    .upload(filePath, file);
                if (error) {
                    throw new Error(`Failed to upload ${file.name}: ${error.message}`);
                }
                newFileMetadata.push({
                    file_name: file.name,
                    file_path: filePath,
                    uploaded_at: new Date().toISOString(),
                });
            }

            const allFinalFiles = [...existingFiles, ...newFileMetadata];
            const isFirstCompletion = currentShipmentData.status !== "Completed";

            const { error: updateError } = await supabase
                .from(SHIPMENTS_TABLE)
                .update({
                    final_attachments: allFinalFiles,
                    status: "Completed", // Always ensure status is completed
                })
                .eq("id", currentShipmentData.id);

            if (updateError) {
                throw new Error(`Failed to update shipment: ${updateError.message}`);
            }

            showIOPNotification("Final documents saved successfully!", "success");
            if (isFirstCompletion) {
                closeIopModal(workspaceModal);
            } else {
                currentShipmentData.final_attachments = allFinalFiles;
                finalFilesToUpload = [];
                updateFinalFilesList(); // Clear the "to upload" list
                renderFinalFilesList(allFinalFiles); // Re-render the list of existing files
            }
            fetchInitialData();
        } catch (error) {
            showIOPNotification(`Error: ${error.message}`, "error");
        } finally {
            saveFinalDocsBtn.disabled = false;
            saveFinalDocsBtn.innerHTML = "Save Final Docs & Notify";
        }
    }

    function openQuoteViewerModal(shipmentData) {
        if (!shipmentData.quote_details) {
            showIOPNotification(
                "No quote details available for this shipment.",
                "warning"
            );
            return;
        }
        currentShipmentData = shipmentData; // Set for PDF download context
        const { charges, notes } = shipmentData.quote_details;
        const reportHtml = generateImportReportHtml(shipmentData, charges, notes);
        quoteViewerBody.innerHTML = reportHtml;
        quoteViewerTitle.textContent = `Quote for Shipment #${shipmentData.id
            .substring(0, 8)
            .toUpperCase()}`;
        openIopModal(quoteViewerModal);
    }

    function openDocsViewerModal(shipmentData) {
        docsViewerTitle.textContent = `Documents for Shipment #${shipmentData.id
            .substring(0, 8)
            .toUpperCase()}`;

        const renderDocs = (docs) => {
            if (!docs || docs.length === 0) {
                return "<p>No documents.</p>";
            }
            return `<ul>${docs
                .map(
                    (doc) =>
                        `<li><span>${doc.file_name}</span><button class="iop-doc-download-btn" data-path="${doc.file_path}" title="Download"><i class='bx bxs-download'></i></button></li>`
                )
                .join("")}</ul>`;
        };

        clientDocsCol.innerHTML = renderDocs(shipmentData.attachments);
        finalDocsCol.innerHTML = renderDocs(shipmentData.final_attachments);

        openIopModal(docsViewerModal);
    }

    function setupEventListeners() {
        ledgerManagementBtn.addEventListener("click", openLedgerModal);
        closeLedgerBtn.addEventListener("click", () => closeIopModal(ledgerModal));
        ledgerCloseFooterBtn.addEventListener("click", () =>
            closeIopModal(ledgerModal)
        );
        clientSelectLedger.addEventListener("change", (e) =>
            updateLedgerDetails(e.target.value)
        );
        addDepositForm.addEventListener("submit", handleAddDeposit);

        historyBtn.addEventListener("click", openHistoryModal);
        closeHistoryModalBtn.addEventListener("click", () =>
            closeIopModal(historyModal)
        );
        closeHistoryFooterBtn.addEventListener("click", () =>
            closeIopModal(historyModal)
        );
        applyFiltersBtn.addEventListener("click", applyHistoryFilters);

        closeWorkspaceBtn.addEventListener("click", () =>
            closeIopModal(workspaceModal)
        );

        stepperContainer.addEventListener("click", (e) => {
            const stepElement = e.target.closest(".iop-step");
            if (stepElement && stepElement.classList.contains("unlocked")) {
                navigateToStep(parseInt(stepElement.dataset.step, 10));
            }
        });

        sendRfiBtn.addEventListener("click", async () => {
            if (!rfiDetailsTextarea.value.trim()) {
                return showIOPNotification(
                    "Please enter the information you are requesting from the client.",
                    "warning"
                );
            }
            const success = await updateShipmentStatus("Info Needed", {
                broker_notes: rfiDetailsTextarea.value.trim(),
            });
            if (success) {
                showIOPNotification("RFI sent to client.", "success");
                closeIopModal(workspaceModal);
            }
        });

        docsOkBtn.addEventListener("click", async () => {
            const success = await updateShipmentStatus("Docs OK");
            if (success) {
                navigateToStep(2);
            }
        });

        addChargeBtn.addEventListener("click", () => createChargeRow());
        chargesContainer.addEventListener("click", (e) => {
            if (e.target.closest(".iop-remove-charge-btn")) {
                e.target.closest(".iop-charge-row").remove();
            }
        });
        confirmChargesCheckbox.addEventListener("change", () => {
            sendReportBtn.disabled = !confirmChargesCheckbox.checked;
        });
        previewReportBtn.addEventListener("click", openReportModal);

        processPaymentBtn.addEventListener("click", async () => {
            const { totalUSD } = getChargesFromForm();
            if (totalUSD <= 0) {
                return showIOPNotification(
                    "Quote amount must be greater than zero.",
                    "warning"
                );
            }

            processPaymentBtn.disabled = true;
            processPaymentBtn.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i>";

            try {
                const { error } = await supabase.rpc("process_shipment_payment", {
                    p_shipment_id: currentShipmentData.id,
                    p_client_account_id: currentShipmentData.client_accounts.id,
                    p_amount: totalUSD,
                });

                if (error) {
                    throw new Error(error.message);
                }

                showIOPNotification("Payment processed successfully!", "success");
                await fetchInitialData();
                navigateToStep(3);
            } catch (error) {
                showIOPNotification(`Payment failed: ${error.message}`, "error");
            } finally {
                processPaymentBtn.disabled = false;
                processPaymentBtn.innerHTML = "Process Payment";
            }
        });

        finalDocInput.addEventListener("change", (e) => {
            finalFilesToUpload.push(...e.target.files);
            updateFinalFilesList();
        });

        finalDocList.addEventListener("click", (e) => {
            const target = e.target.closest(".iop-remove-final-file");
            if (target) {
                const index = parseInt(target.dataset.index, 10);
                finalFilesToUpload.splice(index, 1);
                updateFinalFilesList();
            }
        });

        saveFinalDocsBtn.addEventListener("click", saveFinalDocuments);

        closeReportModalBtn.addEventListener("click", () =>
            closeIopModal(reportModal)
        );
        closeReportFooterBtn.addEventListener("click", () =>
            closeIopModal(reportModal)
        );
        downloadReportPdfBtn.addEventListener("click", () =>
            downloadImportReportAsPdf(
                reportBody.querySelector(".iop-report-printable-area")
            )
        );
        sendReportBtn.addEventListener("click", sendReportToClient);

        const handleTableButtonClick = (table, event) => {
            const button = $(event.target).closest("button");
            const action = button.data("action");
            const row = button.closest("tr");
            if (!row.length) return;
            const data = table.row(row).data();
            if (!data) return;

            switch (action) {
                case "process":
                    openWorkspaceModal(data.id);
                    break;
                case "archive":
                    handleArchiveShipmentIOP(data.id);
                    break;
                case "view_quote":
                    openQuoteViewerModal(data);
                    break;
                case "view_docs":
                    openDocsViewerModal(data);
                    break;
            }
        };

        $(activeShipmentsTableEl).on("click", "button", function (e) {
            handleTableButtonClick(activeShipmentsTable, e);
        });

        $(historyTableEl).on("click", "button", function (e) {
            handleTableButtonClick(historyTable, e);
        });

        $(workspaceModal).on("click", ".iop-doc-download-btn", async function () {
            const path = this.dataset.path;
            const { data, error } = await supabase.storage
                .from(BUCKET_NAME)
                .download(path);
            if (error) {
                return showIOPNotification(
                    `Error downloading file: ${error.message}`,
                    "error"
                );
            }
            const link = document.createElement("a");
            link.href = URL.createObjectURL(data);
            const fileName = path.split("/").pop().substring(14); // Attempt to remove timestamp
            link.download = fileName;
            link.click();
            URL.revokeObjectURL(link.href);
        });

        // Listeners for new modals
        closeQuoteViewerBtn.addEventListener("click", () =>
            closeIopModal(quoteViewerModal)
        );
        downloadQuoteViewerPdfBtn.addEventListener("click", () =>
            downloadImportReportAsPdf(
                quoteViewerBody.querySelector(".iop-report-printable-area")
            )
        );
        closeDocsViewerBtn.addEventListener("click", () =>
            closeIopModal(docsViewerModal)
        );

        $(docsViewerModal).on("click", ".iop-doc-download-btn", async function () {
            const path = this.dataset.path;
            const { data, error } = await supabase.storage
                .from(BUCKET_NAME)
                .download(path);
            if (error) {
                return showIOPNotification(
                    `Error downloading file: ${error.message}`,
                    "error"
                );
            }
            const link = document.createElement("a");
            link.href = URL.createObjectURL(data);
            link.download = path.split("/").pop().substring(14);
            link.click();
            URL.revokeObjectURL(link.href);
        });
    }

    function initializeModule() {
        const handleAuth = (event) => {
            currentUserIOP = event.detail?.user;
            if (currentUserIOP) {
                fetchInitialData();
            } else {
                if (activeShipmentsTable) activeShipmentsTable.clear().draw();
            }
        };

        const cleanup = () => {
            console.log("Cleaning up Import Operations module...");
            if (activeShipmentsTable) {
                $(activeShipmentsTableEl).DataTable().destroy();
                activeShipmentsTable = null;
            }
            if (historyTable) {
                $(historyTableEl).DataTable().destroy();
                historyTable = null;
            }
            if (transactionHistoryTable) {
                $(transactionHistoryTableEl).DataTable().destroy();
                transactionHistoryTable = null;
            }
            document.removeEventListener("supabaseAuthStateChange", handleAuth);
            document.removeEventListener("moduleWillUnload", cleanup);
            document.body.dataset.iopModuleInitialized = "false";
        };

        document.addEventListener("supabaseAuthStateChange", handleAuth);
        document.addEventListener("moduleWillUnload", cleanup);

        if (supabase.auth.getSession) {
            supabase.auth.getSession().then(({ data: { session } }) => {
                if (session)
                    handleAuth({
                        detail: {
                            user: session.user,
                        },
                    });
            });
        }

        setupEventListeners();
    }

    initializeModule();
})();
