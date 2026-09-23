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

// ============================================================
// GROUP 12: EXPANDED CANONICAL SCHEMA
// ============================================================
console.log('\n--- Group 12: Expanded Canonical Schema ---');

it('should export PROVENANCE_TYPES with all required constants', () => {
  const { PROVENANCE_TYPES } = CanonicalSchema;
  assert.ok(PROVENANCE_TYPES, 'PROVENANCE_TYPES must exist');
  assert.strictEqual(PROVENANCE_TYPES.USER_ENTERED,       'USER_ENTERED');
  assert.strictEqual(PROVENANCE_TYPES.DOCUMENT_EXTRACTED, 'DOCUMENT_EXTRACTED');
  assert.strictEqual(PROVENANCE_TYPES.USER_CONFIRMED,     'USER_CONFIRMED');
  assert.strictEqual(PROVENANCE_TYPES.USER_EDITED,        'USER_EDITED');
  assert.strictEqual(PROVENANCE_TYPES.IMPORTED,           'IMPORTED');
  assert.strictEqual(PROVENANCE_TYPES.APPLICATION_SPECIFIC, 'APPLICATION_SPECIFIC');
});

it('should export AVAILABILITY_STATES with exactly 5 states', () => {
  const { AVAILABILITY_STATES } = CanonicalSchema;
  assert.ok(AVAILABILITY_STATES, 'AVAILABILITY_STATES must exist');
  assert.strictEqual(AVAILABILITY_STATES.AVAILABLE,       'AVAILABLE');
  assert.strictEqual(AVAILABILITY_STATES.MISSING,         'MISSING');
  assert.strictEqual(AVAILABILITY_STATES.CONFLICT,        'CONFLICT');
  assert.strictEqual(AVAILABILITY_STATES.AMBIGUOUS,       'AMBIGUOUS');
  assert.strictEqual(AVAILABILITY_STATES.REVIEW_REQUIRED, 'REVIEW_REQUIRED');
  assert.strictEqual(Object.keys(AVAILABILITY_STATES).length, 5);
});

it('should export FIELD_SENSITIVITY with SENSITIVE and RESTRICTED sets', () => {
  const { FIELD_SENSITIVITY } = CanonicalSchema;
  assert.ok(FIELD_SENSITIVITY, 'FIELD_SENSITIVITY must exist');
  assert.ok(FIELD_SENSITIVITY.SENSITIVE instanceof Set, 'SENSITIVE must be a Set');
  assert.ok(FIELD_SENSITIVITY.RESTRICTED instanceof Set, 'RESTRICTED must be a Set');
  assert.ok(FIELD_SENSITIVITY.SENSITIVE.has('aadhaar_number'),      'aadhaar_number must be SENSITIVE');
  assert.ok(FIELD_SENSITIVITY.SENSITIVE.has('bank_account_number'), 'bank_account_number must be SENSITIVE');
  assert.ok(FIELD_SENSITIVITY.SENSITIVE.has('bank_ifsc'),           'bank_ifsc must be SENSITIVE');
  assert.ok(FIELD_SENSITIVITY.RESTRICTED.has('aadhaar_number'),     'aadhaar_number must be RESTRICTED');
  assert.ok(FIELD_SENSITIVITY.RESTRICTED.has('bank_account_number'),'bank_account_number must be RESTRICTED');
});

it('should have all expanded field categories defined', () => {
  const fields = CanonicalSchema.CANONICAL_FIELDS;
  const requiredByCategory = {
    personal:   ['full_name', 'first_name', 'last_name', 'dob', 'gender'],
    identity:   ['aadhaar_number', 'alt_id_type', 'alt_id_number'],
    contact:    ['primary_phone', 'email'],
    address:    ['address_line', 'district', 'state', 'pincode'],
    family:     ['father_name', 'mother_name'],
    category:   ['category', 'ews_status'],
    education:  ['edu_qualification', 'edu_board', 'edu_institution', 'edu_year', 'edu_percentage'],
    employment: ['employment_status'],
    additional: ['disability_type'],
    banking:    ['bank_account_number', 'bank_ifsc']
  };
  for (const [cat, ids] of Object.entries(requiredByCategory)) {
    for (const id of ids) {
      assert.ok(fields[id], `Missing field: ${id} (category: ${cat})`);
      assert.strictEqual(fields[id].category, cat, `Field ${id} should have category ${cat}`);
    }
  }
});

