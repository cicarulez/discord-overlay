const { app, BrowserWindow, ipcMain, screen, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { Client, GatewayIntentBits } = require('discord.js');

let mainWindow;
let discordClient;
let voiceStateCache = {
    members: [],   // { id, name, muted }
    tracked: null  // { id, name, muted }
};

const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));

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

function sendVoiceUpdate() {
    if (!mainWindow) return;
    mainWindow.webContents.send('voice:update', voiceStateCache);
}

async function initDiscord() {
    discordClient = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildVoiceStates,
            GatewayIntentBits.GuildMembers
        ]
    });

    discordClient.once('ready', async () => {
        console.log(`Logged in as ${discordClient.user.tag}`);

        const guild = await discordClient.guilds.fetch(config.guildId);
        const channel = await guild.channels.fetch(config.voiceChannelId);

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
        const channelId = config.voiceChannelId;
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

    await discordClient.login(config.botToken);
}

function updateTrackedFromMembers() {
    let tracked = null;

    if (config.trackedMember.mode === 'id') {
        tracked = voiceStateCache.members.find(
            (m) => m.id === config.trackedMember.value
        );
    } else if (config.trackedMember.mode === 'name') {
        tracked = voiceStateCache.members.find(
            (m) => m.name === config.trackedMember.value
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
    createWindow();
    await initDiscord();

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
        await dialog.showMessageBox(mainWindow, {
            type: 'info',
            message: 'Settings',
            detail: 'Settings section not yet implemented.',
            buttons: ['OK']
        });
    });

    ipcMain.on('app:openHelp', async () => {
        // Invia un evento al renderer per aprire il pannello Help
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('app:help');
        }
    });
}
