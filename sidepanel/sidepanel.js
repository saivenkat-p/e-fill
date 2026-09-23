/**
 * E-Fill Side Panel Controller
 * ============================
 * Coordinates:
 *   - Review & Fill tab: eligibility-aware form scan, availability-grouped proposals
 *   - My Information tab: full structured profile with provenance, multi-record education, banking masking
 *
 * Eligibility rule: NEVER generates proposals for ineligible pages.
 * Availability states: AVAILABLE → READY, MISSING → UNAVAILABLE, CONFLICT, AMBIGUOUS, REVIEW_REQUIRED
 */

(function () {
  'use strict';

  // ── Module getters ─────────────────────────────────────────────────────────
  function getStorageManager() { return window.EFillStorage?.storageManager; }
  function getSourceSelector() { return window.EFillSourceSelector?.sourceSelector; }
  function getInformationProfileClass() { return window.EFillInformationProfile?.InformationProfile; }
  function getAvailabilityEngine() { return window.EFillAvailabilityEngine?.availabilityEngine; }

  // ── State ──────────────────────────────────────────────────────────────────
  let currentInfoProfile = null;   // InformationProfile instance (v2)
  let currentLegacyProfile = null; // Legacy flat profile (backward-compat)
  let currentProposals = [];
  let currentActiveTabId = null;

  // ── DOM: Review tab ────────────────────────────────────────────────────────
  const tabReviewBtn       = document.getElementById('tab-review-btn');
  const tabInfoBtn         = document.getElementById('tab-info-btn');
  const viewReview         = document.getElementById('view-review');
  const viewInfo           = document.getElementById('view-info');

  const pageTitleEl        = document.getElementById('page-title');
  const pageUrlEl          = document.getElementById('page-url');
  const eligibilityDot     = document.getElementById('eligibility-dot');
  const eligibilityLabel   = document.getElementById('eligibility-label');
  const btnRescan          = document.getElementById('btn-rescan');
  const summaryBar         = document.getElementById('summary-bar');
  const countReadyEl       = document.getElementById('count-ready');
  const countReviewEl      = document.getElementById('count-review');
  const countConflictEl    = document.getElementById('count-conflict');
  const countUnavailableEl = document.getElementById('count-unavailable');
  const ineligibleStateEl  = document.getElementById('ineligible-state');
  const ineligibleReasonEl = document.getElementById('ineligible-reason');
  const emptyStateEl       = document.getElementById('empty-state');
  const proposalsListEl    = document.getElementById('proposals-list');
  const approvedCountText  = document.getElementById('approved-count-text');
  const btnAutofill        = document.getElementById('btn-autofill');
  const resultAlertEl      = document.getElementById('result-alert');

  // Proposal group stacks
  const groupReady    = document.getElementById('group-ready');
  const groupReview   = document.getElementById('group-review');
  const groupConflict = document.getElementById('group-conflict');
  const groupMissing  = document.getElementById('group-missing');
  const stackReady    = document.getElementById('stack-ready');
  const stackReview   = document.getElementById('stack-review');
  const stackConflict = document.getElementById('stack-conflict');
  const stackMissing  = document.getElementById('stack-missing');
  const gcReady    = document.getElementById('group-count-ready');
  const gcReview   = document.getElementById('group-count-review');
  const gcConflict = document.getElementById('group-count-conflict');
  const gcMissing  = document.getElementById('group-count-missing');

  // ── DOM: My Information tab ────────────────────────────────────────────────
  const btnResetInfo   = document.getElementById('btn-reset-info');
  const btnSaveInfo    = document.getElementById('btn-save-info');
  const saveToastInfo  = document.getElementById('save-toast-info');
  const eduContainer   = document.getElementById('edu-records-container');
  const btnAddEdu      = document.getElementById('btn-add-education');
  const eduCountBadge  = document.getElementById('edu-count-badge');

  // ── Initialize ─────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', async () => {
    setupTabNavigation();
    setupSectionToggles();
    setupRevealButtons();
    await loadInformationProfile();
    setupInfoForm();
    await scanActiveTab();

    btnRescan.addEventListener('click', () => scanActiveTab());
    btnAutofill.addEventListener('click', handleAutofill);

    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.onActivated.addListener(() => scanActiveTab());
      chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
        if (changeInfo.status === 'complete' && tabId === currentActiveTabId) {
          await scanActiveTab();
        }
      });
    }
  });

  // ── Tab Navigation ─────────────────────────────────────────────────────────
  function setupTabNavigation() {
    tabReviewBtn.addEventListener('click', () => {
      tabReviewBtn.classList.add('active');
      tabInfoBtn.classList.remove('active');
      viewReview.classList.add('active');
      viewInfo.classList.remove('active');
    });
    tabInfoBtn.addEventListener('click', () => {
      tabInfoBtn.classList.add('active');
      tabReviewBtn.classList.remove('active');
      viewInfo.classList.add('active');
      viewReview.classList.remove('active');
    });
  }

  // ── Collapsible Section Toggles ────────────────────────────────────────────
  function setupSectionToggles() {
    document.querySelectorAll('.section-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const expanded = btn.getAttribute('aria-expanded') === 'true';
        btn.setAttribute('aria-expanded', !expanded);
        const body = btn.nextElementSibling;
        if (body && body.classList.contains('section-body')) {
          body.style.display = expanded ? 'none' : 'flex';
        }
      });
    });
  }

  // ── Reveal Buttons (banking / identity masking) ────────────────────────────
  function setupRevealButtons() {
    document.querySelectorAll('.btn-reveal').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-target');
        const input = document.getElementById(targetId);
        if (!input) return;
        const isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';
        btn.textContent = isPassword ? '🙈' : '👁';
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════
  //   MY INFORMATION TAB
  // ═══════════════════════════════════════════════════════════════

  async function loadInformationProfile() {
    const sm = getStorageManager();
    const IPClass = getInformationProfileClass();
    if (!sm || !IPClass) return;

    try {
      const raw = await sm.getInformationProfile();
      if (raw && raw.version === '2.0') {
        currentInfoProfile = IPClass.fromJSON(raw);
      } else if (raw) {
        currentInfoProfile = IPClass.migrateFromLegacy(raw);
      } else {
        currentInfoProfile = new IPClass(null);
      }
    } catch (e) {
      console.warn('[E-Fill] Could not load information profile:', e);
      if (IPClass) currentInfoProfile = new IPClass(null);
    }

    // Also keep legacy profile for backward-compat with source-selector fallback
    try {
      const legacySm = getStorageManager();
      currentLegacyProfile = legacySm ? await legacySm.getProfile() : null;
    } catch (e) {}

    populateInfoForm();
  }

  function populateInfoForm() {
    if (!currentInfoProfile) return;
    const ip = currentInfoProfile;

    // Populate all [data-field] inputs from the information profile
    document.querySelectorAll('[data-field]').forEach(el => {
      const fid = el.getAttribute('data-field');
      const val = ip.getValue(fid);
      if (el.tagName === 'SELECT') {
        el.value = val || '';
      } else {
        el.value = val || '';
      }
    });

    // Education records
    renderEducationRecords();
  }

  function renderEducationRecords() {
    if (!currentInfoProfile || !eduContainer) return;
    const records = currentInfoProfile.getEducationRecords();
    eduContainer.innerHTML = '';

    records.forEach(rec => {
      eduContainer.appendChild(buildEduRecordCard(rec));
    });

    if (eduCountBadge) {
      eduCountBadge.textContent = `${records.length} record${records.length !== 1 ? 's' : ''}`;
    }
  }

  function buildEduRecordCard(rec) {
    const fg = (fid) => {
      if (!rec.fields || !rec.fields[fid]) return '';
      return rec.fields[fid].value || '';
    };

    const card = document.createElement('div');
    card.className = 'edu-record-card';
    card.setAttribute('data-edu-id', rec.id);
    card.innerHTML = `
      <div class="edu-record-header">
        <input type="text" class="edu-record-title-input" value="${escapeHtml(rec.qualification || '')}" placeholder="e.g. 10th / SSC, B.Tech" data-edu-qual>
        <button type="button" class="btn-delete-edu" title="Remove this record">✕</button>
      </div>
      <div class="form-row two-col">
        <div class="form-group">
          <label>Institution / School / College</label>
          <input type="text" value="${escapeHtml(fg('edu_institution'))}" data-edu-field="edu_institution" placeholder="Name of institution">
        </div>
        <div class="form-group">
          <label>Board / University</label>
          <input type="text" value="${escapeHtml(fg('edu_board'))}" data-edu-field="edu_board">
        </div>
      </div>
      <div class="form-row three-col">
        <div class="form-group">
          <label>Year of Passing</label>
          <input type="text" value="${escapeHtml(fg('edu_year'))}" data-edu-field="edu_year" maxlength="4">
        </div>
        <div class="form-group">
          <label>Percentage / CGPA</label>
          <input type="text" value="${escapeHtml(fg('edu_percentage'))}" data-edu-field="edu_percentage">
        </div>
        <div class="form-group">
          <label>Roll Number</label>
          <input type="text" value="${escapeHtml(fg('edu_roll_number'))}" data-edu-field="edu_roll_number">
        </div>
      </div>
      <div class="form-row two-col">
        <div class="form-group">
          <label>Marks Obtained</label>
          <input type="text" value="${escapeHtml(fg('edu_marks'))}" data-edu-field="edu_marks">
        </div>
        <div class="form-group">
          <label>Maximum Marks</label>
          <input type="text" value="${escapeHtml(fg('edu_max_marks'))}" data-edu-field="edu_max_marks">
        </div>
      </div>
    `;

    // Delete button
    card.querySelector('.btn-delete-edu').addEventListener('click', () => {
      if (confirm(`Remove "${rec.qualification || 'this record'}"?`)) {
        currentInfoProfile.removeEducationRecord(rec.id);
        renderEducationRecords();
      }
    });

    // Qualification title change
    card.querySelector('[data-edu-qual]').addEventListener('change', (e) => {
      rec.qualification = e.target.value.trim();
    });

    // Education field inputs
    card.querySelectorAll('[data-edu-field]').forEach(input => {
      input.addEventListener('change', (e) => {
        const fid = input.getAttribute('data-edu-field');
        currentInfoProfile.updateEducationRecord(rec.id, fid, e.target.value.trim(), 'USER_EDITED', 'User entry');
      });
    });

    return card;
  }

  function setupInfoForm() {
    // Add education record
    if (btnAddEdu) {
      btnAddEdu.addEventListener('click', () => {
        if (!currentInfoProfile) return;
        const qualifications = ['10th / SSC', '12th / Intermediate', 'Diploma', 'B.Tech / B.E', 'M.Tech / M.E', 'Graduation (Other)', 'Post Graduation'];
        const used = currentInfoProfile.getEducationRecords().map(r => r.qualification);
        const next = qualifications.find(q => !used.includes(q)) || 'Other';
        currentInfoProfile.addEducationRecord(`edu-${Date.now()}`, next);
        renderEducationRecords();
        // Auto-expand education section
        const eduSection = document.querySelector('[data-section="education"] .section-toggle');
        if (eduSection && eduSection.getAttribute('aria-expanded') !== 'true') {
          eduSection.click();
        }
      });
    }

    // Save info
    if (btnSaveInfo) {
      btnSaveInfo.addEventListener('click', async () => {
        await saveInformationProfile();
      });
    }

    // Reset to sample
    if (btnResetInfo) {
      btnResetInfo.addEventListener('click', async () => {
        if (!confirm('Reset to sample data? Your current saved information will be replaced.')) return;
        const sm = getStorageManager();
        const IPClass = getInformationProfileClass();
        if (!sm || !IPClass) return;
        const schema = window.EFillCanonicalSchema;
        if (!schema) return;
        const legacy = schema.DEFAULT_SYNTHETIC_PROFILE;
        const ip = IPClass.migrateFromLegacy(legacy);
        const raw = ip.toJSON();
        await sm.saveInformationProfile(raw);
        currentInfoProfile = ip;
        currentLegacyProfile = legacy;
        populateInfoForm();
        showSaveToast();
        await scanActiveTab();
      });
    }
  }

  async function saveInformationProfile() {
    if (!currentInfoProfile) return;

    // Read all [data-field] inputs and update the profile
    document.querySelectorAll('[data-field]').forEach(el => {
      const fid = el.getAttribute('data-field');
      const val = el.value.trim();
      // Only update if the field exists in the profile
      const existing = currentInfoProfile.getField(fid);
      if (existing !== null) {
        currentInfoProfile.setField(fid, val, 'USER_EDITED', 'Edited in side panel');
      }
    });

    const sm = getStorageManager();
    if (sm) {
      await sm.saveInformationProfile(currentInfoProfile.toJSON());
      // Also save legacy flat for backward-compat
      currentLegacyProfile = currentInfoProfile.toLegacyProfile();
      await sm.saveProfile(currentLegacyProfile);
    }

    showSaveToast();
    await scanActiveTab();
  }

  function showSaveToast() {
    if (!saveToastInfo) return;
    saveToastInfo.style.display = 'inline';
    setTimeout(() => { saveToastInfo.style.display = 'none'; }, 2500);
  }

  // ═══════════════════════════════════════════════════════════════
  //   REVIEW & FILL TAB
  // ═══════════════════════════════════════════════════════════════

  async function getActiveTab() {
    if (typeof chrome === 'undefined' || !chrome.tabs) return null;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  async function scanActiveTab() {
    if (resultAlertEl) resultAlertEl.style.display = 'none';
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
          try {
            if (chrome.scripting) {
              await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: [
                  'core/canonical-schema.js',
                  'core/normalizer.js',
                  'core/app-profiles.js',
                  'core/page-classifier.js',
                  'core/information-profile.js',
                  'core/availability-engine.js',
                  'core/source-selector.js',
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
   * Primary rendering: checks eligibility, then groups proposals by availability state.
   */
  function renderScanResults(scanData) {
    if (!scanData) { showIneligibleState('No response from page'); return; }
    if (!scanData.eligible) {
      showIneligibleState(scanData.eligibilityReason || 'Page not recognized as a supported application');
      return;
    }

    const profileName = scanData.profile?.name || 'Supported Application';
    setEligibleUI(profileName);

    if (!scanData.fields || scanData.fields.length === 0) {
      showEmptyScan();
      return;
    }

    summaryBar.style.display = 'flex';
    ineligibleStateEl.style.display = 'none';
    emptyStateEl.style.display = 'none';
    proposalsListEl.style.display = 'block';

    // Use the v2 InformationProfile if available, else legacy flat
    const profileForProposals = currentInfoProfile || currentLegacyProfile;

    const selector = getSourceSelector();
    currentProposals = selector
      ? selector.generateProposals(scanData.fields, profileForProposals)
      : [];

    // Clear group stacks
    stackReady.innerHTML = '';
    stackReview.innerHTML = '';
    stackConflict.innerHTML = '';
    stackMissing.innerHTML = '';

    let nReady = 0, nReview = 0, nConflict = 0, nMissing = 0;

    currentProposals.forEach((proposal, idx) => {
      const card = createProposalCard(proposal, idx);
      switch (proposal.status) {
        case 'READY':
          stackReady.appendChild(card);
          nReady++;
          break;
        case 'REVIEW_REQUIRED':
        case 'AMBIGUOUS':
          stackReview.appendChild(card);
          nReview++;
          break;
        case 'CONFLICT':
          stackConflict.appendChild(card);
          nConflict++;
          break;
        default: // UNAVAILABLE, UNIDENTIFIED
          stackMissing.appendChild(card);
          nMissing++;
          break;
      }
    });

    // Show/hide groups
    showGroup(groupReady, nReady, gcReady);
    showGroup(groupReview, nReview, gcReview);
    showGroup(groupConflict, nConflict, gcConflict);
    showGroup(groupMissing, nMissing, gcMissing);

    // Update summary bar counts
    countReadyEl.textContent = nReady;
    countReviewEl.textContent = nReview;
    countConflictEl.textContent = nConflict;
    countUnavailableEl.textContent = nMissing;

    updateActionBar();
  }

  function showGroup(groupEl, count, countEl) {
    if (!groupEl) return;
    groupEl.style.display = count > 0 ? 'flex' : 'none';
    if (countEl) countEl.textContent = count;
  }

  function showIneligibleState(reason) {
    setIneligibleUI();
    summaryBar.style.display = 'none';
    emptyStateEl.style.display = 'none';
    proposalsListEl.style.display = 'none';
    if (stackReady) stackReady.innerHTML = '';
    if (stackReview) stackReview.innerHTML = '';
    if (stackConflict) stackConflict.innerHTML = '';
    if (stackMissing) stackMissing.innerHTML = '';

    ineligibleStateEl.style.display = 'block';
    if (ineligibleReasonEl) ineligibleReasonEl.textContent = reason || '';

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

  // ── Proposal Card Builder ───────────────────────────────────────────────────

  function createProposalCard(proposal, index) {
    const card = document.createElement('div');
    const st = proposal.status;

    // Card border class
    let cardClass = 'proposal-card';
    if (st === 'READY')           cardClass += ' ready';
    else if (st === 'REVIEW_REQUIRED' || st === 'AMBIGUOUS') cardClass += ' review';
    else if (st === 'CONFLICT')   cardClass += ' conflict';
    else                          cardClass += ' unavailable';

    card.className = cardClass;
    card.setAttribute('data-card-field-id', proposal.fieldId || '');

    // Badge
    const badges = {
      READY:            ['READY', 'badge-ready'],
      REVIEW_REQUIRED:  ['REVIEW', 'badge-review'],
      AMBIGUOUS:        ['AMBIGUOUS', 'badge-ambiguous'],
      CONFLICT:         ['CONFLICT', 'badge-conflict'],
      UNAVAILABLE:      ['MISSING', 'badge-unavailable'],
      UNIDENTIFIED:     ['UNIDENTIFIED', 'badge-unavailable']
    };
    const [badgeText, badgeClass] = badges[st] || ['—', 'badge-unavailable'];

    const isDisabled = (st === 'UNAVAILABLE' || st === 'UNIDENTIFIED' || st === 'CONFLICT');

    // Provenance tag
    const provLabel = proposal.provenanceLabel
      ? `<div class="provenance-tag">${escapeHtml(proposal.provenanceLabel)}</div>`
      : '';

    // Source tag
    const sourceStr = proposal.source ? escapeHtml(proposal.source) : '—';

    card.innerHTML = `
      <div class="card-top">
        <label class="field-checkbox-label">
          <input type="checkbox" class="prop-checkbox" ${proposal.approved ? 'checked' : ''} ${isDisabled ? 'disabled' : ''}>
          <span>${escapeHtml(proposal.label || proposal.canonicalId || 'Field')}</span>
        </label>
        <span class="status-badge ${badgeClass}" id="badge-${index}">${badgeText}</span>
      </div>
      ${st === 'CONFLICT' ? buildConflictOptions(proposal, index) : `
      <div class="field-value-box">
        <input type="text" class="value-input"
          value="${escapeHtml(proposal.proposedValue || '')}"
          placeholder="${isDisabled ? 'Not available in profile' : 'Value'}"
          ${isDisabled ? 'disabled' : ''}>
        ${provLabel}
      </div>`}
      <div class="card-bottom">
        <span class="source-tag">📂 ${sourceStr}</span>
        <span class="reason-tooltip" title="${escapeHtml(proposal.reason)}">${escapeHtml(
          (proposal.reason || '').length > 60
            ? proposal.reason.substring(0, 57) + '...'
            : (proposal.reason || '')
        )}</span>
      </div>
    `;

    const checkbox = card.querySelector('.prop-checkbox');
    if (checkbox) {
      checkbox.addEventListener('change', (e) => {
        proposal.approved = e.target.checked;
        updateActionBar();
      });
    }

    const input = card.querySelector('.value-input');
    if (input) {
      input.addEventListener('input', (e) => {
        proposal.proposedValue = e.target.value;
        proposal.userEdited = true;
        if (!proposal.approved && !isDisabled) {
          proposal.approved = true;
          if (checkbox) checkbox.checked = true;
          updateActionBar();
        }
      });
    }

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

  function buildConflictOptions(proposal, index) {
    if (!proposal.conflicts || proposal.conflicts.length === 0) return '';
    const opts = proposal.conflicts.map((c, ci) => `
      <label class="conflict-option">
        <input type="radio" name="conflict-${index}" value="${ci}" class="conflict-radio">
        <span class="conflict-option-value">${escapeHtml(c.value)}</span>
        <span class="conflict-option-source">${escapeHtml(c.source || c.provenance || '')}</span>
      </label>
    `).join('');

    return `
      <div class="field-value-box">
        <div class="conflict-options" data-conflict-idx="${index}">${opts}</div>
      </div>
    `;
  }

  // Wire up conflict radio buttons after adding to DOM
  function wireConflictRadios() {
    document.querySelectorAll('.conflict-options').forEach(container => {
      const idx = parseInt(container.getAttribute('data-conflict-idx'));
      const proposal = currentProposals[idx];
      if (!proposal) return;

      container.querySelectorAll('.conflict-radio').forEach(radio => {
        radio.addEventListener('change', (e) => {
          const ci = parseInt(e.target.value);
          const chosen = proposal.conflicts[ci];
          if (chosen) {
            proposal.proposedValue = chosen.value;
            proposal.status = 'REVIEW_REQUIRED';
            proposal.approved = false;
          }
        });
      });
    });
  }

  // ── Action Bar ─────────────────────────────────────────────────────────────

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
              const card = document.querySelector(`[data-card-field-id="${CSS.escape(r.fieldId)}"]`);
              if (card) {
                const badge = card.querySelector('.status-badge');
                if (badge) { badge.textContent = '✓ Filled'; badge.className = 'status-badge badge-ready'; }
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

  // ── Utilities ──────────────────────────────────────────────────────────────

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

})();
