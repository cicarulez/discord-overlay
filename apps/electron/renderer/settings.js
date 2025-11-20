window.addEventListener('DOMContentLoaded', async () => {
    const form = document.getElementById('settings-form');
    const btnSave = document.getElementById('settings-save-btn');
    const btnCancel = document.getElementById('settings-cancel-btn');
    const errorBox = document.getElementById('settings-error');

    // Inline auth elements
    const authSection = document.getElementById('client-auth');
    const authMissing = document.getElementById('auth-when-missing');
    const authPresent = document.getElementById('auth-when-present');
    const loginUser = document.getElementById('loginUser');
    const loginPass = document.getElementById('loginPass');
    const loginBtn = document.getElementById('loginBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const loginErr = document.getElementById('loginError');
    const loginBaseHint = document.getElementById('loginBaseUrlHint');

    let currentSettings = null;
    let loginInFlight = false;

    function setError(msg) {
        if (errorBox) errorBox.textContent = msg || '';
    }

    function setLoginError(msg) {
        if (loginErr) loginErr.textContent = msg || '';
    }

    function urlDisplayBase(backendBaseUrl) {
        try {
            const u = new URL(backendBaseUrl);
            const path = (u.pathname && u.pathname !== '/') ? u.pathname.replace(/\/$/, '') : '';
            return `${u.protocol}//${u.host}${path}`;
        } catch {
            return backendBaseUrl;
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

        // Inline auth visibility
        if (authSection) authSection.style.display = clientOnly ? 'block' : 'none';
        const hasToken = !!(currentSettings && currentSettings.authToken);
        if (authMissing) authMissing.style.display = (clientOnly && !hasToken) ? 'block' : 'none';
        if (authPresent) authPresent.style.display = (clientOnly && hasToken) ? 'block' : 'none';

        // Update base URL hint for login
        const baseUrl = document.getElementById('backendBaseUrl').value.trim();
        if (loginBaseHint) loginBaseHint.textContent = urlDisplayBase(baseUrl);
    }

    async function loadSettingsIntoForm() {
        try {
            const s = await window.settingsApi.get();
            currentSettings = s || {};
            document.getElementById('clientOnly').checked = Boolean(s && s.clientOnly);
            document.getElementById('backendBaseUrl').value = (s && s.backendBaseUrl) || 'http://localhost:5090/api';
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
            },
            // preserve authToken if present (login inline handles updating it)
            authToken: currentSettings && currentSettings.authToken || ''
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

    async function doInlineLogin() {
        if (loginInFlight) return;
        setLoginError('');
        const base = document.getElementById('backendBaseUrl').value.trim();
        const user = (loginUser && loginUser.value || '').trim();
        const pass = (loginPass && loginPass.value) || '';
        if (!user || !pass) {
            setLoginError('Enter username and password');
            return;
        }
        try {
            loginInFlight = true;
            if (loginBtn) loginBtn.disabled = true;
            // Basic Auth
            const basic = btoa(`${user}:${pass}`);
            // Use './login' to preserve '/api' prefix from base URL
            const resp = await fetch(new URL('./login', base).toString(), {
                method: 'POST',
                headers: { 'Authorization': `Basic ${basic}` }
            });
            const json = await resp.json();
            if (json && json.ok && json.token) {
                const newSettings = { ...(currentSettings || {}), clientOnly: true, backendBaseUrl: base, authToken: json.token };
                const res = await window.settingsApi.save(newSettings);
                if (!res || !res.ok) {
                    setLoginError(res && res.error ? res.error : 'Failed to save token');
                    return;
                }
                currentSettings = newSettings;
                // Clear password field after success
                if (loginPass) loginPass.value = '';
                applyVisibility();
            } else {
                setLoginError('Invalid credentials');
            }
        } catch (e) {
            setLoginError('Login failed');
        } finally {
            loginInFlight = false;
            if (loginBtn) loginBtn.disabled = false;
        }
    }

    async function doLogout() {
        setLoginError('');
        const base = document.getElementById('backendBaseUrl').value.trim();
        const newSettings = { ...(currentSettings || {}), backendBaseUrl: base, authToken: '' };
        try {
            const res = await window.settingsApi.save(newSettings);
            if (!res || !res.ok) {
                setLoginError(res && res.error ? res.error : 'Failed to clear token');
                return;
            }
            currentSettings = newSettings;
            applyVisibility();
        } catch (e) {
            setLoginError('Error while clearing token');
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
    const backendUrlEl = document.getElementById('backendBaseUrl');
    if (backendUrlEl) backendUrlEl.addEventListener('input', applyVisibility);
    if (loginBtn) loginBtn.addEventListener('click', (e) => { e.preventDefault(); doInlineLogin(); });
    if (logoutBtn) logoutBtn.addEventListener('click', (e) => { e.preventDefault(); doLogout(); });
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
