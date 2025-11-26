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
        console.log("Initializing WST Data Manager (Enhanced Time Formats)...");
        
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

                // AJUSTE CRÍTICO: Recalcular columnas de DataTables al hacer visible la pestaña
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
        // A. Tabla de Logs (Historial)
        if ($.fn.DataTable.isDataTable('#wstLogsTable')) {
            $('#wstLogsTable').DataTable().destroy();
        }
        logsTable = $('#wstLogsTable').DataTable({
            responsive: true,
            order: [[4, "desc"]], // Ordenar por Hora Inicio Descendente
            pageLength: 25,
            lengthMenu: [10, 25, 50, 100],
            columns: [
                { data: 'date' },
                { data: 'line_name' },
                { data: 'operator_name' },
                { data: 'product_name' },
                { data: 'start_time' },
                { data: 'end_time' },
                { data: 'real_time' },
                { data: 'std_time' },
                { data: 'status' }
            ],
            language: {
                emptyTable: "No production records found for this criteria."
            }
        });

        // B. Tabla de Productos (Base de Datos) - NUEVAS COLUMNAS
        if ($.fn.DataTable.isDataTable('#wstProductsTable')) {
            $('#wstProductsTable').DataTable().destroy();
        }
        productsTable = $('#wstProductsTable').DataTable({
            responsive: true,
            order: [[0, "asc"]], 
            pageLength: 15,
            lengthMenu: [15, 50, 100, 200],
            columns: [
                { data: 'name', width: "25%" },
                { data: 'cases', className: "dt-center" },
                { data: 'units', className: "dt-center" },
                { data: 'std_time_min', className: "dt-center" }, // Minutos
                { data: 'std_time_sec', className: "dt-center" }, // Segundos
                { data: 'total_time_hrs', className: "dt-center" }, // Horas y Minutos
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

    // Cargar Logs
    async function loadLogs() {
        const fromDate = dateFromInput.value;
        const toDate = dateToInput.value;
        const lineFilter = lineFilterInput.value;

        let query = supabase
            .from('production_log')
            .select(`*, warehouse_lines(line_name), production_products(name)`)
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

    // --- 6. Renderizado de Tablas ---

    function renderProductsTable() {
        const rows = productsCache.map(prod => {
            // Conversiones de Tiempo
            const secondsPerCase = prod.seconds_per_case;
            const minutesPerCase = (secondsPerCase / 60).toFixed(2); // Decimal para edición

            // Cálculo Total Pallet: (Cajas * Segundos)
            const totalSecondsPallet = prod.cases_per_pallet * secondsPerCase;
            
            // Formato Horas y Minutos (Ignorando segundos sobrantes)
            const totalHours = Math.floor(totalSecondsPallet / 3600);
            const remainingSeconds = totalSecondsPallet % 3600;
            const totalMinutes = Math.floor(remainingSeconds / 60);

            // String formateado: "4h 30m"
            const totalTimeStr = `<span style="font-weight:bold; color:var(--goldmex-primary-color);">${totalHours}h ${totalMinutes}m</span>`;

            return {
                name: `<span style="font-weight:600; color:var(--goldmex-header-bg);">${prod.name}</span>`,
                cases: prod.cases_per_pallet,
                units: prod.units_per_case,
                std_time_min: `<span style="color:#0275d8; font-weight:bold;">${minutesPerCase} min</span>`,
                std_time_sec: `<span style="color:#666;">${secondsPerCase} s</span>`,
                total_time_hrs: totalTimeStr,
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

            // Tiempo Real (Formato Min:Seg)
            let realTime = '-';
            if (log.final_time_seconds) {
                const min = Math.floor(log.final_time_seconds / 60);
                const sec = log.final_time_seconds % 60;
                realTime = `${min}m ${sec}s`;
            }

            // Estado (Badge)
            let badgeClass = 'status-neutral';
            let label = log.status;
            
            if (log.performance_rating === 'success') { badgeClass = 'status-success'; label = 'Excellent'; }
            else if (log.performance_rating === 'warning') { badgeClass = 'status-warning'; label = 'Regular'; }
            else if (log.performance_rating === 'danger') { badgeClass = 'status-danger'; label = 'Slow'; }
            else if (log.status === 'in_progress') { badgeClass = 'status-neutral'; label = 'In Progress'; }

            return {
                date: dateStr,
                line_name: log.warehouse_lines?.line_name || 'N/A',
                operator_name: log.operator_name || '-',
                product_name: log.production_products?.name || '-',
                start_time: timeStart,
                end_time: timeEnd,
                real_time: realTime,
                std_time: log.standard_time_seconds ? (log.standard_time_seconds / 60).toFixed(1) + ' min' : '-',
                status: `<span class="badge-status ${badgeClass}">${label}</span>`
            };
        });
        logsTable.clear().rows.add(rows).draw();
    }

    // --- 7. Modal y Calculadora ---

    // Calculadora en Tiempo Real (Dentro del Modal)
    function setupTimeCalculator() {
        function updatePreview() {
            const mins = parseFloat(inputMinutes.value) || 0;
            const cases = parseInt(inputCases.value) || 0;

            if (mins > 0) {
                // Conversión inversa para mostrar al usuario lo que se guardará
                const secsPerCase = Math.round(mins * 60);
                const totalSecs = secsPerCase * cases;
                
                // Conversión a Horas y Minutos para preview
                const hrs = Math.floor(totalSecs / 3600);
                const remSecs = totalSecs % 3600;
                const remMins = Math.floor(remSecs / 60);

                calcPreview.innerHTML = `
                    <i class='bx bx-calculator'></i> 
                    <b>${mins} min</b> = ${secsPerCase} seconds/case. <br>
                    Total Pallet: <b>${hrs}h ${remMins}m</b> (${totalSecs} total seconds).
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

    // Funciones Globales (para onclick en HTML)
    window.wstEditProduct = function(id) {
        const prod = productsCache.find(p => p.id === id);
        if (!prod) return;

        document.getElementById('wst-prod-id').value = prod.id;
        document.getElementById('wst-prod-name').value = prod.name;
        document.getElementById('wst-prod-cases').value = prod.cases_per_pallet;
        document.getElementById('wst-prod-units').value = prod.units_per_case;
        
        // Convertir Segundos (DB) -> Minutos (Input)
        const minutes = parseFloat((prod.seconds_per_case / 60).toFixed(2));
        document.getElementById('wst-prod-minutes').value = minutes;

        // Disparar actualización de preview
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

    // --- 8. Event Listeners ---
    function setupEventListeners() {
        if(addProductBtn) addProductBtn.onclick = () => openModal(false);
        if(modalCloseX) modalCloseX.onclick = closeModal;
        if(modalCancelBtn) modalCancelBtn.onclick = closeModal;

        // Guardar Producto
        if(productForm) {
            productForm.onsubmit = async (e) => {
                e.preventDefault();
                
                // Preparar datos
                const minutesInput = parseFloat(document.getElementById('wst-prod-minutes').value);
                const secondsPerCase = Math.round(minutesInput * 60); // Guardar siempre en segundos

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

        // Filtros y Refresco
        if(applyFiltersBtn) applyFiltersBtn.onclick = loadLogs;
        if(refreshBtn) refreshBtn.onclick = () => { loadLogs(); loadProducts(); };
        
        // Exportar CSV
        if(exportCsvBtn) exportCsvBtn.onclick = () => {
            if(!logsCache.length) return alert("No data to export");
            const headers = ['Date','Line','Operator','Product','Start','End','RealTime(s)','StdTime(s)','Status'];
            const rows = [headers.join(',')];
            
            logsCache.forEach(l => {
                rows.push([
                    new Date(l.start_time).toLocaleDateString(),
                    l.warehouse_lines?.line_name || '',
                    l.operator_name || '',
                    l.production_products?.name || '',
                    new Date(l.start_time).toLocaleTimeString(),
                    l.warehouse_scan_time ? new Date(l.warehouse_scan_time).toLocaleTimeString() : '',
                    l.final_time_seconds || 0,
                    l.standard_time_seconds || 0,
                    l.status
                ].join(','));
            });

            const link = document.createElement("a");
            link.href = "data:text/csv;charset=utf-8," + encodeURI(rows.join("\n"));
            link.download = "production_logs.csv";
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        };
    }

    // Iniciar Módulo
    init();
})();
