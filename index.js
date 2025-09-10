const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron')
const path = require('path')
const { spawn, spawnSync } = require('child_process')
const fs = require('fs')

// 简单的YAML解析器（用于基本的option.yml文件）
function parseYAML(yamlString) {
    const lines = yamlString.split('\n');
    const result = {};
    const stack = [{ obj: result, indent: -1 }];

    for (let line of lines) {
        line = line.replace(/\r$/, ''); // 移除回车符
        if (!line.trim() || line.trim().startsWith('#')) continue;

        const indent = line.length - line.trimLeft().length;
        const trimmedLine = line.trim();

        // 弹出栈直到找到正确的父级
        while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
            stack.pop();
        }

        const currentObj = stack[stack.length - 1].obj;

        if (trimmedLine.startsWith('- ')) {
            // 处理列表项
            const value = trimmedLine.substring(2).trim();
            const keys = Object.keys(currentObj);
            const lastKey = keys[keys.length - 1];

            if (!Array.isArray(currentObj[lastKey])) {
                currentObj[lastKey] = [];
            }
            currentObj[lastKey].push(value);
        } else if (trimmedLine.includes(':')) {
            const colonIndex = trimmedLine.indexOf(':');
            const key = trimmedLine.substring(0, colonIndex).trim();
            const value = trimmedLine.substring(colonIndex + 1).trim();

            if (value === '' || value === null) {
                currentObj[key] = {};
                stack.push({ obj: currentObj[key], indent: indent });
            } else if (value === 'true') {
                currentObj[key] = true;
            } else if (value === 'false') {
                currentObj[key] = false;
            } else if (value === 'null') {
                currentObj[key] = null;
            } else if (!isNaN(value) && value !== '') {
                currentObj[key] = Number(value);
            } else {
                currentObj[key] = value;
            }
        }
    }

    return result;
}

// 简单的YAML生成器
function generateYAML(obj, indent = 0) {
    let yaml = '';
    const spaces = '  '.repeat(indent);

    for (const [key, value] of Object.entries(obj)) {
        if (Array.isArray(value)) {
            yaml += `${spaces}${key}:\n`;
            for (const item of value) {
                yaml += `${spaces}- ${item}\n`;
            }
        } else if (typeof value === 'object' && value !== null) {
            yaml += `${spaces}${key}:\n`;
            yaml += generateYAML(value, indent + 1);
        } else {
            yaml += `${spaces}${key}: ${value}\n`;
        }
    }

    return yaml;
}

let mainWindow

const appDir = __dirname
// 在打包环境中，资源文件的路径会有所不同
const coreDir = app.isPackaged ?
    path.join(process.resourcesPath, 'core') :
    path.join(appDir, 'core')

// 使用用户数据目录，确保可写权限
const userDataDir = app.getPath('userData')
const userSettingsDir = path.join(userDataDir, 'settings')
const userOutputDir = path.join(userDataDir, 'PDF')

// 设置目录 - 在打包环境中使用exe同级目录
const settingsDir = app.isPackaged ?
    path.join(path.dirname(process.execPath), 'settings') :
    userSettingsDir

// 默认输出目录 - 在打包环境中使用exe同级目录
const defaultOutputDir = app.isPackaged ?
    path.join(path.dirname(process.execPath), 'PDF') :
    path.join(appDir, 'PDF')

// 实际使用的输出目录（可以通过设置更改）
let outputDir = defaultOutputDir

const downloaderScript = path.join(coreDir, 'downloader.py')
const depsScript = path.join(coreDir, 'deps.py')

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 1000,
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
        show: false,
        resizable: true
    })

    mainWindow.loadFile(path.join(__dirname, 'index.html'))

    mainWindow.once('ready-to-show', () => {
        // 动态调整窗口大小以适应内容
        adjustWindowSize()
    })

    mainWindow.setMenuBarVisibility(false)

    // 当主窗口关闭时，关闭所有子窗口（包括PDF预览窗口）
    mainWindow.on('close', () => {
        if (pdfViewerWindow && !pdfViewerWindow.isDestroyed()) {
            pdfViewerWindow.close();
        }
    });

    ensureOutputDirectory()
    ensureUserDirectories()
}

