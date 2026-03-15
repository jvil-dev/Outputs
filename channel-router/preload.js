const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  probeFile: (filePath) => ipcRenderer.invoke('probe-file', filePath),
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  extractAudioStream: (filePath, streamIndex) => ipcRenderer.invoke('extract-audio-stream', filePath, streamIndex),
});
