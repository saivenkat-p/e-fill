/**
 * E-Fill Content Script Coordinator
 * ==================================
 * Handles page classification, form scanning, in-page badge display,
 * and communication with the Side Panel / Service Worker.
 *
 * ARCHITECTURE:
 *   Form scanning runs on ANY scannable page (all pages except browser-internal ones).
 *   Application profiles are optional context — they provide hints when available,
 *   but their absence never prevents scanning.
 *
 *   scannable = false → browser-internal page (chrome://, edge://, etc.)
 *   scannable = true  → scan the page; use profile hints if a profile matched
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
   * Returns scanning context: whether the page is scannable and whether a
   * known application profile matched.
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
   * Scans any non-browser-internal page; uses profile hints when available.
   * Returns a scan result object with fields, profile context, and metadata.
   */
  function executeScan() {
    // Always re-check classification at scan time (URL may have changed in SPA).
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
          // Never autofill if the page is not scannable (browser-internal pages)
          if (!pageEligibility || !pageEligibility.eligible) {
            sendResponse({
              success: false,
              error: 'Autofill blocked: page is not scannable'
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

        case 'UPLOAD_APPROVED_FILES': {
          const handler = window.EFillUploadHandler?.uploadHandler;
          if (!handler) {
            sendResponse({ success: false, error: 'Upload handler unavailable' });
            break;
          }
          const files = message.files || [];
          const results = [];
          for (const item of files) {
            const targetEl = item.selector ? document.querySelector(item.selector) : (item.elementId ? document.getElementById(item.elementId) : null);
            if (targetEl) {
              const fileData = item.dataUrl || item.blob || item.file;
              const res = handler.attachFile(targetEl, fileData, item.filename);
              results.push(res);
            }
          }
          sendResponse({ success: true, results });
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
