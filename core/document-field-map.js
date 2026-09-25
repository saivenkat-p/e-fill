/**
 * E-Fill Document-Field Knowledge Map
 * =====================================
 * Reusable knowledge layer mapping document types to expected canonical fields,
 * and mapping form/application fields to recommended source documents.
 *
 * CRITICAL PRINCIPLES:
 *   - Defines which canonical fields can reasonably be extracted from each document.
 *   - Fields are POSSIBLE/EXPECTED fields, NOT guaranteed fields (never fabricate).
 *   - Maps application missing fields to recommended source documents.
 *   - Pure Node and Browser compatible.
 */

(function (global) {
  'use strict';

  const DOCUMENT_FIELD_MAP = {
    AADHAAR: {
      type: 'AADHAAR',
      label: 'Aadhaar Card',
      icon: '🪪',
      category: 'identity',
      expectedFields: [
        'full_name',
        'dob',
        'gender',
        'address_line',
        'aadhaar_number'
      ],
      fieldNotes: {
        full_name: 'Name as printed on Aadhaar',
        dob: 'Date of birth or Year of birth',
        gender: 'Gender (Male / Female / Transgender)',
        address_line: 'Permanent / Residential address',
        aadhaar_number: '12-digit UID'
      }
    },

    PAN: {
      type: 'PAN',
      label: 'PAN Card',
      icon: '💳',
      category: 'identity',
      expectedFields: [
        'full_name',
        'father_name',
        'dob',
        'pan_number',
        'alt_id_number'
      ],
      fieldNotes: {
        full_name: 'Name of cardholder',
        father_name: "Father's name",
        dob: 'Date of birth',
        pan_number: '10-character alphanumeric PAN',
        alt_id_number: 'Same as PAN number for identity'
      }
    },

    PASSPORT: {
      type: 'PASSPORT',
      label: 'Passport',
      icon: '🛂',
      category: 'identity',
      expectedFields: [
        'full_name',
        'dob',
        'gender',
        'nationality',
        'alt_id_number',
        'address_line'
      ],
      fieldNotes: {
        full_name: 'Given names and Surname',
        dob: 'Date of birth',
        gender: 'Sex (M / F / X)',
        nationality: 'Country of citizenship',
        alt_id_number: 'Passport number',
        address_line: 'Address where present (last page)'
      }
    },

    SSC_10TH: {
      type: 'SSC_10TH',
      label: '10th Certificate / Marks Memo',
      icon: '📜',
      category: 'education',
      expectedFields: [
        'full_name',
        'father_name',
        'mother_name',
        'dob',
        'edu_roll_number',
        'edu_board',
        'edu_year',
        'edu_percentage',
        'edu_marks',
        'edu_max_marks',
        'edu_institution',
        'edu_qualification',
        'roll_number',
        'passing_year'
      ],
      fieldNotes: {
        full_name: 'Candidate name as per 10th Certificate / matriculation',
        dob: 'Date of birth where recorded',
        edu_roll_number: 'Roll number / Hall ticket / Registration number',
        roll_number: 'Roll number / Hall ticket / Registration number',
        edu_board: 'Board of Secondary Education / CBSE / ICSE',
        edu_year: 'Passing year / examination session',
        passing_year: 'Passing year / examination session',
        edu_percentage: 'Percentage or GPA / CGPA',
        edu_marks: 'Total marks obtained',
        edu_institution: 'School / Institution attended',
        edu_qualification: '10th / Secondary School Certificate'
      }
    },

    INTER_12TH: {
      type: 'INTER_12TH',
      label: '12th Certificate / Marks Memo',
      icon: '📜',
      category: 'education',
      expectedFields: [
        'full_name',
        'dob',
        'edu_roll_number',
        'edu_board',
        'edu_year',
        'edu_percentage',
        'edu_marks',
        'edu_max_marks',
        'edu_institution',
        'edu_qualification',
        'roll_number',
        'passing_year'
      ],
      fieldNotes: {
        full_name: 'Candidate name as per Intermediate',
        dob: 'Date of birth where present',
        edu_roll_number: 'Roll number / Hall ticket number',
        roll_number: 'Roll number / Hall ticket number',
        edu_board: 'Board of Intermediate / Senior Secondary / CBSE',
        edu_year: 'Passing year',
        passing_year: 'Passing year',
        edu_percentage: 'Marks percentage / grade',
        edu_marks: 'Marks obtained',
        edu_institution: 'Junior college / High school',
        edu_qualification: '12th / Intermediate'
      }
    },

    DEGREE: {
      type: 'DEGREE',
      label: 'Degree Certificate',
      icon: '🎓',
      category: 'education',
      expectedFields: [
        'full_name',
        'edu_qualification',
        'edu_board',
        'edu_institution',
        'edu_year',
        'edu_roll_number',
        'edu_percentage'
      ],
      fieldNotes: {
        full_name: 'Degree recipient name',
        edu_qualification: 'Degree title (e.g. B.Tech, B.Sc, B.Com, B.A)',
        edu_board: 'Conferring University',
        edu_institution: 'College / Institute name',
        edu_year: 'Year of graduation / convocation',
        edu_roll_number: 'Registration number / Roll number'
      }
    },

    CASTE_CERTIFICATE: {
      type: 'CASTE_CERTIFICATE',
      label: 'Caste / Community Certificate',
      icon: '📋',
      category: 'category',
      expectedFields: [
        'full_name',
        'father_name',
        'category',
        'caste_community',
        'alt_id_number'
      ],
      fieldNotes: {
        full_name: 'Certificate beneficiary name',
        father_name: "Father / Guardian's name",
        category: 'Social category (OBC, SC, ST, etc.)',
        caste_community: 'Specific community / sub-caste name',
        alt_id_number: 'Certificate registration number'
      }
    },

    EWS_CERTIFICATE: {
      type: 'EWS_CERTIFICATE',
      label: 'EWS Certificate',
      icon: '📋',
      category: 'category',
      expectedFields: [
        'full_name',
        'father_name',
        'category',
        'ews_status',
        'alt_id_number',
        'annual_income',
        'caste_certificate_number'
      ],
      fieldNotes: {
        full_name: 'Applicant name',
        father_name: "Father's name",
        category: 'Economically Weaker Section (EWS)',
        ews_status: 'EWS eligibility confirmation (Yes)',
        alt_id_number: 'Certificate number'
      }
    },

    INCOME_CERTIFICATE: {
      type: 'INCOME_CERTIFICATE',
      label: 'Income Certificate',
      icon: '💰',
      category: 'additional',
      expectedFields: [
        'full_name',
        'father_name',
        'annual_income',
        'alt_id_number'
      ],
      fieldNotes: {
        full_name: 'Family head / Applicant name',
        father_name: "Father's name",
        annual_income: 'Annual / Family gross income',
        alt_id_number: 'Certificate issue number'
      }
    },

    DRIVING_LICENSE: {
      type: 'DRIVING_LICENSE',
      label: 'Driving License',
      icon: '🚗',
      category: 'identity',
      expectedFields: [
        'full_name',
        'dob',
        'alt_id_number',
        'address_line'
      ],
      fieldNotes: {
        full_name: 'License holder name',
        dob: 'Date of birth',
        alt_id_number: 'DL number',
        address_line: 'Residential address'
      }
    },

    VOTER_ID: {
      type: 'VOTER_ID',
      label: 'Voter ID (EPIC)',
      icon: '🗳️',
      category: 'identity',
      expectedFields: [
        'full_name',
        'father_name',
        'dob',
        'gender',
        'alt_id_number',
        'address_line'
      ],
      fieldNotes: {
        full_name: "Elector's name",
        father_name: "Father / Husband's name",
        dob: 'Age / Date of birth',
        gender: 'Sex',
        alt_id_number: 'EPIC card number',
        address_line: 'Constituency address'
      }
    }
  };

  DOCUMENT_FIELD_MAP.EWS_CERT = DOCUMENT_FIELD_MAP.EWS_CERTIFICATE;
  DOCUMENT_FIELD_MAP.CASTE_CERT = DOCUMENT_FIELD_MAP.CASTE_CERTIFICATE;
  DOCUMENT_FIELD_MAP.INCOME_CERT = DOCUMENT_FIELD_MAP.INCOME_CERTIFICATE;

  /**
   * Mapping from Canonical Field ID to Recommended Source Documents (ordered by preference)
   */
  const FIELD_TO_RECOMMENDED_DOCUMENTS = {
    // Identity
    aadhaar_number:       [{ type: 'AADHAAR', label: 'Aadhaar Card' }],
    pan_number:           [{ type: 'PAN', label: 'PAN Card' }],
    alt_id_number:        [{ type: 'PAN', label: 'PAN Card' }, { type: 'AADHAAR', label: 'Aadhaar Card' }, { type: 'PASSPORT', label: 'Passport' }],
    alt_id_type:          [{ type: 'PAN', label: 'PAN Card' }, { type: 'PASSPORT', label: 'Passport' }],

    // Personal
    full_name:            [
      { type: 'AADHAAR', label: 'Aadhaar Card' },
      { type: 'SSC_10TH', label: '10th Certificate / Marksheet' },
      { type: 'PAN', label: 'PAN Card' },
      { type: 'PASSPORT', label: 'Passport' },
      { type: 'INTER_12TH', label: '12th Certificate' },
      { type: 'DEGREE', label: 'Degree Certificate' },
      { type: 'EWS_CERTIFICATE', label: 'EWS Certificate' },
      { type: 'CASTE_CERTIFICATE', label: 'Caste Certificate' },
      { type: 'VOTER_ID', label: 'Voter ID' },
      { type: 'DRIVING_LICENSE', label: 'Driving License' }
    ],
    first_name:           [
      { type: 'AADHAAR', label: 'Aadhaar Card' },
      { type: 'SSC_10TH', label: '10th Certificate / Marksheet' },
      { type: 'PAN', label: 'PAN Card' },
      { type: 'PASSPORT', label: 'Passport' },
      { type: 'INTER_12TH', label: '12th Certificate' },
      { type: 'DEGREE', label: 'Degree Certificate' },
      { type: 'EWS_CERTIFICATE', label: 'EWS Certificate' },
      { type: 'CASTE_CERTIFICATE', label: 'Caste Certificate' }
    ],
    middle_name:          [
      { type: 'AADHAAR', label: 'Aadhaar Card' },
      { type: 'SSC_10TH', label: '10th Certificate / Marksheet' },
      { type: 'PAN', label: 'PAN Card' },
      { type: 'PASSPORT', label: 'Passport' }
    ],
    last_name:            [
      { type: 'AADHAAR', label: 'Aadhaar Card' },
      { type: 'SSC_10TH', label: '10th Certificate / Marksheet' },
      { type: 'PAN', label: 'PAN Card' },
      { type: 'PASSPORT', label: 'Passport' },
      { type: 'INTER_12TH', label: '12th Certificate' },
      { type: 'DEGREE', label: 'Degree Certificate' },
      { type: 'EWS_CERTIFICATE', label: 'EWS Certificate' },
      { type: 'CASTE_CERTIFICATE', label: 'Caste Certificate' }
    ],
    dob:                  [
      { type: 'SSC_10TH', label: '10th Certificate / Marks Memo' },
      { type: 'AADHAAR', label: 'Aadhaar Card' },
      { type: 'PAN', label: 'PAN Card' },
      { type: 'PASSPORT', label: 'Passport' },
      { type: 'DRIVING_LICENSE', label: 'Driving License' },
      { type: 'VOTER_ID', label: 'Voter ID' }
    ],
    gender:               [
      { type: 'AADHAAR', label: 'Aadhaar Card' },
      { type: 'PASSPORT', label: 'Passport' },
      { type: 'VOTER_ID', label: 'Voter ID' }
    ],
    nationality:          [{ type: 'PASSPORT', label: 'Passport' }],

    // Address
    address_line:         [{ type: 'AADHAAR', label: 'Aadhaar Card' }, { type: 'PASSPORT', label: 'Passport' }, { type: 'DRIVING_LICENSE', label: 'Driving License' }, { type: 'VOTER_ID', label: 'Voter ID' }],
    house_number:         [{ type: 'AADHAAR', label: 'Aadhaar Card' }],
    street:               [{ type: 'AADHAAR', label: 'Aadhaar Card' }],
    village:              [{ type: 'AADHAAR', label: 'Aadhaar Card' }],
    mandal:               [{ type: 'AADHAAR', label: 'Aadhaar Card' }],
    district:             [{ type: 'AADHAAR', label: 'Aadhaar Card' }],
    state:                [{ type: 'AADHAAR', label: 'Aadhaar Card' }],
    pincode:              [{ type: 'AADHAAR', label: 'Aadhaar Card' }],

    // Family
    father_name:          [
      { type: 'PAN', label: 'PAN Card' },
      { type: 'SSC_10TH', label: '10th Certificate / Marksheet' },
      { type: 'EWS_CERTIFICATE', label: 'EWS Certificate' },
      { type: 'CASTE_CERTIFICATE', label: 'Caste Certificate' },
      { type: 'AADHAAR', label: 'Aadhaar Card' },
      { type: 'INTER_12TH', label: '12th Certificate' },
      { type: 'VOTER_ID', label: 'Voter ID' }
    ],
    mother_name:          [
      { type: 'SSC_10TH', label: '10th Certificate / Marksheet' },
      { type: 'INTER_12TH', label: '12th Certificate' },
      { type: 'CASTE_CERTIFICATE', label: 'Caste Certificate' }
    ],

    // Education
    edu_qualification:    [{ type: 'DEGREE', label: 'Degree Certificate' }, { type: 'SSC_10TH', label: '10th Certificate' }, { type: 'INTER_12TH', label: '12th Certificate' }],
    edu_board:            [{ type: 'SSC_10TH', label: '10th Certificate / Marks Memo' }, { type: 'INTER_12TH', label: '12th Certificate' }, { type: 'DEGREE', label: 'Degree Certificate' }],
    edu_institution:      [{ type: 'DEGREE', label: 'Degree Certificate' }, { type: 'INTER_12TH', label: '12th Certificate' }, { type: 'SSC_10TH', label: '10th Certificate' }],
    edu_year:             [{ type: 'SSC_10TH', label: '10th Certificate / Marks Memo' }, { type: 'INTER_12TH', label: '12th Certificate' }, { type: 'DEGREE', label: 'Degree Certificate' }],
    edu_percentage:       [{ type: 'SSC_10TH', label: '10th Certificate / Marks Memo' }, { type: 'INTER_12TH', label: '12th Certificate' }, { type: 'DEGREE', label: 'Degree Certificate' }],
    edu_marks:            [{ type: 'SSC_10TH', label: '10th Certificate / Marks Memo' }, { type: 'INTER_12TH', label: '12th Certificate' }],
    edu_max_marks:        [{ type: 'SSC_10TH', label: '10th Certificate / Marks Memo' }, { type: 'INTER_12TH', label: '12th Certificate' }],
    edu_roll_number:      [{ type: 'SSC_10TH', label: '10th Certificate / Marks Memo' }, { type: 'INTER_12TH', label: '12th Certificate' }, { type: 'DEGREE', label: 'Degree Certificate' }],
    roll_number:          [{ type: 'SSC_10TH', label: '10th Certificate / Marks Memo' }, { type: 'INTER_12TH', label: '12th Certificate' }, { type: 'DEGREE', label: 'Degree Certificate' }],
    passing_year:         [{ type: 'SSC_10TH', label: '10th Certificate / Marks Memo' }, { type: 'INTER_12TH', label: '12th Certificate' }, { type: 'DEGREE', label: 'Degree Certificate' }],

    // Category / Reservation
    category:             [{ type: 'CASTE_CERTIFICATE', label: 'Caste Certificate' }, { type: 'EWS_CERTIFICATE', label: 'EWS Certificate' }],
    caste_community:      [{ type: 'CASTE_CERTIFICATE', label: 'Caste Certificate' }],
    ews_status:           [{ type: 'EWS_CERTIFICATE', label: 'EWS Certificate' }],

    // Income
    annual_income:        [{ type: 'INCOME_CERTIFICATE', label: 'Income Certificate' }, { type: 'EWS_CERTIFICATE', label: 'EWS Certificate' }]
  };

  const SUPPORTED_DOCUMENT_EXAMPLES = [
    { type: 'AADHAAR',            label: 'Aadhaar',             icon: '🪪', desc: 'Name, DOB, Gender, Address, Aadhaar Number' },
    { type: 'PAN',                label: 'PAN',                 icon: '💳', desc: 'Name, DOB, Father Name, PAN Number' },
    { type: 'PASSPORT',           label: 'Passport',            icon: '🛂', desc: 'Name, DOB, Gender, Nationality, Passport Number, Address' },
    { type: 'SSC_10TH',           label: '10th Certificate',    icon: '📜', desc: 'Name, DOB, Board, Passing Year, Roll No, Marks' },
    { type: 'INTER_12TH',         label: '12th Certificate',    icon: '📜', desc: 'Name, Board, Passing Year, Roll No, Marks' },
    { type: 'DEGREE',             label: 'Degree Certificate',  icon: '🎓', desc: 'Name, Degree, University, College, Passing Year' },
    { type: 'CASTE_CERTIFICATE',  label: 'Caste Certificate',   icon: '📋', desc: 'Name, Category/Caste, Certificate Number' },
    { type: 'EWS_CERTIFICATE',    label: 'EWS Certificate',     icon: '📋', desc: 'Name, EWS Status, Certificate Number' },
    { type: 'INCOME_CERTIFICATE', label: 'Income Certificate',  icon: '💰', desc: 'Name, Family Income, Certificate Number' },
    { type: 'OTHER',              label: 'Other supported documents', icon: '📄', desc: 'Driving License, Voter ID, etc.' }
  ];

  class DocumentFieldMap {
    constructor() {
      this.documentMap = DOCUMENT_FIELD_MAP;
      this.fieldToDocs = FIELD_TO_RECOMMENDED_DOCUMENTS;
    }

    /**
     * Get expected canonical fields that can reasonably be extracted from a document type.
     * @param {string} docType
     * @returns {Array<string>} list of canonical IDs
     */
    getExpectedFields(docType) {
      if (!docType) return [];
      const entry = this.documentMap[docType.toUpperCase()];
      return entry ? [...entry.expectedFields] : [];
    }

    /**
     * Get field note for a specific canonical field in a document.
     */
    getFieldNote(docType, canonicalId) {
      if (!docType || !canonicalId) return '';
      const entry = this.documentMap[docType.toUpperCase()];
      return (entry && entry.fieldNotes && entry.fieldNotes[canonicalId]) || '';
    }

    /**
     * Classify document filename into canonical document type.
     */
    classifyDocument(filename) {
      if (!filename) return 'OTHER';
      const f = filename.toLowerCase();
      if (/aadhaar|aadhar|uidai/.test(f)) return 'AADHAAR';
      if (/pan[-_ ]?card|\bpan\b|pancard/.test(f)) return 'PAN';
      if (/passport/.test(f)) return 'PASSPORT';
      if (/10th|ssc|matric|secondary/.test(f)) return 'SSC_10TH';
      if (/12th|inter|hsc|higher.?secondary/.test(f)) return 'INTER_12TH';
      if (/degree|graduat|btech|be|bsc|bcom|ba|mtech|msc|diploma/.test(f)) return 'DEGREE';
      if (/caste|community|obc|sc|st/.test(f)) return 'CASTE_CERT';
      if (/ews|economically.?weaker/.test(f)) return 'EWS_CERT';
      if (/income|salary|tahsildar/.test(f)) return 'INCOME_CERT';
      if (/driving|license|licence|\bdl\b/.test(f)) return 'DRIVING_LICENSE';
      if (/voter|epic|election/.test(f)) return 'VOTER_ID';
      return 'OTHER';
    }

    /**
     * Get document metadata including label, icon, category, and expected fields.
     */
    getDocumentInfo(docType) {
      if (!docType) return null;
      return this.documentMap[docType.toUpperCase()] || null;
    }

    /**
     * Get primary recommended document for a single missing canonical field,
     * along with all other valid alternative sources.
     * @param {string} canonicalId
     * @returns {{ type: string, docType: string, label: string, documentName: string, allPossibleSources: Array<{ type: string, docType: string, label: string, documentName: string }> }|null}
     */
    getRecommendedDocument(canonicalId) {
      if (!canonicalId) return null;
      const list = this.fieldToDocs[canonicalId];
      if (list && list.length > 0) {
        const item = list[0];
        const allPossibleSources = list.map(d => ({
          type: d.type,
          docType: d.type,
          label: d.label,
          documentName: d.label
        }));
        return {
          type: item.type,
          docType: item.type,
          label: item.label,
          documentName: item.label,
          allPossibleSources
        };
      }
      return null;
    }

    /**
     * Get all possible source documents that can reasonably provide a canonical field.
     * @param {string} canonicalId
     * @returns {Array<{ type: string, docType: string, label: string, documentName: string }>}
     */
    getAllPossibleSources(canonicalId) {
      if (!canonicalId) return [];
      const list = this.fieldToDocs[canonicalId];
      return list ? list.map(d => ({
        type: d.type,
        docType: d.type,
        label: d.label,
        documentName: d.label
      })) : [];
    }

    /**
     * Get all recommended documents for a canonical field.
     */
    getRecommendedDocumentsList(canonicalId) {
      return this.getAllPossibleSources(canonicalId);
    }

    /**
     * Given an array of missing canonical IDs, return a mapped list of recommendations.
     * @param {Array<string>} missingFieldIds
     * @returns {Array<{ canonicalId: string, label: string, recommendedDoc: { type: string, label: string }|null }>}
     */
    getRecommendationsForMissingFields(missingFieldIds) {
      if (!Array.isArray(missingFieldIds)) return [];
      return missingFieldIds.map(fid => ({
        canonicalId: fid,
        recommendedDoc: this.getRecommendedDocument(fid)
      }));
    }

    /**
     * List of supported document examples for the empty profile view.
     */
    getSupportedExamples() {
      return [...SUPPORTED_DOCUMENT_EXAMPLES];
    }
  }

  const documentFieldMap = new DocumentFieldMap();

  DocumentFieldMap.getExpectedFields = (type) => documentFieldMap.getExpectedFields(type);
  DocumentFieldMap.getFieldNote = (type, fid) => documentFieldMap.getFieldNote(type, fid);
  DocumentFieldMap.getRecommendedDocument = (fid) => documentFieldMap.getRecommendedDocument(fid);
  DocumentFieldMap.getAllPossibleSources = (fid) => documentFieldMap.getAllPossibleSources(fid);
  DocumentFieldMap.classifyDocument = (fname) => documentFieldMap.classifyDocument(fname);
  DocumentFieldMap.documentFieldMap = documentFieldMap;
  DocumentFieldMap.DOCUMENT_FIELD_MAP = DOCUMENT_FIELD_MAP;
  DocumentFieldMap.FIELD_TO_RECOMMENDED_DOCUMENTS = FIELD_TO_RECOMMENDED_DOCUMENTS;
  DocumentFieldMap.SUPPORTED_DOCUMENT_EXAMPLES = SUPPORTED_DOCUMENT_EXAMPLES;
  DocumentFieldMap.DocumentFieldMap = DocumentFieldMap;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = DocumentFieldMap;
  } else {
    global.EFillDocumentFieldMap = DocumentFieldMap;
  }
})(typeof window !== 'undefined' ? window : globalThis);
