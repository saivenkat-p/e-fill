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
      this.uploadRequirementEngine = global.EFillUploadRequirementEngine ? global.EFillUploadRequirementEngine.uploadRequirementEngine : (typeof require !== 'undefined' ? (require('../core/upload-requirement-engine.js')?.uploadRequirementEngine || null) : null);
    }

    /**
     * Scans active document for fillable form controls.
     * @returns {Object} Scan results containing detected fields and metadata
     */
    scan() {
      const results = [];
      const formControls = document.querySelectorAll('input, select, textarea, [role="combobox"], [role="listbox"], .custom-select');

      let index = 0;
      const candidates = [];
      formControls.forEach((el) => {
        if (!this.isValidTarget(el)) return;

        const signals = this.fieldReader ? this.fieldReader.readSignals(el, index++) : null;
        if (!signals) return;
        candidates.push({ el, signals });
      });

      // Group radio controls by name to prevent option values (e.g. "India", "Other") from becoming false fields
      const radioGroups = new Map();
      candidates.forEach(cand => {
        const { el } = cand;
        const type = (el.type || '').toLowerCase();
        if (type === 'radio' && el.name) {
          const formKey = el.form ? (el.form.id || el.form.name || 'form') : 'doc';
          const groupKey = `${formKey}_${el.name}`;
          if (!radioGroups.has(groupKey)) {
            radioGroups.set(groupKey, []);
          }
          radioGroups.get(groupKey).push(cand);
        }
      });

      radioGroups.forEach((groupCandidates) => {
        if (groupCandidates.length === 0) return;
        const primary = groupCandidates[0];
        const primaryEl = primary.el;

        // Find the enclosing group label from container, fieldset, or ancestor form-group
        let groupLabel = '';
        let curr = primaryEl.parentElement;
        const formBoundary = primaryEl.form || (typeof document !== 'undefined' ? document.body : null);
        while (curr && curr !== formBoundary) {
          // Look for legend if fieldset
          const legend = curr.querySelector('legend');
          if (legend && legend.textContent.trim()) {
            groupLabel = legend.textContent.trim();
            break;
          }
          // Find labels in curr container that do NOT contain or point directly to an individual radio button
          const labels = curr.querySelectorAll('label');
          for (const lbl of labels) {
            const hasRadio = lbl.querySelector('input[type="radio"]');
            const forAttr = lbl.getAttribute('for');
            const pointsToRadio = forAttr && groupCandidates.some(c => c.el.id === forAttr);
            if (!hasRadio && !pointsToRadio && lbl.textContent.trim()) {
              groupLabel = lbl.textContent.trim();
              break;
            }
          }
          if (groupLabel) break;
          // Check previous sibling heading/label
          if (curr.previousElementSibling && /label|legend|span|h\d|div/i.test(curr.previousElementSibling.tagName)) {
            const prevText = curr.previousElementSibling.textContent.trim();
            if (prevText && prevText.length < 80 && !prevText.includes('\n')) {
              groupLabel = prevText;
              break;
            }
          }
          curr = curr.parentElement;
        }

        // Clean group label (remove trailing *, colons, etc.)
        if (groupLabel) {
          groupLabel = groupLabel.replace(/[\*:]|\(required\)/gi, '').trim();
          primary.signals.label = groupLabel;
        }

        // Collect options and active selection
        const options = [];
        let activeValue = '';
        groupCandidates.forEach(({ el: rEl, signals: rSig }, idx) => {
          const optVal = rEl.value || '';
          let optText = (rSig.label || optVal).trim();
          if (optText.toLowerCase() === (groupLabel || '').toLowerCase()) {
            optText = optVal;
          }
          const isChecked = !!rEl.checked;
          if (isChecked) activeValue = optVal;
          options.push({
            value: optVal,
            text: optText,
            checked: isChecked
          });

          if (idx > 0) {
            rSig.isSubsequentRadio = true;
          }
        });

        primary.signals.options = options;
        primary.signals.isRadioGroup = true;
        if (activeValue) primary.signals.currentValue = activeValue;
      });

      // Semantic grouping & internal control filtering
      candidates.forEach(({ el, signals }) => {
        if (this.isInternalOrCompoundHelper(el, signals, candidates)) {
          return; // Skip internal helper controls, compound country-code selectors, and duplicate widgets
        }

        // Perform semantic normalization
        const norm = this.normalizer ? this.normalizer.normalize(signals) : { canonicalId: null, confidence: 0 };
        const effectiveCanonicalId = norm.canonicalId || norm.appSpecificId || null;

        results.push({
          elementId: signals.elementId,
          selector: signals.selector,
          label: signals.label || signals.placeholder || signals.name || 'Unnamed Field',
          name: signals.name,
          id: signals.id,
          type: signals.isSecurityCredential ? 'SECURITY_CREDENTIAL' : (signals.isMockSecurityChallenge ? 'MOCK_SECURITY_CHALLENGE' : (signals.isRealSecurityChallenge ? 'SECURITY_CHALLENGE' : signals.type)),
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
          canonicalId: signals.isMockSecurityChallenge ? 'mock_security_challenge' : ((signals.isRealSecurityChallenge || signals.isSecurityCredential) ? null : effectiveCanonicalId),
          confidence: signals.isMockSecurityChallenge ? 1.0 : ((signals.isRealSecurityChallenge || signals.isSecurityCredential) ? 1.0 : (norm.confidence || (effectiveCanonicalId ? 0.80 : 0))),
          reason: signals.isMockSecurityChallenge ? 'Safe test verification challenge' : (signals.isRealSecurityChallenge ? 'Real CAPTCHA requires direct human completion' : (signals.isSecurityCredential ? 'Security credential requires direct user entry' : norm.reason)),
          requiresReview: (signals.isRealSecurityChallenge || signals.isSecurityCredential) ? true : norm.requiresReview,
          isSecurityCredential: !!signals.isSecurityCredential,
          isRealSecurityChallenge: !!signals.isRealSecurityChallenge,
          isMockSecurityChallenge: !!signals.isMockSecurityChallenge,
          isRadioGroup: !!signals.isRadioGroup,
          securityType: signals.securityType || (signals.isSecurityCredential ? 'SECURITY_CREDENTIAL' : null),
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
     * Deeply inspects labels, helper text, aria attributes, section headings, and constraints.
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
        if (!label && el.getAttribute('aria-labelledby')) {
          try {
            const refEl = document.getElementById(el.getAttribute('aria-labelledby'));
            if (refEl) label = refEl.textContent.trim();
          } catch (e) {}
        }
        if (!label && el.name) {
          label = el.name;
        }

        // Context: container, aria-describedby, helper classes, and section headings
        const container = el.closest('.form-group, .upload-container, .upload-section, .upload-box, fieldset, tr, td, div');
        let contextParts = [];

        // 1. Aria describedby
        const ariaDescribedBy = el.getAttribute('aria-describedby');
        if (ariaDescribedBy) {
          ariaDescribedBy.split(/\s+/).forEach(descId => {
            const descEl = document.getElementById(descId);
            if (descEl && descEl.textContent.trim()) {
              contextParts.push(descEl.textContent.trim());
            }
          });
        }

        // 2. Helper text within container
        if (container) {
          const helperEls = container.querySelectorAll('.form-text, .help-block, .instruction, .hint, small, .upload-note, .note, .text-muted');
          helperEls.forEach(h => {
            const t = h.textContent.trim();
            if (t && !contextParts.includes(t)) contextParts.push(t);
          });

          // Surrounding heading
          const heading = container.querySelector('legend, h1, h2, h3, h4, h5, h6, .card-title, .section-header');
          if (heading && heading.textContent.trim()) {
            contextParts.push(heading.textContent.trim());
          }

          // Full container text fallback if contextParts is empty
          if (contextParts.length === 0) {
            contextParts.push(container.textContent.trim());
          }
        }

        const contextText = contextParts.join(' ').replace(/\s+/g, ' ').slice(0, 500);

        const rawSignal = {
          elementId: el.id || `file_upload_${index++}`,
          id: el.id || '',
          name: el.name || '',
          selector: el.id ? `#${el.id}` : `input[type="file"]`,
          accept: el.getAttribute('accept') || '',
          label: label || 'Upload File',
          contextText,
          required: el.required || el.getAttribute('aria-required') === 'true',
          rawRequired: el.required
        };

        if (this.uploadRequirementEngine && typeof this.uploadRequirementEngine.parseUploadRequirement === 'function') {
          const parsed = this.uploadRequirementEngine.parseUploadRequirement(rawSignal);
          // Preserve backward-compatible properties
          uploads.push({
            ...parsed,
            elementId: rawSignal.elementId,
            id: rawSignal.id,
            name: rawSignal.name,
            selector: rawSignal.selector,
            accept: rawSignal.accept,
            label: parsed.label || rawSignal.label,
            contextText: rawSignal.contextText
          });
        } else {
          uploads.push(rawSignal);
        }
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
     * Identifies and filters internal helper controls, companion search inputs,
     * compound country dial-code selectors, and redundant duplicate controls within a form group.
     * This ensures E-Fill reasons about the SEMANTIC APPLICATION FIELD (e.g. Mobile Number)
     * rather than raw DOM controls, eliminating false "Unnamed Field" and "+91(IN)" cards.
     */
    isInternalOrCompoundHelper(el, signals, candidates) {
      if (!el || !signals) return false;

      // Skip subsequent radio buttons in a radio group (the first representative carries the group)
      if (signals.isSubsequentRadio) {
        return true;
      }

      const tag = (el.tagName || '').toLowerCase();
      const type = (el.type || '').toLowerCase();
      const role = (el.getAttribute('role') || '').toLowerCase();
      const ariaAuto = (el.getAttribute('aria-autocomplete') || '').toLowerCase();
      const className = (el.className && typeof el.className === 'string' ? el.className : '').toLowerCase();
      const name = (el.name || '').toLowerCase();
      const id = (el.id || '').toLowerCase();
      const rawLabel = (signals.label || '').trim();
      const labelLower = rawLabel.toLowerCase();

      // Find the closest logical container (form group, row, input group, or parent)
      const container = el.closest(
        '.form-group, .form-row, .input-group, .iti, .iti__flag-container, fieldset, tr, td, .form-field, .field-wrapper, .dropdown, .select2-container, .bootstrap-select'
      ) || el.parentElement;

      // ── Rule 1: Compound Phone Country Dial-Code Helper ──
      // Dial-code badges, country-code selects, or iti__ flag dropdowns that accompany a phone/mobile input
      const isDialCodeLabel = /^\+\d{1,4}(\s*\([a-z]{2}\))?$/i.test(rawLabel) || (/^\+\d{1,4}/.test(rawLabel) && rawLabel.length <= 15);
      const isDialCodeValue = /^\+\d{1,4}/.test(signals.currentValue || '') && String(signals.currentValue).length <= 15;
      const isDialCodeNameOrId = (
        name.includes('country_code') || name.includes('countrycode') || name.includes('dial_code') || name.includes('dialcode') ||
        name.includes('phone_code') || name.includes('isd') || name.includes('calling_code') ||
        id.includes('country_code') || id.includes('countrycode') || id.includes('dial_code') || id.includes('dialcode') ||
        id.includes('phone_code') || id.includes('isd') || id.includes('calling_code')
      );
      const isDialCodeClass = (
        className.includes('iti__') || className.includes('country-code') || className.includes('dial-code') ||
        className.includes('calling-code') || className.includes('phone-code')
      );
      const hasDialCodeOptions = Array.isArray(signals.options) && signals.options.length > 0 &&
        signals.options.some(opt => /^\+\d{1,4}/.test((opt.text || opt.value || '').trim()));

      const isDialCodeSignal = isDialCodeLabel || isDialCodeNameOrId || isDialCodeClass || (tag === 'select' && hasDialCodeOptions);

      if (isDialCodeSignal) {
        // Look for an associated phone/mobile input in candidates
        const hasAssociatedPhone = candidates.some(c => {
          if (c.el === el) return false;
          const otherType = (c.el.type || '').toLowerCase();
          const otherLabel = (c.signals.label || '').toLowerCase();
          const otherName = (c.signals.name || '').toLowerCase();
          const otherId = (c.signals.id || '').toLowerCase();

          const isPhone = otherType === 'tel' ||
            otherLabel.includes('mobile') || otherLabel.includes('phone') || otherLabel.includes('contact') ||
            otherName.includes('mobile') || otherName.includes('phone') ||
            otherId.includes('mobile') || otherId.includes('phone');

          if (!isPhone) return false;

          // Proximity check: same container or nearby within form
          if (container && container.contains(c.el)) return true;
          const otherContainer = c.el.closest('.form-group, .form-row, .input-group, .iti, fieldset, tr, td, .form-field') || c.el.parentElement;
          if (otherContainer && otherContainer.contains(el)) return true;

          // If both share the same form or are sibling elements
          if (el.form && c.el.form && el.form === c.el.form) {
            let prev = el.nextElementSibling;
            let count = 0;
            while (prev && count < 3) {
              if (prev === c.el || prev.contains(c.el)) return true;
              prev = prev.nextElementSibling;
              count++;
            }
            let next = el.previousElementSibling;
            count = 0;
            while (next && count < 3) {
              if (next === c.el || next.contains(c.el)) return true;
              next = next.previousElementSibling;
              count++;
            }
          }
          return false;
        });

        if (hasAssociatedPhone) {
          return true; // Auxiliary dial-code control is filtered out
        }
      }

      // ── Rule 2: Internal Dropdown Search / Filter Input ──
      // Dropdown widgets (Bootstrap-select, Select2, Chosen, etc.) embed a search text input inside the menu
      const isSearchWidget = (
        role === 'searchbox' ||
        ariaAuto === 'list' ||
        className.includes('searchbox') ||
        className.includes('bs-searchbox') ||
        className.includes('select2-search') ||
        className.includes('dropdown-search') ||
        className.includes('search-field') ||
        (tag === 'input' && type === 'text' && className.includes('search') && !el.id && !el.name)
      );

      if (isSearchWidget && container) {
        const hasPrimaryControl = candidates.some(c => c.el !== el && container.contains(c.el));
        if (hasPrimaryControl) {
          return true; // Filter internal dropdown search input
        }
      }

      // ── Rule 3: Unnamed Companion Control in Container with Labeled Field ──
      // Inputs with no label, no placeholder, and generic/no name that accompany a labeled field
      const isUnnamed = (
        (!rawLabel || rawLabel === 'Unnamed Field' || rawLabel === 'Field') &&
        (!signals.placeholder || signals.placeholder.trim() === '') &&
        (!signals.name || /^field_\d+|input_\d+|undefined$/i.test(signals.name))
      );

      if (isUnnamed && container) {
        const hasLabeledCompanion = candidates.some(c => {
          if (c.el === el) return false;
          if (!container.contains(c.el)) return false;
          const otherLabel = (c.signals.label || '').trim();
          return otherLabel && otherLabel !== 'Unnamed Field' && otherLabel !== 'Field';
        });
        if (hasLabeledCompanion) {
          return true; // Filter unnamed companion
        }
      }

      // ── Rule 4: Redundant Duplicate Control in the Same Container ──
      // If a container has both a <select> and an auxiliary <input> without independent identity,
      // the <select> with options is the true data control
      if (tag === 'input' && container) {
        const hasSelectInContainer = candidates.some(c => {
          if (c.el === el) return false;
          const otherTag = (c.el.tagName || '').toLowerCase();
          return otherTag === 'select' && container.contains(c.el);
        });
        if (hasSelectInContainer && (isUnnamed || el.readOnly || labelLower === 'unnamed field')) {
          return true;
        }
      }

      return false;
    }

    /**
     * Determines whether an element should be scanned.
     * Rejects non-fillable tags, passwords, buttons, hidden inputs, search boxes, and invisible elements.
     */
    isValidTarget(el) {
      if (!el || !el.tagName) return false;

      const tag = el.tagName.toLowerCase();
      const type = (el.type || '').toLowerCase();

      // Only native interactive form controls can be filled by AutofillEngine.
      // Non-interactive wrappers (div, span, etc.) must NEVER be scanned as targets.
      if (tag !== 'input' && tag !== 'select' && tag !== 'textarea' && !el.isContentEditable) {
        return false;
      }

      // Skip non-fillable input types
      // Note: 'password' is now permitted so it can be detected as SECURITY_CREDENTIAL
      const ignoredTypes = ['hidden', 'submit', 'button', 'reset', 'image', 'file'];
      if (ignoredTypes.includes(type)) return false;

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
      const isSelect = tag === 'select';

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
