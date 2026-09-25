/**
 * E-Fill Upload Handler
 * =====================
 * Handles attaching approved prepared files to HTML <input type="file"> controls
 * using DataTransfer and standard DOM event sequences.
 *
 * SAFETY INVARIANTS:
 *   - Attaches files ONLY when explicitly approved by the user.
 *   - Dispatches native DOM events (input, change) so web frameworks recognize the file.
 *   - NEVER clicks submit, reset, or upload-submit buttons.
 *   - Final form submission remains strictly under user manual control.
 */

(function (global) {
  'use strict';

  class UploadHandler {
    /**
     * Attaches prepared file(s) to a file input element.
     *
     * @param {HTMLInputElement|string} target - DOM element or selector
     * @param {File|Blob} file - Prepared file/blob
     * @param {string} [filename] - Desired filename
     * @returns {{ success: boolean, filename: string, error?: string }}
     */
    attachFile(target, file, filename = 'document_efill.jpg') {
      let el = target;
      if (typeof target === 'string') {
        el = document.querySelector(target);
      }

      if (!el) {
        return { success: false, filename, error: 'File input element not found in DOM' };
      }

      if (el.disabled || el.readOnly) {
        return { success: false, filename, error: 'File input element is disabled' };
      }

      if (el.tagName?.toLowerCase() !== 'input' || (el.type || '').toLowerCase() !== 'file') {
        return { success: false, filename, error: 'Target is not an <input type="file"> element' };
      }

      try {
        // Construct File object if DataURL, Blob, or File provided
        let fileObj = file;
        if (typeof file === 'string' && file.startsWith('data:')) {
          fileObj = this.dataUrlToFile(file, filename);
        } else if (file && file.dataUrl && typeof file.dataUrl === 'string' && file.dataUrl.startsWith('data:')) {
          fileObj = this.dataUrlToFile(file.dataUrl, filename);
        } else if (!(file instanceof (typeof File !== 'undefined' ? File : Object))) {
          const mime = file?.type || 'image/jpeg';
          if (typeof File !== 'undefined') {
            fileObj = new File([file], filename, { type: mime, lastModified: Date.now() });
          }
        }

        // Use DataTransfer to populate input.files
        if (typeof DataTransfer !== 'undefined') {
          const dt = new DataTransfer();
          if (fileObj) dt.items.add(fileObj);
          el.files = dt.files;
        }

        // Dispatch framework events
        try {
          el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
          el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
        } catch (e) {
          // Fallback event dispatch
          const evt = document.createEvent('HTMLEvents');
          evt.initEvent('change', true, true);
          el.dispatchEvent(evt);
        }

        return {
          success: true,
          filename: fileObj?.name || filename,
          sizeBytes: fileObj?.size || file?.size || 0
        };
      } catch (err) {
        return { success: false, filename, error: `Failed to attach file: ${err.message}` };
      }
    }

    /**
     * Converts a data URL to a File object.
     */
    dataUrlToFile(dataUrl, filename = 'document_efill.jpg') {
      try {
        const arr = dataUrl.split(',');
        const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
          u8arr[n] = bstr.charCodeAt(n);
        }
        return new File([u8arr], filename, { type: mime, lastModified: Date.now() });
      } catch (e) {
        console.warn('Failed to parse data URL to File:', e);
        return null;
      }
    }
  }

  const uploadHandler = new UploadHandler();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { UploadHandler, uploadHandler };
  } else {
    global.EFillUploadHandler = { UploadHandler, uploadHandler };
  }
})(typeof window !== 'undefined' ? window : globalThis);
