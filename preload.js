const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('voiceApi', {
    onUpdate(callback) {
        // callback receives { members: [...], tracked: {...} }
        ipcRenderer.on('voice:update', (_event, data) => {
            callback(data);
        });
    },
    async getCurrent() {
        return await ipcRenderer.invoke('voice:getCurrent');
    }
});
