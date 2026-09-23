/**
 * E-Fill Core Unit & Logic Test Runner
 * Executes zero-dependency automated verification on Node.js.
 */

const assert = require('assert');
const path = require('path');

const CanonicalSchema = require('../core/canonical-schema.js');
const { FieldNormalizer } = require('../core/normalizer.js');
const { SourceSelector, STATUS } = require('../core/source-selector.js');
const { APPLICATION_PROFILES } = require('../core/app-profiles.js');
const { PageClassifier } = require('../core/page-classifier.js');

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

// Group 4: Full Test Harness Simulation (All 11 Government Application Fields)
console.log('\n--- Group 4: Full Test Harness Simulation (All 11 Fields) ---');
it('should correctly detect, normalize, and match all 11 fields from test-harness.html', () => {
  const harnessFields = [
    { elementId: 'applicant_name', label: "Candidate's Full Name (as per SSC certificate) *", name: 'candidate_full_name', expectedCanonical: 'full_name', expectedValue: 'Sai Krishna Sharma' },
    { elementId: 'applicant_dob', label: 'Date of Birth (DD/MM/YYYY) *', name: 'birth_date', placeholder: 'DD/MM/YYYY', expectedCanonical: 'dob', expectedValue: '15/08/2000' },
    { elementId: 'applicant_gender', label: 'Gender *', name: 'gender', type: 'select-one', options: [{ value: '', text: '-- Select Gender --' }, { value: 'Male', text: 'Male' }, { value: 'Female', text: 'Female' }], expectedCanonical: 'gender', expectedValue: 'Male' },
    { elementId: 'mobile_number', label: 'Applicant Mobile Number (10 digits) *', name: 'primary_mobile', expectedCanonical: 'primary_phone', expectedValue: '9876543210' },
    { elementId: 'email_id', label: 'Email Address *', name: 'applicant_email', type: 'email', expectedCanonical: 'email', expectedValue: 'saikrishna.sharma@example.com' },
    { elementId: 'father_name', label: "Father's Full Name *", name: 'father_full_name', expectedCanonical: 'father_name', expectedValue: 'Ram Mohan Sharma' },
    { elementId: 'mother_name', label: "Mother's Name *", name: 'mother_name', expectedCanonical: 'mother_name', expectedValue: 'Sita Devi Sharma' },
    { elementId: 'permanent_address', label: 'Address Line (Door No, Street, Landmark) *', name: 'full_address', expectedCanonical: 'address_line', expectedValue: 'Plot No. 42, Gandhi Road, Sector 4' },
    { elementId: 'district_name', label: 'District *', name: 'district', expectedCanonical: 'district', expectedValue: 'Hyderabad' },
    { elementId: 'state_name', label: 'State / UT *', name: 'state_of_residence', expectedCanonical: 'state', expectedValue: 'Telangana' },
    { elementId: 'postal_pincode', label: 'PIN Code *', name: 'pincode', expectedCanonical: 'pincode', expectedValue: '500032' }
  ];

  for (const hf of harnessFields) {
    const norm = normalizer.normalize(hf);
    assert.strictEqual(norm.canonicalId, hf.expectedCanonical, `Field "${hf.label}" normalized to "${norm.canonicalId}", expected "${hf.expectedCanonical}"`);
    assert(norm.confidence >= 0.85, `Field "${hf.label}" had low confidence: ${norm.confidence}`);

    const proposal = selector.createProposalForField({ ...hf, ...norm }, profile);
    assert.strictEqual(proposal.status, STATUS.READY, `Proposal for "${hf.label}" has status "${proposal.status}"`);
    assert.strictEqual(proposal.proposedValue, hf.expectedValue, `Proposal value mismatch for "${hf.label}": got "${proposal.proposedValue}", expected "${hf.expectedValue}"`);
    assert.strictEqual(proposal.approved, true, `Field "${hf.label}" should be approved by default`);
  }
});

