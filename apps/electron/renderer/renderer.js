let membersCollapsed = false;
let isMinimized = false;

// Stato sorgente dati client-only
let clientOnlyActive = false;
let clientSettings = null; // ultima copia di settings
let ws = null;
let wsReconnectTimer = null;
// Finestra temporale per sopprimere click sulla lista subito dopo un reset
let suppressMemberClickUntil = 0;

function render(data) {
    const trackedIcon = document.getElementById('tracked-icon');
    const trackedName = document.getElementById('tracked-name');
    const resetTrackedBtn = document.getElementById('reset-tracked-btn');
    const membersList = document.getElementById('members-list');
    const membersTitle = document.getElementById('members-title');

    if (data.tracked) {
        trackedName.textContent = data.tracked.name;
        trackedIcon.classList.remove('muted', 'unmuted');
        trackedIcon.classList.add(data.tracked.muted ? 'muted' : 'unmuted');
        if (resetTrackedBtn) resetTrackedBtn.hidden = false;
    } else {
        trackedName.textContent = 'Not in channel';
        trackedIcon.classList.remove('muted', 'unmuted');
        trackedIcon.classList.add('muted');
        if (resetTrackedBtn) resetTrackedBtn.hidden = true;
    }

    membersList.innerHTML = '';
    const allMembers = (data.members || []);
    const filteredMembers = allMembers.filter((m) => {
        if (!data.tracked) return true;
        return m.id !== data.tracked.id;
    });

    // Update section title based on state
    if (data.tracked) {
        if (filteredMembers.length > 0) {
            // There are other people besides the tracked user
            membersTitle.textContent = 'Other members';
        } else {
            // Only the tracked user in the channel
            membersTitle.textContent = 'Just you, survivor.';
        }
    } else {
        // No tracked user: show generic channel state
        if (allMembers.length > 0) {
            membersTitle.textContent = 'Channel members';
        } else {
            membersTitle.textContent = 'No members';
        }
    }

    filteredMembers.forEach((m) => {
        const li = document.createElement('li');
        li.className = 'member-item';
        li.title = 'Set as tracked';

        const dot = document.createElement('div');
        dot.className = 'member-dot ' + (m.muted ? 'muted' : 'unmuted');

        const label = document.createElement('span');
        label.textContent = m.name;

        li.appendChild(dot);
        li.appendChild(label);
        // "Track" link-style button
        const trackBtn = document.createElement('button');
        trackBtn.className = 'as-link';
        trackBtn.textContent = 'Track';
        trackBtn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            if (Date.now() < suppressMemberClickUntil) return; // avoid involuntary reselection
            window.settingsApi.setTracked({ mode: 'id', value: m.id });
        });
        li.appendChild(trackBtn);

        // Click on entire item to set tracked
        li.addEventListener('click', () => {
            if (Date.now() < suppressMemberClickUntil) return; // avoid involuntary reselection
            window.settingsApi.setTracked({ mode: 'id', value: m.id });
        });
        membersList.appendChild(li);
    });
}

// ---------------- Client-only datasource -----------------
function selectTracked(members, trackedMember) {
    if (!trackedMember) return null;
    if (trackedMember.mode === 'id') {
        return members.find((m) => m.id === trackedMember.value) || null;
    }
    if (trackedMember.mode === 'name') {
        return members.find((m) => m.name === trackedMember.value) || null;
    }
    return null;
}

function normalizeStateFromBackend(payload, trackedMember) {
    const members = (payload?.members || []).map((m) => ({
        id: m.id,
        name: m.name,
        muted: Boolean(m.mute || m.deaf)
    }));
    const tracked = selectTracked(members, trackedMember);
    return { members, tracked };
}

async function httpGetSnapshot(baseUrl, trackedMember) {
    try {
        const res = await fetch(new URL('/snapshot', baseUrl).toString(), { cache: 'no-store' });
        const json = await res.json();
        if (json && json.ok && json.data) {
            return normalizeStateFromBackend(json.data, trackedMember);
        }
    } catch (_) { /* ignore */ }
    return { members: [], tracked: null };
}

