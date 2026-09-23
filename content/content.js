/**
 * E-Fill Content Script Coordinator
 * ==================================
 * Handles page eligibility classification, form scanning (only on eligible pages),
 * in-page badge display, and communication with Side Panel / Service Worker.
 *
 * IMPORTANT INVARIANT:
 *   This script NEVER scans form fields on a page that has not been classified
 *   as an eligible supported government application.
 */

(function () {
  'use strict';

  function getClassifier() {
    const mod = window.EFillPageClassifier;
    if (!mod) return null;
    return mod.createClassifier();
  }

  function getFormDetector() {
    return window.EFillFormDetector?.formDetector;
  }

  function getAutofillEngine() {
    return window.EFillAutofill?.autofillEngine;
  }

  function getIndicator() {
    return window.EFillIndicator?.indicator;
  }

  // Cached eligibility result for this page session
  let pageEligibility = null;   // { eligible, profile, reason }
  let currentScanResults = null;
  let activeHighlightEl = null;
  let originalHighlightStyle = '';

  /**
   * Classify the current page.
   * Must be called before any form scanning.
   */
  function classifyPage() {
    const classifier = getClassifier();
    if (!classifier) {
      // If the classifier module failed to load, treat as ineligible (safe default)
      pageEligibility = {
        eligible: false,
        profile: null,
        reason: 'E-Fill page classifier module not available'
      };
      return pageEligibility;
    }

    pageEligibility = classifier.classify(window.location.href);
    return pageEligibility;
  }

  /**
   * Run a full page scan.
   * Returns null (no scan object) if the page is not eligible.
   */
  function executeScan() {
    // Always re-check eligibility at scan time (URL could have changed in SPA)
    const eligibility = classifyPage();

    if (!eligibility.eligible) {
      // Remove any prior indicator if navigated away from an eligible page
      const ind = getIndicator();
      if (ind) ind.remove();

      currentScanResults = null;
      return {
        eligible: false,
        profile: null,
        eligibilityReason: eligibility.reason,
        url: window.location.href,
        title: document.title,
        timestamp: new Date().toISOString(),
        totalFound: 0,
        mappedCount: 0,
        fields: []
      };
    }

    const detector = getFormDetector();
    if (!detector) {
      return {
        eligible: true,
        profile: eligibility.profile,
        eligibilityReason: eligibility.reason,
        url: window.location.href,
        title: document.title,
        timestamp: new Date().toISOString(),
        totalFound: 0,
        mappedCount: 0,
        fields: []
      };
    }

    const scanData = detector.scan();
    currentScanResults = {
      ...scanData,
      eligible: true,
      profile: eligibility.profile,
      eligibilityReason: eligibility.reason
    };

    // Show in-page pill indicator only on eligible pages with detected fields
    const ind = getIndicator();
    if (ind) {
      if (scanData.totalFound > 0) {
        ind.render(scanData.totalFound, scanData.mappedCount);
      } else {
        ind.remove();
      }
    }

    return currentScanResults;
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

        case 'SCAN_PAGE': {
          const scanResult = executeScan();
          sendResponse({ success: true, data: scanResult });
          break;
        }

        case 'AUTOFILL_APPROVED': {
          // Never autofill if the page is not eligible
          if (!pageEligibility || !pageEligibility.eligible) {
            sendResponse({
              success: false,
              error: 'Autofill blocked: page is not a recognized supported application'
            });
            break;
          }

          const engine = getAutofillEngine();
          if (!engine) {
            sendResponse({ success: false, error: 'Autofill engine unavailable' });
            break;
          }
          const fillReport = engine.fill(message.approvedProposals || []);
          sendResponse({ success: true, report: fillReport });
          break;
        }

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
      try { el = document.getElementById(fieldId); } catch (e) {}
      if (!el) {
        try {
          const escaped = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(fieldId) : fieldId;
          el = document.querySelector(`[data-efill-id="${escaped}"]`);
        } catch (e) {}
      }
    }
    if (!el && selector) {
      try { el = document.querySelector(selector); } catch (e) {}
    }

    if (el) {
      activeHighlightEl = el;
      originalHighlightStyle = el.style.boxShadow;
      el.style.boxShadow = '0 0 0 3px #38bdf8';
      try { el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e) { el.scrollIntoView(); }
    }
  }

  function clearHighlight() {
    if (activeHighlightEl) {
      activeHighlightEl.style.boxShadow = originalHighlightStyle;
      activeHighlightEl = null;
    }
  }
})();
