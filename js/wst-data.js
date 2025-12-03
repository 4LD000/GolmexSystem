/* ================= INICIO ARCHIVO: wst-data.js ================= */

// js/wst-data.js

(function() {
    // --- 1. DEPENDENCY CHECK ---
    if (!window.supabase) {
        console.error("Supabase client not found. Ensure script.js is loaded.");
        return;
    }

    const moduleContainer = document.querySelector('.wst-data-container');
    if (!moduleContainer) return;

    // --- STATE VARIABLES ---
    let productsCache = [];
    let logsCache = [];
    let logsTable = null;
    let productsTable = null;

    // --- DOM ELEMENTS (Tabs) ---
    const tabButtons = document.querySelectorAll('.wst-tab-button');
    const tabContents = document.querySelectorAll('.wst-tab-content');

    // --- DOM ELEMENTS (Product Modal) ---
    const addProductBtn = document.getElementById('wst-add-product-btn');
    const productModal = document.getElementById('wstProductModal');
    const modalCloseX = document.getElementById('wst-modal-close-x');
    const modalCancelBtn = document.getElementById('wst-modal-cancel-btn');
    const productForm = document.getElementById('wstProductForm');
    const modalTitle = document.getElementById('wstModalTitle');
    
    // --- DOM ELEMENTS (Calculator) ---
    const inputMinutes = document.getElementById('wst-prod-minutes');
    const inputCases = document.getElementById('wst-prod-cases');
    const calcPreview = document.getElementById('wst-time-calc-preview');

    // --- DOM ELEMENTS (Filters & Actions) ---
    const dateFromInput = document.getElementById('wst-date-from');
    const dateToInput = document.getElementById('wst-date-to');
    const lineFilterInput = document.getElementById('wst-filter-line');
    const applyFiltersBtn = document.getElementById('wst-apply-filters-btn');
    const refreshBtn = document.getElementById('wst-refresh-btn');
    const exportCsvBtn = document.getElementById('wst-export-csv-btn');

    // --- 2. INITIALIZATION ---
    async function init() {
        console.log("Initializing WST Data Manager V9 (Edit Fix)...");
        
        initTabs();
        initDataTables();
        
        // Default Date: Today (Local Time Fix)
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const todayLocal = `${year}-${month}-${day}`;

        if(dateFromInput) dateFromInput.value = todayLocal;
        if(dateToInput) dateToInput.value = todayLocal;

        // Initial Load
        await loadProducts();
        await loadLogs();

        setupEventListeners();
        // NOTE: setupTimeCalculator is removed here, logic moved to separate function to be reusable
    }

    // --- 3. TAB LOGIC ---
    function initTabs() {
        tabButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                tabButtons.forEach(b => b.classList.remove('active'));
                tabContents.forEach(c => c.classList.remove('active'));

                btn.classList.add('active');
                const targetId = btn.getAttribute('data-tab');
                document.getElementById(targetId).classList.add('active');

                // Recalculate DataTable layout when tab becomes visible
                if (targetId === 'wst-tab-logs' && logsTable) {
                    logsTable.columns.adjust().draw();
                }
                if (targetId === 'wst-tab-database' && productsTable) {
                    productsTable.columns.adjust().draw();
                }
            });
        });
    }

    // --- 4. DATATABLES CONFIGURATION ---
    function initDataTables() {
        const domConfig = '<"wst-dt-header"lf>rt<"wst-dt-footer"ip>';

        const commonConfig = {
            dom: domConfig,
            responsive: true,
            scrollY: '200px', 
            scrollCollapse: true,
            paging: true,
            layout: {
                topStart: null, topEnd: null, bottomStart: null, bottomEnd: null
            }
        };

        // A. Logs Table
        if ($.fn.DataTable.isDataTable('#wstLogsTable')) {
            $('#wstLogsTable').DataTable().destroy();
        }
        
        logsTable = $('#wstLogsTable').DataTable({
            ...commonConfig,
            order: [[4, "desc"]],
            pageLength: 25,
            lengthMenu: [10, 25, 50, 100],
            columns: [
                { data: 'date' },
                { data: 'line_name' },
                { data: 'product_name' },
                { data: 'crew', className: "dt-center" },    
                { data: 'start_time' },
                { data: 'end_time' },
                { data: 'real_time', className: "dt-right" }, 
                { data: 'adj_target', className: "dt-right" },
                { data: 'diff', className: "dt-center" },     
                { data: 'status', className: "dt-center" }
            ],
            language: {
                emptyTable: "No production records found.",
                search: "",
                searchPlaceholder: "Search logs..."
            }
        });

        // B. Products Table
        if ($.fn.DataTable.isDataTable('#wstProductsTable')) {
            $('#wstProductsTable').DataTable().destroy();
        }
        
        productsTable = $('#wstProductsTable').DataTable({
            ...commonConfig,
            order: [[0, "asc"]], 
            pageLength: 15,
            lengthMenu: [15, 50, 100, 200],
            columns: [
                { data: 'name', width: "25%" },
                { data: 'cases', className: "dt-center" },
                { data: 'units', className: "dt-center" },
                { data: 'std_time_min', className: "dt-center" },
                { data: 'std_time_sec', className: "dt-center" },
                { data: 'total_time_hrs', className: "dt-center" },
                { data: 'actions', orderable: false, className: "dt-center" }
            ],
            language: {
                search: "",
                searchPlaceholder: "Search products..."
            }
        });
    }

    // --- 5. DATA LOADING ---
    async function loadProducts() {
        try {
            const { data, error } = await supabase.from('production_products').select('*').order('name', { ascending: true });
            if (error) throw error;
            productsCache = data || [];
            renderProductsTable();
        } catch (err) {
            console.error('Error loading products:', err);
        }
    }

    async function loadLogs() {
        const fromDate = dateFromInput.value;
        const toDate = dateToInput.value;
        const lineFilter = lineFilterInput.value;

        let query = supabase.from('production_log').select(`*, warehouse_lines(line_name), production_products(name)`).order('start_time', { ascending: false });

        if (fromDate) query = query.gte('start_time', `${fromDate}T00:00:00`);
        if (toDate) query = query.lte('start_time', `${toDate}T23:59:59`);

        try {
            const { data, error } = await query;
            if (error) throw error;

            let filteredData = data;
            if (lineFilter !== 'all') {
                filteredData = data.filter(row => {
                    const lineName = row.warehouse_lines?.line_name || '';
                    return lineName.includes(lineFilter);
                });
            }
            logsCache = filteredData || [];
            renderLogsTable();
        } catch (err) {
            console.error('Error loading logs:', err);
        }
    }

    // --- 6. FORMAT HELPERS ---
    function formatTime(seconds) {
        if (!seconds && seconds !== 0) return '-';
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        if (h > 0) return `${h}h ${m}m ${s}s`;
        return `${m}m ${s}s`;
    }

    // --- 7. RENDER TABLES ---
    function renderProductsTable() {
        const rows = productsCache.map(prod => {
            const secondsPerCase = prod.seconds_per_case;
            const minPerCase = (secondsPerCase / 60).toFixed(2);
            const totalSec = prod.cases_per_pallet * secondsPerCase;
            const h = Math.floor(totalSec / 3600);
            const m = Math.floor((totalSec % 3600) / 60);

            return {
                name: `<span style="font-weight:600;">${prod.name}</span>`,
                cases: prod.cases_per_pallet,
                units: prod.units_per_case,
                std_time_min: `<span style="color:#0275d8;">${minPerCase} min</span>`,
                std_time_sec: secondsPerCase + ' s',
                total_time_hrs: `<b>${h}h ${m}m</b>`,
                actions: `<button class="btn-icon-action" onclick="window.wstEditProduct(${prod.id})"><i class='bx bxs-edit'></i></button>
                          <button class="btn-icon-action delete" onclick="window.wstDeleteProduct(${prod.id})"><i class='bx bxs-trash'></i></button>`
            };
        });
        productsTable.clear().rows.add(rows).draw();
    }

    function renderLogsTable() {
        const rows = logsCache.map(log => {
            const start = new Date(log.start_time);
            const dateStr = start.toLocaleDateString();
            const timeStart = start.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
            let timeEnd = log.warehouse_scan_time ? new Date(log.warehouse_scan_time).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '-';

            const crewSize = log.worker_count || 1;
            let adjustedTargetSecs = log.current_target_seconds || Math.ceil((log.standard_time_seconds || 0) / crewSize);
            
            let realSecs = 0;
            const totalPause = log.total_pause_seconds || 0;

            if (log.final_time_seconds !== null) {
                realSecs = log.final_time_seconds;
            } else {
                const elapsedGross = Math.floor((Date.now() - start.getTime()) / 1000);
                realSecs = elapsedGross - totalPause;
                if (realSecs < 0) realSecs = 0;
            }
            
            const diffSecs = adjustedTargetSecs - realSecs;
            const diffMin = Math.floor(Math.abs(diffSecs) / 60);
            
            let diffHtml = '-';
            if (realSecs !== null) {
                const color = diffSecs >= 0 ? '#10b981' : '#ef4444';
                const sign = diffSecs >= 0 ? '+' : '-';
                diffHtml = `<span style="color:${color}; font-weight:bold;">${sign}${diffMin}m</span>`;
            }

            const team = Array.isArray(log.team_members) ? log.team_members.join(', ') : (log.operator_name || 'Op');
            const crewHtml = `<span title="${team}" style="cursor:help; border-bottom:1px dotted #ccc;"><i class='bx bxs-group'></i> ${crewSize}</span>`;

            let badgeClass = 'status-neutral';
            let label = log.status;
            if (log.is_paused) { badgeClass = 'status-warning'; label = 'PAUSED'; }
            else if (log.performance_rating === 'success') { badgeClass = 'status-success'; label = 'Excellent'; }
            else if (log.performance_rating === 'warning') { badgeClass = 'status-warning'; label = 'Regular'; }
            else if (log.performance_rating === 'danger') { badgeClass = 'status-danger'; label = 'Late'; }
            else if (log.status === 'in_progress') { badgeClass = 'status-neutral'; label = 'Running'; }

            return {
                date: dateStr,
                line_name: log.warehouse_lines?.line_name || 'N/A',
                product_name: log.production_products?.name || '-',
                crew: crewHtml,
                start_time: timeStart,
                end_time: timeEnd,
                real_time: formatTime(realSecs),
                adj_target: formatTime(adjustedTargetSecs),
                diff: diffHtml,
                status: `<span class="badge-status ${badgeClass}">${label}</span>`
            };
        });
        logsTable.clear().rows.add(rows).draw();
    }

    // --- 8. MODAL & CALC ---

    // Shared calculation function (Fixes issue where preview doesn't update on Edit)
    function updateTimePreview() {
        if(!inputMinutes || !inputCases || !calcPreview) return;
        
        const m = parseFloat(inputMinutes.value)||0; 
        const c = parseInt(inputCases.value)||0;
        if(m>0){
            const sec = Math.round(m*60);
            const tot = sec*c;
            const h = Math.floor(tot/3600);
            const rm = Math.floor((tot%3600)/60);
            calcPreview.innerHTML = `<b>${m} min/case</b> = ${h}h ${rm}m Total (1 person)`;
        } else {
            calcPreview.innerHTML = 'Preview: 0 sec';
        }
    }

    function openModal(edit) {
        productModal.style.display = 'flex';
        modalTitle.innerHTML = edit ? 'Edit Product' : 'Add Product';
    }

    function closeModal() {
        productModal.style.display = 'none';
        productForm.reset();
        document.getElementById('wst-prod-id').value = '';
        // Reset fields to avoid ghosts
        if(calcPreview) calcPreview.innerHTML = 'Preview: 0 sec';
    }

    window.wstEditProduct = function(id) {
        const p = productsCache.find(x => x.id === id);
        if(!p) return;
        
        // --- CORE DATA ---
        document.getElementById('wst-prod-id').value = p.id;
        document.getElementById('wst-prod-name').value = p.name;
        
        // Set these first as they are needed for calculation
        document.getElementById('wst-prod-cases').value = p.cases_per_pallet;
        document.getElementById('wst-prod-minutes').value = (p.seconds_per_case/60).toFixed(2);

        document.getElementById('wst-prod-units').value = p.units_per_case;

        // --- WEIGHTS & MEASURES DATA ---
        if(document.getElementById('wst-prod-value')) {
            document.getElementById('wst-prod-value').value = p.value_per_piece || '';
            document.getElementById('wst-prod-uom').value = p.unit_of_measure || 'g';
            document.getElementById('wst-prod-pkg-weight').value = p.packaging_weight_g || '';
            document.getElementById('wst-prod-case-weight').value = p.case_weight_g || '';
        }

        openModal(true);
        
        // FORCE CALCULATION UPDATE
        updateTimePreview();
    };

    window.wstDeleteProduct = async function(id) {
        if(!confirm("Delete this standard?")) return;
        await supabase.from('production_products').delete().eq('id', id);
        loadProducts();
    };

    function setupEventListeners() {
        if(addProductBtn) addProductBtn.onclick = () => {
            openModal(false);
            updateTimePreview(); // Reset preview
        };
        if(modalCloseX) modalCloseX.onclick = closeModal;
        if(modalCancelBtn) modalCancelBtn.onclick = closeModal;
        
        // Attach live calculation listeners
        if(inputMinutes) inputMinutes.oninput = updateTimePreview;
        if(inputCases) inputCases.oninput = updateTimePreview;
        
        if(productForm) productForm.onsubmit = async (e) => {
            e.preventDefault();
            const sec = Math.round(parseFloat(inputMinutes.value)*60);
            
            // Build Data Object (Updated V9)
            const data = {
                name: document.getElementById('wst-prod-name').value,
                cases_per_pallet: parseInt(inputCases.value) || 0,
                units_per_case: parseInt(document.getElementById('wst-prod-units').value) || 0,
                seconds_per_case: sec,
                // New fields for BOL calc
                value_per_piece: parseFloat(document.getElementById('wst-prod-value').value) || 0,
                unit_of_measure: document.getElementById('wst-prod-uom').value,
                packaging_weight_g: parseFloat(document.getElementById('wst-prod-pkg-weight').value) || 0,
                case_weight_g: parseFloat(document.getElementById('wst-prod-case-weight').value) || 0
            };

            const id = document.getElementById('wst-prod-id').value;
            let err;
            if(id) ({error:err} = await supabase.from('production_products').update(data).eq('id', id));
            else ({error:err} = await supabase.from('production_products').insert([data]));
            
            if(err) alert("Error saving product: " + err.message);
            else { loadProducts(); closeModal(); }
        };

        if(applyFiltersBtn) applyFiltersBtn.onclick = loadLogs;
        if(refreshBtn) refreshBtn.onclick = () => { loadLogs(); loadProducts(); };

        if(exportCsvBtn) exportCsvBtn.onclick = () => {
            if(!logsCache.length) return alert("No data to export");
            const csvRows = [['Log ID','Date','Start','End','Line','Product','Status','Crew','Members','Target (Weighted)','Real Time (Net)','Pause Time (Secs)','Diff (Secs)']];
            
            logsCache.forEach(l => {
                const crew = l.worker_count || 1;
                const members = Array.isArray(l.team_members) ? l.team_members.join("|") : l.operator_name;
                const target = l.current_target_seconds || Math.ceil((l.standard_time_seconds || 0) / crew);
                const real = l.final_time_seconds !== null ? l.final_time_seconds : (Math.floor((Date.now() - new Date(l.start_time).getTime())/1000) - (l.total_pause_seconds||0));
                
                csvRows.push([
                    l.id,
                    new Date(l.start_time).toLocaleDateString(),
                    new Date(l.start_time).toLocaleTimeString(),
                    l.warehouse_scan_time ? new Date(l.warehouse_scan_time).toLocaleTimeString() : '',
                    l.warehouse_lines?.line_name,
                    `"${(l.production_products?.name || '').replace(/"/g, '""')}"`,
                    l.status,
                    l.worker_count,
                    `"${members}"`,
                    target,
                    real,
                    l.total_pause_seconds || 0,
                    target - real
                ].join(','));
            });
            
            const link = document.createElement("a");
            link.href = "data:text/csv;charset=utf-8," + encodeURI(csvRows.join("\n"));
            link.download = `report_${new Date().toISOString().slice(0,10)}.csv`;
            document.body.appendChild(link); link.click(); document.body.removeChild(link);
        };
    }

    init();
})();

/* ================= FIN ARCHIVO: wst-data.js ================= */
