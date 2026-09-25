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

      return {
        elementId,
        selector: this.getElementSelector(el),
        tagName: tag,
        type,
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
        required: !!el.required,
        currentValue: el.value || ''
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

      // 4. Check aria-label or title
      if (el.getAttribute('aria-label')) {
        return el.getAttribute('aria-label').trim();
      }
      if (el.getAttribute('title')) {
        return el.getAttribute('title').trim();
      }

      // 5. Look for previous sibling or ancestor label/span
      let prev = el.previousElementSibling;
      while (prev) {
        if (/^(LABEL|SPAN|STRONG|B|DIV|P)$/i.test(prev.tagName)) {
          const text = prev.textContent.trim();
          if (text && text.length < 100) return text;
        }
        prev = prev.previousElementSibling;
      }

      // 6. Check parent container's previous element (e.g. Bootstrap form-group)
      const formGroup = el.closest('.form-group, .form-row, .mb-3, .form-field, td');
      if (formGroup) {
        const groupLabel = formGroup.querySelector('label, .form-label, dt');
        if (groupLabel && groupLabel.textContent.trim()) {
          return groupLabel.textContent.trim();
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
