// js/inventory-management.js
(() => {
    // --- 1. INITIALIZATION & SAFETY CHECKS ---
    if (document.body.dataset.inventoryModuleInitialized === "true") {
        return;
    }
    document.body.dataset.inventoryModuleInitialized = "true";
    console.log("Inventory Management Module Initialized - V5.0 (Final Polish: Trazabilidad & UX)");

    if (typeof supabase === "undefined" || !supabase) {
        console.error("Supabase client is not available.");
        return;
    }

    // --- CONFIGURATION ---
    const PRODUCTION_TABLE = "production_log";
    const PRODUCTS_TABLE = "production_products";
    const ACTIVE_STATUS = "completed"; 

    // --- STATE VARIABLES ---
    let currentUserInv = null;
    let inventoryTableInstance = null;
    let kardexTableInstance = null;
    let allInventoryData = [];
    let inventorySubscription = null;
    
    // Context for Modals
    let currentPalletData = null; 

    // --- DOM ELEMENTS (CACHE) ---
    
    // Tabs & Header
    const tabButtons = document.querySelectorAll('.inv-tab-button');
    const tabContents = document.querySelectorAll('.inv-tab-content');
    const headerKardexWidget = document.getElementById("headerKardexSearchWidget");
    const globalActionBtns = document.querySelectorAll('.global-action-btn');

    // Tab 1: Dashboard
    const dbTotalPallets = document.getElementById("inv-db-total-pallets");
    const dbUniqueProducts = document.getElementById("inv-db-unique-products");
    const dbReceivedToday = document.getElementById("inv-db-received-today");

    // Tab 1: Actions & Filters
    const btnRefresh = document.getElementById("inv-refresh-btn");
    const btnExport = document.getElementById("inv-export-btn");
    const filterSearch = document.getElementById("invFilterSearch");
    const filterSku = document.getElementById("invFilterSku");
    const filterStart = document.getElementById("invFilterStart"); // [RANGO]
    const filterEnd = document.getElementById("invFilterEnd");     // [RANGO]
    const btnApplyFilters = document.getElementById("invApplyFiltersBtn");
    const tableElement = document.getElementById("inventoryTable");

    // Tab 2: Kardex Elements
    const kardexSkuInput = document.getElementById("kardexSkuInput");
    const kardexSearchBtn = document.getElementById("kardexSearchBtn");
    const kardexClearBtn = document.getElementById("kardexClearBtn");
    
    const kardexProductInfo = document.getElementById("kardexProductInfo");
    const kardexProductName = document.getElementById("kardexProductName");
    const kardexProductSku = document.getElementById("kardexProductSku");
    const kardexDashboard = document.getElementById("kardexDashboard");
    
    const kardexDbIn = document.getElementById("kardex-db-in");
    const kardexDbOut = document.getElementById("kardex-db-out");
    const kardexDbBalance = document.getElementById("kardex-db-balance");
    const kardexDbTransit = document.getElementById("kardex-db-transit");

    const kardexTableSection = document.getElementById("kardexTableSection");
    const kardexTableEl = document.getElementById("kardexTable");
    const kardexEmptyState = document.getElementById("kardexEmptyState");
    
    // Tab 2: Filters
    const kardexFilterStart = document.getElementById("kardexFilterStart");
    const kardexFilterEnd = document.getElementById("kardexFilterEnd");
    const kardexApplyFilter = document.getElementById("kardexApplyFilter");
    const kardexExportBtn = document.getElementById("kardexExportBtn");

    // Details Modal (Live Inventory)
    const detailsModal = document.getElementById("invDetailsModal");
    const btnCloseDetails = document.getElementById("invCloseDetailsBtn");
    const btnCloseDetailsFooter = document.getElementById("invCloseDetailsFooterBtn");
    
    // Details Fields
    const detProduct = document.getElementById("inv-det-product");
    const detSku = document.getElementById("inv-det-sku");
    const detQr = document.getElementById("inv-det-qr");
    const detConfig = document.getElementById("inv-det-config");
    const detLine = document.getElementById("inv-det-line");
    const detOperator = document.getElementById("inv-det-operator");
    const detDate = document.getElementById("inv-det-date");
    const btnPrintLabel = document.getElementById("inv-btn-print");
    const btnOpenAdjust = document.getElementById("inv-btn-adjust");
    const btnKardexShortcut = document.getElementById("inv-btn-kardex-shortcut");

    // Adjustment Modal
    const adjustModal = document.getElementById("invAdjustModal");
    const btnCloseAdjust = document.getElementById("invCloseAdjustBtn");
    const btnCancelAdjust = document.getElementById("invCancelAdjustBtn");
    const adjustForm = document.getElementById("invAdjustForm");
    const adjustReasonInput = document.getElementById("inv-adjust-reason");
    const adjustNotesInput = document.getElementById("inv-adjust-notes");
    const adjustIdInput = document.getElementById("inv-adjust-id");

    // [NUEVO] Transaction Modal (Kardex View)
    const transactionModal = document.getElementById("invTransactionModal");
    const btnCloseTransaction = document.getElementById("invCloseTransactionBtn");
    const btnCloseTransactionFooter = document.getElementById("invCloseTransactionFooterBtn");
    const transDate = document.getElementById("trans-date");
    const transType = document.getElementById("trans-type");
    const transUser = document.getElementById("trans-user");
    const transNotes = document.getElementById("trans-notes");


    // --- 2. TAB LOGIC ---
    function initTabs() {
        tabButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                // Deactivate all
                tabButtons.forEach(b => b.classList.remove('active'));
                tabContents.forEach(c => c.classList.remove('active'));
                
                // Activate clicked
                btn.classList.add('active');
                const targetId = btn.getAttribute('data-tab');
                const targetContent = document.getElementById(targetId);
                if(targetContent) targetContent.classList.add('active');

                // Header Logic
                if (targetId === 'inv-tab-kardex') {
                    if(headerKardexSearchWidget) headerKardexSearchWidget.style.display = 'flex';
                    globalActionBtns.forEach(btn => btn.style.display = 'none');
                } else {
                    if(headerKardexSearchWidget) headerKardexSearchWidget.style.display = 'none';
                    globalActionBtns.forEach(btn => btn.style.display = 'flex');
                }

                // Adjust DataTables
                setTimeout(() => {
                    if (targetId === 'inv-tab-onhand' && inventoryTableInstance) {
                        inventoryTableInstance.columns.adjust().draw();
                    }
                    if (targetId === 'inv-tab-kardex' && kardexTableInstance) {
                        kardexTableInstance.columns.adjust().draw();
                    }
                }, 100);
            });
        });
    }

    function switchToKardexTab(skuToSearch) {
        const kardexBtn = document.querySelector('[data-tab="inv-tab-kardex"]');
        if(kardexBtn) kardexBtn.click();
        
        if(skuToSearch && kardexSkuInput) {
            kardexSkuInput.value = skuToSearch;
            if(kardexClearBtn) kardexClearBtn.style.display = 'block';
            handleKardexSearch();
        }
    }


    // --- 3. DATA FETCHING (INVENTORY - TAB 1) ---

    async function fetchInventoryData() {
        if(tableElement) tableElement.style.opacity = '0.5';

        // Fetch optimized
        const { data, error } = await supabase
            .from(PRODUCTION_TABLE)
            .select(`
                id,
                pallet_qr_id,
                status,
                warehouse_scan_time,
                operator_name,
                warehouse_lines (line_name),
                production_products (id, name, sku, units_per_case, cases_per_pallet)
            `)
            .eq('status', ACTIVE_STATUS) 
            .order('warehouse_scan_time', { ascending: false })
            .limit(2000); 

        if(tableElement) tableElement.style.opacity = '1';

        if (error) {
            console.error("Error fetching inventory:", error);
            return;
        }

        allInventoryData = data || [];
        
        if (allInventoryData.length >= 2000) {
            console.warn("Inventory limit reached (2000). Use filters.");
        }

        updateDashboardMetrics();
        renderInventoryTable(allInventoryData);
    }

    function updateDashboardMetrics() {
        if(dbTotalPallets) dbTotalPallets.textContent = allInventoryData.length;
        
        if(dbUniqueProducts) {
            const uniqueProducts = new Set(allInventoryData.map(item => item.production_products?.id));
            dbUniqueProducts.textContent = uniqueProducts.size;
        }

        if(dbReceivedToday) {
            const today = new Date().toISOString().split('T')[0];
            const receivedToday = allInventoryData.filter(item => 
                item.warehouse_scan_time && item.warehouse_scan_time.startsWith(today)
            ).length;
            dbReceivedToday.textContent = receivedToday;
        }
    }

    // --- 4. DATATABLE RENDER (MAIN) ---

    function renderInventoryTable(data) {
        if (!tableElement) return;

        if ($.fn.DataTable.isDataTable(tableElement)) {
            inventoryTableInstance.destroy();
            $(tableElement).empty();
        }

        inventoryTableInstance = $(tableElement).DataTable({
            data: data,
            dom: '<"inv-dt-header"lf>rt<"inv-dt-footer"ip>',
            scrollY: '50vh',
            scrollCollapse: true,
            responsive: false,
            paging: true,
            pageLength: 25,
            columns: [
                { 
                    title: "QR ID", 
                    data: "pallet_qr_id",
                    className: "dt-left font-mono",
                    render: (d) => `<span style="font-family:monospace; color:var(--goldmex-primary-color); font-weight:600;">${d}</span>`
                },
                { 
                    title: "SKU", 
                    data: "production_products.sku",
                    className: "dt-left",
                    render: (d) => `<span style="font-weight:700; color:#333;">${d || 'N/A'}</span>`
                },
                { 
                    title: "Product", 
                    data: "production_products.name",
                    defaultContent: "Unknown Product"
                },
                { 
                    title: "Scan Time (Inbound)", 
                    data: "warehouse_scan_time",
                    className: "dt-center",
                    render: (d) => d ? new Date(d).toLocaleString() : '-'
                },
                { 
                    title: "Status", 
                    data: null,
                    className: "dt-center",
                    render: () => `<span class="inv-status-badge status-on-hand">On-Hand</span>`
                },
                {
                    title: "Actions",
                    data: null,
                    orderable: false,
                    className: "dt-center",
                    render: (data, type, row) => `
                        <button class="btn-goldmex-secondary btn-sm inv-action-btn" data-action="view" data-id="${row.id}">
                            <i class='bx bx-show'></i> View
                        </button>
                    `
                }
            ],
            language: {
                search: "",
                searchPlaceholder: "Search inventory...",
                emptyTable: "No pallets currently in stock."
            }
        });

        // Event Delegation
        $(tableElement).off('click').on('click', 'button', function(e) {
            e.stopPropagation();
            const action = $(this).data('action');
            const id = $(this).data('id');
            const rowData = allInventoryData.find(i => i.id == id);
            
            if (action === 'view' && rowData) {
                openDetailsModal(rowData);
            }
        });
    }

    // --- 5. FILTER LOGIC (UPDATED WITH DATE RANGES) ---

    function applyFilters() {
        const search = filterSearch ? filterSearch.value.toLowerCase() : "";
        const skuFilterVal = filterSku ? filterSku.value.toLowerCase() : "";
        
        // Rango de fechas
        const startVal = filterStart ? filterStart.value : "";
        const endVal = filterEnd ? filterEnd.value : "";

        const filtered = allInventoryData.filter(item => {
            const qr = (item.pallet_qr_id || '').toLowerCase();
            const prodName = (item.production_products?.name || '').toLowerCase();
            const prodSku = (item.production_products?.sku || '').toLowerCase();
            
            // Extraer fecha (YYYY-MM-DD)
            const itemDate = item.warehouse_scan_time ? item.warehouse_scan_time.split('T')[0] : "";

            const matchesSearch = !search || qr.includes(search) || prodName.includes(search);
            const matchesSku = !skuFilterVal || prodSku.includes(skuFilterVal);
            
            // Lógica de rango
            let matchesDate = true;
            if (startVal && itemDate < startVal) matchesDate = false;
            if (endVal && itemDate > endVal) matchesDate = false;

            return matchesSearch && matchesSku && matchesDate;
        });

        renderInventoryTable(filtered);
    }

    // --- 6. KARDEX LOGIC (WITH VIEW BUTTON & MATH FIX) ---

    async function handleKardexSearch() {
        if(!kardexSkuInput) return;
        const sku = kardexSkuInput.value.trim().toUpperCase();
        if (!sku) return alert("Please enter a SKU");

        if(kardexSearchBtn) {
            kardexSearchBtn.disabled = true;
            kardexSearchBtn.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i>";
        }
        
        if(kardexClearBtn) kardexClearBtn.style.display = 'block';

        try {
            // 1. Get Product
            const { data: product, error: prodError } = await supabase
                .from(PRODUCTS_TABLE)
                .select('id, name, sku')
                .eq('sku', sku)
                .single();

            if (prodError || !product) {
                alert("Product SKU not found.");
                handleKardexClear(); 
                return;
            }

            // 2. Dual Queries (Math Fix)
            // A. Logs (Table) - Affected by filters
            // IMPORTANTE: Incluimos 'notes' y 'operator_name' para la trazabilidad
            let logsQuery = supabase
                .from(PRODUCTION_TABLE)
                .select(`
                    id, status, warehouse_scan_time, pallet_qr_id, operator_name, notes,
                    warehouse_lines (line_name)
                `)
                .eq('product_id', product.id)
                .not('warehouse_scan_time', 'is', null)
                .order('warehouse_scan_time', { ascending: false });

            if(kardexFilterStart && kardexFilterStart.value) 
                logsQuery = logsQuery.gte('warehouse_scan_time', `${kardexFilterStart.value}T00:00:00`);
            if(kardexFilterEnd && kardexFilterEnd.value)
                logsQuery = logsQuery.lte('warehouse_scan_time', `${kardexFilterEnd.value}T23:59:59`);
            
            logsQuery = logsQuery.limit(1000);

            // B. Balance (Scorecard) - Ignore filters
            let balanceQuery = supabase
                .from(PRODUCTION_TABLE)
                .select('id', { count: 'exact', head: true }) 
                .eq('product_id', product.id)
                .eq('status', 'completed'); 

            const [logsResult, balanceResult] = await Promise.all([logsQuery, balanceQuery]);

            if (logsResult.error) throw logsResult.error;

            updateKardexUI(product, logsResult.data || [], balanceResult.count || 0);

        } catch (e) {
            console.error("Kardex Error:", e);
            alert("Error loading history.");
        } finally {
            if(kardexSearchBtn) {
                kardexSearchBtn.disabled = false;
                kardexSearchBtn.textContent = "Search";
            }
        }
    }

    function updateKardexUI(product, logs, realBalance) {
        if(kardexEmptyState) kardexEmptyState.style.display = 'none';
        if(kardexProductInfo) kardexProductInfo.style.display = 'flex';
        if(kardexDashboard) kardexDashboard.style.display = 'grid';
        if(kardexTableSection) kardexTableSection.style.display = 'flex';

        if(kardexProductSku) kardexProductSku.textContent = product.sku;
        if(kardexProductName) kardexProductName.textContent = product.name;

        let rangeIn = logs.length; 
        let rangeOut = logs.filter(l => l.status === 'shipped' || l.status === 'adjusted').length;
        let rangeTransit = logs.filter(l => l.status === 'shipped').length;

        if(kardexDbBalance) kardexDbBalance.textContent = realBalance; // SALDO REAL

        if(kardexDbIn) kardexDbIn.textContent = rangeIn; 
        if(kardexDbOut) kardexDbOut.textContent = rangeOut; 
        if(kardexDbTransit) kardexDbTransit.textContent = rangeTransit;

        renderKardexTable(logs);
    }

    function handleKardexClear() {
        if(kardexSkuInput) kardexSkuInput.value = '';
        if(kardexClearBtn) kardexClearBtn.style.display = 'none';
        
        if(kardexProductInfo) kardexProductInfo.style.display = 'none';
        if(kardexDashboard) kardexDashboard.style.display = 'none';
        if(kardexTableSection) kardexTableSection.style.display = 'none';
        if(kardexEmptyState) kardexEmptyState.style.display = 'flex';

        if (kardexTableInstance) {
            kardexTableInstance.clear().draw();
        }
    }

    function renderKardexTable(data) {
        if (!kardexTableEl) return;

        if ($.fn.DataTable.isDataTable(kardexTableEl)) {
            kardexTableInstance.destroy();
            $(kardexTableEl).empty();
        }

        kardexTableInstance = $(kardexTableEl).DataTable({
            data: data,
            dom: '<"inv-dt-header"lf>rt<"inv-dt-footer"ip>',
            scrollY: '45vh', 
            scrollCollapse: true,
            responsive: false,
            paging: true,
            pageLength: 25, // Default length
            columns: [
                { 
                    title: "Date/Time", 
                    data: "warehouse_scan_time",
                    render: (d) => d ? new Date(d).toLocaleString() : '-'
                },
                { 
                    title: "Transaction", 
                    data: "status",
                    className: "dt-center",
                    render: (status) => {
                        if (status === 'completed') return `<span style="color:#28a745; font-weight:700;">INBOUND</span>`;
                        if (status === 'adjusted') return `<span style="color:#dc3545; font-weight:700;">ADJUSTMENT</span>`;
                        if (status === 'shipped') return `<span style="color:#007bff; font-weight:700;">SHIPPED</span>`;
                        return status ? status.toUpperCase() : 'UNKNOWN';
                    }
                },
                { 
                    title: "Pallet ID", 
                    data: "pallet_qr_id",
                    className: "dt-left font-mono"
                },
                { 
                    title: "Line/Ref", 
                    data: null,
                    render: (row) => row.warehouse_lines?.line_name || 'N/A'
                },
                { 
                    title: "Details", // [NUEVO] Columna de Acciones
                    data: null,
                    className: "dt-center",
                    render: (row) => `
                        <button class="btn-goldmex-secondary btn-sm btn-kardex-view" style="font-size:0.8rem; padding:0.2rem 0.6rem;">
                            View
                        </button>
                    `
                }
            ],
            order: [[0, "desc"]]
        });

        // Event listener para el botón View del Kardex
        $(kardexTableEl).off('click', '.btn-kardex-view').on('click', '.btn-kardex-view', function(e) {
            e.stopPropagation();
            const tr = $(this).closest('tr');
            const row = kardexTableInstance.row(tr).data();
            openTransactionModal(row);
        });
    }

    // --- 7. MODAL LOGIC ---

    function openModal(modal) {
        if(!modal) return;
        modal.style.display = 'flex';
        setTimeout(() => modal.classList.add('open'), 10);
    }

    function closeModal(modal) {
        if(!modal) return;
        modal.classList.remove('open');
        setTimeout(() => modal.style.display = 'none', 300);
    }

    function openDetailsModal(item) {
        currentPalletData = item;
        
        // Pass ID safely
        if(adjustIdInput) adjustIdInput.value = item.id;
        
        if(detProduct) detProduct.textContent = item.production_products?.name || "N/A";
        if(detSku) detSku.textContent = item.production_products?.sku || "N/A";
        if(detQr) detQr.textContent = item.pallet_qr_id;
        
        const cases = item.production_products?.cases_per_pallet || 0;
        const units = item.production_products?.units_per_case || 0;
        if(detConfig) detConfig.textContent = `${cases} Cases / ${units} Units`;

        if(detLine) detLine.textContent = item.warehouse_lines?.line_name || "N/A";
        if(detOperator) detOperator.textContent = item.operator_name || "Unknown";
        if(detDate) detDate.textContent = item.warehouse_scan_time ? new Date(item.warehouse_scan_time).toLocaleString() : '--';

        openModal(detailsModal);
    }

    // [NUEVO] Función para abrir modal de transacción
    function openTransactionModal(row) {
        if(!row) return;

        // Fecha
        if(transDate) transDate.textContent = row.warehouse_scan_time ? new Date(row.warehouse_scan_time).toLocaleString() : 'N/A';
        
        // Tipo
        if(transType) transType.textContent = row.status ? row.status.toUpperCase() : 'UNKNOWN';
        
        // Usuario / Operador
        // Si es producción, suele ser operator_name.
        // Si es ajuste, el usuario está en las notas, pero mostramos operator_name si existe.
        if(transUser) transUser.textContent = row.operator_name || "System / Admin";

        // Notas / Motivos
        // Aquí es donde mostramos la trazabilidad del ajuste (quién lo hizo y por qué)
        if(transNotes) {
            if(row.notes) {
                transNotes.textContent = row.notes; // "Adjustment: Damaged. Notes: ... (User: x)"
            } else {
                transNotes.textContent = "No additional notes provided.";
            }
        }

        openModal(transactionModal);
    }

    function handlePrintLabel() {
        if(!currentPalletData) return;
        const qr = currentPalletData.pallet_qr_id;
        const prod = currentPalletData.production_products?.name;
        
        const win = window.open('', '_blank', 'width=400,height=500');
        win.document.write(`
            <div style="text-align:center; font-family:sans-serif; padding:20px;">
                <h2>${prod}</h2>
                <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${qr}" />
                <h3>${qr}</h3>
                <p>REPRINT COPY - INVENTORY</p>
                <button onclick="window.print()">Print</button>
            </div>
        `);
    }

    // [CORRECCIÓN ERROR 400]
    async function handleAdjustment(e) {
        e.preventDefault();
        const reason = adjustReasonInput.value;
        const notes = adjustNotesInput.value;
        
        if (!reason) {
            alert("Please select a reason.");
            return;
        }

        // ParseInt critical for Supabase integer columns
        let recordId = null;
        if (currentPalletData && currentPalletData.id) {
            recordId = parseInt(currentPalletData.id, 10);
        } else if (adjustIdInput && adjustIdInput.value) {
            recordId = parseInt(adjustIdInput.value, 10);
        }

        if (!recordId || isNaN(recordId)) {
            alert("Error: Invalid Pallet ID.");
            return;
        }

        // Construir nota con trazabilidad
        const auditNote = `Adjustment: ${reason}. Notes: ${notes} (User: ${currentUserInv?.email || 'unknown'})`;

        const { error } = await supabase
            .from(PRODUCTION_TABLE)
            .update({
                status: 'adjusted', 
                notes: auditNote // Asegúrate de haber creado esta columna en BD
            })
            .eq('id', recordId);

        if (error) {
            console.error("Supabase Error:", error);
            // Mensaje amigable si falta la columna
            if(error.message && error.message.includes("column")) {
                alert("Database Error: The 'notes' column is missing. Please run the SQL migration.");
            } else {
                alert("Error updating record.");
            }
            return;
        }

        // Success
        closeModal(adjustModal);
        closeModal(detailsModal);
        
        // Optimistic update
        allInventoryData = allInventoryData.filter(i => i.id != recordId);
        renderInventoryTable(allInventoryData);
        updateDashboardMetrics();
    }

    function exportCsv() {
        if (allInventoryData.length === 0) return alert("No data to export");
        const headers = ["QR ID", "SKU", "Product", "Line", "Scan Time", "Status"];
        const rows = allInventoryData.map(item => [
            item.pallet_qr_id,
            item.production_products?.sku || '',
            `"${item.production_products?.name || ''}"`,
            item.warehouse_lines?.line_name || '',
            item.warehouse_scan_time,
            'On-Hand'
        ]);
        const csvContent = "data:text/csv;charset=utf-8," + headers.join(",") + "\n" + rows.map(e => e.join(",")).join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.href = encodedUri;
        link.download = `inventory_onhand_${new Date().toISOString().slice(0,10)}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    // --- 8. EVENT SETUP ---

    function setupEventListeners() {
        if(btnApplyFilters) btnApplyFilters.addEventListener('click', applyFilters);
        if(btnRefresh) btnRefresh.addEventListener('click', fetchInventoryData);
        if(btnExport) btnExport.addEventListener('click', exportCsv);
        
        // Modals
        if(btnCloseDetails) btnCloseDetails.addEventListener('click', () => closeModal(detailsModal));
        if(btnCloseDetailsFooter) btnCloseDetailsFooter.addEventListener('click', () => closeModal(detailsModal));
        
        if(btnCloseAdjust) btnCloseAdjust.addEventListener('click', () => closeModal(adjustModal));
        if(btnCancelAdjust) btnCancelAdjust.addEventListener('click', () => closeModal(adjustModal));
        
        // Nuevo Modal Transaction
        if(btnCloseTransaction) btnCloseTransaction.addEventListener('click', () => closeModal(transactionModal));
        if(btnCloseTransactionFooter) btnCloseTransactionFooter.addEventListener('click', () => closeModal(transactionModal));

        // Forms / Actions
        if(btnPrintLabel) btnPrintLabel.addEventListener('click', handlePrintLabel);
        if(btnOpenAdjust) btnOpenAdjust.addEventListener('click', () => {
            adjustForm.reset();
            openModal(adjustModal);
        });
        if(adjustForm) adjustForm.addEventListener('submit', handleAdjustment);

        if(btnKardexShortcut) {
            btnKardexShortcut.addEventListener('click', () => {
                if(currentPalletData && currentPalletData.production_products?.sku) {
                    closeModal(detailsModal);
                    switchToKardexTab(currentPalletData.production_products.sku);
                } else {
                    alert("This product has no SKU assigned.");
                }
            });
        }

        if(kardexSearchBtn) kardexSearchBtn.addEventListener('click', handleKardexSearch);
        if(kardexClearBtn) kardexClearBtn.addEventListener('click', handleKardexClear);

        if(kardexSkuInput) {
            kardexSkuInput.addEventListener('keydown', (e) => {
                if(e.key === 'Enter') handleKardexSearch();
            });
            kardexSkuInput.addEventListener('input', (e) => {
                if(kardexClearBtn) kardexClearBtn.style.display = e.target.value ? 'block' : 'none';
            });
        }
        
        if(kardexApplyFilter) {
            kardexApplyFilter.addEventListener('click', handleKardexSearch); 
        }

        window.onclick = function(event) {
            if (event.target == detailsModal) closeModal(detailsModal);
            if (event.target == adjustModal) closeModal(adjustModal);
            if (event.target == transactionModal) closeModal(transactionModal);
        }
    }

    function init() {
        initTabs(); 
        
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) {
                currentUserInv = session.user;
                fetchInventoryData();
            }
        });

        setupEventListeners();

        document.addEventListener("moduleWillUnload", () => {
            if (inventorySubscription) supabase.removeChannel(inventorySubscription);
            if (inventoryTableInstance) inventoryTableInstance.destroy();
            if (kardexTableInstance) kardexTableInstance.destroy();
            document.body.dataset.inventoryModuleInitialized = "false";
            console.log("Inventory Module Unloaded");
        }, { once: true });
    }

    init();

})();