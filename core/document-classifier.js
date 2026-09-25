/**
 * E-Fill Document Classifier
 * ===========================
 * Classifies uploaded documents into recognized document types based on:
 *   - Filename patterns
 *   - MIME type & file extension
 *   - Text content / keywords / structural patterns
 *
 * Distinguishes the two fundamental document purposes:
 *   A. INFORMATION_SOURCE — Document to extract personal data from (Aadhaar, 10th cert, PAN)
 *   B. APPLICATION_UPLOAD — Derived file to prepare for an application upload (Photo, Signature, PDF)
 */

(function (global) {
  'use strict';

  const DOCUMENT_TYPES = {
    AADHAAR:            'AADHAAR',
    PAN:                'PAN',
    PASSPORT:           'PASSPORT',
    VOTER_ID:           'VOTER_ID',
    DRIVING_LICENSE:    'DRIVING_LICENSE',
    SSC_10TH:           'SSC_10TH',
    INTER_12TH:         'INTER_12TH',
    DEGREE:             'DEGREE',
    CASTE_CERTIFICATE:  'CASTE_CERTIFICATE',
    INCOME_CERTIFICATE: 'INCOME_CERTIFICATE',
    EWS_CERTIFICATE:    'EWS_CERTIFICATE',
    EWS_CERT:           'EWS_CERTIFICATE',
    PHOTO:              'PHOTO',
    SIGNATURE:          'SIGNATURE',
    RESUME:             'RESUME',
    OTHER:              'OTHER'
  };

  const DOCUMENT_PURPOSES = {
    INFORMATION_SOURCE: 'INFORMATION_SOURCE',  // For extracting structured profile data
    APPLICATION_UPLOAD: 'APPLICATION_UPLOAD'   // For preparing files to upload into forms
  };

  const CLASSIFICATION_RULES = [
    {
      type: DOCUMENT_TYPES.PHOTO,
      label: 'Photograph',
      purpose: DOCUMENT_PURPOSES.APPLICATION_UPLOAD,
      filenameRegex: /(photo|passport.?size|picture|\bpic\b|avatar|headshot|portrait)/i,
      textRegex: /(photograph|passport size photograph|candidate photo|applicant photo)/i,
      priority: 10
    },
    {
      type: DOCUMENT_TYPES.SIGNATURE,
      label: 'Signature',
      purpose: DOCUMENT_PURPOSES.APPLICATION_UPLOAD,
      filenameRegex: /(sign|signature|specimen.?signature)/i,
      textRegex: /(signature of candidate|applicant signature|candidate signature|specimen signature)/i,
      priority: 10
    },
    {
      type: DOCUMENT_TYPES.AADHAAR,
      label: 'Aadhaar Card',
      purpose: DOCUMENT_PURPOSES.INFORMATION_SOURCE,
      filenameRegex: /(aadhaar|aadhar|uidai|mera.?aadhaar)/i,
      textRegex: /(unique identification authority of india|government of india.*aadhaar|aadhaar.*mera aadhaar|vid\s*:\s*\d{4}|\b\d{4}\s\d{4}\s\d{4}\b)/i,
      priority: 9
    },
    {
      type: DOCUMENT_TYPES.PAN,
      label: 'PAN Card',
      purpose: DOCUMENT_PURPOSES.INFORMATION_SOURCE,
      filenameRegex: /(pan|pancard|income.?tax)/i,
      textRegex: /(income tax department|permanent account number|govt\.? of india.*pan|\b[a-z]{5}\d{4}[a-z]\b)/i,
      priority: 9
    },
    {
      type: DOCUMENT_TYPES.PASSPORT,
      label: 'Passport',
      purpose: DOCUMENT_PURPOSES.INFORMATION_SOURCE,
      filenameRegex: /(passport|republic.?of.?india.?passport)/i,
      textRegex: /(republic of india.*passport|passport no|given name.*surname.*nationality)/i,
      priority: 8
    },
    {
      type: DOCUMENT_TYPES.VOTER_ID,
      label: 'Voter ID (EPIC)',
      purpose: DOCUMENT_PURPOSES.INFORMATION_SOURCE,
      filenameRegex: /(voter|epic|election)/i,
      textRegex: /(election commission of india|elector's photo identity card|epic no)/i,
      priority: 8
    },
    {
      type: DOCUMENT_TYPES.DRIVING_LICENSE,
      label: 'Driving License',
      purpose: DOCUMENT_PURPOSES.INFORMATION_SOURCE,
      filenameRegex: /(driving|license|licence|dl)/i,
      textRegex: /(driving licence|driving license|transport department|union of india.*driving)/i,
      priority: 8
    },
    {
      type: DOCUMENT_TYPES.SSC_10TH,
      label: '10th / SSC Certificate',
      purpose: DOCUMENT_PURPOSES.INFORMATION_SOURCE,
      filenameRegex: /(10th|ssc|matric|matriculation|secondary|class.?10|high.?school)/i,
      textRegex: /(secondary school certificate|board of secondary education|matriculation examination|class x|high school examination|10th marksheet|marksheet cum certificate of secondary)/i,
      priority: 8
    },
    {
      type: DOCUMENT_TYPES.INTER_12TH,
      label: '12th / Intermediate Certificate',
      purpose: DOCUMENT_PURPOSES.INFORMATION_SOURCE,
      filenameRegex: /(12th|inter|intermediate|hsc|senior.?secondary|class.?12)/i,
      textRegex: /(senior school certificate|board of intermediate|intermediate examination|class xii|higher secondary)/i,
      priority: 8
    },
    {
      type: DOCUMENT_TYPES.DEGREE,
      label: 'Degree Certificate',
      purpose: DOCUMENT_PURPOSES.INFORMATION_SOURCE,
      filenameRegex: /(degree|btech|be|bsc|bcom|ba|graduation|provisional|convocation)/i,
      textRegex: /(bachelor of|degree of|provisional certificate|convocation|university.*conferred)/i,
      priority: 7
    },
    {
      type: DOCUMENT_TYPES.CASTE_CERTIFICATE,
      label: 'Caste / Community Certificate',
      purpose: DOCUMENT_PURPOSES.INFORMATION_SOURCE,
      filenameRegex: /(caste|community|obc|sc.?st|category.?cert)/i,
      textRegex: /(caste certificate|community certificate|other backward class|scheduled caste|scheduled tribe|backward class community)/i,
      priority: 7
    },
    {
      type: DOCUMENT_TYPES.INCOME_CERTIFICATE,
      label: 'Income Certificate',
      purpose: DOCUMENT_PURPOSES.INFORMATION_SOURCE,
      filenameRegex: /(income|annual.?income|income.?cert)/i,
      textRegex: /(income certificate|annual family income|gross family income|tahsildar.*income)/i,
      priority: 7
    },
    {
      type: DOCUMENT_TYPES.EWS_CERTIFICATE,
      label: 'EWS Certificate',
      purpose: DOCUMENT_PURPOSES.INFORMATION_SOURCE,
      filenameRegex: /(ews|economically.?weaker)/i,
      textRegex: /(economically weaker section|income and asset certificate.*ews|reservation for ews)/i,
      priority: 7
    }
  ];

  class DocumentClassifier {
    /**
     * Classifies a document given its metadata and text content.
     *
     * @param {Object} input
     * @param {string} [input.filename]
     * @param {string} [input.mimeType]
     * @param {string} [input.text] - Extracted or OCR text
     * @returns {{ type: string, label: string, purpose: string, confidence: number }}
     */
    classify(input = {}) {
      const filename = (input.filename || '').trim();
      const text = (input.text || '').trim();
      const mime = (input.mimeType || '').toLowerCase();

      // Check text first (highest confidence)
      if (text) {
        for (const rule of CLASSIFICATION_RULES) {
          if (rule.textRegex && rule.textRegex.test(text)) {
            return {
              type: rule.type,
              docType: rule.type,
              label: rule.label,
              purpose: rule.purpose,
              confidence: 0.95,
              matchBy: 'text'
            };
          }
        }
      }

      // Check filename
      if (filename) {
        for (const rule of CLASSIFICATION_RULES) {
          if (rule.filenameRegex && rule.filenameRegex.test(filename)) {
            return {
              type: rule.type,
              docType: rule.type,
              label: rule.label,
              purpose: rule.purpose,
              confidence: 0.85,
              matchBy: 'filename'
            };
          }
        }
      }

      // Check mime type hints
      if (mime.startsWith('image/')) {
        return {
          type: DOCUMENT_TYPES.PHOTO,
          docType: DOCUMENT_TYPES.PHOTO,
          label: 'Photograph / Image',
          purpose: DOCUMENT_PURPOSES.APPLICATION_UPLOAD,
          confidence: 0.60,
          matchBy: 'mime'
        };
      }

      return {
        type: DOCUMENT_TYPES.OTHER,
        docType: DOCUMENT_TYPES.OTHER,
        label: 'Other Document',
        purpose: DOCUMENT_PURPOSES.INFORMATION_SOURCE,
        confidence: 0.30,
        matchBy: 'fallback'
      };
    }

    classifyDocument(input = {}) {
      const res = this.classify(input);
      return { ...res, docType: res.type };
    }

    isInformationSource(docType) {
      const rule = CLASSIFICATION_RULES.find(r => r.type === docType);
      return rule ? rule.purpose === DOCUMENT_PURPOSES.INFORMATION_SOURCE : true;
    }

    isApplicationUpload(docType) {
      if (docType === DOCUMENT_TYPES.PHOTO || docType === DOCUMENT_TYPES.SIGNATURE || docType === DOCUMENT_TYPES.RESUME) return true;
      if (docType === DOCUMENT_TYPES.SSC_10TH || docType === DOCUMENT_TYPES.INTER_12TH || docType === DOCUMENT_TYPES.DEGREE || String(docType).includes('CERTIFICATE')) return true;
      const rule = CLASSIFICATION_RULES.find(r => r.type === docType);
      return rule ? rule.purpose === DOCUMENT_PURPOSES.APPLICATION_UPLOAD : false;
    }
  }

  const documentClassifier = new DocumentClassifier();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { DocumentClassifier, documentClassifier, DOCUMENT_TYPES, DOCUMENT_PURPOSES };
  } else {
    global.EFillDocumentClassifier = { DocumentClassifier, documentClassifier, DOCUMENT_TYPES, DOCUMENT_PURPOSES };
  }
})(typeof window !== 'undefined' ? window : globalThis);
