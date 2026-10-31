/**
 * EXCEL TO PDF PWA — FILE MANAGER
 */

const FileManager = {
  MAGIC_BYTES: {
    ZIP: [0x50, 0x4B, 0x03, 0x04],
    OLE2: [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]
  },

  rawFilesStore: new Map(),

  async processBatchFiles(filesList) {
    const validatedFiles = [];
    const filesArray = Array.from(filesList);

    for (const file of filesArray) {
      try {
        const fileId = `file_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        
        const ext = file.name.split('.').pop().toLowerCase();
        if (!['xlsx', 'xls', 'xlsm'].includes(ext)) {
          throw new Error(`Format .${ext} tidak didukung. Gunakan .xlsx, .xls, atau .xlsm.`);
        }

        const isHeaderValid = await this.verifyMagicBytes(file, ext);
        if (!isHeaderValid) {
          throw new Error(`Header biner file rusak atau tidak sesuai dengan format .${ext}.`);
        }

        this.rawFilesStore.set(fileId, file);

        validatedFiles.push({
          fileId,
          name: file.name,
          size: file.size,
          extension: ext,
          fileRef: file,
          status: 'VALIDATED'
        });

      } catch (err) {
        validatedFiles.push({
          name: file.name,
          size: file.size,
          status: 'INVALID',
          errorMessage: err.message
        });
      }
    }

    return validatedFiles;
  },

  verifyMagicBytes(file, ext) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      const blobSlice = file.slice(0, 8);

      reader.onload = (e) => {
        if (!e.target.result) return resolve(false);
        const bytes = new Uint8Array(e.target.result);

        if (ext === 'xlsx' || ext === 'xlsm') {
          const isZip = this.MAGIC_BYTES.ZIP.every((val, index) => bytes[index] === val);
          resolve(isZip);
        } else if (ext === 'xls') {
          const isOle2 = this.MAGIC_BYTES.OLE2.every((val, index) => bytes[index] === val);
          resolve(isOle2);
        } else {
          resolve(false);
        }
      };

      reader.onerror = () => resolve(false);
      reader.readAsArrayBuffer(blobSlice);
    });
  },

  async getFreshArrayBuffer(fileId) {
    const file = this.rawFilesStore.get(fileId);
    if (!file) throw new Error('File sumber tidak ditemukan di memori lokal.');
    return await file.arrayBuffer();
  },

  removeFileFromStore(fileId) {
    this.rawFilesStore.delete(fileId);
  }
};