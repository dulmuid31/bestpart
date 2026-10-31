/**
 * EXCEL TO PDF PWA — PDF STITCHER
 */

const PDFStitcher = {
  async mergePDFs(pdfBuffersList) {
    if (typeof PDFLib === 'undefined') {
      throw new Error('Librari pdf-lib (pdf-lib.min.js) belum dimuat.');
    }

    if (!pdfBuffersList || pdfBuffersList.length === 0) {
      throw new Error('Tidak ada buffer PDF yang diberikan untuk digabungkan.');
    }

    if (pdfBuffersList.length === 1) {
      return new Uint8Array(pdfBuffersList[0]);
    }

    try {
      const mergedPdfDoc = await PDFLib.PDFDocument.create();

      for (const buffer of pdfBuffersList) {
        const srcPdfDoc = await PDFLib.PDFDocument.load(buffer, { ignoreEncryption: true });
        const copiedPages = await mergedPdfDoc.copyPages(
          srcPdfDoc, 
          srcPdfDoc.getPageIndices()
        );

        copiedPages.forEach((page) => mergedPdfDoc.addPage(page));
      }

      const mergedPdfBytes = await mergedPdfDoc.save();
      return mergedPdfBytes;

    } catch (err) {
      throw new Error(`Gagal menggabungkan dokumen PDF via pdf-lib: ${err.message}`);
    }
  }
};