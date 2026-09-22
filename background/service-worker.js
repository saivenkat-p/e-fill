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
    (async () => {
      try {
        if (sender.tab && sender.tab.id) {
          await chrome.sidePanel.open({ tabId: sender.tab.id });
        } else if (sender.tab && sender.tab.windowId) {
          await chrome.sidePanel.open({ windowId: sender.tab.windowId });
        }
        sendResponse({ success: true });
      } catch (err) {
        console.error('[E-Fill] Could not open side panel:', err);
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true; // Keep channel open for async response
  }
});

// Set badge or notify when extension installs / updates
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[E-Fill] Extension installed/updated:', details.reason);
});