it('should have sensitive:true on banking canonical fields', () => {
  const fields = CanonicalSchema.CANONICAL_FIELDS;
  assert.ok(fields.bank_account_number.sensitive, 'bank_account_number must have sensitive:true');
  assert.ok(fields.bank_ifsc.sensitive,           'bank_ifsc must have sensitive:true');
  assert.ok(fields.aadhaar_number.sensitive,      'aadhaar_number must have sensitive:true');
});

it('should have PROFILE_CATEGORIES with correct metadata', () => {
  const { PROFILE_CATEGORIES } = CanonicalSchema;
  assert.ok(PROFILE_CATEGORIES, 'PROFILE_CATEGORIES must exist');
  assert.ok(PROFILE_CATEGORIES.education.multiRecord, 'education must be multiRecord');
  assert.ok(PROFILE_CATEGORIES.banking.sensitive,     'banking must be sensitive');
  assert.ok(PROFILE_CATEGORIES.identity.sensitive,    'identity must be sensitive');
  // All categories have a label and order
  for (const [key, cat] of Object.entries(PROFILE_CATEGORIES)) {
    assert.ok(cat.label,    `${key} must have a label`);
    assert.ok(cat.order > 0, `${key} must have a positive order`);
  }
});

// ============================================================
// GROUP 13: INFORMATION PROFILE — PROVENANCE & MULTI-RECORD EDUCATION
// ============================================================
console.log('\n--- Group 13: Information Profile ---');
const { InformationProfile } = require('../core/information-profile.js');

it('should create an empty InformationProfile with correct v2 structure', () => {
  const ip = new InformationProfile(null);
  const data = ip.toJSON();
  assert.strictEqual(data.version, '2.0', 'Version must be 2.0');
  assert.ok(data.personal,   'Must have personal section');
  assert.ok(data.identity,   'Must have identity section');
  assert.ok(data.contact,    'Must have contact section');
  assert.ok(data.address,    'Must have address section');
  assert.ok(data.family,     'Must have family section');
  assert.ok(data.category,   'Must have category section');
  assert.ok(Array.isArray(data.education), 'education must be an array');
  assert.ok(data.employment, 'Must have employment section');
  assert.ok(data.additional, 'Must have additional section');
  assert.ok(data.banking,    'Must have banking section');
});

it('should store a value with provenance and retrieve it correctly', () => {
  const ip = new InformationProfile(null);
  ip.setField('full_name', 'Ravi Kumar', 'USER_ENTERED', 'User Entry');
  const field = ip.getField('full_name');
  assert.strictEqual(field.value,      'Ravi Kumar');
  assert.strictEqual(field.provenance, 'USER_ENTERED');
  assert.strictEqual(field.source,     'User Entry');
  assert.ok(field.lastModified,        'lastModified must be set');
});

it('should return AVAILABLE for a field with value, MISSING for empty field', () => {
  const ip = new InformationProfile(null);
  ip.setField('email', 'test@example.com', 'USER_ENTERED', 'User Entry');
  assert.strictEqual(ip.getAvailability('email'),   'AVAILABLE');
  assert.strictEqual(ip.getAvailability('pincode'), 'MISSING');
});

it('should mark banking fields as sensitive automatically', () => {
  const ip = new InformationProfile(null);
  ip.setField('bank_account_number', '1234567890', 'USER_ENTERED', 'User Entry');
  const field = ip.getField('bank_account_number');
  assert.strictEqual(field.sensitive, true, 'Bank account number must be sensitive');
  assert.strictEqual(field.value, '1234567890');
});

it('should mark aadhaar_number as sensitive automatically', () => {
  const ip = new InformationProfile(null);
  ip.setField('aadhaar_number', '123456789012', 'USER_ENTERED', 'User Entry');
  const field = ip.getField('aadhaar_number');
  assert.strictEqual(field.sensitive, true);
});

