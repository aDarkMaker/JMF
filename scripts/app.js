// JMcomic Fetcher - 前端应用脚本
class JMcomicApp {
    constructor() {
        this.initElements();
        this.initEventListeners();
        this.initApp();
    }

    // 初始化DOM元素
    initElements() {
        this.elements = {
            // 状态和日志
            status: document.getElementById('status'),
            logView: document.getElementById('log'),
            logHint: document.getElementById('logHint'),
            progressBar: document.getElementById('progressBar'),
            progressFill: document.getElementById('progressFill'),

            // 输入和按钮
            albumIdInput: document.getElementById('albumId'),
            btnDownload: document.getElementById('btnDownload'),
            btnInstall: document.getElementById('btnInstall'),
            btnOpenOut: document.getElementById('btnOpenOut'),
            btnPreview: document.getElementById('btnPreview'),
            btnSettings: document.getElementById('btnSettings'),
            btnClear: document.getElementById('btnClear'),

            // 窗口控制
            btnMin: document.getElementById('btnMin'),
            btnMax: document.getElementById('btnMax'),
            btnClose: document.getElementById('btnClose')
        };
    }

    // 初始化事件监听器
    initEventListeners() {
        // 下载功能
        this.elements.btnDownload.addEventListener('click', () => this.handleDownload());
        this.elements.albumIdInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleDownload();
        });

        // 工具栏按钮
        this.elements.btnInstall.addEventListener('click', () => this.handleInstallDeps());
        this.elements.btnOpenOut.addEventListener('click', () => this.handleOpenOutDir());
        this.elements.btnPreview.addEventListener('click', () => this.handlePDFPreview());
        this.elements.btnSettings.addEventListener('click', () => this.handleSettings());
        this.elements.btnClear.addEventListener('click', () => this.handleClearLog());

        // 窗口控制
        this.elements.btnMin.addEventListener('click', () => window.jmf?.win?.minimize());
        this.elements.btnMax.addEventListener('click', () => window.jmf?.win?.toggleMaximize());
        this.elements.btnClose.addEventListener('click', () => window.jmf?.win?.close());

        // IPC事件监听
        if (window.jmf) {
            window.jmf.onLog((msg) => this.appendLog(msg));
            window.jmf.onDone((code) => this.handleDownloadDone(code));
            window.jmf.onError((err) => this.handleDownloadError(err));
        }
    }

    // 初始化应用
    initApp() {
        this.appendLog('JMcomic Fetcher 已启动\n');
        this.setStatus('待命', 'idle');
        this.updateLogHint('等待操作...');

        // 检查输入验证
        this.elements.albumIdInput.addEventListener('input', (e) => {
            const value = e.target.value;
            // 只允许数字
            e.target.value = value.replace(/[^0-9]/g, '');
        });

        // 监听内容变化，动态调整窗口大小
        this.setupDynamicResizing();
    }

    // 设置动态调整窗口大小
    setupDynamicResizing() {
        let resizeTimeout;
        let lastLogLength = 0;

        // 创建更积极的日志监听器
        const checkLogChanges = () => {
            if (this.elements.logView) {
                const currentLogLength = this.elements.logView.textContent.length;
                const currentLogLines = this.elements.logView.textContent.split('\n').length;

                // 如果日志内容有明显变化，立即请求窗口调整
                if (Math.abs(currentLogLength - lastLogLength) > 50 || currentLogLines > 10) {
                    lastLogLength = currentLogLength;
                    clearTimeout(resizeTimeout);
                    resizeTimeout = setTimeout(() => {
                        this.requestWindowResize();
                    }, 200); // 减少延迟
                }
            }
        };

        // 监听日志内容变化
        const logObserver = new MutationObserver((mutations) => {
            let shouldResize = false;

            mutations.forEach((mutation) => {
                if (mutation.type === 'childList' || mutation.type === 'characterData') {
                    shouldResize = true;
                }
            });

            if (shouldResize) {
                checkLogChanges();
            }
        });

        if (this.elements.logView) {
            logObserver.observe(this.elements.logView, {
                childList: true,
                subtree: true,
                characterData: true
            });

            // 也监听innerHTML的直接变化
            let originalInnerHTML = this.elements.logView.innerHTML;
            const checkInnerHTMLChanges = () => {
                if (this.elements.logView.innerHTML !== originalInnerHTML) {
                    originalInnerHTML = this.elements.logView.innerHTML;
                    checkLogChanges();
                }
            };

            // 定期检查innerHTML变化（作为备用方案）
            setInterval(checkInnerHTMLChanges, 500);
        }

        // 监听模态框显示/隐藏
        document.addEventListener('modalToggle', () => {
            setTimeout(() => this.requestWindowResize(), 100);
        });

        // 监听进度条显示/隐藏
        if (this.elements.progressBar) {
            const progressObserver = new MutationObserver(() => {
                setTimeout(() => this.requestWindowResize(), 100);
            });

            progressObserver.observe(this.elements.progressBar, {
                attributes: true,
                attributeFilter: ['style']
            });
        }

        // 初始调整（应用启动后）
        setTimeout(() => {
            this.requestWindowResize();
        }, 1000);
    }

    // 请求调整窗口大小
    async requestWindowResize() {
        try {
            if (window.jmf && window.jmf.requestResize) {
                await window.jmf.requestResize();
            }
        } catch (error) {
            console.log('窗口大小调整请求失败:', error);
        }
    }

    // 日志相关方法
    appendLog(msg, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = `[${timestamp}] ${msg}`;

        if (type === 'error') {
            this.elements.logView.innerHTML += `<span style="color: var(--danger)">${logEntry}</span>`;
        } else if (type === 'success') {
            this.elements.logView.innerHTML += `<span style="color: var(--success)">${logEntry}</span>`;
        } else if (type === 'warning') {
            this.elements.logView.innerHTML += `<span style="color: var(--warning)">${logEntry}</span>`;
        } else {
            this.elements.logView.textContent += logEntry;
        }

        this.elements.logView.scrollTop = this.elements.logView.scrollHeight;

        // 日志内容变化后，延迟请求窗口调整
        setTimeout(() => {
            this.requestWindowResize();
        }, 100);
    }

    // 状态管理
    setStatus(text, type = 'idle') {
        this.elements.status.textContent = text;
        this.elements.status.className = `status-pill ${type}`;

        // 不再自动控制进度条，进度条由具体操作独立控制
        if (type === 'processing') {
            document.body.classList.add('processing');
        } else {
            document.body.classList.remove('processing');
        }
    }

    // 进度条控制
    showProgress(show, progress = 0) {
        if (show) {
            this.elements.progressBar.style.display = 'block';
            if (progress > 0) {
                this.elements.progressFill.style.width = `${progress}%`;
                this.elements.progressFill.classList.remove('indeterminate');
            } else {
                this.elements.progressFill.classList.add('indeterminate');
            }
        } else {
            this.elements.progressBar.style.display = 'none';
            this.elements.progressFill.classList.remove('indeterminate');
        }

        // 进度条显示状态改变后，延迟调整窗口大小
        setTimeout(() => {
            this.requestWindowResize();
        }, 100);
    }

    // 更新日志提示
    updateLogHint(text) {
        this.elements.logHint.textContent = text;
    }

    // 设置按钮状态
    setBusy(busy) {
        this.elements.btnDownload.disabled = busy;
        this.elements.albumIdInput.disabled = busy;
        this.elements.btnInstall.disabled = busy;

        if (busy) {
            this.setStatus('处理中...', 'processing');
            this.updateLogHint('正在处理，请稍候...');
        } else {
            this.setStatus('待命', 'idle');
            this.updateLogHint('等待操作...');
        }
    }

    // 处理下载
    async handleDownload() {
        const albumId = this.elements.albumIdInput.value.trim();

        if (!albumId) {
            this.appendLog('请输入本子ID\n', 'error');
            this.elements.albumIdInput.focus();
            this.showNotification('请输入有效的本子ID', 'error');
            return;
        }

        if (!/^\d+$/.test(albumId)) {
            this.appendLog('本子ID必须是数字\n', 'error');
            this.elements.albumIdInput.focus();
            this.showNotification('本子ID格式错误', 'error');
            return;
        }

        this.elements.logView.textContent = '';
        this.setBusy(true);
        this.appendLog(`开始下载本子 ID: ${albumId}\n`);

        // 确保进度条显示并触发窗口调整
        this.showProgress(true);

        // 延迟一下让进度条渲染完成，然后调整窗口大小
        setTimeout(() => {
            this.requestWindowResize();
        }, 200);

        try {
            await window.jmf?.download(albumId);
        } catch (error) {
            this.handleDownloadError(error.message);
        }
    }

    // 处理下载完成
    handleDownloadDone(code) {
        this.setBusy(false);
        this.showProgress(false);

        if (code === 0) {
            this.appendLog('\n✅ 下载和转换完成！\n', 'success');
            this.setStatus('完成', 'success');
            this.showNotification('下载完成！', 'success');
            this.updateLogHint('操作成功完成');
        } else {
            this.appendLog(`\n❌ 操作失败，退出码: ${code}\n`, 'error');
            this.setStatus('失败', 'error');
            this.showNotification('操作失败', 'error');
            this.updateLogHint('操作失败，请检查日志');
        }

        // 隐藏进度条后调整窗口大小
        setTimeout(() => {
            this.requestWindowResize();
        }, 200);
    }

    // 处理下载错误
    handleDownloadError(error) {
        this.setBusy(false);
        this.showProgress(false);
        this.appendLog(`\n❌ 错误: ${error}\n`, 'error');
        this.setStatus('失败', 'error');
        this.showNotification('操作出错', 'error');
        this.updateLogHint('发生错误，请检查日志');

        // 隐藏进度条后调整窗口大小
        setTimeout(() => {
            this.requestWindowResize();
        }, 200);
    }

    // 安装依赖
    async handleInstallDeps() {
        this.appendLog('开始安装 Python 依赖包...\n');
        this.updateLogHint('正在安装依赖...');

        try {
            const result = await window.jmf?.installDeps();

            if (result?.ok) {
                this.appendLog('✅ 依赖安装完成\n', 'success');
                this.showNotification('依赖安装完成', 'success');
            } else {
                this.appendLog(`❌ 依赖安装失败: ${result?.message || result?.code}\n`, 'error');
                this.showNotification('依赖安装失败', 'error');
            }
        } catch (error) {
            this.appendLog(`❌ 依赖安装出错: ${error}\n`, 'error');
            this.showNotification('依赖安装出错', 'error');
        }

        this.updateLogHint('等待操作...');
    }

    // 打开输出目录
    async handleOpenOutDir() {
        try {
            const result = await window.jmf?.openOutDir();

            if (result?.ok) {
                this.appendLog('📁 输出目录已打开\n');
            } else {
                this.appendLog(`❌ 打开输出目录失败: ${result?.message || ''}\n`, 'error');
                this.showNotification('无法打开输出目录', 'error');
            }
        } catch (error) {
            this.appendLog(`❌ 打开目录出错: ${error}\n`, 'error');
            this.showNotification('操作失败', 'error');
        }
    }

    // 清空日志
    handleClearLog() {
        this.elements.logView.textContent = '';
        this.appendLog('日志已清空\n');
        this.updateLogHint('日志已清空');
    }

    // 显示通知（简单的状态提示）
    showNotification(message, type = 'info') {
        // 这里可以添加更复杂的通知系统
        console.log(`[${type.toUpperCase()}] ${message}`);
    }

    // 处理PDF预览
    handlePDFPreview() {
        if (window.pdfViewer) {
            window.pdfViewer.show();
        } else {
            this.showNotification('PDF预览功能不可用', 'error');
        }
    }

    // 处理设置
    handleSettings() {
        if (window.settingsManager) {
            window.settingsManager.show();
        } else {
            this.showNotification('设置功能不可用', 'error');
        }
    }
}

// 应用初始化
document.addEventListener('DOMContentLoaded', () => {
    window.jmcApp = new JMcomicApp();
});

// 全局快捷键
document.addEventListener('keydown', (e) => {
    // Ctrl+Enter 快速下载
    if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        window.jmcApp?.handleDownload();
    }

    // Ctrl+L 清空日志
    if (e.ctrlKey && e.key === 'l') {
        e.preventDefault();
        window.jmcApp?.handleClearLog();
    }

    // F5 刷新（禁用）
    if (e.key === 'F5') {
        e.preventDefault();
    }
});
