/**
 * E-Fill Autofill Engine
 * =======================
 * Fills only user-approved fields with full framework compatibility (React, Angular, Vue, plain JS),
 * native property descriptor setters, synthetic event dispatching, and post-fill verification.
 *
 * SAFETY INVARIANTS:
 *   - NEVER clicks submit, reset, or payment buttons.
 *   - NEVER accepts legal declarations automatically.
 *   - NEVER enters or touches OTP, CAPTCHA, or password fields.
 *   - Fills ONLY fields explicitly approved by the user in the Side Panel proposal list.
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
        if (res.success && res.verified) {
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

    /**
     * Fills a single field according to its DOM type and dispatches framework events.
     * @param {Object} proposal
     */
    fillSingleField(proposal) {
      const { fieldId, selector, name, proposedValue, label, canonicalId } = proposal;

      // 1. Locate target element using multi-signal addressing
      const el = this.findElement(fieldId, selector, name);
      if (!el) {
        return {
          fieldId,
          canonicalId,
          label: label || canonicalId || 'Field',
          success: false,
          verified: false,
          error: 'Element not found in DOM'
        };
      }

      // 2. Confirm target is appropriate and enabled
      if (el.disabled || el.readOnly) {
        return {
          fieldId,
          canonicalId,
          label: label || canonicalId || 'Field',
          success: false,
          verified: false,
          error: 'Element is disabled or read-only'
        };
      }

      const tag = (el.tagName || '').toLowerCase();
      const type = (el.type || tag).toLowerCase();

      // Security check: NEVER autofill password, file, or submit types
      const forbiddenTypes = ['password', 'file', 'submit', 'button', 'reset', 'image', 'hidden'];
      if (forbiddenTypes.includes(type)) {
        return {
          fieldId,
          canonicalId,
          label: label || canonicalId || 'Field',
          success: false,
          verified: false,
          error: `Autofill blocked on restricted input type: ${type}`
        };
      }

      try {
        // 3. Focus element (dispatch focus / focusin)
        try {
          el.focus({ preventScroll: false });
        } catch (e) {
          try { el.focus(); } catch (e2) {}
        }

        let appliedValue = '';

        // 4. Fill based on control type
        if (tag === 'select') {
          appliedValue = this.fillSelect(el, proposedValue);
        } else if (type === 'radio') {
          appliedValue = this.fillRadio(el, proposedValue);
        } else if (type === 'checkbox') {
          appliedValue = this.fillCheckbox(el, proposedValue);
        } else if (tag === 'textarea' || tag === 'input') {
          appliedValue = this.fillTextInput(el, proposedValue);
        } else {
          return {
            fieldId,
            canonicalId,
            label: label || canonicalId || 'Field',
            success: false,
            verified: false,
            error: `Unsupported element tag: ${tag}`
          };
        }

        // 5. Trigger full event sequence for framework synchronization
        this.dispatchEvents(el, appliedValue);

        // 6. Verify the value was actually accepted and did not revert
        const verified = this.verifyValue(el, proposedValue, appliedValue);

        if (!verified) {
          return {
            fieldId,
            canonicalId,
            label: label || canonicalId || 'Field',
            appliedValue,
            verified: false,
            success: false,
            error: 'Could not fill this field automatically (verification failed: value not accepted by page)'
          };
        }

        // 7. Visual indication on the page
        this.highlightFilled(el);

        return {
          fieldId,
          canonicalId,
          label: label || canonicalId || 'Field',
          appliedValue,
          verified: true,
          success: true
        };
      } catch (err) {
        return {
          fieldId,
          canonicalId,
          label: label || canonicalId || 'Field',
          success: false,
          verified: false,
          error: err.message || 'Error during autofill execution'
        };
      }
    }

    /**
     * Sets value on text inputs and textareas using native property descriptor setters.
     * Handles React 15/16/17/18/19 controlled components, Vue, and Angular.
     */
    fillTextInput(el, value) {
      let valString = String(value ?? '');

      // Format HTML5 date inputs if necessary (YYYY-MM-DD)
      if (el.type === 'date' && valString) {
        valString = this.formatDateForInput(valString);
      }

      const prevValue = el.value;
      const isTextArea = (el.tagName || '').toLowerCase() === 'textarea';

      // Use native prototype property descriptor setter to bypass React/framework overrides
      const proto = isTextArea
        ? (typeof HTMLTextAreaElement !== 'undefined' ? HTMLTextAreaElement.prototype : Object.getPrototypeOf(el))
        : (typeof HTMLInputElement !== 'undefined' ? HTMLInputElement.prototype : Object.getPrototypeOf(el));

      const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
      if (descriptor && descriptor.set) {
        descriptor.set.call(el, valString);
      } else {
        el.value = valString;
      }

      // React _valueTracker reset: tells React that value changed programmatically
      if (el._valueTracker) {
        el._valueTracker.setValue(prevValue);
      }

      return valString;
    }

    /**
     * Formats date string to YYYY-MM-DD for HTML5 date inputs.
     */
    formatDateForInput(val) {
      const trimmed = val.trim();
      // If DD-MM-YYYY or DD/MM/YYYY
      const dmy = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
      if (dmy) {
        const day = dmy[1].padStart(2, '0');
        const month = dmy[2].padStart(2, '0');
        const year = dmy[3];
        return `${year}-${month}-${day}`;
      }
      return trimmed;
    }

    /**
     * Fills <select> elements by matching option values, option text, or prefix.
     */
    fillSelect(el, targetValue) {
      const targetClean = String(targetValue || '').trim().toLowerCase();
      let matchedIndex = -1;
      let matchedValue = '';

      if (el.options && el.options.length > 0) {
        // 1. Exact match on option value or text
        for (let i = 0; i < el.options.length; i++) {
          const opt = el.options[i];
          const optVal = (opt.value || '').trim().toLowerCase();
          const optText = (opt.textContent || '').trim().toLowerCase();

          if (optVal === targetClean || optText === targetClean) {
            matchedIndex = i;
            matchedValue = opt.value || opt.textContent;
            break;
          }
        }

        // 2. Prefix / start match (e.g. "Male" vs "M")
        if (matchedIndex === -1 && targetClean.length > 0) {
          for (let i = 0; i < el.options.length; i++) {
            const opt = el.options[i];
            const optVal = (opt.value || '').trim().toLowerCase();
            const optText = (opt.textContent || '').trim().toLowerCase();

            if (optVal === targetClean[0] || optText === targetClean[0] || optText.startsWith(targetClean) || optVal.startsWith(targetClean)) {
              matchedIndex = i;
              matchedValue = opt.value || opt.textContent;
              break;
            }
          }
        }
      }

      if (matchedIndex !== -1) {
        el.selectedIndex = matchedIndex;
        const proto = typeof HTMLSelectElement !== 'undefined' ? HTMLSelectElement.prototype : Object.getPrototypeOf(el);
        const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
        if (descriptor && descriptor.set) {
          descriptor.set.call(el, matchedValue);
        } else {
          el.value = matchedValue;
        }
        return matchedValue;
      }

      // Fallback: set value directly
      const valStr = String(targetValue || '');
      el.value = valStr;
      return valStr;
    }

    /**
     * Fills radio button inputs.
     */
    fillRadio(el, targetValue) {
      const proto = typeof HTMLInputElement !== 'undefined' ? HTMLInputElement.prototype : Object.getPrototypeOf(el);
      const descriptor = Object.getOwnPropertyDescriptor(proto, 'checked');
      if (descriptor && descriptor.set) {
        descriptor.set.call(el, true);
      } else {
        el.checked = true;
      }
      return el.value || 'checked';
    }

    /**
     * Fills checkbox inputs only when explicitly intended.
     */
    fillCheckbox(el, targetValue) {
      const shouldCheck = targetValue === true ||
        String(targetValue).toLowerCase() === 'true' ||
        String(targetValue).toLowerCase() === 'yes' ||
        String(targetValue).toLowerCase() === '1';

      const proto = typeof HTMLInputElement !== 'undefined' ? HTMLInputElement.prototype : Object.getPrototypeOf(el);
      const descriptor = Object.getOwnPropertyDescriptor(proto, 'checked');
      if (descriptor && descriptor.set) {
        descriptor.set.call(el, shouldCheck);
      } else {
        el.checked = shouldCheck;
      }
      return shouldCheck ? 'checked' : 'unchecked';
    }

    /**
     * Dispatches comprehensive synthetic event sequence for full framework synchronization.
     */
    dispatchEvents(el, valString) {
      // 1. Focus events
      try { el.dispatchEvent(new FocusEvent('focus', { bubbles: true, cancelable: true })); } catch (e) {
        el.dispatchEvent(new Event('focus', { bubbles: true, cancelable: true }));
      }
      try { el.dispatchEvent(new Event('focusin', { bubbles: true, cancelable: true })); } catch (e) {}

      // 2. Keyboard simulation
      try {
        el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Unidentified' }));
        el.dispatchEvent(new KeyboardEvent('keypress', { bubbles: true, cancelable: true, key: 'Unidentified' }));
      } catch (e) {}

      // 3. Input event (InputEvent with full modern properties + fallback Event)
      let inputDispatched = false;
      if (typeof InputEvent !== 'undefined') {
        try {
          const inputEvent = new InputEvent('input', {
            bubbles: true,
            cancelable: true,
            composed: true,
            inputType: 'insertReplacementText',
            data: valString
          });
          el.dispatchEvent(inputEvent);
          inputDispatched = true;
        } catch (e) {}
      }

      if (!inputDispatched) {
        el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true, composed: true }));
      }

      // 4. Keyup event
      try {
        el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key: 'Unidentified' }));
      } catch (e) {}

      // 5. Change event
      el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));

      // 6. Blur / Focusout
      try { el.dispatchEvent(new FocusEvent('blur', { bubbles: true, cancelable: true, composed: true })); } catch (e) {
        el.dispatchEvent(new Event('blur', { bubbles: true, cancelable: true, composed: true }));
      }
      try { el.dispatchEvent(new Event('focusout', { bubbles: true, cancelable: true })); } catch (e) {}

      try { el.blur(); } catch (e) {}
    }

    /**
     * Verifies that the DOM element actually received the expected value.
     */
    verifyValue(el, expected, applied) {
      if (!el) return false;

      const tag = (el.tagName || '').toLowerCase();
      const type = (el.type || '').toLowerCase();

      if (tag === 'select') {
        const actualVal = String(el.value || '').trim().toLowerCase();
        const selectedText = String(el.selectedOptions?.[0]?.textContent || '').trim().toLowerCase();
        const exp = String(expected || '').trim().toLowerCase();
        const app = String(applied || '').trim().toLowerCase();

        if (!actualVal && !selectedText) return false;
        return (
          (actualVal && (actualVal === exp || actualVal === app || actualVal.startsWith(exp))) ||
          (selectedText && (selectedText === exp || selectedText === app || selectedText.startsWith(exp)))
        );
      }

      if (type === 'checkbox' || type === 'radio') {
        return el.checked === true;
      }

      const actual = String(el.value || '').trim().toLowerCase();
      const exp = String(expected || '').trim().toLowerCase();
      const app = String(applied || '').trim().toLowerCase();

      // Check direct equality with expected or applied
      if (actual === exp || actual === app) return true;

      // Check date equality (e.g. 2005-05-27 vs 27/05/2005)
      if (type === 'date' || exp.includes('-') || exp.includes('/')) {
        const d1 = this.formatDateForInput(actual);
        const d2 = this.formatDateForInput(exp);
        if (d1 && d2 && d1 === d2) return true;
      }

      return false;
    }

    /**
     * Highlights filled elements briefly for user feedback.
     */
    highlightFilled(el) {
      if (!el || !el.style) return;
      const origOutline = el.style.outline;
      const origTransition = el.style.transition;

      el.style.transition = 'outline 0.2s ease';
      el.style.outline = '2px solid #22c55e'; // Green highlight

      setTimeout(() => {
        try {
          el.style.outline = origOutline;
          el.style.transition = origTransition;
        } catch (e) {}
      }, 2500);
    }

    /**
     * Multi-signal element finder.
     */
    findElement(fieldId, selector, name) {
      const escape = (str) => (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(str) : str);

      // 1. Check direct ID
      if (fieldId) {
        try {
          const byId = document.getElementById(fieldId);
          if (byId) return byId;
        } catch (e) {}

        // 2. Check data-efill-id
        try {
          const byDataId = document.querySelector(`[data-efill-id="${escape(fieldId)}"]`);
          if (byDataId) return byDataId;
        } catch (e) {}

        // 3. Check name attribute matching fieldId
        try {
          const byName = document.querySelector(`[name="${escape(fieldId)}"]`);
          if (byName) return byName;
        } catch (e) {}
      }

      // 4. Check CSS selector
      if (selector) {
        try {
          const bySelector = document.querySelector(selector);
          if (bySelector) return bySelector;
        } catch (e) {}
      }

      // 5. Check name attribute
      if (name) {
        try {
          const byName = document.querySelector(`[name="${escape(name)}"]`);
          if (byName) return byName;
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