// 动态调整窗口大小函数
async function adjustWindowSize() {
    try {
        // 获取内容的实际尺寸
        const contentSize = await mainWindow.webContents.executeJavaScript(`
            (function() {
                // 等待DOM完全渲染
                return new Promise((resolve) => {
                    setTimeout(() => {
                        const container = document.querySelector('.container');
                        const mainCard = document.querySelector('.main-card');
                        
                        if (container && mainCard) {
                            // 计算各个组件的实际高度
                            const header = document.querySelector('.header');
                            const inputSection = document.querySelector('.input-section');
                            const toolbar = document.querySelector('.toolbar');
                            const logSection = document.querySelector('.log-section');
                            const logContainer = document.querySelector('.log-container');
                            const progressBar = document.querySelector('.progress-bar');
                            
                            let totalContentHeight = 0;
                            const cardPadding = 60; // main-card的padding
                            const containerPadding = 40; // container的padding
                            const titlebarHeight = 40; // 标题栏高度
                            const extraMargin = 60; // 额外的边距
                            
                            // 计算每个部分的高度
                            if (header) {
                                totalContentHeight += header.offsetHeight + 30; // header + margin
                            }
                            
                            if (inputSection) {
                                totalContentHeight += inputSection.offsetHeight + 20; // input section + margin
                            }
                            
                            if (progressBar && getComputedStyle(progressBar).display !== 'none') {
                                totalContentHeight += progressBar.offsetHeight + 20; // progress bar + margin
                            }
                            
                            if (toolbar) {
                                totalContentHeight += toolbar.offsetHeight + 20; // toolbar + margin
                            }
                            
                            // 日志区域的特殊处理
                            if (logSection && logContainer) {
                                const logHeader = logSection.querySelector('.log-header');
                                let logSectionHeight = 0;
                                
                                if (logHeader) {
                                    logSectionHeight += logHeader.offsetHeight + 15; // log header + margin
                                }
                                
                                // 计算日志内容的实际高度
                                const logView = logContainer.querySelector('#logView');
                                let logContentHeight = 200; // 最小高度
                                
                                if (logView) {
                                    // 获取实际的滚动高度
                                    const actualScrollHeight = logView.scrollHeight;
                                    const logContent = logView.textContent || logView.innerText || '';
                                    const logLines = Math.max(1, logContent.split('\\n').length);
                                    
                                    // 计算基于行高的高度
                                    const lineHeight = parseInt(getComputedStyle(logView).lineHeight) || 19.5;
                                    const calculatedHeight = logLines * lineHeight;
                                    
                                    // 使用更准确的高度计算
                                    const contentBasedHeight = Math.max(actualScrollHeight, calculatedHeight);
                                    
                                    // 加上padding和边距
                                    const logPadding = 40;
                                    const containerBorders = 4; // border + outline
                                    
                                    // 设置合理的范围，但允许更大的最大值
                                    logContentHeight = Math.max(200, Math.min(600, contentBasedHeight + logPadding + containerBorders));
                                    
                                    console.log('日志高度计算:', {
                                        lines: logLines,
                                        lineHeight: lineHeight,
                                        scrollHeight: actualScrollHeight,
                                        calculatedHeight: calculatedHeight,
                                        finalHeight: logContentHeight
                                    });
                                }
                                
                                logSectionHeight += logContentHeight;
                                totalContentHeight += logSectionHeight + 20; // log section + margin
                            }
                            
                            const idealContentHeight = totalContentHeight + cardPadding;
                            const idealWindowHeight = idealContentHeight + containerPadding + titlebarHeight + extraMargin;
                            
                            // 计算理想宽度
                            const cardRect = mainCard.getBoundingClientRect();
                            const idealWidth = Math.max(1200, Math.min(1600, cardRect.width + containerPadding + 40));
                            const idealHeight = Math.max(800, Math.min(1200, idealWindowHeight));
                            
                            resolve({
                                width: idealWidth,
                                height: idealHeight,
                                contentHeight: totalContentHeight,
                                hasScrollbar: container.scrollHeight > container.clientHeight,
                                debug: {
                                    logLines: logContainer ? (logContainer.textContent || '').split('\\n').length : 0,
                                    calculatedContentHeight: totalContentHeight,
                                    idealWindowHeight: idealWindowHeight,
                                    components: {
                                        header: header ? header.offsetHeight : 0,
                                        input: inputSection ? inputSection.offsetHeight : 0,
                                        toolbar: toolbar ? toolbar.offsetHeight : 0,
                                        logSection: logSection ? logSection.offsetHeight : 0,
                                        logContainer: logContainer ? logContainer.offsetHeight : 0
                                    }
                                }
                            });
                        } else {
                            resolve({ width: 1000, height: 720, contentHeight: 0, hasScrollbar: false });
                        }
                    }, 100);
                });
            })();
        `)

        // 获取当前窗口大小
        const currentSize = mainWindow.getSize()
        const [currentWidth, currentHeight] = currentSize

        // 如果大小需要调整（更敏感的检测）
        const sizeDifference = Math.abs(contentSize.height - currentHeight)
        if (sizeDifference > 30) { // 降低阈值，更积极地调整
            const newWidth = Math.round(contentSize.width)
            const newHeight = Math.round(contentSize.height)

            // 获取屏幕工作区域
            const { screen } = require('electron')
            const workArea = screen.getPrimaryDisplay().workAreaSize

            // 确保窗口不超过屏幕大小
            const finalWidth = Math.min(newWidth, workArea.width - 100)
            const finalHeight = Math.min(newHeight, workArea.height - 80)

            // 设置新的窗口大小
            mainWindow.setSize(finalWidth, finalHeight, true)

            // 保持窗口居中
            mainWindow.center()

            console.log(`窗口大小已调整: ${currentWidth}x${currentHeight} -> ${finalWidth}x${finalHeight}`)
            console.log('日志行数:', contentSize.debug.logLines)
            console.log('组件高度:', contentSize.debug.components)
        }

        // 确保窗口可见
        if (!mainWindow.isVisible()) {
            mainWindow.show()
        }

        return true

    } catch (error) {
        console.error('调整窗口大小失败:', error)
        // 如果调整失败，确保窗口至少是可见的
        if (!mainWindow.isVisible()) {
            mainWindow.show()
        }
        throw error
    }
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

// 确保用户数据目录存在
function ensureUserDirectories() {
    try {
        // 创建用户数据目录
        if (!fs.existsSync(userDataDir)) {
            fs.mkdirSync(userDataDir, { recursive: true })
            console.log(`创建用户数据目录: ${userDataDir}`)
        }

        // 创建设置目录（根据打包状态选择不同路径）
        if (!fs.existsSync(settingsDir)) {
            fs.mkdirSync(settingsDir, { recursive: true })
            console.log(`创建设置目录: ${settingsDir}`)
        }

        // 创建用户PDF目录（仅在开发环境中使用）
        if (!app.isPackaged && !fs.existsSync(userOutputDir)) {
            fs.mkdirSync(userOutputDir, { recursive: true })
            console.log(`创建用户PDF目录: ${userOutputDir}`)
        }

        // 如果是首次运行打包版本，设置默认输出目录
        if (!fs.existsSync(defaultOutputDir)) {
            fs.mkdirSync(defaultOutputDir, { recursive: true })
            console.log(`创建默认输出目录: ${defaultOutputDir}`)
        }

        // 运行初始化脚本来设置默认配置
        initializeAppConfig()
    } catch (error) {
        console.error(`创建用户目录失败: ${error}`)
    }
}

// 初始化应用配置
async function initializeAppConfig() {
    try {
        const initScript = path.join(coreDir, 'init_app.py')
        if (!fs.existsSync(initScript)) {
            console.log('初始化脚本不存在，跳过配置初始化')
            return
        }

        const py = resolvePython()
        if (!py) {
            console.log('未找到Python，跳过配置初始化')
            return
        }

        const result = spawnSync(py.cmd, [...py.args, initScript], {
            cwd: coreDir,
            encoding: 'utf8',
            timeout: 10000 // 10秒超时
        })

        if (result.error) {
            console.error('配置初始化失败:', result.error)
            return
        }

        if (result.stdout) {
            try {
                const initResult = JSON.parse(result.stdout)
                if (initResult.success) {
                    console.log('应用配置初始化完成')

                    // 更新输出目录
                    if (initResult.output_dir) {
                        outputDir = initResult.output_dir
                    }
                } else {
                    console.log('配置初始化未成功')
                }
            } catch (e) {
                console.log('配置初始化输出:', result.stdout)
            }
        }

        if (result.stderr) {
            console.error('配置初始化警告:', result.stderr)
        }

    } catch (error) {
        console.error('配置初始化异常:', error)
    }
}

function resolvePython() {
    const candidates = [
        { cmd: 'py', args: ['-3'] },
        { cmd: 'py', args: [] },
        { cmd: 'python', args: [] },
        { cmd: 'python3', args: [] },
    ]

    // 在打包环境中添加常见的Python安装路径
    const commonPaths = [
        'C:\\Python39\\python.exe',
        'C:\\Python310\\python.exe',
        'C:\\Python311\\python.exe',
        'C:\\Python312\\python.exe',
        'C:\\Python313\\python.exe',
        'C:\\Users\\' + (process.env.USERNAME || 'user') + '\\AppData\\Local\\Programs\\Python\\Python39\\python.exe',
        'C:\\Users\\' + (process.env.USERNAME || 'user') + '\\AppData\\Local\\Programs\\Python\\Python310\\python.exe',
        'C:\\Users\\' + (process.env.USERNAME || 'user') + '\\AppData\\Local\\Programs\\Python\\Python311\\python.exe',
        'C:\\Users\\' + (process.env.USERNAME || 'user') + '\\AppData\\Local\\Programs\\Python\\Python312\\python.exe',
        'C:\\Users\\' + (process.env.USERNAME || 'user') + '\\AppData\\Local\\Programs\\Python\\Python313\\python.exe',
    ]

    // 添加常见路径到候选列表
    for (const pythonPath of commonPaths) {
        if (fs.existsSync(pythonPath)) {
            candidates.push({ cmd: pythonPath, args: [] })
        }
    }

    // 日志输出
    console.log('开始检测系统Python环境...')
    console.log('运行环境:', app.isPackaged ? '打包环境' : '开发环境')

    for (const c of candidates) {
        try {
            console.log(`尝试检测Python命令: ${c.cmd} ${c.args.join(' ')}`)

            // 在打包环境中使用更宽松的配置
            const spawnOptions = {
                encoding: 'utf8',
                timeout: app.isPackaged ? 10000 : 5000, // 打包环境给更长时间
                windowsHide: true,
                shell: true
            }

            // 在打包环境中添加更多环境变量
            if (app.isPackaged) {
                spawnOptions.env = {
                    ...process.env,
                    PATH: process.env.PATH + ';C:\\Python39;C:\\Python310;C:\\Python311;C:\\Python312;C:\\Python313;C:\\Windows\\py.exe',
                    PYTHONPATH: '',
                    PYTHONHOME: ''
                }
            }

            const r = spawnSync(c.cmd, [...c.args, '--version'], spawnOptions)

            // 详细日志
            if (r.error) {
                console.log(`命令执行出错: ${r.error.message}`)
            } else {
                console.log(`命令状态码: ${r.status}`)
                console.log(`命令标准输出: ${r.stdout?.trim()}`)
                console.log(`命令错误输出: ${r.stderr?.trim()}`)
            }

            // 检查结果
            if (r.status === 0 && (r.stdout?.includes('Python') || r.stderr?.includes('Python'))) {
                console.log(`√ 成功找到Python解释器: ${c.cmd} ${c.args.join(' ')}`)
                return c
            }
        } catch (error) {
            console.log(`× 检测Python命令失败 [${c.cmd}]: ${error.message}`)
        }
    }

    console.log('× 未找到可用的Python解释器')
    console.log('提示: 请确保已安装Python 3.7+并且可以在命令行中运行')

    // 在打包环境中提供更详细的错误信息
    if (app.isPackaged) {
        console.log('打包环境中的Python检测失败，可能的解决方案:')
        console.log('1. 确保Python已正确安装在系统PATH中')
        console.log('2. 尝试重新安装Python，确保勾选"Add Python to PATH"选项')
        console.log('3. 重启计算机以确保环境变量生效')
    }

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

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
    app.quit()
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore()
            mainWindow.focus()
        }
    })
}

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

