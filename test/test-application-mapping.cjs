/**
 * Automated Verification Suite: Application Information Mapping & Transformation Engine
 * =======================================================================================
 * Tests application-first semantic understanding, direct mapping, transformations
 * (name, address, date, education, marks/percentage, category, options, format),
 * unknown field handling, and SourceSelector integration.
 */

const assert = require('assert');
const {
  ApplicationMappingEngine,
  FieldSemanticUnderstanding,
  MAPPING_STATUS
} = require('../core/application-mapping-engine.js');
const { SourceSelector, STATUS } = require('../core/source-selector.js');
const { InformationProfile } = require('../core/information-profile.js');

let passedTests = 0;
let totalTests = 0;

function it(desc, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✓ ${desc}`);
  } catch (err) {
    console.error(`  ✗ ${desc}`);
    console.error(`    ${err.message}`);
    throw err;
  }
}

console.log('\n=== RUNNING APPLICATION MAPPING & TRANSFORMATION ENGINE TESTS ===\n');

// ─────────────────────────────────────────────────────────────────────────────
// 1. FIELD SEMANTIC UNDERSTANDING
// ─────────────────────────────────────────────────────────────────────────────

console.log('1. Field Semantic Understanding (Application-First):');

it('infers "Candidate\'s permanent place of residence" as ADDRESS_PERMANENT', () => {
  const req = FieldSemanticUnderstanding.analyzeRequirement({
    elementId: 'perm_residence',
    label: "Candidate's permanent place of residence",
    type: 'text'
  });
  assert.strictEqual(req.intent, 'ADDRESS_PERMANENT');
  assert.strictEqual(req.canonicalId, 'address_line');
  assert.strictEqual(req.rawSignals.elementId, 'perm_residence');
});

it('infers "Percentage obtained in SSC" as EDUCATION_PERCENTAGE', () => {
  const req = FieldSemanticUnderstanding.analyzeRequirement({
    elementId: 'ssc_pct',
    label: 'Percentage obtained in SSC',
    placeholder: 'e.g. 85.5%',
    type: 'text'
  });
  assert.strictEqual(req.intent, 'EDUCATION_PERCENTAGE');
  assert.strictEqual(req.canonicalId, 'edu_10th_percentage');
});

it('infers "Name as per matriculation certificate" as NAME_CERTIFICATE', () => {
  const req = FieldSemanticUnderstanding.analyzeRequirement({
    elementId: 'cert_name',
    label: 'Name as per matriculation certificate',
    type: 'text'
  });
  assert.strictEqual(req.intent, 'NAME_CERTIFICATE');
  assert.strictEqual(req.canonicalId, 'edu_candidate_name');
});

it('infers separate date fields (day, month, year) correctly', () => {
  const reqDay = FieldSemanticUnderstanding.analyzeRequirement({
    elementId: 'dob_dd',
    label: 'Date of Birth (Day)',
    name: 'dob_day',
    type: 'text'
  });
  assert.strictEqual(reqDay.intent, 'DOB_DAY');

  const reqYear = FieldSemanticUnderstanding.analyzeRequirement({
    elementId: 'dob_yyyy',
    label: 'Year of Birth',
    name: 'dob_year',
    type: 'text'
  });
  assert.strictEqual(reqYear.intent, 'DOB_YEAR');
});

it('flags completely unfamiliar field as UNKNOWN without hallucinating', () => {
  const req = FieldSemanticUnderstanding.analyzeRequirement({
    elementId: 'custom_pref_xyz_99',
    label: 'Arbitrary Unrecognized Field XYZ',
    type: 'text'
  });
  assert.strictEqual(req.intent, 'UNKNOWN');
  assert.strictEqual(req.canonicalId, null);
  assert.strictEqual(req.rawSignals.elementId, 'custom_pref_xyz_99');
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. NAME TRANSFORMATION PLUGIN
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n2. Name Transformation Plugin:');

const engine = new ApplicationMappingEngine();

it('decomposes 2-token name into First Name and Last Name with DERIVED provenance', () => {
  const profile = {
    personal: { fullName: { value: 'Rohit Sharma', provenance: 'USER_ENTERED' } }
  };

  const firstProp = engine.mapField({ elementId: 'f_name', label: 'First Name', type: 'text' }, profile);
  assert.strictEqual(firstProp.proposedValue, 'Rohit');
  assert.strictEqual(firstProp.provenance, 'DERIVED');
  assert.strictEqual(firstProp.status, 'READY');

  const lastProp = engine.mapField({ elementId: 'l_name', label: 'Last Name', type: 'text' }, profile);
  assert.strictEqual(lastProp.proposedValue, 'Sharma');
  assert.strictEqual(lastProp.provenance, 'DERIVED');
  assert.strictEqual(lastProp.status, 'READY');
});

it('handles 3-token name (PENDYALA SAI ROHITH) with REVIEW_REQUIRED and exact splits', () => {
  const profile = {
    personal: { fullName: { value: 'PENDYALA SAI ROHITH', provenance: 'DOCUMENT_EXTRACTED' } }
  };

  const firstProp = engine.mapField({ elementId: 'first_name', label: 'First Name', type: 'text' }, profile);
  assert.strictEqual(firstProp.status, 'REVIEW_REQUIRED');
  assert.strictEqual(firstProp.proposedValue, 'SAI');
  assert.strictEqual(firstProp.provenance, 'DERIVED');
  assert.strictEqual(firstProp.provenanceDetail, 'DERIVED_FROM(full_name)');
  assert.strictEqual(firstProp.approved, false);

  const middleProp = engine.mapField({ elementId: 'middle_name', label: 'Middle Name', type: 'text' }, profile);
  assert.strictEqual(middleProp.status, 'REVIEW_REQUIRED');
  assert.strictEqual(middleProp.proposedValue, 'ROHITH');
  assert.strictEqual(middleProp.provenance, 'DERIVED');
  assert.strictEqual(middleProp.provenanceDetail, 'DERIVED_FROM(full_name)');
  assert.strictEqual(middleProp.approved, false);

  const lastProp = engine.mapField({ elementId: 'last_name', label: 'Surname / Last Name', type: 'text' }, profile);
  assert.strictEqual(lastProp.status, 'REVIEW_REQUIRED');
  assert.strictEqual(lastProp.proposedValue, 'PENDYALA');
  assert.strictEqual(lastProp.provenance, 'DERIVED');
  assert.strictEqual(lastProp.provenanceDetail, 'DERIVED_FROM(full_name)');
  assert.strictEqual(lastProp.approved, false);
});

it('works seamlessly with actual InformationProfile class instance', () => {
  const ip = new InformationProfile();
  ip.setField('full_name', 'PENDYALA SAI ROHITH', 'USER_CONFIRMED', 'Document Extraction');

  const firstProp = engine.mapField({ elementId: 'firstName', label: 'First Name', type: 'text' }, ip);
  assert.strictEqual(firstProp.proposedValue, 'SAI');
  assert.strictEqual(firstProp.status, 'REVIEW_REQUIRED');
  assert.strictEqual(firstProp.provenance, 'DERIVED');

  const middleProp = engine.mapField({ elementId: 'middleName', label: 'Middle Name', type: 'text' }, ip);
  assert.strictEqual(middleProp.proposedValue, 'ROHITH');
  assert.strictEqual(middleProp.status, 'REVIEW_REQUIRED');

  const lastProp = engine.mapField({ elementId: 'lastName', label: 'Surname', type: 'text' }, ip);
  assert.strictEqual(lastProp.proposedValue, 'PENDYALA');
  assert.strictEqual(lastProp.status, 'REVIEW_REQUIRED');

  // Direct candidate name continues working
  const appNameProp = engine.mapField({ elementId: 'applicantName', label: "Candidate's Full Name", type: 'text' }, ip);
  assert.strictEqual(appNameProp.proposedValue, 'PENDYALA SAI ROHITH');
  assert.strictEqual(appNameProp.status, 'READY');
});

it('assembles Full Name from separate First and Last names', () => {
  const profile = {
    personal: {
      firstName: { value: 'Sai', provenance: 'USER_ENTERED' },
      lastName: { value: 'Pendyala', provenance: 'USER_ENTERED' }
    }
  };

  const prop = engine.mapField({ elementId: 'full_name', label: 'Candidate Full Name', type: 'text' }, profile);
  assert.strictEqual(prop.proposedValue, 'Sai Pendyala');
  assert.strictEqual(prop.provenance, 'DERIVED');
  assert.strictEqual(prop.status, 'READY');
});

it('preserves profile immutability: original full_name is never modified', () => {
  const profile = {
    personal: { fullName: { value: 'Pendyala Sai Rohith', provenance: 'DOCUMENT_EXTRACTED' } }
  };

  engine.mapField({ elementId: 'first_name', label: 'First Name', type: 'text' }, profile);
  assert.strictEqual(profile.personal.fullName.value, 'Pendyala Sai Rohith');
  assert.strictEqual(profile.personal.firstName, undefined);
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. ADDRESS TRANSFORMATION PLUGIN
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n3. Address Transformation Plugin:');

it('composes full address line from components for permanent residence field', () => {
  const profile = {
    address: {
      houseNumber: { value: 'Plot 42' },
      street: { value: 'Main Road' },
      district: { value: 'Hyderabad' },
      state: { value: 'Telangana' },
      pincode: { value: '500001' }
    }
  };

  const prop = engine.mapField({
    elementId: 'perm_address',
    label: "Candidate's permanent place of residence",
    type: 'text'
  }, profile);

  assert.strictEqual(prop.proposedValue, 'Plot 42, Main Road, Hyderabad, Telangana - 500001');
  assert.strictEqual(prop.provenance, 'DERIVED');
  assert.strictEqual(prop.status, 'READY');
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. DATE TRANSFORMATION PLUGIN
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n4. Date Transformation Plugin:');

it('converts ISO YYYY-MM-DD to DD/MM/YYYY when placeholder specifies format', () => {
  const profile = {
    personal: { dob: { value: '2002-08-15' } }
  };

  const prop = engine.mapField({
    elementId: 'birth_date',
    label: 'Date of Birth',
    placeholder: 'DD/MM/YYYY',
    type: 'text'
  }, profile);

  assert.strictEqual(prop.proposedValue, '15/08/2002');
  assert.strictEqual(prop.provenance, 'APPLICATION_TRANSFORMED');
  assert.strictEqual(prop.status, 'READY');
});

it('formats date strictly as ISO YYYY-MM-DD for native input type="date"', () => {
  const profile = {
    personal: { dob: { value: '15/08/2002' } }
  };

  const prop = engine.mapField({
    elementId: 'birth_date',
    label: 'Date of Birth',
    type: 'date'
  }, profile);

  assert.strictEqual(prop.proposedValue, '2002-08-15');
  assert.strictEqual(prop.provenance, 'APPLICATION_TRANSFORMED');
  assert.strictEqual(prop.status, 'READY');
});

it('extracts split day, month, year from stored date of birth', () => {
  const profile = {
    personal: { dob: { value: '2002-08-15' } }
  };

  const propDay = engine.mapField({ elementId: 'dob_d', label: 'Day of Birth', name: 'dob_day', type: 'text' }, profile);
  assert.strictEqual(propDay.proposedValue, '15');

  const propMonth = engine.mapField({ elementId: 'dob_m', label: 'Month of Birth', name: 'dob_month', type: 'text' }, profile);
  assert.strictEqual(propMonth.proposedValue, '08');

  const propYear = engine.mapField({ elementId: 'dob_y', label: 'Year of Birth', name: 'dob_year', type: 'text' }, profile);
  assert.strictEqual(propYear.proposedValue, '2002');
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. MARKS & PERCENTAGE TRANSFORMATION PLUGIN
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n5. Marks & Percentage Transformation Plugin:');

it('calculates percentage from marks obtained (514) and maximum marks (600)', () => {
  const profile = {
    education: {
      records: [
        {
          type: '10th',
          fields: {
            edu_10th_marks: { value: 514 },
            edu_10th_max_marks: { value: 600 }
          }
        }
      ]
    }
  };

  const prop = engine.mapField({
    elementId: 'ssc_percentage',
    label: 'Percentage obtained in SSC',
    type: 'text'
  }, profile);

  assert.strictEqual(prop.proposedValue, '85.67');
  assert.strictEqual(prop.provenance, 'DERIVED');
  assert.strictEqual(prop.provenanceDetail, 'DERIVED_FROM(edu_10th_marks, edu_10th_max_marks)');
  assert.strictEqual(prop.status, 'READY');
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. CATEGORY & OPTION MAPPING PLUGINS
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n6. Category & Option Mapping Plugins:');

it('matches user category "OBC" to dropdown option "OBC-NCL"', () => {
  const profile = {
    personal: { category: { value: 'OBC' } }
  };

  const prop = engine.mapField({
    elementId: 'cat_select',
    label: 'Select Category',
    type: 'select-one',
    tagName: 'select',
    options: [
      { text: '-- Select --', value: '' },
      { text: 'General / Unreserved', value: 'GEN' },
      { text: 'OBC (Non-Creamy Layer)', value: 'OBC-NCL' },
      { text: 'SC', value: 'SC' }
    ]
  }, profile);

  assert.strictEqual(prop.proposedValue, 'OBC-NCL');
  assert.strictEqual(prop.provenance, 'APPLICATION_TRANSFORMED');
  assert.strictEqual(prop.status, 'READY');
});

it('matches Gender "Male" to option "M"', () => {
  const profile = {
    personal: { gender: { value: 'Male' } }
  };

  const prop = engine.mapField({
    elementId: 'gender_select',
    label: 'Gender',
    type: 'select-one',
    tagName: 'select',
    options: [
      { text: 'Male', value: 'M' },
      { text: 'Female', value: 'F' }
    ]
  }, profile);

  assert.strictEqual(prop.proposedValue, 'M');
  assert.strictEqual(prop.status, 'READY');
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. FORMAT TRANSFORMATION PLUGIN
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n7. Format Transformation Plugin:');

it('strips +91 country code for 10-digit mobile number fields', () => {
  const profile = {
    contact: { primaryPhone: { value: '+919876543210' } }
  };

  const prop = engine.mapField({
    elementId: 'mobile',
    label: 'Mobile Number (10 digits)',
    type: 'tel'
  }, profile);

  assert.strictEqual(prop.proposedValue, '9876543210');
  assert.strictEqual(prop.provenance, 'APPLICATION_TRANSFORMED');
  assert.strictEqual(prop.status, 'READY');
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. UNKNOWN & MISSING FIELD HANDLING
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n8. Unknown & Missing Field Handling:');

it('preserves opaque unfamiliar field as UNKNOWN without guessing', () => {
  const profile = {
    personal: { fullName: { value: 'Rohit Sharma' } }
  };

  const prop = engine.mapField({
    elementId: 'security_clearance_code',
    label: 'Departmental Clearance Code',
    type: 'text'
  }, profile);

  assert.strictEqual(prop.mappingStatus, MAPPING_STATUS.UNKNOWN);
  assert.strictEqual(prop.status, 'UNAVAILABLE');
  assert.strictEqual(prop.proposedValue, '');
  assert.strictEqual(prop.semanticRequirement.intent, 'UNKNOWN');
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. SOURCESELECTOR INTEGRATION
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n9. SourceSelector Integration:');

it('SourceSelector automatically delegates missing canonical fields to ApplicationMappingEngine', () => {
  const selector = new SourceSelector();
  const profile = {
    personal: { fullName: { value: 'Rohit Sharma' } }
  };

  // Form detector detected First Name (canonicalId: 'first_name'), but profile only has fullName
  const detected = [
    { elementId: 'fn', label: 'First Name', canonicalId: 'first_name', type: 'text' }
  ];

  const proposals = selector.generateProposals(detected, profile);
  assert.strictEqual(proposals.length, 1);
  assert.strictEqual(proposals[0].proposedValue, 'Rohit');
  assert.strictEqual(proposals[0].provenance, 'DERIVED');
  assert.strictEqual(proposals[0].status, 'READY');
});

it('SourceSelector automatically handles unfamiliar labels like "Percentage obtained in SSC"', () => {
  const selector = new SourceSelector();
  const profile = {
    education: {
      records: [
        {
          fields: {
            edu_10th_marks: { value: 514 },
            edu_10th_max_marks: { value: 600 }
          }
        }
      ]
    }
  };

  // No canonicalId assigned initially by basic detector
  const detected = [
    { elementId: 'ssc_percentage', label: 'Percentage obtained in SSC', type: 'text' }
  ];

  const proposals = selector.generateProposals(detected, profile);
  assert.strictEqual(proposals.length, 1);
  assert.strictEqual(proposals[0].proposedValue, '85.67');
  assert.strictEqual(proposals[0].provenance, 'DERIVED');
  assert.strictEqual(proposals[0].status, 'READY');
});

console.log(`\n========================================`);
console.log(`ALL ${passedTests}/${totalTests} APPLICATION MAPPING TESTS PASSED!`);
console.log(`========================================\n`);
