/**
 * E-Fill Content Script Coordinator
 * Handles page scanning, in-page badge display, and communication with Side Panel / Service Worker.
 */

(function () {
  'use strict';

  const formDetector = window.EFillFormDetector?.formDetector;
  const autofillEngine = window.EFillAutofill?.autofillEngine;
  const indicator = window.EFillIndicator?.indicator;

  let currentScanResults = null;
  let activeHighlightEl = null;
  let originalHighlightStyle = '';

  function executeScan() {
    if (!formDetector) {
      console.warn('[E-Fill] Form detector not loaded');
      return null;
    }
    const scanData = formDetector.scan();
    currentScanResults = scanData;

    // Show or update in-page pill indicator if fields detected
    if (indicator && scanData.totalFound > 0) {
      indicator.render(scanData.totalFound, scanData.mappedCount);
    }
    return scanData;
  }

  // Initial scan on page load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(executeScan, 500);
    });
  } else {
    setTimeout(executeScan, 300);
  }

  // Handle messages from Side Panel and Service Worker
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      const action = message.action || message.type;

      switch (action) {
        case 'PING':
          sendResponse({ status: 'PONG', ready: true });
          break;

        case 'SCAN_PAGE':
          const scanResults = executeScan();
          sendResponse({ success: true, data: scanResults });
          break;

        case 'AUTOFILL_APPROVED':
          if (!autofillEngine) {
            sendResponse({ success: false, error: 'Autofill engine unavailable' });
            break;
          }
          const fillReport = autofillEngine.fill(message.approvedProposals || []);
          sendResponse({ success: true, report: fillReport });
          break;

        case 'HIGHLIGHT_FIELD':
          highlightField(message.fieldId, message.selector);
          sendResponse({ success: true });
          break;

        case 'CLEAR_HIGHLIGHT':
          clearHighlight();
          sendResponse({ success: true });
          break;

        default:
          sendResponse({ success: false, error: `Unknown action: ${action}` });
      }

      return true; // Keep channel open for async response
    });
  }

  function highlightField(fieldId, selector) {
    clearHighlight();

    let el = null;
    if (fieldId) {
      el = document.getElementById(fieldId) || document.querySelector(`[data-efill-id="${CSS.escape(fieldId)}"]`);
    }
    if (!el && selector) {
      try {
        el = document.querySelector(selector);
      } catch (e) {}
    }

    if (el) {
      activeHighlightEl = el;
      originalHighlightStyle = el.style.boxShadow;
      el.style.boxShadow = '0 0 0 3px #38bdf8'; // Soft cyan highlight
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function clearHighlight() {
    if (activeHighlightEl) {
      activeHighlightEl.style.boxShadow = originalHighlightStyle;
      activeHighlightEl = null;
    }
  }
})();
