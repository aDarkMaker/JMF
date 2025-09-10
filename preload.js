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
    openPDFInNewWindow: () => ipcRenderer.invoke('open-pdf-in-new-window'),
    readPDFFile: (filePath) => ipcRenderer.invoke('read-pdf-file', filePath),

    // 设置功能
    getSettings: () => ipcRenderer.invoke('get-settings'),
    saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
    selectDirectory: () => ipcRenderer.invoke('select-directory'),
    getAppInfo: () => ipcRenderer.invoke('get-app-info'),

    // 窗口控制
    win: {
        minimize: () => ipcRenderer.send('win:minimize'),
        toggleMaximize: () => ipcRenderer.send('win:toggle-maximize'),
        close: () => ipcRenderer.send('win:close'),
    },

    // PDF窗口控制
    pdfWin: {
        minimize: () => ipcRenderer.send('pdf-win:minimize'),
        toggleMaximize: () => ipcRenderer.send('pdf-win:toggle-maximize'),
        close: () => ipcRenderer.send('pdf-win:close'),
    },

    // 窗口大小调整
    requestResize: () => ipcRenderer.invoke('request-window-resize'),

    // 字体设置
    notifyPDFWindowFontChange: (useCustomFont) => ipcRenderer.invoke('notify-pdf-font-change', useCustomFont),
    onFontChange: (callback) => ipcRenderer.on('font-change', (_, useCustomFont) => callback(useCustomFont))
})
