/**
 * EXCEL TO PDF PWA — CONVERSION WORKER
 */

self.importScripts('../engine/libreoffice-wasm/soffice.js');

const WASMEngine = {
  isInitialized: false,
  moduleInstance: null,

  async initEngine() {
    if (this.isInitialized) return true;

    const hasSAB = typeof SharedArrayBuffer !== 'undefined';
    const isIsolated = self.crossOriginIsolated === true;

    self.postMessage({
      type: 'LOG',
      message: `[Worker] Environment SAB: ${hasSAB}, crossOriginIsolated: ${isIsolated}`
    });

    try {
      const ModuleConfig = {
        noInitialRun: true,
        print: (text) => self.postMessage({ type: 'WASM_LOG', text }),
        printErr: (text) => self.postMessage({ type: 'WASM_WARN', text }),
        
        onRuntimeInitialized: async () => {
          self.postMessage({ type: 'LOG', message: '[Worker] WASM Runtime Initialized.' });
          
          try {
            await WASMEngine.mountVFSFonts();
            
            WASMEngine.isInitialized = true;
            self.postMessage({
              type: 'ENGINE_READY',
              details: {
                hasSharedArrayBuffer: hasSAB,
                crossOriginIsolated: isIsolated,
                vfsFontMounted: true
              }
            });
          } catch (fontErr) {
            self.postMessage({
              type: 'ENGINE_READY',
              details: {
                hasSharedArrayBuffer: hasSAB,
                crossOriginIsolated: isIsolated,
                vfsFontMounted: false,
                fontWarning: fontErr.message
              }
            });
          }
        }
      };

      if (typeof Module !== 'undefined') {
        this.moduleInstance = await Module(ModuleConfig);
      } else {
        throw new Error('Script soffice.js gagal dimuat ke dalam Worker scope.');
      }

    } catch (err) {
      self.postMessage({
        type: 'ENGINE_ERROR',
        error: `Gagal menginisialisasi WASM Engine: ${err.message}`
      });
    }
  },

  async mountVFSFonts() {
    const fontFiles = [
      { name: 'Carlito-Regular.ttf', path: '../assets/fonts/carlito/Carlito-Regular.ttf' },
      { name: 'Carlito-Bold.ttf', path: '../assets/fonts/carlito/Carlito-Bold.ttf' }
    ];

    const FS = this.moduleInstance.FS;
    if (!FS) throw new Error('Emscripten FS (Virtual File System) tidak tersedia.');

    const fontDir = '/share/fonts/truetype/carlito';
    FS.mkdirTree(fontDir);

    for (const font of fontFiles) {
      const response = await fetch(font.path);
      if (!response.ok) throw new Error(`Gagal mengunduh biner font ${font.name}`);
      
      const fontBuffer = await response.arrayBuffer();
      const fontData = new Uint8Array(fontBuffer);

      const fullPath = `${fontDir}/${font.name}`;
      FS.writeFile(fullPath, fontData);
      self.postMessage({ type: 'LOG', message: `[VFS] Berhasil mount font: ${fullPath}` });
    }
  },

  async runConversion(inputData, inputFileName, options = {}) {
    const FS = this.moduleInstance.FS;
    const workDir = '/tmp_work';
    
    try {
      FS.mkdirTree(workDir);
      const inputPath = `${workDir}/${inputFileName}`;
      FS.writeFile(inputPath, inputData);

      const args = [
        '--headless',
        '--norestore',
        '--writer',
        '--calc',
        '--convert-to', 'pdf',
        '--outdir', workDir,
        inputPath
      ];

      self.postMessage({ type: 'LOG', message: `[Worker] Running LO WASM with args: ${args.join(' ')}` });

      this.moduleInstance.callMain(args);

      const outputFileName = inputFileName.substring(0, inputFileName.lastIndexOf('.')) + '.pdf';
      const outputPath = `${workDir}/${outputFileName}`;

      if (!FS.analyzePath(outputPath).exists) {
        throw new Error('Engine gagal menghasilkan file PDF biner di MEMFS.');
      }

      const pdfData = FS.readFile(outputPath);

      FS.unlink(inputPath);
      FS.unlink(outputPath);

      return pdfData;

    } catch (err) {
      try {
        FS.rmdir(workDir);
      } catch (e) {}
      throw err;
    }
  }
};

self.onmessage = async (e) => {
  const { type, payload } = e.data;

  switch (type) {
    case 'INIT_ENGINE':
      await WASMEngine.initEngine();
      break;

    case 'TEST_CONVERT':
      try {
        const { inputBuffer, fileName, options } = payload;
        const inputData = new Uint8Array(inputBuffer);
        
        const pdfBytes = await WASMEngine.runConversion(inputData, fileName, options);

        self.postMessage({
          type: 'CONVERT_SUCCESS',
          payload: { pdfBuffer: pdfBytes.buffer }
        }, [pdfBytes.buffer]);

      } catch (err) {
        self.postMessage({
          type: 'CONVERT_ERROR',
          error: err.message
        });
      }
      break;

    default:
      self.postMessage({ type: 'WASM_WARN', text: `Command tidak dikenal: ${type}` });
  }
};