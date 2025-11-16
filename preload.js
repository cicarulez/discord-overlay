const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('voiceApi', {
    onUpdate(callback) {
        ipcRenderer.on('voice:update', (_event, data) => {
            callback(data);
        });
    },
    async getCurrent() {
        return await ipcRenderer.invoke('voice:getCurrent');
    }
});

contextBridge.exposeInMainWorld('appApi', {
    close() {
        ipcRenderer.send('app:close');
    },
    setMinimized(state) {
        ipcRenderer.send('app:setMinimized', state);
    },
    onMinimized(callback) {
        ipcRenderer.on('app:minimized', (_event, state) => callback(state));
    },
    openSettings() {
        ipcRenderer.send('app:openSettings');
    },
    openHelp() {
        ipcRenderer.send('app:openHelp');
    },
    onHelp(callback) {
        ipcRenderer.on('app:help', () => callback());
    },
    onSettings(callback) {
        ipcRenderer.on('app:settings', () => callback());
    }
});

contextBridge.exposeInMainWorld('settingsApi', {
    async get() {
        return await ipcRenderer.invoke('settings:get');
    },
    async save(payload) {
        return await ipcRenderer.invoke('settings:save', payload);
    }
});