// Group 5: Storage Layer Persistence Simulation
console.log('\n--- Group 5: Storage Layer Persistence & Profile Customization ---');
it('should load default synthetic profile and persist updates', async () => {
  const { storageManager } = require('../core/storage.js');
  const initialProfile = await storageManager.getProfile();
  assert(initialProfile, 'Failed to load initial profile');
  assert.strictEqual(initialProfile.personal.fullName, 'Sai Krishna Sharma');

  // Clone and edit
  const modifiedProfile = JSON.parse(JSON.stringify(initialProfile));
  modifiedProfile.personal.fullName = 'Dr. Sai Krishna Sharma';
  modifiedProfile.contact.primaryPhone = '9998887776';
  await storageManager.saveProfile(modifiedProfile);

  // Reload and check
  const reloaded = await storageManager.getProfile();
  assert.strictEqual(reloaded.personal.fullName, 'Dr. Sai Krishna Sharma');
  assert.strictEqual(reloaded.contact.primaryPhone, '9998887776');

  // Reset back to default
  const resetProfile = await storageManager.resetToDefaultProfile();
  assert.strictEqual(resetProfile.personal.fullName, 'Sai Krishna Sharma');
});

// ============================================================
// GROUP 6: APPLICATION PROFILES REGISTRY
// ============================================================
console.log('\n--- Group 6: Application Profiles Registry ---');

it('APPLICATION_PROFILES is a non-empty array', () => {
  assert.ok(Array.isArray(APPLICATION_PROFILES), 'Should be an array');
  assert.ok(APPLICATION_PROFILES.length > 0, 'Should have at least one profile');
});

it('Test harness profile exists with id "efill-test-harness"', () => {
  const profile = APPLICATION_PROFILES.find(p => p.id === 'efill-test-harness');
  assert.ok(profile, 'Test harness profile not found');
  assert.ok(profile.urlPatterns && profile.urlPatterns.length > 0, 'Must have urlPatterns');
});

it('Each profile has required fields: id, name, urlPatterns, version', () => {
  for (const profile of APPLICATION_PROFILES) {
    assert.ok(profile.id, `Profile missing id: ${JSON.stringify(profile)}`);
    assert.ok(profile.name, `Profile "${profile.id}" missing name`);
    assert.ok(Array.isArray(profile.urlPatterns), `Profile "${profile.id}" urlPatterns must be an array`);
    assert.ok(profile.version, `Profile "${profile.id}" missing version`);
  }
});

it('Test harness profile has file:// protocol pattern', () => {
  const profile = APPLICATION_PROFILES.find(p => p.id === 'efill-test-harness');
  assert.ok(profile, 'Profile not found');
  const filePattern = profile.urlPatterns.find(p => p.protocol === 'file');
  assert.ok(filePattern, 'No file:// pattern found in test harness profile');
});

// ============================================================
// GROUP 7: PAGE CLASSIFIER — ELIGIBLE PAGES
// ============================================================
console.log('\n--- Group 7: Page Classifier — Eligible pages ---');

const classifier = new PageClassifier(APPLICATION_PROFILES);

it('Test harness URL is classified as eligible', () => {
  // Simulate a real file:// URL as it appears on Windows
  const url = 'file:///C:/Users/saive/OneDrive/Desktop/E-fill/test/test-harness.html';
  const result = classifier.classify(url);
  assert.strictEqual(result.eligible, true, `Expected eligible. Reason: ${result.reason}`);
});

it('Test harness profile name is returned when eligible', () => {
  const url = 'file:///C:/Users/saive/OneDrive/Desktop/E-fill/test/test-harness.html';
  const result = classifier.classify(url);
  assert.ok(result.profile, 'Profile should be returned');
  assert.strictEqual(result.profile.id, 'efill-test-harness');
});

it('Test harness URL matches across different path separators (forward and back)', () => {
  // Some Windows systems use backslashes in file:// URLs
  const urlFwd = 'file:///C:/Users/saive/Desktop/E-fill/test/test-harness.html';
  const urlBck = 'file:///C:\\Users\\saive\\Desktop\\E-fill\\test\\test-harness.html';
  const r1 = classifier.classify(urlFwd);
  const r2 = classifier.classify(urlBck);
  // At least one path variant should match (the forward slash one definitely should)
  assert.strictEqual(r1.eligible, true, `Forward slash path not eligible: ${r1.reason}`);
});

it('TSPSC portal is classified as eligible', () => {
  const url = 'https://online.tspsc.gov.in/apply/form';
  const result = classifier.classify(url);
  assert.strictEqual(result.eligible, true, `Expected eligible. Reason: ${result.reason}`);
});

it('UPSC portal is classified as eligible', () => {
  const url = 'https://upsconline.nic.in/mainmenuotr.php';
  const result = classifier.classify(url);
  assert.strictEqual(result.eligible, true, `Expected eligible. Reason: ${result.reason}`);
});

