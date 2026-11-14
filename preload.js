const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('toki', {
  onCommand: (fn) => ipcRenderer.on('cmd', (_e, cmd, arg) => fn(cmd, arg)),
});
