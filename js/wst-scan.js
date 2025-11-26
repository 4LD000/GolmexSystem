(function() {
    if (!window.supabase) return console.error("Supabase missing.");
    const moduleContainer = document.querySelector('.wst-scan-container');
    if (!moduleContainer) return;

    // DOM
    const inputSection = document.getElementById('wst-input-section');
    const cameraWrapper = document.getElementById('wst-camera-wrapper');
    const scanInput = document.getElementById('wst-scan-input');
    
    // Results
    const resultCard = document.getElementById('wst-scan-result');
    const resSuccess = document.getElementById('wst-result-success');
    const resError = document.getElementById('wst-result-error');
    const resLoading = document.getElementById('wst-result-loading');
    
    // Fields
    const resProduct = document.getElementById('res-product');
    const resLine = document.getElementById('res-line-op');
    const resTime = document.getElementById('res-time');
    
    // Buttons
    const openCameraBtn = document.getElementById('wst-open-camera-btn');
    const closeCameraBtn = document.getElementById('wst-close-camera-btn');
    const nextBtn = document.getElementById('wst-next-scan-btn');
    const retryBtn = document.getElementById('wst-retry-btn');
    const refreshBtn = document.getElementById('wst-refresh-history');

    // Table Body
    const historyBody = document.getElementById('wst-scan-history-body');

    let html5QrCode = null;

    function init() {
        console.log("Scanner Module V2 (Table Fix)");
        loadHistory();
        setTimeout(() => scanInput.focus(), 500);
        
        // Keep focus for USB scanners
        document.addEventListener('click', (e) => {
            if(cameraWrapper.classList.contains('hidden') && !e.target.closest('button') && !e.target.closest('input')) {
                scanInput.focus();
            }
        });
    }

    // --- HANDLERS ---
    scanInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const val = scanInput.value.trim();
            if(val) handleScan(val);
        }
    });
    
    document.getElementById('wst-manual-search-btn').onclick = () => {
        const val = scanInput.value.trim();
        if(val) handleScan(val);
    };

    openCameraBtn.onclick = startCamera;
    closeCameraBtn.onclick = stopCamera;
    nextBtn.onclick = resetUI;
    retryBtn.onclick = resetUI;
    refreshBtn.onclick = loadHistory;

    // --- CAMERA ---
    async function startCamera() {
        inputSection.classList.add('hidden');
        cameraWrapper.classList.remove('hidden');
        resultCard.classList.add('hidden');
        
        html5QrCode = new Html5Qrcode("wst-reader");
        try {
            await html5QrCode.start({ facingMode: "environment" }, { fps: 10, qrbox: 250 }, 
                (decodedText) => {
                    stopCamera();
                    handleScan(decodedText);
                });
        } catch(e) { 
            alert("Camera error: " + e); 
            stopCamera(); 
        }
    }

    function stopCamera() {
        if(html5QrCode) {
            html5QrCode.stop().then(() => html5QrCode.clear());
        }
        cameraWrapper.classList.add('hidden');
        inputSection.classList.remove('hidden');
        scanInput.focus();
    }

    // --- PROCESS ---
    async function handleScan(code) {
        showState('loading');
        scanInput.value = '';
        scanInput.blur();

        try {
            const { data: pallet, error } = await supabase
                .from('production_log')
                .select(`*, production_products(name, cases_per_pallet, seconds_per_case), warehouse_lines(line_name)`)
                .eq('pallet_qr_id', code)
                .single();

            if(error || !pallet) throw new Error("ID not found");
            if(pallet.warehouse_scan_time) throw new Error("Pallet already scanned at " + new Date(pallet.warehouse_scan_time).toLocaleTimeString());

            // Calc
            const now = new Date();
            const start = new Date(pallet.start_time);
            const realSecs = Math.floor((now - start)/1000);
            const stdSecs = pallet.production_products.cases_per_pallet * pallet.production_products.seconds_per_case;
            let rating = 'success';
            if(realSecs > stdSecs * 1.2) rating = 'danger';
            else if(realSecs > stdSecs) rating = 'warning';

            // Update
            await supabase.from('production_log').update({
                warehouse_scan_time: now.toISOString(),
                final_time_seconds: realSecs,
                standard_time_seconds: stdSecs,
                performance_rating: rating,
                status: 'completed'
            }).eq('id', pallet.id);

            // Show Success
            showState('success');
            resProduct.textContent = pallet.production_products.name;
            resLine.textContent = (pallet.warehouse_lines?.line_name || '-') + " / " + (pallet.operator_name || '-');
            const h = Math.floor(realSecs/3600);
            const m = Math.floor((realSecs%3600)/60);
            resTime.textContent = `${h}h ${m}m`;

            loadHistory();

        } catch(e) {
            showState('error');
            document.getElementById('wst-error-message').textContent = e.message;
        }
    }

    // --- UI HELPERS ---
    function showState(state) {
        resultCard.classList.remove('hidden');
        resSuccess.classList.add('hidden');
        resError.classList.add('hidden');
        resLoading.classList.add('hidden');
        
        if(state === 'loading') resLoading.classList.remove('hidden');
        if(state === 'success') resSuccess.classList.remove('hidden');
        if(state === 'error') resError.classList.remove('hidden');
    }

    function resetUI() {
        resultCard.classList.add('hidden');
        scanInput.focus();
    }

    // --- HISTORY (TABLE RENDER FIX) ---
    async function loadHistory() {
        const today = new Date().toISOString().split('T')[0];
        const { data } = await supabase
            .from('production_log')
            .select('*, production_products(name)')
            .not('warehouse_scan_time', 'is', null)
            .gte('warehouse_scan_time', `${today} 00:00:00`)
            .order('warehouse_scan_time', { ascending: false })
            .limit(20);

        historyBody.innerHTML = '';
        if(data) {
            data.forEach(log => {
                // FIX: Create proper table rows (TR/TD) not DIVs
                const tr = document.createElement('tr');
                const time = new Date(log.warehouse_scan_time).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
                
                let iconColor = 'var(--scan-success)';
                if(log.performance_rating === 'warning') iconColor = '#f59e0b';
                if(log.performance_rating === 'danger') iconColor = 'var(--scan-error)';

                tr.innerHTML = `
                    <td style="font-family:monospace; font-weight:bold;">${time}</td>
                    <td>${log.production_products?.name || 'Unknown'}</td>
                    <td style="text-align:center;"><i class='bx bxs-circle' style="color:${iconColor}"></i></td>
                `;
                historyBody.appendChild(tr);
            });
        }
    }

    init();
})();
