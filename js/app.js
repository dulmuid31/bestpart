/**
 * EXCEL TO PDF PWA — APP MAIN ORCHESTRATOR
 */

const AppController = {
  batchQueue: new Map(),

  init() {
    this.setupNavigation();
    this.setupModals();
    this.setupFileInputs();
    this.setupBatchExecution();
    this.runStartupDiagnostics();
    this.registerServiceWorker();
    
    StorageManager.init().then(() => this.updateStorageInfoUI());
    PDFPreview.init();
  },

  setupNavigation() {
    const tabs = document.querySelectorAll('.nav-tab');
    const panels = document.querySelectorAll('.tab-panel');

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const targetId = tab.getAttribute('data-tab');

        tabs.forEach(t => {
          t.classList.remove('active');
          t.setAttribute('aria-selected', 'false');
        });
        tab.classList.add('active');
        tab.setAttribute('aria-selected', 'true');

        panels.forEach(panel => {
          if (panel.id === targetId) {
            panel.removeAttribute('hidden');
            panel.classList.add('active');
          } else {
            panel.setAttribute('hidden', '');
            panel.classList.remove('active');
          }
        });

        if (targetId === 'tab-history') {
          this.updateStorageInfoUI();
        }
      });
    });
  },

  setupModals() {
    const diagBtn = document.getElementById('btn-header-diag');
    const modalDiag = document.getElementById('modal-diag');
    const closeBtns = document.querySelectorAll('.modal-close');
    const btnClearStorage = document.getElementById('btn-clear-storage');

    if (diagBtn && modalDiag) {
      diagBtn.addEventListener('click', () => {
        modalDiag.classList.add('active');
        modalDiag.setAttribute('aria-hidden', 'false');
      });
    }

    if (btnClearStorage) {
      btnClearStorage.addEventListener('click', async () => {
        if (confirm('Apakah Anda yakin ingin membersihkan file sementara di storage?')) {
          const res = await StorageManager.clearTempFiles();
          this.showToast(`Dihapus: ${res.deletedCount} file. Dilindungi: ${res.skippedCount} file.`, 'info');
          this.updateStorageInfoUI();
        }
      });
    }

    closeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.modal-backdrop').forEach(m => {
          m.classList.remove('active');
          m.setAttribute('aria-hidden', 'true');
        });
      });
    });
  },

  setupFileInputs() {
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('file-input');
    const btnBrowse = document.getElementById('btn-browse-file');

    if (btnBrowse && fileInput) {
      btnBrowse.addEventListener('click', (e) => {
        e.stopPropagation();
        fileInput.click();
      });

      dropzone.addEventListener('click', () => fileInput.click());

      ['dragenter', 'dragover'].forEach(name => {
        dropzone.addEventListener(name, (e) => {
          e.preventDefault();
          dropzone.classList.add('dragover');
        });
      });

      ['dragleave', 'drop'].forEach(name => {
        dropzone.addEventListener(name, (e) => {
          e.preventDefault();
          dropzone.classList.remove('dragover');
        });
      });

      dropzone.addEventListener('drop', (e) => {
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          this.handleFileSelection(e.dataTransfer.files);
        }
      });

      fileInput.addEventListener('change', () => {
        if (fileInput.files.length > 0) {
          this.handleFileSelection(fileInput.files);
        }
      });
    }
  },

  async handleFileSelection(files) {
    this.showToast(`Menganalisis ${files.length} file...`, 'info');

    const processedFiles = await FileManager.processBatchFiles(files);

    for (const item of processedFiles) {
      if (item.status === 'INVALID') {
        this.showToast(`[Gagal] ${item.name}: ${item.errorMessage}`, 'danger');
        continue;
      }

      try {
        const buffer = await FileManager.getFreshArrayBuffer(item.fileId);
        const metadata = WorkbookManager.inspectWorkbook(buffer, item.extension);

        const queueItem = {
          ...item,
          metadata,
          mode: 'mode1',
          status: 'PENDING'
        };

        this.batchQueue.set(item.fileId, queueItem);
        this.showToast(`Berhasil menambahkan ${item.name}`, 'success');

      } catch (err) {
        this.showToast(`Gagal membaca struktur ${item.name}: ${err.message}`, 'danger');
        FileManager.removeFileFromStore(item.fileId);
      }
    }

    this.renderQueueUI();
  },

  renderQueueUI() {
    const queueContainer = document.getElementById('queue-container');
    const badgeCount = document.getElementById('queue-count-badge');
    const btnStart = document.getElementById('btn-start-batch');
    const btnZip = document.getElementById('btn-download-zip');
    const configPanel = document.getElementById('config-panel');

    if (!queueContainer) return;

    badgeCount.textContent = `${this.batchQueue.size} File`;

    if (this.batchQueue.size === 0) {
      queueContainer.innerHTML = `<div class="empty-state"><p>Belum ada file dalam antrean.</p></div>`;
      btnStart.disabled = true;
      btnZip.disabled = true;
      configPanel.classList.add('disabled-state');
      return;
    }

    btnStart.disabled = false;
    configPanel.classList.remove('disabled-state');
    queueContainer.innerHTML = '';

    let successCount = 0;
    const zipFilesList = [];

    this.batchQueue.forEach((item, fileId) => {
      if (item.status === 'SUCCESS' && item.results) {
        successCount++;
        item.results.forEach(res => {
          zipFilesList.push({ fileKey: `${fileId}_${res.fileName}`, fileName: res.fileName });
        });
      }

      const card = document.createElement('div');
      card.className = 'card mt-8';
      card.style.padding = '12px';

      const levelBadgeClass = item.metadata.workloadLevel === 'HIGH' 
        ? 'status-danger' 
        : (item.metadata.workloadLevel === 'MEDIUM' ? 'status-warning' : 'status-success');

      let actionButtonsHTML = '';
      if (item.status === 'SUCCESS' && item.results) {
        actionButtonsHTML = `
          <div style="margin-top:8px; display:flex; gap:6px;">
            <button class="btn btn-secondary" style="font-size:12px; padding:4px 8px;" onclick="AppController.previewResult('${fileId}', 0)">👁️ Pratinjau</button>
            <button class="btn btn-primary" style="font-size:12px; padding:4px 8px;" onclick="AppController.downloadResult('${fileId}', 0)">📥 Unduh</button>
          </div>
        `;
      } else if (item.status === 'PROCESSING') {
        actionButtonsHTML = `
          <div style="margin-top:8px;">
            <span id="progress-text-${fileId}" style="font-size:12px; color:var(--color-primary); display:block;">Memproses...</span>
            <button class="btn btn-danger-outline" style="font-size:11px; padding:2px 6px; margin-top:4px;" onclick="AppController.cancelSingleJob('${fileId}')">🛑 Hentikan</button>
          </div>
        `;
      }

      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
          <div style="flex:1;">
            <strong style="font-size:14px; display:block; word-break:break-all;">${item.name}</strong>
            <span style="font-size:12px; color:var(--color-text-muted);">
              ${(item.size / 1024).toFixed(1)} KB | ${item.metadata.sheetCount} Sheet
            </span>
          </div>
          <button class="icon-btn" onclick="AppController.removeQueueItem('${fileId}')" title="Hapus" aria-label="Hapus file">&times;</button>
        </div>

        <div style="margin-top:8px; display:flex; gap:6px; align-items:center;">
          <span class="status-badge ${levelBadgeClass}" style="font-size:11px;">
            Score: ${item.metadata.workloadScore} (${item.metadata.workloadLevel})
          </span>
          <span class="status-badge status-${item.status === 'SUCCESS' ? 'success' : (item.status === 'FAILED' ? 'danger' : 'warning')}" style="font-size:11px;">
            ${item.status}
          </span>
        </div>
        ${actionButtonsHTML}
      `;

      queueContainer.appendChild(card);
    });

    if (zipFilesList.length >= 2) {
      btnZip.disabled = false;
      btnZip.onclick = () => ZipManager.createAndDownloadZIP(zipFilesList);
    } else {
      btnZip.disabled = true;
    }
  },

  setupBatchExecution() {
    const btnStart = document.getElementById('btn-start-batch');

    if (btnStart) {
      btnStart.addEventListener('click', () => {
        if (this.batchQueue.size === 0) return;

        this.showToast('Memulai konversi batch multi-file...', 'info');
        
        ConversionManager.processBatchQueue(
          this.batchQueue,
          (fileId, progressData) => {
            this.updateItemProgressUI(fileId, progressData);
          },
          async (fileId, status, item) => {
            if (status === 'SUCCESS' && item.results) {
              for (const res of item.results) {
                const storageKey = `${fileId}_${res.fileName}`;
                await StorageManager.savePDF(storageKey, res.pdfBuffer);
              }
              this.showToast(`[Selesai] ${item.name}`, 'success');
            } else if (status === 'CANCELLED') {
              this.showToast(`[Dibatalkan] ${item.name}`, 'warning');
            } else {
              this.showToast(`[Gagal] ${item.name}: ${item.errorMessage}`, 'danger');
            }
            this.renderQueueUI();
            this.updateStorageInfoUI();
          }
        );
      });
    }
  },

  updateItemProgressUI(fileId, progress) {
    const progressElem = document.getElementById(`progress-text-${fileId}`);
    if (progressElem) progressElem.textContent = progress.stageText;
  },

  cancelSingleJob(fileId) {
    ConversionManager.cancelJob(fileId, this.batchQueue);
    this.renderQueueUI();
    this.showToast('Pekerjaan dihentikan atas permintaan Anda.', 'warning');
  },

  async previewResult(fileId, index = 0) {
    const item = this.batchQueue.get(fileId);
    if (item && item.results && item.results[index]) {
      const res = item.results[index];
      const storageKey = `${fileId}_${res.fileName}`;
      await PDFPreview.openPreview(storageKey, res.fileName);
    }
  },

  async downloadResult(fileId, index = 0) {
    const item = this.batchQueue.get(fileId);
    if (item && item.results && item.results[index]) {
      const res = item.results[index];
      const storageKey = `${fileId}_${res.fileName}`;
      const pdfBlob = await StorageManager.getPDF(storageKey);
      
      const downloadUrl = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = res.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 10000);
    }
  },

  removeQueueItem(fileId) {
    FileManager.removeFileFromStore(fileId);
    this.batchQueue.delete(fileId);
    this.renderQueueUI();
    this.showToast('File dihapus dari antrean.', 'info');
  },

  async updateStorageInfoUI() {
    const estimate = await StorageManager.getStorageEstimate();
    const usedText = document.getElementById('storage-used-text');
    const quotaText = document.getElementById('storage-quota-text');
    const bar = document.getElementById('storage-bar');

    if (usedText) usedText.textContent = `Penggunaan Aplikasi: ${estimate.usedMB} MB`;
    if (quotaText) quotaText.textContent = `Estimasi Kuota: ${estimate.quotaGB} GB`;
    if (bar) bar.style.width = `${estimate.percent}%`;
  },

  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', async () => {
        try {
          const registration = await navigator.serviceWorker.register('service-worker.js');
          console.log('[ServiceWorker] Terdaftar dengan scope:', registration.scope);
          this.verifyOfflineCacheStatus();
        } catch (err) {
          console.warn('[ServiceWorker] Gagal terdaftar:', err.message);
          this.updateOfflineBadgeUI(false, 'Gagal Terdaftar');
        }
      });
    } else {
      this.updateOfflineBadgeUI(false, 'SW Tidak Didukung');
    }
  },

  async verifyOfflineCacheStatus() {
    if (!('caches' in window)) return;

    try {
      const cache = await caches.open('excel-to-pdf-v1.0.0');
      const wasmResponse = await cache.match('./engine/libreoffice-wasm/soffice.wasm');

      if (wasmResponse) {
        this.updateOfflineBadgeUI(true, 'Siap Offline');
      } else {
        this.updateOfflineBadgeUI(false, 'Mengunduh Engine...');
      }
    } catch (err) {
      this.updateOfflineBadgeUI(false, 'Offline Belum Lengkap');
    }
  },

  updateOfflineBadgeUI(isReady, text) {
    const badge = document.getElementById('sw-status-badge');
    if (!badge) return;

    if (isReady) {
      badge.className = 'status-badge status-success';
      badge.innerHTML = `<span class="status-dot"></span><span class="status-text">${text}</span>`;
    } else {
      badge.className = 'status-badge status-warning';
      badge.innerHTML = `<span class="status-dot"></span><span class="status-text">${text}</span>`;
    }
  },

  runStartupDiagnostics() {
    const tableBody = document.getElementById('diag-table-body');
    if (!tableBody) return;

    const results = [
      { name: 'WebAssembly (WASM)', status: typeof WebAssembly === 'object', tech: 'Core LO WASM' },
      { name: 'Web Worker API', status: typeof Worker !== 'undefined', tech: 'Thread Isolation' },
      { name: 'SharedArrayBuffer', status: typeof SharedArrayBuffer !== 'undefined', tech: 'pthreads Multithreading' },
      { name: 'Cross-Origin Isolation', status: window.crossOriginIsolated === true, tech: 'COOP/COEP Headers' },
      { name: 'Origin Private FS (OPFS)', status: typeof navigator.storage?.getDirectory === 'function', tech: 'Primary Storage' },
      { name: 'IndexedDB Store', status: typeof indexedDB !== 'undefined', tech: 'Fallback Storage' }
    ];

    tableBody.innerHTML = '';
    results.forEach(res => {
      const row = document.createElement('tr');
      const badge = res.status 
        ? '<span class="status-badge status-success">🟢 DIDUKUNG</span>'
        : '<span class="status-badge status-warning">🔴 TIDAK AKTIF</span>';
      row.innerHTML = `<td><strong>${res.name}</strong></td><td>${badge}</td><td>${res.tech}</td>`;
      tableBody.appendChild(row);
    });
  },

  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  }
};