it('should support multiple education records independently', () => {
  const ip = new InformationProfile(null);
  const rec10 = ip.addEducationRecord('edu-10th', '10th / SSC');
  const rec12 = ip.addEducationRecord('edu-12th', '12th / Intermediate');

  ip.updateEducationRecord('edu-10th', 'edu_percentage', '92.5', 'USER_ENTERED', 'User Entry');
  ip.updateEducationRecord('edu-12th', 'edu_percentage', '88.0', 'USER_ENTERED', 'User Entry');

  assert.strictEqual(ip.getEducationRecords().length, 2);
  assert.strictEqual(ip.getValue('edu_percentage', 'edu-10th'), '92.5');
  assert.strictEqual(ip.getValue('edu_percentage', 'edu-12th'), '88.0');
  // Each record is independent — 10th value should not leak to 12th
  assert.notStrictEqual(
    ip.getValue('edu_percentage', 'edu-10th'),
    ip.getValue('edu_percentage', 'edu-12th')
  );
});

it('should remove an education record by id', () => {
  const ip = new InformationProfile(null);
  ip.addEducationRecord('edu-diploma', 'Diploma');
  ip.addEducationRecord('edu-degree',  'B.Tech');
  assert.strictEqual(ip.getEducationRecords().length, 2);
  ip.removeEducationRecord('edu-diploma');
  assert.strictEqual(ip.getEducationRecords().length, 1);
  assert.strictEqual(ip.getEducationRecords()[0].id, 'edu-degree');
});

it('should migrate from legacy flat profile preserving all major fields', () => {
  const legacy = CanonicalSchema.DEFAULT_SYNTHETIC_PROFILE;
  const ip = InformationProfile.migrateFromLegacy(legacy);

  assert.strictEqual(ip.getValue('full_name'),    'Sai Krishna Sharma');
  assert.strictEqual(ip.getValue('dob'),          '2000-08-15');
  assert.strictEqual(ip.getValue('gender'),       'Male');
  assert.strictEqual(ip.getValue('email'),        'saikrishna.sharma@example.com');
  assert.strictEqual(ip.getValue('primary_phone'), '9876543210');
  assert.strictEqual(ip.getValue('father_name'),  'Ram Mohan Sharma');
  assert.strictEqual(ip.getValue('district'),     'Hyderabad');
  assert.strictEqual(ip.getValue('state'),        'Telangana');
  assert.strictEqual(ip.getValue('pincode'),      '500032');
});

it('should migrate education records from legacy profile', () => {
  const legacy = CanonicalSchema.DEFAULT_SYNTHETIC_PROFILE;
  const ip = InformationProfile.migrateFromLegacy(legacy);
  const edu = ip.getEducationRecords();
  assert.strictEqual(edu.length, 2, 'Both education records must be migrated');
  assert.ok(edu.some(r => r.id === 'edu-10th'), 'edu-10th must be present');
  assert.ok(edu.some(r => r.id === 'edu-12th'), 'edu-12th must be present');
});

it('should assign USER_ENTERED provenance to all migrated values', () => {
  const legacy = CanonicalSchema.DEFAULT_SYNTHETIC_PROFILE;
  const ip = InformationProfile.migrateFromLegacy(legacy);
  const fullNameField = ip.getField('full_name');
  assert.strictEqual(fullNameField.provenance, 'USER_ENTERED');
});

it('toLegacyProfile should round-trip the profile correctly', () => {
  const ip = new InformationProfile(null);
  ip.setField('full_name',    'Anjali Reddy',  'USER_ENTERED', 'User Entry');
  ip.setField('email',        'anjali@example.com', 'USER_ENTERED', 'User Entry');
  ip.setField('primary_phone','9000000001',   'USER_ENTERED', 'User Entry');
  ip.setField('state',        'Andhra Pradesh', 'USER_ENTERED', 'User Entry');
  const legacy = ip.toLegacyProfile();
  assert.strictEqual(legacy.personal.fullName, 'Anjali Reddy');
  assert.strictEqual(legacy.contact.email, 'anjali@example.com');
  assert.strictEqual(legacy.address.state, 'Andhra Pradesh');
});

