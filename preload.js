// Preload script: safe, isolated bridge
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('jmf', {
    download: (albumId) => ipcRenderer.send('download', albumId),
    onLog: (cb) => ipcRenderer.on('download-log', (_, msg) => cb(msg)),
    onDone: (cb) => ipcRenderer.on('download-done', (_, code) => cb(code)),
    onError: (cb) => ipcRenderer.on('download-error', (_, err) => cb(err)),
    installDeps: () => ipcRenderer.invoke('install-deps'),
    openOutDir: () => ipcRenderer.invoke('open-outdir'),
    win: {
        minimize: () => ipcRenderer.send('win:minimize'),
        toggleMaximize: () => ipcRenderer.send('win:toggle-maximize'),
        close: () => ipcRenderer.send('win:close'),
    }
})
