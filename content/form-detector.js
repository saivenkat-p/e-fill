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
      const formControls = document.querySelectorAll('input, select, textarea, [role="combobox"], [role="listbox"], .custom-select');

      let index = 0;
      formControls.forEach((el) => {
        if (!this.isValidTarget(el)) return;

        const signals = this.fieldReader ? this.fieldReader.readSignals(el, index++) : null;
        if (!signals) return;

        // Perform semantic normalization
        const norm = this.normalizer ? this.normalizer.normalize(signals) : { canonicalId: null, confidence: 0 };
        const effectiveCanonicalId = norm.canonicalId || norm.appSpecificId || null;

        results.push({
          elementId: signals.elementId,
          selector: signals.selector,
          label: signals.label || signals.placeholder || signals.name || 'Unnamed Field',
          name: signals.name,
          id: signals.id,
          type: signals.isMockSecurityChallenge ? 'MOCK_SECURITY_CHALLENGE' : signals.type,
          tagName: signals.tagName,
          placeholder: signals.placeholder,
          sectionHeading: signals.sectionHeading,
          contextText: signals.contextText,
          options: signals.options || [],
          currentValue: signals.currentValue,
          disabled: signals.disabled,
          readOnly: signals.readOnly,
          required: signals.required !== undefined ? signals.required : 'UNKNOWN',
          rawRequired: signals.rawRequired,
          canonicalId: signals.isMockSecurityChallenge ? 'mock_security_challenge' : (signals.isRealSecurityChallenge ? null : effectiveCanonicalId),
          confidence: signals.isMockSecurityChallenge ? 1.0 : (norm.confidence || (effectiveCanonicalId ? 0.80 : 0)),
          reason: signals.isMockSecurityChallenge ? 'Safe test verification challenge' : (signals.isRealSecurityChallenge ? 'Real CAPTCHA requires direct human completion' : norm.reason),
          requiresReview: signals.isRealSecurityChallenge ? true : norm.requiresReview,
          isMockSecurityChallenge: !!signals.isMockSecurityChallenge,
          isRealSecurityChallenge: !!signals.isRealSecurityChallenge,
          securityChallengeType: signals.securityChallengeType || null,
          challengeQuestion: signals.challengeQuestion || null,
          challengeExpectedAnswer: signals.challengeExpectedAnswer || null,
          challengePrompt: signals.challengePrompt || null
        });
      });

      const uploads = this.scanUploads();
      const navigation = this.scanNavigation();

      return {
        url: window.location.href,
        title: document.title,
        timestamp: new Date().toISOString(),
        totalFound: results.length,
        mappedCount: results.filter(f => f.canonicalId !== null).length,
        fields: results,
        uploads: uploads,
        navigation: navigation
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
     * Scans document for stepper, wizard navigation, and headings to extract application structure.
     */
    scanNavigation() {
      const steps = [];
      const headings = [];

      if (typeof document === 'undefined') return { stepperFound: false, steps, headings };

      // 1. Stepper / wizard elements
      const stepItems = document.querySelectorAll(
        '.step-tab, .step-item, .wizard-step, .step, [role="tab"], .breadcrumb-item, ol.steps > li, ul.steps > li, .progress-step'
      );

      stepItems.forEach((el, idx) => {
        const text = el.textContent.trim().replace(/\s+/g, ' ');
        if (!text || text.length > 80) return;
        const isActive = el.classList.contains('active') || el.classList.contains('current') || el.getAttribute('aria-selected') === 'true';
        const isCompleted = el.classList.contains('completed') || el.classList.contains('done') || el.classList.contains('passed');
        steps.push({
          label: text,
          stepIndex: idx + 1,
          active: isActive,
          completed: isCompleted
        });
      });

      // 2. Headings for application identity
      document.querySelectorAll('h1, h2, .portal-title, .header h1, header h1, .app-title').forEach(h => {
        const t = h.textContent.trim();
        if (t && t.length < 120 && !headings.includes(t)) {
          headings.push(t);
        }
      });

      return {
        stepperFound: steps.length > 0,
        steps,
        headings
      };
    }

    /**
     * Determines whether an element should be scanned.
     * Rejects passwords, buttons, hidden inputs, search boxes, and invisible elements.
     */
    isValidTarget(el) {
      if (!el || !el.tagName) return false;

      const tag = el.tagName.toLowerCase();
      const type = (el.type || '').toLowerCase();
      const role = (el.getAttribute('role') || '').toLowerCase();
      const isCustomControl = role === 'combobox' || role === 'listbox' || el.classList.contains('custom-select');

      // Skip non-fillable tags unless it's a recognised custom control
      if (tag !== 'input' && tag !== 'select' && tag !== 'textarea' && !isCustomControl) return false;

      // Skip non-fillable input types
      const ignoredTypes = ['hidden', 'submit', 'button', 'reset', 'image', 'password', 'file'];
      if (ignoredTypes.includes(type) && !isCustomControl) return false;

      // Skip search inputs
      const name = (el.name || '').toLowerCase();
      const id = (el.id || '').toLowerCase();
      const placeholder = (el.placeholder || '').toLowerCase();
      if (type === 'search' || name === 'q' || name === 'search' || id === 'search' || placeholder.includes('search this site')) {
        return false;
      }

      // Check visibility
      // NOTE: Do NOT discard disabled or read-only controls — in multi-step or conditional forms
      // (e.g. JAM Choice of Examination City 2 & 3), controls may be initially disabled until prior choices are made.
      const isSelect = tag === 'select' || isCustomControl;

      // For non-select inputs, ensure element is in layout
      if (!isSelect) {
        if (el.offsetParent === null && el.getClientRects().length === 0) {
          return false;
        }
        if (typeof window !== 'undefined' && window.getComputedStyle) {
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden') {
            return false;
          }
        }
      } else {
        // For select controls, ensure it's not permanently unattached
        if (typeof window !== 'undefined' && window.getComputedStyle) {
          const style = window.getComputedStyle(el);
          // If display is none, check if it's styled by a select overlay
          if (style.display === 'none' && el.offsetParent === null && el.getClientRects().length === 0 && !el.closest('form, .form-group, .form-card, body')) {
            return false;
          }
        }
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
