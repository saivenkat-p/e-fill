/**
 * E-Fill Side Panel Controller
 * Coordinates form review, live proposal editing, user approval, autofill triggering,
 * and user profile configuration.
 */

(function () {
  'use strict';

  const storageManager = window.EFillStorage?.storageManager;
  const sourceSelector = window.EFillSourceSelector?.sourceSelector;

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
  const btnRescan = document.getElementById('btn-rescan');
  const countReadyEl = document.getElementById('count-ready');
  const countReviewEl = document.getElementById('count-review');
  const countUnavailableEl = document.getElementById('count-unavailable');
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
    if (!storageManager) return;
    currentProfile = await storageManager.getProfile();
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

      await storageManager.saveProfile(currentProfile);

      saveToast.style.display = 'inline';
      setTimeout(() => {
        saveToast.style.display = 'none';
      }, 2500);

      // Refresh proposals with updated profile data
      await scanActiveTab();
    });

    btnResetProfile.addEventListener('click', async () => {
      if (confirm('Reset profile to default sample data?')) {
        currentProfile = await storageManager.resetToDefaultProfile();
        populateProfileForm(currentProfile);
        await scanActiveTab();
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
      return;
    }

    currentActiveTabId = tab.id;
    pageTitleEl.textContent = tab.title || 'Untitled Page';
    pageUrlEl.textContent = tab.url || '';

    try {
      chrome.tabs.sendMessage(tab.id, { action: 'SCAN_PAGE' }, (response) => {
        if (chrome.runtime.lastError || !response || !response.data) {
          // Content script may not be loaded yet
          emptyStateEl.style.display = 'block';
          proposalsListEl.style.display = 'none';
          updateCounts(0, 0, 0);
          updateActionBar();
          return;
        }

        renderScanResults(response.data);
      });
    } catch (err) {
      console.warn('[E-Fill] Scan error:', err);
    }
  }

  function renderScanResults(scanData) {
    if (!scanData || !scanData.fields || scanData.fields.length === 0) {
      emptyStateEl.style.display = 'block';
      proposalsListEl.style.display = 'none';
      updateCounts(0, 0, 0);
      updateActionBar();
      return;
    }

    emptyStateEl.style.display = 'none';
    proposalsListEl.style.display = 'flex';
    proposalsListEl.innerHTML = '';

    // Generate proposals based on current user profile
    currentProposals = sourceSelector ? sourceSelector.generateProposals(scanData.fields, currentProfile) : [];

    let readyCount = 0;
    let reviewCount = 0;
    let unavailableCount = 0;

    currentProposals.forEach((proposal, idx) => {
      if (proposal.status === 'READY') readyCount++;
      else if (proposal.status === 'REVIEW_REQUIRED') reviewCount++;
      else unavailableCount++;

      const card = createProposalCard(proposal, idx);
      proposalsListEl.appendChild(card);
    });

    updateCounts(readyCount, reviewCount, unavailableCount);
    updateActionBar();
  }

  function createProposalCard(proposal, index) {
    const card = document.createElement('div');
    const statusClass = proposal.status.toLowerCase().replace('_', '-');
    card.className = `proposal-card ${statusClass}`;

    let badgeText = 'Ready';
    let badgeClass = 'badge-ready';
    if (proposal.status === 'REVIEW_REQUIRED') {
      badgeText = 'Review Required';
      badgeClass = 'badge-review';
    } else if (proposal.status === 'UNAVAILABLE' || proposal.status === 'UNIDENTIFIED') {
      badgeText = 'Unavailable';
      badgeClass = 'badge-unavailable';
    }

    card.innerHTML = `
      <div class="card-top">
        <label class="field-checkbox-label">
          <input type="checkbox" class="prop-checkbox" ${proposal.approved ? 'checked' : ''} ${proposal.status === 'UNAVAILABLE' || proposal.status === 'UNIDENTIFIED' ? 'disabled' : ''}>
          <span>${escapeHtml(proposal.label)}</span>
        </label>
        <span class="status-badge ${badgeClass}">${badgeText}</span>
      </div>

      <div class="field-value-box">
        <input type="text" class="value-input" value="${escapeHtml(proposal.proposedValue || '')}" placeholder="${proposal.status === 'UNAVAILABLE' ? 'No value in profile' : 'Value'}" ${proposal.status === 'UNAVAILABLE' || proposal.status === 'UNIDENTIFIED' ? 'disabled' : ''}>
      </div>

      <div class="card-bottom">
        <span class="source-tag">📂 ${escapeHtml(proposal.source)}</span>
        <span class="reason-tooltip" title="${escapeHtml(proposal.reason)}">${escapeHtml(proposal.reason)}</span>
      </div>
    `;

    // Checkbox toggle
    const checkbox = card.querySelector('.prop-checkbox');
    checkbox.addEventListener('change', (e) => {
      proposal.approved = e.target.checked;
      updateActionBar();
    });

    // In-line value edit
    const input = card.querySelector('.value-input');
    input.addEventListener('input', (e) => {
      proposal.proposedValue = e.target.value;
      proposal.userEdited = true;
      if (!proposal.approved && proposal.status !== 'UNAVAILABLE') {
        proposal.approved = true;
        checkbox.checked = true;
        updateActionBar();
      }
    });

    // Hover to highlight on the web page
    card.addEventListener('mouseenter', () => {
      if (currentActiveTabId) {
        chrome.tabs.sendMessage(currentActiveTabId, {
          action: 'HIGHLIGHT_FIELD',
          fieldId: proposal.fieldId,
          selector: proposal.selector
        });
      }
    });

    card.addEventListener('mouseleave', () => {
      if (currentActiveTabId) {
        chrome.tabs.sendMessage(currentActiveTabId, { action: 'CLEAR_HIGHLIGHT' });
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
