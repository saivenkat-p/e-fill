/**
 * E-Fill Content Field Reader
 * Extracts multi-signal contextual metadata from DOM form elements.
 */

(function (global) {
  'use strict';

  class FieldReader {
    /**
     * Inspect a single DOM element and gather all signals.
     * @param {HTMLElement} el The form element (input, select, textarea)
     * @param {number} index Index position in form
     */
    readSignals(el, index) {
      if (!el || !el.tagName) return null;

      const tag = el.tagName.toLowerCase();
      const type = (el.type || tag).toLowerCase();

      // Ensure element has a stable unique ID or data attribute for targeting
      let elementId = el.id || el.getAttribute('data-efill-id');
      if (!elementId) {
        elementId = el.getAttribute('name') || `efill-field-${index}-${Date.now()}`;
        el.setAttribute('data-efill-id', elementId);
      }

      const label = this.findLabelText(el);
      const sectionHeading = this.findSectionHeading(el);
      const contextText = this.findPrecedingText(el);

      // Collect select options
      let options = [];
      if (tag === 'select') {
        options = Array.from(el.options || []).map(opt => ({
          value: opt.value,
          text: (opt.textContent || '').trim()
        }));
      }

      // Security Credential (Password / Confirm Password)
      const isSecurityCredential = (type === 'password' || /\b(password|confirm_password|passwd)\b/i.test(`${el.id || ''} ${el.name || ''}`));

      const isMockAttr = el.getAttribute('data-mock-challenge') === 'true' || el.getAttribute('data-efill-mock-challenge') === 'true';
      const idOrName = `${el.id || ''} ${el.name || ''}`.toLowerCase();
      const allText = `${label || ''} ${el.placeholder || ''} ${contextText || ''}`.toLowerCase();
      const className = (el.className || '').toLowerCase();

      const isMock = isMockAttr ||
        idOrName.includes('mock_captcha') ||
        idOrName.includes('mock_challenge') ||
        allText.includes('mock human verification') ||
        allText.includes('mock challenge') ||
        allText.includes('mock captcha');

      const hasMathChallenge = /(\d+)\s*([\+\-\*\/])\s*(\d+)/.test(allText);

      const isRealCaptcha = !isMock && (
        className.includes('g-recaptcha') ||
        className.includes('h-captcha') ||
        className.includes('cf-turnstile') ||
        className.includes('captcha') ||
        /\b(captcha|recaptcha|hcaptcha|turnstile|security[_-]?code)\b/i.test(idOrName) ||
        /\b(captcha|security code|enter the code shown|type the characters|human verification|evaluate the expression)\b/i.test(allText) ||
        hasMathChallenge
      );

      let challengeQuestion = null;
      let challengeExpectedAnswer = null;
      let challengePrompt = null;

      if (isMock) {
        const fullChallengeText = `${label || ''} ${contextText || ''} ${el.placeholder || ''}`;
        const mathMatch = fullChallengeText.match(/(\d+)\s*([\+\-\*\/])\s*(\d+)/);
        if (mathMatch) {
          const num1 = parseInt(mathMatch[1], 10);
          const op = mathMatch[2];
          const num2 = parseInt(mathMatch[3], 10);
          let expected = 0;
          if (op === '+') expected = num1 + num2;
          else if (op === '-') expected = num1 - num2;
          else if (op === '*') expected = num1 * num2;
          else if (op === '/') expected = Math.floor(num1 / num2);

          challengeQuestion = `${num1} ${op} ${num2} = ?`;
          challengeExpectedAnswer = String(expected);
          challengePrompt = `What is the answer to ${num1} ${op} ${num2}?`;
        } else {
          challengeQuestion = '8 - 4 = ?';
          challengeExpectedAnswer = '4';
          challengePrompt = 'What is the answer to 8 - 4?';
        }
      }

      return {
        elementId,
        selector: this.getElementSelector(el),
        tagName: tag,
        type: isSecurityCredential ? 'SECURITY_CREDENTIAL' : (isMock ? 'MOCK_SECURITY_CHALLENGE' : (isRealCaptcha ? 'SECURITY_CHALLENGE' : type)),
        name: el.name || '',
        id: el.id || '',
        placeholder: el.placeholder || '',
        ariaLabel: el.getAttribute('aria-label') || '',
        autocomplete: el.getAttribute('autocomplete') || '',
        label,
        sectionHeading,
        contextText,
        options,
        disabled: !!el.disabled,
        readOnly: !!el.readOnly,
        required: !!el.required || el.getAttribute('aria-required') === 'true' || el.classList.contains('required') || /\*|\(required\)/i.test(label || ''),
        rawRequired: !!el.required,
        ariaRequired: el.getAttribute('aria-required') === 'true',
        currentValue: el.value || '',
        isSecurityCredential: !!isSecurityCredential,
        securityType: isSecurityCredential ? 'SECURITY_CREDENTIAL' : null,
        isMockSecurityChallenge: isMock,
        isRealSecurityChallenge: isRealCaptcha,
        securityChallengeType: isMock ? 'MOCK_SECURITY_CHALLENGE' : (isRealCaptcha ? 'SECURITY_CHALLENGE' : null),
        challengeQuestion,
        challengeExpectedAnswer,
        challengePrompt
      };
    }

    /**
     * Finds associated label using standard HTML mechanisms:
     * 1. <label for="...">
     * 2. Parent <label>
     * 3. aria-labelledby
     * 4. aria-label
     * 5. Preceding text/span
     */
    findLabelText(el) {
      // 1. Check aria-labelledby
      const labelledBy = el.getAttribute('aria-labelledby');
      if (labelledBy) {
        const labelEl = document.getElementById(labelledBy);
        if (labelEl && labelEl.textContent.trim()) {
          return labelEl.textContent.trim();
        }
      }

      // 2. Check <label for="id">
      if (el.id) {
        // Use attribute selector escaping
        const escapedId = CSS.escape ? CSS.escape(el.id) : el.id;
        const labelEl = document.querySelector(`label[for="${escapedId}"]`);
        if (labelEl && labelEl.textContent.trim()) {
          return labelEl.textContent.trim();
        }
      }

      // 3. Check enclosing <label>
      const parentLabel = el.closest('label');
      if (parentLabel) {
        // Clone and remove input elements to extract pure text
        const clone = parentLabel.cloneNode(true);
        const inputs = clone.querySelectorAll('input, select, textarea, button');
        inputs.forEach(i => i.remove());
        const text = clone.textContent.trim();
        if (text) return text;
      }

      // 4. Check parent container's label (e.g. Bootstrap form-group, form-row)
      const formGroup = el.closest('.form-group, .form-row, .mb-3, .form-field, tr, td');
      if (formGroup) {
        const groupLabel = formGroup.querySelector('label, .form-label, dt, .control-label');
        if (groupLabel) {
          const forAttr = groupLabel.getAttribute('for');
          // If the label has for="..." matching this element or has no for attribute, use it
          if (!forAttr || (el.id && forAttr === el.id)) {
            const clone = groupLabel.cloneNode(true);
            clone.querySelectorAll('input, select, textarea, button').forEach(i => i.remove());
            const text = clone.textContent.trim();
            if (text) return text;
          }
        }
      }

      // 5. Check aria-label or title
      if (el.getAttribute('aria-label')) {
        return el.getAttribute('aria-label').trim();
      }
      if (el.getAttribute('title')) {
        return el.getAttribute('title').trim();
      }

      // 6. Look for previous sibling or ancestor label/span
      let prev = el.previousElementSibling;
      while (prev) {
        if (/^(LABEL|SPAN|STRONG|B|DIV|P)$/i.test(prev.tagName)) {
          const text = prev.textContent.trim();
          // Skip input addons, dial codes (e.g. "+91", "+91(IN)"), or pure symbol badges
          const isAddonOrDialCode = /^\+\d{1,4}(\s*\([a-z]{2}\))?$/i.test(text) || /^[@#$€£%^&*()_\-+=|/\\:;.,<>?]+$/.test(text);
          if (text && text.length < 100 && !isAddonOrDialCode) {
            return text;
          }
        }
        prev = prev.previousElementSibling;
      }

      // 7. Fallback to any single label in formGroup
      if (formGroup) {
        const labels = formGroup.querySelectorAll('label');
        if (labels.length === 1 && labels[0].textContent.trim()) {
          const clone = labels[0].cloneNode(true);
          clone.querySelectorAll('input, select, textarea, button').forEach(i => i.remove());
          const text = clone.textContent.trim();
          if (text) return text;
        }
      }

      return '';
    }

    /**
     * Finds enclosing section header, legend, or card heading.
     */
    findSectionHeading(el) {
      // 1. Fieldset legend
      const fieldset = el.closest('fieldset');
      if (fieldset) {
        const legend = fieldset.querySelector('legend');
        if (legend && legend.textContent.trim()) {
          return legend.textContent.trim();
        }
      }

      // 2. Headings in enclosing containers
      let curr = el.parentElement;
      let depth = 0;
      while (curr && depth < 5 && curr !== document.body) {
        const heading = curr.querySelector('h1, h2, h3, h4, h5, h6, .card-header, .section-title, .panel-heading');
        if (heading && heading.textContent.trim()) {
          return heading.textContent.trim();
        }
        curr = curr.parentElement;
        depth++;
      }

      return '';
    }

    /**
     * Finds nearby text preceding the element.
     */
    findPrecedingText(el) {
      let node = el.previousSibling;
      const textNodeType = (typeof Node !== 'undefined' && Node.TEXT_NODE) ? Node.TEXT_NODE : 3;
      while (node) {
        if (node.nodeType === textNodeType && node.textContent.trim()) {
          return node.textContent.trim();
        }
        node = node.previousSibling;
      }
      return '';
    }

    /**
     * Generates a unique CSS selector for this element.
     */
    getElementSelector(el) {
      const escape = (str) => (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(str) : str);
      if (el.id) return `#${escape(el.id)}`;
      if (el.getAttribute('data-efill-id')) return `[data-efill-id="${escape(el.getAttribute('data-efill-id'))}"]`;
      if (el.name) return `${el.tagName.toLowerCase()}[name="${escape(el.name)}"]`;
      return el.tagName.toLowerCase();
    }
  }

  const fieldReader = new FieldReader();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { FieldReader, fieldReader };
  } else {
    global.EFillFieldReader = { FieldReader, fieldReader };
  }
})(typeof window !== 'undefined' ? window : globalThis);