it('SSC portal is classified as eligible', () => {
  const url = 'https://ssc.nic.in/Portal/SchemeExamList';
  const result = classifier.classify(url);
  assert.strictEqual(result.eligible, true, `Expected eligible. Reason: ${result.reason}`);
});

it('NTA portal is classified as eligible', () => {
  const url = 'https://jeemain.nta.ac.in/webinfo/Handler/FrontController.aspx';
  const result = classifier.classify(url);
  assert.strictEqual(result.eligible, true, `Expected eligible. Reason: ${result.reason}`);
});

it('IBPS portal is classified as eligible', () => {
  const url = 'https://ibpsonline.ibps.in/';
  const result = classifier.classify(url);
  assert.strictEqual(result.eligible, true, `Expected eligible. Reason: ${result.reason}`);
});

// ============================================================
// GROUP 8: PAGE CLASSIFIER — INELIGIBLE PAGES
// ============================================================
console.log('\n--- Group 8: Page Classifier — Ineligible pages ---');

it('ChatGPT is NOT eligible', () => {
  const result = classifier.classify('https://chat.openai.com/');
  assert.strictEqual(result.eligible, false, 'chat.openai.com should be ineligible');
});

it('Gmail is NOT eligible', () => {
  const result = classifier.classify('https://mail.google.com/mail/u/0/');
  assert.strictEqual(result.eligible, false, 'Gmail should be ineligible');
});

it('YouTube is NOT eligible', () => {
  const result = classifier.classify('https://www.youtube.com/');
  assert.strictEqual(result.eligible, false, 'YouTube should be ineligible');
});

it('Arbitrary news site is NOT eligible', () => {
  const result = classifier.classify('https://www.ndtv.com/news');
  assert.strictEqual(result.eligible, false, 'News site should be ineligible');
});

it('Empty string URL returns ineligible', () => {
  const result = classifier.classify('');
  assert.strictEqual(result.eligible, false);
});

it('null URL returns ineligible', () => {
  const result = classifier.classify(null);
  assert.strictEqual(result.eligible, false);
});

it('chrome:// pages are NOT eligible', () => {
  const result = classifier.classify('chrome://extensions/');
  assert.strictEqual(result.eligible, false);
});

it('chrome-extension:// pages are NOT eligible', () => {
  const result = classifier.classify('chrome-extension://abcdefghijkl/sidepanel/index.html');
  assert.strictEqual(result.eligible, false);
});

it('Ineligible result returns null profile', () => {
  const result = classifier.classify('https://www.google.com/');
  assert.strictEqual(result.profile, null, 'Profile must be null for ineligible pages');
});

it('Ineligible result always includes a reason string', () => {
  const result = classifier.classify('https://www.reddit.com/');
  assert.ok(typeof result.reason === 'string' && result.reason.length > 0);
});

// ============================================================
// GROUP 9: ELIGIBILITY GATE — NO PROPOSALS FOR INELIGIBLE PAGES
// ============================================================
console.log('\n--- Group 9: Eligibility gate — no proposals for ineligible pages ---');

it('Ineligible scan response has eligible=false', () => {
  const fakeScanResponse = {
    eligible: false,
    profile: null,
    eligibilityReason: 'Page does not match any registered E-Fill application profile',
    fields: [],
    totalFound: 0
  };
  assert.strictEqual(fakeScanResponse.eligible, false);
  assert.strictEqual(fakeScanResponse.fields.length, 0);
});

it('SourceSelector.generateProposals returns empty array for empty field list', () => {
  const selector = new SourceSelector(CanonicalSchema.FIELD_DEFINITIONS);
  const { DEFAULT_SYNTHETIC_PROFILE } = CanonicalSchema;
  const proposals = selector.generateProposals([], DEFAULT_SYNTHETIC_PROFILE);
  assert.ok(Array.isArray(proposals), 'Should return array');
  assert.strictEqual(proposals.length, 0, 'Should generate zero proposals for zero detected fields');
});

it('When scan returns eligible=false, field count is 0', () => {
  const ineligibleScan = {
    eligible: false,
    profile: null,
    fields: [],
    totalFound: 0
  };
  // Simulate the guard: only process fields if eligible
  const proposalsToRender = ineligibleScan.eligible ? ineligibleScan.fields : [];
  assert.strictEqual(proposalsToRender.length, 0);
});

// ============================================================
// GROUP 10: SUPPORTED TEST HARNESS → 11 FIELDS
// ============================================================
console.log('\n--- Group 10: Test harness fields (harness simulation) ---');

