(function () {
    // --- DEPENDENCY CHECK ---
    if (!window.supabase) {
        console.error("CRITICAL: Supabase client missing.");
        return;
    }

    const moduleContainer = document.querySelector('.wst-workstation-container');
    if (!moduleContainer) return;

    // --- CONSTANTS & STATE ---
    const SESSION_KEY = 'gmx_wst_session_v5_cloud'; 

    // Application State
    let state = {
        line: null,         // { id, name, team: [], worker_count: 1 }
        product: null,      // Active product object
        pallet: null,       // { id, qr_id, start_time, is_paused, total_pause_seconds } 
        timerInterval: null
    };

    // Prevent double-click / race conditions (Fixes 400 Bad Request on Pauses)
    let isLoadingAction = false;

    // Realtime Subscriptions
    let lineSubscription = null;
    let selectionSubscription = null;

    // Temporary state for Modals
    let currentTeamList = []; // For Login
    let currentLiveTeamList = []; // For Live Edit
    let currentUserEmail = null;
    let pendingLineSelection = null;

    // --- DOM ELEMENTS ---
    const loadingOverlay = document.getElementById('wst-loading-state');

    // Views
    const viewSelection = document.getElementById('wst-view-selection');
    const viewDashboard = document.getElementById('wst-view-dashboard');

    // Dashboard UI
    const dashTitle = document.getElementById('wst-dashboard-line-title');
    const dashOp = document.getElementById('wst-dashboard-operator');
    const editTeamTrigger = document.getElementById('wst-edit-team-trigger'); // NEW
    const statusMsg = document.getElementById('wst-process-status');

    // Metrics Cards
    const cardName = document.getElementById('wst-card-name');
    const cardConfig = document.getElementById('wst-card-config');
    const cardStdTime = document.getElementById('wst-card-std-time');
    const cardRealTime = document.getElementById('wst-card-real-time');

    // Controls
    const selectBtn = document.getElementById('wst-open-selector-btn');
    const startBtn = document.getElementById('wst-btn-start'); // Chameleon Button (Start/Pause/Resume)
    const finishBtn = document.getElementById('wst-btn-finish');
    const printBtn = document.getElementById('wst-btn-print');
    const releaseBtn = document.getElementById('wst-release-line-btn');

    // Product Modal
    const modal = document.getElementById('wst-product-modal');
    const closeModalBtn = document.getElementById('wst-close-modal-btn');
    const searchInput = document.getElementById('wst-modal-search');
    const productGrid = document.getElementById('wst-product-grid');

    // Login Modal Elements
    const linesGrid = document.getElementById('wst-lines-grid-container');
    const addLineBtn = document.getElementById('wst-add-line-btn');
    const loginOverlay = document.getElementById('wst-login-overlay');
    const workerInput = document.getElementById('wst-operator-name-input');
    const addWorkerBtn = document.getElementById('wst-add-worker-btn');
    const workerListContainer = document.getElementById('wst-worker-list');
    const workerCountDisplay = document.getElementById('wst-worker-count-display');
    const confirmLoginBtn = document.getElementById('wst-confirm-login-btn');
    const cancelLoginBtn = document.getElementById('wst-cancel-login-btn');

    // NEW: Live Crew Modal Elements
    const liveCrewModal = document.getElementById('wst-live-crew-modal');
    const liveCrewInput = document.getElementById('wst-live-crew-input');
    const liveCrewAddBtn = document.getElementById('wst-live-crew-add-btn');
    const liveCrewListContainer = document.getElementById('wst-live-crew-list');
    const liveCrewSaveBtn = document.getElementById('wst-live-crew-save');
    const liveCrewCancelBtn = document.getElementById('wst-live-crew-cancel');

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
    // 0. TOAST NOTIFICATION SYSTEM
    // =========================================================================

    function showToast(message, type = 'info') {
        const existing = document.querySelectorAll('.wst-toast-notification');
        existing.forEach(e => e.remove());

        const toast = document.createElement('div');
        toast.className = 'wst-toast-notification';

        Object.assign(toast.style, {
            position: 'fixed',
            top: '20px',
            right: '20px',
            zIndex: '9999',
            backgroundColor: type === 'error' ? '#ef4444' : (type === 'success' ? '#10b981' : (type === 'warning' ? '#f59e0b' : '#3b82f6')),
            color: 'white',
            padding: '12px 20px',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            fontSize: '14px',
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            animation: 'slideInToast 0.3s ease-out',
            maxWidth: '90%'
        });

        const icon = type === 'error' ? "<i class='bx bx-x-circle'></i>" :
            (type === 'success' ? "<i class='bx bx-check-circle'></i>" : "<i class='bx bx-info-circle'></i>");

        toast.innerHTML = `${icon} <span>${message}</span>`;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(-10px)';
            toast.style.transition = 'all 0.3s';
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

    const styleSheet = document.createElement("style");
    styleSheet.innerText = `
        @keyframes slideInToast {
            from { opacity: 0; transform: translateY(-20px); }
            to { opacity: 1; transform: translateY(0); }
        }
    `;
    document.head.appendChild(styleSheet);

    // =========================================================================
    // 1. INITIALIZATION & STATE RESTORATION
    // =========================================================================

    async function init() {
        console.log("WST V5 Full: Initializing...");

        setupEventListeners();

        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            currentUserEmail = user.email;
        }

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

        await checkCloudForActiveSession();
    }

    async function checkCloudForActiveSession() {
        if (!currentUserEmail) {
            showSelectionView();
            return;
        }

        const { data: myLines, error } = await supabase
            .from('warehouse_lines')
            .select('*')
            .eq('status', 'busy')
            .eq('owner_email', currentUserEmail);

        if (myLines && myLines.length > 0) {
            const line = myLines[0];
            await recoverSessionFromCloud(line);
        } else {
            showSelectionView();
        }
    }

    async function attemptRestoreSession(sessionData) {
        // 1. Get fresh data from Supabase
        const { data: lineData, error } = await supabase
            .from('warehouse_lines')
            .select('*')
            .eq('id', sessionData.lineId)
            .single();

        // CASE A: Line not found or error
        if (error || !lineData) {
            console.warn("Line not found. Clearing local session.");
            localStorage.removeItem(SESSION_KEY);
            showSelectionView();
            return;
        }

        // CASE B: Line exists, but OWNER IS NOT ME
        if (currentUserEmail && lineData.owner_email &&
            lineData.owner_email.toLowerCase() !== currentUserEmail.toLowerCase()) {
            
            console.error("SECURITY ALERT: Local session belongs to another user.");
            localStorage.removeItem(SESSION_KEY);
            await checkCloudForActiveSession();
            return;
        }

        // CASE C: Line is no longer busy (ended remotely)
        if (lineData.status !== 'busy') {
            console.warn("Line is no longer busy in DB.");
            localStorage.removeItem(SESSION_KEY);
            showSelectionView();
            return;
        }

        // Hydrate State
        let teamArr = lineData.current_team || (lineData.current_operator ? [lineData.current_operator] : []);
        let wCount = lineData.worker_count || 1;

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
            start_time: new Date(logEntry.start_time),
            is_paused: logEntry.is_paused || false,
            total_pause_seconds: logEntry.total_pause_seconds || 0
        };

        state.product = logEntry.production_products;
        
        // Use the Dynamic Target if available, else calculate base
        if(state.product) {
            if(logEntry.current_target_seconds) {
                 updateScorecardsWithNewTarget(logEntry.current_target_seconds);
            } else {
                 const logWorkerCount = logEntry.worker_count || state.line.worker_count;
                 updateScorecardsBase(state.product, logWorkerCount);
            }
        }

        selectBtn.disabled = true;
        startBtn.disabled = false; // Enabled because it acts as Pause/Resume
        finishBtn.disabled = false;
        printBtn.disabled = true;

        if (state.pallet.is_paused) {
            updateActionButtonsState('paused');
            statusMsg.innerHTML = `<span style="color:var(--wst-warning)"><i class='bx bx-pause'></i> PAUSED</span> - Resume to continue.`;
            cardRealTime.textContent = "PAUSED";
        } else {
            updateActionButtonsState('running');
            statusMsg.innerHTML = `<span style="color:var(--wst-success)">Running:</span> Processing ${state.product.name}...`;
            startRealTimeTimer(state.pallet.start_time, state.pallet.total_pause_seconds);
        }
    }

    // =========================================================================
    // 2. VIEW MANAGEMENT & REALTIME SYNC
    // =========================================================================

    function setupSelectionRealtime() {
        if (selectionSubscription) return;

        selectionSubscription = supabase.channel('grid-view-global')
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'warehouse_lines' },
                (payload) => {
                    loadLinesGrid();
                }
            )
            .subscribe();
    }

    function setupLineRealtime(lineId) {
        if (lineSubscription) {
            supabase.removeChannel(lineSubscription);
        }

        lineSubscription = supabase.channel(`line-sync-${lineId}`)
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'warehouse_lines', filter: `id=eq.${lineId}` },
                (payload) => {
                    const newData = payload.new;
                    if (newData.status === 'available') {
                        showToast("Session ended from another device.", "info");
                        localStorage.removeItem(SESSION_KEY);
                        setTimeout(() => { location.reload(); }, 2000);
                    }
                }
            )
            .subscribe();
    }

    function showSelectionView() {
        loadingOverlay.style.display = 'none';

        viewDashboard.classList.remove('active');
        viewDashboard.classList.add('hidden');
        viewSelection.classList.remove('hidden');
        viewSelection.classList.add('active');

        if (lineSubscription) {
            supabase.removeChannel(lineSubscription);
            lineSubscription = null;
        }

        loadLinesGrid();
        setupSelectionRealtime();
    }

    function enterDashboardUI() {
        loadingOverlay.style.display = 'none';

        viewSelection.classList.remove('active');
        viewSelection.classList.add('hidden');
        viewDashboard.classList.remove('hidden');
        viewDashboard.classList.add('active');

        if (selectionSubscription) {
            supabase.removeChannel(selectionSubscription);
            selectionSubscription = null;
        }

        updateHeaderUI();

        if (state.line && state.line.id) {
            setupLineRealtime(state.line.id);
        }
    }

    function updateHeaderUI() {
        dashTitle.textContent = state.line.name;

        if (state.line.worker_count > 1) {
            dashOp.innerHTML = `${state.line.worker_count} Workers <i class='bx bx-info-circle' style="font-size:0.8rem"></i>`;
            dashOp.title = state.line.team.join(", ");
        } else {
            dashOp.textContent = state.line.team[0] || "Unknown";
        }
    }

    // =========================================================================
    // 3. TEAM MANAGEMENT LOGIC (Login & Live)
    // =========================================================================

    // --- LOGIN MODAL LOGIC ---
    function addWorkerToTeam() {
        const name = workerInput.value.trim();
        if (!name) return;

        if (currentTeamList.some(w => w.toLowerCase() === name.toLowerCase())) {
            showToast("Worker already in list.", 'error');
            return;
        }

        currentTeamList.push(name);
        workerInput.value = '';
        workerInput.focus();
        renderTeamList();
    }

    window.wstRemoveWorker = function(index) {
        currentTeamList.splice(index, 1);
        renderTeamList();
    }

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

    // --- LIVE CREW MODAL LOGIC (New Feature) ---
    function openLiveCrewModal() {
        if(!state.pallet) {
            showToast("Start a process first to edit crew.", "info");
            return;
        }
        // Deep copy current team to temp list
        currentLiveTeamList = [...state.line.team];
        liveCrewModal.classList.remove('hidden');
        liveCrewInput.value = '';
        renderLiveTeamList();
    }

    function addLiveWorker() {
        const name = liveCrewInput.value.trim();
        if (!name) return;
        if (currentLiveTeamList.some(w => w.toLowerCase() === name.toLowerCase())) {
            showToast("Worker already in list.", 'error');
            return;
        }
        currentLiveTeamList.push(name);
        liveCrewInput.value = '';
        liveCrewInput.focus();
        renderLiveTeamList();
    }

    window.wstRemoveLiveWorker = function(index) {
        currentLiveTeamList.splice(index, 1);
        renderLiveTeamList();
    }

    function renderLiveTeamList() {
        liveCrewListContainer.innerHTML = '';
        
        const ul = document.createElement('ul');
        ul.style.listStyle = 'none';
        ul.style.padding = '0';
        
        currentLiveTeamList.forEach((worker, index) => {
            const li = document.createElement('li');
            li.style.padding = '10px 15px';
            li.style.borderBottom = '1px solid var(--wst-border)';
            li.style.display = 'flex';
            li.style.justifyContent = 'space-between';
            li.style.alignItems = 'center';
            
            li.innerHTML = `
                <span>${worker}</span>
                <i class='bx bx-trash' style="cursor:pointer; color:var(--wst-danger);" onclick="wstRemoveLiveWorker(${index})"></i>
            `;
            ul.appendChild(li);
        });
        liveCrewListContainer.appendChild(ul);
    }

    async function saveCrewModification() {
        const newCount = currentLiveTeamList.length;
        if (newCount === 0) return showToast("Crew cannot be empty", "error");

        loadingOverlay.style.display = 'flex';
        liveCrewModal.classList.add('hidden');

        // Call RPC
        const { data, error } = await supabase.rpc('update_crew_size', {
            p_log_id: state.pallet.id,
            p_new_crew_size: newCount,
            p_new_team_members: currentLiveTeamList
        });

        loadingOverlay.style.display = 'none';

        if (error) {
            showToast(error.message, 'error');
            return;
        }

        // Success: Update Local State & UI
        showToast("Crew updated & Target Recalculated!", "success");
        state.line.team = [...currentLiveTeamList];
        state.line.worker_count = newCount;
        
        updateHeaderUI();
        updateScorecardsWithNewTarget(data.new_target); // data.new_target comes from RPC
    }

    // =========================================================================
    // 4. LINE SELECTION & LOGIN FLOW
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
            const isMyLine = isBusy && (line.owner_email === currentUserEmail);

            const card = document.createElement('div');
            card.className = `wst-line-card ${isBusy ? 'busy' : 'available'}`;

            let iconClass = isBusy ? 'bx-error-circle' : 'bx-check-circle';
            let statusLabel = isBusy ? 'OCCUPIED' : 'AVAILABLE';

            if (isMyLine) {
                statusLabel = 'YOUR SESSION (CLICK TO RESUME)';
                card.style.borderColor = 'var(--wst-primary)';
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
                card.onclick = () => promptLogin(line);
            } else if (isMyLine) {
                card.style.cursor = "pointer";
                card.onclick = () => recoverSessionFromCloud(line);
            } else {
                card.style.opacity = "0.5";
                card.style.cursor = "not-allowed";
                card.onclick = () => showToast(`Access Denied. Locked by: ${line.owner_email || 'Another User'}`, 'error');
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
        if (currentTeamList.length === 0) {
            showToast("Add at least one worker.", 'error');
            return;
        }

        // PRE-CHECK: Is line still available?
        const { data: check } = await supabase
            .from('warehouse_lines')
            .select('status')
            .eq('id', pendingLineSelection.id)
            .single();

        if (check && check.status === 'busy') {
            showToast("Too late! Someone else just took this line.", 'error');
            loginOverlay.classList.add('hidden');
            loadLinesGrid(); // Refresh view
            return;
        }

        loadingOverlay.style.display = 'flex';

        const mainOp = currentTeamList[0];
        const count = currentTeamList.length;

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
            showToast("Error assigning line.", 'error');
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
        showToast("Recovering session...", 'success');

        const sessionData = {
            lineId: line.id,
            team: line.current_team || (line.current_operator ? [line.current_operator] : []),
            count: line.worker_count || 1
        };

        localStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
        await attemptRestoreSession(sessionData);
    }

    // =========================================================================
    // 5. DASHBOARD LOGIC (Start, Pause, Resume, Finish)
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
        
        updateActionButtonsState('idle'); // Enable Start
        selectBtn.disabled = false;
        printBtn.disabled = true;
    }

    // --- BUTTON STATE MANAGEMENT ---
    function updateActionButtonsState(status) {
        // status: 'idle', 'running', 'paused'
        
        const btn = startBtn;
        
        // Reset classes
        btn.className = 'wst-action-btn'; 
        
        if (status === 'idle') {
            btn.innerHTML = `<i class='bx bx-play-circle'></i> Start Process`;
            btn.classList.add('btn-start'); 
            btn.disabled = false;
            btn.onclick = handleStart;
            finishBtn.disabled = true;
            document.body.classList.remove('is-paused-mode');
        } 
        else if (status === 'running') {
            btn.innerHTML = `<i class='bx bx-pause-circle'></i> Pause`;
            btn.classList.add('btn-warning'); // CSS class defined in wst-workstation.css
            btn.disabled = false;
            btn.onclick = () => handlePauseToggle('pause');
            finishBtn.disabled = false;
            document.body.classList.remove('is-paused-mode');
        } 
        else if (status === 'paused') {
            btn.innerHTML = `<i class='bx bx-play-circle'></i> Resume`;
            btn.classList.add('btn-success'); 
            btn.disabled = false;
            btn.onclick = () => handlePauseToggle('resume');
            finishBtn.disabled = true; // Cannot finish while paused
            document.body.classList.add('is-paused-mode');
        }
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
        updateScorecardsBase(product, state.line.worker_count);
        modal.classList.add('hidden');
        
        updateActionButtonsState('idle'); // Ready to start
        statusMsg.innerHTML = `<span style="color:var(--wst-primary)">Ready:</span> Click Start to begin.`;
    }

    function updateScorecardsBase(p, workerCount) {
        cardName.textContent = p.name;
        cardName.title = p.name;
        cardConfig.textContent = `${p.units_per_case} U / ${p.cases_per_pallet} Cases`;
        const totalBaseSeconds = p.cases_per_pallet * p.seconds_per_case;
        const safeCount = workerCount > 0 ? workerCount : 1;
        const adjustedSeconds = Math.ceil(totalBaseSeconds / safeCount);
        renderTimeCard(adjustedSeconds);
    }

    function updateScorecardsWithNewTarget(newTargetSeconds) {
        // Force refresh name/config in case they were missing
        if(state.product) {
            cardName.textContent = state.product.name;
            cardConfig.textContent = `${state.product.units_per_case} U / ${state.product.cases_per_pallet} Cases`;
        }
        renderTimeCard(newTargetSeconds);
    }

    function renderTimeCard(seconds) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const timeText = `${h}h ${m}m`;
        cardStdTime.innerHTML = timeText;
    }

    async function handleStart() {
        if (!state.product) return;
        if (isLoadingAction) return; // Prevent double click

        isLoadingAction = true;
        selectBtn.disabled = true;
        startBtn.disabled = true;
        
        const qrId = `PLT-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const now = new Date();
        statusMsg.innerHTML = "Starting process...";

        // Initial Target Calculation
        const baseSeconds = state.product.cases_per_pallet * state.product.seconds_per_case;
        const initialCrew = state.line.worker_count;
        const initialTarget = Math.ceil(baseSeconds / initialCrew);

        const { data, error } = await supabase
            .from('production_log')
            .insert([{
                pallet_qr_id: qrId,
                line_id: state.line.id,
                product_id: state.product.id,
                operator_name: state.line.team[0] || "Unknown",
                team_members: state.line.team,
                worker_count: initialCrew,
                start_time: now.toISOString(),
                status: 'in_progress',
                // New Fields Initialization
                accumulated_target_seconds: 0,
                last_change_time: now.toISOString(),
                current_target_seconds: initialTarget
            }])
            .select()
            .single();

        isLoadingAction = false;
        startBtn.disabled = false;

        if (error) {
            showToast("Error starting process.", 'error');
            selectBtn.disabled = false;
            return;
        }

        state.pallet = {
            id: data.id,
            qr_id: qrId,
            start_time: now,
            is_paused: false,
            total_pause_seconds: 0
        };
        statusMsg.innerHTML = `<span style="color:var(--wst-success)">Running:</span> Pallet in progress...`;
        
        updateActionButtonsState('running');
        startRealTimeTimer(now, 0);
    }

    async function handlePauseToggle(action) { // action = 'pause' or 'resume'
        if (!state.pallet) return;
        if (isLoadingAction) return; // Prevent 400 Bad Request spam

        // Lock UI
        isLoadingAction = true;
        startBtn.disabled = true;
        startBtn.style.opacity = "0.7";
        loadingOverlay.style.display = 'flex';

        const { data, error } = await supabase
            .rpc('toggle_pause', { 
                p_log_id: state.pallet.id, 
                p_action: action 
            });

        // Unlock UI
        loadingOverlay.style.display = 'none';
        isLoadingAction = false;
        startBtn.disabled = false;
        startBtn.style.opacity = "1";

        if (error) {
            console.error(error);
            showToast(`Error: ${error.message}`, 'error');
            return;
        }

        if (action === 'pause') {
            state.pallet.is_paused = true;
            stopTimer(); 
            updateActionButtonsState('paused');
            statusMsg.innerHTML = `<span style="color:var(--wst-warning)"><i class='bx bx-pause'></i> PAUSED</span> - Resume to continue.`;
            cardRealTime.textContent = "PAUSED";
        } else {
            state.pallet.is_paused = false;
            // Fetch fresh total_pause_seconds from DB to be accurate
            const { data: freshLog } = await supabase.from('production_log').select('total_pause_seconds').eq('id', state.pallet.id).single();
            const pauseTotal = freshLog ? freshLog.total_pause_seconds : 0;
            state.pallet.total_pause_seconds = pauseTotal;
            
            updateActionButtonsState('running');
            statusMsg.innerHTML = `<span style="color:var(--wst-success)">Running:</span> Pallet in progress...`;
            startRealTimeTimer(state.pallet.start_time, pauseTotal); 
        }
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
        
        // Calculate Real Duration: (Now - Start) - TotalPauses
        const durationSec = Math.floor((now - state.pallet.start_time) / 1000) - state.pallet.total_pause_seconds;

        const { error } = await supabase
            .from('production_log')
            .update({
                line_finish_time: now.toISOString(),
                final_time_seconds: durationSec,
                status: 'waiting_for_scan'
            })
            .eq('id', state.pallet.id);

        if (error) {
            showToast("Error saving finish time.", 'error');
            finishBtn.disabled = false;
            return;
        }
        statusMsg.innerHTML = "Pallet Complete. Printing Label...";
        printBtn.disabled = false;
        handlePrint();
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

        const win = window.open('', '_blank', 'width=400,height=550');

        win.document.write(`
            <html>
            <head>
                <style>
                    body { font-family: sans-serif; text-align: center; padding: 20px; }
                    .action-btn { 
                        background: #0e2c4c; color: white; border: none; 
                        padding: 14px 24px; font-size: 16px; border-radius: 8px; 
                        cursor: pointer; margin: 10px; width: 80%;
                    }
                    .close-btn { background: #e5e7eb; color: #333; }
                    @media print { 
                        .no-print { display: none !important; } 
                        body { padding: 0; margin: 0; }
                    }
                </style>
            </head>
            <body>
                <h3 style="margin-bottom:5px;">GOLDMEX WAREHOUSE</h3>
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

        win.document.close();
        win.focus();

        loadHistoryTimeline();
        resetDashboardState();
    }

    function handleEndShiftRequest() {
        if (state.pallet && state.pallet.id) {
            showToast("Cannot end shift active pallet. Finish it first.", 'error');
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
                owner_email: null
            })
            .eq('id', state.line.id);

        localStorage.removeItem(SESSION_KEY);
        location.reload();
    }

    async function handleCreateLine() {
        const name = createLineInput.value.trim();
        if (!name) return showToast("Please enter a line name.", 'error');

        createLineModal.classList.add('hidden');
        loadingOverlay.style.display = 'flex';
        const { error } = await supabase.from('warehouse_lines').insert([{ line_name: name }]);

        if (error) showToast("Error creating line.", 'error');
        else await loadLinesGrid();

        loadingOverlay.style.display = 'none';
        createLineInput.value = '';
    }

    function startRealTimeTimer(startTimeObj, totalPauseSeconds = 0) {
        stopTimer();
        cardRealTime.parentElement.classList.add('highlight-card');
        
        state.timerInterval = setInterval(() => {
            const now = new Date();
            // Important: Subtract total pauses from elapsed time
            const diff = now - startTimeObj;
            const totalSecs = Math.floor(diff / 1000) - totalPauseSeconds;
            
            const validSecs = totalSecs > 0 ? totalSecs : 0;

            const hrs = Math.floor(validSecs / 3600);
            const mins = Math.floor((validSecs % 3600) / 60);
            const secs = validSecs % 60;
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

        // Start button onclick is handled dynamically by updateActionButtonsState
        
        finishBtn.onclick = handleFinishRequest;
        printBtn.onclick = handlePrint;

        confirmYesBtn.onclick = executeFinishProcess;
        confirmNoBtn.onclick = () => confirmModal.classList.add('hidden');

        endShiftYesBtn.onclick = executeEndShift;
        endShiftNoBtn.onclick = () => endShiftModal.classList.add('hidden');

        // NEW Live Edit
        if(editTeamTrigger) editTeamTrigger.onclick = openLiveCrewModal;
        liveCrewAddBtn.onclick = addLiveWorker;
        liveCrewInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addLiveWorker(); });
        liveCrewCancelBtn.onclick = () => liveCrewModal.classList.add('hidden');
        liveCrewSaveBtn.onclick = saveCrewModification;
    }

    init();
})();
