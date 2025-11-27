(function () {
    // --- DEPENDENCY CHECK ---
    if (!window.supabase) {
        console.error("Supabase client missing.");
        return;
    }

    const moduleContainer = document.querySelector('.wst-ranking-container');
    if (!moduleContainer) return;

    // --- DOM ELEMENTS ---
    const rankList = document.getElementById('wst-rank-list');
    const totalPalletsEl = document.getElementById('wst-rank-total-pallets');
    const globalTimeEl = document.getElementById('wst-rank-global-time');

    // --- STATE ---
    let realtimeSubscription = null;
    let scrollInterval = null;
    let localTimerInterval = null;
    let scrollDirection = 1;
    let isPaused = false;
    let activeLinesData = [];

    // --- INITIALIZATION ---
    function init() {
        console.log("GMX Performance Board Initialized (Adjusted Efficiency Mode)");
        loadRankingData();
        setupRealtimeSubscription();
        startAutoScroll();
        startLocalTick();
    }

    // --- DATA FETCHING & PROCESSING ---
    async function loadRankingData() {
        const today = new Date().toISOString().split('T')[0];

        // Fetch logs including the new worker_count column
        const { data: logs, error } = await window.supabase
            .from('production_log')
            .select(`
                *,
                warehouse_lines (id, line_name, current_operator, current_team),
                production_products (name)
            `)
            .gte('start_time', `${today}T00:00:00`)
            .order('start_time', { ascending: true });

        if (error) {
            console.error("Error fetching ranking data:", error);
            rankList.innerHTML = `<div style="text-align:center; color:var(--rank-red);">Connection Error. Retrying...</div>`;
            return;
        }

        if (!logs || logs.length === 0) {
            renderEmptyState();
            return;
        }

        const linesMap = {};
        let grandTotalPallets = 0;
        let grandTotalDeviation = 0;

        logs.forEach(log => {
            if (!log.warehouse_lines) return;

            const lineId = log.warehouse_lines.id;
            const lineName = log.warehouse_lines.line_name;
            
            // Determine Operator Label (Single name or "Team of N")
            let opLabel = 'Unknown';
            if (log.worker_count > 1) {
                opLabel = `Team of ${log.worker_count}`;
            } else {
                // Fallback priority: Log name > Line current op > Unknown
                opLabel = log.operator_name || log.warehouse_lines.current_operator || 'Unknown';
            }

            if (!linesMap[lineId]) {
                linesMap[lineId] = {
                    id: lineId,
                    name: lineName,
                    operator: opLabel,
                    pallets: 0,
                    totalTargetSeconds: 0, // Adjusted Target
                    totalRealSeconds: 0,
                    currentStatus: 'idle',
                    currentStartTime: null,
                    currentProduct: null
                };
            }

            // Only count COMPLETED pallets for the score
            if (log.final_time_seconds !== null) {
                linesMap[lineId].pallets += 1;
                grandTotalPallets += 1;

                // --- CRITICAL CALCULATION ---
                // 1. Get Base Standard (Total Man-Hours)
                const baseStd = log.standard_time_seconds || 0;
                
                // 2. Get Team Size used for THAT pallet
                const workers = log.worker_count || 1;
                
                // 3. Calculate Adjusted Target for this specific pallet
                const adjustedTarget = baseStd / workers;

                // 4. Accumulate
                linesMap[lineId].totalTargetSeconds += adjustedTarget;
                linesMap[lineId].totalRealSeconds += (log.final_time_seconds || 0);
            }
            else {
                // Active Pallet Logic
                linesMap[lineId].currentStatus = 'active';
                linesMap[lineId].currentStartTime = new Date(log.start_time).getTime();
                linesMap[lineId].currentProduct = log.production_products?.name || 'Unknown Item';
                // Update operator display to current team if active
                linesMap[lineId].operator = opLabel;
            }
        });

        // Calculate Deviation (Saved Time)
        // Deviation = Target - Real. Positive means Saved Time (Good). Negative means Delay (Bad).
        const rankingArray = Object.values(linesMap).map(line => {
            const deviationSeconds = line.totalTargetSeconds - line.totalRealSeconds;
            grandTotalDeviation += deviationSeconds;

            return {
                ...line,
                deviationSeconds: deviationSeconds
            };
        });

        // Sort by Time Saved (Highest first)
        rankingArray.sort((a, b) => b.deviationSeconds - a.deviationSeconds);
        activeLinesData = rankingArray;

        renderDashboard(rankingArray, grandTotalPallets, grandTotalDeviation);
    }

    // --- RENDERING ---
    function renderDashboard(rankingData, totalPallets, totalDeviationSecs) {
        totalPalletsEl.textContent = totalPallets;

        const globalTimeStr = formatTimeDiff(totalDeviationSecs);
        globalTimeEl.innerHTML = globalTimeStr.html;

        rankList.innerHTML = '';

        rankingData.forEach((line, index) => {
            const rankPosition = index + 1;
            const formattedTime = formatTimeDiff(line.deviationSeconds);
            const status = getStatusConfig(line.deviationSeconds);

            const card = document.createElement('div');
            card.className = `rank-card pos-${rankPosition} ${status.borderClass}`;

            let productHtml = '';
            let statusBadgeHtml = '';
            let timerHtml = '';
            let timerId = '';

            if (line.currentStatus === 'active') {
                timerId = `timer-${line.id}`;
                productHtml = `<div class="current-item-name" title="${line.currentProduct}">${line.currentProduct}</div>`;
                statusBadgeHtml = `
                    <div class="rank-status-badge status-active">
                        <i class='bx bx-loader-alt bx-spin'></i> Processing
                    </div>`;
                timerHtml = `<div id="${timerId}" class="live-timer-display">00:00</div>`;

            } else {
                productHtml = `<div class="current-item-name" style="color:var(--rank-text-muted);">--</div>`;
                statusBadgeHtml = `
                    <div class="rank-status-badge status-idle">
                        <i class='bx bx-coffee'></i> Idle
                    </div>`;
                timerHtml = `<div class="live-timer-display" style="opacity:0;">--:--</div>`;
            }

            card.innerHTML = `
                <div class="rank-pos">#${rankPosition}</div>
                
                <div class="rank-info">
                    <div class="line-name">${line.name}</div>
                    <div class="line-op"><i class='bx bxs-user'></i> ${line.operator}</div>
                </div>

                ${productHtml}

                ${statusBadgeHtml}

                ${timerHtml}

                <div class="rank-stat">
                    <span class="stat-label">Efficiency</span>
                    <div class="time-diff ${formattedTime.class}">${formattedTime.text}</div>
                </div>

                <div class="rank-stat-pallets">
                    <span class="stat-label">Pallets</span>
                    <span class="stat-val">${line.pallets}</span>
                </div>
            `;

            card.style.animationDelay = `${index * 0.1}s`;
            rankList.appendChild(card);
        });

        updateLocalTimers();
    }

    // --- LOCAL TIMER LOGIC ---
    function startLocalTick() {
        if (localTimerInterval) clearInterval(localTimerInterval);
        localTimerInterval = setInterval(updateLocalTimers, 1000);
    }

    function updateLocalTimers() {
        const now = Date.now();
        activeLinesData.forEach(line => {
            if (line.currentStatus === 'active' && line.currentStartTime) {
                const timerEl = document.getElementById(`timer-${line.id}`);
                if (timerEl) {
                    const elapsedSecs = Math.floor((now - line.currentStartTime) / 1000);
                    const hrs = Math.floor(elapsedSecs / 3600);
                    const mins = Math.floor((elapsedSecs % 3600) / 60);
                    const secs = (elapsedSecs % 60);
                    const pad = (n) => n.toString().padStart(2, '0');

                    let timeString = '';
                    if (hrs > 0) {
                        timeString = `${hrs}:${pad(mins)}:${pad(secs)}`;
                    } else {
                        timeString = `${pad(mins)}:${pad(secs)}`;
                    }

                    timerEl.textContent = timeString;
                    // Visual cue if running very long (optional, just for visual feedback)
                    if (elapsedSecs > 3600) timerEl.style.color = 'var(--rank-red)';
                    else timerEl.style.removeProperty('color');
                }
            }
        });
    }

    function renderEmptyState() {
        totalPalletsEl.textContent = "0";
        globalTimeEl.textContent = "--";
        rankList.innerHTML = `
            <div style="text-align:center; padding:3rem; opacity:0.6;">
                <i class='bx bx-sleep-y' style="font-size:3rem; margin-bottom:1rem;"></i>
                <h3>No production data for today yet.</h3>
                <p>Waiting for the first pallet to be scanned...</p>
            </div>
        `;
    }

    function formatTimeDiff(seconds) {
        // Positive seconds = Time Saved (Good)
        // Negative seconds = Time Lost/Delayed (Bad)
        
        const isNegative = seconds < 0;
        const absSeconds = Math.abs(seconds);
        const m = Math.floor(absSeconds / 60);
        
        // Formatting: If saved time, show "+" and green. If delayed, "-" and red.
        const sign = isNegative ? '-' : '+';
        const text = `${sign} ${m} min`;

        let cssClass = 'diff-neutral';
        let colorStyle = 'color: var(--rank-yellow)';

        if (!isNegative && m > 0) {
            cssClass = 'diff-positive';
            colorStyle = 'color: var(--rank-green)'; // Green for saved time
        }
        else if (isNegative) {
            cssClass = 'diff-negative';
            colorStyle = 'color: var(--rank-red)';   // Red for delay
        }

        return {
            text: text,
            class: cssClass,
            html: `<span style="${colorStyle}">${text}</span>`
        };
    }

    function getStatusConfig(seconds) {
        // Status border based on accumulated efficiency
        if (seconds >= 0) {
            return { type: 'good', borderClass: 'status-good' };
        } else if (seconds > -900) { // Less than 15 min delay
            return { type: 'warn', borderClass: 'status-warn' };
        } else {
            return { type: 'bad', borderClass: 'status-bad' };
        }
    }

    // --- AUTO SCROLL ---
    function startAutoScroll() {
        if (scrollInterval) clearInterval(scrollInterval);
        const speed = 50;
        const step = 1;

        scrollInterval = setInterval(() => {
            if (isPaused) return;
            if (rankList.scrollHeight > rankList.clientHeight) {
                rankList.scrollTop += step * scrollDirection;
                if (rankList.scrollTop + rankList.clientHeight >= rankList.scrollHeight - 2) {
                    isPaused = true;
                    setTimeout(() => {
                        rankList.scrollTop = 0;
                        isPaused = false;
                    }, 4000);
                }
            }
        }, speed);
    }

    // --- REALTIME SUBSCRIPTION ---
    function setupRealtimeSubscription() {
        if (realtimeSubscription) return;
        realtimeSubscription = window.supabase
            .channel('public:production_log_ranking')
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'production_log' },
                (payload) => {
                    console.log('Realtime update received:', payload);
                    loadRankingData();
                }
            )
            .subscribe();
    }

    document.addEventListener('moduleWillUnload', () => {
        if (realtimeSubscription) {
            window.supabase.removeChannel(realtimeSubscription);
            realtimeSubscription = null;
        }
        if (scrollInterval) clearInterval(scrollInterval);
        if (localTimerInterval) clearInterval(localTimerInterval);
    }, { once: true });

    init();
})();
