(function() {
    if (!window.supabase) return console.error("Supabase client not found.");
    const moduleContainer = document.querySelector('.wst-scan-container');
    if (!moduleContainer) return;

    // DOM Elements
    const scanInput = document.getElementById('wst-scan-input');
    const searchBtn = document.getElementById('wst-manual-search-btn');
    const resultCard = document.getElementById('wst-scan-result');
    
    // Result Sections
    const resSuccess = document.getElementById('wst-result-success');
    const resError = document.getElementById('wst-result-error');
    const resLoading = document.getElementById('wst-result-loading');
    
    // Data Fields
    const fProd = document.getElementById('scan-prod-name');
    const fLine = document.getElementById('scan-line-name');
    const fOp = document.getElementById('scan-operator');
    const fTime = document.getElementById('scan-total-time');
    const fRating = document.getElementById('scan-rating-badge');
    const errorMsg = document.getElementById('wst-error-msg');

    // Buttons
    const btnReset = document.getElementById('wst-scan-reset-btn');
    const btnError = document.getElementById('wst-error-reset-btn');

    // History
    const historyBody = document.getElementById('wst-scan-history-body');

    // Audio (Optional)
    const soundSuccess = document.getElementById('audio-success'); 
    const soundError = document.getElementById('audio-error');

    // --- INIT ---
    function init() {
        console.log("WST Scanner Initialized (Mobile/Reader Optimized)");
        loadTodaysHistory();
        
        // FORCE FOCUS ON LOAD
        setTimeout(() => {
            scanInput.focus();
        }, 500);

        // --- MOBILE/READER LOGIC (KEEP FOCUS) ---
        // 1. Click listener: Refocus unless clicking a button
        document.addEventListener('click', (e) => {
            const isButton = e.target.closest('button') || e.target.tagName === 'A';
            const isInput = e.target === scanInput;
            
            if (!isButton && !isInput) {
                scanInput.focus();
            }
        });

        // 2. Interval check: Ensure focus is kept periodically (aggressive mode)
        // Useful if focus is lost due to system dialogs or other interruptions
        setInterval(() => {
            if (document.activeElement !== scanInput && !document.querySelector('.btn-block:active')) {
               // scanInput.focus(); // Uncomment for very aggressive focus
            }
        }, 2000);
    }

    // --- HANDLERS ---
    scanInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const code = scanInput.value.trim();
            if (code) processScan(code);
        }
    });

    searchBtn.onclick = () => {
        const code = scanInput.value.trim();
        if (code) processScan(code);
    };

    btnReset.onclick = resetScanner;
    btnError.onclick = resetScanner;

    // --- CORE LOGIC ---
    async function processScan(qrCode) {
        showState('loading');
        
        // Optional: Blur to hide soft keyboard on mobile, then refocus later
        // scanInput.blur(); 

        try {
            // 1. Fetch Pallet Data
            const { data: pallet, error } = await supabase
                .from('production_log')
                .select(`
                    *,
                    production_products (name, cases_per_pallet, seconds_per_case),
                    warehouse_lines (line_name)
                `)
                .eq('pallet_qr_id', qrCode)
                .single();

            if (error || !pallet) throw new Error("Code not found in system.");

            // 2. Validations
            if (pallet.warehouse_scan_time) {
                throw new Error("This pallet was ALREADY registered previously.");
            }

            // 3. CALCULATIONS
            const now = new Date();
            const startTime = new Date(pallet.start_time);
            
            // Real Time (Seconds)
            const realTimeSecs = Math.floor((now - startTime) / 1000);
            
            // Standard Time (Seconds)
            const stdTimeSecs = pallet.production_products.cases_per_pallet * pallet.production_products.seconds_per_case;
            
            // Deviation
            const deviation = realTimeSecs - stdTimeSecs;

            // Rating Logic
            let rating = 'success';
            if (realTimeSecs > stdTimeSecs * 1.20) rating = 'danger'; 
            else if (realTimeSecs > stdTimeSecs) rating = 'warning'; 

            // 4. UPDATE DB
            const { error: updateError } = await supabase
                .from('production_log')
                .update({
                    warehouse_scan_time: now.toISOString(),
                    final_time_seconds: realTimeSecs,
                    standard_time_seconds: stdTimeSecs,
                    deviation_seconds: deviation,
                    performance_rating: rating,
                    status: 'completed'
                })
                .eq('id', pallet.id);

            if (updateError) throw new Error("Error saving data: " + updateError.message);

            // 5. SUCCESS UI
            showSuccess(pallet, realTimeSecs, rating);
            if(soundSuccess) soundSuccess.play().catch(()=>{});
            loadTodaysHistory(); 

        } catch (err) {
            showError(err.message);
            if(soundError) soundError.play().catch(()=>{});
        }
    }

    // --- UI HELPERS ---
    function showState(state) {
        resultCard.classList.remove('hidden');
        resLoading.classList.add('hidden');
        resSuccess.classList.add('hidden');
        resError.classList.add('hidden');

        if (state === 'loading') resLoading.classList.remove('hidden');
        if (state === 'success') resSuccess.classList.remove('hidden');
        if (state === 'error') resError.classList.remove('hidden');
    }

    function showSuccess(pallet, realSeconds, rating) {
        showState('success');
        
        fProd.textContent = pallet.production_products.name;
        fLine.textContent = pallet.warehouse_lines ? pallet.warehouse_lines.line_name : 'N/A';
        fOp.textContent = pallet.operator_name;
        
        // Format Time
        const h = Math.floor(realSeconds / 3600);
        const m = Math.floor((realSeconds % 3600) / 60);
        const s = realSeconds % 60;
        fTime.textContent = `${h}h ${m}m ${s}s`;

        // Rating Badge
        let label = "Excellent";
        let colorClass = "rating-good";
        if (rating === 'warning') { label = "Average"; colorClass = "rating-avg"; }
        if (rating === 'danger') { label = "Slow"; colorClass = "rating-bad"; }
        
        fRating.textContent = label;
        fRating.className = ""; 
        fRating.classList.add(colorClass);
    }

    function showError(msg) {
        showState('error');
        errorMsg.textContent = msg;
    }

    function resetScanner() {
        scanInput.value = '';
        resultCard.classList.add('hidden');
        scanInput.focus(); 
    }

    // --- HISTORY ---
    async function loadTodaysHistory() {
        const today = new Date().toISOString().split('T')[0];
        
        const { data, error } = await supabase
            .from('production_log')
            .select('*, production_products(name)')
            .not('warehouse_scan_time', 'is', null) 
            .gte('warehouse_scan_time', `${today} 00:00:00`)
            .order('warehouse_scan_time', { ascending: false })
            .limit(20);

        if (data) renderHistory(data);
    }

    function renderHistory(logs) {
        historyBody.innerHTML = '';
        logs.forEach(log => {
            const time = new Date(log.warehouse_scan_time).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
            const tr = document.createElement('tr');
            
            let statusIcon = "<i class='bx bxs-check-circle' style='color:var(--scan-success)'></i>";
            if(log.performance_rating === 'danger') statusIcon = "<i class='bx bxs-error-circle' style='color:var(--scan-error)'></i>";
            else if(log.performance_rating === 'warning') statusIcon = "<i class='bx bxs-minus-circle' style='color:#f59e0b'></i>";

            tr.innerHTML = `
                <td>${time}</td>
                <td>${log.production_products?.name || '?'}</td>
                <td style="font-family:monospace; font-size:0.85rem;">${log.pallet_qr_id.substring(0,12)}...</td>
                <td style="text-align:center;">${statusIcon}</td>
            `;
            historyBody.appendChild(tr);
        });
    }

    init();
})();
