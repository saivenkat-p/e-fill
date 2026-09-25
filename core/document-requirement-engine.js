/**
 * E-Fill Document Requirement Engine
 * ===================================
 * Evaluates application requirements against the selected person's profile.
 *
 * CRITICAL PRODUCT PRINCIPLES:
 *   - NEVER ask for documents immediately when the page opens.
 *   - Scan the application first to understand required fields, documents, and uploads.
 *   - Compare against the SELECTED PERSON'S profile.
 *   - If information is already available, DO NOT ask for it again.
 *   - Request ONLY genuinely missing required sources/documents.
 *   - Distinguishes:
 *       A. INFORMATION SOURCE DOCUMENT (to obtain missing fields)
 *       B. APPLICATION UPLOAD DOCUMENT (file the portal requires user to upload)
 */

(function (global) {
  'use strict';

  const schema = global.EFillCanonicalSchema || (typeof require !== 'undefined' ? require('./canonical-schema.js') : null);
  const classifierMod = global.EFillDocumentClassifier || (typeof require !== 'undefined' ? require('./document-classifier.js') : null);
  const fieldMapMod = global.EFillDocumentFieldMap || (typeof require !== 'undefined' ? require('./document-field-map.js') : null);

  const REQUIREMENT_STATES = {
    // Form fields
    FIELD_AVAILABLE:       'AVAILABLE',
    FIELD_MISSING:         'MISSING',
    FIELD_CONFLICT:        'CONFLICT',
    FIELD_AMBIGUOUS:       'AMBIGUOUS',
    FIELD_REVIEW_REQUIRED: 'REVIEW_REQUIRED',

    // Document sources
    DOCUMENT_AVAILABLE:       'DOCUMENT_AVAILABLE',
    DOCUMENT_REQUIRED:        'DOCUMENT_REQUIRED',
    DOCUMENT_MISSING:         'DOCUMENT_MISSING',
    DOCUMENT_REVIEW_REQUIRED: 'DOCUMENT_REVIEW_REQUIRED',

    // Upload files
    UPLOAD_READY:             'UPLOAD_READY',
    UPLOAD_NEEDS_PREPARATION: 'UPLOAD_NEEDS_PREPARATION',
    UPLOAD_MISSING:           'UPLOAD_MISSING',
    UPLOAD_REVIEW_REQUIRED:   'UPLOAD_REVIEW_REQUIRED'
  };

  class DocumentRequirementEngine {
    constructor() {
      this.classifier = classifierMod?.documentClassifier || null;
      this.fieldMap = fieldMapMod?.documentFieldMap || null;
    }

    /**
     * Extracts upload constraints from DOM element signals, accept attribute, and label/instruction text.
     *
     * @param {Object} uploadSignal
     * @param {string} [uploadSignal.label]
     * @param {string} [uploadSignal.contextText]
     * @param {string} [uploadSignal.accept]
     * @param {string} [uploadSignal.name]
     * @param {string} [uploadSignal.id]
     * @returns {Object} parsed constraints
     */
    parseUploadConstraints(uploadSignal = {}) {
      const combinedText = `${uploadSignal.label || ''} ${uploadSignal.contextText || ''} ${uploadSignal.name || ''} ${uploadSignal.id || ''}`.toLowerCase();
      const accept = (uploadSignal.accept || '').toLowerCase();

      const constraints = {
        elementId: uploadSignal.id || uploadSignal.elementId || '',
        name: uploadSignal.name || '',
        label: uploadSignal.label || 'File Upload',
        selector: uploadSignal.selector || '',
        category: 'other', // 'photo' | 'signature' | 'certificate' | 'id' | 'other'
        allowedFormats: [],
        minSizeBytes: null,
        maxSizeBytes: null,
        exactWidth: null,
        exactHeight: null,
        minWidth: null,
        maxWidth: null,
        minHeight: null,
        maxHeight: null,
        aspectRatio: null
      };

      // 1. Detect Category
      if (/(photo|photograph|picture|passport.?size|avatar)/i.test(combinedText)) {
        constraints.category = 'photo';
      } else if (/(sign|signature)/i.test(combinedText)) {
        constraints.category = 'signature';
      } else if (/(10th|ssc|12th|inter|degree|marksheet|certificate|caste|income|ews)/i.test(combinedText)) {
        constraints.category = 'certificate';
      } else if (/(aadhaar|pan|id.?proof|identity|passport)/i.test(combinedText)) {
        constraints.category = 'id';
      }

      // 2. Allowed formats & MIME types
      if (accept) {
        const parts = accept.split(',').map(s => s.trim());
        for (const p of parts) {
          if (p.includes('jpeg') || p.includes('jpg') || p === '.jpg' || p === '.jpeg') constraints.allowedFormats.push('image/jpeg');
          if (p.includes('png') || p === '.png') constraints.allowedFormats.push('image/png');
          if (p.includes('pdf') || p === '.pdf') constraints.allowedFormats.push('application/pdf');
        }
      }

      if (constraints.allowedFormats.length === 0) {
        if (/pdf/i.test(combinedText)) constraints.allowedFormats.push('application/pdf');
        if (/jpe?g/i.test(combinedText)) constraints.allowedFormats.push('image/jpeg');
        if (/png/i.test(combinedText)) constraints.allowedFormats.push('image/png');
      }

      if (constraints.allowedFormats.length === 0) {
        // Safe default based on category
        if (constraints.category === 'photo' || constraints.category === 'signature') {
          constraints.allowedFormats = ['image/jpeg', 'image/png'];
        } else {
          constraints.allowedFormats = ['application/pdf', 'image/jpeg'];
        }
      }

      // 3. Size constraints (e.g. 20 KB to 100 KB, max 2 MB, min 10kb)
      const rangeMatch = combinedText.match(/(\d+)\s*(?:kb|k)?\s*(?:to|-)\s*(\d+)\s*(?:kb|k)/i);
      if (rangeMatch) {
        constraints.minSizeBytes = parseInt(rangeMatch[1], 10) * 1024;
        constraints.maxSizeBytes = parseInt(rangeMatch[2], 10) * 1024;
      } else {
        const maxMatch = combinedText.match(/(?:max|maximum|upto|up to|less than|within|not exceeding)\s*(\d+)\s*(kb|mb)/i);
        if (maxMatch) {
          const val = parseInt(maxMatch[1], 10);
          const unit = maxMatch[2].toLowerCase();
          constraints.maxSizeBytes = unit === 'mb' ? val * 1024 * 1024 : val * 1024;
        }

        const minMatch = combinedText.match(/(?:min|minimum|at least|more than)\s*(\d+)\s*(kb|mb)/i);
        if (minMatch) {
          const val = parseInt(minMatch[1], 10);
          const unit = minMatch[2].toLowerCase();
          constraints.minSizeBytes = unit === 'mb' ? val * 1024 * 1024 : val * 1024;
        }
      }

      // 4. Dimension constraints (e.g. 300 x 400, 200x230 px, 140*60)
      const dimMatch = combinedText.match(/(\d{2,4})\s*(?:x|\*|by)\s*(\d{2,4})\s*(?:px|pixels)?/i);
      if (dimMatch) {
        constraints.exactWidth = parseInt(dimMatch[1], 10);
        constraints.exactHeight = parseInt(dimMatch[2], 10);
        constraints.aspectRatio = Number((constraints.exactWidth / constraints.exactHeight).toFixed(2));
      }

      return constraints;
    }

    /**
     * Compare detected application requirements against the selected person's InformationProfile.
     *
     * @param {Array} detectedFields - form fields from FormDetector + Normalizer
     * @param {Array} detectedUploads - upload fields from DOM
     * @param {InformationProfile|Object} profile - selected person's profile
     * @param {Object} [sessionDocs] - active session temporary documents
     * @returns {Object} full requirement intelligence report
     */
    evaluateRequirements(detectedFields = [], detectedUploads = [], profile = null, sessionDocs = {}) {
      const getVal = (cid) => {
        if (!profile) return '';
        if (typeof profile.getValue === 'function') return profile.getValue(cid);
        if (typeof profile.getField === 'function') {
          const f = profile.getField(cid);
          return f ? (f.value || '') : '';
        }
        for (const s of Object.keys(profile)) {
          if (profile[s] && typeof profile[s] === 'object' && cid in profile[s]) {
            const entry = profile[s][cid];
            return typeof entry === 'object' ? (entry.value || '') : entry;
          }
        }
        return '';
      };

      // ── 1. Evaluate Form Fields ─────────────────────────────────────────────
      const fieldResults = [];
      let readyCount = 0;
      let reviewCount = 0;
      let missingCount = 0;

      for (const field of detectedFields) {
        const cid = field.canonicalId || field.id;
        const val = cid ? getVal(cid) : '';
        const hasSessionVal = sessionDocs && cid && sessionDocs[cid];

        let state = REQUIREMENT_STATES.FIELD_MISSING;
        if (val || hasSessionVal) {
          state = (field.confidence < 0.80 || field.requiresReview)
            ? REQUIREMENT_STATES.FIELD_REVIEW_REQUIRED
            : REQUIREMENT_STATES.FIELD_AVAILABLE;
        }

        if (state === REQUIREMENT_STATES.FIELD_AVAILABLE) readyCount++;
        else if (state === REQUIREMENT_STATES.FIELD_REVIEW_REQUIRED) reviewCount++;
        else missingCount++;

        const recDoc = (cid && this.fieldMap) ? this.fieldMap.getRecommendedDocument(cid) : null;

        fieldResults.push({
          elementId: field.elementId,
          label: field.label || cid || 'Field',
          canonicalId: cid,
          state,
          currentValue: val || (hasSessionVal ? sessionDocs[cid].value : ''),
          confidence: field.confidence || 0.9,
          recommendedDoc: recDoc
        });
      }

      // ── 2. Evaluate Document Source Requirements ────────────────────────────
      // Only request a source document if required information CANNOT be obtained from the profile!
      const docRequirements = [];

      // Check if academic details are missing
      const eduFieldsMissing = ['edu_qualification', 'edu_board', 'edu_year', 'edu_percentage', 'edu_marks', 'edu_roll_number']
        .some(fid => detectedFields.some(df => df.canonicalId === fid) && !getVal(fid));

      if (eduFieldsMissing) {
        docRequirements.push({
          docType: 'SSC_10TH',
          label: '10th / Secondary Certificate',
          purpose: 'INFORMATION_SOURCE',
          state: REQUIREMENT_STATES.DOCUMENT_REQUIRED,
          reason: 'Application requires educational details not yet present in selected profile'
        });
      } else if (detectedFields.some(df => df.canonicalId?.startsWith('edu_'))) {
        docRequirements.push({
          docType: 'SSC_10TH',
          label: '10th Certificate Information',
          purpose: 'INFORMATION_SOURCE',
          state: REQUIREMENT_STATES.DOCUMENT_AVAILABLE,
          reason: 'Academic qualifications are already available in selected profile'
        });
      }

      // Check identity documents: Aadhaar
      const aadhaarNeeded = detectedFields.some(df => df.canonicalId === 'aadhaar_number');
      if (aadhaarNeeded) {
        const hasAadhaar = !!getVal('aadhaar_number') || !!(sessionDocs && sessionDocs['aadhaar_number']);
        docRequirements.push({
          docType: 'AADHAAR',
          label: 'Aadhaar Information',
          purpose: 'INFORMATION_SOURCE',
          state: hasAadhaar ? REQUIREMENT_STATES.DOCUMENT_AVAILABLE : REQUIREMENT_STATES.DOCUMENT_REQUIRED,
          reason: hasAadhaar
            ? 'Aadhaar information is available in selected profile'
            : 'Application requires Aadhaar which is missing in selected profile'
        });
      }

      // Check identity documents: PAN
      const panNeeded = detectedFields.some(df => df.canonicalId === 'pan_number');
      if (panNeeded) {
        const hasPan = !!getVal('pan_number') || !!(sessionDocs && sessionDocs['pan_number']);
        docRequirements.push({
          docType: 'PAN',
          label: 'PAN Card',
          purpose: 'INFORMATION_SOURCE',
          state: hasPan ? REQUIREMENT_STATES.DOCUMENT_AVAILABLE : REQUIREMENT_STATES.DOCUMENT_REQUIRED,
          reason: hasPan
            ? 'PAN Card information is available in selected profile'
            : 'Application requires PAN Card which is missing in selected profile'
        });
      }

      // ── 3. Evaluate Application Upload Requirements ─────────────────────────
      const uploadResults = [];
      let uploadReadyCount = 0;
      let uploadNeedsPrepCount = 0;
      let uploadMissingCount = 0;

      for (const rawUpload of detectedUploads) {
        const parsed = this.parseUploadConstraints(rawUpload);

        // Check if an upload file is already provided/prepared in session
        let uploadState = REQUIREMENT_STATES.UPLOAD_NEEDS_PREPARATION;
        if (parsed.preparedFile) {
          uploadState = REQUIREMENT_STATES.UPLOAD_READY;
          uploadReadyCount++;
        } else if (parsed.originalFile) {
          uploadState = REQUIREMENT_STATES.UPLOAD_NEEDS_PREPARATION;
          uploadNeedsPrepCount++;
        } else {
          uploadNeedsPrepCount++;
        }

        uploadResults.push({
          ...parsed,
          state: uploadState
        });
      }

      const missingFieldRecs = fieldResults
        .filter(fr => fr.state === REQUIREMENT_STATES.FIELD_MISSING && fr.recommendedDoc)
        .map(fr => ({
          fieldId: fr.canonicalId || fr.elementId,
          label: fr.label,
          recommendedDoc: fr.recommendedDoc
        }));

      return {
        formFields: fieldResults,
        docRequirements,
        uploadRequirements: uploadResults,
        missingFieldRecommendations: missingFieldRecs,
        summary: {
          totalFields: fieldResults.length,
          readyFields: readyCount,
          reviewFields: reviewCount,
          missingFields: missingCount,
          documentsRequired: docRequirements.filter(d => d.state === REQUIREMENT_STATES.DOCUMENT_REQUIRED).length,
          uploadsTotal: uploadResults.length,
          uploadsReady: uploadReadyCount,
          uploadsNeedPrep: uploadNeedsPrepCount,
          uploadsMissing: uploadMissingCount
        }
      };
    }
  }

  const documentRequirementEngine = new DocumentRequirementEngine();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { DocumentRequirementEngine, documentRequirementEngine, REQUIREMENT_STATES };
  } else {
    global.EFillDocumentRequirementEngine = { DocumentRequirementEngine, documentRequirementEngine, REQUIREMENT_STATES };
  }
})(typeof window !== 'undefined' ? window : globalThis);
