// Preload script: safe, isolated bridge
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('jmf', {
    // 下载功能
    download: (albumId) => ipcRenderer.send('download', albumId),
    onLog: (cb) => ipcRenderer.on('download-log', (_, msg) => cb(msg)),
    onDone: (cb) => ipcRenderer.on('download-done', (_, code) => cb(code)),
    onError: (cb) => ipcRenderer.on('download-error', (_, err) => cb(err)),

    // 工具功能
    installDeps: () => ipcRenderer.invoke('install-deps'),
    openOutDir: () => ipcRenderer.invoke('open-outdir'),

    // PDF预览功能
    getPDFList: () => ipcRenderer.invoke('get-pdf-list'),
    getPDFInfo: (filePath) => ipcRenderer.invoke('get-pdf-info', filePath),
    openPDFExternal: (filePath) => ipcRenderer.invoke('open-pdf-external', filePath),
    openPDFInNewWindow: (filePath) => ipcRenderer.invoke('open-pdf-new-window', filePath),

    // 设置功能
    getSettings: () => ipcRenderer.invoke('get-settings'),
    saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
    selectDirectory: () => ipcRenderer.invoke('select-directory'),

    // 窗口控制
    win: {
        minimize: () => ipcRenderer.send('win:minimize'),
        toggleMaximize: () => ipcRenderer.send('win:toggle-maximize'),
        close: () => ipcRenderer.send('win:close'),
    },

    // 窗口大小调整
    requestResize: () => ipcRenderer.invoke('request-window-resize')
})
