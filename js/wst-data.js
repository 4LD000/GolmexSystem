// js/wst-data.js

(function() {
    // --- 1. Verificación de Dependencias ---
    if (!window.supabase) {
        console.error("Supabase client not found. Ensure script.js is loaded.");
        return;
    }

    const moduleContainer = document.querySelector('.wst-data-container');
    if (!moduleContainer) return;

    // --- Variables de Estado ---
    let productsCache = [];
    let logsCache = [];
    let logsTable = null;
    let productsTable = null;

    // --- Elementos DOM (Pestañas) ---
    const tabButtons = document.querySelectorAll('.wst-tab-button');
    const tabContents = document.querySelectorAll('.wst-tab-content');

    // --- Elementos DOM (Modal Productos) ---
    const addProductBtn = document.getElementById('wst-add-product-btn');
    const productModal = document.getElementById('wstProductModal');
    const modalCloseX = document.getElementById('wst-modal-close-x');
    const modalCancelBtn = document.getElementById('wst-modal-cancel-btn');
    const productForm = document.getElementById('wstProductForm');
    const modalTitle = document.getElementById('wstModalTitle');
    
    // --- Elementos DOM (Calculadora) ---
    const inputMinutes = document.getElementById('wst-prod-minutes');
    const inputCases = document.getElementById('wst-prod-cases');
    const calcPreview = document.getElementById('wst-time-calc-preview');

    // --- Elementos DOM (Filtros y Acciones) ---
    const dateFromInput = document.getElementById('wst-date-from');
    const dateToInput = document.getElementById('wst-date-to');
    const lineFilterInput = document.getElementById('wst-filter-line');
    const applyFiltersBtn = document.getElementById('wst-apply-filters-btn');
    const refreshBtn = document.getElementById('wst-refresh-btn');
    const exportCsvBtn = document.getElementById('wst-export-csv-btn');

    // --- 2. Inicialización ---
    async function init() {
        console.log("Initializing WST Data Manager (Manager Report Mode)...");
        
        initTabs();
        initDataTables();
        
        // Fecha por defecto: Hoy
        const today = new Date().toISOString().split('T')[0];
        if(dateFromInput) dateFromInput.value = today;
        if(dateToInput) dateToInput.value = today;

        // Carga Inicial
        await loadProducts();
        await loadLogs();

        setupEventListeners();
        setupTimeCalculator();
    }

    // --- 3. Lógica de Pestañas (Tabs) ---
    function initTabs() {
        tabButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                // Desactivar todas
                tabButtons.forEach(b => b.classList.remove('active'));
                tabContents.forEach(c => c.classList.remove('active'));

                // Activar clickeada
                btn.classList.add('active');
                const targetId = btn.getAttribute('data-tab');
                document.getElementById(targetId).classList.add('active');

                // Recalcular columnas de DataTables al hacer visible la pestaña
                if (targetId === 'wst-tab-logs' && logsTable) {
                    logsTable.columns.adjust().responsive.recalc();
                }
                if (targetId === 'wst-tab-database' && productsTable) {
                    productsTable.columns.adjust().responsive.recalc();
                }
            });
        });
    }

    // --- 4. Configuración de DataTables ---
    function initDataTables() {
        // A. Tabla de Logs (Reporte Gerencial)
        if ($.fn.DataTable.isDataTable('#wstLogsTable')) {
            $('#wstLogsTable').DataTable().destroy();
        }
        logsTable = $('#wstLogsTable').DataTable({
            responsive: true,
            scrollY: '50vh',        // Altura fija (50% de la ventana)
            scrollCollapse: true,   // Permite que la tabla sea más chica si hay pocos datos
            order: [[4, "desc"]],   // Ordenar por Hora Inicio Descendente
            pageLength: 25,
            lengthMenu: [10, 25, 50, 100],
            columns: [
                { data: 'date' },
                { data: 'line_name' },
                { data: 'product_name' },
                { data: 'crew', className: "dt-center" },    // Nueva Columna: Crew Size
                { data: 'start_time' },
                { data: 'end_time' },
                { data: 'real_time', className: "dt-right" }, // Nueva Columna: Real Time
                { data: 'adj_target', className: "dt-right" },// Nueva Columna: Target Ajustado
                { data: 'diff', className: "dt-center" },     // Nueva Columna: Diferencia
                { data: 'status', className: "dt-center" }
            ],
            language: {
                emptyTable: "No production records found for this criteria."
            }
        });

        // B. Tabla de Productos
        if ($.fn.DataTable.isDataTable('#wstProductsTable')) {
            $('#wstProductsTable').DataTable().destroy();
        }
        productsTable = $('#wstProductsTable').DataTable({
            responsive: true,
            scrollY: '50vh',        // Altura fija (50% de la ventana)
            scrollCollapse: true,   // Permite que la tabla sea más chica si hay pocos datos
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
            ]
        });
    }

    // --- 5. Carga de Datos ---

    // Cargar Productos
    async function loadProducts() {
        try {
            const { data, error } = await supabase
                .from('production_products')
                .select('*')
                .order('name', { ascending: true });

            if (error) throw error;
            productsCache = data || [];
            renderProductsTable();
        } catch (err) {
            console.error('Error loading products:', err);
        }
    }

    // Cargar Logs (Incluyendo team_members y worker_count)
    async function loadLogs() {
        const fromDate = dateFromInput.value;
        const toDate = dateToInput.value;
        const lineFilter = lineFilterInput.value;

        // Query extendido para traer datos de equipo
        let query = supabase
            .from('production_log')
            .select(`
                *, 
                warehouse_lines(line_name), 
                production_products(name)
            `)
            .order('start_time', { ascending: false });

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

    // --- 6. Helpers de Formato ---
    function formatTime(seconds) {
        if (!seconds && seconds !== 0) return '-';
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        
        if (h > 0) return `${h}h ${m}m ${s}s`;
        return `${m}m ${s}s`;
    }

    // --- 7. Renderizado de Tablas ---

    function renderProductsTable() {
        const rows = productsCache.map(prod => {
            const secondsPerCase = prod.seconds_per_case;
            const minutesPerCase = (secondsPerCase / 60).toFixed(2);
            const totalSecondsPallet = prod.cases_per_pallet * secondsPerCase;
            
            const totalHours = Math.floor(totalSecondsPallet / 3600);
            const remainingSeconds = totalSecondsPallet % 3600;
            const totalMinutes = Math.floor(remainingSeconds / 60);

            return {
                name: `<span style="font-weight:600; color:var(--goldmex-header-bg);">${prod.name}</span>`,
                cases: prod.cases_per_pallet,
                units: prod.units_per_case,
                std_time_min: `<span style="color:#0275d8; font-weight:bold;">${minutesPerCase} min</span>`,
                std_time_sec: `<span style="color:#666;">${secondsPerCase} s</span>`,
                total_time_hrs: `<span style="font-weight:bold;">${totalHours}h ${totalMinutes}m</span>`,
                actions: `
                    <div style="display:flex; justify-content:center; gap:5px;">
                        <button class="btn-icon-action" onclick="window.wstEditProduct(${prod.id})" title="Edit">
                            <i class='bx bxs-edit'></i>
                        </button>
                        <button class="btn-icon-action delete" onclick="window.wstDeleteProduct(${prod.id})" title="Delete">
                            <i class='bx bxs-trash'></i>
                        </button>
                    </div>
                `
            };
        });

        productsTable.clear().rows.add(rows).draw();
    }

    function renderLogsTable() {
        const rows = logsCache.map(log => {
            const start = new Date(log.start_time);
            const dateStr = start.toLocaleDateString();
            const timeStart = start.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
            
            let timeEnd = '-';
            if (log.warehouse_scan_time) {
                timeEnd = new Date(log.warehouse_scan_time).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
            }

            // --- CÁLCULO DE EFICIENCIA REAL ---
            
            // 1. Crew Size
            const crewSize = log.worker_count || 1;
            
            // 2. Tiempos en Segundos
            const baseStdSecs = log.standard_time_seconds || 0;
            const adjustedTargetSecs = Math.ceil(baseStdSecs / crewSize);
            const realSecs = log.final_time_seconds || 0;
            
            // 3. Diferencia (Saved Time = Target - Real)
            // Positive = Saved (Green), Negative = Delay (Red)
            const diffSecs = log.final_time_seconds ? (adjustedTargetSecs - realSecs) : 0;

            // --- FORMATO VISUAL ---
            
            // Crew Column (Tooltip con nombres)
            let crewMembersList = "Unknown";
            if (Array.isArray(log.team_members) && log.team_members.length > 0) {
                crewMembersList = log.team_members.join(", ");
            } else if (log.operator_name) {
                crewMembersList = log.operator_name;
            }
            
            const crewHtml = `<span title="${crewMembersList}" style="cursor:help; border-bottom:1px dotted #999;">
                                <i class='bx bxs-group'></i> ${crewSize}
                              </span>`;

            // Diff Column
            let diffHtml = '-';
            if (log.final_time_seconds) {
                const diffMin = Math.floor(Math.abs(diffSecs) / 60);
                if (diffSecs >= 0) {
                    diffHtml = `<span style="color:var(--scan-success); font-weight:bold;">+${diffMin}m</span>`;
                } else {
                    diffHtml = `<span style="color:var(--scan-error); font-weight:bold;">-${diffMin}m</span>`;
                }
            }

            // Badge Status
            let badgeClass = 'status-neutral';
            let label = log.status;
            if (log.performance_rating === 'success') { badgeClass = 'status-success'; label = 'Excellent'; }
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
                real_time: log.final_time_seconds ? formatTime(realSecs) : '-',
                adj_target: log.standard_time_seconds ? formatTime(adjustedTargetSecs) : '-',
                diff: diffHtml,
                status: `<span class="badge-status ${badgeClass}">${label}</span>`
            };
        });
        logsTable.clear().rows.add(rows).draw();
    }

    // --- 8. Modal y Calculadora ---
    function setupTimeCalculator() {
        function updatePreview() {
            const mins = parseFloat(inputMinutes.value) || 0;
            const cases = parseInt(inputCases.value) || 0;

            if (mins > 0) {
                const secsPerCase = Math.round(mins * 60);
                const totalSecs = secsPerCase * cases;
                const hrs = Math.floor(totalSecs / 3600);
                const remSecs = totalSecs % 3600;
                const remMins = Math.floor(remSecs / 60);

                calcPreview.innerHTML = `
                    <i class='bx bx-calculator'></i> 
                    <b>${mins} min</b> = ${secsPerCase} seconds/case. <br>
                    Total Pallet (1 Pers): <b>${hrs}h ${remMins}m</b> (${totalSecs}s).
                `;
                calcPreview.style.color = 'var(--goldmex-primary-color)';
            } else {
                calcPreview.innerHTML = "Enter minutes to see conversion preview.";
                calcPreview.style.color = 'var(--color-text-secondary)';
            }
        }

        if(inputMinutes) inputMinutes.addEventListener('input', updatePreview);
        if(inputCases) inputCases.addEventListener('input', updatePreview);
    }

    function openModal(isEdit = false) {
        productModal.style.display = 'flex';
        modalTitle.innerHTML = isEdit ? "<i class='bx bxs-edit'></i> Edit Product" : "<i class='bx bxs-package'></i> Add Product";
    }

    function closeModal() {
        productModal.style.display = 'none';
        productForm.reset();
        document.getElementById('wst-prod-id').value = '';
        calcPreview.innerHTML = "Preview...";
    }

    window.wstEditProduct = function(id) {
        const prod = productsCache.find(p => p.id === id);
        if (!prod) return;

        document.getElementById('wst-prod-id').value = prod.id;
        document.getElementById('wst-prod-name').value = prod.name;
        document.getElementById('wst-prod-cases').value = prod.cases_per_pallet;
        document.getElementById('wst-prod-units').value = prod.units_per_case;
        
        const minutes = parseFloat((prod.seconds_per_case / 60).toFixed(2));
        document.getElementById('wst-prod-minutes').value = minutes;

        const event = new Event('input');
        inputMinutes.dispatchEvent(event);
        openModal(true);
    };

    window.wstDeleteProduct = async function(id) {
        if (!confirm("Are you sure you want to delete this product standard?")) return;
        try {
            const { error } = await supabase.from('production_products').delete().eq('id', id);
            if (error) throw error;
            await loadProducts();
        } catch (e) {
            console.error(e);
            alert("Error deleting product.");
        }
    };

    // --- 9. Event Listeners ---
    function setupEventListeners() {
        if(addProductBtn) addProductBtn.onclick = () => openModal(false);
        if(modalCloseX) modalCloseX.onclick = closeModal;
        if(modalCancelBtn) modalCancelBtn.onclick = closeModal;

        if(productForm) {
            productForm.onsubmit = async (e) => {
                e.preventDefault();
                const minutesInput = parseFloat(document.getElementById('wst-prod-minutes').value);
                const secondsPerCase = Math.round(minutesInput * 60);

                const productData = {
                    name: document.getElementById('wst-prod-name').value,
                    cases_per_pallet: parseInt(document.getElementById('wst-prod-cases').value),
                    units_per_case: parseInt(document.getElementById('wst-prod-units').value),
                    seconds_per_case: secondsPerCase 
                };

                const id = document.getElementById('wst-prod-id').value;

                try {
                    let error;
                    if (id) {
                        ({ error } = await supabase.from('production_products').update(productData).eq('id', id));
                    } else {
                        ({ error } = await supabase.from('production_products').insert([productData]));
                    }

                    if (error) throw error;
                    await loadProducts();
                    closeModal();
                } catch (err) {
                    alert("Error saving: " + err.message);
                }
            };
        }

        if(applyFiltersBtn) applyFiltersBtn.onclick = loadLogs;
        if(refreshBtn) refreshBtn.onclick = () => { loadLogs(); loadProducts(); };
        
        // --- 10. EXPORTACIÓN CSV DETALLADA ---
        if(exportCsvBtn) exportCsvBtn.onclick = () => {
            if(!logsCache.length) return alert("No data to export");
            
            // Header detallado para análisis en Excel
            const headers = [
                'Log ID',
                'Date',
                'Time Start',
                'Time End',
                'Line Name',
                'Product Name',
                'Status',
                'Rating',
                'Crew Size',
                'Team Members',
                'Base Std Seconds (1p)',
                'Adjusted Target Seconds',
                'Real Seconds',
                'Difference Seconds (+Saved/-Lost)',
                'Difference Minutes'
            ];
            
            const rows = [headers.join(',')];
            
            logsCache.forEach(l => {
                // Preparar datos crudos
                const crew = l.worker_count || 1;
                const members = Array.isArray(l.team_members) ? l.team_members.join(" | ") : (l.operator_name || '');
                const baseStd = l.standard_time_seconds || 0;
                const adjTarget = Math.ceil(baseStd / crew);
                const real = l.final_time_seconds || 0;
                const diff = real > 0 ? (adjTarget - real) : 0;
                const diffMin = (diff / 60).toFixed(2);

                // Escapar comas en nombres de productos o equipos para no romper el CSV
                const safeProd = `"${(l.production_products?.name || '').replace(/"/g, '""')}"`;
                const safeMembers = `"${members.replace(/"/g, '""')}"`;

                rows.push([
                    l.id,
                    new Date(l.start_time).toLocaleDateString(),
                    new Date(l.start_time).toLocaleTimeString(),
                    l.warehouse_scan_time ? new Date(l.warehouse_scan_time).toLocaleTimeString() : '',
                    l.warehouse_lines?.line_name || '',
                    safeProd,
                    l.status,
                    l.performance_rating || '',
                    crew,
                    safeMembers,
                    baseStd,
                    adjTarget,
                    real,
                    diff,
                    diffMin
                ].join(','));
            });

            // Generar descarga
            const link = document.createElement("a");
            link.href = "data:text/csv;charset=utf-8," + encodeURI(rows.join("\n"));
            link.download = `production_report_${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        };
    }

    init();
})();
