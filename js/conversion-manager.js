/**
 * EXCEL TO PDF PWA — CONVERSION MANAGER
 */

const ConversionManager = {
  activeWorker: null,
  isProcessingBatch: false,
  currentJobId: null,

  async processBatchQueue(batchQueue, onProgressCallback, onItemCompleteCallback) {
    if (this.isProcessingBatch) return;
    this.isProcessingBatch = true;

    for (const [fileId, item] of batchQueue.entries()) {
      if (item.status === 'SUCCESS' || item.status === 'CANCELLED') continue;

      this.currentJobId = fileId;
      item.status = 'PROCESSING';
      
      try {
        onProgressCallback(fileId, {
          status: 'PROCESSING',
          stageText: 'Mengambil buffer file sumber...',
          percent: 0
        });

        const freshBuffer = await FileManager.getFreshArrayBuffer(fileId);

        const resultPDFs = await this.executeModeConversion(
          fileId,
          freshBuffer,
          item,
          onProgressCallback
        );

        item.status = 'SUCCESS';
        item.results = resultPDFs;

        onItemCompleteCallback(fileId, 'SUCCESS', item);

      } catch (err) {
        if (item.status === 'CANCELLED') {
          onItemCompleteCallback(fileId, 'CANCELLED', item);
        } else {
          item.status = 'FAILED';
          item.errorMessage = err.message;
          onItemCompleteCallback(fileId, 'FAILED', item);
        }
      } finally {
        this.terminateActiveWorker();
        this.currentJobId = null;
      }
    }

    this.isProcessingBatch = false;
  },

  async executeModeConversion(fileId, buffer, item, onProgressCallback) {
    const { mode, metadata, name } = item;
    const baseName = name.substring(0, name.lastIndexOf('.'));
    
    let targetSheets = [];
    if (mode === 'mode1') {
      targetSheets = metadata.worksheets.filter(s => !s.isEmpty);
    } else if (mode === 'mode2' || mode === 'mode3') {
      targetSheets = metadata.worksheets.filter(s => s.selected && !s.isEmpty);
    }

    if (targetSheets.length === 0) {
      throw new Error('Tidak ada worksheet valid yang dipilih untuk dikonversi.');
    }

    const compiledPDFBuffers = [];

    for (let i = 0; i < targetSheets.length; i++) {
      const sheet = targetSheets[i];
      
      if (item.status === 'CANCELLED') {
        throw new Error('Pekerjaan dihentikan atas permintaan pengguna.');
      }

      onProgressCallback(fileId, {
        status: 'PROCESSING',
        stageText: `Mengonversi Sheet ${i + 1}/${targetSheets.length}: "${sheet.name}"...`,
        percent: Math.round(((i + 1) / targetSheets.length) * 80)
      });

      const pdfBuffer = await this.invokeWorkerConversion(buffer, name, sheet.sheetIndex);
      compiledPDFBuffers.push(pdfBuffer);
    }

    onProgressCallback(fileId, {
      status: 'PROCESSING',
      stageText: 'Menyusun dokumen PDF final...',
      percent: 90
    });

    if (mode === 'mode1' || mode === 'mode2') {
      const mergedBytes = await PDFStitcher.mergePDFs(compiledPDFBuffers);
      return [{
        fileName: `${baseName}.pdf`,
        pdfBuffer: mergedBytes.buffer
      }];
    } else {
      return compiledPDFBuffers.map((buf, idx) => ({
        fileName: `${baseName}_${targetSheets[idx].name}.pdf`,
        pdfBuffer: buf
      }));
    }
  },

  invokeWorkerConversion(inputBuffer, fileName, sheetIndex) {
    return new Promise((resolve, reject) => {
      this.terminateActiveWorker();
      this.activeWorker = new Worker('workers/conversion-worker.js');

      this.activeWorker.onmessage = (e) => {
        const { type, payload, error } = e.data;

        if (type === 'ENGINE_READY') {
          this.activeWorker.postMessage({
            type: 'TEST_CONVERT',
            payload: {
              inputBuffer: inputBuffer.slice(0),
              fileName,
              sheetIndex
            }
          });
        } else if (type === 'CONVERT_SUCCESS') {
          resolve(payload.pdfBuffer);
        } else if (type === 'CONVERT_ERROR' || type === 'ENGINE_ERROR') {
          reject(new Error(error || 'Terjadi kesalahan pada mesin WASM Worker.'));
        }
      };

      this.activeWorker.onerror = (err) => {
        reject(new Error(`Worker execution error: ${err.message}`));
      };

      this.activeWorker.postMessage({ type: 'INIT_ENGINE' });
    });
  },

  cancelJob(fileId, batchQueue) {
    const item = batchQueue.get(fileId);
    if (item) {
      item.status = 'CANCELLED';
    }

    if (this.currentJobId === fileId) {
      this.terminateActiveWorker();
      this.isProcessingBatch = false;
      this.currentJobId = null;
    }
  },

  terminateActiveWorker() {
    if (this.activeWorker) {
      this.activeWorker.terminate();
      this.activeWorker = null;
    }
  }
};