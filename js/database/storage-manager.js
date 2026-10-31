/**
 * EXCEL TO PDF PWA — STORAGE MANAGER
 */

const StorageManager = {
  activeLeases: new Set(),
  dbName: 'ExcelToPdfDB',
  dbVersion: 1,
  dbInstance: null,

  async init() {
    return new Promise((resolve) => {
      if (!window.indexedDB) {
        console.warn('[Storage] IndexedDB tidak didukung di browser ini.');
        return resolve(false);
      }

      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('temp_pdfs')) {
          db.createObjectStore('temp_pdfs', { keyPath: 'fileKey' });
        }
        if (!db.objectStoreNames.contains('history')) {
          const historyStore = db.createObjectStore('history', { keyPath: 'id', autoIncrement: true });
          historyStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };

      request.onsuccess = (e) => {
        this.dbInstance = e.target.result;
        console.log('[Storage] IndexedDB Fallback Initialized.');
        resolve(true);
      };

      request.onerror = (e) => {
        console.error('[Storage] IndexedDB Error:', e.target.error);
        resolve(false);
      };
    });
  },

  async savePDF(fileKey, pdfData) {
    const isOPFSSupported = typeof navigator.storage?.getDirectory === 'function';

    try {
      if (isOPFSSupported) {
        const root = await navigator.storage.getDirectory();
        const fileHandle = await root.getFileHandle(fileKey, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(pdfData);
        await writable.close();
        console.log(`[OPFS] Berhasil menyimpan: ${fileKey}`);
        return { storageType: 'OPFS', fileKey };
      }
    } catch (opfsErr) {
      console.warn('[OPFS Failed] Fallback ke IndexedDB:', opfsErr.message);
    }

    return new Promise((resolve, reject) => {
      if (!this.dbInstance) return reject(new Error('Penyimpanan tidak tersedia.'));

      const tx = this.dbInstance.transaction('temp_pdfs', 'readwrite');
      const store = tx.objectStore('temp_pdfs');
      
      const record = {
        fileKey,
        blobData: new Blob([pdfData], { type: 'application/pdf' }),
        createdAt: Date.now()
      };

      const request = store.put(record);
      request.onsuccess = () => resolve({ storageType: 'INDEXEDDB', fileKey });
      request.onerror = (e) => reject(new Error(`Gagal menyimpan ke IndexedDB: ${e.target.error}`));
    });
  },

  async getPDF(fileKey) {
    const isOPFSSupported = typeof navigator.storage?.getDirectory === 'function';

    if (isOPFSSupported) {
      try {
        const root = await navigator.storage.getDirectory();
        const fileHandle = await root.getFileHandle(fileKey);
        const file = await fileHandle.getFile();
        return file;
      } catch (e) {}
    }

    return new Promise((resolve, reject) => {
      if (!this.dbInstance) return reject(new Error('IndexedDB tidak aktif.'));

      const tx = this.dbInstance.transaction('temp_pdfs', 'readonly');
      const store = tx.objectStore('temp_pdfs');
      const request = store.get(fileKey);

      request.onsuccess = (e) => {
        const result = e.target.result;
        if (result && result.blobData) {
          resolve(result.blobData);
        } else {
          reject(new Error(`File ${fileKey} tidak ditemukan di storage.`));
        }
      };

      request.onerror = () => reject(new Error('Gagal membaca dari IndexedDB.'));
    });
  },

  acquireLease(fileKey) {
    this.activeLeases.add(fileKey);
  },

  releaseLease(fileKey) {
    this.activeLeases.delete(fileKey);
  },

  isLeased(fileKey) {
    return this.activeLeases.has(fileKey);
  },

  async clearTempFiles() {
    let deletedCount = 0;
    let skippedCount = 0;

    if (typeof navigator.storage?.getDirectory === 'function') {
      try {
        const root = await navigator.storage.getDirectory();
        for await (const [name, handle] of root.entries()) {
          if (handle.kind === 'file') {
            if (this.isLeased(name)) {
              skippedCount++;
              continue;
            }
            await root.removeEntry(name);
            deletedCount++;
          }
        }
      } catch (e) {
        console.warn('[OPFS Clean Warning]:', e.message);
      }
    }

    if (this.dbInstance) {
      const tx = this.dbInstance.transaction('temp_pdfs', 'readwrite');
      const store = tx.objectStore('temp_pdfs');
      const getAllKeysReq = store.getAllKeys();

      getAllKeysReq.onsuccess = () => {
        const keys = getAllKeysReq.result;
        keys.forEach((key) => {
          if (!this.isLeased(key)) {
            store.delete(key);
            deletedCount++;
          } else {
            skippedCount++;
          }
        });
      };
    }

    return { deletedCount, skippedCount };
  },

  async getStorageEstimate() {
    if (navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      const usedMB = (estimate.usage / (1024 * 1024)).toFixed(1);
      const quotaGB = (estimate.quota / (1024 * 1024 * 1024)).toFixed(1);
      const percent = Math.round((estimate.usage / estimate.quota) * 100);

      return { usedMB, quotaGB, percent };
    }
    return { usedMB: '--', quotaGB: '--', percent: 0 };
  }
};