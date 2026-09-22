/**
 * E-Fill Core Unit & Logic Test Runner
 * Executes zero-dependency automated verification on Node.js.
 */

const assert = require('assert');
const path = require('path');

const CanonicalSchema = require('../core/canonical-schema.js');
const { FieldNormalizer } = require('../core/normalizer.js');
const { SourceSelector, STATUS } = require('../core/source-selector.js');

let passedTests = 0;
let failedTests = 0;

function it(description, fn) {
  try {
    fn();
    console.log(`  ✓ ${description}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ ${description}`);
    console.error(`    ${err.message}`);
    failedTests++;
  }
}

console.log('\n========================================');
console.log('🧪 RUNNING E-FILL CORE TEST SUITE');
console.log('========================================\n');

// Group 1: Canonical Schema Integrity
console.log('--- Group 1: Canonical Schema Integrity ---');
it('should have all Phase 1 core canonical fields defined', () => {
  const fields = CanonicalSchema.CANONICAL_FIELDS;
  const expectedKeys = [
    'full_name', 'first_name', 'last_name', 'dob', 'gender',
    'primary_phone', 'email', 'father_name', 'mother_name',
    'address_line', 'district', 'state', 'pincode'
  ];

  for (const key of expectedKeys) {
    assert(fields[key], `Missing canonical field definition: ${key}`);
    assert(Array.isArray(fields[key].aliases) && fields[key].aliases.length > 0, `Aliases missing for ${key}`);
  }
});

it('should have valid synthetic test profile with no empty required personal fields', () => {
  const profile = CanonicalSchema.DEFAULT_SYNTHETIC_PROFILE;
  assert.strictEqual(profile.personal.fullName, 'Sai Krishna Sharma');
  assert.strictEqual(profile.personal.dob, '2000-08-15');
  assert.strictEqual(profile.personal.gender, 'Male');
  assert.strictEqual(profile.contact.primaryPhone, '9876543210');
  assert.strictEqual(profile.family.fatherName, 'Ram Mohan Sharma');
  assert.strictEqual(profile.address.pincode, '500032');
});

// Group 2: Semantic Field Normalizer
console.log('\n--- Group 2: Semantic Field Normalizer ---');
const normalizer = new FieldNormalizer(CanonicalSchema);

it('should normalize exact and varied Applicant Name labels', () => {
  const variations = [
    "Full Name",
    "Applicant Name",
    "Candidate's Full Name",
    "Candidate Name (as per SSC certificate)",
    "Name of the Candidate"
  ];

  for (const label of variations) {
    const res = normalizer.normalize({ label });
    assert.strictEqual(res.canonicalId, 'full_name', `Failed to map "${label}" to full_name`);
    assert(res.confidence >= 0.85, `Confidence too low (${res.confidence}) for "${label}"`);
  }
});

it('should distinguish Father Name from Applicant Name using negative keywords', () => {
  const fatherRes = normalizer.normalize({ label: "Father's Full Name" });
  assert.strictEqual(fatherRes.canonicalId, 'father_name');

  const motherRes = normalizer.normalize({ label: "Mother's Name" });
  assert.strictEqual(motherRes.canonicalId, 'mother_name');
});

it('should disambiguate generic label "Name" using section headings', () => {
  const underFatherSection = normalizer.normalize({
    label: "Name",
    sectionHeading: "Father / Guardian Details"
  });
  assert.strictEqual(underFatherSection.canonicalId, 'father_name');

  const underMotherSection = normalizer.normalize({
    label: "Name",
    sectionHeading: "Mother Details"
  });
  assert.strictEqual(underMotherSection.canonicalId, 'mother_name');
});

it('should normalize contact information correctly', () => {
  const phoneRes = normalizer.normalize({ label: "Applicant Mobile Number (10 digits)" });
  assert.strictEqual(phoneRes.canonicalId, 'primary_phone');

  const emailRes = normalizer.normalize({ label: "Registered Email Address", type: "email" });
  assert.strictEqual(emailRes.canonicalId, 'email');
});

it('should identify gender from dropdown options even with ambiguous label', () => {
  const genderRes = normalizer.normalize({
    label: "Select",
    type: "select-one",
    options: ["-- Select --", "Male", "Female", "Transgender"]
  });
  assert.strictEqual(genderRes.canonicalId, 'gender');
  assert.strictEqual(genderRes.confidence, 0.98);
});

it('should NEVER guess when a field has no confident match', () => {
  const unknownRes = normalizer.normalize({
    label: "Favorite Color / Hobby",
    name: "user_hobby"
  });
  assert.strictEqual(unknownRes.canonicalId, null);
  assert.strictEqual(unknownRes.confidence, 0);
});

// Group 3: Source Selector & Value Transformation
console.log('\n--- Group 3: Source Selector & Value Transformation ---');
const selector = new SourceSelector();
const profile = CanonicalSchema.DEFAULT_SYNTHETIC_PROFILE;

it('should generate READY proposal for high confidence known fields', () => {
  const detected = [
    {
      elementId: 'applicant_name',
      label: "Candidate's Full Name",
      canonicalId: 'full_name',
      confidence: 0.95,
      type: 'text'
    }
  ];

  const proposals = selector.generateProposals(detected, profile);
  assert.strictEqual(proposals.length, 1);
  assert.strictEqual(proposals[0].status, STATUS.READY);
  assert.strictEqual(proposals[0].proposedValue, 'Sai Krishna Sharma');
  assert.strictEqual(proposals[0].approved, true);
  assert(proposals[0].source.includes('Profile: Personal'));
});

it('should transform Date of Birth to DD/MM/YYYY when application form requests it', () => {
  const detected = [
    {
      elementId: 'applicant_dob',
      label: "Date of Birth (DD/MM/YYYY)",
      canonicalId: 'dob',
      confidence: 0.95,
      type: 'text'
    }
  ];

  const proposals = selector.generateProposals(detected, profile);
  assert.strictEqual(proposals[0].status, STATUS.READY);
  // Original is 2000-08-15 -> Transformed to 15/08/2000
  assert.strictEqual(proposals[0].proposedValue, '15/08/2000');
});

it('should match select dropdown option correctly for Gender', () => {
  const detected = [
    {
      elementId: 'applicant_gender',
      label: "Gender",
      canonicalId: 'gender',
      confidence: 0.98,
      type: 'select-one',
      options: [
        { value: '', text: '-- Select Gender --' },
        { value: 'M', text: 'Male' },
        { value: 'F', text: 'Female' }
      ]
    }
  ];

  const proposals = selector.generateProposals(detected, profile);
  assert.strictEqual(proposals[0].status, STATUS.READY);
  assert.strictEqual(proposals[0].proposedValue, 'M'); // Selected option value
});

it('should report UNAVAILABLE when profile lacks data for recognized field', () => {
  const emptyProfile = { personal: {}, contact: {}, family: {}, address: {} };
  const detected = [
    {
      elementId: 'father_name',
      label: "Father's Name",
      canonicalId: 'father_name',
      confidence: 0.95,
      type: 'text'
    }
  ];

  const proposals = selector.generateProposals(detected, emptyProfile);
  assert.strictEqual(proposals[0].status, STATUS.UNAVAILABLE);
  assert.strictEqual(proposals[0].proposedValue, '');
  assert.strictEqual(proposals[0].approved, false);
});

console.log('\n========================================');
console.log(`📊 TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
console.log('========================================\n');

if (failedTests > 0) {
  process.exit(1);
}
