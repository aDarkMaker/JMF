// Electron main process: create window, wire IPC, and run Python script
const { app, BrowserWindow, ipcMain, shell } = require('electron')
const path = require('path')
const { spawn, spawnSync } = require('child_process')
const fs = require('fs')

let mainWindow

const appDir = __dirname
const coreDir = path.join(appDir, 'core')
const outputDir = path.join(appDir, 'PDF')
const downloaderScript = path.join(coreDir, 'downloader.py')
const depsScript = path.join(coreDir, 'deps.py')

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 720,
        minWidth: 900,
        minHeight: 600,
        title: 'JMcomic Fetcher',
        frame: false,
        backgroundColor: '#0a0b0f',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
        },
        icon: path.join(__dirname, 'assets', 'icon', 'icon.png'),
        show: false, // 先隐藏，加载完成后显示
    })

    mainWindow.loadFile(path.join(__dirname, 'index.html'))

    // 窗口加载完成后显示
    mainWindow.once('ready-to-show', () => {
        mainWindow.show()

        // 可选：开发时打开开发者工具
        // mainWindow.webContents.openDevTools()
    })

    // 移除默认菜单
    mainWindow.setMenuBarVisibility(false)

    // 确保输出目录存在
    ensureOutputDirectory()
}

function ensureOutputDirectory() {
    try {
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true })
            console.log(`创建输出目录: ${outputDir}`)
        }
    } catch (error) {
        console.error(`创建输出目录失败: ${error}`)
    }
}

function resolvePython() {
    // Try Windows launcher first, then common names
    const candidates = [
        { cmd: 'py', args: ['-3'] },
        { cmd: 'py', args: [] },
        { cmd: 'python', args: [] },
        { cmd: 'python3', args: [] },
    ]

    for (const c of candidates) {
        try {
            const r = spawnSync(c.cmd, [...c.args, '--version'], {
                encoding: 'utf8',
                timeout: 5000,
                windowsHide: true
            })
            if (r.status === 0 && r.stdout && r.stdout.includes('Python')) {
                console.log(`找到Python解释器: ${c.cmd} ${c.args.join(' ')} - ${r.stdout.trim()}`)
                return c
            }
        } catch (error) {
            // ignore and try next
        }
    }

    console.error('未找到可用的Python解释器')
    return null
}

function streamChild(child, event) {
    if (child.stdout) {
        child.stdout.setEncoding('utf8')
        child.stdout.on('data', (data) => {
            const msg = data.toString('utf8')
            event.sender.send('download-log', msg)
        })
    }

    if (child.stderr) {
        child.stderr.setEncoding('utf8')
        child.stderr.on('data', (data) => {
            const msg = data.toString('utf8')
            event.sender.send('download-log', msg)
        })
    }
}

app.whenReady().then(() => {
    createWindow()

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow()
        }
    })
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

// 防止多实例运行
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
    app.quit()
} else {
    app.on('second-instance', () => {
        // 当运行第二个实例时，将焦点转移到主窗口
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore()
            mainWindow.focus()
        }
    })
}

// Window controls
ipcMain.on('win:minimize', () => {
    mainWindow?.minimize()
})

ipcMain.on('win:toggle-maximize', () => {
    if (!mainWindow) return
    if (mainWindow.isMaximized()) {
        mainWindow.unmaximize()
    } else {
        mainWindow.maximize()
    }
})

ipcMain.on('win:close', () => {
    mainWindow?.close()
})

