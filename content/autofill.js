/**
 * E-Fill Autofill Engine
 * Fills only user-approved fields with event synthesis, validation, and post-fill verification.
 * NEVER clicks submit or declaration buttons.
 */

(function (global) {
  'use strict';

  class AutofillEngine {
    constructor() {}

    /**
     * Executes autofill for a list of approved field assignments.
     * @param {Array} approvedProposals List of proposals approved by the user
     * @returns {Object} Summary report of filled and failed fields
     */
    fill(approvedProposals) {
      if (!Array.isArray(approvedProposals) || approvedProposals.length === 0) {
        return { success: false, message: 'No approved fields provided', filledCount: 0, failedCount: 0, results: [] };
      }

      const results = [];
      let filledCount = 0;
      let failedCount = 0;

      for (const proposal of approvedProposals) {
        if (!proposal.approved) {
          continue; // User skipped/excluded this field
        }

        const res = this.fillSingleField(proposal);
        results.push(res);
        if (res.success) {
          filledCount++;
        } else {
          failedCount++;
        }
      }

      return {
        success: filledCount > 0,
        filledCount,
        failedCount,
        totalAttempted: results.length,
        results
      };
    }

    fillSingleField(proposal) {
      const { fieldId, selector, proposedValue, label, canonicalId } = proposal;

      // 1. Confirm target exists
      const el = this.findElement(fieldId, selector);
      if (!el) {
        return {
          fieldId,
          canonicalId,
          label,
          success: false,
          error: 'Element not found in DOM'
        };
      }

      // 2. Confirm target is appropriate and enabled
      if (el.disabled || el.readOnly) {
        return {
          fieldId,
          canonicalId,
          label,
          success: false,
          error: 'Element is disabled or read-only'
        };
      }

      const tag = el.tagName.toLowerCase();
      const type = (el.type || tag).toLowerCase();

      try {
        // 3. Focus element
        el.focus();

        let appliedValue = '';

        // 4. Insert value correctly based on element type
        if (tag === 'select') {
          appliedValue = this.fillSelect(el, proposedValue);
        } else if (tag === 'textarea' || tag === 'input') {
          appliedValue = this.fillTextInput(el, proposedValue);
        } else {
          return {
            fieldId,
            canonicalId,
            label,
            success: false,
            error: `Unsupported element tag: ${tag}`
          };
        }

        // 5. Trigger required input/change events
        this.dispatchEvents(el);

        // 6. Verify the value was accepted
        const verified = this.verifyValue(el, proposedValue);

        // 7. Visual indication on the page
        this.highlightFilled(el);

        return {
          fieldId,
          canonicalId,
          label,
          appliedValue,
          verified,
          success: true
        };
      } catch (err) {
        return {
          fieldId,
          canonicalId,
          label,
          success: false,
          error: err.message || 'Error during fill execution'
        };
      }
    }

    fillTextInput(el, value) {
      const valString = String(value ?? '');

      // Support React/framework value tracking if setter was overridden
      const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;

      if (nativeSetter) {
        nativeSetter.call(el, valString);
      } else {
        el.value = valString;
      }

      return valString;
    }

    fillSelect(el, targetValue) {
      const targetClean = String(targetValue || '').trim().toLowerCase();
      let matchedIndex = -1;

      // 1. Exact match on option value or text
      for (let i = 0; i < el.options.length; i++) {
        const opt = el.options[i];
        const optVal = (opt.value || '').trim().toLowerCase();
        const optText = (opt.textContent || '').trim().toLowerCase();

        if (optVal === targetClean || optText === targetClean) {
          matchedIndex = i;
          break;
        }
      }

      // 2. Prefix / abbreviation match (e.g. "Male" vs "M")
      if (matchedIndex === -1 && targetClean.length > 0) {
        for (let i = 0; i < el.options.length; i++) {
          const opt = el.options[i];
          const optVal = (opt.value || '').trim().toLowerCase();
          const optText = (opt.textContent || '').trim().toLowerCase();

          if (optVal === targetClean[0] || optText === targetClean[0] || optText.startsWith(targetClean)) {
            matchedIndex = i;
            break;
          }
        }
      }

      if (matchedIndex !== -1) {
        el.selectedIndex = matchedIndex;
        return el.options[matchedIndex].value || el.options[matchedIndex].textContent;
      }

      // Fallback
      el.value = targetValue;
      return targetValue;
    }

    dispatchEvents(el) {
      el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true, cancelable: true }));
    }

    verifyValue(el, expected) {
      const actual = String(el.value || '').trim().toLowerCase();
      const exp = String(expected || '').trim().toLowerCase();

      if (el.tagName.toLowerCase() === 'select') {
        const selectedText = (el.selectedOptions?.[0]?.textContent || '').trim().toLowerCase();
        return actual === exp || selectedText === exp || actual.startsWith(exp) || exp.startsWith(actual);
      }

      return actual === exp;
    }

    highlightFilled(el) {
      const origOutline = el.style.outline;
      const origTransition = el.style.transition;

      el.style.transition = 'outline 0.2s ease';
      el.style.outline = '2px solid #22c55e'; // Vibrant green

      setTimeout(() => {
        el.style.outline = origOutline;
        el.style.transition = origTransition;
      }, 2500);
    }

    findElement(fieldId, selector) {
      if (fieldId) {
        try {
          const byId = document.getElementById(fieldId);
          if (byId) return byId;
        } catch (e) {}

        try {
          const escaped = CSS && CSS.escape ? CSS.escape(fieldId) : fieldId;
          const byDataId = document.querySelector(`[data-efill-id="${escaped}"]`);
          if (byDataId) return byDataId;
        } catch (e) {}
      }

      if (selector) {
        try {
          const bySelector = document.querySelector(selector);
          if (bySelector) return bySelector;
        } catch (e) {}
      }

      return null;
    }
  }

  const autofillEngine = new AutofillEngine();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AutofillEngine, autofillEngine };
  } else {
    global.EFillAutofill = { AutofillEngine, autofillEngine };
  }
})(typeof window !== 'undefined' ? window : globalThis);
