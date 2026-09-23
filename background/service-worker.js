/**
 * E-Fill Background Service Worker (Manifest V3)
 * Coordinates side panel activation, tab events, and extension lifecycle.
 */

// Configure side panel to open on action click
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((err) => {
  console.warn('[E-Fill] Error setting panel behavior:', err);
});

// Listen for messages from content scripts or extension pages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'OPEN_SIDE_PANEL') {
    if (sender.tab && sender.tab.windowId) {
      // Synchronous API call to preserve user gesture context from content script click
      chrome.sidePanel.open({ windowId: sender.tab.windowId })
        .then(() => sendResponse({ success: true }))
        .catch((err) => {
          console.warn('[E-Fill] Could not open side panel:', err);
          sendResponse({ success: false, error: err.message });
        });
      return true; // Keep channel open for async response
    }
  }
});

// Set badge or notify when extension installs / updates
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[E-Fill] Extension installed/updated:', details.reason);
});
