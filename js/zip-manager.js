/**
 * EXCEL TO PDF PWA — ZIP MANAGER
 */

const ZipManager = {
  async createAndDownloadZIP(filesList, zipName = 'Hasil_Konversi_PDF.zip') {
    if (typeof JSZip === 'undefined') {
      throw new Error('Librari JSZip (jszip.min.js) belum dimuat.');
    }

    if (!filesList || filesList.length === 0) {
      throw new Error('Tidak ada file PDF untuk dikemas ke ZIP.');
    }

    const zip = new JSZip();

    try {
      filesList.forEach(item => StorageManager.acquireLease(item.fileKey));

      for (const item of filesList) {
        const pdfBlob = await StorageManager.getPDF(item.fileKey);
        const arrayBuffer = await pdfBlob.arrayBuffer();
        zip.file(item.fileName, arrayBuffer);
      }

      const zipContent = await zip.generateAsync({ type: 'blob' });

      const downloadUrl = URL.createObjectURL(zipContent);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = zipName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setTimeout(() => URL.revokeObjectURL(downloadUrl), 10000);

    } catch (err) {
      throw new Error(`Gagal membuat paket ZIP: ${err.message}`);
    } finally {
      filesList.forEach(item => StorageManager.releaseLease(item.fileKey));
    }
  }
};