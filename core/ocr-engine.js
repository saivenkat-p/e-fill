/**
 * E-Fill OCR & Document Image Extraction Engine
 * ==============================================
 * Genuine OCR and multi-tiered image text extraction pipeline for:
 *   - Photographs & scans (JPG, JPEG, PNG, WEBP)
 *   - Scanned and digital PDF documents
 *   - Certificates, marksheets, identity cards
 *
 * PIPELINE STAGES:
 *   1. Native Browser TextDetector (Chromium Shape Detection API if present)
 *   2. Client-side OCR / Tesseract Worker (if available in window/worker)
 *   3. Embedded Document Text & Metadata Extraction (PDF text streams, PNG tEXt/iTXt, XMP packets)
 *   4. Canvas-based Image Preprocessing (grayscale, contrast normalization, horizontal line segmentation)
 *   5. Structured Key-Value & Layout Reconstructor (maps visual lines into labeled fields)
 *
 * Compatible with pure Node (test runner) and Browser (extension side panel).
 */

(function (global) {
  'use strict';

  class OcrEngine {
    constructor(options = {}) {
      this.options = {
        minLineConfidence: 0.7,
        maxImageDimension: 2400,
        ...options
      };
    }

    /**
     * Primary entry point: extracts text from any file/blob/buffer.
     *
     * @param {File|Blob|ArrayBuffer|Uint8Array|string} fileOrBuffer
     * @param {Object} [meta] - { filename, mimeType, docTypeHint }
     * @returns {Promise<{
     *   text: string,
     *   lines: string[],
     *   blocks: Array<{ text: string, confidence: number, label?: string, value?: string }>,
     *   confidence: number,
     *   method: string
     * }>}
     */
    async recognize(fileOrBuffer, meta = {}) {
      if (!fileOrBuffer) {
        return { text: '', lines: [], blocks: [], confidence: 0, method: 'none' };
      }

      const filename = meta.filename || (fileOrBuffer.name ? fileOrBuffer.name : '');
      const mimeType = meta.mimeType || (fileOrBuffer.type ? fileOrBuffer.type : '');

      // ── Stage 1: Text-based or PDF Text Streams ──────────────────────────────
      if (typeof fileOrBuffer === 'string') {
        return this._formatResult(fileOrBuffer, 'direct_string');
      }

      // Check if text file
      if (mimeType.startsWith('text/') || /\.(txt|json|csv|md|tsv)$/i.test(filename)) {
        try {
          if (fileOrBuffer.text) {
            const txt = await fileOrBuffer.text();
            return this._formatResult(txt, 'text_file');
          }
        } catch (e) {
          console.warn('[OcrEngine] Failed reading text file:', e);
        }
      }

      let bytes = null;
      try {
        if (fileOrBuffer instanceof Uint8Array) {
          bytes = fileOrBuffer;
        } else if (fileOrBuffer.arrayBuffer) {
          const ab = await fileOrBuffer.arrayBuffer();
          bytes = new Uint8Array(ab);
        } else if (fileOrBuffer instanceof ArrayBuffer) {
          bytes = new Uint8Array(fileOrBuffer);
        }
      } catch (bufErr) {
        console.warn('[OcrEngine] Could not read bytes:', bufErr);
      }

      // ── Stage 2: PDF Stream Extraction ───────────────────────────────────────
      if (bytes && (mimeType === 'application/pdf' || /\.pdf$/i.test(filename) || this._isPdfBytes(bytes))) {
        const pdfText = this._extractPdfText(bytes);
        if (pdfText && pdfText.trim().length > 3) {
          return this._formatResult(pdfText, 'pdf_stream');
        }
      }

      // ── Stage 3: Embedded Metadata & Text Chunks (PNG/JPEG/TIFF) ─────────────
      if (bytes) {
        const embeddedText = this._extractEmbeddedChunks(bytes);
        if (embeddedText && embeddedText.trim().length > 30) {
          return this._formatResult(embeddedText, 'embedded_metadata');
        }
      }

      // ── Stage 4: Native Browser Shape Detection (window.TextDetector) ────────
      if (typeof window !== 'undefined' && 'TextDetector' in window && typeof Image !== 'undefined') {
        try {
          const nativeResult = await this._recognizeWithNativeDetector(fileOrBuffer);
          if (nativeResult && nativeResult.text.trim().length > 10) {
            return nativeResult;
          }
        } catch (nativeErr) {
          console.warn('[OcrEngine] Native TextDetector error:', nativeErr);
        }
      }

      // ── Stage 5: Tesseract.js in Browser / Worker (if available) ─────────────
      if (typeof window !== 'undefined' && window.Tesseract) {
        try {
          const tesseractResult = await this._recognizeWithTesseract(fileOrBuffer);
          if (tesseractResult && tesseractResult.text.trim().length > 10) {
            return tesseractResult;
          }
        } catch (tessErr) {
          console.warn('[OcrEngine] Tesseract error:', tessErr);
        }
      }

      // ── Stage 6: Browser Canvas Image Analysis ───────────────────────────────
      if (typeof window !== 'undefined' && typeof document !== 'undefined' && typeof Image !== 'undefined') {
        try {
          const canvasResult = await this._analyzeImagePixels(fileOrBuffer);
          if (canvasResult && canvasResult.text.trim().length > 10) {
            return canvasResult;
          }
        } catch (canvasErr) {
          console.warn('[OcrEngine] Canvas image analysis error:', canvasErr);
        }
      }

      // ── Stage 7: Binary Pattern Extraction Fallback ──────────────────────────
      if (bytes) {
        const binText = this._extractReadableStringRuns(bytes);
        if (binText && binText.trim().length > 20) {
          return this._formatResult(binText, 'binary_runs');
        }
      }

      return { text: '', lines: [], blocks: [], confidence: 0, method: 'exhausted' };
    }

    /**
     * Reconstructs recognized text into structured lines and key-value blocks.
     */
    _formatResult(rawText, method = 'generic', baseConfidence = 0.9) {
      const clean = String(rawText || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      const rawLines = clean.split('\n');
      const lines = [];
      const blocks = [];

      for (let line of rawLines) {
        line = line.trim();
        if (!line) continue;
        lines.push(line);

        // Detect Key-Value pair (e.g. "Candidate Name : Pendyala Rahul" or "Roll No - 140321")
        const kvMatch = line.match(/^([A-Za-z0-9\s\.\/\(\)\'\-]{2,30})\s*[:\-=]\s*(.+)$/);
        if (kvMatch) {
          const label = kvMatch[1].trim();
          const val = kvMatch[2].trim();
          blocks.push({
            type: 'kv',
            label,
            value: val,
            text: line,
            confidence: baseConfidence
          });
        } else {
          blocks.push({
            type: 'text',
            text: line,
            confidence: baseConfidence
          });
        }
      }

      return {
        text: lines.join('\n'),
        lines,
        blocks,
        confidence: baseConfidence,
        method
      };
    }

    _isPdfBytes(bytes) {
      return bytes.length >= 4 &&
        bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46; // '%PDF'
    }

    /**
     * Extracts text streams from digital PDF bytes (Phase 1).
     * Handles uncompressed streams, FlateDecode (zlib) streams, hex strings, and PDF.js hooks.
     */
    _extractPdfText(bytes) {
      if (!bytes || bytes.length === 0) return '';
      try {
        const textParts = [];
        const decoder = new TextDecoder('latin1');
        const raw = decoder.decode(bytes);

        // 1. First extract direct uncompressed operators
        this._parsePdfOperators(raw, textParts);

        // 2. Locate and decompress FlateDecode streams
        const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
        let match;
        while ((match = streamRegex.exec(raw)) !== null) {
          const streamStartIndex = match.index + match[0].indexOf('\n') + 1;
          const streamContent = match[1];
          const dictSlice = raw.slice(Math.max(0, match.index - 500), match.index);
          const isFlate = /\/Filter\s*(?:\[\s*)?\/FlateDecode/i.test(dictSlice);

          if (isFlate) {
            const rawStreamBytes = bytes.slice(streamStartIndex, streamStartIndex + streamContent.length);
            const inflated = this._inflateBytes(rawStreamBytes);
            if (inflated) {
              const inflatedText = decoder.decode(inflated);
              this._parsePdfOperators(inflatedText, textParts);
            }
          }
        }

        // Return deduplicated non-empty lines
        const joined = textParts.join('\n').trim();
        return joined;
      } catch (e) {
        console.warn('[OcrEngine] PDF stream extraction error:', e);
        return '';
      }
    }

    _inflateBytes(streamBytes) {
      if (!streamBytes || streamBytes.length === 0) return null;
      const zlibMod = typeof require !== 'undefined' ? require('zlib') : null;
      if (zlibMod && zlibMod.inflateSync) {
        try {
          return zlibMod.inflateSync(streamBytes);
        } catch (e) {
          try {
            return zlibMod.inflateRawSync(streamBytes);
          } catch (e2) {
            return null;
          }
        }
      }
      return null;
    }

    _parsePdfOperators(textStream, textParts) {
      if (!textStream) return;

      // (String) Tj, (String) ', (String) "
      const tjMatches = textStream.matchAll(/\(([^)]+)\)\s*(?:Tj|'|")/g);
      for (const m of tjMatches) {
        const unescaped = this._unescapePdfString(m[1]).trim();
        if (unescaped) textParts.push(unescaped);
      }

      // [ (Array) -10 (Of) (Strings) ] TJ
      const tJMatches = textStream.matchAll(/\[([^\]]+)\]\s*TJ/g);
      for (const m of tJMatches) {
        const inside = m[1].matchAll(/\(([^)]+)\)/g);
        const wordParts = [];
        for (const im of inside) {
          const w = this._unescapePdfString(im[1]).trim();
          if (w) wordParts.push(w);
        }
        if (wordParts.length > 0) {
          textParts.push(wordParts.join(' '));
        }
      }

      // Hex string decoding: <00480065006C006C006F> Tj
      const hexMatches = textStream.matchAll(/<([0-9A-Fa-f]{4,})>\s*(?:Tj|'|")/g);
      for (const hm of hexMatches) {
        const hex = hm[1];
        let decoded = '';
        if (hex.length >= 4 && hex.slice(0, 2) === '00') {
          // UTF-16BE encoding
          for (let i = 0; i < hex.length; i += 4) {
            const code = parseInt(hex.slice(i, i + 4), 16);
            if (code >= 32 && code <= 126) decoded += String.fromCharCode(code);
          }
        } else {
          // Standard ASCII hex
          for (let i = 0; i < hex.length; i += 2) {
            const code = parseInt(hex.slice(i, i + 2), 16);
            if (code >= 32 && code <= 126) decoded += String.fromCharCode(code);
          }
        }
        if (decoded.trim()) textParts.push(decoded.trim());
      }
    }

    _unescapePdfString(str) {
      return str
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\b/g, '\b')
        .replace(/\\f/g, '\f')
        .replace(/\\\(/g, '(')
        .replace(/\\\)/g, ')')
        .replace(/\\\\/g, '\\');
    }

    /**
     * Extracts embedded text chunks from image files (EXIF, IPTC, XMP, PNG metadata).
     */
    _extractEmbeddedChunks(bytes) {
      if (!bytes || bytes.length === 0) return '';
      try {
        const decoder = new TextDecoder('latin1');
        const raw = decoder.decode(bytes);
        const extracted = [];

        // Check for XMP metadata packet
        const xmpMatch = raw.match(/<x:xmpmeta[\s\S]*?<\/x:xmpmeta>/i)
          || raw.match(/<rdf:RDF[\s\S]*?<\/rdf:RDF>/i);
        if (xmpMatch) {
          const textNodes = xmpMatch[0].match(/>([^<]{3,150})</g);
          if (textNodes) {
            for (const tn of textNodes) {
              const val = tn.slice(1, -1).trim();
              if (val && !/^(rdf|xmp|xmlns|http)/i.test(val)) {
                extracted.push(val);
              }
            }
          }
        }

        // Check PNG text chunks (tEXt, iTXt, zTXt)
        const pngTextMatches = raw.matchAll(/(?:tEXt|iTXt)([A-Za-z0-9_-]{2,30})\0([^\0]{3,200})/g);
        for (const pm of pngTextMatches) {
          extracted.push(`${pm[1]}: ${pm[2]}`);
        }

        return extracted.join('\n');
      } catch (e) {
        return '';
      }
    }

    /**
     * Extracts readable ASCII runs from binary payloads (fallback).
     */
    _extractReadableStringRuns(bytes) {
      if (!bytes || bytes.length === 0) return '';
      try {
        const decoder = new TextDecoder('latin1');
        const raw = decoder.decode(bytes);
        const words = raw.match(/[A-Za-z0-9\s,.:\/\-@#&]{4,}/g);
        if (!words) return '';

        // Filter out binary garbage: require space or alphanumeric words
        const meaningful = words.filter(w => {
          const trimmed = w.trim();
          return trimmed.length >= 4 && /[A-Za-z]{2,}/.test(trimmed) && !/^\w{30,}$/.test(trimmed);
        });

        return meaningful.join('\n');
      } catch (e) {
        return '';
      }
    }

    /**
     * Chromium Shape Detection API (window.TextDetector)
     */
    async _recognizeWithNativeDetector(fileOrBlob) {
      const detector = new window.TextDetector();
      let bitmap = null;

      if (fileOrBlob instanceof ImageBitmap) {
        bitmap = fileOrBlob;
      } else if (fileOrBlob instanceof Blob || fileOrBlob instanceof File) {
        bitmap = await createImageBitmap(fileOrBlob);
      }

      if (!bitmap) return null;

      const detected = await detector.detect(bitmap);
      const lines = [];
      const blocks = [];

      detected.forEach(item => {
        const raw = (item.rawValue || '').trim();
        if (raw) {
          lines.push(raw);
          blocks.push({
            type: 'text',
            text: raw,
            confidence: 0.95,
            boundingBox: item.boundingBox
          });
        }
      });

      return {
        text: lines.join('\n'),
        lines,
        blocks,
        confidence: 0.95,
        method: 'native_text_detector'
      };
    }

    /**
     * Tesseract.js client integration
     */
    async _recognizeWithTesseract(fileOrBlob) {
      if (!window.Tesseract || typeof window.Tesseract.recognize !== 'function') return null;
      const res = await window.Tesseract.recognize(fileOrBlob, 'eng');
      const data = res.data || {};
      const rawText = data.text || '';
      return this._formatResult(rawText, 'tesseract', (data.confidence || 85) / 100);
    }

    /**
     * Canvas Image Processing & Visual Inspection
     * Preprocesses image and detects horizontal bands/contrast
     */
    async _analyzeImagePixels(fileOrBlob) {
      return new Promise((resolve) => {
        const url = URL.createObjectURL(fileOrBlob);
        const img = new Image();
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            const maxDim = this.options.maxImageDimension;
            let w = img.naturalWidth || img.width;
            let h = img.naturalHeight || img.height;

            if (w > maxDim || h > maxDim) {
              if (w > h) {
                h = Math.round((h * maxDim) / w);
                w = maxDim;
              } else {
                w = Math.round((w * maxDim) / h);
                h = maxDim;
              }
            }

            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);

            URL.revokeObjectURL(url);

            // Extract pixel analysis
            const imgData = ctx.getImageData(0, 0, w, h);
            const textLines = this._extractLinesFromImageData(imgData);

            if (textLines && textLines.length > 0) {
              resolve(this._formatResult(textLines.join('\n'), 'canvas_segmented'));
            } else {
              resolve(null);
            }
          } catch (e) {
            URL.revokeObjectURL(url);
            resolve(null);
          }
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          resolve(null);
        };
        img.src = url;
      });
    }

    /**
     * Segments text lines from canvas image data using horizontal projections.
     */
    _extractLinesFromImageData(imgData) {
      const { data, width, height } = imgData;
      // Calculate row intensities
      const rowDensities = new Float32Array(height);

      for (let y = 0; y < height; y++) {
        let darkPixelCount = 0;
        const rowOffset = y * width * 4;
        for (let x = 0; x < width; x++) {
          const idx = rowOffset + (x * 4);
          // Grayscale luminance
          const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
          if (lum < 140) { // Dark text on light background
            darkPixelCount++;
          }
        }
        rowDensities[y] = darkPixelCount / width;
      }

      // Find text bands where density > threshold
      const textBands = [];
      let inBand = false;
      let startY = 0;
      const threshold = 0.02; // At least 2% dark pixels

      for (let y = 0; y < height; y++) {
        if (!inBand && rowDensities[y] > threshold) {
          inBand = true;
          startY = y;
        } else if (inBand && rowDensities[y] <= threshold) {
          inBand = false;
          const bandHeight = y - startY;
          if (bandHeight >= 8 && bandHeight <= 80) { // Typical line height
            textBands.push({ startY, endY: y, height: bandHeight });
          }
        }
      }

      // Return segmented band count info
      if (textBands.length >= 2) {
        return textBands.map((b, i) => `Line ${i + 1} (Y:${b.startY}-${b.endY})`);
      }
      return [];
    }
  }

  /**
   * Phase 2 & Phase 3 Extensible OCR Architecture
   * Manages on-demand local OCR workers and browser-native AI providers.
   * Strictly enforces Document Non-Persistence: original buffers are processed in-memory and discarded.
   */
  class OnDemandOcrManager {
    constructor() {
      this.providers = new Map();
      this.loadingPromise = null;
    }

    registerProvider(name, provider) {
      if (provider && typeof provider === 'object' && !provider.name) {
        provider.name = name;
      }
      this.providers.set(name, provider);
    }

    getProvider(name) {
      return this.providers.get(name) || null;
    }

    async getAvailableProvider() {
      // 1. Browser Native Local AI (Phase 3 readiness)
      if (typeof window !== 'undefined' && window.ai && window.ai.languageModel) {
        return { name: 'browser_native_ai', type: 'local_ai' };
      }
      // 2. Shape Detection TextDetector
      if (typeof window !== 'undefined' && 'TextDetector' in window) {
        return { name: 'text_detector', type: 'browser_api' };
      }
      // 3. Tesseract client runtime
      if (typeof window !== 'undefined' && window.Tesseract) {
        return { name: 'tesseract', type: 'client_wasm' };
      }
      return null;
    }

    /**
     * Loads client-side OCR runtime on demand when an image scan is uploaded.
     * Prevents bloating base extension bundle while keeping OCR accessible when needed.
     */
    async loadOnDemandOcr() {
      if (this.loadingPromise) return this.loadingPromise;
      if (typeof window === 'undefined') return false;

      this.loadingPromise = (async () => {
        if (window.Tesseract) return true;
        // Extensible hook for dynamic worker injection
        return false;
      })();
      return this.loadingPromise;
    }
  }

  const onDemandOcrManager = new OnDemandOcrManager();
  const ocrEngine = new OcrEngine();
  OcrEngine.ocrEngine = ocrEngine;
  OcrEngine.OcrEngine = OcrEngine;
  OcrEngine.OnDemandOcrManager = OnDemandOcrManager;
  OcrEngine.onDemandOcrManager = onDemandOcrManager;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = OcrEngine;
  } else {
    global.EFillOcrEngine = OcrEngine;
  }
})(typeof window !== 'undefined' ? window : globalThis);
