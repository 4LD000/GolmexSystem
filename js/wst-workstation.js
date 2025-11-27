(function () {
    // --- DEPENDENCY CHECK ---
    if (!window.supabase) {
        console.error("CRITICAL: Supabase client missing.");
        return;
    }

    const moduleContainer = document.querySelector('.wst-workstation-container');
    if (!moduleContainer) return;

    // --- CONSTANTS & STATE ---
    const SESSION_KEY = 'gmx_wst_session_v4_cloud'; // LocalStorage

    // Application State
    let state = {
        line: null,         // { id, name, team: [], worker_count: 1 }
        product: null,      // Active product object
        pallet: null,       // { id, qr_id, start_time } from DB
        timerInterval: null
    };

    // Temporary state for the Login Modal
    let currentTeamList = [];
    let currentUserEmail = null;

    // --- DOM ELEMENTS ---
    const loadingOverlay = document.getElementById('wst-loading-state');

    // Views
    const viewSelection = document.getElementById('wst-view-selection');
    const viewDashboard = document.getElementById('wst-view-dashboard');

    // Dashboard UI
    const dashTitle = document.getElementById('wst-dashboard-line-title');
    const dashOp = document.getElementById('wst-dashboard-operator');
    const statusMsg = document.getElementById('wst-process-status');

    // Metrics Cards
    const cardName = document.getElementById('wst-card-name');
    const cardConfig = document.getElementById('wst-card-config');
    const cardStdTime = document.getElementById('wst-card-std-time');
    const cardRealTime = document.getElementById('wst-card-real-time');

    // Controls
    const selectBtn = document.getElementById('wst-open-selector-btn');
    const startBtn = document.getElementById('wst-btn-start');
    const finishBtn = document.getElementById('wst-btn-finish');
    const printBtn = document.getElementById('wst-btn-print');
    const releaseBtn = document.getElementById('wst-release-line-btn');

    // Product Modal
    const modal = document.getElementById('wst-product-modal');
    const closeModalBtn = document.getElementById('wst-close-modal-btn');
    const searchInput = document.getElementById('wst-modal-search');
    const productGrid = document.getElementById('wst-product-grid');

    // Login / Team Modal Elements
    const linesGrid = document.getElementById('wst-lines-grid-container');
    const addLineBtn = document.getElementById('wst-add-line-btn');
    const loginOverlay = document.getElementById('wst-login-overlay');
    const workerInput = document.getElementById('wst-operator-name-input');
    const addWorkerBtn = document.getElementById('wst-add-worker-btn');
    const workerListContainer = document.getElementById('wst-worker-list');
    const workerCountDisplay = document.getElementById('wst-worker-count-display');
    const confirmLoginBtn = document.getElementById('wst-confirm-login-btn');
    const cancelLoginBtn = document.getElementById('wst-cancel-login-btn');
    let pendingLineSelection = null;

    // Confirm Modal
    const confirmModal = document.getElementById('wst-confirm-modal');
    const confirmYesBtn = document.getElementById('wst-confirm-yes');
    const confirmNoBtn = document.getElementById('wst-confirm-no');

    // End Shift Modal
    const endShiftModal = document.getElementById('wst-end-shift-modal');
    const endShiftYesBtn = document.getElementById('wst-end-shift-yes');
    const endShiftNoBtn = document.getElementById('wst-end-shift-no');

    // Create Line Modal
    const createLineModal = document.getElementById('wst-create-line-modal');
    const createLineInput = document.getElementById('wst-new-line-input');
    const createLineConfirmBtn = document.getElementById('wst-create-line-confirm');
    const createLineCancelBtn = document.getElementById('wst-create-line-cancel');

    // History
    const historyList = document.getElementById('wst-history-list');
    const sessionCount = document.getElementById('wst-session-count');

    // =========================================================================
    // 1. INITIALIZATION & STATE RESTORATION
    // =========================================================================

    async function init() {
        console.log("WST V4: Initializing...");

        // 1. CRITICAL: Setup listeners FIRST
        setupEventListeners();

        // 2. Get Current User Email
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            currentUserEmail = user.email;
        }

        // 3. Try Local Storage first
        const savedSession = localStorage.getItem(SESSION_KEY);
        if (savedSession) {
            try {
                const sessionData = JSON.parse(savedSession);
                await attemptRestoreSession(sessionData);
                return;
            } catch (e) {
                console.error("Session restore failed", e);
                localStorage.removeItem(SESSION_KEY);
            }
        }

        // 4. Try Cloud Auto-Recovery
        await checkCloudForActiveSession();
    }

    async function checkCloudForActiveSession() {
        if (!currentUserEmail) {
            showSelectionView();
            return;
        }

        console.log("Checking cloud for active session owned by:", currentUserEmail);

        const { data: myLines, error } = await supabase
            .from('warehouse_lines')
            .select('*')
            .eq('status', 'busy')
            .eq('owner_email', currentUserEmail);

        if (myLines && myLines.length > 0) {
            console.log("Found active session for user! recovering automatically...");
            const line = myLines[0];
            await recoverSessionFromCloud(line);
        } else {
            console.log("No active session found for this user.");
            showSelectionView();
        }
    }

    async function attemptRestoreSession(sessionData) {
        const { data: lineData, error } = await supabase
            .from('warehouse_lines')
            .select('*')
            .eq('id', sessionData.lineId)
            .single();

        if (error || !lineData) {
            console.warn("Line not found or error (Database mismatch). Clearing local session.");
            localStorage.removeItem(SESSION_KEY);
            showSelectionView();
            return;
        }

        let teamArr = sessionData.team || (sessionData.operator ? [sessionData.operator] : []);
        let wCount = sessionData.count || 1;

        state.line = {
            id: lineData.id,
            name: lineData.line_name,
            team: teamArr,
            worker_count: wCount
        };

        const { data: activeLog } = await supabase
            .from('production_log')
            .select('*, production_products(*)')
            .eq('line_id', state.line.id)
            .eq('status', 'in_progress')
            .single();

        enterDashboardUI();

        if (activeLog) {
            restoreActivePallet(activeLog);
        } else {
            resetDashboardState();
        }

        loadHistoryTimeline();
    }

    function restoreActivePallet(logEntry) {
        state.pallet = {
            id: logEntry.id,
            qr_id: logEntry.pallet_qr_id,
            start_time: new Date(logEntry.start_time)
        };

        state.product = logEntry.production_products;
        const logWorkerCount = logEntry.worker_count || state.line.worker_count;
        updateScorecards(state.product, logWorkerCount);

        selectBtn.disabled = true;
        startBtn.disabled = true;
        finishBtn.disabled = false;
        printBtn.disabled = true;

        statusMsg.innerHTML = `<span style="color:var(--wst-warning)">Resumed:</span> Processing ${state.product.name}...`;

        startRealTimeTimer(state.pallet.start_time);
    }

    // =========================================================================
    // 2. VIEW MANAGEMENT
    // =========================================================================

    function showSelectionView() {
        loadingOverlay.style.display = 'none';
        viewDashboard.classList.remove('active');
        viewDashboard.classList.add('hidden');
        viewSelection.classList.remove('hidden');
        viewSelection.classList.add('active');
        loadLinesGrid();
    }

    function enterDashboardUI() {
        loadingOverlay.style.display = 'none';
        viewSelection.classList.remove('active');
        viewSelection.classList.add('hidden');
        viewDashboard.classList.remove('hidden');
        viewDashboard.classList.add('active');

        dashTitle.textContent = state.line.name;

        if (state.line.worker_count > 1) {
            dashOp.innerHTML = `${state.line.worker_count} Workers <i class='bx bx-info-circle' style="font-size:0.8rem"></i>`;
            dashOp.title = state.line.team.join(", ");
        } else {
            dashOp.textContent = state.line.team[0] || "Unknown";
        }
    }

    // =========================================================================
    // 3. TEAM MANAGEMENT LOGIC
    // =========================================================================

    function addWorkerToTeam() {
        const name = workerInput.value.trim();
        if (!name) return;

        if (currentTeamList.some(w => w.toLowerCase() === name.toLowerCase())) {
            alert("Worker already in list.");
            return;
        }

        currentTeamList.push(name);
        workerInput.value = '';
        workerInput.focus();
        renderTeamList();
    }

    function removeWorker(index) {
        currentTeamList.splice(index, 1);
        renderTeamList();
    }
    window.wstRemoveWorker = removeWorker;

    function renderTeamList() {
        workerCountDisplay.textContent = currentTeamList.length;
        confirmLoginBtn.disabled = currentTeamList.length === 0;

        workerListContainer.innerHTML = '';

        if (currentTeamList.length === 0) {
            workerListContainer.innerHTML = `
                <div style="padding:1rem; text-align:center; color:var(--wst-text-light); font-size:0.9rem; margin-top: 2rem;">
                    No workers assigned yet.<br>Add at least one to start.
                </div>`;
            return;
        }

        const ul = document.createElement('ul');
        ul.style.listStyle = 'none';
        ul.style.padding = '0';
        ul.style.margin = '0';

        currentTeamList.forEach((worker, index) => {
            const li = document.createElement('li');
            li.style.padding = '10px 15px';
            li.style.borderBottom = '1px solid var(--wst-border)';
            li.style.display = 'flex';
            li.style.justifyContent = 'space-between';
            li.style.alignItems = 'center';
            li.style.background = 'var(--wst-card-bg)';

            li.innerHTML = `
                <span style="font-weight:500;"><i class='bx bx-user' style="margin-right:8px; color:var(--wst-text-light);"></i> ${worker}</span>
                <i class='bx bx-x' style="cursor:pointer; color:var(--wst-danger); font-size:1.2rem; padding:4px;" onclick="wstRemoveWorker(${index})"></i>
            `;
            ul.appendChild(li);
        });
        workerListContainer.appendChild(ul);
    }

    // =========================================================================
    // 4. LINE SELECTION & LOGIN (WITH EMAIL BINDING)
    // =========================================================================

    async function loadLinesGrid() {
        linesGrid.innerHTML = '<div class="wst-spinner"><i class="bx bx-loader-alt bx-spin"></i></div>';

        const { data: lines } = await supabase
            .from('warehouse_lines')
            .select('*')
            .order('id');

        linesGrid.innerHTML = '';

        if (!lines || lines.length === 0) {
            linesGrid.innerHTML = '<p>No lines defined.</p>';
            return;
        }

        lines.forEach(line => {
            const isBusy = line.status === 'busy';
            // Check if THIS busy line belongs to the current user
            const isMyLine = isBusy && (line.owner_email === currentUserEmail);

            const card = document.createElement('div');
            card.className = `wst-line-card ${isBusy ? 'busy' : 'available'}`;

            let iconClass = isBusy ? 'bx-error-circle' : 'bx-check-circle';
            let statusLabel = isBusy ? 'OCCUPIED' : 'AVAILABLE';

            if (isMyLine) {
                statusLabel = 'YOUR SESSION (CLICK TO RESUME)';
                card.style.borderColor = 'var(--wst-primary)'; // Visual cue
            }

            let opInfo = '';
            if (isBusy) {
                const count = line.worker_count || 1;
                const label = count > 1 ? `${count} Workers` : (line.current_operator || 'Unknown');
                opInfo = `<div style="margin-top:0.5rem; font-size:0.9rem; color:var(--wst-danger)">${label}</div>`;
            }

            card.innerHTML = `
                <div class="line-icon"><i class='bx ${iconClass}'></i></div>
                <div class="line-name">${line.line_name}</div>
                <span class="status-text">${statusLabel}</span>
                ${opInfo}
            `;

            if (!isBusy) {
                // Free line -> Start new session
                card.onclick = () => promptLogin(line);
            } else if (isMyLine) {
                // My line -> Auto recover click
                card.style.cursor = "pointer";
                card.onclick = () => recoverSessionFromCloud(line);
            } else {
                // Occupied by someone else -> Blocked
                card.style.opacity = "0.5";
                card.style.cursor = "not-allowed";
                card.onclick = () => alert(`Access Denied. This line is locked by ${line.owner_email || 'another user'}.`);
            }

            linesGrid.appendChild(card);
        });
    }

    function promptLogin(line) {
        pendingLineSelection = line;
        document.getElementById('wst-selected-line-display').textContent = line.line_name;
        currentTeamList = [];
        workerInput.value = '';
        renderTeamList();
        loginOverlay.classList.remove('hidden');
        workerInput.focus();
    }

    async function confirmTeamLogin() {
        if (currentTeamList.length === 0) return;
        loadingOverlay.style.display = 'flex';

        const mainOp = currentTeamList[0];
        const count = currentTeamList.length;

        // Save session with EMAIL OWNER
        const { error } = await supabase
            .from('warehouse_lines')
            .update({
                status: 'busy',
                current_operator: mainOp,
                current_team: currentTeamList,
                worker_count: count,
                owner_email: currentUserEmail
            })
            .eq('id', pendingLineSelection.id);

        if (error) {
            console.error("Login Error:", error);
            alert("Error assigning line.");
            loadingOverlay.style.display = 'none';
            return;
        }

        const sessionData = {
            lineId: pendingLineSelection.id,
            team: currentTeamList,
            count: count
        };
        localStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));

        loginOverlay.classList.add('hidden');
        init();
    }

    async function recoverSessionFromCloud(line) {
        loadingOverlay.style.display = 'flex';
        console.log("Recovering session from cloud data...");

        const sessionData = {
            lineId: line.id,
            team: line.current_team || (line.current_operator ? [line.current_operator] : []),
            count: line.worker_count || 1
        };

        localStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
        await attemptRestoreSession(sessionData);
    }

    // =========================================================================
    // 5. DASHBOARD LOGIC 
    // =========================================================================

    function resetDashboardState() {
        stopTimer();
        state.product = null;
        state.pallet = null;
        cardName.textContent = "--";
        cardConfig.textContent = "0 Units / 0 Cases";
        cardStdTime.textContent = "0h 0m";
        cardRealTime.textContent = "00:00:00";
        cardRealTime.parentElement.classList.remove('active-pulse');
        statusMsg.innerHTML = "Idle - Select Product";
        statusMsg.style.color = "var(--wst-text-light)";
        selectBtn.disabled = false;
        startBtn.disabled = true;
        finishBtn.disabled = true;
        printBtn.disabled = true;
    }

    async function loadProducts(filter = '') {
        let query = supabase.from('production_products').select('*');
        if (filter) query = query.ilike('name', `%${filter}%`);
        const { data } = await query.limit(20);
        renderProductGrid(data || []);
    }

    function renderProductGrid(products) {
        productGrid.innerHTML = '';
        products.forEach(p => {
            const card = document.createElement('div');
            card.className = 'wst-prod-card';
            card.innerHTML = `
                <i class='bx bx-box'></i>
                <div style="font-weight:600; font-size:0.9rem;">${p.name}</div>
                <div style="font-size:0.8rem; color:#888;">${p.cases_per_pallet} cases</div>
            `;
            card.onclick = () => selectProduct(p);
            productGrid.appendChild(card);
        });
    }

    function selectProduct(product) {
        state.product = product;
        updateScorecards(product, state.line.worker_count);
        modal.classList.add('hidden');
        startBtn.disabled = false;
        statusMsg.innerHTML = `<span style="color:var(--wst-primary)">Ready:</span> Click Start to begin.`;
    }

    function updateScorecards(p, workerCount) {
        cardName.textContent = p.name;
        cardName.title = p.name;
        cardConfig.textContent = `${p.units_per_case} U / ${p.cases_per_pallet} Cases`;
        const totalBaseSeconds = p.cases_per_pallet * p.seconds_per_case;
        const safeCount = workerCount > 0 ? workerCount : 1;
        const adjustedSeconds = Math.ceil(totalBaseSeconds / safeCount);
        const h = Math.floor(adjustedSeconds / 3600);
        const m = Math.floor((adjustedSeconds % 3600) / 60);
        const timeText = `${h}h ${m}m`;
        cardStdTime.innerHTML = timeText;
        if (safeCount > 1) {
            cardStdTime.innerHTML += `<div style="font-size:0.65rem; opacity:0.8; font-weight:normal;">(Split by ${safeCount} workers)</div>`;
        }
    }

    async function handleStart() {
        if (!state.product) return;
        selectBtn.disabled = true;
        startBtn.disabled = true;
        const qrId = `PLT-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const now = new Date();
        statusMsg.innerHTML = "Starting process...";

        const { data, error } = await supabase
            .from('production_log')
            .insert([{
                pallet_qr_id: qrId,
                line_id: state.line.id,
                product_id: state.product.id,
                operator_name: state.line.team[0] || "Unknown",
                team_members: state.line.team,
                worker_count: state.line.worker_count,
                start_time: now.toISOString(),
                status: 'in_progress'
            }])
            .select()
            .single();

        if (error) {
            alert("Error starting process.");
            selectBtn.disabled = false;
            startBtn.disabled = false;
            return;
        }

        state.pallet = {
            id: data.id,
            qr_id: qrId,
            start_time: now
        };
        statusMsg.innerHTML = `<span style="color:var(--wst-success)">Running:</span> Pallet in progress...`;
        finishBtn.disabled = false;
        startRealTimeTimer(now);
    }

    function handleFinishRequest() {
        if (!state.pallet) return;
        confirmModal.classList.remove('hidden');
    }

    async function executeFinishProcess() {
        confirmModal.classList.add('hidden');
        finishBtn.disabled = true;
        stopTimer();
        const now = new Date();
        const durationSec = Math.floor((now - state.pallet.start_time) / 1000);

        const { error } = await supabase
            .from('production_log')
            .update({
                line_finish_time: now.toISOString(),
                final_time_seconds: durationSec,
                status: 'waiting_for_scan'
            })
            .eq('id', state.pallet.id);

        if (error) {
            alert("Error saving finish time.");
            finishBtn.disabled = false;
            return;
        }
        statusMsg.innerHTML = "Pallet Complete. Printing Label...";
        printBtn.disabled = false;
        handlePrint(); // Auto print immediately after finish
    }

    function handlePrint() {
        if (!state.pallet || !state.product) return;
        const opDisplay = state.line.worker_count > 1
            ? `Team of ${state.line.worker_count}`
            : state.line.team[0];

        const data = {
            qr: state.pallet.qr_id,
            prod: state.product.name,
            op: opDisplay,
            date: new Date().toLocaleDateString()
        };

        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${data.qr}`;

        // --- PRINT WINDOW LOGIC (DESKTOP & MOBILE FIX) ---
        const win = window.open('', '_blank', 'width=400,height=550');

        win.document.write(`
            <html>
            <head>
                <style>
                    body { font-family: sans-serif; text-align: center; padding: 20px; }
                    /* Style for buttons */
                    .action-btn { 
                        background: #0e2c4c; color: white; border: none; 
                        padding: 14px 24px; font-size: 16px; border-radius: 8px; 
                        cursor: pointer; margin: 10px; width: 80%;
                    }
                    .close-btn { background: #e5e7eb; color: #333; }
                    
                    /* HIDE BUTTONS ON ACTUAL PRINT */
                    @media print { 
                        .no-print { display: none !important; } 
                        body { padding: 0; margin: 0; }
                    }
                </style>
            </head>
            <body>
                <h3 style="margin-bottom:5px;">GOLMEX WAREHOUSE</h3>
                <p style="font-size:12px; margin-top:0;">${state.line.name} | ${data.op}</p>
                <hr style="margin:15px 0;">
                <h2 style="margin:10px 0;">${data.prod}</h2>
                <div style="margin:20px 0;"><img src="${qrUrl}" style="width:140px;"></div>
                <p style="font-family:monospace; font-size:18px; font-weight:bold;">${data.qr}</p>
                <p style="font-size:12px;">${data.date}</p>
                
                <div class="no-print" style="margin-top: 30px; border-top: 1px dashed #ccc; padding-top: 20px;">
                    <button class="action-btn" onclick="window.print()">🖨️ Print Label</button>
                    <br>
                    <button class="action-btn close-btn" onclick="window.close()">Close Window</button>
                </div>

                <script>
                    window.onload = function() { 
                        setTimeout(() => window.print(), 500); 
                    }
                </script>
            </body>
            </html>
        `);

        // --- CRITICAL FIX FOR DESKTOP ---
        win.document.close();
        win.focus();

        loadHistoryTimeline();
        resetDashboardState();
    }

    function handleEndShiftRequest() {
        if (state.pallet && state.pallet.id) {
            alert("Cannot end shift active pallet. Finish it first.");
            return;
        }
        endShiftModal.classList.remove('hidden');
    }

    async function executeEndShift() {
        endShiftModal.classList.add('hidden');
        loadingOverlay.style.display = 'flex';

        await supabase.from('warehouse_lines')
            .update({
                status: 'available',
                current_operator: null,
                current_team: [],
                worker_count: 1,
                owner_email: null // Release the email lock
            })
            .eq('id', state.line.id);

        localStorage.removeItem(SESSION_KEY);
        location.reload();
    }

    async function handleCreateLine() {
        const name = createLineInput.value.trim();
        if (!name) return alert("Please enter a line name.");
        createLineModal.classList.add('hidden');
        loadingOverlay.style.display = 'flex';
        const { error } = await supabase.from('warehouse_lines').insert([{ line_name: name }]);
        if (error) alert("Error creating line.");
        else await loadLinesGrid();
        loadingOverlay.style.display = 'none';
        createLineInput.value = '';
    }

    function startRealTimeTimer(startTimeObj) {
        stopTimer();
        cardRealTime.parentElement.classList.add('highlight-card');
        state.timerInterval = setInterval(() => {
            const now = new Date();
            const diff = now - startTimeObj;
            const totalSecs = Math.floor(diff / 1000);
            const hrs = Math.floor(totalSecs / 3600);
            const mins = Math.floor((totalSecs % 3600) / 60);
            const secs = totalSecs % 60;
            const pad = (n) => n.toString().padStart(2, '0');
            cardRealTime.textContent = `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
        }, 1000);
    }

    function stopTimer() {
        if (state.timerInterval) clearInterval(state.timerInterval);
        state.timerInterval = null;
        cardRealTime.parentElement.classList.remove('highlight-card');
    }

    async function loadHistoryTimeline() {
        const today = new Date().toISOString().split('T')[0];
        const { data: logs } = await supabase
            .from('production_log')
            .select(`*, production_products(name)`)
            .eq('line_id', state.line.id)
            .gte('start_time', `${today}T00:00:00`)
            .order('start_time', { ascending: false });
        renderTimeline(logs || []);
    }

    function renderTimeline(logs) {
        sessionCount.textContent = logs.length;
        historyList.innerHTML = '';
        if (logs.length === 0) {
            historyList.innerHTML = `
                <div id="wst-empty-history" class="empty-message">
                    <i class='bx bx-list-ul' style="font-size: 2rem; opacity: 0.5;"></i>
                    <p>No pallets processed today.</p>
                </div>`;
            return;
        }
        logs.forEach(log => {
            const start = new Date(log.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const end = log.line_finish_time
                ? new Date(log.line_finish_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : '...';
            const card = document.createElement('div');
            card.className = 'wst-history-card';
            if (log.status === 'in_progress') card.style.borderLeftColor = 'var(--wst-warning)';
            else if (log.status === 'waiting_for_scan') card.style.borderLeftColor = 'var(--wst-success)';
            else card.style.borderLeftColor = 'var(--wst-border)';

            card.innerHTML = `
                <div class="hist-header">
                    <span class="hist-id">${log.pallet_qr_id.split('-').pop()}</span>
                    <span>${log.status === 'in_progress' ? 'Running' : 'Done'}</span>
                </div>
                <div class="hist-body">${log.production_products?.name || 'Unknown Product'}</div>
                <div class="hist-footer">
                    <div class="hist-times">
                        <span class="time-range"><i class='bx bx-time'></i> ${start} - ${end}</span>
                    </div>
                    ${log.status !== 'in_progress' ? `<button class="btn-reprint-sm" title="Reprint"><i class='bx bxs-printer'></i></button>` : ''}
                </div>`;

            const reprintBtn = card.querySelector('.btn-reprint-sm');
            if (reprintBtn) {
                reprintBtn.onclick = () => {
                    state.pallet = { qr_id: log.pallet_qr_id };
                    state.product = { name: log.production_products?.name };
                    handlePrint();
                };
            }
            historyList.appendChild(card);
        });
    }

    function setupEventListeners() {
        if (addLineBtn) addLineBtn.onclick = () => {
            createLineModal.classList.remove('hidden');
            createLineInput.focus();
        };
        createLineCancelBtn.onclick = () => createLineModal.classList.add('hidden');
        createLineConfirmBtn.onclick = handleCreateLine;

        cancelLoginBtn.onclick = () => loginOverlay.classList.add('hidden');
        confirmLoginBtn.onclick = confirmTeamLogin;

        addWorkerBtn.onclick = addWorkerToTeam;
        workerInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addWorkerToTeam(); });

        releaseBtn.onclick = handleEndShiftRequest;

        selectBtn.onclick = () => {
            modal.classList.remove('hidden');
            searchInput.value = '';
            loadProducts();
            searchInput.focus();
        };
        closeModalBtn.onclick = () => modal.classList.add('hidden');
        searchInput.oninput = (e) => loadProducts(e.target.value);

        startBtn.onclick = handleStart;
        finishBtn.onclick = handleFinishRequest;
        printBtn.onclick = handlePrint;

        confirmYesBtn.onclick = executeFinishProcess;
        confirmNoBtn.onclick = () => confirmModal.classList.add('hidden');

        endShiftYesBtn.onclick = executeEndShift;
        endShiftNoBtn.onclick = () => endShiftModal.classList.add('hidden');
    }

    init();
})();