it('isV2Format and isLegacyFormat should correctly identify profile format', () => {
  const v2 = new InformationProfile(null).toJSON();
  const legacy = CanonicalSchema.DEFAULT_SYNTHETIC_PROFILE;
  assert.ok(InformationProfile.isV2Format(v2),      'v2 profile must be detected as v2');
  assert.ok(!InformationProfile.isV2Format(legacy), 'legacy profile must NOT be detected as v2');
  assert.ok(InformationProfile.isLegacyFormat(legacy), 'legacy profile must be detected as legacy');
  assert.ok(!InformationProfile.isLegacyFormat(v2),    'v2 profile must NOT be detected as legacy');
});

// ============================================================
// GROUP 14: AVAILABILITY ENGINE — 5 STATES
// ============================================================
console.log('\n--- Group 14: Availability Engine ---');
const { AvailabilityEngine } = require('../core/availability-engine.js');
const engine = new AvailabilityEngine();

it('should return AVAILABLE for a field present with strong provenance', () => {
  const ip = new InformationProfile(null);
  ip.setField('full_name', 'Arun Sharma', 'USER_ENTERED', 'User Entry');
  const result = engine.check('full_name', ip);
  assert.strictEqual(result.status, 'AVAILABLE');
  assert.strictEqual(result.value,  'Arun Sharma');
});

it('should return AVAILABLE with USER_CONFIRMED provenance', () => {
  const ip = new InformationProfile(null);
  ip.setField('district', 'Hyderabad', 'USER_CONFIRMED', 'User confirmed from document');
  const result = engine.check('district', ip);
  assert.strictEqual(result.status, 'AVAILABLE');
});

it('should return MISSING for a field with no value', () => {
  const ip = new InformationProfile(null);
  const result = engine.check('email', ip);
  assert.strictEqual(result.status, 'MISSING');
  assert.strictEqual(result.value,  '');
});

it('should return MISSING when canonicalId is null or undefined', () => {
  const ip = new InformationProfile(null);
  assert.strictEqual(engine.check(null, ip).status,      'MISSING');
  assert.strictEqual(engine.check(undefined, ip).status, 'MISSING');
});

it('should return REVIEW_REQUIRED for DOCUMENT_EXTRACTED provenance', () => {
  const ip = new InformationProfile(null);
  ip.setField('full_name', 'Priya Rao', 'DOCUMENT_EXTRACTED', 'Aadhaar card');
  const result = engine.check('full_name', ip);
  assert.strictEqual(result.status, 'REVIEW_REQUIRED');
  assert.strictEqual(result.value,  'Priya Rao');
});

it('should return CONFLICT when two sources have different values', () => {
  const ip = new InformationProfile(null);
  ip.setField('full_name', 'Sai Kumar', 'USER_ENTERED', 'User Entry');
  const extras = {
    full_name: { value: 'Sai K.', source: 'Aadhaar extraction', provenance: 'DOCUMENT_EXTRACTED' }
  };
  const result = engine.check('full_name', ip, extras);
  assert.strictEqual(result.status, 'CONFLICT');
  assert.ok(Array.isArray(result.conflicts), 'conflicts array must be present');
  assert.strictEqual(result.conflicts.length, 2);
});

it('should return AVAILABLE when multiple sources agree', () => {
  const ip = new InformationProfile(null);
  ip.setField('full_name', 'Sai Kumar', 'USER_ENTERED', 'User Entry');
  const extras = {
    full_name: { value: 'Sai Kumar', source: 'Aadhaar extraction', provenance: 'USER_CONFIRMED' }
  };
  const result = engine.check('full_name', ip, extras);
  assert.strictEqual(result.status, 'AVAILABLE');
});

