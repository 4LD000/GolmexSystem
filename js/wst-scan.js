(function() {
    if (!window.supabase) return console.error("Supabase missing.");
    const moduleContainer = document.querySelector('.wst-scan-container');
    if (!moduleContainer) return;

    // DOM
    const inputSection = document.getElementById('wst-input-section');
    const cameraWrapper = document.getElementById('wst-camera-wrapper');
    const scanInput = document.getElementById('wst-scan-input');
    
    // Buttons
    const openCameraBtn = document.getElementById('wst-open-camera-btn');
    const closeCameraBtn = document.getElementById('wst-close-camera-btn');
    
    // Result Areas
    const resultCard = document.getElementById('wst-result-card');
    const resSuccess = document.getElementById('wst-res-success');
    const resError = document.getElementById('wst-res-error');
    const resLoading = document.getElementById('wst-res-loading');
    
    // Success Data
    const resProduct = document.getElementById('res-product');
    const resLine = document.getElementById('res-line-op');
    const resTime = document.getElementById('res-time');
    const nextBtn = document.getElementById('wst-next-scan-btn');
    const retryBtn = document.getElementById('wst-retry-btn');
    
    // History
    const historyContainer = document.getElementById('wst-history-container');
    const refreshHistoryBtn = document.getElementById('wst-refresh-history');

    let html5QrCode = null;

    // --- INIT ---
    function init() {
        console.log("Scanner Module Initialized");
        loadHistory();
        
        // Auto-focus for USB scanners
        setTimeout(() => scanInput.focus(), 500);
        document.addEventListener('click', (e) => {
            if(cameraWrapper.classList.contains('hidden') && !e.target.closest('button')) {
                scanInput.focus();
            }
        });
    }

    // --- HANDLERS ---
    scanInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const code = scanInput.value.trim();
            if(code) handleScan(code);
        }
    });

    openCameraBtn.onclick = startCamera;
    closeCameraBtn.onclick = stopCamera;
    nextBtn.onclick = resetUI;
    retryBtn.onclick = resetUI;
    refreshHistoryBtn.onclick = loadHistory;

    // --- CAMERA LOGIC ---
    async function startCamera() {
        inputSection.classList.add('hidden');
        cameraWrapper.classList.remove('hidden');
        resultCard.classList.add('hidden');

        html5QrCode = new Html5Qrcode("wst-reader");
        try {
            await html5QrCode.start(
                { facingMode: "environment" },
                { fps: 10, qrbox: { width: 250, height: 250 } },
                (decodedText) => {
                    stopCamera();
                    handleScan(decodedText);
                }
            );
        } catch (err) {
            console.error(err);
            alert("Camera error: " + err);
            stopCamera();
        }
    }

    function stopCamera() {
        if(html5QrCode) {
            html5QrCode.stop().then(() => {
                html5QrCode.clear();
                cameraWrapper.classList.add('hidden');
                inputSection.classList.remove('hidden');
                scanInput.focus();
            }).catch(err => console.error(err));
        } else {
            cameraWrapper.classList.add('hidden');
            inputSection.classList.remove('hidden');
        }
    }

    // --- PROCESS LOGIC ---
    async function handleScan(qrCode) {
        showState('loading');
        scanInput.value = '';
        scanInput.blur(); // Hide mobile keyboard

        try {
            // 1. Search Pallet
            const { data: pallet, error } = await supabase
                .from('production_log')
                .select(`
                    *,
                    production_products (name, cases_per_pallet, seconds_per_case),
                    warehouse_lines (line_name, current_operator)
                `)
                .eq('pallet_qr_id', qrCode)
                .single();

            if(error || !pallet) throw new Error("Pallet ID not found.");
            
            // 2. Check Status
            if(pallet.warehouse_scan_time) {
                throw new Error("Pallet ALREADY scanned at " + new Date(pallet.warehouse_scan_time).toLocaleTimeString());
            }

            // 3. Calculate Stats
            const now = new Date();
            const start = new Date(pallet.start_time);
            const realSecs = Math.floor((now - start) / 1000);
            const stdSecs = pallet.production_products.cases_per_pallet * pallet.production_products.seconds_per_case;
            
            // Calculate Performance
            let rating = 'success';
            if(realSecs > stdSecs * 1.2) rating = 'danger';
            else if(realSecs > stdSecs) rating = 'warning';

            // 4. Update DB
            const { error: updateError } = await supabase
                .from('production_log')
                .update({
                    warehouse_scan_time: now.toISOString(),
                    final_time_seconds: realSecs,
                    standard_time_seconds: stdSecs,
                    performance_rating: rating,
                    status: 'completed'
                })
                .eq('id', pallet.id);

            if(updateError) throw updateError;

            // 5. Show Success
            displaySuccess(pallet, realSecs);
            loadHistory();

        } catch (err) {
            showError(err.message);
        }
    }

    // --- UI HELPERS ---
    function showState(state) {
        resultCard.classList.remove('hidden');
        resLoading.classList.add('hidden');
        resSuccess.classList.add('hidden');
        resError.classList.add('hidden');

        if(state === 'loading') resLoading.classList.remove('hidden');
        if(state === 'success') resSuccess.classList.remove('hidden');
        if(state === 'error') resError.classList.remove('hidden');
    }

    function displaySuccess(pallet, seconds) {
        showState('success');
        resProduct.textContent = pallet.production_products.name;
        
        // Handle potential null line relation if line was deleted
        const lineName = pallet.warehouse_lines ? pallet.warehouse_lines.line_name : 'Unknown Line';
        resLine.textContent = `${lineName} (${pallet.operator_name})`;
        
        const h = Math.floor(seconds/3600);
        const m = Math.floor((seconds%3600)/60);
        resTime.textContent = `${h}h ${m}m`;
    }

    function showError(msg) {
        showState('error');
        document.getElementById('wst-error-message').textContent = msg;
    }

    function resetUI() {
        resultCard.classList.add('hidden');
        scanInput.value = '';
        scanInput.focus();
    }

    // --- HISTORY ---
    async function loadHistory() {
        const today = new Date().toISOString().split('T')[0];
        const { data } = await supabase
            .from('production_log')
            .select('*, production_products(name)')
            .not('warehouse_scan_time', 'is', null)
            .gte('warehouse_scan_time', `${today} 00:00:00`)
            .order('warehouse_scan_time', { ascending: false })
            .limit(15);

        historyContainer.innerHTML = '';
        if(!data || data.length === 0) {
            historyContainer.innerHTML = '<div style="padding:1rem; text-align:center; color:#999;">No scans today.</div>';
            return;
        }

        data.forEach(log => {
            const div = document.createElement('div');
            div.className = 'history-item';
            const time = new Date(log.warehouse_scan_time).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
            
            div.innerHTML = `
                <div class="h-main">
                    <strong>${log.production_products.name}</strong>
                    <small>ID: ${log.pallet_qr_id.substring(0,8)}...</small>
                </div>
                <div class="h-time">${time}</div>
            `;
            historyContainer.appendChild(div);
        });
    }

    init();
})();
