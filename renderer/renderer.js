let membersCollapsed = false;
let isMinimized = false;

function render(data) {
    const trackedIcon = document.getElementById('tracked-icon');
    const trackedName = document.getElementById('tracked-name');
    const membersList = document.getElementById('members-list');
    const membersTitle = document.getElementById('members-title');

    if (data.tracked) {
        trackedName.textContent = data.tracked.name;
        trackedIcon.classList.remove('muted', 'unmuted');
        trackedIcon.classList.add(data.tracked.muted ? 'muted' : 'unmuted');
    } else {
        trackedName.textContent = 'Not in channel';
        trackedIcon.classList.remove('muted', 'unmuted');
        trackedIcon.classList.add('muted');
    }

    membersList.innerHTML = '';
    const allMembers = (data.members || []);
    const filteredMembers = allMembers.filter((m) => {
        if (!data.tracked) return true;
        return m.id !== data.tracked.id;
    });

    // Aggiorna il titolo della sezione in base allo stato
    if (data.tracked) {
        if (filteredMembers.length > 0) {
            // Ci sono altre persone oltre al tracked
            membersTitle.textContent = 'Other members';
        } else {
            // Solo il tracked nel canale
            membersTitle.textContent = 'Just you, survivor.';
        }
    } else {
        // Nessun utente tracciato: mostra stato generico del canale
        if (allMembers.length > 0) {
            membersTitle.textContent = 'Channel members';
        } else {
            membersTitle.textContent = 'No members';
        }
    }

    filteredMembers.forEach((m) => {
        const li = document.createElement('li');
        li.className = 'member-item';

        const dot = document.createElement('div');
        dot.className = 'member-dot ' + (m.muted ? 'muted' : 'unmuted');

        const label = document.createElement('span');
        label.textContent = m.name;

        li.appendChild(dot);
        li.appendChild(label);
        membersList.appendChild(li);
    });
}

window.voiceApi.onUpdate((data) => {
    render(data);
});

window.addEventListener('DOMContentLoaded', async () => {
    const data = await window.voiceApi.getCurrent();
    render(data);

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
            toggleBtn.title = 'Mostra lista membri';
        } else {
            membersList.classList.remove('hidden');
            toggleBtn.textContent = '▾';
            toggleBtn.title = 'Nascondi lista membri';
        }
    }

    toggleBtn.addEventListener('click', () => {
        membersCollapsed = !membersCollapsed;
        updateToggleUI();
    });

    updateToggleUI();

    // Settings & Help
    const settingsBtn = document.getElementById('settings-btn');
    const helpBtn = document.getElementById('help-btn');
    settingsBtn.addEventListener('click', () => window.appApi.openSettings());
    helpBtn.addEventListener('click', () => window.appApi.openHelp());

    // Help modal elements
    const helpModal = document.getElementById('help-modal');
    const helpBackdrop = document.getElementById('help-backdrop');
    const helpCloseBtn = document.getElementById('help-close-btn');

    function isHelpOpen() {
        return helpModal && !helpModal.hasAttribute('hidden');
    }

    function openHelp() {
        if (!helpModal || !helpBackdrop) return;
        helpModal.removeAttribute('hidden');
        helpBackdrop.removeAttribute('hidden');
        // porta il focus al pulsante chiudi per accessibilità
        if (helpCloseBtn) helpCloseBtn.focus();
    }

    function closeHelp() {
        if (!helpModal || !helpBackdrop) return;
        helpModal.setAttribute('hidden', '');
        helpBackdrop.setAttribute('hidden', '');
    }

    if (helpCloseBtn) helpCloseBtn.addEventListener('click', closeHelp);
    if (helpBackdrop) helpBackdrop.addEventListener('click', closeHelp);

    // Apri help quando il main invia l'evento
    if (window.appApi && window.appApi.onHelp) {
        window.appApi.onHelp(() => openHelp());
    }

    window.appApi.onMinimized((state) => {
        isMinimized = !!state;
        applyMinimizeUI();
    });

    window.addEventListener('keydown', (e) => {
        const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
        if (tag === 'input' || tag === 'textarea') return;

        if (e.ctrlKey && !e.shiftKey && !e.altKey && (e.key === 'm' || e.key === 'M')) {
            e.preventDefault();
            setMinimized(!isMinimized);
            return;
        }

        if (e.ctrlKey && !e.shiftKey && !e.altKey && (e.key === ',')) {
            e.preventDefault();
            window.appApi.openSettings();
            return;
        }

        if (!e.ctrlKey && !e.shiftKey && !e.altKey && e.key === 'F1') {
            e.preventDefault();
            if (isHelpOpen()) {
                closeHelp();
            } else {
                window.appApi.openHelp();
            }
            return;
        }

        if (e.ctrlKey && !e.shiftKey && !e.altKey && (e.key === 'w' || e.key === 'W')) {
            e.preventDefault();
            window.appApi.close();
            return;
        }

        if (e.ctrlKey && !e.shiftKey && !e.altKey && (e.key === 'l' || e.key === 'L')) {
            e.preventDefault();
            membersCollapsed = !membersCollapsed;
            updateToggleUI();
            return;
        }
    });

    // Chiudi help con ESC
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isHelpOpen()) {
            e.preventDefault();
            closeHelp();
        }
    });
});
