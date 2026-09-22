/**
 * E-Fill Source Selector & Proposal Generator
 * Matches normalized form fields to user profile and document sources,
 * detects conflicts, applies format transformations, and assigns review statuses.
 */

(function (global) {
  'use strict';

  const STATUS = {
    READY: 'READY',                   // High confidence, ready to autofill
    REVIEW_REQUIRED: 'REVIEW_REQUIRED', // Needs user inspection/confirmation
    CONFLICT: 'CONFLICT',             // Conflicting values detected
    UNAVAILABLE: 'UNAVAILABLE',       // No corresponding profile value
    UNIDENTIFIED: 'UNIDENTIFIED'      // Field could not be semantically normalized
  };

  class SourceSelector {
    constructor() {}

    /**
     * Map detected fields to profile values and generate fill proposals.
     * @param {Array} detectedFields Array of fields from FormDetector + Normalizer
     * @param {Object} profile Structured user profile
     * @returns {Array} Array of proposals
     */
    generateProposals(detectedFields, profile) {
      if (!Array.isArray(detectedFields) || !profile) return [];

      return detectedFields.map(field => this.createProposalForField(field, profile));
    }

    createProposalForField(field, profile) {
      const { canonicalId, confidence = 0, reason = '', elementId, label, options, type } = field;

      if (!canonicalId) {
        return {
          fieldId: elementId,
          label: label || 'Unlabeled field',
          type: type || 'text',
          canonicalId: null,
          proposedValue: '',
          source: 'None',
          status: STATUS.UNIDENTIFIED,
          confidence: 0,
          reason: 'Field could not be reliably mapped to a canonical profile attribute',
          approved: false,
          userEdited: false
        };
      }

      // Extract raw value and source description from profile
      const extraction = this.extractFromProfile(canonicalId, profile);
      if (!extraction || !extraction.value) {
        return {
          fieldId: elementId,
          label: label || canonicalId,
          type: type || 'text',
          canonicalId,
          proposedValue: '',
          source: extraction ? extraction.source : 'User Profile',
          status: STATUS.UNAVAILABLE,
          confidence: confidence,
          reason: `No saved value in profile for "${canonicalId}"`,
          approved: false,
          userEdited: false
        };
      }

      // Format transformation (e.g. Dates, Select options)
      const transformed = this.transformValue(extraction.value, field);

      // Check status
      let status = STATUS.READY;
      let reviewReason = reason;

      if (confidence < 0.85) {
        status = STATUS.REVIEW_REQUIRED;
        reviewReason = `Moderate confidence (${Math.round(confidence * 100)}%). ${reason}`;
      } else if (transformed.transformed) {
        // Slight review note if transformed significantly
        reviewReason = `${reason} (Transformed format: ${transformed.transformNote})`;
      }

      return {
        fieldId: elementId,
        label: label || canonicalId,
        type: type || 'text',
        canonicalId,
        proposedValue: transformed.value,
        originalProfileValue: extraction.value,
        source: extraction.source,
        status,
        confidence,
        reason: reviewReason,
        approved: status === STATUS.READY,
        userEdited: false
      };
    }

    /**
     * Extracts canonical value from profile structure.
     */
    extractFromProfile(canonicalId, profile) {
      const p = profile.personal || {};
      const c = profile.contact || {};
      const f = profile.family || {};
      const a = profile.address || {};

      switch (canonicalId) {
        case 'full_name':
          return {
            value: p.fullName || `${p.firstName || ''} ${p.lastName || ''}`.trim(),
            source: 'Profile: Personal (Full Name)'
          };
        case 'first_name':
          return { value: p.firstName, source: 'Profile: Personal (First Name)' };
        case 'middle_name':
          return { value: p.middleName, source: 'Profile: Personal (Middle Name)' };
        case 'last_name':
          return { value: p.lastName, source: 'Profile: Personal (Last Name)' };
        case 'dob':
          return { value: p.dob, source: 'Profile: Personal (Date of Birth)' };
        case 'gender':
          return { value: p.gender, source: 'Profile: Personal (Gender)' };

        case 'primary_phone':
          return { value: c.primaryPhone, source: 'Profile: Contact (Mobile)' };
        case 'email':
          return { value: c.email, source: 'Profile: Contact (Email)' };

        case 'father_name':
          return { value: f.fatherName, source: 'Profile: Family (Father)' };
        case 'mother_name':
          return { value: f.motherName, source: 'Profile: Family (Mother)' };

        case 'address_line':
          return { value: a.addressLine || `${a.houseNumber || ''}, ${a.street || ''}`.trim(), source: 'Profile: Address' };
        case 'district':
          return { value: a.district, source: 'Profile: Address (District)' };
        case 'state':
          return { value: a.state, source: 'Profile: Address (State)' };
        case 'pincode':
          return { value: a.pincode, source: 'Profile: Address (PIN)' };

        default:
          return null;
      }
    }

    /**
     * Transforms profile value to fit the target field format.
     */
    transformValue(value, field) {
      if (!value) return { value: '', transformed: false };

      const label = (field.label || '').toLowerCase();
      const placeholder = (field.placeholder || '').toLowerCase();

      // 1. Date of Birth transformations
      if (field.canonicalId === 'dob') {
        // standard profile dob is YYYY-MM-DD
        const parts = value.split('-');
        if (parts.length === 3) {
          const [year, month, day] = parts;
          if (label.includes('dd/mm/yyyy') || placeholder.includes('dd/mm/yyyy') || label.includes('dd-mm-yyyy')) {
            return {
              value: `${day}/${month}/${year}`,
              transformed: true,
              transformNote: 'Converted to DD/MM/YYYY'
            };
          }
          if (field.type === 'date') {
            // HTML5 date inputs expect YYYY-MM-DD
            return { value: `${year}-${month}-${day}`, transformed: false };
          }
        }
      }

      // 2. Select option matching
      if (field.type === 'select-one' && Array.isArray(field.options) && field.options.length > 0) {
        const valClean = String(value).trim().toLowerCase();
        for (const opt of field.options) {
          const optText = (opt.text || '').trim().toLowerCase();
          const optVal = (opt.value || '').trim().toLowerCase();

          // Exact text or value match
          if (optText === valClean || optVal === valClean) {
            return { value: opt.value || opt.text, transformed: false };
          }
          // Abbreviated match (e.g. Male -> M)
          if (valClean.length > 0 && (optVal === valClean[0] || optText === valClean[0])) {
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