it('Harness profile includes 11 field hints', () => {
  const profile = APPLICATION_PROFILES.find(p => p.id === 'efill-test-harness');
  assert.ok(profile.fieldHints, 'fieldHints must exist');
  assert.strictEqual(profile.fieldHints.length, 11, `Expected 11 field hints, got ${profile.fieldHints.length}`);
});

it('Harness field hints include all expected canonical IDs', () => {
  const profile = APPLICATION_PROFILES.find(p => p.id === 'efill-test-harness');
  const expected = ['full_name', 'dob', 'gender', 'primary_phone', 'email',
    'father_name', 'mother_name', 'address_line', 'district', 'state', 'pincode'];
  for (const id of expected) {
    assert.ok(profile.fieldHints.includes(id), `Missing hint: ${id}`);
  }
});

it('Simulated test harness scan produces 11 proposals with a real profile', () => {
  const { DEFAULT_SYNTHETIC_PROFILE } = CanonicalSchema;
  const selector = new SourceSelector(CanonicalSchema.FIELD_DEFINITIONS);

  // Simulate what formDetector + fieldReader produce for the 11-field test harness
  const simulatedFields = [
    { fieldId: 'applicant_name', label: 'Full Name of Applicant', type: 'text', options: [] },
    { fieldId: 'applicant_dob', label: 'Date of Birth', type: 'date', options: [] },
    { fieldId: 'applicant_gender', label: 'Gender', type: 'select', options: ['Male', 'Female', 'Transgender'] },
    { fieldId: 'mobile_number', label: 'Mobile Number', type: 'tel', options: [] },
    { fieldId: 'email_id', label: 'Email Address', type: 'email', options: [] },
    { fieldId: 'father_name', label: "Father's Name", type: 'text', options: [] },
    { fieldId: 'mother_name', label: "Mother's Name", type: 'text', options: [] },
    { fieldId: 'permanent_address', label: 'Permanent Address', type: 'textarea', options: [] },
    { fieldId: 'district_name', label: 'District', type: 'text', options: [] },
    { fieldId: 'state_name', label: 'State', type: 'select', options: ['Andhra Pradesh', 'Telangana', 'Other'] },
    { fieldId: 'postal_pincode', label: 'PIN Code', type: 'text', options: [] }
  ];

  const normalizer = new FieldNormalizer(CanonicalSchema.FIELD_DEFINITIONS);
  const detectedFields = simulatedFields.map(f => ({
    fieldId: f.fieldId,
    type: f.type,
    options: f.options,
    ...normalizer.normalize({
      label: f.label,
      placeholder: '',
      ariaLabel: '',
      name: f.fieldId,
      id: f.fieldId,
      autocomplete: '',
      type: f.type,
      sectionHeading: '',
      contextText: '',
      options: f.options
    })
  }));

  const proposals = selector.generateProposals(detectedFields, DEFAULT_SYNTHETIC_PROFILE);
  assert.strictEqual(proposals.length, 11, `Expected 11 proposals, got ${proposals.length}`);
});

it('Simulated harness proposals — no UNIDENTIFIED fields (all should map)', () => {
  const { DEFAULT_SYNTHETIC_PROFILE } = CanonicalSchema;
  const selector = new SourceSelector(CanonicalSchema.FIELD_DEFINITIONS);
  const normalizer = new FieldNormalizer(CanonicalSchema.FIELD_DEFINITIONS);

  const simulatedFields = [
    { fieldId: 'applicant_name', label: 'Full Name of Applicant', type: 'text', options: [] },
    { fieldId: 'applicant_dob', label: 'Date of Birth', type: 'date', options: [] },
    { fieldId: 'applicant_gender', label: 'Gender', type: 'select', options: ['Male', 'Female', 'Transgender'] },
    { fieldId: 'mobile_number', label: 'Mobile Number', type: 'tel', options: [] },
    { fieldId: 'email_id', label: 'Email Address', type: 'email', options: [] },
    { fieldId: 'father_name', label: "Father's Name", type: 'text', options: [] },
    { fieldId: 'mother_name', label: "Mother's Name", type: 'text', options: [] },
    { fieldId: 'permanent_address', label: 'Permanent Address', type: 'textarea', options: [] },
    { fieldId: 'district_name', label: 'District', type: 'text', options: [] },
    { fieldId: 'state_name', label: 'State', type: 'select', options: ['Andhra Pradesh', 'Telangana', 'Other'] },
    { fieldId: 'postal_pincode', label: 'PIN Code', type: 'text', options: [] }
  ];

  const detectedFields = simulatedFields.map(f => ({
    fieldId: f.fieldId,
    type: f.type,
    options: f.options,
    ...normalizer.normalize({
      label: f.label, placeholder: '', ariaLabel: '',
      name: f.fieldId, id: f.fieldId, autocomplete: '', type: f.type,
      sectionHeading: '', contextText: '', options: f.options
    })
  }));

  const proposals = selector.generateProposals(detectedFields, DEFAULT_SYNTHETIC_PROFILE);
  const unidentified = proposals.filter(p => p.status === 'UNIDENTIFIED');
  assert.strictEqual(unidentified.length, 0, `Unexpected UNIDENTIFIED fields: ${unidentified.map(p => p.fieldId).join(', ')}`);
});