// 动态调整窗口大小请求
ipcMain.handle('request-window-resize', async () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        try {
            await adjustWindowSize()
            return { success: true }
        } catch (error) {
            console.error('动态调整窗口大小失败:', error)
            return { success: false, error: error.message }
        }
    }
    return { success: false, error: '窗口不可用' }
})

ipcMain.on('download', async (event, albumId) => {
    const py = resolvePython()
    if (!py) {
        event.sender.send('download-error', '未找到可用的 Python 解释器。\n请安装 Python 3.7+ 并确保其在系统 PATH 中。\n\n如果已安装Python，请尝试:\n1. 重新安装Python并勾选"Add Python to PATH"\n2. 重启计算机\n3. 以管理员身份运行此应用')
        return
    }

    if (!fs.existsSync(downloaderScript)) {
        event.sender.send('download-error', `下载脚本不存在: ${downloaderScript}`)
        return
    }

    try {
        // 准备spawn环境变量，特别适配打包环境
        const spawnEnv = {
            ...process.env,
            PYTHONPATH: coreDir,
            PYTHONIOENCODING: 'utf-8',
            PYTHONUTF8: '1',
            LC_ALL: 'zh_CN.UTF-8',
            LANG: 'zh_CN.UTF-8'
        }

        // 在打包环境中增强PATH
        if (app.isPackaged) {
            const additionalPaths = [
                'C:\\Python39',
                'C:\\Python310',
                'C:\\Python311',
                'C:\\Python312',
                'C:\\Python313',
                'C:\\Python39\\Scripts',
                'C:\\Python310\\Scripts',
                'C:\\Python311\\Scripts',
                'C:\\Python312\\Scripts',
                'C:\\Python313\\Scripts'
            ].filter(p => fs.existsSync(p)).join(';')

            if (additionalPaths) {
                spawnEnv.PATH = `${spawnEnv.PATH};${additionalPaths}`
            }
        }

        // 使用正确的设置目录中的配置文件（如果存在）
        const userConfigPath = path.join(settingsDir, 'option.yml')
        const configToUse = fs.existsSync(userConfigPath) ? userConfigPath : path.join(coreDir, 'option.yml')

        // 构建命令行参数，确保路径正确引用
        const args = [...py.args, downloaderScript, String(albumId)]
        if (configToUse) {
            args.push('--config', configToUse)
        }
        if (outputDir) {
            args.push('--output', outputDir)
        }

        console.log('Python命令:', py.cmd)
        console.log('完整参数:', args)
        console.log('配置文件路径:', configToUse)
        console.log('输出目录:', outputDir)

        const child = spawn(py.cmd, args, {
            cwd: coreDir,
            env: spawnEnv,
            windowsHide: true,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
            shell: true // 确保在shell中执行，这在打包环境中很重要
        })

        streamChild(child, event)

        child.on('close', (code) => {
            event.sender.send('download-done', code ?? -1)
        })

        child.on('error', (err) => {
            console.error('Python进程启动错误:', err)
            const errorMsg = app.isPackaged ?
                `Python进程错误: ${String(err)}\n\n这可能是由于Python环境配置问题导致的。\n建议:\n1. 确保Python已正确安装\n2. 重新安装Python并勾选"Add Python to PATH"\n3. 重启计算机\n4. 以管理员身份运行此应用` :
                `Python进程错误: ${String(err)}`
            event.sender.send('download-error', errorMsg)
        })

    } catch (err) {
        console.error('启动下载进程失败:', err)
        const errorMsg = app.isPackaged ?
            `启动下载进程失败: ${String(err)}\n\n请检查Python环境是否正确安装。` :
            `启动下载进程失败: ${String(err)}`
        event.sender.send('download-error', errorMsg)
    }
})

