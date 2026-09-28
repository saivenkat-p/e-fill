/**
 * E-Fill Upload Requirement Engine
 * =================================
 * Application-first intelligence engine for detecting and parsing upload requirements
 * from application webpages (<input type="file"> controls, instructions, labels, attributes).
 *
 * CORE PRINCIPLES:
 *   - The application is the source of truth whenever its requirements are available.
 *   - Never assume fixed requirements (e.g. 3.5x4.5 cm, 50KB, JPG always).
 *   - Unknown requirements: DO NOT GUESS. Represent as UNKNOWN / null.
 *   - Physical dimensions: do NOT assume 300 DPI or any guessed resolution.
 *     Only convert if DPI is explicitly stated by the application.
 *   - Strict distinction between:
 *       1. Documents = information / source assets (e.g. 10th marksheet for profile data)
 *       2. Application Upload Requirements = files the current application asks user to upload
 */

(function (global) {
  'use strict';

  // Recognized upload classification types
  const UPLOAD_TYPES = {
    PHOTO: 'PHOTO',
    SIGNATURE: 'SIGNATURE',
    DOCUMENT: 'DOCUMENT',
    CERTIFICATE: 'CERTIFICATE',
    OTHER: 'OTHER'
  };

  class UploadRequirementEngine {
    /**
     * Determines whether text indicates an upload requirement is mandatory.
     * @param {Object} rawSignal
     * @returns {boolean|'UNKNOWN'}
     */
    determineRequired(rawSignal) {
      if (rawSignal.required === true || rawSignal.rawRequired === true || rawSignal.ariaRequired === true) {
        return true;
      }
      const text = `${rawSignal.label || ''} ${rawSignal.contextText || ''}`.toLowerCase();
      if (/\*|\(required\)|mandatory|compulsory/i.test(text)) {
        return true;
      }
      if (/\(optional\)|if applicable|not mandatory/i.test(text)) {
        return false;
      }
      if (rawSignal.required === false) {
        return false;
      }
      return 'UNKNOWN';
    }

    /**
     * Classifies the semantic upload requirement type.
     * @param {string} text
     * @returns {'PHOTO'|'SIGNATURE'|'DOCUMENT'|'CERTIFICATE'|'OTHER'}
     */
    classifyUploadType(text) {
      const lower = (text || '').toLowerCase();

      // 1. Photo keywords
      if (/\b(?:passport\s*size|photograph|photo|picture|avatar|headshot|applicant\s*image|candidate\s*image)\b/i.test(lower)) {
        return UPLOAD_TYPES.PHOTO;
      }

      // 2. Signature keywords
      if (/\b(?:signature|sign|scanned\s*sign|applicant\s*signature|candidate\s*signature)\b/i.test(lower)) {
        return UPLOAD_TYPES.SIGNATURE;
      }

      // 3. Certificate keywords
      if (/\b(?:10th|ssc|12th|inter|hsc|matric|degree|graduation|marksheet|certificate|caste|category|income|ews|disability|pwd)\b/i.test(lower)) {
        return UPLOAD_TYPES.CERTIFICATE;
      }

      // 4. Document / Identity keywords
      if (/\b(?:aadhaar|pan|passport|voter|driving|identity|id\s*proof|address\s*proof|document)\b/i.test(lower)) {
        return UPLOAD_TYPES.DOCUMENT;
      }

      return UPLOAD_TYPES.OTHER;
    }

    /**
     * Extracts allowed file formats and MIME types from accept attributes and text instructions.
     * @param {string} acceptAttr
     * @param {string} instructionText
     * @returns {{ allowedFormats: string[], allowedExtensions: string[], formatText: string|null }}
     */
    extractFormatConstraints(acceptAttr = '', instructionText = '') {
      const allowedFormats = new Set();
      const allowedExtensions = new Set();
      const combined = `${acceptAttr} ${instructionText}`.toLowerCase();

      // Check accept attribute first
      if (acceptAttr) {
        const parts = acceptAttr.split(',').map(s => s.trim().toLowerCase());
        for (const p of parts) {
          if (p === 'image/jpeg' || p === 'image/jpg' || p === '.jpg' || p === '.jpeg') {
            allowedFormats.add('image/jpeg');
            allowedExtensions.add('jpg');
            allowedExtensions.add('jpeg');
          } else if (p === 'image/png' || p === '.png') {
            allowedFormats.add('image/png');
            allowedExtensions.add('png');
          } else if (p === 'application/pdf' || p === '.pdf') {
            allowedFormats.add('application/pdf');
            allowedExtensions.add('pdf');
          } else if (p === 'image/webp' || p === '.webp') {
            allowedFormats.add('image/webp');
            allowedExtensions.add('webp');
          }
        }
      }

      // Check explicit text instructions
      const jpgMatch = /\b(?:jpe?g|jpg)\b/i.test(combined);
      const pngMatch = /\bpng\b/i.test(combined);
      const pdfMatch = /\bpdf\b/i.test(combined);
      const webpMatch = /\bwebp\b/i.test(combined);

      // Check if text says "only"
      const jpgOnly = /\b(?:jpe?g|jpg)\s*(?:only|\/jpeg\s*only)\b/i.test(combined);
      const pngOnly = /\bpng\s*only\b/i.test(combined);
      const pdfOnly = /\bpdf\s*only\b/i.test(combined);

      if (jpgOnly) {
        allowedFormats.clear();
        allowedExtensions.clear();
        allowedFormats.add('image/jpeg');
        allowedExtensions.add('jpg');
        allowedExtensions.add('jpeg');
      } else if (pngOnly) {
        allowedFormats.clear();
        allowedExtensions.clear();
        allowedFormats.add('image/png');
        allowedExtensions.add('png');
      } else if (pdfOnly) {
        allowedFormats.clear();
        allowedExtensions.clear();
        allowedFormats.add('application/pdf');
        allowedExtensions.add('pdf');
      } else {
        if (jpgMatch) {
          allowedFormats.add('image/jpeg');
          allowedExtensions.add('jpg');
          allowedExtensions.add('jpeg');
        }
        if (pngMatch) {
          allowedFormats.add('image/png');
          allowedExtensions.add('png');
        }
        if (pdfMatch) {
          allowedFormats.add('application/pdf');
          allowedExtensions.add('pdf');
        }
        if (webpMatch) {
          allowedFormats.add('image/webp');
          allowedExtensions.add('webp');
        }
      }

      const formatArr = Array.from(allowedFormats);
      const extArr = Array.from(allowedExtensions);

      let formatText = null;
      if (formatArr.length > 0) {
        formatText = extArr.map(e => e.toUpperCase()).join(' / ');
      }

      return {
        allowedFormats: formatArr,
        allowedExtensions: extArr,
        formatText
      };
    }

    /**
     * Extracts file size constraints (min and max bytes/KB).
     * @param {string} text
     * @returns {{ minBytes: number|null, maxBytes: number|null, minKB: number|null, maxKB: number|null, sizeText: string|null }}
     */
    extractFileSizeConstraints(text = '') {
      let minBytes = null;
      let maxBytes = null;
      let minKB = null;
      let maxKB = null;

      // Range: e.g. "20KB to 50KB", "20 KB - 100 KB", "10KB–30KB", "20 to 50 kb"
      const rangeMatch = text.match(/(\d+)\s*(?:kb|k)?\s*(?:to|-|–)\s*(\d+)\s*(?:kb|k)/i);
      if (rangeMatch) {
        minKB = parseInt(rangeMatch[1], 10);
        maxKB = parseInt(rangeMatch[2], 10);
        minBytes = minKB * 1024;
        maxBytes = maxKB * 1024;
      } else {
        // Max size: e.g. "max 100 KB", "maximum 2 MB", "upto 50kb", "not exceeding 200 KB", "within 100kb"
        const maxMatch = text.match(/(?:max|maximum|upto|up\s*to|less\s*than|not\s*exceeding|within)\s*(\d+)\s*(kb|mb)/i);
        if (maxMatch) {
          const val = parseInt(maxMatch[1], 10);
          const unit = maxMatch[2].toLowerCase();
          maxBytes = unit === 'mb' ? val * 1024 * 1024 : val * 1024;
          maxKB = unit === 'mb' ? val * 1024 : val;
        }

        // Min size: e.g. "min 20 KB", "minimum 10 KB", "at least 15kb", "more than 10kb"
        const minMatch = text.match(/(?:min|minimum|at\s*least|more\s*than)\s*(\d+)\s*(kb|mb)/i);
        if (minMatch) {
          const val = parseInt(minMatch[1], 10);
          const unit = minMatch[2].toLowerCase();
          minBytes = unit === 'mb' ? val * 1024 * 1024 : val * 1024;
          minKB = unit === 'mb' ? val * 1024 : val;
        }
      }

      let sizeText = null;
      if (minKB !== null && maxKB !== null) {
        sizeText = `${minKB} KB – ${maxKB} KB`;
      } else if (maxKB !== null) {
        sizeText = `Max ${maxKB} KB`;
      } else if (minKB !== null) {
        sizeText = `Min ${minKB} KB`;
      }

      return {
        minBytes,
        maxBytes,
        minKB,
        maxKB,
        sizeText
      };
    }

    /**
     * Extracts dimension constraints.
     *
     * STRICT NO-ASSUMPTION RULE:
     *   - Pixel dimensions are extracted when explicitly given in px.
     *   - Physical dimensions (cm / mm) preserve the physical unit and aspect ratio.
     *   - Do NOT assume 300 DPI or any resolution unless the application explicitly states DPI.
     *   - If physical only and no DPI stated, pixel width/height remain null (UNKNOWN).
     *
     * @param {string} text
     * @returns {Object} dimensions constraint object
     */
    extractDimensionConstraints(text = '') {
      let width = null;
      let height = null;
      let unit = null;
      let aspectRatio = null;
      let isPhysical = false;
      let physicalWidth = null;
      let physicalHeight = null;
      let physicalUnit = null;
      let explicitDpi = null;
      let requiresReview = false;
      let dimensionText = null;

      // Check for explicit DPI in text: e.g. "300 DPI", "200 dpi"
      const dpiMatch = text.match(/(\d{2,4})\s*dpi/i);
      if (dpiMatch) {
        explicitDpi = parseInt(dpiMatch[1], 10);
      }

      // 1. Pixel dimensions: e.g. "413 × 531 px", "300 x 400 pixels", "280 × 120 px", "200x230"
      const pixelMatch = text.match(/(\d{2,4})\s*(?:x|\*|by|×)\s*(\d{2,4})\s*(?:px|pixels)?/i);
      // Ensure it's not physical (check nearby cm/mm)
      const isNearPhysical = /(?:cm|mm)/i.test(pixelMatch ? text.slice(Math.max(0, pixelMatch.index - 5), pixelMatch.index + pixelMatch[0].length + 5) : '');

      if (pixelMatch && !isNearPhysical) {
        width = parseInt(pixelMatch[1], 10);
        height = parseInt(pixelMatch[2], 10);
        unit = 'px';
        aspectRatio = Number((width / height).toFixed(4));
        dimensionText = `${width} × ${height} px`;
      } else {
        // 2. Physical dimensions: e.g. "3.5 cm × 4.5 cm", "3.5cm x 1.5cm", "35 mm x 45 mm"
        const physMatch = text.match(/(\d+(?:\.\d+)?)\s*(cm|mm)\s*(?:x|\*|by|×)\s*(\d+(?:\.\d+)?)\s*(cm|mm)/i);
        if (physMatch) {
          isPhysical = true;
          physicalWidth = parseFloat(physMatch[1]);
          physicalUnit = physMatch[2].toLowerCase();
          physicalHeight = parseFloat(physMatch[3]);
          unit = physicalUnit;
          aspectRatio = Number((physicalWidth / physicalHeight).toFixed(4));
          dimensionText = `${physicalWidth} × ${physicalHeight} ${physicalUnit}`;

          if (explicitDpi) {
            // Application explicitly specified DPI -> conversion permitted!
            const dpi = explicitDpi;
            const factor = physicalUnit === 'cm' ? (dpi / 2.54) : (dpi / 25.4);
            width = Math.round(physicalWidth * factor);
            height = Math.round(physicalHeight * factor);
            unit = 'px';
            dimensionText = `${physicalWidth} × ${physicalHeight} ${physicalUnit} (${width} × ${height} px @ ${dpi} DPI)`;
          } else {
            // Physical only — DO NOT ASSUME 300 DPI. Keep pixel width/height null (UNKNOWN).
            width = null;
            height = null;
            requiresReview = true;
            dimensionText = `${physicalWidth} × ${physicalHeight} ${physicalUnit} (Aspect Ratio: ${Number(aspectRatio.toFixed(2))})`;
          }
        }
      }

      // 3. Aspect Ratio only: e.g. "3:4 aspect ratio" or "aspect ratio 1:1"
      if (!aspectRatio) {
        const ratioMatch = text.match(/aspect\s*ratio\s*(\d+(?:\.\d+)?)\s*(?::|\/)\s*(\d+(?:\.\d+)?)/i);
        if (ratioMatch) {
          aspectRatio = Number((parseFloat(ratioMatch[1]) / parseFloat(ratioMatch[2])).toFixed(4));
          if (!dimensionText) dimensionText = `Aspect Ratio ${ratioMatch[1]}:${ratioMatch[2]}`;
        }
      }

      return {
        width,
        height,
        unit,
        aspectRatio,
        isPhysical,
        physicalWidth,
        physicalHeight,
        physicalUnit,
        explicitDpi,
        requiresReview,
        dimensionText
      };
    }

    /**
     * Parses a raw upload signal from the DOM into a structured semantic Upload Requirement.
     *
     * @param {Object} rawSignal
     * @param {string} rawSignal.id
     * @param {string} rawSignal.elementId
     * @param {string} rawSignal.name
     * @param {string} rawSignal.selector
     * @param {string} rawSignal.label
     * @param {string} rawSignal.contextText
     * @param {string} rawSignal.accept
     * @returns {Object} Structured Semantic Upload Requirement
     */
    parseUploadRequirement(rawSignal = {}) {
      const elementId = rawSignal.elementId || rawSignal.id || `upload_${Date.now()}`;
      const selector = rawSignal.selector || (rawSignal.id ? `#${rawSignal.id}` : `input[type="file"]`);
      const label = (rawSignal.label || '').trim() || 'Upload File';
      const contextText = (rawSignal.contextText || '').trim();
      const acceptAttr = (rawSignal.accept || '').trim();
      const combinedText = `${label} ${contextText} ${rawSignal.name || ''} ${rawSignal.id || ''}`.trim();

      // 1. Classification
      const type = this.classifyUploadType(combinedText);

      // 2. Requirement Status
      const required = this.determineRequired(rawSignal);

      // 3. Format constraints
      const format = this.extractFormatConstraints(acceptAttr, combinedText);

      // 4. File size constraints
      const fileSize = this.extractFileSizeConstraints(combinedText);

      // 5. Dimension constraints (strict no-assumption rule)
      const dimensions = this.extractDimensionConstraints(combinedText);

      // 6. Source evidence summary
      const evidenceParts = [];
      if (format.formatText) evidenceParts.push(`Format: ${format.formatText}`);
      if (fileSize.sizeText) evidenceParts.push(`Size: ${fileSize.sizeText}`);
      if (dimensions.dimensionText) evidenceParts.push(`Dimensions: ${dimensions.dimensionText}`);
      const sourceEvidence = evidenceParts.length > 0 ? evidenceParts.join(' | ') : 'Standard portal upload (no explicit constraints detected)';

      // 7. Confidence
      let confidence = 'HIGH';
      if (type === UPLOAD_TYPES.OTHER) confidence = 'LOW';
      else if (dimensions.requiresReview) confidence = 'MEDIUM';

      return {
        id: `req_${elementId}`,
        elementId,
        selector,
        type,
        label,
        required,
        format,
        dimensions,
        aspectRatio: dimensions.aspectRatio,
        fileSize,
        sourceEvidence,
        confidence,
        state: 'MISSING_SOURCE', // MISSING_SOURCE | PROCESSING | PREPARED | VALIDATED | AWAITING_USER_APPROVAL | READY_FOR_UPLOAD
        preparedFile: null,
        validationReport: null,
        userApproved: false
      };
    }
  }

  const uploadRequirementEngine = new UploadRequirementEngine();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { UploadRequirementEngine, uploadRequirementEngine, UPLOAD_TYPES };
  } else {
    global.EFillUploadRequirementEngine = { UploadRequirementEngine, uploadRequirementEngine, UPLOAD_TYPES };
  }
})(typeof window !== 'undefined' ? window : globalThis);
