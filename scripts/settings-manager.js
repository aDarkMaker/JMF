// 设置管理器
class SettingsManager {
    constructor() {
        this.currentSettings = {};
        this.defaultSettings = {
            general: {
                outputDir: '', // 将在初始化时设置为合适的默认路径
                autoOpenDir: false,
                useCustomFont: true
            },
            download: {
                domains: [
                    '18comic-mygo.vip',
                    '18comic-mygo.org',
                    '18comic-MHWs.CC',
                    'jmcomic-zzz.one',
                    'jmcomic-zzz.org'
                ],
                retryTimes: 3,
                imageThreads: 20,
                enableProxy: false,
                proxyAddress: '127.0.0.1:7890'
            },
            advanced: {
                enableLog: false,
                imageFormat: '.jpg',
                enableCache: true
            }
        };
        this.initElements();
        this.initEventListeners();
    }

    initElements() {
        this.modal = document.getElementById('settingsModal');
        this.closeBtn = document.getElementById('closeSettingsModal');
        this.tabBtns = document.querySelectorAll('.tab-btn');
        this.tabContents = document.querySelectorAll('.tab-content');

        // 常规设置
        this.outputDirInput = document.getElementById('outputDirInput');
        this.browseOutputDirBtn = document.getElementById('browseOutputDir');
        this.autoOpenDirCheck = document.getElementById('autoOpenDir');
        this.useCustomFontCheck = document.getElementById('useCustomFont');

        // 下载设置
        this.domainList = document.getElementById('domainList');
        this.newDomainInput = document.getElementById('newDomain');
        this.addDomainBtn = document.getElementById('addDomain');
        this.retryTimesInput = document.getElementById('retryTimes');
        this.imageThreadsInput = document.getElementById('imageThreads');
        this.enableProxyCheck = document.getElementById('enableProxy');
        this.proxyAddressInput = document.getElementById('proxyAddress');
        this.proxySettings = document.querySelector('.proxy-settings');

        // 高级设置
        this.enableLogCheck = document.getElementById('enableLog');
        this.imageFormatSelect = document.getElementById('imageFormat');
        this.enableCacheCheck = document.getElementById('enableCache');

        // 操作按钮
        this.resetBtn = document.getElementById('resetSettings');
        this.saveBtn = document.getElementById('saveSettings');
    }