function startClientOnly(baseUrl, settings) {
    // Chiudi eventuale ws precedente
    if (ws) {
        try { ws.close(); } catch (_) { /* noop */ }
        ws = null;
    }
    if (wsReconnectTimer) {
        clearTimeout(wsReconnectTimer);
        wsReconnectTimer = null;
    }

    clientOnlyActive = true;
    clientSettings = settings;

    // Primo snapshot via HTTP (best-effort)
    httpGetSnapshot(baseUrl, settings.trackedMember).then((state) => render(state));

    // Costruisci URL WS
    let wsUrl;
    try {
        const u = new URL(baseUrl);
        const proto = u.protocol === 'https:' ? 'wss:' : 'ws:';
        wsUrl = `${proto}//${u.host}/ws`;
    } catch (_) {
        return; // URL non valido
    }

    function scheduleReconnect() {
        if (!clientOnlyActive) return;
        if (wsReconnectTimer) return;
        wsReconnectTimer = setTimeout(() => {
            wsReconnectTimer = null;
            startClientOnly(baseUrl, settings);
        }, 2000);
    }

    ws = new WebSocket(wsUrl);
    ws.addEventListener('open', () => {
        // opzionale: ping
        try { ws.send(JSON.stringify({ type: 'ping' })); } catch (_) { /* noop */ }
    });
    ws.addEventListener('message', (ev) => {
        try {
            const msg = JSON.parse(ev.data);
            if (msg.type === 'snapshot') {
                render(normalizeStateFromBackend(msg.payload, settings.trackedMember));
            } else if (msg.type === 'voice_state_update') {
                render(normalizeStateFromBackend(msg.payload, settings.trackedMember));
            }
        } catch (_) { /* ignore */ }
    });
    ws.addEventListener('close', scheduleReconnect);
    ws.addEventListener('error', scheduleReconnect);
}

function stopClientOnly() {
    clientOnlyActive = false;
    if (ws) {
        try { ws.close(); } catch (_) { /* noop */ }
        ws = null;
    }
    if (wsReconnectTimer) {
        clearTimeout(wsReconnectTimer);
        wsReconnectTimer = null;
    }
}

