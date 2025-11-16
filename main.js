const { app, BrowserWindow, ipcMain, screen, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { Client, GatewayIntentBits } = require('discord.js');

let mainWindow;
let settingsWindow; // separate settings window
let discordClient;
let voiceStateCache = {
    members: [],   // { id, name, muted }
    tracked: null  // { id, name, muted }
};

// Settings management (persisted in userData/settings.json)
const settingsFile = path.join(app.getPath('userData'), 'settings.json');
let settings = null; // loaded at runtime

function ensureDirExists(filePath) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function getDefaultSettings() {
    return {
        botToken: '',
        guildId: '',
        voiceChannelId: '',
        trackedMember: { mode: 'id', value: '' }
    };
}

function validateSettings(s) {
    if (!s) return { ok: false, error: 'Missing settings' };
    const required = ['botToken', 'guildId', 'voiceChannelId'];
    for (const k of required) {
        if (typeof s[k] !== 'string' || s[k].trim() === '') {
            return { ok: false, error: `Missing or empty field: ${k}` };
        }
    }
    if (!s.trackedMember || !['id', 'name'].includes(s.trackedMember.mode)) {
        return { ok: false, error: 'Invalid trackedMember' };
    }
    if (typeof s.trackedMember.value !== 'string') {
        return { ok: false, error: 'trackedMember.value must be a string' };
    }
    return { ok: true };
}

function loadSettings() {
    try {
        if (fs.existsSync(settingsFile)) {
            const raw = fs.readFileSync(settingsFile, 'utf8');
            const parsed = JSON.parse(raw);
            settings = { ...getDefaultSettings(), ...parsed };
            return settings;
        }
        // First run: try migrate from legacy config.json if present
        const legacyPath = path.join(__dirname, 'config.json');
        if (fs.existsSync(legacyPath)) {
            const legacy = JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
            settings = { ...getDefaultSettings(), ...legacy };
            saveSettings(settings);
            return settings;
        }
    } catch (e) {
        console.error('Error loading settings:', e);
    }
    settings = getDefaultSettings();
    return settings;
}

function saveSettings(newSettings) {
    ensureDirExists(settingsFile);
    fs.writeFileSync(settingsFile, JSON.stringify(newSettings, null, 2), 'utf8');
    settings = { ...getDefaultSettings(), ...newSettings };
}

function createWindow() {
    const display = screen.getPrimaryDisplay();
    const { width: screenWidth } = display.workAreaSize;

    const winWidth = 260;
    const winHeight = 200;
    const margin = 20;

    mainWindow = new BrowserWindow({
        width: winWidth,
        height: winHeight,
        x: screenWidth - winWidth - margin, // top-right
        y: margin,
        alwaysOnTop: true,
        frame: false,
        transparent: true,
        resizable: false,
        skipTaskbar: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
    setupIpc();
}

function createSettingsWindow() {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
        if (settingsWindow.isMinimized()) settingsWindow.restore();
        settingsWindow.focus();
        return settingsWindow;
    }

    settingsWindow = new BrowserWindow({
        width: 420,
        height: 500,
        title: 'Settings',
        resizable: false,
        minimizable: false,
        maximizable: false,
        modal: false,
        show: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    settingsWindow.loadFile(path.join(__dirname, 'renderer', 'settings.html'));

    if (app.isPackaged) {
        settingsWindow.removeMenu();
    }

    settingsWindow.on('closed', () => {
        settingsWindow = null;
    });
    return settingsWindow;
}

function sendVoiceUpdate() {
    if (!mainWindow) return;
    mainWindow.webContents.send('voice:update', voiceStateCache);
}

async function initDiscord() {
    if (!settings) loadSettings();
    const valid = validateSettings(settings);
    if (!valid.ok) {
        // defer initialization until settings are valid
        console.log('Invalid settings. Waiting for user configuration.');
        return;
    }
    discordClient = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildVoiceStates,
            GatewayIntentBits.GuildMembers
        ]
    });

    discordClient.once('ready', async () => {
        console.log(`Logged in as ${discordClient.user.tag}`);

        const guild = await discordClient.guilds.fetch(settings.guildId);
        const channel = await guild.channels.fetch(settings.voiceChannelId);

        if (channel && channel.isVoiceBased()) {
            voiceStateCache.members = channel.members.map((m) => ({
                id: m.id,
                name: m.displayName,
                muted: m.voice.selfMute || m.voice.serverMute
            }));
            updateTrackedFromMembers();
            sendVoiceUpdate();
        }
    });

    discordClient.on('voiceStateUpdate', (oldState, newState) => {
        const channelId = settings.voiceChannelId;
        const oldInChannel = oldState.channelId === channelId;
        const newInChannel = newState.channelId === channelId;

        if (oldInChannel && !newInChannel) {
            voiceStateCache.members = voiceStateCache.members.filter(
                (m) => m.id !== newState.id
            );
        }

        if (!oldInChannel && newInChannel) {
            const gm = newState.member;
            voiceStateCache.members.push({
                id: gm.id,
                name: gm.displayName,
                muted: gm.voice.selfMute || gm.voice.serverMute
            });
        }

        if (oldInChannel && newInChannel) {
            voiceStateCache.members = voiceStateCache.members.map((m) => {
                if (m.id === newState.id) {
                    return {
                        ...m,
                        muted: newState.selfMute || newState.serverMute
                    };
                }
                return m;
            });
        }

        updateTrackedFromMembers();
        sendVoiceUpdate();
    });

    await discordClient.login(settings.botToken);
}

function updateTrackedFromMembers() {
    let tracked = null;

    if (settings.trackedMember.mode === 'id') {
        tracked = voiceStateCache.members.find(
            (m) => m.id === settings.trackedMember.value
        );
    } else if (settings.trackedMember.mode === 'name') {
        tracked = voiceStateCache.members.find(
            (m) => m.name === settings.trackedMember.value
        );
    }

    voiceStateCache.tracked = tracked || null;
}

ipcMain.handle('voice:getCurrent', () => {
    return voiceStateCache;
});

ipcMain.on('app:close', () => {
    app.quit();
});

app.whenReady().then(async () => {
    loadSettings();
    createWindow();

    // On first run or invalid settings, open dedicated Settings window
    const valid = validateSettings(settings);
    if (!valid.ok) {
        createSettingsWindow();
    } else {
        await initDiscord();
    }

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

let isMinimized = false;
let normalBounds = { width: 260, height: 200 };

function setWindowMinimized(state) {
    if (!mainWindow) return;
    const display = screen.getPrimaryDisplay();
    const { width: screenWidth } = display.workAreaSize;
    const margin = 20;

    if (state) {
        // salva dimensioni normali
        const b = mainWindow.getBounds();
        normalBounds = { width: b.width, height: b.height };
        const miniW = 32;
        const miniH = 32;
        mainWindow.setBounds({
            width: miniW,
            height: miniH,
            x: screenWidth - miniW - margin,
            y: margin
        }, false);
    } else {
        const w = normalBounds.width || 260;
        const h = normalBounds.height || 200;
        mainWindow.setBounds({
            width: w,
            height: h,
            x: screenWidth - w - margin,
            y: margin
        }, false);
    }
    isMinimized = state;
    // informa il renderer
    mainWindow.webContents.send('app:minimized', isMinimized);
}

function setupIpc() {
    ipcMain.on('app:setMinimized', (_evt, state) => {
        setWindowMinimized(!!state);
    });

    ipcMain.on('app:openSettings', async () => {
        // Open or focus the dedicated settings window
        createSettingsWindow();
    });

    ipcMain.on('app:openHelp', async () => {
        // Invia un evento al renderer per aprire il pannello Help
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('app:help');
        }
    });

    // Settings IPC
    ipcMain.handle('settings:get', () => {
        if (!settings) loadSettings();
        return settings;
    });
    ipcMain.handle('settings:save', async (_evt, newSettings) => {
        const merged = { ...getDefaultSettings(), ...newSettings };
        const valid = validateSettings(merged);
        if (!valid.ok) {
            return { ok: false, error: valid.error };
        }
        saveSettings(merged);

        // Re-init Discord client if needed
        try {
            if (discordClient) {
                await discordClient.destroy();
                discordClient = null;
            }
        } catch (e) {
            console.warn('Error closing Discord client:', e);
        }
        await initDiscord();

        // Close settings window on successful save (optional UX)
        try {
            if (settingsWindow && !settingsWindow.isDestroyed()) {
                settingsWindow.close();
            }
        } catch (_) { /* noop */ }
        return { ok: true };
    });
}
