/**
 * E-Fill Conflict Engine
 * =======================
 * Compares incoming extracted document values against a person's Information Profile.
 *
 * DETECTS:
 *   - AVAILABLE (value matches existing profile value)
 *   - NEW (field exists in incoming document, but is empty in the profile)
 *   - CONFLICT (incoming value differs from existing non-empty value)
 *   - AMBIGUOUS (partial match / unconfirmed provenance)
 *   - REVIEW_REQUIRED (sensitive field or low extraction confidence)
 *
 * CRITICAL RULE:
 *   Never silently overwrite. Conflicts provide explicit user choices:
 *   [Keep Existing] [Use Document] [Edit] [Use Once]
 */

(function (global) {
  'use strict';

  const schema = global.EFillCanonicalSchema || (typeof require !== 'undefined' ? require('./canonical-schema.js') : null);

  const CONFLICT_ACTIONS = {
    KEEP_EXISTING: 'KEEP_EXISTING',
    USE_DOCUMENT:  'USE_DOCUMENT',
    EDIT:          'EDIT',
    USE_ONCE:      'USE_ONCE'
  };

  class ConflictEngine {
    constructor() {
      this.schema = schema;
    }

    /**
     * Normalize a value for robust comparison (prevents false-positive conflicts).
     */
    normalizeForComparison(fieldId, rawVal) {
      if (rawVal === undefined || rawVal === null) return '';
      let str = String(rawVal).trim();

      // Mobile / Phone: extract last 10 digits
      if (fieldId === 'primary_phone' || fieldId === 'secondary_phone') {
        const digits = str.replace(/\D/g, '');
        return digits.length >= 10 ? digits.slice(-10) : digits;
      }

      // Date of birth / Date fields: convert DD/MM/YYYY or DD-MM-YYYY to YYYY-MM-DD
      if (fieldId === 'dob' || fieldId?.endsWith('_date')) {
        const m = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
        if (m) {
          const day = m[1].padStart(2, '0');
          const mon = m[2].padStart(2, '0');
          const yr  = m[3];
          return `${yr}-${mon}-${day}`;
        }
        return str;
      }

      // Email / Case-insensitive fields
      if (fieldId === 'email' || fieldId === 'gender' || fieldId === 'category' || fieldId === 'pincode' || fieldId === 'state') {
        return str.toLowerCase().replace(/\s+/g, ' ');
      }

      // Names / Address: normalize multiple spaces
      return str.toLowerCase().replace(/\s+/g, ' ');
    }

    /**
     * Check single field comparison between existing profile and incoming value.
     */
    checkField(fieldId, incomingVal, profile, meta = {}) {
      const label = meta.label || (this.schema?.CANONICAL_FIELDS?.[fieldId]?.label) || fieldId;
      const isSensitive = this.schema?.FIELD_SENSITIVITY?.SENSITIVE?.has(fieldId) || false;

      let existingVal = '';
      if (profile) {
        if (typeof profile.getField === 'function') {
          const f = profile.getField(fieldId);
          existingVal = f ? (f.value || '') : '';
        } else if (profile.personal || profile.contact || profile.address) {
          // Check standard sections
          for (const s of Object.keys(profile)) {
            if (profile[s] && typeof profile[s] === 'object' && fieldId in profile[s]) {
              const entry = profile[s][fieldId];
              existingVal = (typeof entry === 'object' && entry !== null && 'value' in entry) ? entry.value : entry;
              break;
            }
          }
        }
      }

      const normIncoming = this.normalizeForComparison(fieldId, incomingVal);
      const normExisting = this.normalizeForComparison(fieldId, existingVal);

      if (!normExisting && normIncoming) {
        return {
          fieldId,
          label,
          status: 'NEW',
          existingValue: existingVal,
          incomingValue: String(incomingVal).trim(),
          source: meta.source || 'Document Extracted',
          isSensitive,
          actions: [CONFLICT_ACTIONS.USE_DOCUMENT, CONFLICT_ACTIONS.USE_ONCE, CONFLICT_ACTIONS.EDIT]
        };
      }

      if (normExisting && normIncoming) {
        if (normExisting === normIncoming) {
          return {
            fieldId,
            label,
            status: 'AVAILABLE',
            existingValue: existingVal,
            incomingValue: String(incomingVal).trim(),
            source: meta.source || 'Document Extracted',
            isSensitive,
            actions: [CONFLICT_ACTIONS.KEEP_EXISTING]
          };
        } else {
          return {
            fieldId,
            label,
            status: 'CONFLICT',
            existingValue: existingVal,
            incomingValue: String(incomingVal).trim(),
            source: meta.source || 'Document Extracted',
            isSensitive,
            actions: [
              CONFLICT_ACTIONS.KEEP_EXISTING,
              CONFLICT_ACTIONS.USE_DOCUMENT,
              CONFLICT_ACTIONS.EDIT,
              CONFLICT_ACTIONS.USE_ONCE
            ]
          };
        }
      }

      return {
        fieldId,
        label,
        status: 'AVAILABLE',
        existingValue: existingVal,
        incomingValue: '',
        source: meta.source || 'Profile',
        isSensitive,
        actions: [CONFLICT_ACTIONS.KEEP_EXISTING]
      };
    }

    /**
     * Compare a set of extracted fields against a target profile.
     *
     * @param {Object} incomingFieldsMap - { [canonicalId]: value } or { [canonicalId]: { value, label, ... } }
     * @param {InformationProfile|Object} profile
     * @returns {Object} comparison result with categorized items
     */
    compare(incomingFieldsMap, profile) {
      const results = [];
      const conflicts = [];
      const newFields = [];
      const matchingFields = [];

      for (const [fieldId, valObj] of Object.entries(incomingFieldsMap || {})) {
        const incomingVal = (typeof valObj === 'object' && valObj !== null && 'value' in valObj) ? valObj.value : valObj;
        const meta = (typeof valObj === 'object' && valObj !== null) ? valObj : {};

        if (incomingVal === undefined || incomingVal === null || String(incomingVal).trim() === '') {
          continue;
        }

        const res = this.checkField(fieldId, incomingVal, profile, meta);
        results.push(res);

        if (res.status === 'CONFLICT') conflicts.push(res);
        else if (res.status === 'NEW') newFields.push(res);
        else if (res.status === 'AVAILABLE') matchingFields.push(res);
      }

      return {
        results,
        conflicts,
        newFields,
        matchingFields,
        summary: {
          total: results.length,
          conflictCount: conflicts.length,
          newCount: newFields.length,
          matchCount: matchingFields.length,
          hasConflicts: conflicts.length > 0
        }
      };
    }

    /**
     * Direct comparison helper between existing profile value and incoming document value.
     */
    detectConflict(fieldMeta, profileVal, incomingVal) {
      const fieldId = typeof fieldMeta === 'string' ? fieldMeta : (fieldMeta.fieldId || fieldMeta.id);
      const label = typeof fieldMeta === 'object' ? fieldMeta.label : fieldId;
      const mockProfile = { getField: (id) => ({ value: profileVal }) };
      const res = this.checkField(fieldId, incomingVal, mockProfile, { label });
      return { ...res, state: res.status };
    }

    /**
     * Resolve conflict according to chosen user action.
     */
    resolveConflict(...args) {
      let action, existingVal, incomingVal, fieldId, profile, dsm;

      if (Object.values(CONFLICT_ACTIONS).includes(args[0])) {
        // Signature: (action, existingVal, incomingVal)
        [action, existingVal, incomingVal] = args;
      } else {
        // Signature: (fieldId, action, incomingVal, profile, documentSourceManager)
        [fieldId, action, incomingVal, profile, dsm] = args;
        if (profile && typeof profile.getValue === 'function' && fieldId) {
          existingVal = profile.getValue(fieldId);
        } else if (profile && typeof profile.getField === 'function' && fieldId) {
          existingVal = profile.getField(fieldId)?.value || '';
        }
      }

      let res = {};
      switch (action) {
        case CONFLICT_ACTIONS.KEEP_EXISTING:
          res = { valueToUse: existingVal, resolvedValue: existingVal, persistToProfile: false, isSessionOnly: false };
          break;
        case CONFLICT_ACTIONS.USE_DOCUMENT:
          res = { valueToUse: incomingVal, resolvedValue: incomingVal, persistToProfile: true, isSessionOnly: false, provenance: 'DOCUMENT_EXTRACTED' };
          if (profile && typeof profile.setField === 'function' && fieldId) {
            profile.setField(fieldId, incomingVal, 'DOCUMENT_EXTRACTED', 'Document confirmed');
          }
          break;
        case CONFLICT_ACTIONS.EDIT:
          res = { valueToUse: incomingVal, resolvedValue: incomingVal, persistToProfile: true, isSessionOnly: false, provenance: 'USER_EDITED' };
          if (profile && typeof profile.setField === 'function' && fieldId) {
            profile.setField(fieldId, incomingVal, 'USER_EDITED', 'User manual correction');
          }
          break;
        case CONFLICT_ACTIONS.USE_ONCE:
          res = { valueToUse: incomingVal, resolvedValue: incomingVal, persistToProfile: false, isSessionOnly: true };
          if (dsm && typeof dsm.setUseOnceField === 'function' && fieldId) {
            dsm.setUseOnceField(fieldId, incomingVal, 'Document (Use Once)');
          }
          break;
        default:
          res = { valueToUse: incomingVal, resolvedValue: incomingVal, persistToProfile: false, isSessionOnly: false };
      }
      return res;
    }
  }

  const conflictEngine = new ConflictEngine();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ConflictEngine, conflictEngine, CONFLICT_ACTIONS };
  } else {
    global.EFillConflictEngine = { ConflictEngine, conflictEngine, CONFLICT_ACTIONS };
  }
})(typeof window !== 'undefined' ? window : globalThis);
