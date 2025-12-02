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
    let localTimerInterval = null;
    let activeLinesData = [];
    
    // Almacena referencias a los elementos del DOM para reutilizarlos
    let cardElementsMap = new Map();

    // --- INITIALIZATION ---
    function init() {
        console.log("GMX Performance Board V6 (Smart Sort): Initialized");
        loadRankingData();
        setupRealtimeSubscription();
        // REMOVED: startAutoScroll(); -> Ya no queremos el elevador
        startLocalTick();
    }

    // --- DATA FETCHING & PROCESSING ---
    async function loadRankingData() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const todayLocal = `${year}-${month}-${day}`;

        const { data: logs, error } = await window.supabase
            .from('production_log')
            .select(`
                *,
                warehouse_lines (id, line_name, current_operator, current_team),
                production_products (name)
            `)
            .gte('start_time', `${todayLocal}T00:00:00`) 
            .order('start_time', { ascending: true });

        if (error) {
            console.error("Error fetching ranking data:", error);
            return;
        }

        if (!logs || logs.length === 0) {
            renderEmptyState();
            return;
        }

        const todayLogs = logs.filter(log => {
            const logDate = new Date(log.start_time);
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
                    isPaused: false,
                    totalPauseSeconds: 0,
                    currentStartTime: null,
                    currentProduct: null
                };
            }

            if (log.final_time_seconds !== null) {
                linesMap[lineId].pallets += 1;
                grandTotalPallets += 1;

                const finalTarget = log.current_target_seconds 
                    ? log.current_target_seconds 
                    : (log.standard_time_seconds / (log.worker_count || 1));

                linesMap[lineId].totalTargetSeconds += finalTarget;
                linesMap[lineId].totalRealSeconds += (log.final_time_seconds || 0);
            }
            else {
                linesMap[lineId].currentStatus = 'active';
                linesMap[lineId].isPaused = log.is_paused || false;
                linesMap[lineId].totalPauseSeconds = log.total_pause_seconds || 0;
                linesMap[lineId].currentStartTime = new Date(log.start_time).getTime();
                linesMap[lineId].currentProduct = log.production_products?.name || 'Unknown Item';
                linesMap[lineId].operator = opLabel;
            }
        });

        const rankingArray = Object.values(linesMap).map(line => {
            const deviationSeconds = line.totalTargetSeconds - line.totalRealSeconds;
            grandTotalDeviation += deviationSeconds;
            return { ...line, deviationSeconds };
        });

        // Ordenar por Eficiencia (Mayor ahorro primero)
        rankingArray.sort((a, b) => b.deviationSeconds - a.deviationSeconds);
        
        activeLinesData = rankingArray;

        renderDashboard(rankingArray, grandTotalPallets, grandTotalDeviation);
    }

    // --- SMART RENDERING (FLIP ANIMATION) ---
    function renderDashboard(rankingData, totalPallets, totalDeviationSecs) {
        // 1. Actualizar Header Global
        totalPalletsEl.textContent = totalPallets;
        const globalTimeData = formatTimeDiff(totalDeviationSecs);
        const globalFace = getFaceIcon(totalDeviationSecs);
        globalTimeEl.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px;">
                <i class='bx ${globalFace.icon} global-face-icon' style="color:${globalFace.color}"></i>
                ${globalTimeData.html}
            </div>
        `;

        // 2. Preparar animación FLIP (First, Last, Invert, Play)
        // Capturar posiciones antiguas
        const prevPositions = new Map();
        rankingData.forEach(line => {
            const el = cardElementsMap.get(line.id);
            if (el && el.isConnected) {
                prevPositions.set(line.id, el.getBoundingClientRect().top);
            }
        });

        // 3. Crear/Actualizar elementos en el DOM (Virtualmente primero)
        const currentElements = [];
        
        rankingData.forEach((line, index) => {
            const rankPosition = index + 1;
            let card = cardElementsMap.get(line.id);

            // Si no existe, crearla
            if (!card) {
                card = document.createElement('div');
                card.id = `line-card-${line.id}`;
                cardElementsMap.set(line.id, card);
            }

            // Actualizar Clases (Importante para bordes de estado)
            const statusStyle = getStatusConfig(line.deviationSeconds);
            card.className = `rank-card pos-${rankPosition} ${statusStyle.borderClass}`;

            // Generar contenido interno HTML
            const formattedTime = formatTimeDiff(line.deviationSeconds);
            const faceData = getFaceIcon(line.deviationSeconds);
            
            let productHtml, statusBadgeHtml, timerHtml;
            const timerId = `timer-${line.id}`;

            if (line.currentStatus === 'active') {
                productHtml = `<div class="current-item-name" title="${line.currentProduct}">${line.currentProduct}</div>`;
                if (line.isPaused) {
                    statusBadgeHtml = `<div class="rank-status-badge status-paused"><i class='bx bx-pause-circle'></i> PAUSED</div>`;
                    timerHtml = `<div id="${timerId}" class="live-timer-display" style="color:var(--rank-paused)">PAUSED</div>`;
                } else {
                    statusBadgeHtml = `<div class="rank-status-badge status-active"><i class='bx bx-loader-alt bx-spin'></i> Processing</div>`;
                    timerHtml = `<div id="${timerId}" class="live-timer-display">00:00</div>`;
                }
            } else {
                productHtml = `<div class="current-item-name" style="color:var(--rank-text-muted);">--</div>`;
                statusBadgeHtml = `<div class="rank-status-badge status-idle"><i class='bx bx-coffee'></i> Idle</div>`;
                timerHtml = `<div class="live-timer-display" style="opacity:0;">--:--</div>`;
            }

            // Actualizar HTML interno
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
                <div class="rank-face-icon">
                    <i class='bx ${faceData.icon}' style="color:${faceData.color}"></i>
                </div>
                <div class="rank-stat-pallets">
                    <span class="stat-label">Pallets</span>
                    <span class="stat-val">${line.pallets}</span>
                </div>
            `;

            currentElements.push(card);
        });

        // 4. Reordenar el DOM real
        // Esto mueve los elementos a sus nuevas posiciones instantáneamente
        rankList.innerHTML = ''; 
        currentElements.forEach(el => rankList.appendChild(el));

        // 5. Ejecutar Animación FLIP
        currentElements.forEach(card => {
            const lineId = parseInt(card.id.replace('line-card-', ''));
            const oldTop = prevPositions.get(lineId);
            
            if (oldTop !== undefined) {
                const newTop = card.getBoundingClientRect().top;
                const delta = oldTop - newTop;

                if (delta !== 0) {
                    // INVERT: Mover visualmente al lugar antiguo
                    requestAnimationFrame(() => {
                        card.style.transition = 'none';
                        card.style.transform = `translateY(${delta}px)`;

                        // PLAY: Soltarlo hacia el nuevo lugar
                        requestAnimationFrame(() => {
                            card.style.transition = 'transform 0.5s ease-in-out';
                            card.style.transform = '';
                        });
                    });
                }
            } else {
                // Elemento nuevo: Animación de entrada simple
                card.style.animation = 'slideIn 0.5s ease-out';
            }
        });

        // Forzar actualización inmediata de los relojes (para que no salgan en 00:00)
        updateLocalTimers();
    }

    // --- HELPER FUNCTIONS (Sin cambios lógicos) ---
    function getFaceIcon(seconds) {
        if (seconds >= 0) return { icon: 'bx-happy-heart-eyes', color: 'var(--rank-green)' };
        else if (seconds > -600) return { icon: 'bx-meh', color: 'var(--rank-yellow)' };
        else return { icon: 'bx-sad', color: 'var(--rank-red)' };
    }

    function formatTimeDiff(seconds) {
        const isNegative = seconds < 0;
        const m = Math.floor(Math.abs(seconds) / 60);
        const sign = isNegative ? '-' : '+';
        const text = `${sign} ${m} min`;
        let cssClass = 'diff-neutral';
        let colorStyle = 'color: var(--rank-yellow)';

        if (!isNegative && m > 0) { cssClass = 'diff-positive'; colorStyle = 'color: var(--rank-green)'; }
        else if (isNegative) { cssClass = 'diff-negative'; colorStyle = 'color: var(--rank-red)'; }

        return { text, class: cssClass, html: `<span class="time-diff ${cssClass}" style="${colorStyle}">${text}</span>` };
    }

    function getStatusConfig(seconds) {
        if (seconds >= 0) return { borderClass: 'status-good' };
        else if (seconds > -900) return { borderClass: 'status-warn' };
        else return { borderClass: 'status-bad' };
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
                    if(line.isPaused) return; // Texto ya seteado en render

                    const elapsedSecs = Math.floor((now - line.currentStartTime) / 1000) - line.totalPauseSeconds;
                    const validSecs = elapsedSecs > 0 ? elapsedSecs : 0;
                    const hrs = Math.floor(validSecs / 3600);
                    const mins = Math.floor((validSecs % 3600) / 60);
                    const secs = (validSecs % 60);
                    const pad = (n) => n.toString().padStart(2, '0');

                    let timeString = (hrs > 0) ? `${hrs}:${pad(mins)}:${pad(secs)}` : `${pad(mins)}:${pad(secs)}`;
                    timerEl.textContent = timeString;
                    
                    if (validSecs > 7200) timerEl.style.color = 'var(--rank-red)';
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

    // --- REALTIME SUBSCRIPTION ---
    function setupRealtimeSubscription() {
        if (realtimeSubscription) return;
        realtimeSubscription = window.supabase
            .channel('public:production_log_ranking')
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'production_log' },
                (payload) => {
                    console.log('Realtime update:', payload);
                    loadRankingData(); // Recarga y activa la animación FLIP
                }
            )
            .subscribe();
    }

    document.addEventListener('moduleWillUnload', () => {
        if (realtimeSubscription) {
            window.supabase.removeChannel(realtimeSubscription);
            realtimeSubscription = null;
        }
        if (localTimerInterval) clearInterval(localTimerInterval);
    }, { once: true });

    init();
})();
