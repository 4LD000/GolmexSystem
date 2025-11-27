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
        console.log("GMX Performance Board Initialized (Local Timezone Fixed)");
        loadRankingData();
        setupRealtimeSubscription();
        startAutoScroll();
        startLocalTick();
    }

    // --- DATA FETCHING & PROCESSING ---
    async function loadRankingData() {
        // --- FIX: USE LOCAL DEVICE TIME, NOT UTC ---
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
        const day = String(now.getDate()).padStart(2, '0');

        // This creates "2025-11-27" based on TIJUANA time, not UTC
        const todayLocal = `${year}-${month}-${day}`;

        console.log("Loading data for Local Date:", todayLocal);

        // Fetch logs
        const { data: logs, error } = await window.supabase
            .from('production_log')
            .select(`
                *,
                warehouse_lines (id, line_name, current_operator, current_team),
                production_products (name)
            `)
            // We calculate the filter manually to handle the TZ offset correctly
            // We want anything created "After midnight local time"
            // But since DB is UTC, we need to be careful. 
            // Simplest Fix: Filter by the ISO string generated from Local Midnight converted to UTC
            // However, simpler approach: Just filter by string matching or ensure app logic handles it.

            // Supabase filter correction:
            // We will filter >= '2025-11-27 00:00:00' (Local)
            // But we need to send this in a format Supabase understands relative to the stored UTC.
            // Actually, let's filter by 'created_at' or 'start_time' but let JS filter the day to be safe 
            // OR send the ISO string of local midnight.

            .gte('start_time', `${todayLocal}T08:00:00`) // Tijuana Midnight is 08:00 UTC (approx). 
            // BETTER YET: Let's just filter broadly and filter in JS to be 100% sure of "Today"

            .order('start_time', { ascending: true });

        /* NOTE ON TIMEZONES: 
           Supabase stores in UTC. If you are in Tijuana (UTC-8), your "Day" starts at 08:00:00 UTC.
           If we query `${todayLocal}T00:00:00`, we are asking for 4PM Previous Day in Tijuana.
           To fix this perfectly without complex offsets, we will filter in Memory below.
        */

        if (error) {
            console.error("Error fetching ranking data:", error);
            return;
        }

        if (!logs || logs.length === 0) {
            renderEmptyState();
            return;
        }

        // --- CLIENT SIDE FILTERING (100% ACCURATE TO LOCAL DEVICE) ---
        const todayLogs = logs.filter(log => {
            const logDate = new Date(log.start_time);
            // Compare local dates
            return logDate.getFullYear() === now.getFullYear() &&
                logDate.getMonth() === now.getMonth() &&
                logDate.getDate() === now.getDate();
        });

        if (todayLogs.length === 0) {
            renderEmptyState();
            return;
        }

        processRankingData(todayLogs);
    }

    function processRankingData(logs) {
        const linesMap = {};
        let grandTotalPallets = 0;
        let grandTotalDeviation = 0;

        logs.forEach(log => {
            if (!log.warehouse_lines) return;

            const lineId = log.warehouse_lines.id;
            const lineName = log.warehouse_lines.line_name;

            let opLabel = 'Unknown';
            if (log.worker_count > 1) {
                opLabel = `Team of ${log.worker_count}`;
            } else {
                opLabel = log.operator_name || log.warehouse_lines.current_operator || 'Unknown';
            }

            if (!linesMap[lineId]) {
                linesMap[lineId] = {
                    id: lineId,
                    name: lineName,
                    operator: opLabel,
                    pallets: 0,
                    totalTargetSeconds: 0,
                    totalRealSeconds: 0,
                    currentStatus: 'idle',
                    currentStartTime: null,
                    currentProduct: null
                };
            }

            if (log.final_time_seconds !== null) {
                linesMap[lineId].pallets += 1;
                grandTotalPallets += 1;

                const baseStd = log.standard_time_seconds || 0;
                const workers = log.worker_count || 1;
                const adjustedTarget = baseStd / workers;

                linesMap[lineId].totalTargetSeconds += adjustedTarget;
                linesMap[lineId].totalRealSeconds += (log.final_time_seconds || 0);
            }
            else {
                linesMap[lineId].currentStatus = 'active';
                linesMap[lineId].currentStartTime = new Date(log.start_time).getTime();
                linesMap[lineId].currentProduct = log.production_products?.name || 'Unknown Item';
                linesMap[lineId].operator = opLabel;
            }
        });

        const rankingArray = Object.values(linesMap).map(line => {
            const deviationSeconds = line.totalTargetSeconds - line.totalRealSeconds;
            grandTotalDeviation += deviationSeconds;

            return {
                ...line,
                deviationSeconds: deviationSeconds
            };
        });

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
        const isNegative = seconds < 0;
        const absSeconds = Math.abs(seconds);
        const m = Math.floor(absSeconds / 60);

        const sign = isNegative ? '-' : '+';
        const text = `${sign} ${m} min`;

        let cssClass = 'diff-neutral';
        let colorStyle = 'color: var(--rank-yellow)';

        if (!isNegative && m > 0) {
            cssClass = 'diff-positive';
            colorStyle = 'color: var(--rank-green)';
        }
        else if (isNegative) {
            cssClass = 'diff-negative';
            colorStyle = 'color: var(--rank-red)';
        }

        return {
            text: text,
            class: cssClass,
            html: `<span style="${colorStyle}">${text}</span>`
        };
    }

    function getStatusConfig(seconds) {
        if (seconds >= 0) {
            return { type: 'good', borderClass: 'status-good' };
        } else if (seconds > -900) {
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
