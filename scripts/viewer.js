// PDF预览器 - 最终修复版
class PDFViewerApp {
    constructor() {
        this.currentPdf = null;
        this.currentPage = 1;
        this.totalPages = 0;
        this.scale = 1.2;
        this.pdfFiles = [];
        this.selectedFile = null;

        this.initElements();
        this.initEventListeners();
        this.loadPDFList();
    }

    initElements() {
        this.pdfList = document.getElementById('pdfList');
        this.pdfViewerArea = document.getElementById('pdfViewerArea');
        this.prevPageBtn = document.getElementById('prevPage');
        this.nextPageBtn = document.getElementById('nextPage');
        this.pageNumInput = document.getElementById('pageNum');
        this.totalPagesSpan = document.getElementById('totalPages');
        this.zoomOutBtn = document.getElementById('zoomOut');
        this.zoomInBtn = document.getElementById('zoomIn');
        this.zoomLevelSpan = document.getElementById('zoomLevel');
        this.fitWidthBtn = document.getElementById('fitWidth');
        this.fitPageBtn = document.getElementById('fitPage');
        this.openExternalBtn = document.getElementById('openExternal');
    }

    initEventListeners() {
        this.prevPageBtn.addEventListener('click', () => this.previousPage());
        this.nextPageBtn.addEventListener('click', () => this.nextPage());
        this.pageNumInput.addEventListener('change', () => this.goToPage());
        this.zoomOutBtn.addEventListener('click', () => this.zoomOut());
        this.zoomInBtn.addEventListener('click', () => this.zoomIn());
        this.fitWidthBtn.addEventListener('click', () => this.fitToWidth());
        this.fitPageBtn.addEventListener('click', () => this.fitToPage());
        this.openExternalBtn.addEventListener('click', () => this.openInExternal());

        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT') return;
            switch (e.key) {
                case 'ArrowLeft': this.previousPage(); break;
                case 'ArrowRight': this.nextPage(); break;
                case '=': case '+': this.zoomIn(); break;
                case '-': this.zoomOut(); break;
            }
        });

        // 监听字体变更事件
        if (window.jmf?.onFontChange) {
            window.jmf.onFontChange((useCustomFont) => {
                console.log('收到字体变更:', useCustomFont ? '预设字体' : '系统字体');
                document.body.classList.toggle('use-system-font', !useCustomFont);
            });
        }

        // 从本地存储应用字体设置
        this.applyInitialFontSetting();
    }

    async loadPDFList() {
        try {
            this.showLoading('正在加载PDF文件列表...');
            const files = await window.jmf?.getPDFList?.() || [];
            this.pdfFiles = files;
            this.renderPDFList();
            this.hideLoading();

            if (files.length === 0) {
                this.showPlaceholder('没有找到PDF文件', '请先下载一些内容，然后重新打开预览器');
            } else {
                // 自动选择第一个文件
                const firstItem = this.pdfList.querySelector('.pdf-item');
                if (firstItem) {
                    firstItem.click();
                }
            }
        } catch (error) {
            console.error('加载PDF列表失败:', error);
            this.hideLoading();
            this.showPlaceholder('加载失败', '无法获取PDF文件列表');
        }
    }

    renderPDFList() {
        this.pdfList.innerHTML = '';
        if (this.pdfFiles.length === 0) {
            this.pdfList.innerHTML = `<div class="empty-list"><p>暂无PDF文件</p></div>`;
            return;
        }

        this.pdfFiles.forEach(file => {
            const item = document.createElement('div');
            item.className = 'pdf-item';
            item.dataset.filePath = file.path;

            const createdDate = new Date(file.created).toLocaleDateString('zh-CN');
            const fileSize = this.formatFileSize(file.size);

            item.innerHTML = `
                <div class="pdf-item-name">${file.name}</div>
                <div class="pdf-item-info">${fileSize} • ${createdDate}</div>
            `;

            item.addEventListener('click', () => this.selectPDF(file, item));
            this.pdfList.appendChild(item);
        });
    }

    async selectPDF(file, itemElement) {
        document.querySelectorAll('.pdf-item.active').forEach(item => item.classList.remove('active'));
        itemElement.classList.add('active');

        this.selectedFile = file;
        this.showLoading('正在加载PDF文件...');

        try {
            await this.loadPDF(file.path);
        } catch (error) {
            console.error('加载PDF失败:', error);
            this.showPlaceholder('加载失败', `无法打开文件: ${error.message}`);
        }
    }

    async loadPDF(filePath) {
        try {
            await this.ensurePDFJSLib();

            // 修正文件路径格式
            let fileUrl = filePath.replace(/\\/g, '/');
            if (!fileUrl.startsWith('file:///')) {
                fileUrl = 'file:///' + fileUrl;
            }

            console.log('尝试加载PDF:', fileUrl);

            // 请求主进程读取文件内容
            const arrayBuffer = await this.requestFileData(filePath);
            console.log('PDF文件数据已加载，大小:', arrayBuffer.byteLength);

            // 直接从ArrayBuffer加载PDF，避免文件URL加载问题
            const loadingTask = pdfjsLib.getDocument({
                data: arrayBuffer,
                cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
                cMapPacked: true
            });

            this.currentPdf = await loadingTask.promise;
            this.totalPages = this.currentPdf.numPages;
            this.currentPage = 1; console.log(`PDF加载成功，共${this.totalPages}页`);
            this.updateUI();
            await this.renderPage(1);
            this.hideLoading();
        } catch (error) {
            console.error('PDF加载错误:', error);
            this.hideLoading();
            this.showPlaceholder('无法加载PDF', `错误: ${error.message}`);
        }
    }

    async ensurePDFJSLib() {
        if (typeof pdfjsLib !== 'undefined') return;
        return new Promise((resolve, reject) => {
            // 直接从CDN加载PDF.js，避免本地路径问题
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
            script.onload = () => {
                // 设置worker路径
                window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                console.log('PDF.js 库从CDN加载成功');
                resolve();
            };
            script.onerror = (err) => {
                console.error('PDF.js 库加载失败:', err);
                reject(new Error('无法加载PDF.js库'));
            };
            document.head.appendChild(script);
        });
    }

    async renderPage(pageNumber) {
        if (!this.currentPdf) return;

        try {
            console.log(`开始渲染第${pageNumber}页`);
            const page = await this.currentPdf.getPage(pageNumber);
            const viewport = page.getViewport({ scale: this.scale });

            const canvas = document.createElement('canvas');
            canvas.id = 'pdf-canvas';
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            this.pdfViewerArea.innerHTML = `<div class="pdf-canvas-container"></div>`;
            this.pdfViewerArea.querySelector('.pdf-canvas-container').appendChild(canvas);

            const renderContext = {
                canvasContext: context,
                viewport: viewport,
                renderInteractiveForms: true
            };

            await page.render(renderContext).promise;
            console.log(`第${pageNumber}页渲染完成`);
            this.currentPage = pageNumber;
            this.updateUI();
        } catch (error) {
            console.error(`渲染第${pageNumber}页时出错:`, error);
            this.pdfViewerArea.innerHTML = `<div class="error-message">渲染PDF页面失败: ${error.message}</div>`;
        }
    }

    updateUI() {
        this.pageNumInput.value = this.currentPage;
        this.pageNumInput.max = this.totalPages;
        this.totalPagesSpan.textContent = this.totalPages;
        this.zoomLevelSpan.textContent = `${Math.round(this.scale * 100)}%`;

        const hasFile = !!this.currentPdf;
        this.prevPageBtn.disabled = !hasFile || this.currentPage <= 1;
        this.nextPageBtn.disabled = !hasFile || this.currentPage >= this.totalPages;
        this.openExternalBtn.disabled = !this.selectedFile;
        this.zoomInBtn.disabled = !hasFile;
        this.zoomOutBtn.disabled = !hasFile;
        this.fitWidthBtn.disabled = !hasFile;
        this.fitPageBtn.disabled = !hasFile;
        this.pageNumInput.disabled = !hasFile;
    }

    previousPage() { if (this.currentPage > 1) this.renderPage(this.currentPage - 1); }
    nextPage() { if (this.currentPage < this.totalPages) this.renderPage(this.currentPage + 1); }
    goToPage() {
        const pageNum = parseInt(this.pageNumInput.value);
        if (pageNum >= 1 && pageNum <= this.totalPages) this.renderPage(pageNum);
        else this.pageNumInput.value = this.currentPage;
    }
    zoomIn() { if (this.currentPdf) { this.scale *= 1.25; this.renderPage(this.currentPage); } }
    zoomOut() { if (this.currentPdf) { this.scale /= 1.25; this.renderPage(this.currentPage); } }

    fitTo(mode) {
        if (!this.currentPdf) return;
        const containerWidth = this.pdfViewerArea.clientWidth - 40;
        const containerHeight = this.pdfViewerArea.clientHeight - 40;
        this.currentPdf.getPage(this.currentPage).then(page => {
            const viewport = page.getViewport({ scale: 1 });
            if (mode === 'width') {
                this.scale = containerWidth / viewport.width;
            } else { // page
                this.scale = Math.min(containerWidth / viewport.width, containerHeight / viewport.height);
            }
            this.renderPage(this.currentPage);
        });
    }
    fitToWidth() { this.fitTo('width'); }
    fitToPage() { this.fitTo('page'); }

    async openInExternal() {
        if (this.selectedFile) window.jmf?.openPDFExternal?.(this.selectedFile.path);
    }

    // 从主进程请求读取文件数据
    async requestFileData(filePath) {
        if (!window.jmf?.readPDFFile) {
            throw new Error('PDF文件读取API不可用');
        }
        try {
            return await window.jmf.readPDFFile(filePath);
        } catch (error) {
            console.error('读取PDF文件失败:', error);
            throw new Error(`读取PDF文件失败: ${error.message}`);
        }
    }

    showLoading(message) {
        this.pdfViewerArea.innerHTML = `<div class="loading"><div class="loading-spinner"></div><div class="loading-title">${message}</div></div>`;
    }
    hideLoading() {
        const loading = this.pdfViewerArea.querySelector('.loading');
        if (loading) loading.remove();
    }
    showPlaceholder(title, subtitle) {
        this.pdfViewerArea.innerHTML = `<div class="placeholder"><div class="placeholder-icon">📄</div><div class="placeholder-title">${title}</div><div class="placeholder-subtitle">${subtitle}</div></div>`;
        this.currentPdf = null;
        this.updateUI();
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
    }

    applyInitialFontSetting() {
        try {
            // 尝试从本地存储获取字体设置
            const useCustomFont = localStorage.getItem('useCustomFont') !== 'false'; // 默认使用预设字体
            console.log('应用初始字体设置:', useCustomFont ? '预设字体' : '系统字体');
            document.body.classList.toggle('use-system-font', !useCustomFont);
        } catch (error) {
            console.warn('无法应用字体设置:', error);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.pdfViewerApp = new PDFViewerApp();
});