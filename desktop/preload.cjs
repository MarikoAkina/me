const {contextBridge, ipcRenderer} = require('electron');
contextBridge.exposeInMainWorld('sqlLabUpdates', {
  getState: () => ipcRenderer.invoke('updates:state'),
  check: () => ipcRenderer.invoke('updates:check'),
  install: () => ipcRenderer.invoke('updates:install'),
  subscribe(callback) {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('updates:state', listener);
    return () => ipcRenderer.removeListener('updates:state', listener);
  },
  onCheckRequested(callback) {
    const listener = () => callback();
    ipcRenderer.on('updates:request-check', listener);
    return () => ipcRenderer.removeListener('updates:request-check', listener);
  },
});