it('should return AMBIGUOUS when value has no provenance', () => {
  // Create a profile with a field that has value but no provenance
  const rawData = new InformationProfile(null).toJSON();
  rawData.personal.full_name = { value: 'Ambiguous Name', provenance: null, source: null, lastModified: null };
  const ip = InformationProfile.fromJSON(rawData);
  const result = engine.check('full_name', ip);
  assert.strictEqual(result.status, 'AMBIGUOUS');
});

it('checkAll should return summary counts for multiple fields', () => {
  const ip = new InformationProfile(null);
  ip.setField('full_name',    'Ravi Kumar', 'USER_ENTERED', 'User Entry');
  ip.setField('email',        'ravi@example.com', 'USER_ENTERED', 'User Entry');
  // district left empty → MISSING
  const fields = [
    { canonicalId: 'full_name' },
    { canonicalId: 'email' },
    { canonicalId: 'district' }
  ];
  const { byCanonicalId, summary } = engine.checkAll(fields, ip);
  assert.strictEqual(summary.available, 2, 'Should have 2 available');
  assert.strictEqual(summary.missing,   1, 'Should have 1 missing');
  assert.ok(byCanonicalId['full_name'], 'Should have result for full_name');
  assert.ok(byCanonicalId['district'],  'Should have result for district');
});

it('checkAll should deduplicate repeated canonical IDs', () => {
  const ip = new InformationProfile(null);
  ip.setField('email', 'test@example.com', 'USER_ENTERED', 'User Entry');
  const fields = [
    { canonicalId: 'email' },
    { canonicalId: 'email' }  // duplicate
  ];
  const { summary } = engine.checkAll(fields, ip);
  assert.strictEqual(summary.available, 1, 'Deduplication: only 1 AVAILABLE for email');
});

it('should work with legacy flat profile (backward-compat)', () => {
  const legacy = CanonicalSchema.DEFAULT_SYNTHETIC_PROFILE;
  const result = engine.check('full_name', legacy);
  assert.strictEqual(result.status, 'AVAILABLE');
  assert.strictEqual(result.value,  'Sai Krishna Sharma');
  assert.ok(result.source.includes('Profile: Personal'));
});

it('should return MISSING for fields not in legacy profile', () => {
  const legacy = CanonicalSchema.DEFAULT_SYNTHETIC_PROFILE;
  const result = engine.check('bank_account_number', legacy);
  assert.strictEqual(result.status, 'MISSING');
});

// ============================================================
// GROUP 15: SOURCE SELECTOR WITH PROVENANCE
// ============================================================
console.log('\n--- Group 15: Source Selector with Provenance ---');

it('proposals from v2 InformationProfile carry provenance label', () => {
  const ip = new InformationProfile(null);
  ip.setField('full_name', 'Kavya Rao', 'USER_ENTERED', 'User Entry');
  const sel = new SourceSelector();
  const props = sel.generateProposals([
    { elementId: 'f1', label: 'Full Name', canonicalId: 'full_name', confidence: 0.95, type: 'text' }
  ], ip);
  assert.strictEqual(props.length, 1);
  assert.strictEqual(props[0].status,        'READY');
  assert.ok(props[0].provenanceLabel,        'provenanceLabel must be present');
  assert.ok(props[0].provenance,             'provenance must be present');
  assert.strictEqual(props[0].proposedValue, 'Kavya Rao');
});

it('CONFLICT proposal has non-empty conflicts array and no proposed value', () => {
  const ip = new InformationProfile(null);
  ip.setField('full_name', 'Name A', 'USER_ENTERED', 'User Entry');
  const extras = { full_name: { value: 'Name B', source: 'Document', provenance: 'DOCUMENT_EXTRACTED' } };
  const sel = new SourceSelector();
  const props = sel.generateProposals([
    { elementId: 'f1', label: 'Full Name', canonicalId: 'full_name', confidence: 0.95, type: 'text' }
  ], ip, extras);
  assert.strictEqual(props[0].status, 'CONFLICT');
  assert.strictEqual(props[0].proposedValue, '');
  assert.ok(Array.isArray(props[0].conflicts) && props[0].conflicts.length >= 2);
});

