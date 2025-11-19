window.addEventListener('DOMContentLoaded', async () => {
    const form = document.getElementById('settings-form');
    const btnSave = document.getElementById('settings-save-btn');
    const btnCancel = document.getElementById('settings-cancel-btn');
    const errorBox = document.getElementById('settings-error');

    function setError(msg) {
        if (errorBox) errorBox.textContent = msg || '';
    }

    async function loadSettingsIntoForm() {
        try {
            const s = await window.settingsApi.get();
            document.getElementById('clientOnly').checked = Boolean(s && s.clientOnly);
            document.getElementById('backendBaseUrl').value = (s && s.backendBaseUrl) || 'http://localhost:5090';
            document.getElementById('botToken').value = (s && s.botToken) || '';
            document.getElementById('guildId').value = (s && s.guildId) || '';
            document.getElementById('voiceChannelId').value = (s && s.voiceChannelId) || '';
            document.getElementById('trackedMode').value = (s && s.trackedMember && s.trackedMember.mode) || 'id';
            document.getElementById('trackedValue').value = (s && s.trackedMember && s.trackedMember.value) || '';
            applyVisibility();
        } catch (e) {
            console.error('Error loading settings:', e);
            setError('Unable to load settings.');
        }
    }

    function applyVisibility() {
        const clientOnly = document.getElementById('clientOnly').checked;
        const rowBackend = document.getElementById('row-backend-url');
        rowBackend.style.display = clientOnly ? 'block' : 'none';

        const discordRows = [
            document.getElementById('botToken').closest('.form-row'),
            document.getElementById('guildId').closest('.form-row'),
            document.getElementById('voiceChannelId').closest('.form-row')
        ];
        discordRows.forEach((row) => row && (row.style.display = clientOnly ? 'none' : 'block'));

        // Required attributes toggle
        document.getElementById('botToken').required = !clientOnly;
        document.getElementById('guildId').required = !clientOnly;
        document.getElementById('voiceChannelId').required = !clientOnly;
        document.getElementById('backendBaseUrl').required = clientOnly;
    }

    async function saveSettings() {
        setError('');
        const clientOnly = document.getElementById('clientOnly').checked;
        const backendBaseUrl = document.getElementById('backendBaseUrl').value.trim();
        const payload = {
            clientOnly,
            backendBaseUrl,
            botToken: document.getElementById('botToken').value.trim(),
            guildId: document.getElementById('guildId').value.trim(),
            voiceChannelId: document.getElementById('voiceChannelId').value.trim(),
            trackedMember: {
                mode: document.getElementById('trackedMode').value,
                value: document.getElementById('trackedValue').value.trim()
            }
        };

        if (clientOnly) {
            try {
                const u = new URL(backendBaseUrl);
                if (!['http:', 'https:'].includes(u.protocol)) {
                    setError('Backend URL must start with http or https.');
                    return;
                }
            } catch (_) {
                setError('Invalid Backend URL.');
                return;
            }
        } else {
            if (!payload.botToken || !payload.guildId || !payload.voiceChannelId) {
                setError('Please fill Bot Token, Guild ID, and Voice Channel ID.');
                return;
            }
        }

        try {
            const res = await window.settingsApi.save(payload);
            if (!res || !res.ok) {
                setError((res && res.error) ? res.error : 'Error while saving.');
                return;
            }
            window.close();
        } catch (err) {
            console.error('Error saving settings:', err);
            setError('Unexpected error while saving.');
        }
    }

    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            saveSettings();
        });
    }
    const clientOnlyEl = document.getElementById('clientOnly');
    if (clientOnlyEl) clientOnlyEl.addEventListener('change', applyVisibility);
    if (btnSave) btnSave.addEventListener('click', (e) => { e.preventDefault(); saveSettings(); });
    if (btnCancel) btnCancel.addEventListener('click', () => window.close());

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            window.close();
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            saveSettings();
        }
    });

    await loadSettingsIntoForm();
    // Focus primo campo
    const first = form && form.querySelector('input,select,button');
    if (first) first.focus();
});