ipcMain.handle('install-deps', async () => {
    console.log('开始安装Python依赖...')
    console.log('运行环境:', app.isPackaged ? '打包环境' : '开发环境')

    // 检测Python
    const py = resolvePython()
    if (!py) {
        console.log('× Python解释器检测失败')
        const errorMessage = app.isPackaged ?
            '未找到 Python 解释器，无法安装依赖。\n请先安装 Python 3.7+ 并确保其在系统 PATH 中。\n\n解决步骤:\n1. 下载并安装Python (https://python.org)\n2. 安装时务必勾选 "Add Python to PATH" 选项\n3. 重启计算机以应用环境变量更改\n4. 以管理员身份重新运行此应用' :
            '未找到 Python 解释器，无法安装依赖。\n请先安装 Python 3.7+ 并确保其在系统 PATH 中。\n\n提示：可能需要重启电脑以应用PATH环境变量更改。'
        return {
            ok: false,
            message: errorMessage
        }
    }

    console.log(`√ 使用Python解释器: ${py.cmd} ${py.args.join(' ')}`)

    return new Promise((resolve) => {
        // 准备环境变量
        const spawnEnv = {
            ...process.env,
            PYTHONPATH: coreDir,
            PYTHONIOENCODING: 'utf-8',
            PYTHONUTF8: '1',
            LC_ALL: 'zh_CN.UTF-8',
            LANG: 'zh_CN.UTF-8'
        }

        // 在打包环境中增强PATH
        if (app.isPackaged) {
            const additionalPaths = [
                'C:\\Python39',
                'C:\\Python310',
                'C:\\Python311',
                'C:\\Python312',
                'C:\\Python313',
                'C:\\Python39\\Scripts',
                'C:\\Python310\\Scripts',
                'C:\\Python311\\Scripts',
                'C:\\Python312\\Scripts',
                'C:\\Python313\\Scripts'
            ].filter(p => fs.existsSync(p)).join(';')

            if (additionalPaths) {
                spawnEnv.PATH = `${spawnEnv.PATH};${additionalPaths}`
            }
        }

        // 检查依赖安装脚本
        if (fs.existsSync(depsScript)) {
            console.log(`√ 找到依赖安装脚本: ${depsScript}`)

            // 执行依赖安装脚本
            console.log(`执行命令: ${py.cmd} ${[...py.args, depsScript].join(' ')}`)
            const child = spawn(py.cmd, [...py.args, depsScript], {
                cwd: coreDir,
                env: spawnEnv,
                windowsHide: true,
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'pipe'],
                shell: true  // 在打包环境中很重要
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
                    const errorMessage = app.isPackaged ?
                        `依赖安装失败 (退出码: ${code})\n\n可能的解决方案:\n1. 以管理员身份运行此应用\n2. 检查网络连接\n3. 手动安装依赖: pip install -r requirements.txt` :
                        `依赖安装失败 (退出码: ${code})`
                    resolve({ ok: false, message: errorMessage, output })
                }
            })

            child.on('error', (err) => {
                const errorMessage = app.isPackaged ?
                    `依赖安装进程错误: ${String(err)}\n\n建议以管理员身份运行应用，或手动安装Python依赖。` :
                    `依赖安装进程错误: ${String(err)}`
                resolve({ ok: false, message: errorMessage })
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
                env: spawnEnv,
                windowsHide: true,
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'pipe'],
                shell: true
            })

            child.on('close', (code) => {
                const message = code === 0 ? '依赖安装完成' :
                    app.isPackaged ? `依赖安装失败 (退出码: ${code})\n建议以管理员身份运行或手动安装依赖` :
                        `依赖安装失败 (退出码: ${code})`
                resolve({ ok: code === 0, message, code })
            })

            child.on('error', (err) => {
                const errorMessage = app.isPackaged ?
                    `${String(err)}\n建议以管理员身份运行应用` :
                    String(err)
                resolve({ ok: false, message: errorMessage })
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

// PDF预览功能
ipcMain.handle('get-pdf-list', async () => {
    try {
        ensureOutputDirectory();
        const files = fs.readdirSync(outputDir);
        const pdfFiles = files
            .filter(file => file.toLowerCase().endsWith('.pdf'))
            .map(file => {
                const filePath = path.join(outputDir, file);
                const stat = fs.statSync(filePath);
                return {
                    name: path.basename(file, '.pdf'),
                    path: filePath,
                    size: stat.size,
                    created: stat.birthtime,
                };
            })
            .sort((a, b) => b.created - a.created); // 按创建时间降序排序
        return pdfFiles;
    } catch (error) {
        console.error('无法读取PDF目录:', error);
        return [];
    }
});

ipcMain.handle('open-pdf-external', async (event, filePath) => {
    try {
        await shell.openPath(filePath);
        return { success: true };
    } catch (error) {
        console.error(`无法打开外部PDF: ${filePath}`, error);
        return { success: false, error: error.message };
    }
});

// 保存PDF预览窗口的引用
let pdfViewerWindow = null;

ipcMain.handle('open-pdf-in-new-window', () => {
    // 如果已经存在PDF窗口，先关闭它
    if (pdfViewerWindow && !pdfViewerWindow.isDestroyed()) {
        pdfViewerWindow.close();
    }

    // 创建新的PDF预览窗口
    pdfViewerWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        title: 'PDF 查看器',
        frame: false, // 禁用默认的系统标题栏
        titleBarStyle: 'hidden',
        transparent: false,
        backgroundColor: '#0a0b0f', // 与CSS中的--bg变量相匹配
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
            webSecurity: false, // 允许加载本地文件
        },
        icon: path.join(__dirname, 'assets', 'icon', 'icon.png'),
    });

    pdfViewerWindow.loadFile(path.join(__dirname, 'pdf-viewer.html'));
    pdfViewerWindow.setMenuBarVisibility(false);

    // 添加窗口关闭事件处理
    pdfViewerWindow.on('closed', () => {
        pdfViewerWindow = null;
    });

    // 打开开发者工具以便于调试
    if (process.env.NODE_ENV === 'development') {
        pdfViewerWindow.webContents.openDevTools();
    }

    console.log('PDF 预览窗口已打开');
    return true;
});

// PDF窗口控制事件
ipcMain.on('pdf-win:minimize', () => {
    if (pdfViewerWindow && !pdfViewerWindow.isDestroyed()) {
        pdfViewerWindow.minimize();
    }
});

ipcMain.on('pdf-win:toggle-maximize', () => {
    if (!pdfViewerWindow || pdfViewerWindow.isDestroyed()) return;

    if (pdfViewerWindow.isMaximized()) {
        pdfViewerWindow.unmaximize();
    } else {
        pdfViewerWindow.maximize();
    }
});

ipcMain.on('pdf-win:close', () => {
    if (pdfViewerWindow && !pdfViewerWindow.isDestroyed()) {
        pdfViewerWindow.close();
    }
});

// 读取PDF文件内容
ipcMain.handle('read-pdf-file', async (event, filePath) => {
    try {
        console.log(`读取PDF文件: ${filePath}`);
        if (!fs.existsSync(filePath)) {
            throw new Error(`文件不存在: ${filePath}`);
        }

        // 读取文件为ArrayBuffer
        const buffer = fs.readFileSync(filePath);
        return buffer.buffer;
    } catch (error) {
        console.error(`读取PDF文件失败: ${filePath}`, error);
        throw new Error(`读取PDF文件失败: ${error.message}`);
    }
});

// 处理字体变更通知，将变更应用到PDF预览窗口
ipcMain.handle('notify-pdf-font-change', async (event, useCustomFont) => {
    try {
        console.log(`处理字体变更: ${useCustomFont ? '预设字体' : '系统字体'}`);

        if (pdfViewerWindow && !pdfViewerWindow.isDestroyed()) {
            // 发送字体变更事件到PDF预览窗口
            pdfViewerWindow.webContents.send('font-change', useCustomFont);
            return true;
        }
        return false;
    } catch (error) {
        console.error('字体变更通知失败:', error);
        return false;
    }
});

ipcMain.handle('get-settings', async () => {
    try {
        const configPath = path.join(coreDir, 'option.yml')
        // 使用统一的设置目录
        const settingsPath = path.join(settingsDir, 'settings.json')

        let settings = {
            general: {
                outputDir: outputDir,
                autoOpenDir: false
            },
            download: {},
            advanced: {}
        }

        // 读取option.yml
        if (fs.existsSync(configPath)) {
            const configContent = fs.readFileSync(configPath, 'utf8')
            const config = parseYAML(configContent)

            if (config.client && config.client.domain) {
                settings.download.domains = config.client.domain
            }
            if (config.client && config.client.retry_times) {
                settings.download.retryTimes = config.client.retry_times
            }
            if (config.download && config.download.threading && config.download.threading.image) {
                settings.download.imageThreads = config.download.threading.image
            }
            if (config.client && config.client.postman && config.client.postman.meta_data && config.client.postman.meta_data.proxies) {
                settings.download.enableProxy = !!config.client.postman.meta_data.proxies
                settings.download.proxyAddress = config.client.postman.meta_data.proxies || '127.0.0.1:7890'
            }
            if (config.log !== undefined) {
                settings.advanced.enableLog = config.log
            }
            if (config.download && config.download.image && config.download.image.suffix) {
                settings.advanced.imageFormat = config.download.image.suffix
            }
            if (config.download && config.download.cache !== undefined) {
                settings.advanced.enableCache = config.download.cache
            }
        }

        // 读取应用设置
        if (fs.existsSync(settingsPath)) {
            const appSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
            settings = { ...settings, ...appSettings }

            // 如果设置中有输出目录，更新全局输出目录
            if (appSettings.general && appSettings.general.outputDir) {
                outputDir = appSettings.general.outputDir
            }
        }

        return settings
    } catch (error) {
        console.error('读取设置失败:', error)
        return {}
    }
})

// 保存设置
ipcMain.handle('save-settings', async (event, settings) => {
    try {
        const configPath = path.join(coreDir, 'option.yml')
        // 使用统一的设置目录
        const settingsPath = path.join(settingsDir, 'settings.json')

        // 在打包环境中，option.yml可能在只读的资源目录中，需要复制到设置目录
        const userConfigPath = path.join(settingsDir, 'option.yml')        // 更新option.yml
        let config = {}

        // 优先读取用户数据目录中的配置文件
        if (fs.existsSync(userConfigPath)) {
            const configContent = fs.readFileSync(userConfigPath, 'utf8')
            config = parseYAML(configContent) || {}
        } else if (fs.existsSync(configPath)) {
            // 如果用户数据目录中没有，从资源目录复制一份
            try {
                const configContent = fs.readFileSync(configPath, 'utf8')
                config = parseYAML(configContent) || {}
                // 复制到用户数据目录
                fs.writeFileSync(userConfigPath, configContent, 'utf8')
            } catch (error) {
                console.log('无法复制配置文件，使用默认配置')
                config = {}
            }
        }

        // 应用下载设置到option.yml
        if (settings.download) {
            if (!config.client) config.client = {}
            if (!config.download) config.download = {}

            if (settings.download.domains) {
                config.client.domain = settings.download.domains
            }
            if (settings.download.retryTimes) {
                config.client.retry_times = settings.download.retryTimes
            }
            if (settings.download.imageThreads) {
                if (!config.download.threading) config.download.threading = {}
                config.download.threading.image = settings.download.imageThreads
            }
            if (settings.download.enableProxy !== undefined) {
                if (!config.client.postman) config.client.postman = {}
                if (!config.client.postman.meta_data) config.client.postman.meta_data = {}
                config.client.postman.meta_data.proxies = settings.download.enableProxy ? settings.download.proxyAddress : null
            }
        }

        if (settings.advanced) {
            if (settings.advanced.enableLog !== undefined) {
                config.log = settings.advanced.enableLog
            }
            if (settings.advanced.imageFormat) {
                if (!config.download) config.download = {}
                if (!config.download.image) config.download.image = {}
                config.download.image.suffix = settings.advanced.imageFormat
            }
            if (settings.advanced.enableCache !== undefined) {
                if (!config.download) config.download = {}
                config.download.cache = settings.advanced.enableCache
            }
        }

        // 写入用户数据目录中的option.yml
        try {
            fs.writeFileSync(userConfigPath, generateYAML(config), 'utf8')
        } catch (error) {
            console.error('保存配置文件失败:', error)
        }

        // 保存应用设置到用户数据目录
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8')

        // 更新输出目录
        if (settings.general && settings.general.outputDir) {
            outputDir = settings.general.outputDir
            ensureOutputDirectory()
        }

        return { success: true }
    } catch (error) {
        console.error('保存设置失败:', error)
        throw error
    }
})

// 选择目录
ipcMain.handle('select-directory', async () => {
    try {
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openDirectory'],
            title: '选择输出目录'
        })

        if (!result.canceled && result.filePaths.length > 0) {
            return result.filePaths[0]
        }

        return null
    } catch (error) {
        console.error('选择目录失败:', error)
        return null
    }
})

// 获取PDF文件信息
ipcMain.handle('get-pdf-info', async (event, filePath) => {
    try {
        const stats = fs.statSync(filePath)
        const fileName = path.basename(filePath)

        return {
            name: fileName,
            path: filePath,
            size: stats.size,
            created: stats.birthtime,
            modified: stats.mtime,
            pages: null // PDF页数需要额外的库来获取，这里暂时返回null
        }
    } catch (error) {
        console.error('获取PDF信息失败:', error)
        throw new Error(`无法获取PDF文件信息: ${error.message}`)
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
        outputDir: outputDir,
        settingsDir: settingsDir,
        userDataDir: userDataDir,
        defaultOutputDir: defaultOutputDir,
        isPackaged: app.isPackaged
    }
})