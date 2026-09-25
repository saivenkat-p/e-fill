/**
 * E-Fill Source Selector & Proposal Generator
 * ============================================
 * Matches normalized form fields to user profile and document sources,
 * calls the AvailabilityEngine for status determination, applies format
 * transformations, and assembles fill proposals for the Side Panel.
 *
 * Works with both:
 *   - v2 InformationProfile (structured with provenance)
 *   - v1 legacy flat profile (backward-compat for tests)
 */

(function (global) {
  'use strict';

  const STATUS = {
    READY:            'READY',             // Available, high confidence, auto-approved
    REVIEW_REQUIRED:  'REVIEW_REQUIRED',   // Exists but needs user verification
    CONFLICT:         'CONFLICT',          // Multiple sources with different values
    UNAVAILABLE:      'UNAVAILABLE',       // No value in profile (MISSING)
    AMBIGUOUS:        'AMBIGUOUS',         // Value exists, source unclear
    UNIDENTIFIED:     'UNIDENTIFIED'       // Field not mapped to canonical schema
  };

  // Map AvailabilityEngine states to proposal STATUS
  const AVAILABILITY_TO_STATUS = {
    AVAILABLE:       STATUS.READY,
    MISSING:         STATUS.UNAVAILABLE,
    CONFLICT:        STATUS.CONFLICT,
    AMBIGUOUS:       STATUS.AMBIGUOUS,
    REVIEW_REQUIRED: STATUS.REVIEW_REQUIRED
  };

  class SourceSelector {
    constructor(fieldDefinitions) {
      this.fieldDefinitions = fieldDefinitions || {};
    }

    /**
     * Generate fill proposals for all detected fields.
     *
     * @param {Array}  detectedFields  — from FormDetector + Normalizer
     * @param {Object} profile         — v2 InformationProfile data or legacy flat
     * @param {Object} [extraSources]  — additional document-extracted values
     * @returns {Array} proposals
     */
    generateProposals(detectedFields, profile, extraSources) {
      if (!Array.isArray(detectedFields) || !profile) return [];

      // Get AvailabilityEngine if available
      const engine = global.EFillAvailabilityEngine
        ? global.EFillAvailabilityEngine.availabilityEngine
        : (typeof require !== 'undefined'
          ? (() => { try { return require('./availability-engine.js').availabilityEngine; } catch(e) { return null; } })()
          : null);

      return detectedFields.map(field =>
        this.createProposalForField(field, profile, extraSources, engine)
      );
    }

    createProposalForField(field, profile, extraSources, engine) {
      const canonicalId = field.canonicalId;
      const confidence = field.confidence !== undefined ? field.confidence : (canonicalId ? 0.9 : 0);
      const { reason = '', elementId, label, options, type, selector, name, tagName } = field;

      // ── UNIDENTIFIED ───────────────────────────────────────────────────────
      if (!canonicalId) {
        return {
          fieldId:         elementId,
          selector:        selector || '',
          name:            name || '',
          tagName:         tagName || '',
          label:           label || 'Unlabeled field',
          type:            type || 'text',
          canonicalId:     null,
          proposedValue:   '',
          source:          'None',
          provenance:      null,
          provenanceLabel: null,
          status:          STATUS.UNIDENTIFIED,
          confidence:      0,
          reason:          'Field could not be reliably mapped to a canonical profile attribute',
          approved:        false,
          userEdited:      false,
          conflicts:       []
        };
      }

      // ── USE AVAILABILITY ENGINE (if available) ─────────────────────────────
      if (engine) {
        const avail = engine.check(canonicalId, profile, extraSources);
        const status = AVAILABILITY_TO_STATUS[avail.status] || STATUS.UNAVAILABLE;

        // If unavailable, no value to transform
        if (status === STATUS.UNAVAILABLE) {
          const rawMap = global.EFillDocumentFieldMap || (typeof require !== 'undefined' ? (() => { try { return require('./document-field-map.js'); } catch(e) { return null; } })() : null);
          const fieldMap = rawMap?.documentFieldMap || rawMap;
          const recDoc = (fieldMap && typeof fieldMap.getRecommendedDocument === 'function' && canonicalId)
            ? fieldMap.getRecommendedDocument(canonicalId)
            : null;
          const allPossibleDocs = (fieldMap && typeof fieldMap.getAllPossibleSources === 'function' && canonicalId)
            ? fieldMap.getAllPossibleSources(canonicalId)
            : (recDoc?.allPossibleSources || (recDoc ? [recDoc] : []));

          return {
            fieldId:         elementId,
            selector:        selector || '',
            name:            name || '',
            tagName:         tagName || '',
            label:           label || canonicalId,
            type:            type || 'text',
            canonicalId,
            proposedValue:   '',
            source:          'Information Profile',
            provenance:      null,
            provenanceLabel: null,
            status,
            confidence,
            reason:          `No saved information for "${canonicalId}"`,
            approved:        false,
            userEdited:      false,
            conflicts:       [],
            recommendedDoc:  recDoc,
            allPossibleDocs: allPossibleDocs
          };
        }

        // For CONFLICT — return with conflict list, no proposed value
        if (status === STATUS.CONFLICT) {
          return {
            fieldId:         elementId,
            selector:        selector || '',
            name:            name || '',
            tagName:         tagName || '',
            label:           label || canonicalId,
            type:            type || 'text',
            canonicalId,
            proposedValue:   '',
            source:          'Multiple sources',
            provenance:      null,
            provenanceLabel: null,
            status,
            confidence,
            reason:          avail.notes || 'Conflicting values detected — please choose',
            approved:        false,
            userEdited:      false,
            conflicts:       avail.conflicts
          };
        }

        // For AVAILABLE, REVIEW_REQUIRED, AMBIGUOUS — transform value
        const transformed = this.transformValue(avail.value, field);
        const finalStatus = this._adjustStatusByConfidence(status, confidence);

        return {
          fieldId:              elementId,
          selector:             selector || '',
          name:                 name || '',
          tagName:              tagName || '',
          label:                label || canonicalId,
          type:                 type || 'text',
          canonicalId,
          proposedValue:        transformed.value,
          originalProfileValue: avail.value,
          source:               avail.source || 'Information Profile',
          provenance:           avail.provenance,
          provenanceLabel:      this._provenanceLabel(avail.provenance),
          status:               finalStatus,
          confidence,
          reason:               this._buildReason(finalStatus, reason, avail.notes, transformed),
          approved:             finalStatus === STATUS.READY,
          userEdited:           false,
          conflicts:            []
        };
      }

      // ── FALLBACK: no engine, use legacy extraction ─────────────────────────
      const rawMap = global.EFillDocumentFieldMap || (typeof require !== 'undefined' ? (() => { try { return require('./document-field-map.js'); } catch(e) { return null; } })() : null);
      const fieldMap = rawMap?.documentFieldMap || rawMap;
      const recDoc = (fieldMap && typeof fieldMap.getRecommendedDocument === 'function' && canonicalId)
        ? fieldMap.getRecommendedDocument(canonicalId)
        : null;

      const extraction = this._extractFromLegacy(canonicalId, profile);
      if (!extraction || !extraction.value) {
        return {
          fieldId:         elementId,
          selector:        selector || '',
          name:            name || '',
          tagName:         tagName || '',
          label:           label || canonicalId,
          type:            type || 'text',
          canonicalId,
          proposedValue:   '',
          source:          'User Profile',
          provenance:      null,
          provenanceLabel: null,
          status:          STATUS.UNAVAILABLE,
          confidence,
          reason:          `No saved value in profile for "${canonicalId}"`,
          approved:        false,
          userEdited:      false,
          conflicts:       [],
          recommendedDoc:  recDoc,
          allPossibleDocs: (fieldMap && typeof fieldMap.getAllPossibleSources === 'function' && canonicalId)
            ? fieldMap.getAllPossibleSources(canonicalId)
            : (recDoc ? [recDoc] : [])
        };
      }

      const transformed = this.transformValue(extraction.value, field);
      let status = confidence < 0.85 ? STATUS.REVIEW_REQUIRED : STATUS.READY;

      return {
        fieldId:              elementId,
        selector:             selector || '',
        name:                 name || '',
        tagName:              tagName || '',
        label:                label || canonicalId,
        type:                 type || 'text',
        canonicalId,
        proposedValue:        transformed.value,
        originalProfileValue: extraction.value,
        source:               extraction.source,
        provenance:           'USER_ENTERED',
        provenanceLabel:      'User entered',
        status,
        confidence,
        reason:               this._buildReason(status, reason, '', transformed),
        approved:             status === STATUS.READY,
        userEdited:           false,
        conflicts:            []
      };
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    _adjustStatusByConfidence(status, confidence) {
      // If normalizer confidence is low, escalate to REVIEW_REQUIRED
      if (status === STATUS.READY && confidence < 0.85) return STATUS.REVIEW_REQUIRED;
      return status;
    }

    _provenanceLabel(provenance) {
      const labels = {
        USER_ENTERED:        '✏️ User entered',
        USER_CONFIRMED:      '✓ Confirmed',
        USER_EDITED:         '✏️ User edited',
        DOCUMENT_EXTRACTED:  '📄 From document',
        IMPORTED:            '↓ Imported',
        APPLICATION_SPECIFIC: '🔧 App-specific'
      };
      return provenance ? (labels[provenance] || provenance) : null;
    }

    _buildReason(status, normReason, availNotes, transformed) {
      const parts = [];
      if (normReason) parts.push(normReason);
      if (availNotes) parts.push(availNotes);
      if (transformed && transformed.transformed) parts.push(`Transformed: ${transformed.transformNote}`);
      return parts.join(' · ') || `Status: ${status}`;
    }

    /**
     * Legacy flat profile extraction (used when AvailabilityEngine is not available).
     */
    _extractFromLegacy(canonicalId, profile) {
      if (!profile) return null;
      const p = profile.personal || {};
      const c = profile.contact || {};
      const f = profile.family || {};
      const a = profile.address || {};

      const map = {
        full_name:    { value: p.fullName || `${p.firstName || ''} ${p.lastName || ''}`.trim(), source: 'Profile: Personal (Full Name)' },
        first_name:   { value: p.firstName,  source: 'Profile: Personal (First Name)' },
        middle_name:  { value: p.middleName, source: 'Profile: Personal (Middle Name)' },
        last_name:    { value: p.lastName,   source: 'Profile: Personal (Last Name)' },
        dob:          { value: p.dob,        source: 'Profile: Personal (Date of Birth)' },
        gender:       { value: p.gender,     source: 'Profile: Personal (Gender)' },
        primary_phone: { value: c.primaryPhone, source: 'Profile: Contact (Mobile)' },
        email:        { value: c.email,         source: 'Profile: Contact (Email)' },
        father_name:  { value: f.fatherName,    source: 'Profile: Family (Father)' },
        mother_name:  { value: f.motherName,    source: 'Profile: Family (Mother)' },
        guardian_name: { value: f.guardianName, source: 'Profile: Family (Guardian)' },
        address_line: { value: a.addressLine || `${a.houseNumber || ''}, ${a.street || ''}`.trim(), source: 'Profile: Address' },
        house_number: { value: a.houseNumber,   source: 'Profile: Address' },
        street:       { value: a.street,        source: 'Profile: Address' },
        village:      { value: a.village,       source: 'Profile: Address' },
        mandal:       { value: a.mandal,        source: 'Profile: Address' },
        district:     { value: a.district,      source: 'Profile: Address (District)' },
        state:        { value: a.state,         source: 'Profile: Address (State)' },
        country:      { value: a.country,       source: 'Profile: Address (Country)' },
        pincode:      { value: a.pincode,       source: 'Profile: Address (PIN)' }
      };

      return map[canonicalId] || null;
    }

    /**
     * Transforms a profile value to fit the target field format.
     */
    transformValue(value, field) {
      if (!value) return { value: '', transformed: false };

      const label = (field.label || '').toLowerCase();
      const placeholder = (field.placeholder || '').toLowerCase();

      // 1. Date of Birth transformations
      if (field.canonicalId === 'dob') {
        const parts = value.split('-');
        if (parts.length === 3) {
          const [year, month, day] = parts;
          if (label.includes('dd/mm/yyyy') || placeholder.includes('dd/mm/yyyy') || label.includes('dd-mm-yyyy')) {
            return { value: `${day}/${month}/${year}`, transformed: true, transformNote: 'Converted to DD/MM/YYYY' };
          }
          if (field.type === 'date') {
            return { value: `${year}-${month}-${day}`, transformed: false };
          }
        }
      }

      // 2. Select option matching
      if ((field.type === 'select-one' || field.type === 'select') && Array.isArray(field.options) && field.options.length > 0) {
        const valClean = String(value).trim().toLowerCase();
        for (const opt of field.options) {
          const optText = (opt.text || '').trim().toLowerCase();
          const optVal  = (opt.value || '').trim().toLowerCase();
          if (optText === valClean || optVal === valClean) {
            return { value: opt.value || opt.text, transformed: false };
          }
          if (valClean.length > 0 && (optVal === valClean[0] || optText === valClean[0] || optText.startsWith(valClean))) {
            return { value: opt.value || opt.text, transformed: true, transformNote: `Matched option "${opt.text}"` };
          }
        }
      }

      return { value, transformed: false };
    }
  }

  const sourceSelector = new SourceSelector();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SourceSelector, sourceSelector, STATUS };
  } else {
    global.EFillSourceSelector = { SourceSelector, sourceSelector, STATUS };
  }
})(typeof window !== 'undefined' ? window : globalThis);
