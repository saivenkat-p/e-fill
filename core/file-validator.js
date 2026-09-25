/**
 * E-Fill File Validator
 * =====================
 * Validates untrusted uploaded documents and images using binary magic bytes,
 * MIME type verification, file size limits, and dimension/aspect-ratio constraints.
 *
 * SAFETY INVARIANTS:
 *   - Never trusts only filename extension (e.g. photo.jpg containing script or non-JPEG).
 *   - Verifies binary signature against allowed MIME types.
 *   - Validates dimension and file size boundaries.
 *   - Never executes uploaded files.
 */

(function (global) {
  'use strict';

  const MAGIC_BYTES = {
    JPEG: [0xFF, 0xD8, 0xFF],
    PNG:  [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A],
    PDF:  [0x25, 0x50, 0x44, 0x46], // %PDF
    GIF:  [0x47, 0x49, 0x46, 0x38]  // GIF8
  };

  class FileValidator {
    /**
     * Detect real file format from binary bytes.
     * @param {Uint8Array|ArrayBuffer|Buffer} buffer
     * @returns {'image/jpeg'|'image/png'|'application/pdf'|'image/gif'|'image/webp'|'unknown'}
     */
    detectMimeType(buffer) {
      if (!buffer) return 'unknown';
      const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

      if (bytes.length >= 3 && bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
        return 'image/jpeg';
      }

      if (bytes.length >= 8 &&
          bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47 &&
          bytes[4] === 0x0D && bytes[5] === 0x0A && bytes[6] === 0x1A && bytes[7] === 0x0A) {
        return 'image/png';
      }

      if (bytes.length >= 4 &&
          bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
        return 'application/pdf';
      }

      if (bytes.length >= 4 &&
          bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
        return 'image/gif';
      }

      if (bytes.length >= 12 &&
          bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
          bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
        return 'image/webp';
      }

      return 'unknown';
    }

    /**
     * Validates a file against expected requirements.
     *
     * @param {Object} input
     * @param {Uint8Array|ArrayBuffer|Buffer} [input.bytes]
     * @param {string} [input.filename]
     * @param {number} [input.sizeBytes]
     * @param {number} [input.width]
     * @param {number} [input.height]
     * @param {Object} [constraints]
     * @returns {{ valid: boolean, detectedMime: string, errors: Array<string> }}
     */
    validate(input = {}, constraints = {}) {
      const errors = [];
      let detectedMime = 'unknown';

      // 1. Binary signature check (if bytes available)
      if (input.bytes) {
        detectedMime = this.detectMimeType(input.bytes);

        // Check if detected mime matches expected formats
        if (constraints.allowedMimes && constraints.allowedMimes.length > 0) {
          const allowed = constraints.allowedMimes.map(m => m.toLowerCase());
          const match = allowed.some(a => {
            if (a === 'image/*' && detectedMime.startsWith('image/')) return true;
            if (a.includes('jpeg') || a.includes('jpg')) return detectedMime === 'image/jpeg';
            if (a.includes('png')) return detectedMime === 'image/png';
            if (a.includes('pdf')) return detectedMime === 'application/pdf';
            return a === detectedMime;
          });

          if (!match) {
            errors.push(`File signature mismatch: detected "${detectedMime}", expected one of [${constraints.allowedMimes.join(', ')}]`);
          }
        }

        // Extension vs Binary signature verification
        if (input.filename) {
          const ext = input.filename.split('.').pop()?.toLowerCase();
          if (ext === 'jpg' || ext === 'jpeg') {
            if (detectedMime !== 'image/jpeg') {
              errors.push(`File named ".${ext}" is not a valid JPEG (detected ${detectedMime})`);
            }
          } else if (ext === 'png') {
            if (detectedMime !== 'image/png') {
              errors.push(`File named ".png" is not a valid PNG (detected ${detectedMime})`);
            }
          } else if (ext === 'pdf') {
            if (detectedMime !== 'application/pdf') {
              errors.push(`File named ".pdf" is not a valid PDF document (detected ${detectedMime})`);
            }
          }
        }
      }

      // 2. File size boundaries
      const size = input.sizeBytes !== undefined ? input.sizeBytes : (input.bytes ? input.bytes.length : 0);
      if (constraints.minSizeBytes !== undefined && size < constraints.minSizeBytes) {
        errors.push(`File size (${Math.round(size / 1024)} KB) is below minimum (${Math.round(constraints.minSizeBytes / 1024)} KB)`);
      }
      if (constraints.maxSizeBytes !== undefined && size > constraints.maxSizeBytes) {
        errors.push(`File size (${Math.round(size / 1024)} KB) exceeds maximum (${Math.round(constraints.maxSizeBytes / 1024)} KB)`);
      }

      // 3. Image dimension constraints
      if (input.width !== undefined && input.height !== undefined) {
        if (constraints.exactWidth !== undefined && input.width !== constraints.exactWidth) {
          errors.push(`Width must be exactly ${constraints.exactWidth}px (got ${input.width}px)`);
        }
        if (constraints.exactHeight !== undefined && input.height !== constraints.exactHeight) {
          errors.push(`Height must be exactly ${constraints.exactHeight}px (got ${input.height}px)`);
        }
        if (constraints.minWidth !== undefined && input.width < constraints.minWidth) {
          errors.push(`Width (${input.width}px) is below minimum ${constraints.minWidth}px`);
        }
        if (constraints.maxWidth !== undefined && input.width > constraints.maxWidth) {
          errors.push(`Width (${input.width}px) exceeds maximum ${constraints.maxWidth}px`);
        }
        if (constraints.minHeight !== undefined && input.height < constraints.minHeight) {
          errors.push(`Height (${input.height}px) is below minimum ${constraints.minHeight}px`);
        }
        if (constraints.maxHeight !== undefined && input.height > constraints.maxHeight) {
          errors.push(`Height (${input.height}px) exceeds maximum ${constraints.maxHeight}px`);
        }

        // Aspect ratio check (with 5% tolerance)
        if (constraints.aspectRatio !== undefined && input.height > 0) {
          const currentRatio = input.width / input.height;
          const targetRatio = constraints.aspectRatio;
          if (Math.abs(currentRatio - targetRatio) / targetRatio > 0.05) {
            errors.push(`Aspect ratio (${currentRatio.toFixed(2)}) deviates from required ratio (${targetRatio.toFixed(2)})`);
          }
        }
      }

      return {
        valid: errors.length === 0,
        detectedMime,
        errors
      };
    }

    validateMagicBytes(buffer, expectedMime) {
      const detected = this.detectMimeType(buffer);
      const isExpected = !expectedMime || (expectedMime === 'image/jpeg' ? detected === 'image/jpeg' : detected === expectedMime);
      const valid = detected !== 'unknown' && isExpected;
      return {
        valid,
        detectedType: detected,
        detectedMime: detected,
        error: valid ? null : `MIME spoofing detected or unrecognized file format (${detected})`
      };
    }

    validateSize(file, constraints = {}) {
      const size = file?.size ?? file?.sizeBytes ?? 0;
      const errors = [];
      if (constraints.minSizeBytes && size < constraints.minSizeBytes) {
        errors.push(`File size (${Math.round(size / 1024)} KB) is below minimum required (${Math.round(constraints.minSizeBytes / 1024)} KB)`);
      }
      if (constraints.maxSizeBytes && size > constraints.maxSizeBytes) {
        errors.push(`File size (${Math.round(size / 1024)} KB) exceeds maximum allowed (${Math.round(constraints.maxSizeBytes / 1024)} KB)`);
      }
      return { valid: errors.length === 0, errors };
    }

    validateDimensions(dims, constraints = {}) {
      const w = dims?.width ?? 0;
      const h = dims?.height ?? 0;
      const errors = [];
      if (constraints.exactWidth && w !== constraints.exactWidth) {
        errors.push(`Width (${w}px) does not match required (${constraints.exactWidth}px)`);
      }
      if (constraints.exactHeight && h !== constraints.exactHeight) {
        errors.push(`Height (${h}px) does not match required (${constraints.exactHeight}px)`);
      }
      return { valid: errors.length === 0, errors };
    }
  }

  const fileValidator = new FileValidator();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { FileValidator, fileValidator, MAGIC_BYTES };
  } else {
    global.EFillFileValidator = { FileValidator, fileValidator, MAGIC_BYTES };
  }
})(typeof window !== 'undefined' ? window : globalThis);
