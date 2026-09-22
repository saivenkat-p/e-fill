/**
 * E-Fill Canonical Field Schema & Dictionary
 * Pure browser-compatible & Node-compatible module.
 */

(function (global) {
  'use strict';

  const CANONICAL_FIELDS = {
    // Identity / Personal
    full_name: {
      id: 'full_name',
      label: 'Full Name',
      category: 'personal',
      aliases: [
        'full name', 'applicant name', 'candidate name', 'candidate\'s name',
        'name of applicant', 'name of candidate', 'name of the candidate',
        'name as per ssc', 'name as in matriculation', 'applicant\'s full name'
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
      aliases: ['middle name', 'mname'],
      negativeKeywords: ['father', 'mother', 'guardian'],
      priority: 8
    },
    last_name: {
      id: 'last_name',
      label: 'Last Name / Surname',
      category: 'personal',
      aliases: ['last name', 'surname', 'family name', 'lname'],
      negativeKeywords: ['father', 'mother', 'guardian'],
      priority: 9
    },
    dob: {
      id: 'dob',
      label: 'Date of Birth',
      category: 'personal',
      aliases: ['date of birth', 'dob', 'd.o.b', 'birth date', 'date of birth (dd/mm/yyyy)', 'date of birth (yyyy-mm-dd)'],
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

    // Contact
    primary_phone: {
      id: 'primary_phone',
      label: 'Mobile Number',
      category: 'contact',
      aliases: [
        'mobile', 'mobile number', 'mobile no', 'phone', 'phone number',
        'contact number', 'cell phone', 'primary mobile', 'applicant mobile number'
      ],
      negativeKeywords: ['alternate', 'telephone', 'landline', 'guardian', 'office', 'fax'],
      priority: 10
    },
    email: {
      id: 'email',
      label: 'Email Address',
      category: 'contact',
      aliases: [
        'email', 'e-mail', 'email id', 'email address', 'mail id',
        'applicant email', 'registered email'
      ],
      negativeKeywords: ['alternate', 'office', 'guardian'],
      priority: 10
    },

    // Family Details
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

    // Address Details
    address_line: {
      id: 'address_line',
      label: 'Address Line',
      category: 'address',
      aliases: [
        'address', 'permanent address', 'residential address', 'communication address',
        'present address', 'address line 1', 'address line', 'door no / street',
        'house no and street', 'full address', 'street address'
      ],
      negativeKeywords: ['office', 'institution', 'college'],
      priority: 10
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
    pincode: {
      id: 'pincode',
      label: 'PIN Code',
      category: 'address',
      aliases: ['pin code', 'pincode', 'postal code', 'zip code', 'pin', 'zip'],
      negativeKeywords: [],
      priority: 10
    }
  };

  /**
   * Section disambiguation hints.
   * If a field has a generic label like "Name" or "Number", the enclosing section heading determines its canonical ID.
   */
  const SECTION_CONTEXT_RULES = [
    {
      keywords: ['father', 'parent', 'family'],
      genericMap: {
        'name': 'father_name',
        'full name': 'father_name'
      }
    },
    {
      keywords: ['mother'],
      genericMap: {
        'name': 'mother_name',
        'full name': 'mother_name'
      }
    },
    {
      keywords: ['contact', 'communication', 'mobile', 'phone'],
      genericMap: {
        'number': 'primary_phone',
        'no': 'primary_phone'
      }
    },
    {
      keywords: ['address', 'residential', 'permanent', 'domicile'],
      genericMap: {
        'pin': 'pincode',
        'code': 'pincode',
        'line': 'address_line'
      }
    }
  ];

  /**
   * Default synthetic profile for testing and development.
   * Does NOT contain real user or government data.
   */
  const DEFAULT_SYNTHETIC_PROFILE = {
    profileId: 'default-test-profile',
    lastUpdated: new Date().toISOString(),
    personal: {
      fullName: 'Sai Krishna Sharma',
      firstName: 'Sai Krishna',
      middleName: '',
      lastName: 'Sharma',
      dob: '2000-08-15', // ISO YYYY-MM-DD
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

  const CanonicalSchema = {
    CANONICAL_FIELDS,
    SECTION_CONTEXT_RULES,
    DEFAULT_SYNTHETIC_PROFILE
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = CanonicalSchema;
  } else {
    global.EFillCanonicalSchema = CanonicalSchema;
  }
})(typeof window !== 'undefined' ? window : globalThis);
