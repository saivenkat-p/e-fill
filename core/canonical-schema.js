/**
 * E-Fill Canonical Field Schema & Dictionary
 * ===========================================
 * Pure browser-compatible & Node-compatible module.
 *
 * Contains:
 *  - CANONICAL_FIELDS       — full field dictionary (~70+ fields across all categories)
 *  - SECTION_CONTEXT_RULES  — disambiguation rules for generic labels
 *  - PROVENANCE_TYPES       — source-of-truth constants for every stored value
 *  - FIELD_SENSITIVITY      — marks fields requiring enhanced privacy protection
 *  - DEFAULT_SYNTHETIC_PROFILE — test/dev profile (flat format, backward-compat)
 */

(function (global) {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────────
  // PROVENANCE — Where did this value come from?
  // ─────────────────────────────────────────────────────────────────────────
  const PROVENANCE_TYPES = {
    USER_ENTERED:        'USER_ENTERED',        // Typed directly by user
    DOCUMENT_EXTRACTED:  'DOCUMENT_EXTRACTED',  // Parsed from an uploaded document
    USER_CONFIRMED:      'USER_CONFIRMED',       // User reviewed and confirmed extracted data
    USER_EDITED:         'USER_EDITED',          // User modified a previously stored value
    IMPORTED:            'IMPORTED',             // Imported from external source
    APPLICATION_SPECIFIC: 'APPLICATION_SPECIFIC' // Provided for a specific application only
  };

  // ─────────────────────────────────────────────────────────────────────────
  // AVAILABILITY STATES — Used by InformationAvailabilityEngine
  // ─────────────────────────────────────────────────────────────────────────
  const AVAILABILITY_STATES = {
    AVAILABLE:       'AVAILABLE',
    MISSING:         'MISSING',
    CONFLICT:        'CONFLICT',
    AMBIGUOUS:       'AMBIGUOUS',
    REVIEW_REQUIRED: 'REVIEW_REQUIRED'
  };

  // ─────────────────────────────────────────────────────────────────────────
  // FIELD SENSITIVITY — Fields requiring enhanced privacy treatment
  // ─────────────────────────────────────────────────────────────────────────
  const FIELD_SENSITIVITY = {
    // SENSITIVE fields are masked in UI by default; require explicit reveal
    SENSITIVE: new Set([
      'aadhaar_number',
      'alt_id_number',
      'bank_account_number',
      'bank_ifsc',
      'bank_account_holder',
      'bank_name'
    ]),
    // RESTRICTED fields need special confirmation before autofill
    RESTRICTED: new Set([
      'aadhaar_number',
      'bank_account_number'
    ])
  };

  // ─────────────────────────────────────────────────────────────────────────
  // CANONICAL FIELD DICTIONARY
  // ─────────────────────────────────────────────────────────────────────────
  const CANONICAL_FIELDS = {

    // ── PERSONAL ────────────────────────────────────────────────────────────
    full_name: {
      id: 'full_name',
      label: 'Full Name',
      category: 'personal',
      aliases: [
        'full name', 'applicant name', 'candidate name', "candidate's name",
        'name of applicant', 'name of candidate', 'name of the candidate',
        'name as per ssc', 'name as in matriculation', "applicant's full name",
        'name as per aadhaar', 'name as per certificate'
      ],
      negativeKeywords: ['father', 'mother', 'guardian', 'institution', 'college', 'school', 'verifier', 'officer', 'bank'],
      priority: 10
    },
    first_name: {
      id: 'first_name',
      label: 'First Name',
      category: 'personal',
      aliases: ['first name', 'given name', 'forename', 'fname'],
      negativeKeywords: ['father', 'mother', 'guardian'],
      priority: 9
    },
    middle_name: {
      id: 'middle_name',
      label: 'Middle Name',
      category: 'personal',
      aliases: ['middle name', 'mname', 'middle initial'],
      negativeKeywords: ['father', 'mother', 'guardian'],
      priority: 8
    },
    last_name: {
      id: 'last_name',
      label: 'Last Name',
      category: 'personal',
      aliases: ['last name', 'surname', 'family name', 'lname'],
      negativeKeywords: ['father', 'mother', 'guardian'],
      priority: 9
    },
    dob: {
      id: 'dob',
      label: 'Date of Birth',
      category: 'personal',
      aliases: [
        'date of birth', 'dob', 'd.o.b', 'birth date',
        'date of birth (dd/mm/yyyy)', 'date of birth (yyyy-mm-dd)',
        'birthdate', 'birth day'
      ],
      negativeKeywords: ['father', 'mother', 'issue', 'expiry', 'validity'],
      priority: 10
    },
    gender: {
      id: 'gender',
      label: 'Gender',
      category: 'personal',
      aliases: ['gender', 'sex'],
      negativeKeywords: [],
      priority: 10
    },
    nationality: {
      id: 'nationality',
      label: 'Nationality',
      category: 'personal',
      aliases: ['nationality', 'citizenship'],
      negativeKeywords: [],
      priority: 8
    },
    marital_status: {
      id: 'marital_status',
      label: 'Marital Status',
      category: 'personal',
      aliases: ['marital status', 'married', 'marriage status'],
      negativeKeywords: [],
      priority: 7
    },

    // ── IDENTITY ─────────────────────────────────────────────────────────────
    aadhaar_number: {
      id: 'aadhaar_number',
      label: 'Aadhaar Number',
      category: 'identity',
      aliases: [
        'aadhaar', 'aadhaar number', 'aadhar number', 'aadhaar no',
        'uid', 'uidai number', 'aadhaar card number', 'aadhar'
      ],
      negativeKeywords: [],
      priority: 10,
      sensitive: true
    },
    alt_id_type: {
      id: 'alt_id_type',
      label: 'Identity Document Type',
      category: 'identity',
      aliases: [
        'id type', 'identity type', 'id proof type', 'proof type',
        'id document type', 'photo id type', 'identity proof'
      ],
      negativeKeywords: [],
      priority: 9
    },
    alt_id_number: {
      id: 'alt_id_number',
      label: 'Identity Document Number',
      category: 'identity',
      aliases: [
        'id number', 'id no', 'identity number', 'document number',
        'id proof number', 'pan number', 'passport number', 'voter id',
        'driving license number', 'dl number'
      ],
      negativeKeywords: [],
      priority: 9,
      sensitive: true
    },

    // ── CONTACT ──────────────────────────────────────────────────────────────
    primary_phone: {
      id: 'primary_phone',
      label: 'Mobile Number',
      category: 'contact',
      aliases: [
        'mobile', 'mobile number', 'mobile no', 'phone', 'phone number',
        'contact number', 'cell phone', 'primary mobile', 'applicant mobile number',
        'registered mobile'
      ],
      negativeKeywords: ['alternate', 'telephone', 'landline', 'guardian', 'office', 'fax', 'whatsapp'],
      priority: 10
    },
    secondary_phone: {
      id: 'secondary_phone',
      label: 'Alternate Mobile Number',
      category: 'contact',
      aliases: [
        'alternate mobile', 'alternate phone', 'alternate number',
        'secondary mobile', 'other phone', 'backup mobile'
      ],
      negativeKeywords: [],
      priority: 7
    },
    email: {
      id: 'email',
      label: 'Email Address',
      category: 'contact',
      aliases: [
        'email', 'e-mail', 'email id', 'email address', 'mail id',
        'applicant email', 'registered email', 'primary email'
      ],
      negativeKeywords: ['alternate', 'office', 'guardian', 'secondary'],
      priority: 10
    },
    secondary_email: {
      id: 'secondary_email',
      label: 'Alternate Email',
      category: 'contact',
      aliases: ['alternate email', 'secondary email', 'other email', 'backup email'],
      negativeKeywords: [],
      priority: 6
    },

    // ── ADDRESS ──────────────────────────────────────────────────────────────
    house_number: {
      id: 'house_number',
      label: 'House / Door Number',
      category: 'address',
      aliases: [
        'house number', 'house no', 'door number', 'door no', 'flat no',
        'flat number', 'plot no', 'plot number', 'h.no'
      ],
      negativeKeywords: ['college', 'institution', 'office'],
      priority: 8
    },
    address_line: {
      id: 'address_line',
      label: 'Address Line',
      category: 'address',
      aliases: [
        'address', 'permanent address', 'residential address', 'communication address',
        'present address', 'address line 1', 'address line', 'door no / street',
        'house no and street', 'full address', 'street address', 'locality'
      ],
      negativeKeywords: ['office', 'institution', 'college'],
      priority: 10
    },
    street: {
      id: 'street',
      label: 'Street / Colony',
      category: 'address',
      aliases: ['street', 'street name', 'colony', 'road', 'nagar', 'layout', 'area'],
      negativeKeywords: [],
      priority: 8
    },
    landmark: {
      id: 'landmark',
      label: 'Landmark',
      category: 'address',
      aliases: ['landmark', 'nearby landmark', 'near'],
      negativeKeywords: [],
      priority: 6
    },
    village: {
      id: 'village',
      label: 'Village / Town',
      category: 'address',
      aliases: ['village', 'village name', 'gram', 'town', 'locality name'],
      negativeKeywords: [],
      priority: 7
    },
    mandal: {
      id: 'mandal',
      label: 'Mandal / Tehsil',
      category: 'address',
      aliases: ['mandal', 'tehsil', 'taluka', 'taluk', 'block', 'sub-division'],
      negativeKeywords: [],
      priority: 8
    },
    city: {
      id: 'city',
      label: 'City',
      category: 'address',
      aliases: ['city', 'city name', 'town city'],
      negativeKeywords: [],
      priority: 8
    },
    district: {
      id: 'district',
      label: 'District',
      category: 'address',
      aliases: ['district', 'dist', 'district name'],
      negativeKeywords: [],
      priority: 10
    },
    state: {
      id: 'state',
      label: 'State / UT',
      category: 'address',
      aliases: ['state', 'state / ut', 'state/ut', 'province', 'state of domicile'],
      negativeKeywords: [],
      priority: 10
    },
    country: {
      id: 'country',
      label: 'Country',
      category: 'address',
      aliases: ['country', 'country name'],
      negativeKeywords: [],
      priority: 8
    },
    pincode: {
      id: 'pincode',
      label: 'PIN Code',
      category: 'address',
      aliases: ['pin code', 'pincode', 'postal code', 'zip code', 'pin', 'zip'],
      negativeKeywords: [],
      priority: 10
    },

    // ── FAMILY ───────────────────────────────────────────────────────────────
    father_name: {
      id: 'father_name',
      label: "Father's Name",
      category: 'family',
      aliases: [
        "father's name", "father name", "name of father", "fathers name",
        "father's full name", "father / husband name", "father/guardian name"
      ],
      negativeKeywords: ['mother'],
      priority: 10
    },
    mother_name: {
      id: 'mother_name',
      label: "Mother's Name",
      category: 'family',
      aliases: [
        "mother's name", "mother name", "name of mother", "mothers name",
        "mother's full name"
      ],
      negativeKeywords: ['father'],
      priority: 10
    },
    guardian_name: {
      id: 'guardian_name',
      label: "Guardian's Name",
      category: 'family',
      aliases: ["guardian's name", "guardian name", "name of guardian"],
      negativeKeywords: [],
      priority: 8
    },
    spouse_name: {
      id: 'spouse_name',
      label: "Spouse's Name",
      category: 'family',
      aliases: ["spouse name", "husband name", "wife name", "spouse's name"],
      negativeKeywords: [],
      priority: 6
    },

    // ── CATEGORY / RESERVATION ───────────────────────────────────────────────
    category: {
      id: 'category',
      label: 'Category',
      category: 'category',
      aliases: [
        'category', 'social category', 'caste category', 'reservation category',
        'community category'
      ],
      negativeKeywords: [],
      priority: 10
    },
    caste_community: {
      id: 'caste_community',
      label: 'Caste / Community',
      category: 'category',
      aliases: ['caste', 'community', 'sub-caste', 'caste name'],
      negativeKeywords: [],
      priority: 9
    },
    ews_status: {
      id: 'ews_status',
      label: 'EWS Status',
      category: 'category',
      aliases: ['ews', 'economically weaker section', 'ews status'],
      negativeKeywords: [],
      priority: 9
    },
    disability_type: {
      id: 'disability_type',
      label: 'Disability Type',
      category: 'additional',
      aliases: ['disability', 'disability type', 'type of disability', 'pwd', 'physically handicapped'],
      negativeKeywords: [],
      priority: 8
    },
    disability_percentage: {
      id: 'disability_percentage',
      label: 'Disability Percentage',
      category: 'additional',
      aliases: ['disability percentage', 'disability %', 'percentage of disability'],
      negativeKeywords: [],
      priority: 8
    },

    // ── EDUCATION (form-level fields, mapped from education records) ──────────
    edu_qualification: {
      id: 'edu_qualification',
      label: 'Qualification',
      category: 'education',
      aliases: [
        'qualification', 'educational qualification', 'highest qualification',
        '10th', '12th', 'ssc', 'hsc', 'degree', 'graduation', 'post graduation',
        'diploma', 'b.tech', 'b.e', 'm.tech',
        // GATE-specific labels
        'qualifying degree', 'qualifying examination', 'qualifying exam',
        'degree name', 'programme name', 'name of degree', 'course name'
      ],
      negativeKeywords: [],
      priority: 9
    },
    edu_board: {
      id: 'edu_board',
      label: 'Board / University',
      category: 'education',
      aliases: [
        'board', 'board of education', 'university', 'examining body',
        '10th board', '12th board', 'board name'
      ],
      negativeKeywords: [],
      priority: 8
    },
    edu_institution: {
      id: 'edu_institution',
      label: 'School / College / Institution',
      category: 'education',
      aliases: [
        'school', 'college', 'institution', 'institute', 'school name',
        'college name', 'institution name', 'name of school', 'name of college'
      ],
      negativeKeywords: [],
      priority: 8
    },
    edu_year: {
      id: 'edu_year',
      label: 'Year of Passing',
      category: 'education',
      aliases: [
        'year of passing', 'passing year', 'year', 'passed year', 'completion year',
        'year of completion'
      ],
      negativeKeywords: [],
      priority: 8
    },
    edu_percentage: {
      id: 'edu_percentage',
      label: 'Percentage / CGPA',
      category: 'education',
      aliases: [
        'percentage', 'marks percentage', 'aggregate percentage', 'cgpa',
        '10th percentage', '12th percentage', 'aggregate marks', 'grade'
      ],
      negativeKeywords: [],
      priority: 9
    },
    edu_marks: {
      id: 'edu_marks',
      label: 'Marks Obtained',
      category: 'education',
      aliases: ['marks', 'marks obtained', 'total marks', 'obtained marks'],
      negativeKeywords: ['maximum', 'max marks', 'out of'],
      priority: 8
    },
    edu_max_marks: {
      id: 'edu_max_marks',
      label: 'Maximum Marks',
      category: 'education',
      aliases: ['maximum marks', 'max marks', 'out of', 'total out of'],
      negativeKeywords: [],
      priority: 7
    },
    edu_roll_number: {
      id: 'edu_roll_number',
      label: 'Roll Number / Registration Number',
      category: 'education',
      aliases: [
        'roll number', 'roll no', 'registration number', 'reg no',
        'hall ticket number', 'exam roll number', '10th roll number'
      ],
      negativeKeywords: [],
      priority: 8
    },

    // ── EMPLOYMENT ───────────────────────────────────────────────────────────
    employment_status: {
      id: 'employment_status',
      label: 'Employment Status',
      category: 'employment',
      aliases: [
        'employment status', 'currently employed', 'occupation',
        'job status', 'employed / unemployed'
      ],
      negativeKeywords: [],
      priority: 8
    },
    employer: {
      id: 'employer',
      label: 'Employer / Organization',
      category: 'employment',
      aliases: ['employer', 'organization', 'company name', 'name of employer'],
      negativeKeywords: [],
      priority: 7
    },
    designation: {
      id: 'designation',
      label: 'Designation',
      category: 'employment',
      aliases: ['designation', 'job title', 'post', 'position'],
      negativeKeywords: [],
      priority: 7
    },
    years_of_experience: {
      id: 'years_of_experience',
      label: 'Years of Experience',
      category: 'employment',
      aliases: ['experience', 'years of experience', 'work experience', 'total experience'],
      negativeKeywords: [],
      priority: 7
    },
    govt_employee_status: {
      id: 'govt_employee_status',
      label: 'Government Employee',
      category: 'employment',
      aliases: [
        'government employee', 'govt employee', 'central govt employee',
        'state govt employee', 'public servant'
      ],
      negativeKeywords: [],
      priority: 8
    },
    ex_serviceman_status: {
      id: 'ex_serviceman_status',
      label: 'Ex-Serviceman',
      category: 'additional',
      aliases: [
        'ex-serviceman', 'ex serviceman', 'defence personnel', 'armed forces',
        'ex-army', 'ex-navy', 'ex-air force'
      ],
      negativeKeywords: [],
      priority: 8
    },

    // ── BANKING (sensitive) ───────────────────────────────────────────────────
    bank_account_holder: {
      id: 'bank_account_holder',
      label: 'Account Holder Name',
      category: 'banking',
      aliases: ['account holder name', 'account holder', 'beneficiary name', 'name as per bank'],
      negativeKeywords: [],
      priority: 9,
      sensitive: true
    },
    bank_name: {
      id: 'bank_name',
      label: 'Bank Name',
      category: 'banking',
      aliases: ['bank name', 'name of bank', 'bank'],
      negativeKeywords: [],
      priority: 9,
      sensitive: true
    },
    bank_account_number: {
      id: 'bank_account_number',
      label: 'Bank Account Number',
      category: 'banking',
      aliases: [
        'account number', 'bank account number', 'account no',
        'bank account no', 'savings account number'
      ],
      negativeKeywords: [],
      priority: 10,
      sensitive: true
    },
    bank_ifsc: {
      id: 'bank_ifsc',
      label: 'IFSC Code',
      category: 'banking',
      aliases: ['ifsc', 'ifsc code', 'ifsc no', 'bank ifsc'],
      negativeKeywords: [],
      priority: 10,
      sensitive: true
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION CONTEXT RULES
  // ─────────────────────────────────────────────────────────────────────────
  const SECTION_CONTEXT_RULES = [
    {
      keywords: ['father', 'parent', 'family'],
      genericMap: { 'name': 'father_name', 'full name': 'father_name' }
    },
    {
      keywords: ['mother'],
      genericMap: { 'name': 'mother_name', 'full name': 'mother_name' }
    },
    {
      keywords: ['contact', 'communication', 'mobile', 'phone'],
      genericMap: { 'number': 'primary_phone', 'no': 'primary_phone' }
    },
    {
      keywords: ['address', 'residential', 'permanent', 'domicile'],
      genericMap: { 'pin': 'pincode', 'code': 'pincode', 'line': 'address_line' }
    },
    {
      keywords: ['bank', 'banking', 'payment'],
      genericMap: {
        'number': 'bank_account_number',
        'account number': 'bank_account_number',
        'name': 'bank_account_holder'
      }
    },
    {
      keywords: ['education', '10th', '12th', 'ssc', 'hsc', 'degree'],
      genericMap: {
        'percentage': 'edu_percentage',
        'marks': 'edu_marks',
        'year': 'edu_year',
        'board': 'edu_board',
        'roll number': 'edu_roll_number'
      }
    }
  ];

  // ─────────────────────────────────────────────────────────────────────────
  // CANONICAL CATEGORIES (for profile section organization)
  // ─────────────────────────────────────────────────────────────────────────
  const PROFILE_CATEGORIES = {
    personal:   { label: 'Personal Details',       icon: '👤', order: 1 },
    identity:   { label: 'Identity Documents',     icon: '🪪', order: 2, sensitive: true },
    contact:    { label: 'Contact Information',    icon: '📱', order: 3 },
    address:    { label: 'Address',                icon: '🏠', order: 4 },
    family:     { label: 'Family Details',         icon: '👨‍👩‍👦', order: 5 },
    category:   { label: 'Category / Reservation', icon: '📋', order: 6 },
    education:  { label: 'Education',              icon: '🎓', order: 7, multiRecord: true },
    employment: { label: 'Employment',             icon: '💼', order: 8 },
    additional: { label: 'Additional Information', icon: '📎', order: 9 },
    banking:    { label: 'Banking Details',        icon: '🏦', order: 10, sensitive: true }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // DEFAULT SYNTHETIC PROFILE (flat format, backward-compatible for tests)
  // ─────────────────────────────────────────────────────────────────────────
  const DEFAULT_SYNTHETIC_PROFILE = {
    profileId: 'default-test-profile',
    lastUpdated: new Date().toISOString(),
    personal: {
      fullName: 'Sai Krishna Sharma',
      firstName: 'Sai Krishna',
      middleName: '',
      lastName: 'Sharma',
      dob: '2000-08-15',
      gender: 'Male'
    },
    contact: {
      primaryPhone: '9876543210',
      email: 'saikrishna.sharma@example.com'
    },
    family: {
      fatherName: 'Ram Mohan Sharma',
      motherName: 'Sita Devi Sharma',
      guardianName: ''
    },
    social: {
      category: 'General',
      caste: '',
      ewsStatus: 'No',
      disabilityStatus: 'No',
      disabilityType: '',
      disabilityPercentage: ''
    },
    address: {
      houseNumber: 'Plot No. 42',
      street: 'Gandhi Road',
      addressLine: 'Plot No. 42, Gandhi Road, Sector 4',
      village: 'Anandpur',
      mandal: 'Serilingampally',
      district: 'Hyderabad',
      state: 'Telangana',
      pincode: '500032'
    },
    education: [
      {
        id: 'edu-10th',
        qualification: '10th / SSC',
        institution: 'Kendriya Vidyalaya No. 1',
        board: 'CBSE',
        course: 'General',
        yearOfPassing: '2016',
        marks: '475',
        maxMarks: '500',
        percentage: '95.0',
        rollNumber: '10482910'
      },
      {
        id: 'edu-12th',
        qualification: '12th / Intermediate',
        institution: 'Narayana Junior College',
        board: 'State Board of Intermediate Education',
        course: 'MPC',
        yearOfPassing: '2018',
        marks: '960',
        maxMarks: '1000',
        percentage: '96.0',
        rollNumber: '18204918'
      }
    ],
    metadata: {
      source: 'manual_entry',
      verified: true
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // EXPORTS
  // ─────────────────────────────────────────────────────────────────────────
  const CanonicalSchema = {
    CANONICAL_FIELDS,
    SECTION_CONTEXT_RULES,
    PROVENANCE_TYPES,
    AVAILABILITY_STATES,
    FIELD_SENSITIVITY,
    PROFILE_CATEGORIES,
    DEFAULT_SYNTHETIC_PROFILE,
    // Convenience alias
    FIELD_DEFINITIONS: CANONICAL_FIELDS
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = CanonicalSchema;
  } else {
    global.EFillCanonicalSchema = CanonicalSchema;
  }
})(typeof window !== 'undefined' ? window : globalThis);