    initEventListeners() {
        // 模态框控制
        this.closeBtn.addEventListener('click', () => this.close());
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) this.close();
        });

        // 标签页切换
        this.tabBtns.forEach(btn => {
            btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
        });

        // 常规设置
        this.browseOutputDirBtn.addEventListener('click', () => this.browseOutputDir());
        this.enableProxyCheck.addEventListener('change', () => this.toggleProxySettings());
        this.useCustomFontCheck.addEventListener('change', () => this.previewFontSetting());

        // 字体选择
        this.customFontOption = document.getElementById('customFontOption');
        this.systemFontOption = document.getElementById('systemFontOption');

        if (this.customFontOption && this.systemFontOption) {
            this.customFontOption.addEventListener('click', () => {
                this.useCustomFontCheck.checked = true;
                this.updateFontOptionSelection();
                this.previewFontSetting();
            });

            this.systemFontOption.addEventListener('click', () => {
                this.useCustomFontCheck.checked = false;
                this.updateFontOptionSelection();
                this.previewFontSetting();
            });
        }

        // 下载设置
        this.addDomainBtn.addEventListener('click', () => this.addDomain());
        this.newDomainInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addDomain();
        });

        // 操作按钮
        this.resetBtn.addEventListener('click', () => this.resetToDefault());
        this.saveBtn.addEventListener('click', () => this.saveSettings());

        // ESC键关闭
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.modal.style.display !== 'none') {
                this.close();
            }
        });
    }

    async show() {
        await this.loadSettings();
        this.populateForm();
        this.modal.style.display = 'flex';
    }

    close() {
        this.modal.style.display = 'none';
    }

    switchTab(tabName) {
        // 切换标签按钮状态
        this.tabBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });

        // 切换内容显示
        this.tabContents.forEach(content => {
            content.classList.toggle('active', content.id === `${tabName}Tab`);
        });
    }

    async loadSettings() {
        try {
            const settings = await window.jmf.getSettings();

            // 获取应用信息以设置合适的默认路径
            const appInfo = await window.jmf.getAppInfo();
            if (!this.defaultSettings.general.outputDir) {
                this.defaultSettings.general.outputDir = appInfo.defaultOutputDir || appInfo.outputDir;
            }

            this.currentSettings = { ...this.defaultSettings, ...settings };

            // 如果没有设置输出目录，使用默认路径
            if (!this.currentSettings.general.outputDir || this.currentSettings.general.outputDir === '../PDF') {
                this.currentSettings.general.outputDir = this.defaultSettings.general.outputDir;
            }

            // 应用字体设置
            this.applyFontSetting(this.currentSettings.general.useCustomFont);
        } catch (error) {
            console.error('加载设置失败:', error);
            this.currentSettings = { ...this.defaultSettings };

            // 应用默认字体设置
            this.applyFontSetting(this.defaultSettings.general.useCustomFont);
        }
    }

    populateForm() {
        // 常规设置
        this.outputDirInput.value = this.currentSettings.general.outputDir;
        this.autoOpenDirCheck.checked = this.currentSettings.general.autoOpenDir;
        this.useCustomFontCheck.checked = this.currentSettings.general.useCustomFont;
        this.updateFontOptionSelection();

        // 下载设置
        this.populateDomainList();
        this.retryTimesInput.value = this.currentSettings.download.retryTimes;
        this.imageThreadsInput.value = this.currentSettings.download.imageThreads;
        this.enableProxyCheck.checked = this.currentSettings.download.enableProxy;
        this.proxyAddressInput.value = this.currentSettings.download.proxyAddress;
        this.toggleProxySettings();

        // 高级设置
        this.enableLogCheck.checked = this.currentSettings.advanced.enableLog;
        this.imageFormatSelect.value = this.currentSettings.advanced.imageFormat;
        this.enableCacheCheck.checked = this.currentSettings.advanced.enableCache;
    }

    populateDomainList() {
        this.domainList.innerHTML = '';
        this.currentSettings.download.domains.forEach((domain, index) => {
            const item = document.createElement('div');
            item.className = 'domain-item';
            item.innerHTML = `
                <span>${domain}</span>
                <button onclick="settingsManager.removeDomain(${index})">删除</button>
            `;
            this.domainList.appendChild(item);
        });
    }

    addDomain() {
        const domain = this.newDomainInput.value.trim();
        if (!domain) return;

        if (this.currentSettings.download.domains.includes(domain)) {
            alert('域名已存在');
            return;
        }

        this.currentSettings.download.domains.push(domain);
        this.populateDomainList();
        this.newDomainInput.value = '';
    }

    removeDomain(index) {
        this.currentSettings.download.domains.splice(index, 1);
        this.populateDomainList();
    }

    toggleProxySettings() {
        const enabled = this.enableProxyCheck.checked;
        this.proxySettings.style.display = enabled ? 'block' : 'none';
    }

    async browseOutputDir() {
        try {
            const result = await window.jmf.selectDirectory();
            if (result) {
                this.outputDirInput.value = result;
            }
        } catch (error) {
            console.error('选择目录失败:', error);
        }
    }

    gatherFormData() {
        return {
            general: {
                outputDir: this.outputDirInput.value,
                autoOpenDir: this.autoOpenDirCheck.checked,
                useCustomFont: this.useCustomFontCheck.checked
            },
            download: {
                domains: [...this.currentSettings.download.domains],
                retryTimes: parseInt(this.retryTimesInput.value),
                imageThreads: parseInt(this.imageThreadsInput.value),
                enableProxy: this.enableProxyCheck.checked,
                proxyAddress: this.proxyAddressInput.value
            },
            advanced: {
                enableLog: this.enableLogCheck.checked,
                imageFormat: this.imageFormatSelect.value,
                enableCache: this.enableCacheCheck.checked
            }
        };
    }

    async saveSettings() {
        try {
            const settings = this.gatherFormData();
            await window.jmf.saveSettings(settings);
            this.currentSettings = settings;

            // 应用字体设置
            this.applyFontSetting(settings.general.useCustomFont);

            // 显示保存成功提示
            this.showNotification('设置保存成功', 'success');

            // 不再自动关闭模态框，让用户手动关闭
            // setTimeout(() => this.close(), 1000);
        } catch (error) {
            console.error('保存设置失败:', error);
            this.showNotification('保存设置失败', 'error');
        }
    }

    resetToDefault() {
        if (confirm('确定要重置所有设置到默认值吗？')) {
            this.currentSettings = { ...this.defaultSettings };
            this.populateForm();
            this.showNotification('已重置为默认设置', 'info');
            // 恢复默认字体设置
            this.applyFontSetting(this.defaultSettings.general.useCustomFont);
        }
    }

    // 更新字体选项的选中状态
    updateFontOptionSelection() {
        if (!this.customFontOption || !this.systemFontOption) return;

        const useCustomFont = this.useCustomFontCheck.checked;
        this.customFontOption.classList.toggle('selected', useCustomFont);
        this.systemFontOption.classList.toggle('selected', !useCustomFont);
    }

    // 预览字体设置（在保存前）
    previewFontSetting() {
        const useCustomFont = this.useCustomFontCheck.checked;
        document.body.classList.toggle('use-system-font', !useCustomFont);
        this.updateFontOptionSelection();
    }

    // 应用字体设置（保存后）
    applyFontSetting(useCustomFont) {
        document.body.classList.toggle('use-system-font', !useCustomFont);
        this.updateFontOptionSelection();

        // 如果有PDF预览窗口打开，也应用字体设置
        try {
            // 发送消息到主进程，让它通知PDF窗口更新字体设置
            window.jmf.notifyPDFWindowFontChange?.(useCustomFont);
        } catch (error) {
            console.warn('无法更新PDF预览窗口的字体设置:', error);
        }

        // 保存到本地存储，以便在页面加载时应用
        localStorage.setItem('useCustomFont', useCustomFont);
    }

    showNotification(message, type = 'info') {
        // 创建通知元素
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 20px;
            background: ${type === 'success' ? 'var(--success)' : type === 'error' ? 'var(--danger)' : 'var(--accent)'};
            color: white;
            border-radius: 6px;
            z-index: 10000;
            box-shadow: 0 4px 12px var(--shadow);
            animation: slideIn 0.3s ease;
        `;

        document.body.appendChild(notification);

        // 3秒后自动移除
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }
}

// 添加动画样式
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(style);

// 全局实例
window.settingsManager = new SettingsManager();
