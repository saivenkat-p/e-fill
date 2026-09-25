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
  function getProfileManager() { return window.EFillProfileManager?.profileManager; }
  function getConflictEngine() { return window.EFillConflictEngine?.conflictEngine; }
  function getDocumentClassifier() { return window.EFillDocumentClassifier?.documentClassifier; }
  function getDocumentExtractor() { return window.EFillDocumentExtractor?.documentExtractor; }
  function getDocumentSourceManager() { return window.EFillDocumentSourceManager?.documentSourceManager; }
  function getImagePreparationEngine() { return window.EFillImagePreparationEngine?.imagePreparationEngine; }
  function getUploadPreparationEngine() { return window.EFillUploadPreparationEngine?.uploadPreparationEngine; }
  function getDocumentRequirementEngine() { return window.EFillDocumentRequirementEngine?.documentRequirementEngine; }
  function getFileValidator() { return window.EFillFileValidator?.fileValidator; }

  // ── State ──────────────────────────────────────────────────────────────────
  let currentInfoProfile = null;   // InformationProfile instance (v2)
  let currentLegacyProfile = null; // Legacy flat profile (backward-compat)
  let currentProposals = [];
  let currentActiveTabId = null;
  let activePreparedUploads = {};  // elementId -> { file, blob, filename, selector, elementId }
  let lastScanData = null;

  // ── DOM: Review tab ────────────────────────────────────────────────────────
  const tabReviewBtn       = document.getElementById('tab-review-btn');
  const tabInfoBtn         = document.getElementById('tab-info-btn');
  const viewReview         = document.getElementById('view-review');
  const viewInfo           = document.getElementById('view-info');
  const infoTabBadge       = document.getElementById('info-tab-badge');

  // Active Profile Banner in Review
  const activeProfileCard  = document.getElementById('active-profile-card');
  const activeProfileNameEl = document.getElementById('active-profile-name');
  const btnSwitchProfile   = document.getElementById('btn-switch-profile');

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
  const groupDocs     = document.getElementById('group-docs');
  const groupUploads  = document.getElementById('group-uploads');
  const stackReady    = document.getElementById('stack-ready');
  const stackReview   = document.getElementById('stack-review');
  const stackConflict = document.getElementById('stack-conflict');
  const stackMissing  = document.getElementById('stack-missing');
  const stackDocs     = document.getElementById('stack-docs');
  const stackUploads  = document.getElementById('stack-uploads');
  const gcReady    = document.getElementById('group-count-ready');
  const gcReview   = document.getElementById('group-count-review');
  const gcConflict = document.getElementById('group-count-conflict');
  const gcMissing  = document.getElementById('group-count-missing');
  const gcDocs     = document.getElementById('group-count-docs');
  const gcUploads  = document.getElementById('group-count-uploads');

  // ── DOM: My Information tab ────────────────────────────────────────────────
  const btnProfileDropdown = document.getElementById('btn-profile-dropdown');
  const profileDropdownMenu = document.getElementById('profile-dropdown-menu');
  const profileDropdownList = document.getElementById('profile-dropdown-list');
  const currentProfileDisplayNameEl = document.getElementById('current-profile-display-name');
  const btnOpenAddPerson   = document.getElementById('btn-open-add-person');

  const btnResetInfo        = document.getElementById('btn-reset-info');
  const btnSaveInfo         = document.getElementById('btn-save-info');
  const saveToastInfo       = document.getElementById('save-toast-info');
  const eduContainer        = document.getElementById('edu-records-container');
  const btnAddEdu           = document.getElementById('btn-add-education');
  const eduCountBadge       = document.getElementById('edu-count-badge');
  const btnOpenAddInfo      = document.getElementById('btn-open-add-info');
  const modalAddInfo        = document.getElementById('modal-add-info');
  const btnModalCloseAddInfo = document.getElementById('btn-modal-close-add-info');
  const btnCancelAddInfo    = document.getElementById('btn-cancel-add-info');
  const btnSubmitAddInfo    = document.getElementById('btn-submit-add-info');
  const addFieldNameInput   = document.getElementById('add-field-name');
  const addFieldCategorySelect = document.getElementById('add-field-category');
  const addFieldValueInput  = document.getElementById('add-field-value');
  const addFieldHint        = document.getElementById('add-field-hint');
  const addDuplicateWarning = document.getElementById('add-duplicate-warning');
  const addDuplicateDetail  = document.getElementById('add-duplicate-detail');
  const editCustomIdInput   = document.getElementById('edit-custom-id');
  const modalFieldTitle     = document.getElementById('modal-field-title');
  const sectionCustom       = document.getElementById('section-custom');
  const customFieldsContainer = document.getElementById('custom-fields-container');
  const customCountBadge    = document.getElementById('custom-count-badge');

  // Delete Confirmation Modal DOM
  const modalDeleteConfirm   = document.getElementById('modal-delete-confirm');
  const btnModalCloseDelete  = document.getElementById('btn-modal-close-delete');
  const btnCancelDelete      = document.getElementById('btn-cancel-delete');
  const btnConfirmDelete     = document.getElementById('btn-confirm-delete');
  const delFieldNameEl       = document.getElementById('del-field-name');
  const delFieldValEl        = document.getElementById('del-field-val');
  const delRefWarningEl      = document.getElementById('del-ref-warning');
  const delRefDetailEl       = document.getElementById('del-ref-detail');
  let pendingDeletionTarget  = null;

  // Add Person Modal DOM
  const modalAddPerson        = document.getElementById('modal-add-person');
  const btnModalCloseAddPerson = document.getElementById('btn-modal-close-add-person');
  const btnCancelAddPerson    = document.getElementById('btn-cancel-add-person');
  const btnSubmitAddPerson    = document.getElementById('btn-submit-add-person');
  const addPersonNameInput    = document.getElementById('add-person-name');
  const addPersonRelSelect    = document.getElementById('add-person-rel');

  // New Person / Different Person Modal DOM
  const modalNewPerson         = document.getElementById('modal-new-person-detected');
  const btnModalCloseNewPerson = document.getElementById('btn-modal-close-new-person');
  const curPersonNameEl        = document.getElementById('cur-person-name');
  const curPersonDetailsEl     = document.getElementById('cur-person-details');
  const extPersonNameEl        = document.getElementById('ext-person-name');
  const extPersonFieldsEl      = document.getElementById('ext-person-fields');
  const btnUseOnceDoc          = document.getElementById('btn-use-once-doc');
  const btnAddExistingDoc      = document.getElementById('btn-add-to-existing-profile');
  const btnCreateNewDoc        = document.getElementById('btn-create-new-person-from-doc');
  let pendingExtractedPersonDoc = null;

  // Conflict Modal DOM
  const modalConflict          = document.getElementById('modal-conflict-detected');
  const btnModalCloseConflict  = document.getElementById('btn-modal-close-conflict');
  const conflictFieldTitle     = document.getElementById('conflict-field-title');
  const conflictExistingVal    = document.getElementById('conflict-existing-val');
  const conflictDocVal         = document.getElementById('conflict-doc-val');
  const btnConflictKeep        = document.getElementById('btn-conflict-keep');
  const btnConflictUseDoc      = document.getElementById('btn-conflict-use-doc');
  const btnConflictEdit       = document.getElementById('btn-conflict-edit');
  const btnConflictUseOnce     = document.getElementById('btn-conflict-use-once');
  let pendingConflictData      = null;

  // Upload Preview Modal DOM
  const modalUploadPreview     = document.getElementById('modal-upload-preview');
  const btnModalClosePreview   = document.getElementById('btn-modal-close-preview');
  const previewStatusBadge     = document.getElementById('preview-status-badge');
  const prevOrigName           = document.getElementById('prev-orig-name');
  const prevOrigDims           = document.getElementById('prev-orig-dims');
  const prevOrigSize           = document.getElementById('prev-orig-size');
  const prevPrepName           = document.getElementById('prev-prep-name');
  const prevPrepDims           = document.getElementById('prev-prep-dims');
  const prevPrepSize           = document.getElementById('prev-prep-size');
  const prevPrepReqs           = document.getElementById('prev-prep-reqs');
  const previewImgContainer    = document.getElementById('preview-image-container');
  const previewImgElement      = document.getElementById('preview-img-element');
  const btnUseOrigFile         = document.getElementById('btn-use-original-file');
  const btnConfirmUsePrepared  = document.getElementById('btn-confirm-use-prepared');
  let pendingPreparedUpload    = null;

  // ── Document-First Profile DOM ─────────────────────────────────────────────
  const btnReviewAddDoc        = document.getElementById('btn-review-add-doc');
  const btnAddProfileDoc       = document.getElementById('btn-add-profile-doc');
  const profileDocFileInput    = document.getElementById('profile-doc-file-input');
  const profileViewContainer   = document.getElementById('profile-view-container');
  const emptyProfileView       = document.getElementById('empty-profile-view');
  const emptyPersonName        = document.getElementById('empty-person-name');
  const btnEmptyAddDoc         = document.getElementById('btn-empty-add-doc');
  const supportedDocsGrid      = document.getElementById('supported-docs-grid');
  const btnEmptyManualFallback = document.getElementById('btn-empty-manual-fallback');
  const populatedProfileView   = document.getElementById('populated-profile-view');
  const populatedSectionsContainer = document.getElementById('populated-sections-container');

  // Document Processed Modal DOM (Review Before Save)
  const modalDocProcessed      = document.getElementById('modal-document-processed');
  const btnModalCloseDocProcessed = document.getElementById('btn-modal-close-doc-processed');
  const btnCancelDocProcessed  = document.getElementById('btn-cancel-doc-processed');
  const btnSaveDocApproved     = document.getElementById('btn-save-doc-approved');
  const btnDocUseOnce          = document.getElementById('btn-doc-use-once');
  const docProcessedTitle      = document.getElementById('doc-processed-title');
  const docProcessedTargetName = document.getElementById('doc-processed-target-name');
  const docProcessedTypeLabel  = document.getElementById('doc-processed-type-label');
  const docProcessedFoundContainer = document.getElementById('doc-processed-found-container');
  const docProcessedNewList    = document.getElementById('doc-processed-new-list');
  const docProcessedExistingList = document.getElementById('doc-processed-existing-list');

  // Quick Edit Field Modal DOM
  const modalEditField         = document.getElementById('modal-edit-field');
  const btnModalCloseEditField = document.getElementById('btn-modal-close-edit-field');
  const btnCancelEditField     = document.getElementById('btn-cancel-edit-field');
  const btnSaveEditField       = document.getElementById('btn-save-edit-field');
  const editFieldTitle         = document.getElementById('edit-field-title');
  const editFieldLabel         = document.getElementById('edit-field-label');
  const editFieldValueInput    = document.getElementById('edit-field-value-input');
  const editFieldProvenanceHint = document.getElementById('edit-field-provenance-hint');

  let pendingProcessedDoc      = null; // { file, extracted, docTypeName }
  let pendingQuickEditTarget   = null; // { fieldId, label, currentValue, onSave }

  // ── Initialize ─────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', async () => {
    setupTabNavigation();
    setupSectionToggles();
    setupRevealButtons();
    setupAddInfoModal();
    setupDeleteConfirmModal();
    setupProfileModals();
    setupDocumentFirstProfileUI();
    setupQuickEditModal();
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

  function updateProfileNameDisplays(name) {
    const displayName = name || 'Sai Venkat';
    if (currentProfileDisplayNameEl) currentProfileDisplayNameEl.textContent = displayName;
    if (activeProfileNameEl) activeProfileNameEl.textContent = displayName;
  }

  async function loadInformationProfile() {
    const sm = getStorageManager();
    const IPClass = getInformationProfileClass();
    const pm = getProfileManager();

    if (pm && sm) {
      await pm.init(sm);
      const selected = pm.getSelectedProfile();
      if (selected && selected.profile) {
        currentInfoProfile = selected.profile;
        updateProfileNameDisplays(selected.name);
      }
      renderProfileDropdown();
    } else if (sm && IPClass) {
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
    }

    try {
      const legacySm = getStorageManager();
      currentLegacyProfile = legacySm ? await legacySm.getProfile() : null;
    } catch (e) {}

    populateInfoForm();
  }

  function renderProfileDropdown() {
    if (!profileDropdownList) return;
    const pm = getProfileManager();
    if (!pm) return;

    const profiles = pm.listProfiles();
    profileDropdownList.innerHTML = '';

    profiles.forEach(p => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = `profile-dropdown-item ${p.isSelected ? 'active' : ''}`;
      item.innerHTML = `
        <span>${escapeHtml(p.name)}</span>
        <span style="font-size:10px; color:var(--text-muted);">${escapeHtml(p.relationship)} ${p.isSelected ? '✓' : ''}</span>
      `;
      item.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (p.isSelected) {
          if (profileDropdownMenu) profileDropdownMenu.style.display = 'none';
          return;
        }
        await switchProfile(p.id);
      });
      profileDropdownList.appendChild(item);
    });
  }

  async function switchProfile(profileId) {
    const pm = getProfileManager();
    if (!pm) return;

    await pm.setSelectedProfileId(profileId);
    const selected = pm.getSelectedProfile();
    if (!selected) return;

    currentInfoProfile = selected.profile;
    updateProfileNameDisplays(selected.name);
    renderProfileDropdown();
    if (profileDropdownMenu) profileDropdownMenu.style.display = 'none';

    // Update continuous page form
    populateInfoForm();

    // Recalculate proposals for current application using newly selected profile
    await scanActiveTab();
  }

  function setupProfileModals() {
    if (btnProfileDropdown) {
      btnProfileDropdown.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!profileDropdownMenu) return;
        const isHidden = profileDropdownMenu.style.display === 'none';
        profileDropdownMenu.style.display = isHidden ? 'block' : 'none';
      });
    }

    document.addEventListener('click', (e) => {
      if (profileDropdownMenu && !profileDropdownMenu.contains(e.target) && e.target !== btnProfileDropdown) {
        profileDropdownMenu.style.display = 'none';
      }
    });

    if (btnSwitchProfile) {
      btnSwitchProfile.addEventListener('click', () => {
        tabInfoBtn.click();
        if (profileDropdownMenu) {
          profileDropdownMenu.style.display = 'block';
        }
      });
    }

    if (btnOpenAddPerson) {
      btnOpenAddPerson.addEventListener('click', () => {
        if (profileDropdownMenu) profileDropdownMenu.style.display = 'none';
        openAddPersonModal();
      });
    }
    if (btnModalCloseAddPerson) btnModalCloseAddPerson.addEventListener('click', closeAddPersonModal);
    if (btnCancelAddPerson) btnCancelAddPerson.addEventListener('click', closeAddPersonModal);
    if (btnSubmitAddPerson) btnSubmitAddPerson.addEventListener('click', handleCreatePerson);

    if (btnModalCloseNewPerson) btnModalCloseNewPerson.addEventListener('click', closeNewPersonModal);
    if (btnUseOnceDoc) {
      btnUseOnceDoc.addEventListener('click', () => {
        if (pendingExtractedPersonDoc) {
          const docSourceMgr = getDocumentSourceManager();
          if (docSourceMgr) {
            docSourceMgr.setUseOnceFields(pendingExtractedPersonDoc.extracted.fields, pendingExtractedPersonDoc.file?.name);
          }
          closeNewPersonModal();
          showSaveToastMessage('Using extracted data for current application only (Use Once)');
          scanActiveTab();
        }
      });
    }
    if (btnAddExistingDoc) {
      btnAddExistingDoc.addEventListener('click', async () => {
        if (pendingExtractedPersonDoc) {
          await mergeExtractedDataIntoCurrentProfile(pendingExtractedPersonDoc.extracted.fields);
          closeNewPersonModal();
        }
      });
    }
    if (btnCreateNewDoc) {
      btnCreateNewDoc.addEventListener('click', () => {
        const suggestedName = pendingExtractedPersonDoc?.ownership?.suggestedProfileName || 'New Person';
        const initialData = pendingExtractedPersonDoc?.extracted?.fields;
        closeNewPersonModal();
        openAddPersonModal(suggestedName, 'Brother', initialData);
      });
    }

    if (btnModalCloseConflict) btnModalCloseConflict.addEventListener('click', closeConflictModal);
    if (btnConflictKeep) btnConflictKeep.addEventListener('click', closeConflictModal);
    if (btnConflictUseDoc) {
      btnConflictUseDoc.addEventListener('click', async () => {
        if (pendingConflictData && currentInfoProfile) {
          const c = pendingConflictData;
          currentInfoProfile.setField(
            c.fieldId,
            c.incomingValue,
            'DOCUMENT_EXTRACTED',
            'Document confirmed',
            null,
            null,
            {
              sourceType: 'DOCUMENT',
              sourceDocumentType: c.sourceDocumentType || 'DOCUMENT',
              provenance: 'DOCUMENT_EXTRACTED',
              confidence: 0.95
            }
          );
          await saveInformationProfile(true);
          populateInfoForm();
          closeConflictModal();
          scanActiveTab();
          showSaveToastMessage(`Updated ${c.label || c.fieldId} from document`);
        }
      });
    }
    if (btnConflictEdit) {
      btnConflictEdit.addEventListener('click', () => {
        if (!pendingConflictData) return;
        const c = pendingConflictData;
        closeConflictModal();
        openQuickEditModal({
          fieldId: c.fieldId,
          label: c.label || c.fieldId,
          currentValue: c.incomingValue || c.existingValue || '',
          onSave: async (newVal) => {
            if (currentInfoProfile) {
              currentInfoProfile.setField(c.fieldId, newVal, 'USER_EDITED', 'User manual correction', null, null, {
                sourceType: 'MANUAL',
                provenance: 'USER_EDITED',
                confidence: 1.0
              });
              await saveInformationProfile(true);
              populateInfoForm();
              scanActiveTab();
              showSaveToastMessage(`Saved updated ${c.label || c.fieldId}`);
            }
          }
        });
      });
    }
    if (btnConflictUseOnce) {
      btnConflictUseOnce.addEventListener('click', () => {
        if (pendingConflictData) {
          const docSourceMgr = getDocumentSourceManager();
          if (docSourceMgr) {
            docSourceMgr.setUseOnceField(pendingConflictData.fieldId, pendingConflictData.incomingValue, 'Document (Use Once)');
          }
          closeConflictModal();
          scanActiveTab();
          showSaveToastMessage('Using document value for current application only');
        }
      });
    }

    if (btnModalClosePreview) btnModalClosePreview.addEventListener('click', closeUploadPreviewModal);
    if (btnUseOrigFile) {
      btnUseOrigFile.addEventListener('click', () => {
        if (pendingPreparedUpload) {
          activePreparedUploads[pendingPreparedUpload.uploadReq.elementId] = {
            file: pendingPreparedUpload.originalFile,
            blob: pendingPreparedUpload.originalFile,
            filename: pendingPreparedUpload.originalFile.name,
            elementId: pendingPreparedUpload.uploadReq.elementId,
            selector: pendingPreparedUpload.uploadReq.selector
          };
          closeUploadPreviewModal();
          if (lastScanData) renderScanResults(lastScanData);
        }
      });
    }
    if (btnConfirmUsePrepared) {
      btnConfirmUsePrepared.addEventListener('click', () => {
        if (pendingPreparedUpload) {
          const prep = pendingPreparedUpload.preparedResult;
          activePreparedUploads[pendingPreparedUpload.uploadReq.elementId] = {
            file: prep.prepared?.blob || pendingPreparedUpload.originalFile,
            blob: prep.prepared?.blob || pendingPreparedUpload.originalFile,
            filename: prep.prepared?.filename || pendingPreparedUpload.originalFile.name,
            elementId: pendingPreparedUpload.uploadReq.elementId,
            selector: pendingPreparedUpload.uploadReq.selector
          };
          closeUploadPreviewModal();
          if (lastScanData) renderScanResults(lastScanData);
        }
      });
    }
  }

  function openAddPersonModal(prefilledName = '', prefilledRel = 'Brother', initialFields = null) {
    if (!modalAddPerson) return;
    if (addPersonNameInput) addPersonNameInput.value = prefilledName || '';
    if (addPersonRelSelect) addPersonRelSelect.value = prefilledRel || 'Brother';
    modalAddPerson.setAttribute('data-initial-fields', initialFields ? JSON.stringify(initialFields) : '');
    modalAddPerson.style.display = 'flex';
    setTimeout(() => { if (addPersonNameInput) addPersonNameInput.focus(); }, 100);
  }

  function closeAddPersonModal() {
    if (modalAddPerson) modalAddPerson.style.display = 'none';
  }

  async function handleCreatePerson() {
    const name = addPersonNameInput?.value?.trim();
    const rel = addPersonRelSelect?.value || 'Other';
    const initRaw = modalAddPerson?.getAttribute('data-initial-fields');

    if (!name) {
      alert('Please enter a profile name.');
      if (addPersonNameInput) addPersonNameInput.focus();
      return;
    }

    const pm = getProfileManager();
    if (!pm) return;

    let initialProfileData = null;
    if (initRaw) {
      try {
        const fields = JSON.parse(initRaw);
        const IPClass = getInformationProfileClass();
        if (IPClass) {
          const ip = new IPClass(null);
          for (const [cid, obj] of Object.entries(fields)) {
            const v = typeof obj === 'object' && obj !== null ? obj.value : obj;
            if (v) ip.setField(cid, v, 'USER_CONFIRMED', 'Document Extracted');
          }
          initialProfileData = ip.toJSON();
        }
      } catch (e) {}
    }

    const created = await pm.createProfile(name, rel, initialProfileData, true);
    currentInfoProfile = created.profile;
    updateProfileNameDisplays(created.name);
    renderProfileDropdown();
    populateInfoForm();
    closeAddPersonModal();
    await scanActiveTab();
  }

  function closeNewPersonModal() {
    pendingExtractedPersonDoc = null;
    if (modalNewPerson) modalNewPerson.style.display = 'none';
  }

  function closeConflictModal() {
    pendingConflictData = null;
    if (modalConflict) modalConflict.style.display = 'none';
  }

  function closeUploadPreviewModal() {
    pendingPreparedUpload = null;
    if (modalUploadPreview) modalUploadPreview.style.display = 'none';
  }

  function showSaveToastMessage(msg) {
    if (!saveToastInfo) return;
    saveToastInfo.textContent = msg;
    saveToastInfo.style.display = 'inline';
    setTimeout(() => {
      saveToastInfo.style.display = 'none';
      saveToastInfo.textContent = 'Saved to local storage!';
    }, 3000);
  }

  // ── Document-First Profile Controller & Extraction Review ──────────────────

  function setupDocumentFirstProfileUI() {
    if (btnReviewAddDoc) {
      btnReviewAddDoc.addEventListener('click', () => {
        triggerDocumentUploadForField();
      });
    }

    if (btnAddProfileDoc) {
      btnAddProfileDoc.addEventListener('click', () => {
        triggerDocumentUploadForField();
      });
    }

    if (btnEmptyAddDoc) {
      btnEmptyAddDoc.addEventListener('click', () => {
        triggerDocumentUploadForField();
      });
    }

    if (btnEmptyManualFallback) {
      btnEmptyManualFallback.addEventListener('click', () => {
        openAddInfoModal();
      });
    }

    if (profileDocFileInput) {
      profileDocFileInput.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const targetDocType = profileDocFileInput.getAttribute('data-target-doc-type') || null;
        const targetFieldId = profileDocFileInput.getAttribute('data-target-field-id') || null;
        const targetCanonicalId = profileDocFileInput.getAttribute('data-target-canonical-id') || null;
        profileDocFileInput.value = '';
        await handleProfileDocumentSelected(file, targetDocType, targetFieldId, targetCanonicalId);
      });
    }

    if (btnModalCloseDocProcessed) btnModalCloseDocProcessed.addEventListener('click', closeDocProcessedModal);
    if (btnCancelDocProcessed) btnCancelDocProcessed.addEventListener('click', closeDocProcessedModal);
    if (btnSaveDocApproved) btnSaveDocApproved.addEventListener('click', () => saveApprovedDocumentData(true));
    if (btnDocUseOnce) btnDocUseOnce.addEventListener('click', useApprovedDocumentDataOnce);
  }

  function setupQuickEditModal() {
    if (btnModalCloseEditField) btnModalCloseEditField.addEventListener('click', closeQuickEditModal);
    if (btnCancelEditField) btnCancelEditField.addEventListener('click', closeQuickEditModal);
    if (btnSaveEditField) {
      btnSaveEditField.addEventListener('click', async () => {
        if (!pendingQuickEditTarget) {
          closeQuickEditModal();
          return;
        }
        const val = editFieldValueInput ? editFieldValueInput.value.trim() : '';
        const onSave = pendingQuickEditTarget.onSave;
        closeQuickEditModal();
        if (typeof onSave === 'function') {
          await onSave(val);
        }
      });
    }
  }

  function openQuickEditModal({ fieldId, label, currentValue, onSave }) {
    if (!modalEditField) return;
    pendingQuickEditTarget = { fieldId, label, currentValue, onSave };
    if (editFieldTitle) editFieldTitle.textContent = `Edit ${label || fieldId}`;
    if (editFieldLabel) editFieldLabel.textContent = label || fieldId;
    if (editFieldValueInput) {
      editFieldValueInput.value = currentValue || '';
    }
    if (editFieldProvenanceHint) {
      editFieldProvenanceHint.textContent = 'Will be saved with USER_EDITED provenance';
    }
    modalEditField.style.display = 'flex';
    setTimeout(() => { if (editFieldValueInput) editFieldValueInput.focus(); }, 100);
  }

  function closeQuickEditModal() {
    pendingQuickEditTarget = null;
    if (modalEditField) modalEditField.style.display = 'none';
  }

  function triggerDocumentUploadForField(targetDocType = null, fieldId = null, canonicalId = null) {
    if (!profileDocFileInput) return;
    if (targetDocType) profileDocFileInput.setAttribute('data-target-doc-type', targetDocType);
    else profileDocFileInput.removeAttribute('data-target-doc-type');

    if (fieldId) profileDocFileInput.setAttribute('data-target-field-id', fieldId);
    else profileDocFileInput.removeAttribute('data-target-field-id');

    if (canonicalId) profileDocFileInput.setAttribute('data-target-canonical-id', canonicalId);
    else profileDocFileInput.removeAttribute('data-target-canonical-id');

    profileDocFileInput.click();
  }

  function getAddDocButtonLabel(docType) {
    const dt = (docType || '').toUpperCase();
    if (dt === 'AADHAAR') return '+ Add Aadhaar';
    if (dt === 'PAN') return '+ Add PAN Card';
    if (dt === 'PASSPORT') return '+ Add Passport';
    if (dt === 'SSC_10TH') return '+ Add 10th Document';
    if (dt === 'INTER_12TH') return '+ Add 12th Document';
    if (dt === 'DEGREE') return '+ Add Degree Document';
    if (dt === 'CASTE_CERT' || dt === 'CASTE_CERTIFICATE') return '+ Add Caste Certificate';
    if (dt === 'EWS_CERT' || dt === 'EWS_CERTIFICATE') return '+ Add EWS Certificate';
    if (dt === 'INCOME_CERT' || dt === 'INCOME_CERTIFICATE') return '+ Add Income Certificate';
    if (dt === 'DRIVING_LICENSE') return '+ Add Driving License';
    if (dt === 'VOTER_ID') return '+ Add Voter ID';
    return '+ Add Document';
  }

  function extractTextFromPdfBytes(bytes) {
    if (!bytes || bytes.length === 0) return '';
    try {
      const decoder = new TextDecoder('latin1');
      const raw = decoder.decode(bytes);
      const textParts = [];

      // Extract text from (text) Tj
      const tjMatches = raw.matchAll(/\(([^)]+)\)\s*Tj/g);
      for (const m of tjMatches) {
        textParts.push(m[1]);
      }

      // Extract text from [ (...) ... ] TJ
      const tJMatches = raw.matchAll(/\[([^\]]+)\]\s*TJ/g);
      for (const m of tJMatches) {
        const inside = m[1].matchAll(/\(([^)]+)\)/g);
        for (const im of inside) {
          textParts.push(im[1]);
        }
      }

      // Extract general text runs from stream blocks
      if (textParts.length === 0) {
        const streamMatches = raw.matchAll(/stream[\r\n]+([\s\S]*?)[\r\n]+endstream/g);
        for (const sm of streamMatches) {
          const words = sm[1].match(/[A-Za-z0-9\s,.:\/\-]{4,}/g);
          if (words) textParts.push(...words);
        }
      }

      if (textParts.length > 0) {
        return textParts.join('\n');
      }

      const printable = raw.match(/[\w\s,.:\/\-]{4,}/g);
      return printable ? printable.join('\n') : '';
    } catch (e) {
      console.warn('PDF text extraction error:', e);
      return '';
    }
  }

  function extractStringsFromBytes(bytes) {
    if (!bytes || bytes.length === 0) return '';
    try {
      const decoder = new TextDecoder('latin1');
      const raw = decoder.decode(bytes);
      const runs = raw.match(/[\x20-\x7E\r\n\t]{4,}/g);
      return runs ? runs.join('\n') : '';
    } catch (e) {
      console.warn('Binary string extraction error:', e);
      return '';
    }
  }

  async function extractTextFromFile(file) {
    if (!file) return { text: '', blocks: [] };

    // 1. Unified OCR Engine recognition (native TextDetector, canvas binarization, PDF text, images)
    const ocrEngine = window.EFillOcrEngine?.ocrEngine || window.ocrEngine;
    if (ocrEngine && typeof ocrEngine.recognize === 'function') {
      try {
        const ocrRes = await ocrEngine.recognize(file);
        if (ocrRes && ocrRes.text && ocrRes.text.trim().length > 5) {
          return ocrRes;
        }
      } catch (ocrErr) {
        console.warn('[E-Fill] OCR recognition attempt failed, trying fallback parsers:', ocrErr);
      }
    }

    // 2. Text-based formats
    if (file.type?.startsWith('text/') || /\.(txt|json|csv|md|tsv)$/i.test(file.name)) {
      try {
        const txt = await file.text();
        return { text: txt, blocks: [] };
      } catch (e) {
        console.warn('Failed reading text file:', e);
      }
    }

    // 3. Binary / PDF formats fallback
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);

      // PDF
      if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name) || (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)) {
        const pdfText = extractTextFromPdfBytes(bytes);
        if (pdfText && pdfText.trim().length > 10) return { text: pdfText, blocks: [] };
      }

      // Binary runs
      const binText = extractStringsFromBytes(bytes);
      if (binText && binText.trim().length > 10) return { text: binText, blocks: [] };
    } catch (err) {
      console.warn('Error reading file arrayBuffer:', err);
    }

    return { text: '', blocks: [] };
  }

  function renderPopulatedProfile() {
    if (!populatedSectionsContainer || !currentInfoProfile) return;
    populatedSectionsContainer.innerHTML = '';

    const populated = currentInfoProfile.getPopulatedFields ? currentInfoProfile.getPopulatedFields() : {};
    const categories = [
      { id: 'personal', label: 'Personal Details', icon: '👤' },
      { id: 'identity', label: 'Identity & IDs', icon: '🪪' },
      { id: 'contact', label: 'Contact Information', icon: '📞' },
      { id: 'address', label: 'Address & Domicile', icon: '🏠' },
      { id: 'family', label: 'Family Information', icon: '👨‍👩‍👦' },
      { id: 'category', label: 'Reservation & Category', icon: '📋' },
      { id: 'income', label: 'Income & Economic Status', icon: '💰' },
      { id: 'banking', label: 'Banking & Financials', icon: '🏦' }
    ];

    let renderedAny = false;

    categories.forEach(cat => {
      const fields = populated[cat.id] || [];
      if (fields.length === 0) return;

      renderedAny = true;
      const card = document.createElement('div');
      card.className = 'profile-section-card';
      card.setAttribute('data-profile-section', cat.id);

      const header = document.createElement('div');
      header.className = 'section-header';
      header.innerHTML = `
        <span class="section-icon">${cat.icon}</span>
        <span class="section-label">${cat.label}</span>
        <span class="section-count-badge">${fields.length}</span>
      `;

      const body = document.createElement('div');
      body.className = 'section-body';

      fields.forEach(field => {
        const row = document.createElement('div');
        row.className = 'profile-field-item';
        row.setAttribute('data-canonical-field', field.canonicalField || field.id);

        const isSensitive = field.sensitive || cat.id === 'identity' || cat.id === 'banking';
        let displayVal = field.value || '—';
        if (isSensitive && field.value && field.value.length > 4) {
          displayVal = '•••• •••• ' + field.value.slice(-4);
        }

        const sourceLabel = formatProvenanceLabel(field.provenance, field.sourceDocumentType || field.source);
        const confidenceLabel = field.confidence ? `${Math.round(field.confidence * 100)}%` : null;

        row.innerHTML = `
          <div class="field-meta">
            <span class="field-label">${escapeHtml(field.label || field.id)}</span>
            <div class="field-value-row">
              <span class="field-value ${isSensitive ? 'sensitive-val' : ''}">${escapeHtml(displayVal)}</span>
              ${confidenceLabel ? `<span class="confidence-tag">${confidenceLabel}</span>` : ''}
            </div>
            <span class="field-source-hint">Source: ${escapeHtml(sourceLabel)}</span>
          </div>
          <div class="field-actions">
            <button type="button" class="btn-field-action btn-field-edit" title="Edit field value">✏️</button>
            <button type="button" class="btn-field-action btn-field-delete" title="Delete field">🗑️</button>
          </div>
        `;

        row.querySelector('.btn-field-edit').addEventListener('click', () => {
          openQuickEditModal({
            fieldId: field.canonicalField || field.id,
            label: field.label || field.id,
            currentValue: field.value,
            onSave: async (newVal) => {
              currentInfoProfile.setField(field.canonicalField || field.id, newVal, 'USER_EDITED', 'Edited in side panel', null, cat.id, {
                sourceType: 'MANUAL',
                provenance: 'USER_EDITED',
                confidence: 1.0
              });
              await saveInformationProfile(true);
              populateInfoForm();
              scanActiveTab();
              showSaveToastMessage(`Updated ${field.label || field.id}`);
            }
          });
        });

        row.querySelector('.btn-field-delete').addEventListener('click', () => {
          requestFieldDeletion({
            id: field.canonicalField || field.id,
            label: field.label || field.id,
            value: field.value,
            isCustom: false,
            isSensitive: isSensitive,
            domInput: null
          });
        });

        body.appendChild(row);
      });

      card.appendChild(header);
      card.appendChild(body);
      populatedSectionsContainer.appendChild(card);
    });

    // Education category
    const eduRecords = currentInfoProfile.getEducationRecords ? currentInfoProfile.getEducationRecords() : [];
    if (eduRecords && eduRecords.length > 0) {
      renderedAny = true;
      const eduCard = document.createElement('div');
      eduCard.className = 'profile-section-card';
      eduCard.innerHTML = `
        <div class="section-header">
          <span class="section-icon">🎓</span>
          <span class="section-label">Education Records</span>
          <span class="section-count-badge">${eduRecords.length}</span>
        </div>
        <div class="section-body" id="populated-edu-container"></div>
      `;
      const eduBody = eduCard.querySelector('#populated-edu-container');
      eduRecords.forEach(rec => {
        eduBody.appendChild(buildEduRecordCard(rec));
      });
      populatedSectionsContainer.appendChild(eduCard);
    }

    // Custom category
    const customFields = currentInfoProfile.getCustomFields ? currentInfoProfile.getCustomFields() : [];
    if (customFields && customFields.length > 0) {
      renderedAny = true;
      const customCard = document.createElement('div');
      customCard.className = 'profile-section-card';
      customCard.innerHTML = `
        <div class="section-header">
          <span class="section-icon">✨</span>
          <span class="section-label">Custom Information</span>
          <span class="section-count-badge">${customFields.length}</span>
        </div>
        <div class="section-body" id="populated-custom-container"></div>
      `;
      const customBody = customCard.querySelector('#populated-custom-container');
      customFields.forEach(cf => {
        const row = document.createElement('div');
        row.className = 'profile-field-item';
        row.innerHTML = `
          <div class="field-meta">
            <span class="field-label">${escapeHtml(cf.label || cf.id)}</span>
            <div class="field-value-row">
              <span class="field-value">${escapeHtml(cf.value || '—')}</span>
            </div>
            <span class="field-source-hint">Source: ${escapeHtml(formatProvenanceLabel(cf.provenance, cf.source))}</span>
          </div>
          <div class="field-actions">
            <button type="button" class="btn-field-action btn-field-edit" title="Edit field">✏️</button>
            <button type="button" class="btn-field-action btn-field-delete" title="Delete field">🗑️</button>
          </div>
        `;
        row.querySelector('.btn-field-edit').addEventListener('click', () => {
          openEditInfoModal(cf.id);
        });
        row.querySelector('.btn-field-delete').addEventListener('click', () => {
          requestFieldDeletion({
            id: cf.id,
            label: cf.label || cf.id,
            value: cf.value,
            isCustom: true,
            isSensitive: cf.sensitive || false,
            domInput: null
          });
        });
        customBody.appendChild(row);
      });
      populatedSectionsContainer.appendChild(customCard);
    }

    if (!renderedAny) {
      if (emptyProfileView) emptyProfileView.style.display = 'block';
      if (populatedProfileView) populatedProfileView.style.display = 'none';
    }
  }

  async function handleProfileDocumentSelected(file, hintDocType = null, targetFieldId = null, targetCanonicalId = null) {
    if (!file) return;
    const extractor = getDocumentExtractor();
    const classifier = getDocumentClassifier();
    const docMap = window.EFillDocumentFieldMap;
    if (!extractor) return;

    let extractedRawText = '';
    let ocrBlocks = [];
    try {
      const res = await extractTextFromFile(file);
      if (typeof res === 'string') {
        extractedRawText = res;
      } else if (res && typeof res === 'object') {
        extractedRawText = res.text || '';
        ocrBlocks = res.blocks || [];
      }
    } catch (readErr) {
      console.warn('[E-Fill] Could not extract text from file:', readErr);
    }
    const combinedText = extractedRawText ? `${file.name}\n${extractedRawText}` : file.name;

    let targetDocType = hintDocType;
    if (!targetDocType && classifier) {
      const cls = classifier.classify({ filename: file.name, mimeType: file.type, text: combinedText });
      targetDocType = cls.docType;
    }
    if ((!targetDocType || targetDocType === 'OTHER') && docMap) {
      targetDocType = docMap.classifyDocument(file.name);
    }

    const extracted = extractor.extract(combinedText, { filename: file.name, docType: targetDocType, ocrBlocks });
    if (!extracted.docType && targetDocType) {
      extracted.docType = targetDocType;
    }

    // Fallback template fields if file had minimal/unextractable raw text (e.g. image/scanned PDF)
    if ((!extracted.fields || Object.keys(extracted.fields).length === 0) && docMap && targetDocType) {
      const expected = docMap.getExpectedFields ? docMap.getExpectedFields(targetDocType) : [];
      extracted.fields = extracted.fields || {};
      for (const exp of expected) {
        extracted.fields[exp.canonicalField] = {
          value: '',
          label: exp.label,
          category: exp.category,
          sensitive: exp.sensitive || false,
          confidence: 0.5
        };
      }
    }

    if (!currentInfoProfile) {
      const IPClass = getInformationProfileClass();
      if (IPClass) currentInfoProfile = new IPClass(null);
    }

    // 1. Detect person ownership
    const ownership = extractor.detectPersonOwnership(extracted, currentInfoProfile);
    if (ownership && ownership.isDifferentPerson) {
      pendingExtractedPersonDoc = { file, extracted, ownership, targetFieldId, targetCanonicalId };
      if (curPersonNameEl) curPersonNameEl.textContent = ownership.selectedPerson.name || 'Current Profile';
      if (curPersonDetailsEl) curPersonDetailsEl.textContent = ownership.selectedPerson.email || ownership.selectedPerson.mobile || '';
      if (extPersonNameEl) extPersonNameEl.textContent = ownership.extractedPerson.name || 'Other Person';
      if (extPersonFieldsEl) {
        extPersonFieldsEl.innerHTML = `
          <span>DOB: ${escapeHtml(ownership.extractedPerson.dob || '—')}</span>
          <span>Mobile: ${escapeHtml(ownership.extractedPerson.mobile || '—')}</span>
          <span>Email: ${escapeHtml(ownership.extractedPerson.email || '—')}</span>
        `;
      }
      if (modalNewPerson) modalNewPerson.style.display = 'flex';
      return;
    }

    // 2. Check for conflicts
    const conflictEng = getConflictEngine();
    const comparison = conflictEng ? conflictEng.compare(extracted.fields, currentInfoProfile) : null;
    if (comparison && comparison.conflicts && comparison.conflicts.length > 0) {
      const c = comparison.conflicts[0];
      pendingConflictData = {
        ...c,
        sourceDocumentType: extracted.docType,
        documentName: file.name,
        targetFieldId,
        targetCanonicalId
      };
      if (conflictFieldTitle) conflictFieldTitle.textContent = `Field: ${c.label || c.fieldId}`;
      if (conflictExistingVal) conflictExistingVal.textContent = c.existingValue || '(empty)';
      if (conflictDocVal) conflictDocVal.textContent = c.incomingValue || '(empty)';
      if (modalConflict) modalConflict.style.display = 'flex';
      return;
    }

    // 3. No conflict -> Show Document Processed Review modal
    showDocumentProcessedModal(file, extracted, targetFieldId, targetCanonicalId);
  }

  function showDocumentProcessedModal(file, extracted, targetFieldId = null, targetCanonicalId = null) {
    if (!modalDocProcessed) {
      mergeExtractedDataIntoCurrentProfile(extracted.fields);
      return;
    }

    const docMap = window.EFillDocumentFieldMap;
    const docInfo = docMap && docMap.SUPPORTED_DOCUMENTS ? docMap.SUPPORTED_DOCUMENTS[extracted.docType] : null;
    const docTypeName = docInfo ? docInfo.name : (extracted.docType || 'Document');

    const personName = currentProfileDisplayNameEl?.textContent || 'Selected Person';
    if (docProcessedTitle) docProcessedTitle.textContent = `Document: ${docTypeName}`;
    if (docProcessedTargetName) docProcessedTargetName.textContent = personName;
    if (docProcessedTypeLabel) docProcessedTypeLabel.textContent = docTypeName;

    const fields = extracted.fields || {};
    const newItems = [];
    const existingItems = [];

    if (docProcessedFoundContainer) docProcessedFoundContainer.innerHTML = '';

    for (const [cid, fieldObj] of Object.entries(fields)) {
      const val = typeof fieldObj === 'object' && fieldObj !== null ? fieldObj.value : fieldObj;
      const label = (typeof fieldObj === 'object' && fieldObj.label) ? fieldObj.label : cid;
      const isSensitive = typeof fieldObj === 'object' ? fieldObj.sensitive : false;
      const confidence = typeof fieldObj === 'object' ? fieldObj.confidence : 0.95;
      const existingEntry = currentInfoProfile ? currentInfoProfile.getField(cid) : null;
      const isNew = !existingEntry || !existingEntry.value;

      let displayVal = val || '';
      if (isSensitive && val && val.length > 4) {
        displayVal = '•••• •••• ' + val.slice(-4);
      }

      if (val) {
        if (isNew) {
          newItems.push({ cid, label, val, displayVal, fieldObj });
        } else {
          existingItems.push({ cid, label, val, displayVal, fieldObj });
        }
      }

      if (docProcessedFoundContainer) {
        const isTarget = (cid === targetCanonicalId);
        const matchingProp = (currentProposals || []).find(p => p.canonicalId === cid || p.fieldId === cid);
        const matchBadge = matchingProp
          ? `<span class="badge-form-match" style="background: rgba(16, 185, 129, 0.2); color: #34d399; font-size: 10px; padding: 2px 6px; border-radius: 4px; margin-left: auto;">🎯 Autofills "${escapeHtml(matchingProp.label || matchingProp.canonicalId)}"</span>`
          : `<span class="badge-profile-only" style="background: rgba(99, 102, 241, 0.15); color: #a5b4fc; font-size: 10px; padding: 2px 6px; border-radius: 4px; margin-left: auto;">👤 Adds to Profile</span>`;

        const itemRow = document.createElement('div');
        itemRow.className = `processed-field-row ${isTarget || matchingProp ? 'target-rec-highlight' : ''}`;
        itemRow.style.cssText = 'padding: 8px 10px; margin-bottom: 6px; border-radius: 6px; background: var(--bg-surface); border: 1px solid var(--border-color);';
        itemRow.innerHTML = `
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
            <label class="processed-field-label" style="display: flex; align-items: center; gap: 6px; margin: 0; cursor: pointer;">
              <input type="checkbox" class="doc-field-checkbox" data-cid="${escapeHtml(cid)}" checked>
              <span class="field-title" style="font-weight: 600; font-size: 12px;">${escapeHtml(label)}${isTarget ? ' (Recommended)' : ''}</span>
            </label>
            ${matchBadge}
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <input type="text" class="input doc-field-val-input" data-cid="${escapeHtml(cid)}"
              value="${escapeHtml(val || '')}" placeholder="Enter value" style="flex: 1; font-size: 12px; padding: 4px 8px;">
            <span class="confidence-tag" style="font-size: 10px;">${Math.round(confidence * 100)}%</span>
          </div>
        `;
        docProcessedFoundContainer.appendChild(itemRow);
      }
    }

    if (docProcessedNewList) {
      docProcessedNewList.innerHTML = newItems.length > 0
        ? newItems.map(i => `<li><strong>${escapeHtml(i.label)}</strong>: ${escapeHtml(i.displayVal)}</li>`).join('')
        : '<li class="text-muted">No new fields found</li>';
    }

    if (docProcessedExistingList) {
      docProcessedExistingList.innerHTML = existingItems.length > 0
        ? existingItems.map(i => `<li><strong>${escapeHtml(i.label)}</strong>: ${escapeHtml(i.displayVal)} <span class="existing-note">(already present, no change)</span></li>`).join('')
        : '<li class="text-muted">None</li>';
    }

    pendingProcessedDoc = { file, extracted, docTypeName, targetFieldId, targetCanonicalId };
    modalDocProcessed.style.display = 'flex';
  }

  function closeDocProcessedModal() {
    pendingProcessedDoc = null;
    if (modalDocProcessed) modalDocProcessed.style.display = 'none';
  }

  async function saveApprovedDocumentData(autofillAfterSave = true) {
    if (!pendingProcessedDoc || !currentInfoProfile) {
      closeDocProcessedModal();
      return;
    }

    const { file, extracted, docTypeName, targetFieldId, targetCanonicalId } = pendingProcessedDoc;
    const checkedCids = new Set();
    const editedValues = {};

    if (docProcessedFoundContainer) {
      docProcessedFoundContainer.querySelectorAll('.doc-field-checkbox:checked').forEach(cb => {
        const cid = cb.getAttribute('data-cid');
        checkedCids.add(cid);
        const input = docProcessedFoundContainer.querySelector(`.doc-field-val-input[data-cid="${CSS.escape(cid)}"]`);
        if (input) {
          editedValues[cid] = input.value.trim();
        }
      });
    }

    const newlyAddedFieldIds = [];

    // Find or create education record if saving education fields
    let targetEduRecordId = null;
    const hasEduFields = Object.keys(extracted.fields || {}).some(cid => checkedCids.has(cid) && cid.startsWith('edu_'));
    if (hasEduFields) {
      let qual = '10th / SSC';
      if (extracted.docType === 'INTER_12TH') qual = '12th / Intermediate';
      else if (extracted.docType === 'DEGREE') qual = 'Graduation';
      else if (extracted.fields?.edu_qualification?.value) qual = extracted.fields.edu_qualification.value;

      const existingRecords = currentInfoProfile.getEducationRecords();
      const existingMatch = existingRecords.find(r => (r.qualification || '').toLowerCase() === qual.toLowerCase());
      if (existingMatch) {
        targetEduRecordId = existingMatch.id;
      } else {
        const newRec = currentInfoProfile.addEducationRecord(`edu-${Date.now()}`, qual);
        targetEduRecordId = newRec.id;
      }
    }

    for (const [cid, fieldObj] of Object.entries(extracted.fields || {})) {
      if (!checkedCids.has(cid)) continue;

      const rawVal = typeof fieldObj === 'object' && fieldObj !== null ? fieldObj.value : fieldObj;
      const finalVal = (editedValues[cid] !== undefined) ? editedValues[cid] : rawVal;
      if (!finalVal) continue;

      const category = (typeof fieldObj === 'object' && fieldObj.category) ? fieldObj.category : null;
      const confidence = (typeof fieldObj === 'object' && fieldObj.confidence) ? fieldObj.confidence : 1.0;
      const sensitive = (typeof fieldObj === 'object' && fieldObj.sensitive) ? fieldObj.sensitive : false;
      const eduRecId = cid.startsWith('edu_') ? targetEduRecordId : null;

      currentInfoProfile.setField(
        cid,
        finalVal,
        'USER_CONFIRMED',
        `Extracted from ${docTypeName}`,
        eduRecId,
        category,
        {
          sourceType: 'DOCUMENT',
          sourceDocumentType: extracted.docType,
          confidence: confidence,
          sensitive: sensitive,
          documentName: file.name
        }
      );
      newlyAddedFieldIds.push(cid);
    }

    await saveInformationProfile(true);
    populateInfoForm();
    closeDocProcessedModal();
    showSaveToastMessage('Document information saved to profile');

    if (autofillAfterSave) {
      await applyNewlyExtractedDataToApplication(newlyAddedFieldIds, docTypeName, false, targetFieldId);
    }
  }

  async function useApprovedDocumentDataOnce() {
    if (!pendingProcessedDoc) {
      closeDocProcessedModal();
      return;
    }

    const { file, extracted, docTypeName, targetFieldId, targetCanonicalId } = pendingProcessedDoc;
    const docSourceMgr = getDocumentSourceManager();
    const checkedCids = new Set();
    const useOnceMap = {};

    if (docProcessedFoundContainer) {
      docProcessedFoundContainer.querySelectorAll('.doc-field-checkbox:checked').forEach(cb => {
        const cid = cb.getAttribute('data-cid');
        checkedCids.add(cid);
        const input = docProcessedFoundContainer.querySelector(`.doc-field-val-input[data-cid="${CSS.escape(cid)}"]`);
        const val = input ? input.value.trim() : (extracted.fields[cid]?.value || '');
        if (val) {
          useOnceMap[cid] = val;
          if (docSourceMgr) {
            docSourceMgr.setUseOnceField(cid, val, `Temporary ${docTypeName} (Use Once)`);
          }
        }
      });
    }

    closeDocProcessedModal();
    showSaveToastMessage('Applied to current application for one-time use');
    await applyNewlyExtractedDataToApplication(Array.from(checkedCids), docTypeName, true, targetFieldId, useOnceMap);
  }

  async function applyNewlyExtractedDataToApplication(newlyAddedFieldIds, docTypeName, isUseOnce = false, targetFieldId = null, useOnceMap = {}) {
    // 1. Switch to Review & Fill tab to show immediate effect
    if (tabReviewBtn && viewReview) {
      tabReviewBtn.classList.add('active');
      if (tabInfoBtn) tabInfoBtn.classList.remove('active');
      viewReview.classList.add('active');
      if (viewInfo) viewInfo.classList.remove('active');
    }

    // 2. Re-render proposals with updated profile / session overrides
    if (lastScanData) {
      renderScanResults(lastScanData);
    } else {
      await scanActiveTab();
    }

    // 3. Mark matching proposals as approved
    currentProposals.forEach(p => {
      const matchesTarget = (targetFieldId && p.fieldId === targetFieldId);
      const matchesCanonical = (p.canonicalId && newlyAddedFieldIds.includes(p.canonicalId));
      const matchesFieldId = (p.fieldId && newlyAddedFieldIds.includes(p.fieldId));

      if ((matchesTarget || matchesCanonical || matchesFieldId) && p.proposedValue) {
        p.approved = true;

        // Update card in DOM if already rendered
        const card = document.querySelector(`[data-card-field-id="${CSS.escape(p.fieldId)}"]`);
        if (card) {
          const cb = card.querySelector('.prop-checkbox');
          if (cb) { cb.checked = true; cb.disabled = false; }
          const valInput = card.querySelector('.value-input');
          if (valInput) { valInput.value = p.proposedValue; valInput.disabled = false; }
          const badge = card.querySelector('.status-badge');
          if (badge) { badge.textContent = 'READY'; badge.className = 'status-badge badge-ready'; }
          card.className = 'proposal-card ready';
        }
      }
    });

    updateActionBar();

    // 4. Autofill into page simultaneously!
    const toAutofill = currentProposals.filter(p => p.approved && p.proposedValue);
    if (toAutofill.length > 0 && currentActiveTabId && typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.sendMessage(
        currentActiveTabId,
        { action: 'AUTOFILL_APPROVED', approvedProposals: toAutofill },
        (res) => {
          if (res && res.report && res.report.success) {
            (res.report.results || []).forEach(r => {
              if (r.success) {
                const card = document.querySelector(`[data-card-field-id="${CSS.escape(r.fieldId)}"]`);
                if (card) {
                  const badge = card.querySelector('.status-badge');
                  if (badge) {
                    badge.textContent = '✓ Filled';
                    badge.className = 'status-badge badge-ready';
                  }
                }
              }
            });
            showResultAlert(`✅ Form updated from ${docTypeName}: ${res.report.filledCount} field(s) filled automatically! (Review and submit manually — zero auto-submit)`, true);
          }
        }
      );
    }
  }

  async function mergeExtractedDataIntoCurrentProfile(extractedFields) {
    if (!currentInfoProfile || !extractedFields) return;
    const conflictEng = getConflictEngine();
    const comparison = conflictEng ? conflictEng.compare(extractedFields, currentInfoProfile) : null;

    if (comparison && comparison.conflicts && comparison.conflicts.length > 0) {
      const c = comparison.conflicts[0];
      pendingConflictData = c;
      if (conflictFieldTitle) conflictFieldTitle.textContent = `Field: ${c.label || c.fieldId}`;
      if (conflictExistingVal) conflictExistingVal.textContent = c.existingValue || '(empty)';
      if (conflictDocVal) conflictDocVal.textContent = c.incomingValue || '(empty)';
      if (modalConflict) modalConflict.style.display = 'flex';
      return;
    }

    const newlyAdded = [];
    for (const [cid, obj] of Object.entries(extractedFields)) {
      const v = typeof obj === 'object' && obj !== null ? obj.value : obj;
      if (v) {
        currentInfoProfile.setField(cid, v, 'USER_CONFIRMED', 'Document extracted');
        newlyAdded.push(cid);
      }
    }
    await saveInformationProfile(true);
    populateInfoForm();
    showSaveToastMessage('Document information saved to profile');
    await applyNewlyExtractedDataToApplication(newlyAdded, 'Document', false);
  }

  function populateInfoForm() {
    if (!currentInfoProfile) return;
    const ip = currentInfoProfile;

    const isEmpty = ip.isEmpty ? ip.isEmpty() : !ip.hasInformation();

    if (isEmpty) {
      if (emptyProfileView) emptyProfileView.style.display = 'block';
      if (populatedProfileView) populatedProfileView.style.display = 'none';
      const pm = getProfileManager();
      const sel = pm ? pm.getSelectedProfile() : null;
      if (emptyPersonName) {
        emptyPersonName.textContent = sel?.name || currentProfileDisplayNameEl?.textContent || 'Person';
      }
      return;
    }

    if (emptyProfileView) emptyProfileView.style.display = 'none';
    if (populatedProfileView) populatedProfileView.style.display = 'block';
    renderPopulatedProfile();

    // Populate all [data-field] inputs from the information profile
    document.querySelectorAll('[data-field]').forEach(el => {
      const fid = el.getAttribute('data-field');
      const fieldEntry = ip.getField(fid);
      const val = fieldEntry ? (fieldEntry.value || '') : '';
      if (el.tagName === 'SELECT') {
        el.value = val;
      } else {
        el.value = val;
      }

      // Display provenance hint if available
      const sourceHintEl = document.querySelector(`[data-source-for="${fid}"]`);
      if (sourceHintEl) {
        if (fieldEntry && fieldEntry.provenance && val) {
          sourceHintEl.textContent = `Source: ${formatProvenanceLabel(fieldEntry.provenance, fieldEntry.source)}`;
          sourceHintEl.style.display = 'block';
        } else {
          sourceHintEl.style.display = 'none';
        }
      }

      // Add subtle delete / clear button to canonical field header
      const formGroup = el.closest('.form-group');
      if (formGroup) {
        let labelRow = formGroup.querySelector('.form-group-header');
        const labelEl = formGroup.querySelector('label');
        if (!labelRow && labelEl) {
          labelRow = document.createElement('div');
          labelRow.className = 'form-group-header';
          labelEl.parentNode.insertBefore(labelRow, labelEl);
          labelRow.appendChild(labelEl);
        }
        if (labelRow) {
          let clearBtn = labelRow.querySelector('.btn-clear-field');
          if (!clearBtn) {
            clearBtn = document.createElement('button');
            clearBtn.type = 'button';
            clearBtn.className = 'btn-clear-field';
            clearBtn.title = 'Delete saved value';
            clearBtn.textContent = '🗑️';
            clearBtn.setAttribute('data-clear-field', fid);
            labelRow.appendChild(clearBtn);
            clearBtn.addEventListener('click', (e) => {
              e.preventDefault();
              e.stopPropagation();
              const fieldName = labelEl ? labelEl.textContent.trim() : fid;
              const isSensitive = el.type === 'password' || el.classList.contains('sensitive-input') || (fieldEntry && fieldEntry.sensitive);
              requestFieldDeletion({
                id: fid,
                label: fieldName,
                value: el.value || (fieldEntry ? fieldEntry.value : ''),
                isCustom: false,
                isSensitive: isSensitive,
                domInput: el
              });
            });
          }
          clearBtn.style.display = val ? 'inline-block' : 'none';
        }
      }
    });

    // Render custom fields
    renderCustomFields();

    // Education records
    renderEducationRecords();
  }

  function formatProvenanceLabel(provenance, source) {
    const labels = {
      USER_ENTERED:        'User entered',
      USER_CONFIRMED:      'Confirmed',
      USER_EDITED:         'User edited',
      DOCUMENT_EXTRACTED:  'From document',
      IMPORTED:            'Imported',
      APPLICATION_SPECIFIC: 'App-specific'
    };
    const provStr = labels[provenance] || provenance || 'User entered';
    return source ? `${provStr} • ${source}` : provStr;
  }

  function renderCustomFields() {
    if (!customFieldsContainer || !currentInfoProfile) return;
    const customFields = currentInfoProfile.getCustomFields ? currentInfoProfile.getCustomFields() : [];
    customFieldsContainer.innerHTML = '';

    if (!customFields || customFields.length === 0) {
      if (sectionCustom) sectionCustom.style.display = 'none';
      if (customCountBadge) customCountBadge.textContent = '0';
      return;
    }

    if (sectionCustom) sectionCustom.style.display = 'block';
    if (customCountBadge) customCountBadge.textContent = `${customFields.length}`;

    customFields.forEach(cf => {
      const row = document.createElement('div');
      row.className = 'custom-field-row';
      row.setAttribute('data-custom-id', cf.id);
      row.innerHTML = `
        <div class="custom-field-header">
          <span class="custom-field-label">${escapeHtml(cf.label || cf.id)}</span>
          <div class="custom-field-actions">
            <span class="custom-field-category-tag">${escapeHtml(cf.category || 'personal')}</span>
            <button type="button" class="btn-field-edit" title="Edit field name / category / value">✏️</button>
            <button type="button" class="btn-field-delete" title="Delete field">🗑️</button>
          </div>
        </div>
        <input type="text" class="custom-value-input" data-custom-field="${escapeHtml(cf.id)}" value="${escapeHtml(cf.value || '')}" placeholder="Enter value">
        <span class="field-source-hint">Source: ${escapeHtml(formatProvenanceLabel(cf.provenance, cf.source))}</span>
      `;

      // ✏️ Edit custom field
      row.querySelector('.btn-field-edit').addEventListener('click', () => {
        openEditInfoModal(cf.id);
      });

      // 🗑️ Delete custom field
      row.querySelector('.btn-field-delete').addEventListener('click', () => {
        requestFieldDeletion({
          id: cf.id,
          label: cf.label || cf.id,
          value: cf.value || '',
          isCustom: true,
          isSensitive: cf.sensitive || false,
          domInput: null
        });
      });

      row.querySelector('.custom-value-input').addEventListener('change', (e) => {
        cf.value = e.target.value.trim();
        cf.provenance = 'USER_EDITED';
        cf.source = 'Edited in side panel';
      });

      customFieldsContainer.appendChild(row);
    });
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
      <div class="form-group">
        <label>Institution / School / College</label>
        <input type="text" value="${escapeHtml(fg('edu_institution'))}" data-edu-field="edu_institution" placeholder="Name of institution">
      </div>
      <div class="form-group">
        <label>Board / University</label>
        <input type="text" value="${escapeHtml(fg('edu_board'))}" data-edu-field="edu_board">
      </div>
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
      <div class="form-group">
        <label>Marks Obtained</label>
        <input type="text" value="${escapeHtml(fg('edu_marks'))}" data-edu-field="edu_marks">
      </div>
      <div class="form-group">
        <label>Maximum Marks</label>
        <input type="text" value="${escapeHtml(fg('edu_max_marks'))}" data-edu-field="edu_max_marks">
      </div>
    `;

    // Delete button
    card.querySelector('.btn-delete-edu').addEventListener('click', async () => {
      if (confirm(`Remove "${rec.qualification || 'this record'}"?`)) {
        currentInfoProfile.removeEducationRecord(rec.id);
        renderEducationRecords();
        await saveInformationProfile(true);
        populateInfoForm();
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
        expandSection('education');
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

  // ── + Add / Edit Information Modal Logic ──────────────────────────────────
  function setupAddInfoModal() {
    if (btnOpenAddInfo) {
      btnOpenAddInfo.addEventListener('click', openAddInfoModal);
    }
    if (btnModalCloseAddInfo) {
      btnModalCloseAddInfo.addEventListener('click', closeAddInfoModal);
    }
    if (btnCancelAddInfo) {
      btnCancelAddInfo.addEventListener('click', closeAddInfoModal);
    }

    if (addFieldNameInput) {
      addFieldNameInput.addEventListener('input', () => {
        checkFieldResolutionAndDuplicates();
      });
    }

    if (addFieldCategorySelect) {
      addFieldCategorySelect.addEventListener('change', () => {
        checkFieldResolutionAndDuplicates();
      });
    }

    if (btnSubmitAddInfo) {
      btnSubmitAddInfo.addEventListener('click', async () => {
        await submitAddInfo();
      });
    }
  }

  function openAddInfoModal() {
    if (!modalAddInfo) return;
    if (modalFieldTitle) modalFieldTitle.textContent = '+ Add Information';
    if (editCustomIdInput) editCustomIdInput.value = '';
    if (addFieldNameInput) addFieldNameInput.value = '';
    if (addFieldValueInput) addFieldValueInput.value = '';
    if (addFieldCategorySelect) addFieldCategorySelect.value = 'personal';
    if (addFieldHint) addFieldHint.textContent = '';
    if (addDuplicateWarning) addDuplicateWarning.style.display = 'none';
    if (btnSubmitAddInfo) btnSubmitAddInfo.textContent = 'Add Information';
    modalAddInfo.style.display = 'flex';
    setTimeout(() => { if (addFieldNameInput) addFieldNameInput.focus(); }, 100);
  }

  function openEditInfoModal(customId) {
    if (!modalAddInfo || !currentInfoProfile) return;
    const cf = currentInfoProfile.getCustomField(customId);
    if (!cf) return;

    if (modalFieldTitle) modalFieldTitle.textContent = 'Edit Information';
    if (editCustomIdInput) editCustomIdInput.value = customId;
    if (addFieldNameInput) addFieldNameInput.value = cf.label || cf.id;
    if (addFieldValueInput) addFieldValueInput.value = cf.value || '';
    if (addFieldCategorySelect) addFieldCategorySelect.value = cf.category || 'personal';
    if (addFieldHint) addFieldHint.textContent = '';
    if (addDuplicateWarning) addDuplicateWarning.style.display = 'none';
    if (btnSubmitAddInfo) btnSubmitAddInfo.textContent = 'Save Changes';

    checkFieldResolutionAndDuplicates();
    modalAddInfo.style.display = 'flex';
    setTimeout(() => { if (addFieldNameInput) addFieldNameInput.focus(); }, 100);
  }

  function closeAddInfoModal() {
    if (modalAddInfo) modalAddInfo.style.display = 'none';
  }

  function checkFieldResolutionAndDuplicates() {
    const rawName = (addFieldNameInput?.value || '').trim();
    const editingCustomId = editCustomIdInput?.value || '';

    if (!rawName) {
      if (addFieldHint) addFieldHint.textContent = '';
      if (addDuplicateWarning) addDuplicateWarning.style.display = 'none';
      if (btnSubmitAddInfo) btnSubmitAddInfo.textContent = editingCustomId ? 'Save Changes' : 'Add Information';
      return;
    }

    const schema = window.EFillCanonicalSchema;
    const resolved = schema && schema.resolveField ? schema.resolveField(rawName) : null;

    let targetCategory = addFieldCategorySelect ? addFieldCategorySelect.value : 'personal';
    let targetFieldId = '';
    let targetFieldLabel = rawName;

    if (resolved) {
      targetFieldId = resolved.id;
      targetFieldLabel = resolved.label || resolved.id;
      targetCategory = resolved.category || 'personal';
      if (addFieldCategorySelect) addFieldCategorySelect.value = targetCategory;
      if (addFieldHint) {
        addFieldHint.textContent = `✓ Recognized as canonical: ${targetFieldLabel} (${schema.PROFILE_CATEGORIES?.[targetCategory]?.label || targetCategory})`;
        addFieldHint.style.color = '#38bdf8';
      }
    } else {
      if (addFieldHint) {
        addFieldHint.textContent = `ℹ️ Custom field (will be saved in ${schema.PROFILE_CATEGORIES?.[targetCategory]?.label || targetCategory})`;
        addFieldHint.style.color = '#a78bfa';
      }
    }

    // Check for duplicate / conflict
    if (currentInfoProfile) {
      if (resolved) {
        const existing = currentInfoProfile.getField(targetFieldId);
        if (existing && existing.value && existing.value.trim() !== '') {
          if (addDuplicateWarning) {
            addDuplicateWarning.style.display = 'flex';
            if (addDuplicateDetail) {
              addDuplicateDetail.textContent = `Canonical field "${targetFieldLabel}" already contains: "${existing.value}". Saving will replace this value.`;
            }
          }
          if (btnSubmitAddInfo) btnSubmitAddInfo.textContent = 'Replace Value';
          return;
        }
      } else if (!editingCustomId) {
        // When creating a new custom field, check if another custom field has same label
        const existingCustom = (currentInfoProfile.getCustomFields ? currentInfoProfile.getCustomFields() : [])
          .find(c => (c.label || '').toLowerCase() === rawName.toLowerCase());
        if (existingCustom && existingCustom.value) {
          if (addDuplicateWarning) {
            addDuplicateWarning.style.display = 'flex';
            if (addDuplicateDetail) {
              addDuplicateDetail.textContent = `Custom field "${rawName}" already exists with value: "${existingCustom.value}".`;
            }
          }
          if (btnSubmitAddInfo) btnSubmitAddInfo.textContent = 'Replace Value';
          return;
        }
      }
    }

    if (addDuplicateWarning) addDuplicateWarning.style.display = 'none';
    if (btnSubmitAddInfo) btnSubmitAddInfo.textContent = editingCustomId ? 'Save Changes' : 'Add Information';
  }

  async function submitAddInfo() {
    const rawName = (addFieldNameInput?.value || '').trim();
    const val = (addFieldValueInput?.value || '').trim();
    const category = addFieldCategorySelect?.value || 'personal';
    const editingCustomId = editCustomIdInput?.value || '';

    if (!rawName) {
      alert('Please enter a field name.');
      if (addFieldNameInput) addFieldNameInput.focus();
      return;
    }

    if (!currentInfoProfile) {
      const IPClass = getInformationProfileClass();
      if (IPClass) currentInfoProfile = new IPClass(null);
    }

    const schema = window.EFillCanonicalSchema;
    const resolved = schema && schema.resolveField ? schema.resolveField(rawName) : null;

    let sectionToExpand = category;

    if (editingCustomId) {
      // Editing existing custom field
      if (resolved) {
        // Custom field mapped to canonical field
        currentInfoProfile.setField(resolved.id, val, 'USER_EDITED', 'Edited by user', null, category);
        currentInfoProfile.removeCustomField(editingCustomId);
        sectionToExpand = resolved.category || category;
      } else {
        // Remains custom field, preserve stable internal ID
        currentInfoProfile.updateCustomField(editingCustomId, {
          label: rawName,
          value: val,
          category: category,
          provenance: 'USER_EDITED',
          source: 'Edited in side panel'
        });
        sectionToExpand = 'custom';
      }
    } else {
      // Adding new field
      if (resolved) {
        currentInfoProfile.setField(resolved.id, val, 'USER_ENTERED', 'Added by user', null, category);
        sectionToExpand = resolved.category || category;
      } else {
        // Stable internal ID (e.g. custom_8f31...)
        const stableId = `custom_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 5)}`;
        currentInfoProfile.setCustomField(stableId, rawName, val, category, 'USER_ENTERED', 'Added by user');
        sectionToExpand = 'custom';
      }
    }

    // Save and refresh UI
    await saveInformationProfile();
    populateInfoForm();
    closeAddInfoModal();

    // Auto-scroll target section into view
    expandSection(sectionToExpand);
  }

  // ── Delete Confirmation Logic ──────────────────────────────────────────────
  function setupDeleteConfirmModal() {
    if (btnModalCloseDelete) btnModalCloseDelete.addEventListener('click', closeDeleteConfirmModal);
    if (btnCancelDelete) btnCancelDelete.addEventListener('click', closeDeleteConfirmModal);
    if (btnConfirmDelete) btnConfirmDelete.addEventListener('click', executeFieldDeletion);
  }

  function requestFieldDeletion(target) {
    if (!modalDeleteConfirm || !target) return;
    pendingDeletionTarget = target;

    if (delFieldNameEl) delFieldNameEl.textContent = target.label || target.id;

    // Mask value if sensitive
    let displayVal = target.value || '(empty)';
    if (target.isSensitive && target.value) {
      if (target.value.length > 4) {
        displayVal = '••••••••' + target.value.slice(-4);
      } else {
        displayVal = '••••••••••••';
      }
    }
    if (delFieldValEl) delFieldValEl.textContent = displayVal;

    // Check active reference in current scan / proposals
    const refProp = isFieldReferencedInActiveSession(target.id, target.value);
    if (refProp) {
      if (delRefWarningEl) delRefWarningEl.style.display = 'flex';
      if (delRefDetailEl) {
        delRefDetailEl.textContent = `This information is currently used by the active form proposal: "${refProp.label || refProp.fieldId}" (${refProp.status}).`;
      }
      if (btnConfirmDelete) btnConfirmDelete.textContent = 'Delete Anyway';
    } else {
      if (delRefWarningEl) delRefWarningEl.style.display = 'none';
      if (btnConfirmDelete) btnConfirmDelete.textContent = 'Delete';
    }

    modalDeleteConfirm.style.display = 'flex';
  }

  function closeDeleteConfirmModal() {
    pendingDeletionTarget = null;
    if (modalDeleteConfirm) modalDeleteConfirm.style.display = 'none';
  }

  async function executeFieldDeletion() {
    if (!pendingDeletionTarget || !currentInfoProfile) {
      closeDeleteConfirmModal();
      return;
    }

    const { id, isCustom, domInput } = pendingDeletionTarget;

    if (isCustom) {
      currentInfoProfile.removeCustomField(id);
      const customEl = domInput || document.querySelector(`[data-custom-field="${id}"]`);
      if (customEl) customEl.value = '';
    } else {
      currentInfoProfile.clearField(id);
      const canonicalEl = domInput || document.querySelector(`[data-field="${id}"]`);
      if (canonicalEl) canonicalEl.value = '';
    }

    await saveInformationProfile(true);
    populateInfoForm();

    // If active proposals exist, refresh availability statuses
    if (currentProposals && currentProposals.length > 0) {
      refreshProposalsAvailability();
    }

    closeDeleteConfirmModal();
  }

  function isFieldReferencedInActiveSession(targetId, targetValue) {
    if (!currentProposals || currentProposals.length === 0) return null;
    return currentProposals.find(p => {
      if (p.canonicalId && p.canonicalId === targetId) return true;
      if (p.fieldId && p.fieldId === targetId) return true;
      if (targetValue && p.proposedValue === targetValue) return true;
      return false;
    }) || null;
  }

  function refreshProposalsAvailability() {
    const avEngine = getAvailabilityEngine();
    if (!avEngine || !currentInfoProfile || !currentProposals) return;

    currentProposals.forEach(p => {
      if (p.canonicalId) {
        const av = avEngine.check(p.canonicalId, currentInfoProfile);
        if (av.status === 'AVAILABLE') {
          p.status = 'READY';
          p.proposedValue = av.value;
          p.provenance = av.provenance;
        } else if (av.status === 'MISSING') {
          p.status = 'UNAVAILABLE';
          p.proposedValue = '';
          p.approved = false;
        }
      }
    });

    renderProposals(currentProposals);
    updateSummaryBar(currentProposals);
    updateApprovedCount();
  }

  function expandSection(sectionName) {
    const sec = document.querySelector(`[data-section="${sectionName}"]`);
    if (sec) {
      try {
        sec.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } catch (e) {
        sec.scrollIntoView();
      }
    }
  }

  async function saveInformationProfile(skipDomSync = false) {
    if (!currentInfoProfile) return;

    if (!skipDomSync && (!emptyProfileView || emptyProfileView.style.display === 'none')) {
      // Read all [data-field] inputs and update the profile
      document.querySelectorAll('[data-field]').forEach(el => {
        const fid = el.getAttribute('data-field');
        const val = el.value.trim();
        const existing = currentInfoProfile.getField(fid);
        if (existing !== null) {
          if (existing.value !== val && val !== '') {
            currentInfoProfile.setField(fid, val, 'USER_EDITED', 'Edited in side panel');
          }
        } else if (val) {
          currentInfoProfile.setField(fid, val, 'USER_ENTERED', 'Entered in side panel');
        }
      });

      // Read custom fields
      document.querySelectorAll('[data-custom-field]').forEach(el => {
        const fid = el.getAttribute('data-custom-field');
        const val = el.value.trim();
        const existing = currentInfoProfile.getField(fid);
        if (existing && existing.value !== val && val !== '') {
          existing.value = val;
          existing.provenance = 'USER_EDITED';
          existing.source = 'Edited in side panel';
        }
      });
    }

    const sm = getStorageManager();
    const pm = getProfileManager();
    if (pm && pm.initialized) {
      await pm.saveCurrentProfileData(currentInfoProfile.toJSON());
    } else if (sm) {
      await sm.saveInformationProfile(currentInfoProfile.toJSON());
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
                  'core/profile-manager.js',
                  'core/conflict-engine.js',
                  'core/file-validator.js',
                  'core/document-field-map.js',
                  'core/document-classifier.js',
                  'core/ocr-engine.js',
                  'core/document-extractor.js',
                  'core/document-source-manager.js',
                  'core/image-preparation-engine.js',
                  'core/upload-preparation-engine.js',
                  'core/document-requirement-engine.js',
                  'core/availability-engine.js',
                  'core/source-selector.js',
                  'content/field-reader.js',
                  'content/form-detector.js',
                  'content/indicator.js',
                  'content/autofill.js',
                  'content/upload-handler.js',
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
   * Primary rendering: classifies scan result and renders the appropriate state.
   *
   * States:
   *   !eligible            → blocked (browser-internal page — cannot operate)
   *   eligible + no fields → no form detected on this page
   *   eligible + fields    → show proposal groups (with optional profile context)
   */
  function renderScanResults(scanData) {
    if (!scanData) { showBlockedState('No response from page'); return; }

    if (!scanData.eligible) {
      // Truly cannot operate — browser-internal page (chrome://, edge://, etc.)
      showBlockedState(scanData.eligibilityReason || 'E-Fill cannot operate on this page');
      return;
    }

    // Page is scannable. Determine display context from profile (may be null).
    const profileName = scanData.profile?.name || null;

    if (!scanData.fields || scanData.fields.length === 0) {
      // No meaningful form controls found on this page.
      showNoFormState(profileName);
      return;
    }

    // Form fields found — render proposals.
    setFormDetectedUI(profileName, scanData.fields.length);

    summaryBar.style.display = 'flex';
    ineligibleStateEl.style.display = 'none';
    emptyStateEl.style.display = 'none';
    proposalsListEl.style.display = 'block';

    lastScanData = scanData;

    // Use the v2 InformationProfile if available, else legacy flat
    const profileForProposals = currentInfoProfile || currentLegacyProfile;
    const docSourceMgr = getDocumentSourceManager();
    const sessionOverrides = docSourceMgr ? docSourceMgr.getSessionOverrides() : {};

    const selector = getSourceSelector();
    currentProposals = selector
      ? selector.generateProposals(scanData.fields, profileForProposals, sessionOverrides)
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

    // Show/hide field groups
    showGroup(groupReady, nReady, gcReady);
    showGroup(groupReview, nReview, gcReview);
    showGroup(groupConflict, nConflict, gcConflict);
    showGroup(groupMissing, nMissing, gcMissing);

    // Evaluate and render Document and Upload Requirements
    const reqEngine = getDocumentRequirementEngine();

    if (reqEngine) {
      const evaluation = reqEngine.evaluateRequirements(
        scanData.fields || [],
        scanData.uploads || [],
        profileForProposals,
        sessionOverrides
      );
      renderRequirementGroups(evaluation);
    }

    // Update summary bar counts
    countReadyEl.textContent = nReady;
    countReviewEl.textContent = nReview;
    countConflictEl.textContent = nConflict;
    countUnavailableEl.textContent = nMissing;

    updateActionBar();
  }

  function renderRequirementGroups(evaluation) {
    if (!evaluation) return;

    // Document requirements
    if (stackDocs && groupDocs) {
      stackDocs.innerHTML = '';
      const docs = evaluation.docRequirements || [];
      docs.forEach(docReq => {
        stackDocs.appendChild(createDocRequirementCard(docReq));
      });
      groupDocs.style.display = docs.length > 0 ? 'flex' : 'none';
      if (gcDocs) gcDocs.textContent = docs.length;
    }

    // Upload requirements
    if (stackUploads && groupUploads) {
      stackUploads.innerHTML = '';
      const uploads = evaluation.uploadRequirements || [];
      uploads.forEach(uploadReq => {
        stackUploads.appendChild(createUploadRequirementCard(uploadReq));
      });
      groupUploads.style.display = uploads.length > 0 ? 'flex' : 'none';
      if (gcUploads) gcUploads.textContent = uploads.length;
    }
  }

  function formatUploadConstraints(req) {
    const parts = [];
    if (req.allowedFormats?.length > 0) {
      parts.push(req.allowedFormats.map(f => f.replace('image/', '').replace('application/', '').toUpperCase()).join('/'));
    }
    if (req.exactWidth && req.exactHeight) {
      parts.push(`${req.exactWidth}×${req.exactHeight} px`);
    }
    if (req.minSizeBytes && req.maxSizeBytes) {
      parts.push(`${Math.round(req.minSizeBytes / 1024)} KB–${Math.round(req.maxSizeBytes / 1024)} KB`);
    } else if (req.maxSizeBytes) {
      parts.push(`Max ${Math.round(req.maxSizeBytes / 1024)} KB`);
    }
    return parts.length > 0 ? parts.join(', ') : 'Standard upload';
  }

  function createDocRequirementCard(docReq) {
    const card = document.createElement('div');
    const isAvail = docReq.state === 'DOCUMENT_AVAILABLE';
    card.className = `proposal-card ${isAvail ? 'ready' : 'review'}`;
    card.innerHTML = `
      <div class="card-top">
        <label class="field-checkbox-label">
          <span>📄 ${escapeHtml(docReq.label)}</span>
        </label>
        <span class="status-badge ${isAvail ? 'badge-ready' : 'badge-review'}">
          ${isAvail ? 'AVAILABLE' : 'REQUIRED'}
        </span>
      </div>
      <div class="card-bottom">
        <span class="source-tag">${escapeHtml(docReq.reason)}</span>
        ${!isAvail ? `<button type="button" class="btn btn-primary btn-sm btn-prov-doc">Provide Document</button>` : ''}
      </div>
    `;
    const btn = card.querySelector('.btn-prov-doc');
    if (btn) {
      btn.addEventListener('click', () => openDocumentFileInput(docReq));
    }
    return card;
  }

  function createUploadRequirementCard(uploadReq) {
    const card = document.createElement('div');
    const isReady = uploadReq.state === 'UPLOAD_READY' || !!activePreparedUploads[uploadReq.elementId];
    card.className = `proposal-card ${isReady ? 'ready' : 'review'}`;
    card.innerHTML = `
      <div class="card-top">
        <label class="field-checkbox-label">
          <span>📤 ${escapeHtml(uploadReq.label)}</span>
        </label>
        <span class="status-badge ${isReady ? 'badge-ready' : 'badge-review'}">
          ${isReady ? 'READY' : 'NEEDS PREPARATION'}
        </span>
      </div>
      <div class="field-value-box">
        <span class="field-source-hint" style="display:block;">Requirements: ${escapeHtml(formatUploadConstraints(uploadReq))}</span>
      </div>
      <div class="card-bottom">
        <span class="source-tag">Target: ${escapeHtml(uploadReq.name || uploadReq.elementId || 'File Input')}</span>
        <button type="button" class="btn btn-primary btn-sm btn-prep-upload">
          ${isReady ? 'Preview / Change' : 'Prepare File'}
        </button>
      </div>
    `;
    card.querySelector('.btn-prep-upload').addEventListener('click', () => {
      openUploadFilePicker(uploadReq);
    });
    return card;
  }

  function openDocumentFileInput(docReq) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,application/pdf,.jpg,.jpeg,.png,.pdf';
    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      await processDocumentSource(file, docReq);
    };
    input.click();
  }

  function openUploadFilePicker(uploadReq) {
    const input = document.createElement('input');
    input.type = 'file';
    if (uploadReq.allowedFormats?.length > 0) {
      input.accept = uploadReq.allowedFormats.join(',');
    }
    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      await processUploadFile(file, uploadReq);
    };
    input.click();
  }

  async function processDocumentSource(file, docReq) {
    await handleProfileDocumentSelected(file, docReq?.docType);
  }

  async function processUploadFile(file, uploadReq) {
    const isImage = file.type?.startsWith('image/') || /\.(jpe?g|png)$/i.test(file.name);
    let preparedResult = null;

    if (uploadReq.category === 'photo' || (isImage && !file.name.toLowerCase().includes('cert'))) {
      const imgEngine = getImagePreparationEngine();
      if (imgEngine) {
        const img = new Image();
        const url = URL.createObjectURL(file);
        await new Promise((res) => { img.onload = res; img.src = url; });
        preparedResult = uploadReq.category === 'signature'
          ? await imgEngine.prepareSignature({ width: img.naturalWidth, height: img.naturalHeight, sizeBytes: file.size, sourceElement: img }, uploadReq)
          : await imgEngine.preparePhoto({ width: img.naturalWidth, height: img.naturalHeight, sizeBytes: file.size, sourceElement: img }, uploadReq);
        URL.revokeObjectURL(url);
      }
    } else {
      const uploadEngine = getUploadPreparationEngine();
      if (uploadEngine) {
        preparedResult = uploadEngine.prepareDocument({
          filename: file.name,
          sizeBytes: file.size,
          mimeType: file.type || 'application/pdf',
          docType: uploadReq.category === 'certificate' ? 'SSC_10TH' : 'OTHER'
        }, uploadReq);
      }
    }

    if (!preparedResult) return;

    pendingPreparedUpload = { originalFile: file, uploadReq, preparedResult };

    if (prevOrigName) prevOrigName.textContent = file.name;
    if (prevOrigDims) prevOrigDims.textContent = preparedResult.original?.width ? `${preparedResult.original.width} × ${preparedResult.original.height}` : '—';
    if (prevOrigSize) prevOrigSize.textContent = `${Math.round(file.size / 1024)} KB`;

    if (prevPrepName) prevPrepName.textContent = preparedResult.prepared?.filename || file.name.replace(/\.[^.]+$/, '_efill.jpg');
    if (prevPrepDims) prevPrepDims.textContent = preparedResult.prepared?.width ? `${preparedResult.prepared.width} × ${preparedResult.prepared.height}` : 'Standard';
    if (prevPrepSize) prevPrepSize.textContent = `${Math.round((preparedResult.prepared?.sizeBytes || file.size) / 1024)} KB`;
    if (prevPrepReqs) prevPrepReqs.textContent = formatUploadConstraints(uploadReq);

    if (previewStatusBadge) {
      previewStatusBadge.textContent = preparedResult.status;
      previewStatusBadge.className = preparedResult.status === 'READY' ? 'ready-badge' : 'warning-badge';
    }

    if (preparedResult.prepared?.dataUrl && previewImgElement && previewImgContainer) {
      previewImgElement.src = preparedResult.prepared.dataUrl;
      previewImgContainer.style.display = 'block';
    } else if (previewImgContainer) {
      previewImgContainer.style.display = 'none';
    }

    if (modalUploadPreview) modalUploadPreview.style.display = 'flex';
  }

  function showGroup(groupEl, count, countEl) {
    if (!groupEl) return;
    groupEl.style.display = count > 0 ? 'flex' : 'none';
    if (countEl) countEl.textContent = count;
  }

  /**
   * showBlockedState — browser-internal pages only (chrome://, edge://, etc.)
   * E-Fill genuinely cannot operate here.
   */
  function showBlockedState(reason) {
    setBlockedUI();
    summaryBar.style.display = 'none';
    emptyStateEl.style.display = 'none';
    proposalsListEl.style.display = 'none';
    if (stackReady)    stackReady.innerHTML    = '';
    if (stackReview)   stackReview.innerHTML   = '';
    if (stackConflict) stackConflict.innerHTML = '';
    if (stackMissing)  stackMissing.innerHTML  = '';
    ineligibleStateEl.style.display = 'block';
    if (ineligibleReasonEl) ineligibleReasonEl.textContent = reason || '';
    currentProposals = [];
    updateActionBar();
  }

  /**
   * showNoFormState — page is scannable but no meaningful form controls found.
   * Shown for: login-only pages, content pages, blank pages, etc.
   */
  function showNoFormState(profileName) {
    // Show profile context in header if known, otherwise generic
    if (profileName) {
      setFormDetectedUI(profileName, 0);
      eligibilityLabel.textContent = 'No form detected on this page';
    } else {
      setGenericScannedUI();
    }
    summaryBar.style.display = 'none';
    ineligibleStateEl.style.display = 'none';
    proposalsListEl.style.display = 'none';
    emptyStateEl.style.display = 'block';
    currentProposals = [];
    updateActionBar();
  }

  /**
   * setFormDetectedUI — page has form fields. Shows profile name or "Form detected".
   * @param {string|null} profileName  Matched application profile name, or null.
   * @param {number} fieldCount        Number of fields found.
   */
  function setFormDetectedUI(profileName, fieldCount) {
    eligibilityDot.className = 'eligibility-dot supported';
    eligibilityLabel.className = 'eligibility-label supported';
    if (profileName) {
      eligibilityLabel.textContent = 'Application detected';
      pageTitleEl.textContent = profileName;
    } else {
      eligibilityLabel.textContent = `Form detected${fieldCount > 0 ? ` — ${fieldCount} field${fieldCount !== 1 ? 's' : ''}` : ''}`;
      pageTitleEl.textContent = 'Form Intelligence';
    }
  }

  /**
   * setGenericScannedUI — page was scanned, no profile, no form found.
   */
  function setGenericScannedUI() {
    eligibilityDot.className = 'eligibility-dot';
    eligibilityLabel.className = 'eligibility-label';
    eligibilityLabel.textContent = 'No fillable form detected';
    pageTitleEl.textContent = 'Page scanned';
  }

  /**
   * setBlockedUI — browser-internal page: cannot operate.
   */
  function setBlockedUI() {
    eligibilityDot.className = 'eligibility-dot unsupported';
    eligibilityLabel.className = 'eligibility-label unsupported';
    eligibilityLabel.textContent = 'E-Fill cannot operate here';
  }

  // Keep setEligibleUI as an alias for backward compatibility with any callers
  function setEligibleUI(appName) { setFormDetectedUI(appName, 0); }
  function setIneligibleUI()      { setBlockedUI(); }
  function showIneligibleState(r) { showBlockedState(r); }
  function showEmptyScan()        { showNoFormState(null); }

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
      ${isDisabled && (proposal.recommendedDoc || (proposal.allPossibleDocs && proposal.allPossibleDocs.length > 0)) ? `
      <div class="missing-field-rec">
        <div class="missing-rec-info">
          <span class="rec-badge">RECOMMENDED</span>
          <span class="rec-label">📄 ${escapeHtml(proposal.recommendedDoc ? proposal.recommendedDoc.documentName : proposal.allPossibleDocs[0].documentName)}</span>
        </div>
        <button type="button" class="btn btn-primary btn-sm btn-rec-doc" data-doc-type="${escapeHtml(proposal.recommendedDoc ? proposal.recommendedDoc.docType : proposal.allPossibleDocs[0].docType)}">${getAddDocButtonLabel(proposal.recommendedDoc ? proposal.recommendedDoc.docType : proposal.allPossibleDocs[0].docType)}</button>
        ${(proposal.allPossibleDocs && proposal.allPossibleDocs.length > 1) ? `
        <div class="alt-sources-row" style="margin-top: 6px; font-size: 11px; color: var(--text-muted); display: flex; flex-wrap: wrap; gap: 4px; align-items: center;">
          <span>Or provide:</span>
          ${proposal.allPossibleDocs
            .filter(d => !proposal.recommendedDoc || d.docType !== proposal.recommendedDoc.docType)
            .map(d => `<button type="button" class="btn-alt-doc" data-doc-type="${escapeHtml(d.docType)}" style="background: rgba(255,255,255,0.06); border: 1px solid var(--border-color); border-radius: 4px; padding: 2px 6px; font-size: 10px; cursor: pointer; color: var(--text-color);">${escapeHtml(d.documentName || d.label)}</button>`).join('')}
        </div>` : ''}
      </div>` : ''}
      <div class="card-bottom">
        <span class="source-tag">📂 ${sourceStr}</span>
        <span class="reason-tooltip" title="${escapeHtml(proposal.reason)}">${escapeHtml(
          (proposal.reason || '').length > 60
            ? proposal.reason.substring(0, 57) + '...'
            : (proposal.reason || '')
        )}</span>
      </div>
    `;

    const recDocBtn = card.querySelector('.btn-rec-doc');
    if (recDocBtn) {
      recDocBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const targetDocType = recDocBtn.getAttribute('data-doc-type');
        triggerDocumentUploadForField(targetDocType, proposal.fieldId, proposal.canonicalId);
      });
    }

    card.querySelectorAll('.btn-alt-doc').forEach(altBtn => {
      altBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const targetDocType = altBtn.getAttribute('data-doc-type');
        triggerDocumentUploadForField(targetDocType, proposal.fieldId, proposal.canonicalId);
      });
    });

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
    const uploadCount = Object.keys(activePreparedUploads).length;
    let label = `${count} field${count === 1 ? '' : 's'} selected to fill`;
    if (uploadCount > 0) {
      label += ` + ${uploadCount} file${uploadCount === 1 ? '' : 's'} ready to upload`;
    }
    approvedCountText.textContent = label;
    btnAutofill.disabled = (count === 0 && uploadCount === 0);
    btnAutofill.textContent = `⚡ Autofill Approved (${count}${uploadCount > 0 ? ` + ${uploadCount} file${uploadCount === 1 ? '' : 's'}` : ''})`;
  }

  async function handleAutofill() {
    const approvedProposals = currentProposals.filter(p => p.approved);
    const preparedUploadKeys = Object.keys(activePreparedUploads);
    if ((approvedProposals.length === 0 && preparedUploadKeys.length === 0) || !currentActiveTabId) return;

    btnAutofill.disabled = true;
    btnAutofill.textContent = 'Autofilling...';

    let fieldResultText = '';
    let uploadResultText = '';

    // Step 1: Autofill text/select fields if any approved
    if (approvedProposals.length > 0) {
      await new Promise((resolve) => {
        chrome.tabs.sendMessage(
          currentActiveTabId,
          { action: 'AUTOFILL_APPROVED', approvedProposals },
          (res) => {
            if (chrome.runtime.lastError || !res || !res.report) {
              fieldResultText = 'Fields fill failed to communicate with page.';
            } else {
              const report = res.report;
              if (report.success) {
                fieldResultText = `Filled ${report.filledCount} of ${report.totalAttempted} fields.`;
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
                fieldResultText = `Fields filled with warnings (${report.failedCount} failed).`;
              }
            }
            resolve();
          }
        );
      });
    }

    // Step 2: Upload prepared files (if any)
    if (preparedUploadKeys.length > 0) {
      const filesPayload = await Promise.all(preparedUploadKeys.map(async k => {
        const u = activePreparedUploads[k];
        let dataUrl = '';
        const fileOrBlob = u.blob || u.file;
        if (fileOrBlob) {
          dataUrl = await new Promise((resolve) => {
            if (typeof fileOrBlob === 'string' && fileOrBlob.startsWith('data:')) {
              return resolve(fileOrBlob);
            }
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => resolve('');
            reader.readAsDataURL(fileOrBlob);
          });
        }
        return {
          elementId: u.elementId,
          selector: u.selector,
          filename: u.filename,
          dataUrl: dataUrl
        };
      }));

      await new Promise((resolve) => {
        chrome.tabs.sendMessage(
          currentActiveTabId,
          { action: 'UPLOAD_APPROVED_FILES', files: filesPayload },
          (res) => {
            if (chrome.runtime.lastError || !res || !res.results) {
              uploadResultText = 'Files upload failed to communicate with page.';
            } else {
              const successful = (res.results || []).filter(r => r.success).length;
              uploadResultText = `Attached ${successful} file(s).`;
            }
            resolve();
          }
        );
      });
    }

    btnAutofill.disabled = false;
    updateActionBar();

    const summaryMsg = [fieldResultText, uploadResultText].filter(Boolean).join(' | ');
    showResultAlert(`✅ ${summaryMsg || 'Process complete.'} (Review and submit manually — zero auto-submit)`, true);
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
