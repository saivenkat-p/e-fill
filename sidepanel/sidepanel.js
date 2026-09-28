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
  function getApplicationPlan() { return window.EFillApplicationPlan?.applicationPlan; }
  function getConversationalAssistant() { return window.EFillConversationalAssistant?.conversationalAssistant; }

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
  const groupChoices  = document.getElementById('group-choices');
  const groupMissing  = document.getElementById('group-missing');
  const groupDocs     = document.getElementById('group-docs');
  const groupUploads  = document.getElementById('group-uploads');
  const groupSecurity = document.getElementById('group-security');
  const stackReady    = document.getElementById('stack-ready');
  const stackReview   = document.getElementById('stack-review');
  const stackConflict = document.getElementById('stack-conflict');
  const stackChoices  = document.getElementById('stack-choices');
  const stackMissing  = document.getElementById('stack-missing');
  const stackDocs     = document.getElementById('stack-docs');
  const stackUploads  = document.getElementById('stack-uploads');
  const stackSecurity = document.getElementById('stack-security');
  const gcReady    = document.getElementById('group-count-ready');
  const gcReview   = document.getElementById('group-count-review');
  const gcConflict = document.getElementById('group-count-conflict');
  const gcChoices  = document.getElementById('group-count-choices');
  const gcMissing  = document.getElementById('group-count-missing');
  const gcDocs     = document.getElementById('group-count-docs');
  const gcUploads  = document.getElementById('group-count-uploads');
  const gcSecurity = document.getElementById('group-count-security');

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
  const editFieldNameInput     = document.getElementById('edit-field-name-input');
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
        const newLabel = editFieldNameInput ? editFieldNameInput.value.trim() : (pendingQuickEditTarget.label || '');
        const val = editFieldValueInput ? editFieldValueInput.value.trim() : '';
        const onSave = pendingQuickEditTarget.onSave;
        closeQuickEditModal();
        if (typeof onSave === 'function') {
          await onSave(val, newLabel);
        }
      });
    }
  }

  function openQuickEditModal({ fieldId, label, currentValue, onSave }) {
    if (!modalEditField) return;
    pendingQuickEditTarget = { fieldId, label, currentValue, onSave };
    if (editFieldTitle) editFieldTitle.textContent = `Edit ${label || fieldId}`;
    if (editFieldNameInput) {
      editFieldNameInput.value = label || fieldId;
    }
    if (editFieldLabel) {
      editFieldLabel.textContent = label || fieldId;
    }
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
        const ocrRes = await ocrEngine.recognize(file, { filename: file.name, mimeType: file.type });
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
        let pdfText = '';
        if (ocrEngine && typeof ocrEngine._extractPdfText === 'function') {
          pdfText = ocrEngine._extractPdfText(bytes, { filename: file.name, mimeType: file.type });
        }
        if (!pdfText || pdfText.trim().length <= 5) {
          pdfText = extractTextFromPdfBytes(bytes);
        }
        if (pdfText && pdfText.trim().length > 5) return { text: pdfText, blocks: [] };
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
    const conflicts = comparison?.conflicts || [];

    // Always show Document Processed Review modal so the user can review all extracted fields (including Student Name)
    showDocumentProcessedModal(file, extracted, targetFieldId, targetCanonicalId, conflicts);
  }

  function showDocumentProcessedModal(file, extracted, targetFieldId = null, targetCanonicalId = null, conflicts = []) {
    if (!modalDocProcessed) {
      mergeExtractedDataIntoCurrentProfile(extracted.fields);
      return;
    }

    const docMap = window.EFillDocumentFieldMap;
    const docInfo = docMap && docMap.SUPPORTED_DOCUMENTS ? docMap.SUPPORTED_DOCUMENTS[extracted.docType] : null;
    const docTypeName = docInfo ? (docInfo.label || docInfo.name) : (extracted.docType || 'Document');

    const personName = currentProfileDisplayNameEl?.textContent || 'Selected Person';
    if (docProcessedTitle) docProcessedTitle.textContent = `Document Processed: ${docTypeName}`;
    if (docProcessedTargetName) docProcessedTargetName.textContent = personName;
    if (docProcessedTypeLabel) docProcessedTypeLabel.textContent = docTypeName;

    const labelMap = {
      edu_candidate_name: 'Student Name',
      student_name: 'Student Name',
      candidate_name: 'Student Name',
      full_name: 'Student Name',
      edu_father_name: "Father's Name",
      father_name: "Father's Name",
      edu_mother_name: "Mother's Name",
      mother_name: "Mother's Name",
      dob: 'Date of Birth',
      edu_institution: 'School',
      institution: 'School',
      school: 'School',
      edu_board: 'Board',
      board: 'Board',
      edu_year: 'Year of Passing',
      year_of_passing: 'Year of Passing',
      edu_roll_number: 'Roll Number',
      roll_number: 'Roll Number',
      edu_marks: 'Marks Obtained',
      marks_obtained: 'Marks Obtained',
      edu_max_marks: 'Maximum Marks',
      maximum_marks: 'Maximum Marks',
      edu_percentage: 'Percentage',
      percentage: 'Percentage',
      edu_grade: 'Division',
      grade: 'Division',
      division: 'Division',
      edu_medium: 'Medium',
      medium: 'Medium',
      edu_certificate_number: 'Certificate Number',
      certificate_number: 'Certificate Number',
      edu_registration_number: 'Registration Number',
      registration_number: 'Registration Number',
      subject_first_language: 'First Language Marks (Telugu)',
      subject_second_language: 'Second Language Marks (Hindi)',
      subject_third_language: 'Third Language Marks (English)',
      subject_mathematics: 'Mathematics Marks',
      subject_science: 'Science Marks',
      subject_social: 'Social Studies Marks',
      identification_marks: 'Marks of Identification'
    };

    const preferredOrder = [
      'edu_candidate_name', 'student_name', 'candidate_name', 'full_name',
      'edu_father_name', 'father_name',
      'edu_mother_name', 'mother_name',
      'dob',
      'edu_institution', 'school', 'institution',
      'edu_board', 'board',
      'edu_year', 'year_of_passing',
      'edu_roll_number', 'roll_number',
      'edu_marks', 'marks_obtained',
      'edu_max_marks', 'maximum_marks',
      'edu_percentage', 'percentage',
      'edu_grade', 'grade', 'division',
      'edu_medium', 'medium',
      'edu_certificate_number', 'certificate_number',
      'edu_registration_number', 'registration_number',
      'subject_first_language', 'subject_second_language', 'subject_third_language',
      'subject_mathematics', 'subject_science', 'subject_social',
      'identification_marks'
    ];

    const rawFields = extracted.fields || {};
    const normalizedFields = {};
    const isEduDoc = extracted.docType === 'SSC_10TH' || extracted.docType === 'INTER_12TH' || extracted.docType === 'DEGREE';

    // 1. Deduplicate & consolidate to canonical fields
    for (const [k, fObj] of Object.entries(rawFields)) {
      const v = typeof fObj === 'object' && fObj !== null ? fObj.value : fObj;
      if (!v || !String(v).trim()) continue;

      let canonicalKey = k;
      if (isEduDoc) {
        if (k === 'full_name' || k === 'student_name' || k === 'candidate_name') canonicalKey = 'edu_candidate_name';
        else if (k === 'father_name') canonicalKey = 'edu_father_name';
        else if (k === 'mother_name') canonicalKey = 'edu_mother_name';
        else if (k === 'certificate_number') canonicalKey = 'edu_certificate_number';
        else if (k === 'registration_number') canonicalKey = 'edu_registration_number';
        else if (k === 'grade' || k === 'division') canonicalKey = 'edu_grade';
        else if (k === 'medium') canonicalKey = 'edu_medium';
        else if (k === 'school' || k === 'institution') canonicalKey = 'edu_institution';
        else if (k === 'board') canonicalKey = 'edu_board';
        else if (k === 'year_of_passing' || k === 'passing_year') canonicalKey = 'edu_year';
        else if (k === 'roll_number') canonicalKey = 'edu_roll_number';
        else if (k === 'marks_obtained' || k === 'marks') canonicalKey = 'edu_marks';
        else if (k === 'maximum_marks' || k === 'max_marks') canonicalKey = 'edu_max_marks';
        else if (k === 'percentage') canonicalKey = 'edu_percentage';
      }

      // Skip unhelpful internal name chunks if edu_candidate_name is already extracted
      if (isEduDoc && (k === 'first_name' || k === 'middle_name' || k === 'last_name') && (rawFields.edu_candidate_name || rawFields.full_name)) {
        continue;
      }

      if (!normalizedFields[canonicalKey]) {
        normalizedFields[canonicalKey] = {
          cid: canonicalKey,
          value: String(v).trim(),
          label: labelMap[canonicalKey] || (typeof fObj === 'object' && fObj.label ? fObj.label : canonicalKey.replace(/^edu_/, '').replace(/_/g, ' ')),
          sensitive: typeof fObj === 'object' ? !!fObj.sensitive : false,
          confidence: typeof fObj === 'object' ? (fObj.confidence || 0.95) : 0.95,
          category: typeof fObj === 'object' ? fObj.category : null
        };
      }
    }

    // Sort entries according to preferred order
    const sortedEntries = Object.entries(normalizedFields).sort((a, b) => {
      const idxA = preferredOrder.indexOf(a[0]);
      const idxB = preferredOrder.indexOf(b[0]);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a[0].localeCompare(b[0]);
    });

    if (docProcessedFoundContainer) docProcessedFoundContainer.innerHTML = '';
    const newItems = [];
    const existingItems = [];

    // Instruction banner
    const docProcessedBannerEl = document.getElementById('doc-processed-banner');
    if (docProcessedBannerEl) {
      if (conflicts && conflicts.length > 0) {
        docProcessedBannerEl.innerHTML = '⚠️ <strong>Notice:</strong> Some extracted information differs from your current profile. Review below and choose what to save:';
        docProcessedBannerEl.style.color = '#fbbf24';
      } else {
        docProcessedBannerEl.textContent = 'Review information found in this document before saving to profile:';
        docProcessedBannerEl.style.color = '';
      }
    }

    sortedEntries.forEach(([cid, item]) => {
      const val = item.value;
      const label = item.label;
      const confidence = item.confidence;

      // Find if an existing profile field exists or differs
      let existingVal = '';
      let existingLabel = '';
      let hasDifference = false;

      if (currentInfoProfile) {
        let existingF = currentInfoProfile.getField(cid);
        const hasExistingValue = existingF && existingF.value && String(existingF.value).trim();
        if (!hasExistingValue && isEduDoc) {
          if (cid === 'edu_candidate_name') {
            const fullF = currentInfoProfile.getField('full_name');
            const fnF = currentInfoProfile.getField('first_name');
            existingF = (fullF && fullF.value && String(fullF.value).trim()) ? fullF : ((fnF && fnF.value && String(fnF.value).trim()) ? fnF : null);
            if (existingF) existingLabel = existingF.canonicalField === 'first_name' ? 'First Name' : 'Full Name';
          } else if (cid === 'edu_father_name') {
            const f = currentInfoProfile.getField('father_name');
            if (f && f.value && String(f.value).trim()) { existingF = f; existingLabel = "Father's Name"; }
          } else if (cid === 'edu_mother_name') {
            const m = currentInfoProfile.getField('mother_name');
            if (m && m.value && String(m.value).trim()) { existingF = m; existingLabel = "Mother's Name"; }
          }
        }
        if (existingF && existingF.value && String(existingF.value).trim()) {
          existingVal = String(existingF.value).trim();
          if (!existingLabel) existingLabel = label;
          if (existingVal.toLowerCase() !== val.toLowerCase()) {
            hasDifference = true;
          }
        }
      }

      if (existingVal && !hasDifference) {
        existingItems.push({ cid, label, val });
      } else {
        newItems.push({ cid, label, val, hasDifference, existingVal, existingLabel });
      }

      if (docProcessedFoundContainer) {
        const isTarget = (cid === targetCanonicalId);
        const matchingProp = (currentProposals || []).find(p => p.canonicalId === cid || p.fieldId === cid);
        const matchBadge = matchingProp
          ? `<span class="badge-form-match" style="background: rgba(16, 185, 129, 0.2); color: #34d399; font-size: 10px; padding: 2px 6px; border-radius: 4px; margin-left: auto;">🎯 Autofills "${escapeHtml(matchingProp.label || matchingProp.canonicalId)}"</span>`
          : `<span class="badge-profile-only" style="background: rgba(99, 102, 241, 0.15); color: #a5b4fc; font-size: 10px; padding: 2px 6px; border-radius: 4px; margin-left: auto;">👤 Adds to Profile</span>`;

        let diffHtml = '';
        if (hasDifference) {
          diffHtml = `
            <div class="processed-diff-indicator">
              <span class="diff-doc-tag">Document Value: <strong>${escapeHtml(val)}</strong></span>
              <span class="diff-existing-tag">Existing Profile (${escapeHtml(existingLabel)}): <strong>${escapeHtml(existingVal)}</strong></span>
            </div>
          `;
        }

        const itemRow = document.createElement('div');
        itemRow.className = `processed-field-row ${isTarget || matchingProp ? 'target-rec-highlight' : ''}`;
        itemRow.style.cssText = 'padding: 8px 10px; margin-bottom: 6px; border-radius: 6px; background: var(--bg-surface); border: 1px solid var(--border-color); display: flex; flex-direction: column; gap: 6px;';
        itemRow.innerHTML = `
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <label class="processed-field-label" style="display: flex; align-items: center; gap: 6px; margin: 0; cursor: pointer;">
              <input type="checkbox" class="doc-field-checkbox" data-cid="${escapeHtml(cid)}" checked>
              <span class="field-title" style="font-weight: 600; font-size: 12px; color: #f1f5f9;">${escapeHtml(label)}${hasDifference ? ' <span class="diff-conflict-badge">Differs from profile</span>' : ''}</span>
            </label>
            ${matchBadge}
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <input type="text" class="input doc-field-val-input" data-cid="${escapeHtml(cid)}"
              value="${escapeHtml(val || '')}" placeholder="Enter value" style="flex: 1; font-size: 12px; padding: 4px 8px;">
            <span class="confidence-tag" style="font-size: 10px; color: #94a3b8;">${Math.round(confidence * 100)}%</span>
          </div>
          ${diffHtml}
        `;
        docProcessedFoundContainer.appendChild(itemRow);
      }
    });

    if (docProcessedNewList) {
      docProcessedNewList.innerHTML = newItems.length > 0
        ? newItems.map(i => `<li><strong>${escapeHtml(i.label)}</strong>: ${escapeHtml(i.val)}${i.hasDifference ? ` <em style="color:#fbbf24;">(differs from ${escapeHtml(i.existingLabel)}: "${escapeHtml(i.existingVal)}")</em>` : ''}</li>`).join('')
        : '<li class="text-muted">No new fields found</li>';
    }

    if (docProcessedExistingList) {
      docProcessedExistingList.innerHTML = existingItems.length > 0
        ? existingItems.map(i => `<li><strong>${escapeHtml(i.label)}</strong>: ${escapeHtml(i.val)} <span class="existing-note">(already in profile)</span></li>`).join('')
        : '<li class="text-muted">None</li>';
    }

    pendingProcessedDoc = { file, extracted: { ...extracted, fields: normalizedFields }, docTypeName, targetFieldId, targetCanonicalId };
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

    // Find or create education record if saving education fields or educational document
    let targetEduRecordId = null;
    const isEduDoc = extracted.docType === 'SSC_10TH' || extracted.docType === 'INTER_12TH' || extracted.docType === 'DEGREE';
    const hasEduFields = isEduDoc || Object.keys(extracted.fields || {}).some(cid => checkedCids.has(cid) && cid.startsWith('edu_'));
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
      const eduRecId = (cid.startsWith('edu_') || (targetEduRecordId && isEduDoc && (cid.startsWith('subject_') || cid === 'identification_marks'))) ? targetEduRecordId : null;

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

      // If educational document, mirror student, father, mother into the education record AND personal profile
      if (targetEduRecordId && isEduDoc) {
        if (cid === 'full_name' || cid === 'student_name' || cid === 'edu_candidate_name') {
          currentInfoProfile.setField('edu_candidate_name', finalVal, 'USER_CONFIRMED', `Extracted from ${docTypeName}`, targetEduRecordId, 'education');
          currentInfoProfile.setField('full_name', finalVal, 'USER_CONFIRMED', `Extracted from ${docTypeName}`);
        } else if (cid === 'father_name' || cid === 'edu_father_name') {
          currentInfoProfile.setField('edu_father_name', finalVal, 'USER_CONFIRMED', `Extracted from ${docTypeName}`, targetEduRecordId, 'education');
          currentInfoProfile.setField('father_name', finalVal, 'USER_CONFIRMED', `Extracted from ${docTypeName}`);
        } else if (cid === 'mother_name' || cid === 'edu_mother_name') {
          currentInfoProfile.setField('edu_mother_name', finalVal, 'USER_CONFIRMED', `Extracted from ${docTypeName}`, targetEduRecordId, 'education');
          currentInfoProfile.setField('mother_name', finalVal, 'USER_CONFIRMED', `Extracted from ${docTypeName}`);
        }
      }

      newlyAddedFieldIds.push(cid);
    }

    await saveInformationProfile(true);
    closeDocProcessedModal();

    // Transition clearly to My Information tab so the user immediately sees the saved cards!
    if (tabInfoBtn && viewInfo) {
      if (tabReviewBtn) tabReviewBtn.classList.remove('active');
      tabInfoBtn.classList.add('active');
      if (viewReview) viewReview.classList.remove('active');
      viewInfo.classList.add('active');
    }

    populateInfoForm();

    const personName = currentProfileDisplayNameEl?.textContent || 'Selected Person';
    showSaveToastMessage(`✓ Information saved to "${personName}"`);

    // Auto-scroll to Education Records section so individual cards are immediately in view
    if (isEduDoc || hasEduFields) {
      expandSection('education');
      const eduCard = document.querySelector('[data-profile-section="education"]') || document.getElementById('populated-edu-container');
      if (eduCard) {
        try { eduCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e) {}
      }
    }

    if (autofillAfterSave && targetFieldId) {
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
    const card = document.createElement('div');
    card.className = 'edu-record-card';
    card.setAttribute('data-edu-id', rec.id);

    const header = document.createElement('div');
    header.className = 'edu-record-header';
    header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; border-radius: 8px 8px 0 0;';
    header.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 16px;">📜</span>
        <strong class="edu-record-title" style="font-size: 14px; color: #0f172a;">${escapeHtml(rec.qualification || 'Education Record')}</strong>
      </div>
      <button type="button" class="btn-delete-edu" title="Remove this entire record" style="background: none; border: none; color: #ef4444; font-size: 12px; font-weight: 600; cursor: pointer; padding: 4px 8px; border-radius: 4px;">✕ Remove Record</button>
    `;

    header.querySelector('.btn-delete-edu').addEventListener('click', async () => {
      if (confirm(`Remove "${rec.qualification || 'this record'}"?`)) {
        currentInfoProfile.removeEducationRecord(rec.id);
        renderEducationRecords();
        await saveInformationProfile(true);
        populateInfoForm();
      }
    });
    card.appendChild(header);

    const fieldsContainer = document.createElement('div');
    fieldsContainer.className = 'edu-fields-container';
    fieldsContainer.style.cssText = 'padding: 8px 12px; display: flex; flex-direction: column; gap: 8px;';

    const labelMap = {
      edu_candidate_name: 'Student Name',
      student_name: 'Student Name',
      candidate_name: 'Student Name',
      full_name: 'Student Name',
      edu_father_name: "Father's Name",
      father_name: "Father's Name",
      edu_mother_name: "Mother's Name",
      mother_name: "Mother's Name",
      edu_institution: 'School',
      institution: 'School',
      school: 'School',
      edu_board: 'Board',
      board: 'Board',
      edu_year: 'Year of Passing',
      year_of_passing: 'Year of Passing',
      edu_roll_number: 'Roll Number',
      roll_number: 'Roll Number',
      edu_marks: 'Marks Obtained',
      marks_obtained: 'Marks Obtained',
      edu_max_marks: 'Maximum Marks',
      maximum_marks: 'Maximum Marks',
      edu_percentage: 'Percentage',
      percentage: 'Percentage',
      edu_grade: 'Division',
      grade: 'Division',
      division: 'Division',
      edu_medium: 'Medium',
      medium: 'Medium',
      edu_certificate_number: 'Certificate Number',
      certificate_number: 'Certificate Number',
      edu_registration_number: 'Registration Number',
      registration_number: 'Registration Number',
      subject_first_language: 'First Language (Telugu)',
      subject_second_language: 'Second Language (Hindi)',
      subject_third_language: 'Third Language (English)',
      subject_mathematics: 'Mathematics',
      subject_science: 'General Science',
      subject_social: 'Social Studies',
      identification_marks: 'Marks of Identification',
      marks_of_identification: 'Marks of Identification'
    };

    const preferredOrder = [
      'edu_candidate_name', 'student_name', 'candidate_name', 'full_name',
      'edu_father_name', 'father_name',
      'edu_mother_name', 'mother_name',
      'edu_institution', 'school', 'institution',
      'edu_board', 'board',
      'edu_year', 'year_of_passing',
      'edu_roll_number', 'roll_number',
      'edu_marks', 'marks_obtained',
      'edu_max_marks', 'maximum_marks',
      'edu_percentage', 'percentage',
      'edu_grade', 'grade', 'division',
      'edu_medium', 'medium',
      'edu_certificate_number', 'certificate_number',
      'edu_registration_number', 'registration_number',
      'subject_first_language', 'subject_second_language', 'subject_third_language',
      'subject_mathematics', 'subject_science', 'subject_social',
      'identification_marks', 'marks_of_identification'
    ];

    const schemaFields = window.EFillCanonicalSchema?.CANONICAL_FIELDS || {};
    const recFields = rec.fields || {};
    const fieldEntries = Object.entries(recFields).filter(([fid, f]) => {
      if (fid === 'edu_qualification') return false;
      return f && f.value !== undefined && f.value !== null && String(f.value).trim() !== '';
    });

    fieldEntries.sort((a, b) => {
      const idxA = preferredOrder.indexOf(a[0]);
      const idxB = preferredOrder.indexOf(b[0]);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a[0].localeCompare(b[0]);
    });

    if (fieldEntries.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.className = 'empty-edu-fields';
      emptyMsg.style.cssText = 'padding: 12px; color: #94a3b8; font-size: 12px; font-style: italic;';
      emptyMsg.textContent = 'No individual fields saved for this record yet.';
      fieldsContainer.appendChild(emptyMsg);
    } else {
      fieldEntries.forEach(([fid, fieldObj]) => {
        const label = fieldObj.label || labelMap[fid] || schemaFields[fid]?.label || fid.replace(/^edu_/, '').replace(/_/g, ' ');
        const row = document.createElement('div');
        row.className = 'profile-field-item edu-field-card';
        row.setAttribute('data-edu-field', fid);
        row.setAttribute('data-field-id', fid);

        const val = String(fieldObj.value || '');
        const sourceLabel = formatProvenanceLabel(fieldObj.provenance, fieldObj.source);

        row.innerHTML = `
          <div class="field-meta">
            <span class="field-label edu-field-label">${escapeHtml(label)}</span>
            <div class="field-value-row">
              <span class="field-value edu-field-value">${escapeHtml(val)}</span>
            </div>
            <span class="field-source-hint">Source: ${escapeHtml(sourceLabel)}</span>
          </div>
          <div class="field-actions">
            <button type="button" class="btn-field-action btn-field-edit btn-edit-edu-field" title="Edit field value">✏️</button>
            <button type="button" class="btn-field-action btn-field-delete btn-delete-edu-field" title="Delete field">🗑️</button>
          </div>
        `;

        // ✏️ Edit
        row.querySelector('.btn-field-edit').addEventListener('click', () => {
          openQuickEditModal({
            fieldId: fid,
            label,
            currentValue: val,
            onSave: async (newVal, newLabel) => {
              currentInfoProfile.updateEducationRecord(rec.id, fid, newVal, 'USER_EDITED', 'Edited in My Information', newLabel);
              await saveInformationProfile(true);
              populateInfoForm();
              showSaveToastMessage(`Updated ${newLabel || label}`);
            }
          });
        });

        // 🗑️ Delete
        row.querySelector('.btn-field-delete').addEventListener('click', () => {
          requestFieldDeletion({
            id: fid,
            label,
            value: val,
            isCustom: false,
            isSensitive: false,
            educationRecordId: rec.id,
            domInput: null
          });
        });

        fieldsContainer.appendChild(row);
      });
    }

    card.appendChild(fieldsContainer);
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

    const { id, isCustom, educationRecordId, domInput } = pendingDeletionTarget;

    if (educationRecordId) {
      currentInfoProfile.clearField(id, educationRecordId);
    } else if (isCustom) {
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
    updateActionBar();
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

    function isBrowserInternalUrl(url) {
      if (!url || typeof url !== 'string') return false;
      return (
        url.startsWith('chrome://') ||
        url.startsWith('chrome-extension://') ||
        url.startsWith('edge://') ||
        url.startsWith('about:') ||
        url.startsWith('moz-extension://') ||
        url.startsWith('view-source:')
      );
    }

    if (tab.url && isBrowserInternalUrl(tab.url)) {
      showBlockedState('E-Fill does not operate on browser system pages');
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
                  'core/upload-requirement-engine.js',
                  'core/document-requirement-engine.js',
                  'core/application-mapping-engine.js',
                  'core/availability-engine.js',
                  'core/source-selector.js',
                  'core/application-plan.js',
                  'core/conversational-assistant.js',
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
                  showCommunicationErrorState('Could not communicate with content script on this page');
                }
              });
            } else {
              showCommunicationErrorState('Could not communicate with page');
            }
          } catch (injectErr) {
            console.warn('[E-Fill] Injection not permitted:', injectErr);
            if (tab.url && isBrowserInternalUrl(tab.url)) {
              showBlockedState('E-Fill cannot operate on this page');
            } else {
              showCommunicationErrorState('Content script injection failed');
            }
          }
          return;
        }
        renderScanResults(response.data);
      });
    } catch (err) {
      console.warn('[E-Fill] Scan error:', err);
      showCommunicationErrorState('Scan error occurred');
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

    // Update and evaluate Application Plan
    const appPlan = getApplicationPlan();
    if (appPlan) {
      appPlan.addPage(scanData);
      if (currentInfoProfile) {
        appPlan.evaluateAgainstProfile(currentInfoProfile);
      }
      renderApplicationPlanUI(appPlan, scanData);
      renderAssistantUI(appPlan, scanData);
    }

    // Use the v2 InformationProfile if available, else legacy flat
    const profileForProposals = currentInfoProfile || currentLegacyProfile;
    const docSourceMgr = getDocumentSourceManager();
    const sessionOverrides = docSourceMgr ? docSourceMgr.getSessionOverrides() : {};

    const planSessionData = {};
    if (appPlan && appPlan.sessionData) {
      for (const [k, v] of Object.entries(appPlan.sessionData)) {
        if (v && v.value) {
          planSessionData[k] = {
            value: v.value,
            source: v.source || 'Application Session Choice',
            provenance: 'USER_CONFIRMED',
            isSessionOnly: true
          };
        }
      }
      if (scanData && scanData.fields) {
        for (const f of scanData.fields) {
          const fid = f.id || f.name;
          const cid = f.canonicalId;
          const sVal = appPlan.getSessionValue(fid) || (cid ? appPlan.getSessionValue(cid) : null);
          if (sVal) {
            const entry = {
              value: sVal,
              source: 'Application Session Choice',
              provenance: 'USER_CONFIRMED',
              isSessionOnly: true
            };
            if (fid) planSessionData[fid] = entry;
            if (cid) planSessionData[cid] = entry;
          }
        }
      }
    }
    const combinedSessionOverrides = { ...sessionOverrides, ...planSessionData };

    const selector = getSourceSelector();
    currentProposals = selector
      ? selector.generateProposals(scanData.fields, profileForProposals, combinedSessionOverrides)
      : [];

    // Clear group stacks
    if (stackReady)    stackReady.innerHTML = '';
    if (stackReview)   stackReview.innerHTML = '';
    if (stackConflict) stackConflict.innerHTML = '';
    if (stackChoices)  stackChoices.innerHTML = '';
    if (stackMissing)  stackMissing.innerHTML = '';
    if (stackSecurity) stackSecurity.innerHTML = '';

    let nReady = 0, nReview = 0, nConflict = 0, nChoices = 0, nMissing = 0, nSecurity = 0;

    currentProposals.forEach((proposal, idx) => {
      const card = createProposalCard(proposal, idx);
      const isSecurity = proposal.isSecurityCredential || proposal.isRealSecurityChallenge ||
                         proposal.type === 'SECURITY_CREDENTIAL' || proposal.type === 'SECURITY_CHALLENGE' ||
                         proposal.status === 'USER_ACTION_REQUIRED';
      const isChoice = proposal.status === 'APPLICATION_CHOICE' || (proposal.isApplicationChoice && !proposal.proposedValue);

      if (isSecurity) {
        if (stackSecurity) stackSecurity.appendChild(card);
        nSecurity++;
      } else if (isChoice) {
        if (stackChoices) stackChoices.appendChild(card);
        nChoices++;
      } else {
        switch (proposal.status) {
          case 'READY':
            if (stackReady) stackReady.appendChild(card);
            nReady++;
            break;
          case 'REVIEW_REQUIRED':
          case 'AMBIGUOUS':
            if (stackReview) stackReview.appendChild(card);
            nReview++;
            break;
          case 'CONFLICT':
            if (stackConflict) stackConflict.appendChild(card);
            nConflict++;
            break;
          default: // UNAVAILABLE, UNIDENTIFIED, MISSING
            if (stackMissing) stackMissing.appendChild(card);
            nMissing++;
            break;
        }
      }
    });

    // Show/hide field groups
    showGroup(groupReady, nReady, gcReady);
    showGroup(groupReview, nReview, gcReview);
    showGroup(groupConflict, nConflict, gcConflict);
    showGroup(groupChoices, nChoices, gcChoices);
    showGroup(groupMissing, nMissing, gcMissing);
    showGroup(groupSecurity, nSecurity, gcSecurity);

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

  function renderApplicationPlanUI(appPlan, scanData) {
    const card = document.getElementById('app-plan-card');
    const titleEl = document.getElementById('plan-app-title');
    const stepBadge = document.getElementById('plan-step-badge');
    const progressTextEl = document.getElementById('plan-progress-text');
    const sectionsListEl = document.getElementById('plan-sections-list');
    const sectionsRow = document.getElementById('plan-sections-row');
    const futureNoticeEl = document.getElementById('plan-future-notice');
    if (!card || !titleEl || !stepBadge) return;

    card.style.display = 'block';
    titleEl.textContent = appPlan.applicationName || scanData.title || 'Application Journey';

    const totalSteps = Math.max(appPlan.pages.length, appPlan.totalInferredSteps || 1);
    stepBadge.textContent = `Step ${appPlan.currentStep} of ${totalSteps}`;

    const discoveredCount = appPlan.sections.filter(s => s.status === 'DISCOVERED').length;
    const totalKnownSections = appPlan.sections.length;
    if (progressTextEl) {
      progressTextEl.textContent = totalKnownSections > discoveredCount
        ? `Progress: ${discoveredCount} / ${totalKnownSections} sections discovered`
        : `Progress: ${discoveredCount} section${discoveredCount !== 1 ? 's' : ''} discovered`;
    }

    if (sectionsListEl) {
      sectionsListEl.innerHTML = '';
      appPlan.sections.forEach(sec => {
        const row = document.createElement('div');
        row.className = 'plan-section-row';
        row.style.cssText = 'padding: 6px 8px; border-radius: 6px; font-size: 12px; display: flex; align-items: center; justify-content: space-between;';

        if (sec.status === 'DISCOVERED') {
          let icon = '✓';
          let bg = 'background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534;';
          let statusDetail = `${sec.readyCount} / ${sec.fieldCount} ready`;

          if (sec.missingCount > 0) {
            icon = '⚠️';
            bg = 'background: #fffbeb; border: 1px solid #fde68a; color: #92400e;';
            statusDetail = `${sec.missingCount} missing`;
          } else if (sec.reviewCount > 0) {
            icon = '🔍';
            bg = 'background: #f5f3ff; border: 1px solid #ddd6fe; color: #5b21b6;';
            statusDetail = `${sec.reviewCount} needs review`;
          }

          row.style.cssText += bg;
          row.innerHTML = `
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="font-weight: 700;">${icon}</span>
              <span style="font-weight: 600;">${escapeHtml(sec.name)}</span>
            </div>
            <span style="font-size: 11px; opacity: 0.9;">${escapeHtml(statusDetail)}</span>
          `;
        } else if (sec.status === 'INFERRED') {
          row.style.cssText += 'background: #f8fafc; border: 1px dashed #cbd5e1; color: #64748b;';
          row.innerHTML = `
            <div style="display: flex; align-items: center; gap: 6px;">
              <span>○</span>
              <span>${escapeHtml(sec.name)}</span>
            </div>
            <span style="font-size: 10px; font-style: italic;">Inferred from navigation</span>
          `;
        }

        sectionsListEl.appendChild(row);
      });
    }

    if (futureNoticeEl) {
      if (!appPlan.hasInferredFutureSteps) {
        futureNoticeEl.style.display = 'block';
        futureNoticeEl.textContent = 'Future sections will be discovered as you proceed.';
      } else {
        futureNoticeEl.style.display = 'none';
      }
    }

    // Keep backwards-compatible chips if sectionsRow exists
    if (sectionsRow) {
      sectionsRow.innerHTML = '';
      appPlan.sections.forEach(sec => {
        const chip = document.createElement('span');
        chip.style.cssText = `font-size: 11px; padding: 2px 8px; border-radius: 12px; font-weight: 600; display: inline-flex; align-items: center; gap: 4px; ${
          sec.status === 'DISCOVERED' ? 'background: #dcfce7; color: #166534; border: 1px solid #bbf7d0;' : 'background: #f1f5f9; color: #64748b; border: 1px solid #e2e8f0;'
        }`;
        chip.innerHTML = `${sec.status === 'DISCOVERED' ? '✓' : '•'} ${escapeHtml(sec.name)}`;
        sectionsRow.appendChild(chip);
      });
    }
  }

  function renderAssistantUI(appPlan, scanData) {
    const assistantBox = document.getElementById('assistant-box');
    const assistantPrompt = document.getElementById('assistant-prompt');
    const optionsContainer = document.getElementById('assistant-options-container');
    if (!assistantBox || !assistantPrompt || !optionsContainer) return;

    const assistant = getConversationalAssistant();
    if (!assistant || !appPlan) {
      assistantBox.style.display = 'none';
      return;
    }

    assistant.setPlan(appPlan);
    assistant.setProfile(currentInfoProfile);
    const questions = assistant.getPendingQuestions();

    if (!questions || questions.length === 0) {
      assistantBox.style.display = 'none';
      return;
    }

    const q = questions[0]; // Progressive questioning: 1 prompt at a time
    assistantBox.style.display = 'block';
    assistantPrompt.textContent = q.prompt;
    optionsContainer.innerHTML = '';

    const targetCid = q.canonicalId || q.fieldId;

    function renderDecisionPrompt(message, value, canonicalId, isReplacement) {
      assistantPrompt.textContent = message;
      optionsContainer.innerHTML = '';

      const decisionRow = document.createElement('div');
      decisionRow.style.cssText = 'display: flex; flex-direction: column; gap: 8px; width: 100%; margin-top: 4px;';

      const btnGroup = document.createElement('div');
      btnGroup.style.cssText = 'display: flex; gap: 8px; flex-wrap: wrap;';

      const saveBtn = document.createElement('button');
      saveBtn.type = 'button';
      saveBtn.id = 'btn-assistant-save-profile';
      saveBtn.className = 'btn btn-primary btn-sm';
      saveBtn.textContent = isReplacement ? 'Replace in My Information' : 'Save to My Information';
      saveBtn.style.cssText = 'padding: 6px 12px; background: #16a34a; color: white; border: none; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer;';
      saveBtn.addEventListener('click', async () => {
        if (currentInfoProfile) {
          currentInfoProfile.setField(canonicalId, value, 'USER_ENTERED', 'Conversational Assistant');
          const pm = getProfileManager();
          const sm = getStorageManager();
          if (pm && pm.initialized) {
            await pm.saveCurrentProfileData(currentInfoProfile.toJSON());
          } else if (sm) {
            await sm.saveInformationProfile(currentInfoProfile.toJSON());
          }
          populateInfoForm();
        }
        assistant.submitAnswer(q.fieldId, value, { persistToProfile: true, canonicalId, fieldDef: q });
        renderScanResults(scanData);
      });

      const useOnceBtn = document.createElement('button');
      useOnceBtn.type = 'button';
      useOnceBtn.id = 'btn-assistant-use-once';
      useOnceBtn.className = 'btn btn-secondary btn-sm';
      useOnceBtn.textContent = 'Use for this application only';
      useOnceBtn.style.cssText = 'padding: 6px 12px; background: white; color: #374151; border: 1px solid #d1d5db; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer;';
      useOnceBtn.addEventListener('click', () => {
        // Do NOT modify currentInfoProfile
        assistant.submitAnswer(q.fieldId, value, { persistToProfile: false, canonicalId, fieldDef: q });
        renderScanResults(scanData);
      });

      const retryBtn = document.createElement('button');
      retryBtn.type = 'button';
      retryBtn.textContent = 'Edit';
      retryBtn.style.cssText = 'padding: 6px 10px; background: transparent; color: #6b7280; border: none; font-size: 11px; cursor: pointer; text-decoration: underline;';
      retryBtn.addEventListener('click', () => {
        renderAssistantUI(appPlan, scanData);
      });

      btnGroup.appendChild(saveBtn);
      btnGroup.appendChild(useOnceBtn);
      btnGroup.appendChild(retryBtn);
      decisionRow.appendChild(btnGroup);
      optionsContainer.appendChild(decisionRow);
    }

    function handleValidAnswer(normalizedValue) {
      if (q.isMockSecurityChallenge) {
        assistantPrompt.textContent = '✓ Answer confirmed';
        optionsContainer.innerHTML = '';

        // Fill DOM field via chrome.tabs message
        const fillMsg = {
          action: 'FILL_MOCK_CHALLENGE',
          elementId: q.elementId || q.fieldId,
          selector: q.selector,
          value: normalizedValue
        };

        if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs && tabs[0] && tabs[0].id) {
              chrome.tabs.sendMessage(tabs[0].id, fillMsg, () => {});
            }
          });
        }

        // Direct in-page fill fallback (for test harness or shared window)
        try {
          const doc = (window.parent && window.parent.document !== document) ? window.parent.document : document;
          const targetEl = (q.elementId ? doc.getElementById(q.elementId) : null) || (q.selector ? doc.querySelector(q.selector) : null);
          if (targetEl) {
            try {
              const proto = Object.getPrototypeOf(targetEl);
              const desc = Object.getOwnPropertyDescriptor(proto, 'value') || Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
              if (desc && desc.set) {
                desc.set.call(targetEl, normalizedValue);
              } else {
                targetEl.value = normalizedValue;
              }
            } catch (e) {
              targetEl.value = normalizedValue;
            }
            targetEl.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
            targetEl.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
            try { targetEl.dispatchEvent(new Event('blur', { bubbles: true })); } catch (e) {}
          }
        } catch (e) {}

        if (typeof window !== 'undefined' && window.__efill_fill_mock_challenge) {
          window.__efill_fill_mock_challenge(q.elementId || q.fieldId, normalizedValue);
        }

        // Submit to assistant session (NEVER TO PROFILE)
        assistant.submitAnswer(q.fieldId, normalizedValue, { persistToProfile: false, canonicalId: 'mock_security_challenge', fieldDef: q });

        setTimeout(() => {
          renderScanResults(scanData);
        }, 1200);
        return;
      }

      if (q.isApplicationSpecific) {
        assistant.submitAnswer(q.fieldId, normalizedValue, { persistToProfile: false, canonicalId: targetCid, fieldDef: q });
        renderScanResults(scanData);
        return;
      }

      const existingVal = currentInfoProfile ? currentInfoProfile.getValue(targetCid) : null;
      if (existingVal && existingVal.trim() !== '') {
        if (existingVal.trim().toLowerCase() === normalizedValue.toLowerCase()) {
          assistant.submitAnswer(q.fieldId, normalizedValue, { persistToProfile: false, canonicalId: targetCid, fieldDef: q });
          renderScanResults(scanData);
          return;
        } else {
          renderDecisionPrompt(
            `${q.label || targetCid} received: "${normalizedValue}". Your profile already has "${existingVal}". Replace existing value in My Information?`,
            normalizedValue,
            targetCid,
            true
          );
          return;
        }
      }

      renderDecisionPrompt(
        `${q.label || targetCid} received: "${normalizedValue}".\nWould you like to save this to My Information?`,
        normalizedValue,
        targetCid,
        false
      );
    }

    if (q.options && q.options.length > 0) {
      q.options.slice(0, 8).forEach(opt => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn-assistant-choice';
        btn.style.cssText = 'padding: 6px 12px; background: white; border: 1px solid #86efac; border-radius: 16px; font-size: 12px; font-weight: 600; color: #15803d; cursor: pointer; transition: all 0.15s;';
        btn.textContent = opt;
        btn.addEventListener('click', () => {
          const valRes = assistant.validateAnswer(q.fieldId, opt, q);
          if (valRes.valid) {
            handleValidAnswer(valRes.normalizedValue);
          }
        });
        optionsContainer.appendChild(btn);
      });
    } else {
      const formWrap = document.createElement('div');
      formWrap.style.cssText = 'display: flex; flex-direction: column; width: 100%; gap: 6px;';

      const inputRow = document.createElement('div');
      inputRow.style.cssText = 'display: flex; gap: 8px; width: 100%;';

      const input = document.createElement('input');
      input.type = 'text';
      input.id = 'assistant-input-answer';
      input.placeholder = q.isMockSecurityChallenge ? 'Enter calculation result...' : `Enter ${q.label || 'value'}...`;
      input.style.cssText = 'padding: 6px 10px; border: 1px solid #86efac; border-radius: 6px; font-size: 12px; flex: 1;';

      const saveBtn = document.createElement('button');
      saveBtn.type = 'button';
      saveBtn.id = 'btn-assistant-save-choice';
      saveBtn.style.cssText = 'padding: 6px 12px; background: #16a34a; color: white; border: none; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer;';
      saveBtn.textContent = 'Save Choice';

      const errorMsg = document.createElement('div');
      errorMsg.id = 'assistant-error-msg';
      errorMsg.style.cssText = 'display: none; color: #dc2626; font-size: 12px; font-weight: 500; margin-top: 2px;';

      const doSubmit = () => {
        const raw = input.value.trim();
        const valRes = assistant.validateAnswer(q.fieldId, raw, q);
        if (!valRes.valid) {
          errorMsg.textContent = valRes.error || 'Invalid value.';
          errorMsg.style.display = 'block';
          input.focus();
          return;
        }
        errorMsg.style.display = 'none';
        handleValidAnswer(valRes.normalizedValue);
      };

      saveBtn.addEventListener('click', doSubmit);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          doSubmit();
        }
      });

      inputRow.appendChild(input);
      inputRow.appendChild(saveBtn);
      formWrap.appendChild(inputRow);
      formWrap.appendChild(errorMsg);
      optionsContainer.appendChild(formWrap);
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
   * showCommunicationErrorState — normal webpage where communication failed.
   */
  function showCommunicationErrorState(reason) {
    eligibilityDot.className = 'eligibility-dot';
    eligibilityLabel.className = 'eligibility-label';
    eligibilityLabel.textContent = 'Page communication notice';
    summaryBar.style.display = 'none';
    emptyStateEl.style.display = 'none';
    proposalsListEl.style.display = 'none';
    if (stackReady)    stackReady.innerHTML    = '';
    if (stackReview)   stackReview.innerHTML   = '';
    if (stackConflict) stackConflict.innerHTML = '';
    if (stackChoices)  stackChoices.innerHTML  = '';
    if (stackMissing)  stackMissing.innerHTML  = '';
    if (stackSecurity) stackSecurity.innerHTML = '';
    ineligibleStateEl.style.display = 'block';
    const titleEl = ineligibleStateEl.querySelector('h3');
    const descEl = ineligibleStateEl.querySelector('p');
    if (titleEl) titleEl.textContent = 'Page Communication Notice';
    if (descEl) descEl.textContent = 'Could not communicate with the page content script. Please reload the webpage and click Rescan.';
    if (ineligibleReasonEl) ineligibleReasonEl.textContent = reason || '';
    currentProposals = [];
    updateActionBar();
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
    if (stackChoices)  stackChoices.innerHTML  = '';
    if (stackMissing)  stackMissing.innerHTML  = '';
    if (stackSecurity) stackSecurity.innerHTML = '';
    ineligibleStateEl.style.display = 'block';
    const titleEl = ineligibleStateEl.querySelector('h3');
    const descEl = ineligibleStateEl.querySelector('p');
    if (titleEl) titleEl.textContent = 'E-Fill cannot operate here';
    if (descEl) descEl.textContent = 'This is a browser system page. E-Fill can analyze any regular webpage with forms.';
    if (ineligibleReasonEl) ineligibleReasonEl.textContent = reason || '';
    currentProposals = [];
    updateActionBar();
  }

  /**
   * showNoFormState — page is scannable but no meaningful form controls found.
   * Shown for: login-only pages, content pages, blank pages, or unsupported pages.
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
    const titleEl = emptyStateEl.querySelector('h3');
    const descEl = emptyStateEl.querySelector('p');
    if (profileName) {
      if (titleEl) titleEl.textContent = 'No Form Detected Yet';
      if (descEl) descEl.textContent = 'Open an application form page or click "Rescan" to detect and review fields.';
    } else {
      if (titleEl) titleEl.textContent = 'No Supported Application Detected';
      if (descEl) descEl.textContent = 'E-Fill is active. This webpage is not a recognized supported application portal or has no fillable form controls.';
    }
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
    eligibilityLabel.textContent = 'No supported application detected';
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

  // ── Proposal Card Builder & Direct Approval Autofill ────────────────────────

  async function autofillSingleProposal(proposal, card) {
    if (!proposal || !currentActiveTabId || typeof chrome === 'undefined' || !chrome.tabs) return;

    const badge = card?.querySelector('.status-badge');
    if (badge) {
      badge.textContent = 'Filling...';
      badge.className = 'status-badge badge-review';
    }

    try {
      await new Promise((resolve) => {
        chrome.tabs.sendMessage(
          currentActiveTabId,
          { action: 'AUTOFILL_APPROVED', approvedProposals: [proposal] },
          (res) => {
            if (chrome.runtime.lastError || !res || !res.report) {
              if (badge) {
                badge.textContent = '⚠️ Fill Error';
                badge.className = 'status-badge badge-conflict';
                badge.title = chrome.runtime.lastError?.message || 'Could not communicate with tab';
              }
              proposal.filled = false;
              resolve();
              return;
            }

            const report = res.report;
            const itemResult = report.results?.[0];
            if (itemResult && itemResult.success && itemResult.verified) {
              proposal.filled = true;
              proposal.status = 'READY';
              if (badge) {
                badge.textContent = '✓ Filled';
                badge.className = 'status-badge badge-ready';
                badge.title = 'Value verified in webpage DOM';
              }
              if (card) {
                card.className = 'proposal-card ready filled';
              }
            } else {
              proposal.filled = false;
              if (badge) {
                badge.textContent = '⚠️ Fill Failed';
                badge.className = 'status-badge badge-conflict';
                badge.title = itemResult?.error || 'Verification failed: value not accepted by page';
              }
            }
            resolve();
          }
        );
      });
    } catch (err) {
      console.warn('[E-Fill] Autofill dispatch error:', err);
      if (badge) {
        badge.textContent = '⚠️ Fill Error';
        badge.className = 'status-badge badge-conflict';
      }
    }
    updateActionBar();
  }

  function createProposalCard(proposal, index) {
    const card = document.createElement('div');

    // ── 1. SECURITY CREDENTIAL CARD (PASSWORD / CONFIRM PASSWORD) ───────────
    if (proposal.isSecurityCredential || proposal.type === 'SECURITY_CREDENTIAL' || proposal.securityType === 'SECURITY_CREDENTIAL') {
      card.className = 'proposal-card security';
      card.setAttribute('data-card-field-id', proposal.fieldId || '');
      card.innerHTML = `
        <div class="card-top">
          <label class="field-checkbox-label">
            <span>🔐 ${escapeHtml(proposal.label || 'Password')}</span>
          </label>
          <span class="status-badge badge-security">USER ACTION</span>
        </div>
        <div class="field-value-box">
          <div class="security-instruction">
            <span>🛡️</span>
            <span>Enter directly on the application</span>
          </div>
        </div>
        <div class="card-bottom">
          <span class="source-tag">🔐 Kept private</span>
          <span class="reason-tooltip" title="Security credentials are never stored or autofilled">Security Credential</span>
        </div>
      `;
      return card;
    }

    // ── 2. REAL WEBSITE SECURITY / CAPTCHA CARD ────────────────────────────
    if (proposal.isRealSecurityChallenge || proposal.type === 'SECURITY_CHALLENGE' || proposal.securityChallengeType === 'SECURITY_CHALLENGE' || proposal.securityChallengeType === 'REAL_SECURITY_CHALLENGE') {
      card.className = 'proposal-card security';
      card.setAttribute('data-card-field-id', proposal.fieldId || '');
      card.innerHTML = `
        <div class="card-top">
          <label class="field-checkbox-label">
            <span>🔐 Website Security: CAPTCHA detected</span>
          </label>
          <span class="status-badge badge-security">USER ACTION</span>
        </div>
        <div class="field-value-box">
          <div class="security-instruction">
            <span>🧩</span>
            <span>Complete the CAPTCHA directly on the application page.</span>
          </div>
        </div>
        <div class="card-bottom">
          <span class="source-tag">🛡️ Human Verification</span>
          <span class="reason-tooltip" title="Security challenge requires direct user completion">Website Security</span>
        </div>
      `;
      return card;
    }

    // ── 3. APPLICATION CHOICE CARD (RADIO GROUPS / DROPDOWN CHOICES) ───────
    if (proposal.status === 'APPLICATION_CHOICE' || (proposal.isApplicationChoice && !proposal.proposedValue)) {
      card.className = 'proposal-card choice';
      card.setAttribute('data-card-field-id', proposal.fieldId || '');
      const opts = proposal.options || proposal.alternatives || [];
      const optsHtml = opts.map(opt => {
        const val = typeof opt === 'object' ? (opt.value || opt.text) : opt;
        const txt = typeof opt === 'object' ? (opt.text || opt.value) : opt;
        const isSel = proposal.proposedValue === val;
        return `
          <button type="button" class="btn-alt-choice ${isSel ? 'selected' : ''}"
            style="font-size: 11.5px; padding: 4px 10px; border: 1px solid ${isSel ? '#0284c7' : '#cbd5e1'}; background: ${isSel ? '#e0f2fe' : '#f8fafc'}; color: ${isSel ? '#0369a1' : '#1e293b'}; border-radius: 14px; cursor: pointer; font-weight: 500;"
            data-opt-val="${escapeHtml(val)}">
            ${isSel ? '✓ ' : '○ '}${escapeHtml(txt)}
          </button>
        `;
      }).join('');

      card.innerHTML = `
        <div class="card-top">
          <label class="field-checkbox-label">
            <span>🔘 ${escapeHtml(proposal.label || 'Application Choice')}</span>
          </label>
          <span class="status-badge badge-choice">CHOICE</span>
        </div>
        <div class="field-value-box">
          <span style="font-size: 11px; color: #64748b; margin-bottom: 2px;">Select an option for this application:</span>
          <div class="choice-options-row" style="display: flex; gap: 6px; flex-wrap: wrap; align-items: center;">
            ${optsHtml || '<span style="font-size: 11px; color: #94a3b8;">No predefined choices</span>'}
          </div>
        </div>
        <div class="card-bottom">
          <span class="source-tag">🔘 Application Choices</span>
          <span class="reason-tooltip" title="${escapeHtml(proposal.reason || 'Select an option')}">${escapeHtml(proposal.reason || 'Select an option')}</span>
        </div>
      `;

      card.querySelectorAll('.btn-alt-choice').forEach(btn => {
        btn.addEventListener('click', async () => {
          const chosenVal = btn.getAttribute('data-opt-val');
          proposal.proposedValue = chosenVal;
          proposal.approved = true;
          await autofillSingleProposal(proposal, card);
        });
      });
      return card;
    }

    const st = proposal.status;

    // Card border class
    let cardClass = 'proposal-card';
    if (proposal.filled)                                   cardClass += ' ready filled';
    else if (st === 'READY')                               cardClass += ' ready';
    else if (st === 'REVIEW_REQUIRED' || st === 'AMBIGUOUS') cardClass += ' review';
    else if (st === 'CONFLICT')                            cardClass += ' conflict';
    else                                                   cardClass += ' unavailable';

    card.className = cardClass;
    card.setAttribute('data-card-field-id', proposal.fieldId || '');

    // Badge
    const badges = {
      READY:            ['READY', 'badge-ready'],
      REVIEW_REQUIRED:  ['REVIEW', 'badge-review'],
      AMBIGUOUS:        ['AMBIGUOUS', 'badge-ambiguous'],
      CONFLICT:         ['CONFLICT', 'badge-conflict'],
      UNAVAILABLE:      ['MISSING', 'badge-unavailable'],
      UNIDENTIFIED:     ['UNIDENTIFIED', 'badge-unavailable'],
      UNKNOWN:          ['UNKNOWN', 'badge-unavailable']
    };
    const [badgeText, badgeClass] = proposal.filled
      ? ['✓ Filled', 'badge-ready']
      : (badges[st] || ['—', 'badge-unavailable']);

    const isConflict = (st === 'CONFLICT');
    const isMissing = (st === 'UNAVAILABLE' || st === 'UNIDENTIFIED' || st === 'UNKNOWN');
    const hasValue = proposal.proposedValue !== undefined && proposal.proposedValue !== null && String(proposal.proposedValue).trim() !== '';
    const isCheckboxDisabled = isConflict || (!hasValue && isMissing);

    // Provenance tag
    const provLabel = proposal.provenanceLabel
      ? `<div class="provenance-tag">${escapeHtml(proposal.provenanceLabel)}</div>`
      : '';

    // Source tag
    const sourceStr = proposal.source ? escapeHtml(proposal.source) : '—';

    // Alternatives box if present
    const altsHtml = (proposal.alternatives && proposal.alternatives.length > 0)
      ? `<div class="alternatives-box" style="margin-top: 6px; display: flex; gap: 6px; flex-wrap: wrap; align-items: center;">
          <span style="font-size: 11px; color: #64748b;">Options:</span>
          ${proposal.alternatives.map(alt => `
            <button type="button" class="btn-alt-choice" style="font-size: 11px; padding: 2px 8px; border: 1px solid #cbd5e1; background: #f8fafc; border-radius: 4px; cursor: pointer; color: #1e293b;" data-alt-val="${escapeHtml(alt.value)}">
              ${escapeHtml(alt.label)}: "${escapeHtml(alt.value)}"
            </button>
          `).join('')}
        </div>`
      : '';

    card.innerHTML = `
      <div class="card-top">
        <label class="field-checkbox-label">
          <input type="checkbox" class="prop-checkbox" ${proposal.approved ? 'checked' : ''} ${isCheckboxDisabled ? 'disabled' : ''}>
          <span>${escapeHtml(proposal.label || proposal.canonicalId || 'Field')}</span>
        </label>
        <span class="status-badge ${badgeClass}" id="badge-${index}">${badgeText}</span>
      </div>
      ${isConflict ? buildConflictOptions(proposal, index) : `
      <div class="field-value-box">
        <input type="text" class="value-input"
          value="${escapeHtml(proposal.proposedValue || '')}"
          placeholder="${isMissing ? 'Not available in profile' : 'Value'}">
        ${provLabel}
        ${altsHtml}
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
      checkbox.addEventListener('change', async (e) => {
        proposal.approved = e.target.checked;
        updateActionBar();

        if (proposal.approved) {
          const valStr = proposal.proposedValue !== undefined && proposal.proposedValue !== null ? String(proposal.proposedValue).trim() : '';
          if (valStr !== '') {
            await autofillSingleProposal(proposal, card);
          }
        } else {
          proposal.filled = false;
          const badge = card.querySelector('.status-badge');
          if (badge) {
            badge.textContent = badgeText;
            badge.className = `status-badge ${badgeClass}`;
          }
          card.classList.remove('filled');
        }
      });
    }

    const input = card.querySelector('.value-input');
    if (input) {
      input.addEventListener('input', (e) => {
        proposal.proposedValue = e.target.value;
        proposal.userEdited = true;
        const valTrimmed = String(e.target.value).trim();
        if (checkbox) {
          if (valTrimmed) {
            checkbox.disabled = false;
          } else {
            checkbox.checked = false;
            proposal.approved = false;
            if (isMissing) checkbox.disabled = true;
          }
        }
        updateActionBar();
      });

      input.addEventListener('change', async (e) => {
        proposal.proposedValue = e.target.value;
        proposal.userEdited = true;
        if (proposal.approved && String(proposal.proposedValue).trim()) {
          await autofillSingleProposal(proposal, card);
        }
      });
    }

    // Alternative choices buttons
    card.querySelectorAll('.btn-alt-choice').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const altVal = btn.getAttribute('data-alt-val');
        if (altVal && input) {
          input.value = altVal;
          proposal.proposedValue = altVal;
          proposal.userEdited = true;
          if (checkbox) checkbox.disabled = false;
          updateActionBar();
          if (proposal.approved) {
            await autofillSingleProposal(proposal, card);
          }
        }
      });
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

  // Expose controller methods for verification and customer QA
  if (typeof window !== 'undefined') {
    window.__efill_sidepanel = {
      getInfoProfile: () => currentInfoProfile,
      setInfoProfile: (p) => { currentInfoProfile = p; },
      populateInfoForm,
      handleProfileDocumentSelected,
      showDocumentProcessedModal,
      saveApprovedDocumentData,
      renderScanResults,
      renderAssistantUI: () => {
        const ap = getApplicationPlan();
        if (ap && lastScanData) {
          renderAssistantUI(ap, lastScanData);
        }
      },
      getCurrentProposals: () => currentProposals,
      getConversationalAssistant,
      getApplicationPlan
    };
  }

})();
