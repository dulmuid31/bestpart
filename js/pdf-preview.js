/**
 * EXCEL TO PDF PWA — PDF PREVIEW CONTROLLER
 */

const PDFPreview = {
  pdfDoc: null,
  currentPage: 1,
  totalPages: 0,
  currentScale: 1.0,
  currentBlobUrl: null,
  currentFileKey: null,

  init() {
    if (typeof pdfjsLib !== 'undefined') {
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdfjs/pdf.worker.min.js';
    }
  },

  async openPreview(fileKey, title = 'Pratinjau PDF') {
    try {
      this.currentFileKey = fileKey;
      
      StorageManager.acquireLease(fileKey);

      const pdfBlob = await StorageManager.getPDF(fileKey);
      
      if (this.currentBlobUrl) {
        URL.revokeObjectURL(this.currentBlobUrl);
      }
      this.currentBlobUrl = URL.createObjectURL(pdfBlob);

      const loadingTask = pdfjsLib.getDocument(this.currentBlobUrl);
      this.pdfDoc = await loadingTask.promise;
      this.totalPages = this.pdfDoc.numPages;
      this.currentPage = 1;
      this.currentScale = 1.0;

      document.getElementById('modal-preview-title').textContent = title;
      document.getElementById('preview-page-count').textContent = `Halaman 1 dari ${this.totalPages}`;
      
      const modal = document.getElementById('modal-preview');
      modal.classList.add('active');
      modal.setAttribute('aria-hidden', 'false');

      await this.renderPage(this.currentPage);
      this.setupTouchGestures();

    } catch (err) {
      alert(`Gagal memuat pratinjau PDF: ${err.message}`);
      this.closePreview();
    }
  },

  async renderPage(pageNum) {
    if (!this.pdfDoc) return;

    const page = await this.pdfDoc.getPage(pageNum);
    const canvas = document.getElementById('pdf-canvas');
    const ctx = canvas.getContext('2d');

    const viewport = page.getViewport({ scale: this.currentScale });
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    const renderContext = {
      canvasContext: ctx,
      viewport: viewport
    };

    await page.render(renderContext).promise;
    document.getElementById('preview-page-count').textContent = `Halaman ${pageNum} dari ${this.totalPages}`;
  },

  async nextPage() {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      await this.renderPage(this.currentPage);
    }
  },

  async prevPage() {
    if (this.currentPage > 1) {
      this.currentPage--;
      await this.renderPage(this.currentPage);
    }
  },

  async zoomIn() {
    this.currentScale += 0.2;
    await this.renderPage(this.currentPage);
  },

  async zoomOut() {
    if (this.currentScale > 0.6) {
      this.currentScale -= 0.2;
      await this.renderPage(this.currentPage);
    }
  },

  setupTouchGestures() {
    const canvas = document.getElementById('pdf-canvas');
    let startX = 0;

    canvas.ontouchstart = (e) => {
      startX = e.touches[0].clientX;
    };

    canvas.ontouchend = (e) => {
      const endX = e.changedTouches[0].clientX;
      const diffX = startX - endX;

      if (Math.abs(diffX) > 50) {
        if (diffX > 0) {
          this.nextPage();
        } else {
          this.prevPage();
        }
      }
    };
  },

  closePreview() {
    const modal = document.getElementById('modal-preview');
    if (modal) {
      modal.classList.remove('active');
      modal.setAttribute('aria-hidden', 'true');
    }

    if (this.currentBlobUrl) {
      URL.revokeObjectURL(this.currentBlobUrl);
      this.currentBlobUrl = null;
    }

    if (this.currentFileKey) {
      StorageManager.releaseLease(this.currentFileKey);
      this.currentFileKey = null;
    }

    this.pdfDoc = null;
  }
};