// ---------------- Init -----------------
window.addEventListener('DOMContentLoaded', async () => {
    // Carica settings per capire quale sorgente usare
    const s = await window.settingsApi.get();
    clientSettings = s;

    if (s && s.clientOnly) {
        startClientOnly(s.backendBaseUrl, s);
    } else {
        // Modalità Discord locale: usa IPC voiceApi
        const data = await window.voiceApi.getCurrent();
        render(data);
        window.voiceApi.onUpdate((data) => render(data));
    }

    const closeBtn = document.getElementById('close-btn');
    closeBtn.addEventListener('click', () => {
        window.appApi.close();
    });

    const minimizeBtn = document.getElementById('minimize-btn');
    const restoreBtn = document.getElementById('restore-btn');
    const overlay = document.getElementById('overlay');

    function applyMinimizeUI() {
        if (isMinimized) {
            overlay.classList.add('minimized');
        } else {
            overlay.classList.remove('minimized');
        }
    }

    function setMinimized(state) {
        isMinimized = !!state;
        window.appApi.setMinimized(isMinimized);
        applyMinimizeUI();
    }

    minimizeBtn.addEventListener('click', () => {
        setMinimized(!isMinimized);
    });

    // In modalità minimizzata, mostra il tasto ripristina e consenti il ripristino con un click
    restoreBtn.addEventListener('click', () => {
        setMinimized(false);
    });

    const toggleBtn = document.getElementById('toggle-members-btn');
    const membersList = document.getElementById('members-list');

    function updateToggleUI() {
        if (membersCollapsed) {
            membersList.classList.add('hidden');
            toggleBtn.textContent = '▸';
            toggleBtn.title = 'Show members list';
        } else {
            membersList.classList.remove('hidden');
            toggleBtn.textContent = '▾';
            toggleBtn.title = 'Show members list';
        }
    }

    toggleBtn.addEventListener('click', () => {
        membersCollapsed = !membersCollapsed;
        updateToggleUI();
    });
    updateToggleUI();

    // Shortcuts + settings/help
    const helpBtn = document.getElementById('help-btn');
    const helpModal = document.getElementById('help-modal');
    const helpBackdrop = document.getElementById('help-backdrop');
    const helpCloseBtn = document.getElementById('help-close-btn');

    function openHelp() {
        helpModal.hidden = false;
        helpBackdrop.hidden = false;
    }
    function closeHelp() {
        helpModal.hidden = true;
        helpBackdrop.hidden = true;
    }
    helpBtn.addEventListener('click', openHelp);
    helpCloseBtn.addEventListener('click', closeHelp);
    helpBackdrop.addEventListener('click', closeHelp);
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeHelp();
        }
        if ((e.ctrlKey || e.metaKey) && (e.key === 'm' || e.key === 'M')) {
            setMinimized(!isMinimized);
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
            window.appApi.close();
        }
        if ((e.ctrlKey || e.metaKey) && e.key === ',') {
            window.appApi.openSettings();
        }
        if ((e.ctrlKey || e.metaKey) && (e.key === 'l' || e.key === 'L')) {
            membersCollapsed = !membersCollapsed;
            updateToggleUI();
        }
        if (e.key === 'F1') {
            openHelp();
        }
    });

    const settingsBtn = document.getElementById('settings-btn');
    settingsBtn.addEventListener('click', () => window.appApi.openSettings());

    // Reset tracked handler
    const resetTrackedBtn = document.getElementById('reset-tracked-btn');
    if (resetTrackedBtn) {
        // Imposta la soppressione già su pointerdown, così il mouseup/click non cadrà su un membro apparso sotto il puntatore
        const armSuppression = (e) => {
            // Allunga la finestra per coprire eventuali ritardi di re-render
            suppressMemberClickUntil = Date.now() + 800;

            // Disabilita temporaneamente gli eventi di puntatore sulla lista membri
            const membersList = document.getElementById('members-list');
            if (membersList) {
                membersList.style.pointerEvents = 'none';
                setTimeout(() => {
                    // ripristina
                    if (membersList) membersList.style.pointerEvents = '';
                }, 900);
            }

            // Swallow del prossimo click/pointerup a livello di documento in cattura
            const swallowClick = (evt) => {
                evt.stopPropagation();
                evt.preventDefault();
                document.removeEventListener('click', swallowClick, true);
            };
            document.addEventListener('click', swallowClick, true);

            const swallowPU = (evt) => {
                evt.stopPropagation();
                evt.preventDefault();
                document.removeEventListener('pointerup', swallowPU, true);
            };
            document.addEventListener('pointerup', swallowPU, true);

            e.stopPropagation();
            e.preventDefault();
        };
        resetTrackedBtn.addEventListener('pointerdown', armSuppression);
        resetTrackedBtn.addEventListener('mousedown', armSuppression);
        resetTrackedBtn.addEventListener('click', (e) => {
            armSuppression(e);
            window.settingsApi.clearTracked();
        });
    }

    // Ascolta cambi impostazioni per switchare modalità a caldo
    window.appApi.onSettingsUpdated((newSettings) => {
        clientSettings = newSettings;
        if (newSettings.clientOnly) {
            stopClientOnly();
            startClientOnly(newSettings.backendBaseUrl, newSettings);
        } else {
            stopClientOnly();
            // Torna a IPC: chiedi snapshot e attendi update
            window.voiceApi.getCurrent().then((data) => render(data));
            // Nota: onUpdate era già registrato nella prima init se eravamo in modalità Discord.
            // Per sicurezza aggiungiamo un listener se non attivo:
            window.voiceApi.onUpdate((data) => render(data));
        }
    });
});
