/**
 * EXCEL TO PDF PWA — WORKBOOK MANAGER
 */

const WorkbookManager = {
  inspectWorkbook(arrayBuffer, extension) {
    if (typeof XLSX === 'undefined') {
      throw new Error('Librari SheetJS (xlsx.full.min.js) belum dimuat.');
    }

    const readOptions = {
      type: 'array',
      bookSheets: true,
      bookProps: true,
      cellStyles: false,
      cellFormulas: true
    };

    const workbook = XLSX.read(arrayBuffer, readOptions);
    const sheetNames = workbook.SheetNames || [];
    
    let totalCells = 0;
    let totalFormulas = 0;
    let totalImages = 0;
    const worksheetsInfo = [];

    sheetNames.forEach((name, index) => {
      const sheet = workbook.Sheets[name];
      const visibility = workbook.Workbook?.Sheets?.[index]?.Hidden || 0;

      let cellCount = 0;
      let formulaCount = 0;
      let isEmpty = true;

      if (sheet && sheet['!ref']) {
        isEmpty = false;
        const range = XLSX.utils.decode_range(sheet['!ref']);
        cellCount = (range.e.r - range.s.r + 1) * (range.e.c - range.s.c + 1);

        Object.keys(sheet).forEach(cellKey => {
          if (cellKey[0] !== '!' && sheet[cellKey].f) {
            formulaCount++;
          }
        });
      }

      let imageCountInSheet = 0;
      if (extension === 'xlsx' || extension === 'xlsm') {
        if (sheet['!images']) imageCountInSheet += sheet['!images'].length;
        if (sheet['!drawings']) imageCountInSheet += sheet['!drawings'].length;
      }

      totalCells += cellCount;
      totalFormulas += formulaCount;
      totalImages += imageCountInSheet;

      worksheetsInfo.push({
        sheetId: `sheet_${index}`,
        sheetIndex: index,
        name: name,
        visibility: visibility,
        isEmpty: isEmpty,
        cellCount: cellCount,
        formulaCount: formulaCount,
        selected: visibility === 0 && !isEmpty
      });
    });

    const sizeInMB = arrayBuffer.byteLength / (1024 * 1024);
    const workloadScore = this.calculateWorkloadIndex({
      sizeMB: sizeInMB,
      cellCount: totalCells,
      formulaCount: totalFormulas,
      imageCount: totalImages,
      sheetCount: sheetNames.length
    });

    return {
      sheetCount: sheetNames.length,
      totalCells,
      totalFormulas,
      totalImages,
      workloadScore: workloadScore.score,
      workloadLevel: workloadScore.level,
      worksheets: worksheetsInfo
    };
  },

  calculateWorkloadIndex({ sizeMB, cellCount, formulaCount, imageCount, sheetCount }) {
    const W_size = 1.5;
    const W_cell = 0.0001;
    const W_form = 0.0003;
    const W_img = 2.0;
    const W_sheet = 1.0;

    const score = (W_size * sizeMB) + 
                  (W_cell * cellCount) + 
                  (W_form * formulaCount) + 
                  (W_img * imageCount) + 
                  (W_sheet * sheetCount);

    let level = 'LOW';
    if (score >= 15 && score <= 30) {
      level = 'MEDIUM';
    } else if (score > 30) {
      level = 'HIGH';
    }

    return {
      score: parseFloat(score.toFixed(2)),
      level: level
    };
  }
};