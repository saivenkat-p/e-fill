/**
 * E-Fill Side Panel Controller
 * Coordinates form review, live proposal editing, user approval, autofill triggering,
 * and user profile configuration.
 *
 * Key eligibility rule:
 *   The side panel always reflects the scan response from content.js.
 *   If the page is not eligible, it shows the ineligible state and suppresses field lists.
 *   It NEVER generates proposals for ineligible pages.
 */

(function () {
  'use strict';

  function getStorageManager() {
    return window.EFillStorage?.storageManager;
  }

  function getSourceSelector() {
    return window.EFillSourceSelector?.sourceSelector;
  }

  let currentProfile = null;
  let currentProposals = [];
  let currentActiveTabId = null;

  // DOM Elements
  const tabReviewBtn = document.getElementById('tab-review-btn');
  const tabProfileBtn = document.getElementById('tab-profile-btn');
  const viewReview = document.getElementById('view-review');
  const viewProfile = document.getElementById('view-profile');

  const pageTitleEl = document.getElementById('page-title');
  const pageUrlEl = document.getElementById('page-url');
  const eligibilityDot = document.getElementById('eligibility-dot');
  const eligibilityLabel = document.getElementById('eligibility-label');
  const btnRescan = document.getElementById('btn-rescan');
  const summaryBar = document.getElementById('summary-bar');
  const countReadyEl = document.getElementById('count-ready');
  const countReviewEl = document.getElementById('count-review');
  const countUnavailableEl = document.getElementById('count-unavailable');
  const ineligibleStateEl = document.getElementById('ineligible-state');
  const ineligibleReasonEl = document.getElementById('ineligible-reason');
  const emptyStateEl = document.getElementById('empty-state');
  const proposalsListEl = document.getElementById('proposals-list');
  const approvedCountText = document.getElementById('approved-count-text');
  const btnAutofill = document.getElementById('btn-autofill');
  const resultAlertEl = document.getElementById('result-alert');

  // Profile Form Elements
  const profileForm = document.getElementById('profile-form');
  const btnResetProfile = document.getElementById('btn-reset-profile');
  const saveToast = document.getElementById('save-toast');

  // Initialize
  document.addEventListener('DOMContentLoaded', async () => {
    setupTabNavigation();
    await loadProfile();
    setupProfileForm();
    await scanActiveTab();

    btnRescan.addEventListener('click', () => scanActiveTab());
    btnAutofill.addEventListener('click', handleAutofill);

    // Keep Side Panel in sync as the user switches tabs or navigates
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.onActivated.addListener(async () => {
        await scanActiveTab();
      });

      chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
        if (changeInfo.status === 'complete' && tabId === currentActiveTabId) {
          await scanActiveTab();
        }
      });
    }
  });

  function setupTabNavigation() {
    tabReviewBtn.addEventListener('click', () => {
      tabReviewBtn.classList.add('active');
      tabProfileBtn.classList.remove('active');
      viewReview.classList.add('active');
      viewProfile.classList.remove('active');
    });

    tabProfileBtn.addEventListener('click', () => {
      tabProfileBtn.classList.add('active');
      tabReviewBtn.classList.remove('active');
      viewProfile.classList.add('active');
      viewReview.classList.remove('active');
    });
  }

  async function loadProfile() {
    const sm = getStorageManager();
    if (!sm) return;
    currentProfile = await sm.getProfile();
    populateProfileForm(currentProfile);
  }

  function populateProfileForm(p) {
    if (!p) return;
    const personal = p.personal || {};
    const contact = p.contact || {};
    const family = p.family || {};
    const address = p.address || {};

    document.getElementById('prof-fullName').value = personal.fullName || '';
    document.getElementById('prof-dob').value = personal.dob || '';
    document.getElementById('prof-gender').value = personal.gender || 'Male';

    document.getElementById('prof-mobile').value = contact.primaryPhone || '';
    document.getElementById('prof-email').value = contact.email || '';

    document.getElementById('prof-fatherName').value = family.fatherName || '';
    document.getElementById('prof-motherName').value = family.motherName || '';

    document.getElementById('prof-addressLine').value = address.addressLine || '';
    document.getElementById('prof-district').value = address.district || '';
    document.getElementById('prof-state').value = address.state || '';
    document.getElementById('prof-pincode').value = address.pincode || '';
  }

  function setupProfileForm() {
    const sm = getStorageManager();

    profileForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!currentProfile) currentProfile = {};

      currentProfile.personal = currentProfile.personal || {};
      currentProfile.personal.fullName = document.getElementById('prof-fullName').value.trim();
      currentProfile.personal.dob = document.getElementById('prof-dob').value;
      currentProfile.personal.gender = document.getElementById('prof-gender').value;

      currentProfile.contact = currentProfile.contact || {};
      currentProfile.contact.primaryPhone = document.getElementById('prof-mobile').value.trim();
      currentProfile.contact.email = document.getElementById('prof-email').value.trim();

      currentProfile.family = currentProfile.family || {};
      currentProfile.family.fatherName = document.getElementById('prof-fatherName').value.trim();
      currentProfile.family.motherName = document.getElementById('prof-motherName').value.trim();

      currentProfile.address = currentProfile.address || {};
      currentProfile.address.addressLine = document.getElementById('prof-addressLine').value.trim();
      currentProfile.address.district = document.getElementById('prof-district').value.trim();
      currentProfile.address.state = document.getElementById('prof-state').value.trim();
      currentProfile.address.pincode = document.getElementById('prof-pincode').value.trim();

      if (sm) await sm.saveProfile(currentProfile);

      saveToast.style.display = 'inline';
      setTimeout(() => { saveToast.style.display = 'none'; }, 2500);

      await scanActiveTab();
    });

    btnResetProfile.addEventListener('click', async () => {
      if (confirm('Reset profile to default sample data?')) {
        if (sm) {
          currentProfile = await sm.resetToDefaultProfile();
          populateProfileForm(currentProfile);
          await scanActiveTab();
        }
      }
    });
  }

  async function getActiveTab() {
    if (typeof chrome === 'undefined' || !chrome.tabs) return null;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  async function scanActiveTab() {
    resultAlertEl.style.display = 'none';
    const tab = await getActiveTab();

    if (!tab || !tab.id) {
      pageTitleEl.textContent = 'No active tab found';
      pageUrlEl.textContent = 'Please select a browser tab';
      showIneligibleState('No active browser tab');
      return;
    }

    currentActiveTabId = tab.id;
    pageTitleEl.textContent = tab.title || 'Untitled Page';
    pageUrlEl.textContent = tab.url || '';

    // Handle browser-internal pages before messaging (can't send messages there)
    if (tab.url && (
      tab.url.startsWith('chrome://') ||
      tab.url.startsWith('edge://') ||
      tab.url.startsWith('about:') ||
      tab.url.startsWith('chrome-extension://')
    )) {
      showIneligibleState('E-Fill does not operate on browser system pages');
      return;
    }

    try {
      chrome.tabs.sendMessage(tab.id, { action: 'SCAN_PAGE' }, async (response) => {
        if (chrome.runtime.lastError || !response || !response.data) {
          // Content script not yet loaded — attempt dynamic injection
          try {
            if (chrome.scripting) {
              await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: [
                  'core/canonical-schema.js',
                  'core/normalizer.js',
                  'core/app-profiles.js',
                  'core/page-classifier.js',
                  'content/field-reader.js',
                  'content/form-detector.js',
                  'content/indicator.js',
                  'content/autofill.js',
                  'content/content.js'
                ]
              });

              chrome.tabs.sendMessage(tab.id, { action: 'SCAN_PAGE' }, (retryRes) => {
                if (retryRes && retryRes.data) {
                  renderScanResults(retryRes.data);
                } else {
                  showIneligibleState('Could not communicate with this page');
                }
              });
            }
          } catch (injectErr) {
            console.warn('[E-Fill] Injection not permitted:', injectErr);
            showIneligibleState('E-Fill cannot operate on this page');
          }
          return;
        }

        renderScanResults(response.data);
      });
    } catch (err) {
      console.warn('[E-Fill] Scan error:', err);
      showIneligibleState('Scan error occurred');
    }
  }

  /**
   * Primary rendering function.
   * Checks eligibility from the scan result and branches accordingly.
   */
  function renderScanResults(scanData) {
    if (!scanData) {
      showIneligibleState('No response from page');
      return;
    }

    // --- INELIGIBLE PAGE ---
    if (!scanData.eligible) {
      showIneligibleState(scanData.eligibilityReason || 'Page not recognized as a supported application');
      return;
    }

    // --- ELIGIBLE PAGE ---
    const profileName = scanData.profile?.name || 'Supported Application';
    setEligibleUI(profileName);

    if (!scanData.fields || scanData.fields.length === 0) {
      showEmptyScan();
      return;
    }

    // Show summary bar and proposals
    summaryBar.style.display = 'flex';
    ineligibleStateEl.style.display = 'none';
    emptyStateEl.style.display = 'none';
    proposalsListEl.style.display = 'flex';
    proposalsListEl.innerHTML = '';

    const selector = getSourceSelector();
    currentProposals = selector ? selector.generateProposals(scanData.fields, currentProfile) : [];

    let readyCount = 0, reviewCount = 0, unavailableCount = 0;

    currentProposals.forEach((proposal, idx) => {
      if (proposal.status === 'READY') readyCount++;
      else if (proposal.status === 'REVIEW_REQUIRED') reviewCount++;
      else unavailableCount++;

      proposalsListEl.appendChild(createProposalCard(proposal, idx));
    });

    updateCounts(readyCount, reviewCount, unavailableCount);
    updateActionBar();
  }

  /**
   * Show the ineligible state — clears proposals, hides action bar.
   */
  function showIneligibleState(reason) {
    setIneligibleUI();
    summaryBar.style.display = 'none';
    emptyStateEl.style.display = 'none';
    proposalsListEl.style.display = 'none';
    proposalsListEl.innerHTML = '';

    ineligibleStateEl.style.display = 'block';
    if (ineligibleReasonEl) {
      ineligibleReasonEl.textContent = reason || '';
    }

    currentProposals = [];
    updateActionBar();
  }

  function showEmptyScan() {
    summaryBar.style.display = 'none';
    ineligibleStateEl.style.display = 'none';
    proposalsListEl.style.display = 'none';
    emptyStateEl.style.display = 'block';
    currentProposals = [];
    updateActionBar();
  }

  function setEligibleUI(appName) {
    eligibilityDot.className = 'eligibility-dot supported';
    eligibilityLabel.className = 'eligibility-label supported';
    eligibilityLabel.textContent = 'Supported application detected';
    pageTitleEl.textContent = appName;
  }

  function setIneligibleUI() {
    eligibilityDot.className = 'eligibility-dot unsupported';
    eligibilityLabel.className = 'eligibility-label unsupported';
    eligibilityLabel.textContent = 'No supported application detected';
  }

  function createProposalCard(proposal, index) {
    const card = document.createElement('div');
    const statusClass = proposal.status.toLowerCase().replace(/_/g, '-');
    card.className = `proposal-card ${statusClass}`;
    card.setAttribute('data-card-field-id', proposal.fieldId);

    let badgeText = 'Ready';
    let badgeClass = 'badge-ready';
    if (proposal.status === 'REVIEW_REQUIRED') {
      badgeText = 'Review Required';
      badgeClass = 'badge-review';
    } else if (proposal.status === 'UNAVAILABLE' || proposal.status === 'UNIDENTIFIED') {
      badgeText = 'Unavailable';
      badgeClass = 'badge-unavailable';
    }

    const isDisabled = proposal.status === 'UNAVAILABLE' || proposal.status === 'UNIDENTIFIED';

    card.innerHTML = `
      <div class="card-top">
        <label class="field-checkbox-label">
          <input type="checkbox" class="prop-checkbox" ${proposal.approved ? 'checked' : ''} ${isDisabled ? 'disabled' : ''}>
          <span>${escapeHtml(proposal.label)}</span>
        </label>
        <span class="status-badge ${badgeClass}" id="badge-${index}">${badgeText}</span>
      </div>
      <div class="field-value-box">
        <input type="text" class="value-input" value="${escapeHtml(proposal.proposedValue || '')}" placeholder="${isDisabled ? 'No value in profile' : 'Value'}" ${isDisabled ? 'disabled' : ''}>
      </div>
      <div class="card-bottom">
        <span class="source-tag">📂 ${escapeHtml(proposal.source)}</span>
        <span class="reason-tooltip" title="${escapeHtml(proposal.reason)}">${escapeHtml(proposal.reason)}</span>
      </div>
    `;

    const checkbox = card.querySelector('.prop-checkbox');
    checkbox.addEventListener('change', (e) => {
      proposal.approved = e.target.checked;
      updateActionBar();
    });

    const input = card.querySelector('.value-input');
    input.addEventListener('input', (e) => {
      proposal.proposedValue = e.target.value;
      proposal.userEdited = true;
      if (!proposal.approved && !isDisabled) {
        proposal.approved = true;
        checkbox.checked = true;
        updateActionBar();
      }
    });

    card.addEventListener('mouseenter', () => {
      if (currentActiveTabId && typeof chrome !== 'undefined' && chrome.tabs) {
        chrome.tabs.sendMessage(currentActiveTabId, {
          action: 'HIGHLIGHT_FIELD',
          fieldId: proposal.fieldId,
          selector: proposal.selector
        }, () => { if (chrome.runtime.lastError) {} });
      }
    });

    card.addEventListener('mouseleave', () => {
      if (currentActiveTabId && typeof chrome !== 'undefined' && chrome.tabs) {
        chrome.tabs.sendMessage(currentActiveTabId, { action: 'CLEAR_HIGHLIGHT' }, () => {
          if (chrome.runtime.lastError) {}
        });
      }
    });

    return card;
  }

  function updateCounts(ready, review, unavailable) {
    countReadyEl.textContent = ready;
    countReviewEl.textContent = review;
    countUnavailableEl.textContent = unavailable;
  }

  function updateActionBar() {
    const approved = currentProposals.filter(p => p.approved);
    const count = approved.length;
    approvedCountText.textContent = `${count} field${count === 1 ? '' : 's'} selected to fill`;
    btnAutofill.disabled = count === 0;
    btnAutofill.textContent = `⚡ Autofill Approved Fields (${count})`;
  }

  async function handleAutofill() {
    const approvedProposals = currentProposals.filter(p => p.approved);
    if (approvedProposals.length === 0 || !currentActiveTabId) return;

    btnAutofill.disabled = true;
    btnAutofill.textContent = 'Autofilling...';

    chrome.tabs.sendMessage(
      currentActiveTabId,
      { action: 'AUTOFILL_APPROVED', approvedProposals },
      (res) => {
        btnAutofill.disabled = false;
        updateActionBar();

        if (chrome.runtime.lastError || !res || !res.report) {
          showResultAlert('Failed to communicate with page for autofill.', false);
          return;
        }

        const report = res.report;
        if (report.success) {
          showResultAlert(`✅ Successfully filled ${report.filledCount} of ${report.totalAttempted} approved fields.`, true);

          (report.results || []).forEach(r => {
            if (r.success) {
              const card = proposalsListEl.querySelector(`[data-card-field-id="${CSS.escape(r.fieldId)}"]`);
              if (card) {
                const badge = card.querySelector('.status-badge');
                if (badge) {
                  badge.textContent = '✓ Filled';
                  badge.className = 'status-badge badge-ready';
                }
              }
            }
          });
        } else {
          showResultAlert(`⚠️ Fill completed with errors: ${report.failedCount} fields failed.`, false);
        }
      }
    );
  }

  function showResultAlert(msg, isSuccess) {
    resultAlertEl.textContent = msg;
    resultAlertEl.className = `result-alert ${isSuccess ? 'success' : 'warning'}`;
    resultAlertEl.style.display = 'block';
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
})();
