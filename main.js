const { app, BrowserWindow, ipcMain } = require('electron');
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
    mainWindow = new BrowserWindow({
        width: 260,
        height: 200,
        alwaysOnTop: true,
        frame: false,
        transparent: true,
        resizable: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

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
    // Find tracked member based on config
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
