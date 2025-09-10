// PDF预览器
// 注意：这里使用简单的PDF预览方式，实际项目可能需要PDF.js库
class PDFViewer {
    constructor() {
        this.currentFile = null;
        this.currentPage = 1;
        this.totalPages = 1;
        this.zoomLevel = 1.0;
        this.initElements();
        this.initEventListeners();
    }

    initElements() {
        this.modal = document.getElementById('pdfModal');
        this.closeBtn = document.getElementById('closePdfModal');
        this.fileSelect = document.getElementById('pdfFileSelect');
        this.container = document.getElementById('pdfContainer');
        this.prevBtn = document.getElementById('prevPage');
        this.nextBtn = document.getElementById('nextPage');
        this.pageInfo = document.getElementById('pageInfo');
        this.zoomOutBtn = document.getElementById('zoomOut');
        this.zoomInBtn = document.getElementById('zoomIn');
        this.zoomLevelSpan = document.getElementById('zoomLevel');
    }

    initEventListeners() {
        this.closeBtn.addEventListener('click', () => this.close());
        this.fileSelect.addEventListener('change', () => this.loadPDF());
        this.prevBtn.addEventListener('click', () => this.prevPage());
        this.nextBtn.addEventListener('click', () => this.nextPage());
        this.zoomOutBtn.addEventListener('click', () => this.zoomOut());
        this.zoomInBtn.addEventListener('click', () => this.zoomIn());

        // 点击模态框背景关闭
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.close();
            }
        });

        // 键盘快捷键
        document.addEventListener('keydown', (e) => {
            if (this.modal.style.display !== 'none') {
                switch (e.key) {
                    case 'Escape':
                        this.close();
                        break;
                    case 'ArrowLeft':
                        this.prevPage();
                        break;
                    case 'ArrowRight':
                        this.nextPage();
                        break;
                    case '+':
                    case '=':
                        this.zoomIn();
                        break;
                    case '-':
                        this.zoomOut();
                        break;
                }
            }
        });
    }

    async show() {
        await this.loadPDFList();
        this.modal.style.display = 'flex';
    }

    close() {
        this.modal.style.display = 'none';
        this.currentFile = null;
        this.showPlaceholder();
    }

    async loadPDFList() {
        try {
            const files = await window.jmf.getPDFList();
            this.fileSelect.innerHTML = '<option value="">选择PDF文件</option>';

            if (files.length === 0) {
                this.fileSelect.innerHTML += '<option disabled>暂无PDF文件</option>';
                return;
            }

            files.forEach(file => {
                const option = document.createElement('option');
                option.value = file.path;
                option.textContent = file.name;
                this.fileSelect.appendChild(option);
            });
        } catch (error) {
            console.error('加载PDF列表失败:', error);
            this.showError('加载PDF列表失败');
        }
    }

    async loadPDF() {
        const filePath = this.fileSelect.value;
        if (!filePath) {
            this.showPlaceholder();
            return;
        }

        try {
            this.showLoading();
            this.currentFile = filePath;

            // 获取PDF文件信息
            const fileInfo = await window.jmf.getPDFInfo(filePath);

            // 创建PDF预览界面
            const pdfContainer = document.createElement('div');
            pdfContainer.className = 'pdf-display';
            pdfContainer.innerHTML = `
                <div class="pdf-info">
                    <h4>📖 PDF文件预览</h4>
                    <div class="file-details">
                        <p><strong>文件名:</strong> ${fileInfo.name}</p>
                        <p><strong>大小:</strong> ${this.formatFileSize(fileInfo.size)}</p>
                        <p><strong>创建时间:</strong> ${new Date(fileInfo.created).toLocaleString()}</p>
                    </div>
                    
                    <div class="pdf-preview-container">
                        <div class="pdf-thumbnail">
                            <canvas id="pdfCanvas" width="300" height="400"></canvas>
                            <div class="pdf-overlay">
                                <div class="pdf-page-count">共 ${fileInfo.pages || '?'} 页</div>
                            </div>
                        </div>
                        
                        <div class="pdf-controls-side">
                            <button onclick="window.jmf.openPDFExternal('${filePath}')" class="btn primary pdf-action-btn">
                                <span>📖</span>
                                用默认程序打开
                            </button>
                            <button onclick="window.jmf.openOutDir()" class="btn pdf-action-btn">
                                <span>📁</span>
                                打开文件夹
                            </button>
                            <button onclick="window.pdfViewer.createNewWindow('${filePath}')" class="btn pdf-action-btn">
                                <span>🖼️</span>
                                新窗口预览
                            </button>
                        </div>
                    </div>
                    
                    <div class="pdf-preview-note">
                        <p>💡 点击上方按钮可以使用不同方式查看PDF文件</p>
                        <p>推荐使用"新窗口预览"或"默认程序打开"获得最佳阅读体验</p>
                    </div>
                </div>
            `;

            this.container.innerHTML = '';
            this.container.appendChild(pdfContainer);

            // 尝试生成缩略图
            this.generateThumbnail(filePath);

            // 更新控件状态
            this.updateControls();

        } catch (error) {
            console.error('加载PDF失败:', error);
            this.showError('PDF加载失败: ' + error.message);
        }
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    async generateThumbnail(filePath) {
        try {
            // 使用canvas绘制一个简单的PDF图标作为缩略图
            const canvas = document.getElementById('pdfCanvas');
            if (!canvas) return;

            const ctx = canvas.getContext('2d');

            // 绘制PDF图标背景
            ctx.fillStyle = '#ff4757';
            ctx.fillRect(0, 0, 300, 400);

            // 绘制文档图标
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(40, 60, 220, 280);

            // 绘制折角
            ctx.fillStyle = '#ff4757';
            ctx.beginPath();
            ctx.moveTo(220, 60);
            ctx.lineTo(260, 100);
            ctx.lineTo(220, 100);
            ctx.closePath();
            ctx.fill();

            // 绘制PDF文本
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 36px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('PDF', 150, 40);

            // 绘制文档线条
            ctx.fillStyle = '#ddd';
            for (let i = 0; i < 8; i++) {
                ctx.fillRect(60, 120 + i * 25, 180, 3);
            }

        } catch (error) {
            console.error('生成缩略图失败:', error);
        }
    }

    async createNewWindow(filePath) {
        try {
            await window.jmf.openPDFInNewWindow(filePath);
        } catch (error) {
            console.error('打开新窗口失败:', error);
            this.showNotification('无法打开新窗口，请尝试用默认程序打开', 'error');
        }
    }

    showNotification(message, type = 'info') {
        // 重用settings-manager的通知系统
        if (window.settingsManager) {
            window.settingsManager.showNotification(message, type);
        } else {
            alert(message);
        }
    }

    showPlaceholder() {
        this.container.innerHTML = `
            <div class="pdf-placeholder">
                <span>📄</span>
                <p>请选择PDF文件进行预览</p>
            </div>
        `;
        this.updateControls();
    }

    showLoading() {
        this.container.innerHTML = `
            <div class="pdf-placeholder">
                <span>⏳</span>
                <p>正在加载PDF...</p>
            </div>
        `;
    }

    showError(message) {
        this.container.innerHTML = `
            <div class="pdf-placeholder">
                <span>❌</span>
                <p>${message}</p>
            </div>
        `;
    }

    prevPage() {
        if (this.currentPage > 1) {
            this.currentPage--;
            this.updatePageInfo();
        }
    }

    nextPage() {
        if (this.currentPage < this.totalPages) {
            this.currentPage++;
            this.updatePageInfo();
        }
    }

    zoomIn() {
        this.zoomLevel = Math.min(this.zoomLevel + 0.25, 3.0);
        this.updateZoom();
    }

    zoomOut() {
        this.zoomLevel = Math.max(this.zoomLevel - 0.25, 0.5);
        this.updateZoom();
    }

    updateControls() {
        const hasFile = !!this.currentFile;
        this.prevBtn.disabled = !hasFile || this.currentPage <= 1;
        this.nextBtn.disabled = !hasFile || this.currentPage >= this.totalPages;
        this.zoomOutBtn.disabled = !hasFile;
        this.zoomInBtn.disabled = !hasFile;
        this.updatePageInfo();
        this.updateZoomInfo();
    }

    updatePageInfo() {
        this.pageInfo.textContent = `页 ${this.currentPage} / ${this.totalPages}`;
    }

    updateZoomInfo() {
        this.zoomLevelSpan.textContent = `${Math.round(this.zoomLevel * 100)}%`;
    }

    updateZoom() {
        const iframe = this.container.querySelector('iframe');
        if (iframe) {
            iframe.style.transform = `scale(${this.zoomLevel})`;
            iframe.style.transformOrigin = 'top left';
        }
        this.updateZoomInfo();
    }
}

// 全局实例
window.pdfViewer = new PDFViewer();