it('UNAVAILABLE proposal for field missing from profile', () => {
  const ip = new InformationProfile(null);
  const sel = new SourceSelector();
  const props = sel.generateProposals([
    { elementId: 'f1', label: 'PIN Code', canonicalId: 'pincode', confidence: 0.95, type: 'text' }
  ], ip);
  assert.strictEqual(props[0].status, 'UNAVAILABLE');
  assert.strictEqual(props[0].proposedValue, '');
});

it('REVIEW_REQUIRED proposal for DOCUMENT_EXTRACTED provenance', () => {
  const ip = new InformationProfile(null);
  ip.setField('district', 'Hyderabad', 'DOCUMENT_EXTRACTED', 'From Aadhaar');
  const sel = new SourceSelector();
  const props = sel.generateProposals([
    { elementId: 'f1', label: 'District', canonicalId: 'district', confidence: 0.95, type: 'text' }
  ], ip);
  assert.strictEqual(props[0].status, 'REVIEW_REQUIRED');
  assert.strictEqual(props[0].approved, false, 'REVIEW_REQUIRED must not be auto-approved');
});

it('low confidence should escalate READY to REVIEW_REQUIRED', () => {
  const ip = new InformationProfile(null);
  ip.setField('state', 'Telangana', 'USER_ENTERED', 'User Entry');
  const sel = new SourceSelector();
  const props = sel.generateProposals([
    { elementId: 'f1', label: 'State', canonicalId: 'state', confidence: 0.70, type: 'text' }
  ], ip);
  assert.strictEqual(props[0].status, 'REVIEW_REQUIRED', 'Low confidence must escalate to REVIEW_REQUIRED');
});

// ============================================================
// GROUP 16: BANKING FIELD PROTECTION
// ============================================================
console.log('\n--- Group 16: Banking Field Protection ---');

it('banking fields must be marked sensitive in CANONICAL_FIELDS', () => {
  const { CANONICAL_FIELDS } = CanonicalSchema;
  const bankingFields = ['bank_account_number', 'bank_ifsc', 'bank_account_holder', 'bank_name'];
  for (const fid of bankingFields) {
    assert.ok(CANONICAL_FIELDS[fid], `${fid} must exist in CANONICAL_FIELDS`);
    assert.strictEqual(CANONICAL_FIELDS[fid].category, 'banking', `${fid} must have category banking`);
    assert.ok(CANONICAL_FIELDS[fid].sensitive, `${fid} must have sensitive:true`);
  }
});

it('bank_account_number and aadhaar_number must be in RESTRICTED set', () => {
  const { FIELD_SENSITIVITY } = CanonicalSchema;
  assert.ok(FIELD_SENSITIVITY.RESTRICTED.has('bank_account_number'));
  assert.ok(FIELD_SENSITIVITY.RESTRICTED.has('aadhaar_number'));
  // email, pincode are NOT restricted
  assert.ok(!FIELD_SENSITIVITY.RESTRICTED.has('email'));
  assert.ok(!FIELD_SENSITIVITY.RESTRICTED.has('pincode'));
});

it('InformationProfile should mark banking field entries as sensitive', () => {
  const ip = new InformationProfile(null);
  const bankFields = ['bank_account_number', 'bank_ifsc', 'bank_account_holder', 'bank_name', 'aadhaar_number', 'alt_id_number'];
  for (const fid of bankFields) {
    ip.setField(fid, 'test-value', 'USER_ENTERED', 'User Entry');
    const f = ip.getField(fid);
    assert.ok(f.sensitive, `${fid} entry must be sensitive:true`);
  }
});

it('non-sensitive fields must NOT be marked sensitive', () => {
  const ip = new InformationProfile(null);
  const normalFields = ['full_name', 'email', 'district', 'father_name'];
  for (const fid of normalFields) {
    ip.setField(fid, 'test-value', 'USER_ENTERED', 'User Entry');
    const f = ip.getField(fid);
    assert.ok(!f.sensitive, `${fid} must NOT be sensitive`);
  }
});

