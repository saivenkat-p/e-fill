/**
 * E-Fill Form Detector
 * Scans page DOM for relevant form controls and coordinates semantic field identification.
 */

(function (global) {
  'use strict';

  class FormDetector {
    constructor() {
      this.fieldReader = global.EFillFieldReader ? global.EFillFieldReader.fieldReader : null;
      this.normalizer = global.EFillNormalizer ? global.EFillNormalizer.normalizer : null;
    }

    /**
     * Scans active document for fillable form controls.
     * @returns {Object} Scan results containing detected fields and metadata
     */
    scan() {
      const results = [];
      const formControls = document.querySelectorAll('input, select, textarea');

      let index = 0;
      formControls.forEach((el) => {
        if (!this.isValidTarget(el)) return;

        const signals = this.fieldReader ? this.fieldReader.readSignals(el, index++) : null;
        if (!signals) return;

        // Perform semantic normalization
        const norm = this.normalizer ? this.normalizer.normalize(signals) : { canonicalId: null, confidence: 0 };

        results.push({
          elementId: signals.elementId,
          selector: signals.selector,
          label: signals.label || signals.placeholder || signals.name || 'Unnamed Field',
          name: signals.name,
          id: signals.id,
          type: signals.type,
          tagName: signals.tagName,
          placeholder: signals.placeholder,
          sectionHeading: signals.sectionHeading,
          contextText: signals.contextText,
          options: signals.options,
          currentValue: signals.currentValue,
          canonicalId: norm.canonicalId,
          confidence: norm.confidence,
          reason: norm.reason,
          requiresReview: norm.requiresReview
        });
      });

      const uploads = this.scanUploads();

      return {
        url: window.location.href,
        title: document.title,
        timestamp: new Date().toISOString(),
        totalFound: results.length,
        mappedCount: results.filter(f => f.canonicalId !== null).length,
        fields: results,
        uploads: uploads
      };
    }

    /**
     * Scans document specifically for file upload controls and upload requirements.
     */
    scanUploads() {
      const uploads = [];
      if (typeof document === 'undefined' || !document.querySelectorAll) return uploads;

      const fileInputs = document.querySelectorAll('input[type="file"]');
      let index = 0;
      fileInputs.forEach((el) => {
        let label = '';
        if (el.id) {
          try {
            const escaped = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(el.id) : el.id;
            const lbl = document.querySelector(`label[for="${escaped}"]`);
            if (lbl) label = lbl.textContent.trim();
          } catch (e) {}
        }
        if (!label) {
          const parentLabel = el.closest('label');
          if (parentLabel) label = parentLabel.textContent.trim();
        }
        if (!label && el.getAttribute('aria-label')) {
          label = el.getAttribute('aria-label');
        }
        if (!label && el.name) {
          label = el.name;
        }

        const container = el.closest('.form-group, .upload-container, .upload-section, tr, td, div');
        const contextText = container ? container.textContent.trim() : '';

        uploads.push({
          elementId: el.id || `file_upload_${index++}`,
          id: el.id || '',
          name: el.name || '',
          selector: el.id ? `#${el.id}` : `input[type="file"]`,
          accept: el.getAttribute('accept') || '',
          label: label || 'Upload File',
          contextText: contextText.slice(0, 300)
        });
      });

      return uploads;
    }

    /**
     * Determines whether an element should be scanned.
     * Rejects passwords, buttons, hidden inputs, search boxes, and invisible elements.
     */
    isValidTarget(el) {
      if (!el || !el.tagName) return false;

      const tag = el.tagName.toLowerCase();
      const type = (el.type || '').toLowerCase();

      // Skip non-fillable tags
      if (tag !== 'input' && tag !== 'select' && tag !== 'textarea') return false;

      // Skip non-fillable input types
      const ignoredTypes = ['hidden', 'submit', 'button', 'reset', 'image', 'password', 'file'];
      if (ignoredTypes.includes(type)) return false;

      // Skip search inputs
      const name = (el.name || '').toLowerCase();
      const id = (el.id || '').toLowerCase();
      const placeholder = (el.placeholder || '').toLowerCase();
      if (type === 'search' || name === 'q' || name === 'search' || id === 'search' || placeholder.includes('search this site')) {
        return false;
      }

      // Check visibility
      if (el.disabled || el.readOnly) return false;
      if (el.offsetParent === null && el.getClientRects().length === 0) {
        // Element is invisible / display:none
        return false;
      }
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        return false;
      }

      return true;
    }
  }

  const formDetector = new FormDetector();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { FormDetector, formDetector };
  } else {
    global.EFillFormDetector = { FormDetector, formDetector };
  }
})(typeof window !== 'undefined' ? window : globalThis);
