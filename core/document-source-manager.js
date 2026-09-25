/**
 * E-Fill Document Source Manager
 * ==============================
 * Manages the temporary document processing lifecycle and session-scoped data.
 *
 * CRITICAL PRIVACY & ARCHITECTURE INVARIANTS:
 *   - Documents are TEMPORARY sources. Original file bytes are NOT persisted.
 *   - "USE ONCE" data lives ONLY in memory for the active application session.
 *   - After the application session ends, temporary information is discarded.
 *   - Structured information is ONLY saved to a persistent profile on explicit user approval.
 */

(function (global) {
  'use strict';

  class DocumentSourceManager {
    constructor() {
      // In-memory session store (never written to disk/storage)
      this.activeSessionDocs = new Map(); // id -> { id, name, type, extractedFields, timestamp }
      this.sessionOverrides = {};         // { [canonicalId]: { value, source, provenance } }
      this.currentDocId = 0;
    }

    /**
     * Register a temporarily processed document.
     * Original binary is held only during active processing and discarded.
     */
    addTemporaryDocument(filename, docType, extractedFields) {
      const docId = `temp_doc_${++this.currentDocId}_${Date.now()}`;
      const record = {
        id: docId,
        filename: filename || 'Uploaded Document',
        docType: docType || 'OTHER',
        extractedFields: extractedFields || {},
        timestamp: new Date().toISOString()
      };
      this.activeSessionDocs.set(docId, record);
      return record;
    }

    /**
     * Get all currently active temporary document extractions for this session.
     */
    getActiveDocuments() {
      return Array.from(this.activeSessionDocs.values());
    }

    /**
     * Set a session-only "USE ONCE" field value.
     * This value will be available to the current application autofill proposals
     * but will NEVER be saved to any persistent person profile.
     */
    setUseOnceField(canonicalId, value, source) {
      if (!canonicalId || value === undefined) return;
      this.sessionOverrides[canonicalId] = {
        value: String(value).trim(),
        source: source || 'Temporary Document (Use Once)',
        provenance: 'APPLICATION_SPECIFIC',
        isUseOnce: true
      };
    }

    /**
     * Set multiple "USE ONCE" fields at once.
     */
    setUseOnceFields(fieldsMap, source) {
      for (const [cid, valObj] of Object.entries(fieldsMap || {})) {
        const val = typeof valObj === 'object' && valObj !== null ? valObj.value : valObj;
        this.setUseOnceField(cid, val, source);
      }
    }

    /**
     * Get all active session overrides (USE ONCE data).
     */
    getSessionOverrides() {
      return { ...this.sessionOverrides };
    }

    /**
     * Clear all temporary session data (called on application completion or profile switch).
     */
    clearSession() {
      this.activeSessionDocs.clear();
      this.sessionOverrides = {};
    }

    /**
     * Save user-approved extracted data to an existing or new profile via ProfileManager.
     *
     * @param {Object} profileManager - instance of ProfileManager
     * @param {string} targetProfileId - profile to merge data into (or null if creating new)
     * @param {string} [newProfileName] - if creating a new profile
     * @param {Object} approvedFields - { [canonicalId]: value }
     */
    async saveApprovedDataToProfile(profileManager, targetProfileId, newProfileName, approvedFields) {
      if (!profileManager) throw new Error('ProfileManager is required');

      let targetId = targetProfileId;

      if (!targetId && newProfileName) {
        // Create new profile
        const created = await profileManager.createProfile(newProfileName, 'Other', null, false);
        targetId = created.id;
      }

      if (!targetId) throw new Error('No target profile specified for saving extracted data');

      const targetProfileEntry = profileManager.getProfile(targetId);
      if (!targetProfileEntry || !targetProfileEntry.profile) {
        throw new Error(`Target profile "${targetId}" not found`);
      }

      const ip = targetProfileEntry.profile;
      const PROV = 'USER_CONFIRMED';
      const SRC = 'Saved from Document';

      for (const [cid, val] of Object.entries(approvedFields || {})) {
        const strVal = typeof val === 'object' && val !== null ? val.value : String(val);
        if (strVal && strVal.trim()) {
          ip.setField(cid, strVal.trim(), PROV, SRC);
        }
      }

      await profileManager.updateProfile(targetId, { profileData: ip.toJSON() });
      return targetId;
    }
  }

  const documentSourceManager = new DocumentSourceManager();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { DocumentSourceManager, documentSourceManager };
  } else {
    global.EFillDocumentSourceManager = { DocumentSourceManager, documentSourceManager };
  }
})(typeof window !== 'undefined' ? window : globalThis);