// Start download: spawn Python downloader.py <albumId>
ipcMain.on('download', async (event, albumId) => {
    const py = resolvePython()
    if (!py) {
        event.sender.send('download-error', '未找到可用的 Python 解释器。\n请安装 Python 3.7+ 并确保其在系统 PATH 中。')
        return
    }

    // 验证下载脚本存在
    if (!fs.existsSync(downloaderScript)) {
        event.sender.send('download-error', `下载脚本不存在: ${downloaderScript}`)
        return
    }

    try {
        const child = spawn(py.cmd, [...py.args, downloaderScript, String(albumId)], {
            cwd: coreDir, // 在core目录中运行
            env: {
                ...process.env,
                PYTHONPATH: coreDir, // 添加core目录到Python路径
                PYTHONIOENCODING: 'utf-8', // 确保输出编码
                PYTHONUTF8: '1', // 强制使用UTF-8
                LC_ALL: 'zh_CN.UTF-8', // 设置地区
                LANG: 'zh_CN.UTF-8'
            },
            windowsHide: true,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'] // 明确设置stdio
        })

        streamChild(child, event)

        child.on('close', (code) => {
            event.sender.send('download-done', code ?? -1)
        })

        child.on('error', (err) => {
            event.sender.send('download-error', `Python进程错误: ${String(err)}`)
        })

    } catch (err) {
        event.sender.send('download-error', `启动下载进程失败: ${String(err)}`)
    }
})

// Install Python dependencies
ipcMain.handle('install-deps', async () => {
    const py = resolvePython()
    if (!py) {
        return {
            ok: false,
            message: '未找到 Python 解释器，无法安装依赖。\n请先安装 Python 3.7+ 并确保其在系统 PATH 中。'
        }
    }

    return new Promise((resolve) => {
        // 先尝试使用deps.py脚本
        if (fs.existsSync(depsScript)) {
            const child = spawn(py.cmd, [...py.args, depsScript], {
                cwd: coreDir,
                env: {
                    ...process.env,
                    PYTHONPATH: coreDir,
                    PYTHONIOENCODING: 'utf-8',
                    PYTHONUTF8: '1',
                    LC_ALL: 'zh_CN.UTF-8',
                    LANG: 'zh_CN.UTF-8'
                },
                windowsHide: true,
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'pipe']
            })

            let output = ''

            if (child.stdout) {
                child.stdout.on('data', (data) => {
                    output += data.toString()
                })
            }

            if (child.stderr) {
                child.stderr.on('data', (data) => {
                    output += data.toString()
                })
            }

            child.on('close', (code) => {
                if (code === 0) {
                    resolve({ ok: true, message: '依赖安装完成', output })
                } else {
                    resolve({ ok: false, message: `依赖安装失败 (退出码: ${code})`, output })
                }
            })

            child.on('error', (err) => {
                resolve({ ok: false, message: `依赖安装进程错误: ${String(err)}` })
            })
        } else {
            // 回退到直接pip安装
            const requirementsFile = path.join(coreDir, 'requirements.txt')
            if (!fs.existsSync(requirementsFile)) {
                resolve({ ok: false, message: '依赖文件不存在' })
                return
            }

            const child = spawn(py.cmd, [...py.args, '-m', 'pip', 'install', '-r', requirementsFile, '--upgrade'], {
                cwd: coreDir,
                env: {
                    ...process.env,
                    PYTHONIOENCODING: 'utf-8',
                    PYTHONUTF8: '1',
                    LC_ALL: 'zh_CN.UTF-8',
                    LANG: 'zh_CN.UTF-8'
                },
                windowsHide: true,
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'pipe']
            })

            child.on('close', (code) => {
                resolve({ ok: code === 0, code })
            })

            child.on('error', (err) => {
                resolve({ ok: false, message: String(err) })
            })
        }
    })
})

// Open output directory
ipcMain.handle('open-outdir', async () => {
    try {
        // 确保目录存在
        ensureOutputDirectory()

        const result = await shell.openPath(outputDir)
        return {
            ok: !result, // shell.openPath returns empty string on success
            message: result || '输出目录已打开'
        }
    } catch (error) {
        return {
            ok: false,
            message: `无法打开输出目录: ${error.message}`
        }
    }
})

// 应用信息
ipcMain.handle('get-app-info', () => {
    return {
        name: app.getName(),
        version: app.getVersion(),
        electronVersion: process.versions.electron,
        nodeVersion: process.versions.node,
        platform: process.platform,
        arch: process.arch,
        coreDir: coreDir,
        outputDir: outputDir
    }
})