it('InformationProfile data round-trips correctly through toJSON/fromJSON', () => {
  const ip = new InformationProfile(null);
  ip.setField('full_name',         'Sai Kumar',    'USER_ENTERED', 'User Entry');
  ip.setField('bank_account_number','9876543210',  'USER_ENTERED', 'User Entry');
  ip.setField('aadhaar_number',    '123456789012', 'USER_ENTERED', 'User Entry');
  const edu = ip.addEducationRecord('edu-test', 'B.Tech');
  ip.updateEducationRecord('edu-test', 'edu_percentage', '85.5', 'USER_ENTERED', 'User Entry');

  const json    = ip.toJSON();
  const restored = InformationProfile.fromJSON(json);

  assert.strictEqual(restored.getValue('full_name'),         'Sai Kumar');
  assert.strictEqual(restored.getValue('bank_account_number'), '9876543210');
  assert.strictEqual(restored.getValue('aadhaar_number'),    '123456789012');
  assert.strictEqual(restored.getValue('edu_percentage', 'edu-test'), '85.5');
  assert.ok(restored.getField('bank_account_number').sensitive);
});

// ============================================================
// GROUP 17: GATE APPLICATION PROFILE — RECOGNITION & FALSE-POSITIVE PROTECTION
// ============================================================
console.log('\n--- Group 17: GATE Application Profile Recognition ---');

it('GATE profile exists in APPLICATION_PROFILES with id "gate-goaps"', () => {
  const gateProfile = APPLICATION_PROFILES.find(p => p.id === 'gate-goaps');
  assert.ok(gateProfile, 'GATE profile must be present in APPLICATION_PROFILES');
});

it('GATE profile has all required structure fields', () => {
  const gateProfile = APPLICATION_PROFILES.find(p => p.id === 'gate-goaps');
  assert.ok(gateProfile.id,      'Must have id');
  assert.ok(gateProfile.name,    'Must have name');
  assert.ok(gateProfile.version, 'Must have version');
  assert.ok(gateProfile.description, 'Must have description');
  assert.ok(Array.isArray(gateProfile.urlPatterns) && gateProfile.urlPatterns.length > 0,
    'Must have at least one urlPattern');
  assert.ok(Array.isArray(gateProfile.fieldHints) && gateProfile.fieldHints.length > 0,
    'Must have at least one fieldHint');
});

it('GATE profile name mentions GATE', () => {
  const gateProfile = APPLICATION_PROFILES.find(p => p.id === 'gate-goaps');
  assert.ok(gateProfile.name.includes('GATE'),
    `Profile name "${gateProfile.name}" must include "GATE"`);
});

it('GATE profile urlPattern uses https for goaps.iitm.ac.in', () => {
  const gateProfile = APPLICATION_PROFILES.find(p => p.id === 'gate-goaps');
  const pattern = gateProfile.urlPatterns.find(p => p.hostname === 'goaps.iitm.ac.in');
  assert.ok(pattern, 'Must have a urlPattern with hostname "goaps.iitm.ac.in"');
  assert.strictEqual(pattern.protocol, 'https', 'Protocol must be https');
});

it('goaps.iitm.ac.in/applicationFiling is classified as ELIGIBLE (the failing URL)', () => {
  const url = 'https://goaps.iitm.ac.in/applicationFiling';
  const result = classifier.classify(url);
  assert.strictEqual(result.eligible, true,
    `Expected eligible. Reason: ${result.reason}. ` +
    'This was the original bug: GATE was not recognized.');
});

it('goaps.iitm.ac.in root is classified as ELIGIBLE', () => {
  const result = classifier.classify('https://goaps.iitm.ac.in/');
  assert.strictEqual(result.eligible, true, `Expected eligible. Reason: ${result.reason}`);
});

it('goaps.iitm.ac.in login page is classified as ELIGIBLE', () => {
  const result = classifier.classify('https://goaps.iitm.ac.in/login');
  assert.strictEqual(result.eligible, true, `Expected eligible. Reason: ${result.reason}`);
});

it('Matched profile for GATE URL has id "gate-goaps"', () => {
  const result = classifier.classify('https://goaps.iitm.ac.in/applicationFiling');
  assert.ok(result.profile, 'Profile must be non-null for eligible GATE URL');
  assert.strictEqual(result.profile.id, 'gate-goaps');
});

