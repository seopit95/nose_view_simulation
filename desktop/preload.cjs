const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('noseview', {
  savePng: dataUrl => ipcRenderer.invoke('noseview:save-png', dataUrl),
});