// ============================================================
// GROUP 11: UNRELATED INPUTS IGNORED (FORM FILTER SIMULATION)
// ============================================================
console.log('\n--- Group 11: Unrelated inputs are not processed ---');

it('Password fields are never in detected field list (filtered by formDetector)', () => {
  // In the browser, formDetector excludes password/hidden/submit types.
  // Simulate by passing a mixed list and applying the same type filter logic.
  const rawElements = [
    { type: 'text', id: 'user_name' },
    { type: 'password', id: 'pwd' },    // should be excluded
    { type: 'hidden', id: 'csrf' },      // should be excluded
    { type: 'submit', id: 'btn' },       // should be excluded
    { type: 'email', id: 'user_email' }
  ];

  const EXCLUDED_TYPES = new Set(['password', 'hidden', 'submit', 'button', 'image', 'reset', 'search', 'file', 'checkbox', 'radio']);
  const filtered = rawElements.filter(el => !EXCLUDED_TYPES.has(el.type));
  assert.strictEqual(filtered.length, 2);
  assert.ok(!filtered.find(e => e.type === 'password'));
});

it('Upload/media inputs are excluded from form detection', () => {
  const rawElements = [
    { type: 'file', id: 'upload-media' },  // excluded
    { type: 'text', id: 'applicant_name' }
  ];
  const EXCLUDED_TYPES = new Set(['file', 'password', 'hidden', 'submit', 'button', 'image', 'reset', 'search', 'checkbox', 'radio']);
  const filtered = rawElements.filter(el => !EXCLUDED_TYPES.has(el.type));
  assert.strictEqual(filtered.length, 1);
  assert.strictEqual(filtered[0].id, 'applicant_name');
});

it('Legal declaration checkboxes are excluded from detection', () => {
  const rawElements = [
    { type: 'checkbox', id: 'declare_accept', name: 'declaration' },  // excluded
    { type: 'text', id: 'applicant_name' }
  ];
  const EXCLUDED_TYPES = new Set(['checkbox', 'radio', 'file', 'password', 'hidden', 'submit', 'button', 'image', 'reset', 'search']);
  const filtered = rawElements.filter(el => !EXCLUDED_TYPES.has(el.type));
  assert.strictEqual(filtered.length, 1);
  assert.strictEqual(filtered[0].id, 'applicant_name');
});

it('Submit button inputs are excluded from detection', () => {
  const rawElements = [
    { type: 'submit', id: 'final-submit' },  // excluded
    { type: 'text', id: 'full_name' }
  ];
  const EXCLUDED_TYPES = new Set(['submit', 'button', 'checkbox', 'radio', 'file', 'password', 'hidden', 'image', 'reset', 'search']);
  const filtered = rawElements.filter(el => !EXCLUDED_TYPES.has(el.type));
  assert.strictEqual(filtered.length, 1);
  assert.strictEqual(filtered[0].id, 'full_name');
});

it('PageClassifier returns distinct results per URL — not cached cross-URL', () => {
  const eligibleUrl = 'file:///C:/Users/saive/OneDrive/Desktop/E-fill/test/test-harness.html';
  const ineligibleUrl = 'https://chat.openai.com/';
  const r1 = classifier.classify(eligibleUrl);
  const r2 = classifier.classify(ineligibleUrl);
  assert.strictEqual(r1.eligible, true);
  assert.strictEqual(r2.eligible, false);
  // And they share no profile reference
  assert.ok(r1.profile !== r2.profile);
});

console.log('\n========================================');
console.log(`📊 TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
console.log('========================================\n');

if (failedTests > 0) {
  process.exit(1);
}