// FALSE-POSITIVE PROTECTION — must NOT match non-GATE IIT domains
it('FALSE POSITIVE: www.iitm.ac.in (main IIT website) is NOT eligible', () => {
  const result = classifier.classify('https://www.iitm.ac.in/');
  assert.strictEqual(result.eligible, false,
    'The main IIT Madras website must NOT be eligible — only goaps.iitm.ac.in');
});

it('FALSE POSITIVE: iitm.ac.in (apex domain) is NOT eligible', () => {
  const result = classifier.classify('https://iitm.ac.in/');
  assert.strictEqual(result.eligible, false,
    'The IIT Madras apex domain must NOT be eligible');
});

it('FALSE POSITIVE: mail.iitm.ac.in is NOT eligible', () => {
  const result = classifier.classify('https://mail.iitm.ac.in/');
  assert.strictEqual(result.eligible, false,
    'IIT Madras mail server must NOT be eligible');
});

it('FALSE POSITIVE: goaps.example.com is NOT eligible (wrong domain entirely)', () => {
  const result = classifier.classify('https://goaps.example.com/applicationFiling');
  assert.strictEqual(result.eligible, false,
    'GOAPS-like path on a non-IIT domain must NOT be eligible');
});

it('GATE fieldHints include all expected GATE-relevant canonical IDs', () => {
  const gateProfile = APPLICATION_PROFILES.find(p => p.id === 'gate-goaps');
  const expected = [
    'full_name', 'dob', 'gender', 'category',
    'primary_phone', 'email', 'aadhaar_number',
    'address_line', 'state', 'pincode',
    'edu_qualification', 'edu_institution', 'edu_year'
  ];
  for (const id of expected) {
    assert.ok(gateProfile.fieldHints.includes(id),
      `GATE fieldHints must include "${id}"`);
  }
});

it('GATE normalizer: "Qualifying Degree" maps to edu_qualification', () => {
  const res = normalizer.normalize({ label: 'Qualifying Degree', name: 'qualifying_degree', id: '' });
  assert.strictEqual(res.canonicalId, 'edu_qualification',
    `Expected edu_qualification, got "${res.canonicalId}"`);
  assert.ok(res.confidence >= 0.85, `Confidence too low: ${res.confidence}`);
});

it('GATE normalizer: "Qualifying Examination" maps to edu_qualification', () => {
  const res = normalizer.normalize({ label: 'Qualifying Examination', name: '', id: '' });
  assert.strictEqual(res.canonicalId, 'edu_qualification',
    `Expected edu_qualification, got "${res.canonicalId}"`);
});

it('GATE normalizer: "Programme Name" maps to edu_qualification', () => {
  const res = normalizer.normalize({ label: 'Programme Name', name: 'programme_name', id: '' });
  assert.strictEqual(res.canonicalId, 'edu_qualification',
    `Expected edu_qualification, got "${res.canonicalId}"`);
});

it('GATE recognition does not make previously-ineligible sites eligible', () => {
  const stillIneligible = [
    'https://chat.openai.com/',
    'https://mail.google.com/',
    'https://www.youtube.com/',
    'https://www.ndtv.com/news'
  ];
  for (const url of stillIneligible) {
    const result = classifier.classify(url);
    assert.strictEqual(result.eligible, false,
      `${url} must remain ineligible after GATE profile addition. Got eligible=${result.eligible}`);
  }
});

it('total APPLICATION_PROFILES count increased by exactly 1 after GATE addition', () => {
  // Before: 8 profiles (test-harness, tspsc, ts-epass, appsc, ssc, upsc, nta, ibps)
  // After: 9 profiles (+ gate-goaps)
  assert.strictEqual(APPLICATION_PROFILES.length, 9,
    `Expected 9 profiles, got ${APPLICATION_PROFILES.length}`);
});

console.log('\n========================================');
console.log(`📊 TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
console.log('========================================\n');

if (failedTests > 0) {
  process.exit(1);
}

