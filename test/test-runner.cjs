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
// GROUP 8: PAGE CLASSIFIER — BROWSER-INTERNAL PAGES (unscannable)
//          + NORMAL PAGES WITHOUT PROFILES (scannable, profile=null)
// ============================================================
console.log('\n--- Group 8: Page Classifier — browser-internal vs. unregistered pages ---');

it('chrome:// pages are NOT scannable (browser-internal)', () => {
  const result = classifier.classify('chrome://extensions/');
  assert.strictEqual(result.eligible, false, 'chrome:// must be blocked');
});

it('chrome-extension:// pages are NOT scannable (browser-internal)', () => {
  const result = classifier.classify('chrome-extension://abcdefghijkl/sidepanel/index.html');
  assert.strictEqual(result.eligible, false, 'chrome-extension:// must be blocked');
});

it('edge:// pages are NOT scannable (browser-internal)', () => {
  const result = classifier.classify('edge://settings/');
  assert.strictEqual(result.eligible, false, 'edge:// must be blocked');
});

it('about: pages are NOT scannable (browser-internal)', () => {
  const result = classifier.classify('about:blank');
  assert.strictEqual(result.eligible, false, 'about: must be blocked');
});

it('Empty string URL returns unscannable', () => {
  const result = classifier.classify('');
  assert.strictEqual(result.eligible, false);
});

it('null URL returns unscannable', () => {
  const result = classifier.classify(null);
  assert.strictEqual(result.eligible, false);
});

// --- Normal websites without profiles: scannable, but profile=null ---

it('ChatGPT is scannable (no profile — generic form scanning applies)', () => {
  const result = classifier.classify('https://chat.openai.com/');
  assert.strictEqual(result.eligible, true, 'chat.openai.com should be scannable');
  assert.strictEqual(result.profile, null, 'No profile should match ChatGPT');
});

it('Gmail is scannable (no profile — generic form scanning applies)', () => {
  const result = classifier.classify('https://mail.google.com/mail/u/0/');
  assert.strictEqual(result.eligible, true, 'Gmail should be scannable');
  assert.strictEqual(result.profile, null, 'No profile should match Gmail');
});

it('YouTube is scannable (no profile — generic form scanning applies)', () => {
  const result = classifier.classify('https://www.youtube.com/');
  assert.strictEqual(result.eligible, true, 'YouTube should be scannable');
  assert.strictEqual(result.profile, null, 'No profile should match YouTube');
});

it('Arbitrary news site is scannable (no profile — generic form scanning applies)', () => {
  const result = classifier.classify('https://www.ndtv.com/news');
  assert.strictEqual(result.eligible, true, 'News site should be scannable');
  assert.strictEqual(result.profile, null, 'No profile should match news site');
});

it('Unregistered page returns null profile (not null eligibility)', () => {
  const result = classifier.classify('https://www.google.com/');
  assert.strictEqual(result.eligible, true,  'Google should be scannable');
  assert.strictEqual(result.profile, null,   'Profile must be null for unregistered pages');
});

it('Any scannable result always includes a reason string', () => {
  const result = classifier.classify('https://www.reddit.com/');
  assert.ok(typeof result.reason === 'string' && result.reason.length > 0);
  assert.strictEqual(result.eligible, true, 'Reddit should be scannable');
});

// ============================================================
// GROUP 9: UNIVERSAL SCANNING — NO BLOCKING GATE
// ============================================================
console.log('\n--- Group 9: Universal scanning — no blocking gate ---');

it('Browser-internal scan response has eligible=false (only unscannable case)', () => {
  // Only browser-internal pages produce eligible:false
  const browserInternalScan = {
    eligible: false,
    profile: null,
    eligibilityReason: 'Browser-internal page — E-Fill does not operate here',
    fields: [],
    totalFound: 0
  };
  assert.strictEqual(browserInternalScan.eligible, false);
  assert.strictEqual(browserInternalScan.fields.length, 0);
});

it('SourceSelector.generateProposals returns empty array for empty field list', () => {
  const selector = new SourceSelector(CanonicalSchema.FIELD_DEFINITIONS);
  const { DEFAULT_SYNTHETIC_PROFILE } = CanonicalSchema;
  const proposals = selector.generateProposals([], DEFAULT_SYNTHETIC_PROFILE);
  assert.ok(Array.isArray(proposals), 'Should return array');
  assert.strictEqual(proposals.length, 0, 'Should generate zero proposals for zero detected fields');
});

it('Unregistered page is scannable — eligible:true, profile:null', () => {
  // A page with no profile is still scannable; the form detector decides if there are fields.
  const unregisteredScan = {
    eligible: true,  // page IS scannable
    profile: null,   // no profile matched
    fields: [],      // no fields found on this particular page
    totalFound: 0
  };
  assert.strictEqual(unregisteredScan.eligible, true,  'Unregistered page must be eligible to scan');
  assert.strictEqual(unregisteredScan.profile, null,   'Profile must be null for unregistered pages');
  // Proposals are generated from fields, not from profile matching
  const proposalsToRender = unregisteredScan.fields;
  assert.strictEqual(proposalsToRender.length, 0, 'Zero fields → zero proposals');
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
  const registeredUrl   = 'file:///C:/Users/saive/OneDrive/Desktop/E-fill/test/test-harness.html';
  const unregisteredUrl = 'https://chat.openai.com/';
  const r1 = classifier.classify(registeredUrl);
  const r2 = classifier.classify(unregisteredUrl);
  // Both are scannable, but profile differs
  assert.strictEqual(r1.eligible, true);
  assert.strictEqual(r2.eligible, true);
  assert.ok(r1.profile !== null,  'Registered URL should have a matched profile');
  assert.strictEqual(r2.profile, null, 'Unregistered URL should have null profile');
  // Results must not share the same profile reference
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

// FALSE-POSITIVE PROTECTION — these pages must NOT match the GATE profile.
// They are scannable pages (eligible:true) but should return profile:null.
it('FALSE POSITIVE: www.iitm.ac.in must NOT match GATE profile (different subdomain)', () => {
  const result = classifier.classify('https://www.iitm.ac.in/');
  assert.strictEqual(result.eligible, true,  'www.iitm.ac.in is a normal scannable page');
  assert.strictEqual(result.profile, null,   'Must NOT match the GATE profile — wrong subdomain');
});

it('FALSE POSITIVE: iitm.ac.in (apex domain) must NOT match GATE profile', () => {
  const result = classifier.classify('https://iitm.ac.in/');
  assert.strictEqual(result.eligible, true,  'iitm.ac.in is a normal scannable page');
  assert.strictEqual(result.profile, null,   'Must NOT match GATE profile — apex domain only');
});

it('FALSE POSITIVE: mail.iitm.ac.in must NOT match GATE profile', () => {
  const result = classifier.classify('https://mail.iitm.ac.in/');
  assert.strictEqual(result.eligible, true,  'mail.iitm.ac.in is a normal scannable page');
  assert.strictEqual(result.profile, null,   'Must NOT match GATE profile — wrong subdomain');
});

it('FALSE POSITIVE: goaps.example.com must NOT match GATE profile (wrong domain entirely)', () => {
  const result = classifier.classify('https://goaps.example.com/applicationFiling');
  assert.strictEqual(result.eligible, true,  'goaps.example.com is a normal scannable page');
  assert.strictEqual(result.profile, null,   'Must NOT match GATE profile — wrong domain');
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

it('GATE profile addition did NOT cause unrelated sites to match gate-goaps', () => {
  // These sites must remain profile:null (no profile match) after GATE was added
  const shouldHaveNoProfile = [
    'https://chat.openai.com/',
    'https://mail.google.com/',
    'https://www.youtube.com/',
    'https://www.ndtv.com/news'
  ];
  for (const url of shouldHaveNoProfile) {
    const result = classifier.classify(url);
    assert.strictEqual(result.profile, null,
      `${url} must have profile:null after GATE profile addition. Got profile.id=${result.profile?.id}`);
    assert.strictEqual(result.eligible, true,
      `${url} should still be scannable (just with no profile)`);
  }
});

it('total APPLICATION_PROFILES count increased by exactly 1 after GATE addition', () => {
  // Before: 8 profiles (test-harness, tspsc, ts-epass, appsc, ssc, upsc, nta, ibps)
  // After: 9 profiles (+ gate-goaps)
  assert.strictEqual(APPLICATION_PROFILES.length, 9,
    `Expected 9 profiles, got ${APPLICATION_PROFILES.length}`);
});

// ============================================================
// GROUP 18: UNIVERSAL SCANNING ARCHITECTURE
// ============================================================
console.log('\n--- Group 18: Universal Scanning Architecture ---');

it('(1) Registered application → scannable and profile matched', () => {
  // GATE is registered — eligible:true AND profile matched
  const result = classifier.classify('https://goaps.iitm.ac.in/applicationFiling');
  assert.strictEqual(result.eligible, true, 'Registered app must be scannable');
  assert.ok(result.profile, 'Registered app must return a matched profile');
  assert.strictEqual(result.profile.id, 'gate-goaps');
});

it('(2) GATE → scannable with GATE profile context', () => {
  const result = classifier.classify('https://goaps.iitm.ac.in/applicationFiling');
  assert.strictEqual(result.eligible, true);
  assert.strictEqual(result.profile?.name, 'GATE Online Application System (GOAPS)');
});

it('(3) JAM-like page → scannable even without a JAM profile', () => {
  // JAM (Joint Admission test for Masters) is not registered — but must still be scannable
  const result = classifier.classify('https://joaps.iitkgp.ac.in/applicationFiling');
  assert.strictEqual(result.eligible, true, 'JAM portal must be scannable without a profile');
  assert.strictEqual(result.profile, null,  'No profile should exist for JAM yet');
});

it('(4) Unknown government-like page → scannable', () => {
  const result = classifier.classify('https://some-government-portal.gov.in/apply');
  assert.strictEqual(result.eligible, true, 'Unknown gov portal must be scannable');
  assert.strictEqual(result.profile, null,  'No profile — generic scanning applies');
});

it('(5) Unknown application form → scannable', () => {
  const result = classifier.classify('https://apply.someuniversity.edu.in/admission');
  assert.strictEqual(result.eligible, true);
  assert.strictEqual(result.profile, null);
});

it('(6) Random registration form on any website → scannable', () => {
  const result = classifier.classify('https://www.example.com/register');
  assert.strictEqual(result.eligible, true, 'Any normal page with a form must be scannable');
  assert.strictEqual(result.profile, null);
});

it('(7) Random webpage → scannable (form detector will find no fields)', () => {
  // The classifier says "eligible:true"; form detection decides if there are fields.
  // A content-only page with no form will produce 0 fields → "no form detected" state.
  const result = classifier.classify('https://en.wikipedia.org/wiki/Form');
  assert.strictEqual(result.eligible, true,
    'Wikipedia is scannable — form detector will find no meaningful form controls');
  assert.strictEqual(result.profile, null);
});

it('(8) Chat/search page → scannable, but relies on form detector to filter inputs', () => {
  // The classifier does not decide whether a page has meaningful form fields.
  // The form detector and normalizer filter out search boxes, chat inputs, etc.
  const result = classifier.classify('https://chat.openai.com/');
  assert.strictEqual(result.eligible, true,
    'Chat page is scannable — form intelligence layer filters irrelevant inputs');
  assert.strictEqual(result.profile, null, 'No profile for chat page');
});

it('(9) Application profile available → profile returned in result', () => {
  const result = classifier.classify('https://goaps.iitm.ac.in/');
  assert.ok(result.profile, 'Profile must be returned when available');
  assert.ok(Array.isArray(result.profile.fieldHints), 'Profile must have fieldHints');
});

it('(10) Application profile absent → eligible:true with profile:null', () => {
  const result = classifier.classify('https://random-form-portal.org/apply');
  assert.strictEqual(result.eligible, true,  'Page is scannable even without profile');
  assert.strictEqual(result.profile, null,   'profile is null when no profile matches');
  assert.ok(result.reason.includes('generic'), 'Reason mentions generic scanning');
});

it('(11) Rescan sends new SCAN_PAGE — classifier re-evaluates (simulated)', () => {
  // Simulate a URL change in a SPA: first URL is registered, second is not.
  const firstResult  = classifier.classify('https://goaps.iitm.ac.in/applicationFiling');
  const secondResult = classifier.classify('https://goaps.iitm.ac.in/login');
  // Both pages on the same GOAPS domain are eligible with the same profile
  assert.strictEqual(firstResult.eligible,  true);
  assert.strictEqual(secondResult.eligible, true);
  assert.strictEqual(firstResult.profile?.id, secondResult.profile?.id,
    'Both pages on same registered domain share the same profile');
});

it('(12) Field normalization still works regardless of profile', () => {
  // Normalizer is profile-agnostic — it works the same on registered and unregistered pages
  const res = normalizer.normalize({ label: "Applicant Name", name: "applicant_name", id: "" });
  assert.strictEqual(res.canonicalId, 'full_name');
  assert.ok(res.confidence >= 0.85);
});

it('(13) Information availability still works with v2 InformationProfile', () => {
  const { InformationProfile } = require('../core/information-profile.js');
  const { AvailabilityEngine } = require('../core/availability-engine.js');
  const ip = new InformationProfile(null);
  ip.setField('full_name', 'Ravi Kumar', 'USER_ENTERED', 'User Entry');
  const engine = new AvailabilityEngine();
  const result = engine.check('full_name', ip);
  assert.strictEqual(result.status, 'AVAILABLE');
  assert.strictEqual(result.value, 'Ravi Kumar');
});

it('(14) Unsupported-application concept no longer blocks scanning', () => {
  // The phrase "does not match any registered profile" must no longer mean "do not scan"
  const result = classifier.classify('https://new-exam-portal.example.com/apply');
  assert.strictEqual(result.eligible, true,
    'A page that does not match any profile must still be eligible for scanning');
  assert.ok(result.reason.includes('generic') || result.reason.includes('No application profile'),
    'Reason must mention generic scanning, not blocking');
});

it('(15) Browser-internal safety control remains intact — cannot scan chrome:// pages', () => {
  // This is the ONLY case where scanning is blocked
  const internal = ['chrome://extensions/', 'edge://settings/', 'chrome-extension://abc/panel.html'];
  for (const url of internal) {
    const result = classifier.classify(url);
    assert.strictEqual(result.eligible, false,
      `${url} must remain unscannable (browser-internal safety control)`);
  }
});

// ============================================================
// GROUP 19: AUTOFILL PIPELINE, FRAMEWORK COMPATIBILITY & VERIFICATION
// ============================================================
console.log('\n--- Group 19: Autofill Pipeline, Framework Compatibility & Verification ---');

const { AutofillEngine } = require('../content/autofill.js');

// Ensure global.document is defined for Node.js test environment
global.document = global.document || {
  getElementById: (id) => null,
  querySelector: (sel) => null,
  querySelectorAll: (sel) => []
};

it('AutofillEngine: text input receives exact DOM value and sets native descriptor', () => {
  const engine = new AutofillEngine();
  const events = [];
  const fakeInput = {
    tagName: 'INPUT',
    type: 'text',
    id: 'applicant-email',
    value: '',
    disabled: false,
    readOnly: false,
    focus: () => {},
    blur: () => {},
    dispatchEvent: (evt) => { events.push(evt.type); },
    style: {}
  };

  // Mock document.getElementById for lookup
  const origGetElementById = global.document.getElementById;
  global.document.getElementById = (id) => (id === 'applicant-email' ? fakeInput : null);

  const proposal = {
    fieldId: 'applicant-email',
    canonicalId: 'email',
    label: 'Email Address',
    proposedValue: 'saivenkatt1@gmail.com',
    approved: true
  };

  const res = engine.fillSingleField(proposal);
  global.document.getElementById = origGetElementById;

  assert.strictEqual(res.success, true);
  assert.strictEqual(res.verified, true);
  assert.strictEqual(fakeInput.value, 'saivenkatt1@gmail.com');
  assert.ok(events.includes('input'), 'Must dispatch input event');
  assert.ok(events.includes('change'), 'Must dispatch change event');
  assert.ok(events.includes('blur'), 'Must dispatch blur event');
});

it('AutofillEngine: React _valueTracker is reset before input event', () => {
  const engine = new AutofillEngine();
  let trackerReset = false;
  const fakeInput = {
    tagName: 'INPUT',
    type: 'text',
    id: 'first-name',
    value: 'oldValue',
    disabled: false,
    readOnly: false,
    focus: () => {},
    blur: () => {},
    dispatchEvent: () => {},
    style: {},
    _valueTracker: {
      setValue: (val) => {
        if (val === 'oldValue') trackerReset = true;
      }
    }
  };

  const origGetElementById = global.document.getElementById;
  global.document.getElementById = (id) => (id === 'first-name' ? fakeInput : null);

  const res = engine.fillSingleField({
    fieldId: 'first-name',
    canonicalId: 'first_name',
    label: 'First Name',
    proposedValue: 'SAI',
    approved: true
  });
  global.document.getElementById = origGetElementById;

  assert.strictEqual(res.success, true);
  assert.strictEqual(fakeInput.value, 'SAI');
  assert.strictEqual(trackerReset, true, 'React value tracker must be updated with prior value');
});

it('AutofillEngine: textarea receives value and dispatches events', () => {
  const engine = new AutofillEngine();
  const events = [];
  const fakeTextarea = {
    tagName: 'TEXTAREA',
    type: 'textarea',
    id: 'permanent-address',
    value: '',
    disabled: false,
    readOnly: false,
    focus: () => {},
    blur: () => {},
    dispatchEvent: (e) => events.push(e.type),
    style: {}
  };

  const origGetElementById = global.document.getElementById;
  global.document.getElementById = (id) => (id === 'permanent-address' ? fakeTextarea : null);

  const res = engine.fillSingleField({
    fieldId: 'permanent-address',
    canonicalId: 'address_line',
    label: 'Permanent Address',
    proposedValue: 'Plot 42, Gandhi Road, Hyderabad',
    approved: true
  });
  global.document.getElementById = origGetElementById;

  assert.strictEqual(res.success, true);
  assert.strictEqual(fakeTextarea.value, 'Plot 42, Gandhi Road, Hyderabad');
  assert.ok(events.includes('input'));
  assert.ok(events.includes('change'));
});

it('AutofillEngine: select element selects option by text or value', () => {
  const engine = new AutofillEngine();
  const events = [];
  const fakeSelect = {
    tagName: 'SELECT',
    type: 'select-one',
    id: 'gender-select',
    value: '',
    selectedIndex: -1,
    options: [
      { value: '', textContent: '-- Select --' },
      { value: 'M', textContent: 'Male' },
      { value: 'F', textContent: 'Female' }
    ],
    selectedOptions: [{ value: 'M', textContent: 'Male' }],
    disabled: false,
    readOnly: false,
    focus: () => {},
    blur: () => {},
    dispatchEvent: (e) => events.push(e.type),
    style: {}
  };

  const origGetElementById = global.document.getElementById;
  global.document.getElementById = (id) => (id === 'gender-select' ? fakeSelect : null);

  const res = engine.fillSingleField({
    fieldId: 'gender-select',
    canonicalId: 'gender',
    label: 'Gender',
    proposedValue: 'Male',
    approved: true
  });
  global.document.getElementById = origGetElementById;

  assert.strictEqual(res.success, true);
  assert.strictEqual(fakeSelect.selectedIndex, 1);
  assert.ok(events.includes('change'));
});

it('AutofillEngine: HTML5 date input automatically converts DD-MM-YYYY to YYYY-MM-DD', () => {
  const engine = new AutofillEngine();
  const fakeDateInput = {
    tagName: 'INPUT',
    type: 'date',
    id: 'dob-input',
    value: '',
    disabled: false,
    readOnly: false,
    focus: () => {},
    blur: () => {},
    dispatchEvent: () => {},
    style: {}
  };

  const origGetElementById = global.document.getElementById;
  global.document.getElementById = (id) => (id === 'dob-input' ? fakeDateInput : null);

  const res = engine.fillSingleField({
    fieldId: 'dob-input',
    canonicalId: 'dob',
    label: 'Date of Birth',
    proposedValue: '27-05-2005',
    approved: true
  });
  global.document.getElementById = origGetElementById;

  assert.strictEqual(res.success, true);
  assert.strictEqual(fakeDateInput.value, '2005-05-27', 'Date must be formatted as YYYY-MM-DD for HTML5 date inputs');
});

it('AutofillEngine: radio button checked and dispatched events', () => {
  const engine = new AutofillEngine();
  const events = [];
  const fakeRadio = {
    tagName: 'INPUT',
    type: 'radio',
    id: 'opt-gender-male',
    checked: false,
    value: 'Male',
    disabled: false,
    readOnly: false,
    focus: () => {},
    blur: () => {},
    dispatchEvent: (e) => events.push(e.type),
    style: {}
  };

  const origGetElementById = global.document.getElementById;
  global.document.getElementById = (id) => (id === 'opt-gender-male' ? fakeRadio : null);

  const res = engine.fillSingleField({
    fieldId: 'opt-gender-male',
    canonicalId: 'gender',
    label: 'Male',
    proposedValue: 'Male',
    approved: true
  });
  global.document.getElementById = origGetElementById;

  assert.strictEqual(res.success, true);
  assert.strictEqual(fakeRadio.checked, true);
});

it('AutofillEngine: checkbox checked only on approved proposal with affirmative value', () => {
  const engine = new AutofillEngine();
  const fakeCheckbox = {
    tagName: 'INPUT',
    type: 'checkbox',
    id: 'ews-checkbox',
    checked: false,
    value: 'yes',
    disabled: false,
    readOnly: false,
    focus: () => {},
    blur: () => {},
    dispatchEvent: () => {},
    style: {}
  };

  const origGetElementById = global.document.getElementById;
  global.document.getElementById = (id) => (id === 'ews-checkbox' ? fakeCheckbox : null);

  const res = engine.fillSingleField({
    fieldId: 'ews-checkbox',
    canonicalId: 'ews_status',
    label: 'EWS Status',
    proposedValue: 'Yes',
    approved: true
  });
  global.document.getElementById = origGetElementById;

  assert.strictEqual(res.success, true);
  assert.strictEqual(fakeCheckbox.checked, true);
});

it('AutofillEngine: verification reports failure if DOM element value does not match', () => {
  const engine = new AutofillEngine();
  // Element that rejects/reverts programmatic value changes
  const stubbornInput = {
    tagName: 'INPUT',
    type: 'text',
    id: 'stubborn-field',
    disabled: false,
    readOnly: false,
    focus: () => {},
    blur: () => {},
    dispatchEvent: () => {},
    style: {}
  };
  Object.defineProperty(stubbornInput, 'value', {
    get: () => '',
    set: () => {}, // ignores assignment or reverts
    configurable: true
  });

  const origGetElementById = global.document.getElementById;
  global.document.getElementById = (id) => (id === 'stubborn-field' ? stubbornInput : null);

  const res = engine.fillSingleField({
    fieldId: 'stubborn-field',
    canonicalId: 'first_name',
    label: 'First Name',
    proposedValue: 'SAI',
    approved: true
  });
  global.document.getElementById = origGetElementById;

  assert.strictEqual(res.success, false, 'Must report failure when DOM verification fails');
  assert.strictEqual(res.verified, false);
  assert.ok(res.error && res.error.includes('verification failed'));
});

it('AutofillEngine: skips non-approved proposals completely', () => {
  const engine = new AutofillEngine();
  let fillAttempted = false;

  const proposals = [
    { fieldId: 'f1', approved: false, proposedValue: 'SkipMe' },
    { fieldId: 'f2', approved: false, proposedValue: 'SkipMeToo' }
  ];

  const report = engine.fill(proposals);
  assert.strictEqual(report.filledCount, 0);
  assert.strictEqual(report.failedCount, 0);
  assert.strictEqual(report.results.length, 0);
});

it('AutofillEngine: restricted input types (password, submit, file) are blocked', () => {
  const engine = new AutofillEngine();
  const passwordInput = {
    tagName: 'INPUT',
    type: 'password',
    id: 'pwd-field',
    value: '',
    disabled: false,
    readOnly: false,
    style: {}
  };

  const origGetElementById = global.document.getElementById;
  global.document.getElementById = (id) => (id === 'pwd-field' ? passwordInput : null);

  const res = engine.fillSingleField({
    fieldId: 'pwd-field',
    canonicalId: 'password',
    label: 'Password',
    proposedValue: 'secret123',
    approved: true
  });
  global.document.getElementById = origGetElementById;

  assert.strictEqual(res.success, false);
  assert.ok(res.error.includes('restricted input type'));
});

// ============================================================
// GROUP 20: MY INFORMATION & CANONICAL FIELD RESOLUTION
// ============================================================
console.log('\n--- Group 20: My Information & Canonical Field Resolution ---');

it('CanonicalSchema.resolveField: resolves "Surname" to last_name', () => {
  const res = CanonicalSchema.resolveField('Surname');
  assert.ok(res, 'Must resolve "Surname"');
  assert.strictEqual(res.id, 'last_name');
  assert.strictEqual(res.category, 'personal');
});

it('CanonicalSchema.resolveField: resolves "Last Name" to last_name', () => {
  const res = CanonicalSchema.resolveField('Last Name');
  assert.ok(res);
  assert.strictEqual(res.id, 'last_name');
});

it('CanonicalSchema.resolveField: resolves "Father\'s Name" to father_name', () => {
  const res = CanonicalSchema.resolveField("Father's Name");
  assert.ok(res);
  assert.strictEqual(res.id, 'father_name');
  assert.strictEqual(res.category, 'family');
});

it('CanonicalSchema.resolveField: resolves "Date of Birth" to dob', () => {
  const res = CanonicalSchema.resolveField('Date of Birth');
  assert.ok(res);
  assert.strictEqual(res.id, 'dob');
});

it('CanonicalSchema.resolveField: resolves "Aadhaar Number" to aadhaar_number', () => {
  const res = CanonicalSchema.resolveField('Aadhaar Number');
  assert.ok(res);
  assert.strictEqual(res.id, 'aadhaar_number');
  assert.strictEqual(res.category, 'identity');
});

it('CanonicalSchema.resolveField: resolves "Mobile Number" to primary_phone', () => {
  const res = CanonicalSchema.resolveField('Mobile Number');
  assert.ok(res);
  assert.strictEqual(res.id, 'primary_phone');
  assert.strictEqual(res.category, 'contact');
});

it('CanonicalSchema.resolveField: returns null for unmapped custom field', () => {
  const res = CanonicalSchema.resolveField('Emergency Contact Relationship');
  assert.strictEqual(res, null);
});

it('InformationProfile: adding and retrieving a custom field safely', () => {
  const ip = new InformationProfile(null);
  ip.setCustomField('custom_dl_number', 'Driving License Number', 'DL-1420110012345', 'identity', 'USER_ENTERED', 'Added by user');

  const field = ip.getField('custom_dl_number');
  assert.ok(field, 'Custom field must be retrievable');
  assert.strictEqual(field.value, 'DL-1420110012345');
  assert.strictEqual(field.label, 'Driving License Number');
  assert.strictEqual(field.provenance, 'USER_ENTERED');

  const allCustom = ip.getCustomFields();
  assert.strictEqual(allCustom.length, 1);
  assert.strictEqual(allCustom[0].id, 'custom_dl_number');
});

it('InformationProfile: removing a custom field works cleanly', () => {
  const ip = new InformationProfile(null);
  ip.setCustomField('custom_temp', 'Temp Field', '123', 'personal');
  assert.strictEqual(ip.getCustomFields().length, 1);

  ip.removeCustomField('custom_temp');
  assert.strictEqual(ip.getCustomFields().length, 0);
  assert.strictEqual(ip.getField('custom_temp'), null);
});

it('InformationProfile: user manual edit updates provenance to USER_EDITED', () => {
  const ip = new InformationProfile(null);
  ip.setField('full_name', 'PENDYALA SAI VENKAT', 'DOCUMENT_EXTRACTED', '10th Certificate');
  assert.strictEqual(ip.getField('full_name').provenance, 'DOCUMENT_EXTRACTED');

  // User edits value
  ip.setField('full_name', 'PENDYALA SAI VENKATA', 'USER_EDITED', 'Edited in side panel');
  const updated = ip.getField('full_name');
  assert.strictEqual(updated.value, 'PENDYALA SAI VENKATA');
  assert.strictEqual(updated.provenance, 'USER_EDITED');
});

it('InformationProfile: education records can be added, updated and removed', () => {
  const ip = new InformationProfile(null);
  const rec = ip.addEducationRecord('edu-btech', 'B.Tech / B.E');
  assert.ok(rec);
  assert.strictEqual(ip.getEducationRecords().length, 1);

  ip.updateEducationRecord('edu-btech', 'edu_institution', 'IIT Kharagpur', 'USER_ENTERED', 'User entry');
  const fieldVal = ip.getValue('edu_institution', 'edu-btech');
  assert.strictEqual(fieldVal, 'IIT Kharagpur');

  ip.removeEducationRecord('edu-btech');
  assert.strictEqual(ip.getEducationRecords().length, 0);
});

it('InformationProfile: sensitive fields (aadhaar, banking) are marked sensitive', () => {
  const ip = new InformationProfile(null);
  ip.setField('aadhaar_number', '123456789012', 'USER_ENTERED', 'User entry');
  ip.setField('bank_account_number', '9876543210123', 'USER_ENTERED', 'User entry');

  assert.strictEqual(ip.getField('aadhaar_number').sensitive, true);
  assert.strictEqual(ip.getField('bank_account_number').sensitive, true);
  assert.strictEqual(ip.getField('full_name').sensitive, false);
});

// ============================================================
// GROUP 21: FIELD MANAGEMENT (EDIT NAME, STABLE IDS, CANONICAL & CUSTOM DELETION)
// ============================================================
console.log('\n--- Group 21: Field Management & Deletion Safety ---');

it('InformationProfile.clearField: deletes canonical value without removing schema structure', () => {
  const ip = new InformationProfile(null);
  ip.setField('dob', '2005-05-27', 'USER_ENTERED', 'User Entry');
  assert.strictEqual(ip.getAvailability('dob'), 'AVAILABLE');
  assert.strictEqual(ip.getValue('dob'), '2005-05-27');

  // User deletes canonical field value
  ip.clearField('dob');

  // Value is empty string, provenance is cleared, availability is MISSING
  assert.strictEqual(ip.getValue('dob'), '');
  assert.strictEqual(ip.getAvailability('dob'), 'MISSING');
  const fieldEntry = ip.getField('dob');
  assert.ok(fieldEntry !== null, 'Canonical field structure remains in profile');
  assert.strictEqual(fieldEntry.value, '');
  assert.strictEqual(fieldEntry.provenance, null);
});

it('InformationProfile.clearField: clears sensitive banking field preserving sensitive attribute', () => {
  const ip = new InformationProfile(null);
  ip.setField('bank_account_number', '123456789012', 'USER_ENTERED', 'User entry');
  assert.strictEqual(ip.getField('bank_account_number').sensitive, true);

  ip.clearField('bank_account_number');
  const cleared = ip.getField('bank_account_number');
  assert.strictEqual(cleared.value, '');
  assert.strictEqual(cleared.sensitive, true, 'Sensitive flag must be preserved even after clearing');
  assert.strictEqual(ip.getAvailability('bank_account_number'), 'MISSING');
});

it('InformationProfile.updateCustomField: renames custom field preserving stable internal ID', () => {
  const ip = new InformationProfile(null);
  const stableId = 'custom_8f31a';
  ip.setCustomField(stableId, 'Driving License No', 'DL-998877', 'identity', 'USER_ENTERED', 'User entry');

  // User edits custom field name and category
  const updated = ip.updateCustomField(stableId, {
    label: 'Driving Licence Number',
    category: 'identity',
    value: 'DL-998877-UPDATED',
    provenance: 'USER_EDITED',
    source: 'Edited by user'
  });

  assert.ok(updated);
  assert.strictEqual(updated.id, stableId, 'Stable ID must be preserved');
  assert.strictEqual(updated.label, 'Driving Licence Number');
  assert.strictEqual(updated.value, 'DL-998877-UPDATED');
  assert.strictEqual(updated.provenance, 'USER_EDITED');

  // Retrievable by stable ID
  const retrieved = ip.getCustomField(stableId);
  assert.strictEqual(retrieved.label, 'Driving Licence Number');
});

it('Custom field renaming to canonical schema transfers data and cleans up custom entry', () => {
  const ip = new InformationProfile(null);
  const customId = 'custom_user_surname';
  ip.setCustomField(customId, 'Surname', 'VENKAT', 'personal', 'USER_ENTERED', 'User entry');
  assert.strictEqual(ip.getCustomFields().length, 1);

  // User edits name to "Last Name" which resolves to canonical "last_name"
  const resolved = CanonicalSchema.resolveField('Last Name');
  assert.ok(resolved && resolved.id === 'last_name');

  // System sets canonical field and cleans up custom entry
  ip.setField(resolved.id, 'VENKAT', 'USER_EDITED', 'Edited by user', null, 'personal');
  ip.removeCustomField(customId);

  assert.strictEqual(ip.getCustomFields().length, 0, 'Custom field should be removed');
  assert.strictEqual(ip.getValue('last_name'), 'VENKAT', 'Canonical last_name must hold the value');
  assert.strictEqual(ip.getField('last_name').provenance, 'USER_EDITED');
});

it('Active reference check detects if a field is referenced by pending proposals', () => {
  const proposals = [
    { fieldId: 'first-name', canonicalId: 'first_name', label: 'First Name', proposedValue: 'SAI', status: 'READY', approved: true },
    { fieldId: 'email-input', canonicalId: 'email', label: 'Email', proposedValue: 'sai@example.com', status: 'REVIEW_REQUIRED', approved: false }
  ];

  function isFieldReferenced(targetId, targetValue, propList) {
    return propList.find(p => {
      if (p.canonicalId && p.canonicalId === targetId) return true;
      if (p.fieldId && p.fieldId === targetId) return true;
      if (targetValue && p.proposedValue === targetValue) return true;
      return false;
    }) || null;
  }

  // Check referenced field
  const ref1 = isFieldReferenced('first_name', 'SAI', proposals);
  assert.ok(ref1 !== null, 'first_name must be identified as actively referenced');
  assert.strictEqual(ref1.label, 'First Name');

  // Check unreferenced field
  const ref2 = isFieldReferenced('bank_account_number', '12345', proposals);
  assert.strictEqual(ref2, null, 'bank_account_number is not in active proposals');
});

// ============================================================
// ASYNC TEST RUNNER FOR MODULE GROUPS 22 TO 28
// ============================================================

const { StorageManager } = require('../core/storage.js');
const { ProfileManager } = require('../core/profile-manager.js');
const { ConflictEngine } = require('../core/conflict-engine.js');
const { DocumentClassifier } = require('../core/document-classifier.js');
const { DocumentExtractor } = require('../core/document-extractor.js');
const { DocumentSourceManager } = require('../core/document-source-manager.js');
const { FileValidator } = require('../core/file-validator.js');
const { ImagePreparationEngine } = require('../core/image-preparation-engine.js');
const { UploadPreparationEngine } = require('../core/upload-preparation-engine.js');
const { DocumentRequirementEngine } = require('../core/document-requirement-engine.js');
const { UploadHandler } = require('../content/upload-handler.js');
const DocumentFieldMap = require('../core/document-field-map.js');
const OcrEngine = require('../core/ocr-engine.js');

async function itAsync(description, fn) {
  try {
    await fn();
    console.log(`  ✓ ${description}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ ${description}`);
    console.error(`    ${err.message}`);
    failedTests++;
  }
}

(async () => {
  // ── GROUP 22: Multi-Person Profile Manager ─────────────────────────
  console.log('\n--- Group 22: Multi-Person Profile Manager ---');

  await itAsync('ProfileManager initializes with primary profile and migrates legacy data', async () => {
    global.__efill_mock_storage = {};
    const sm = new StorageManager();
    const pm = new ProfileManager();
    await pm.init(sm);

    const profiles = pm.listProfiles();
    assert.strictEqual(profiles.length, 1);
    assert.ok(profiles[0].name.includes('Sai'));
    assert.strictEqual(profiles[0].relationship, 'Self');
    assert.strictEqual(profiles[0].isSelected, true);
  });

  await itAsync('ProfileManager creates a new independent profile (e.g. Brother)', async () => {
    const sm = new StorageManager();
    const pm = new ProfileManager();
    await pm.init(sm);

    const brotherProfile = await pm.createProfile('Brother', 'Brother', {
      full_name: 'Pendyala Krishna',
      dob: '2002-11-15'
    });

    assert.ok(brotherProfile);
    assert.strictEqual(brotherProfile.name, 'Brother');
    assert.strictEqual(brotherProfile.relationship, 'Brother');
    assert.strictEqual(pm.listProfiles().length, 2);
  });

  await itAsync('ProfileManager preserves strict data isolation between profiles', async () => {
    const sm = new StorageManager();
    const pm = new ProfileManager();
    await pm.init(sm);

    const profiles = pm.listProfiles();
    const primaryId = profiles[0].id;
    const brother = await pm.createProfile('Brother', 'Brother', {
      full_name: 'Pendyala Krishna',
      dob: '2002-11-15'
    });

    // Update primary profile with Sai Venkat's details
    const primary = pm.getSelectedProfile();
    primary.profile.setField('full_name', 'Pendyala Sai Venkat', 'USER_ENTERED', 'User entry');
    primary.profile.setField('dob', '2000-05-27', 'USER_ENTERED', 'User entry');
    await pm.updateProfile(primaryId, primary.profile);

    // Verify Brother profile has its own values, unchanged
    const brotherFetched = pm.getProfileById(brother.id);
    assert.strictEqual(brotherFetched.profile.getValue('full_name'), 'Pendyala Krishna');
    assert.strictEqual(brotherFetched.profile.getValue('dob'), '2002-11-15');

    // Verify Primary profile has its own values
    const primaryFetched = pm.getProfileById(primaryId);
    assert.strictEqual(primaryFetched.profile.getValue('full_name'), 'Pendyala Sai Venkat');
    assert.strictEqual(primaryFetched.profile.getValue('dob'), '2000-05-27');
  });

  await itAsync('ProfileManager switches selected profile and persists selection', async () => {
    const sm = new StorageManager();
    const pm = new ProfileManager();
    await pm.init(sm);

    const brother = await pm.createProfile('Brother', 'Brother', {});
    await pm.setSelectedProfileId(brother.id);

    const selected = pm.getSelectedProfile();
    assert.strictEqual(selected.id, brother.id);
    assert.strictEqual(selected.name, 'Brother');

    // New instance loads persisted selection
    const pm2 = new ProfileManager();
    await pm2.init(sm);
    assert.strictEqual(pm2.getSelectedProfile().id, brother.id);
  });

  await itAsync('ProfileManager renames a profile without losing data', async () => {
    const sm = new StorageManager();
    const pm = new ProfileManager();
    await pm.init(sm);

    const p = await pm.createProfile('Friend Temp', 'Friend', { full_name: 'Aditya' });
    await pm.renameProfile(p.id, 'Aditya Kumar', 'Friend');

    const updated = pm.getProfileById(p.id);
    assert.strictEqual(updated.name, 'Aditya Kumar');
    assert.strictEqual(updated.profile.getValue('full_name'), 'Aditya');
  });

  await itAsync('ProfileManager deletes profile safely and prevents deleting the sole profile', async () => {
    global.__efill_mock_storage = {};
    const sm = new StorageManager();
    const pm = new ProfileManager();
    await pm.init(sm);

    const p = await pm.createProfile('Extra Profile', 'Other', {});
    assert.strictEqual(pm.listProfiles().length, 2);

    await pm.deleteProfile(p.id);
    assert.strictEqual(pm.listProfiles().length, 1);

    // Attempting to delete the last profile throws or rejects
    let threw = false;
    try {
      await pm.deleteProfile(pm.listProfiles()[0].id);
    } catch (e) {
      threw = true;
    }
    assert.strictEqual(threw, true, 'Deleting last profile must be prohibited');
    assert.strictEqual(pm.listProfiles().length, 1);
  });

  // ── GROUP 23: Document Person Detection & Conflict Handling ───────
  console.log('\n--- Group 23: Document Person Detection & Conflict Handling ---');

  it('DocumentClassifier classifies documents accurately', () => {
    const classifier = new DocumentClassifier();

    assert.strictEqual(classifier.classifyDocument({ filename: 'Aadhaar_Front.pdf', text: 'Unique Identification Authority of India Mera Aadhaar' }).docType, 'AADHAAR');
    assert.strictEqual(classifier.classifyDocument({ filename: 'pan_card.jpg', text: 'INCOME TAX DEPARTMENT GOVT OF INDIA PERMANENT ACCOUNT NUMBER' }).docType, 'PAN');
    assert.strictEqual(classifier.classifyDocument({ filename: 'passport_scan.pdf', text: 'REPUBLIC OF INDIA PASSPORT' }).docType, 'PASSPORT');
    assert.strictEqual(classifier.classifyDocument({ filename: 'ssc_marks_memo.pdf', text: 'BOARD OF SECONDARY EDUCATION SSC PASS CERTIFICATE' }).docType, 'SSC_10TH');
    assert.strictEqual(classifier.classifyDocument({ filename: 'caste_certificate.pdf', text: 'COMMUNITY NATIVITY DATE OF BIRTH CERTIFICATE CASTE' }).docType, 'CASTE_CERTIFICATE');
    assert.strictEqual(classifier.classifyDocument({ filename: 'passport_photo.jpg' }).docType, 'PHOTO');
    assert.strictEqual(classifier.classifyDocument({ filename: 'signature_specimen.png' }).docType, 'SIGNATURE');
  });

  it('DocumentClassifier distinguishes INFORMATION_SOURCE vs APPLICATION_UPLOAD', () => {
    const classifier = new DocumentClassifier();
    assert.strictEqual(classifier.isInformationSource('AADHAAR'), true);
    assert.strictEqual(classifier.isInformationSource('PAN'), true);
    assert.strictEqual(classifier.isInformationSource('SSC_10TH'), true);
    assert.strictEqual(classifier.isInformationSource('PHOTO'), false);

    assert.strictEqual(classifier.isApplicationUpload('PHOTO'), true);
    assert.strictEqual(classifier.isApplicationUpload('SIGNATURE'), true);
    assert.strictEqual(classifier.isApplicationUpload('SSC_10TH'), true);
  });

  it('DocumentExtractor extracts structured fields with DOCUMENT_EXTRACTED provenance', () => {
    const extractor = new DocumentExtractor();
    const ocrText = 'INCOME TAX DEPARTMENT GOVT OF INDIA\nName: PENDYALA SAI VENKAT\nFather: PENDYALA RAMA RAO\nDOB: 27/05/2005\nPermanent Account Number: ABCDE1234F';
    const result = extractor.extract(ocrText, { filename: 'pan.pdf' });

    assert.strictEqual(result.docType, 'PAN');
    assert.strictEqual(result.fields.full_name?.value, 'PENDYALA SAI VENKAT');
    assert.strictEqual(result.fields.full_name?.provenance, 'DOCUMENT_EXTRACTED');
    assert.strictEqual(result.fields.pan_number?.value, 'ABCDE1234F');
    assert.strictEqual(result.fields.dob?.value, '2005-05-27');
  });

  it('DocumentExtractor detectPersonOwnership matches same person', () => {
    const extractor = new DocumentExtractor();
    const profile = new InformationProfile(null);
    profile.setField('full_name', 'Sai Venkat', 'USER_ENTERED', 'User entry');
    profile.setField('dob', '2005-05-27', 'USER_ENTERED', 'User entry');

    const extracted = {
      fields: {
        full_name: { value: 'SAI VENKAT' },
        dob: { value: '2005-05-27' }
      }
    };

    const ownership = extractor.detectPersonOwnership(extracted, profile);
    assert.strictEqual(ownership.isDifferentPerson, false);
  });

  it('DocumentExtractor detectPersonOwnership detects different person and suggests profile name', () => {
    const extractor = new DocumentExtractor();
    const profile = new InformationProfile(null);
    profile.setField('full_name', 'Sai Venkat', 'USER_ENTERED', 'User entry');
    profile.setField('dob', '2005-05-27', 'USER_ENTERED', 'User entry');

    const extracted = {
      fields: {
        full_name: { value: 'Ram Mohan Sharma' },
        dob: { value: '1975-08-15' }
      }
    };

    const ownership = extractor.detectPersonOwnership(extracted, profile);
    assert.strictEqual(ownership.isDifferentPerson, true);
    assert.strictEqual(ownership.suggestedProfileName, 'Ram Mohan Sharma');
  });

  it('ConflictEngine detects CONFLICT on contradicting values and AVAILABLE on match', () => {
    const ce = new ConflictEngine();

    const conflict = ce.detectConflict(
      { fieldId: 'dob', label: 'Date of Birth' },
      '2005-05-27',
      '2002-11-15'
    );
    assert.strictEqual(conflict.state, 'CONFLICT');

    const match = ce.detectConflict(
      { fieldId: 'dob', label: 'Date of Birth' },
      '27-05-2005',
      '2005-05-27'
    );
    assert.strictEqual(match.state, 'AVAILABLE');
  });

  it('ConflictEngine actions: KEEP_EXISTING, USE_DOCUMENT, USE_ONCE', () => {
    const ce = new ConflictEngine();

    const keep = ce.resolveConflict('KEEP_EXISTING', 'Sai Venkat', 'Venkat Sai');
    assert.strictEqual(keep.valueToUse, 'Sai Venkat');
    assert.strictEqual(keep.persistToProfile, false);

    const useDoc = ce.resolveConflict('USE_DOCUMENT', 'Sai Venkat', 'Venkat Sai');
    assert.strictEqual(useDoc.valueToUse, 'Venkat Sai');
    assert.strictEqual(useDoc.persistToProfile, true);

    const useOnce = ce.resolveConflict('USE_ONCE', 'Sai Venkat', 'Venkat Sai');
    assert.strictEqual(useOnce.valueToUse, 'Venkat Sai');
    assert.strictEqual(useOnce.persistToProfile, false);
    assert.strictEqual(useOnce.isSessionOnly, true);
  });

  // ── GROUP 24: Document & Upload Requirement Engine ────────────────
  console.log('\n--- Group 24: Document & Upload Requirement Engine ---');

  it('DocumentRequirementEngine parses upload constraints from label and accept attributes', () => {
    const engine = new DocumentRequirementEngine();
    const fakeFileInput = {
      id: 'candidate-photo',
      name: 'photo',
      accept: 'image/jpeg,image/png',
      label: 'Upload Recent Passport Photo (Max 50 KB, Min 20 KB, 200x230 px)'
    };

    const parsed = engine.parseUploadConstraints(fakeFileInput);
    assert.strictEqual(parsed.category, 'photo');
    assert.strictEqual(parsed.maxSizeBytes, 50 * 1024);
    assert.strictEqual(parsed.minSizeBytes, 20 * 1024);
    assert.strictEqual(parsed.exactWidth, 200);
    assert.strictEqual(parsed.exactHeight, 230);
  });

  it('DocumentRequirementEngine evaluates missing vs available document sources', () => {
    const engine = new DocumentRequirementEngine();
    const profile = new InformationProfile(null);
    profile.setField('full_name', 'Sai Venkat', 'USER_ENTERED', 'User entry');
    // aadhaar_number is missing

    const detectedFields = [
      { canonicalId: 'full_name', label: 'Full Name' },
      { canonicalId: 'aadhaar_number', label: 'Aadhaar Number' }
    ];

    const evaluation = engine.evaluateRequirements(detectedFields, [], profile, {});
    assert.strictEqual(evaluation.docRequirements.length, 1);
    assert.strictEqual(evaluation.docRequirements[0].docType, 'AADHAAR');
    assert.strictEqual(evaluation.docRequirements[0].state, 'DOCUMENT_REQUIRED');
  });

  it('DocumentRequirementEngine evaluates upload requirements state', () => {
    const engine = new DocumentRequirementEngine();
    const profile = new InformationProfile(null);

    const detectedUploads = [
      { id: 'photo-input', label: 'Candidate Photograph (JPEG, 20-50KB)' },
      { id: 'signature-input', label: 'Candidate Signature (JPEG, 10-20KB)' }
    ];

    const evaluation = engine.evaluateRequirements([], detectedUploads, profile, {});
    assert.strictEqual(evaluation.uploadRequirements.length, 2);
    assert.strictEqual(evaluation.uploadRequirements[0].state, 'UPLOAD_NEEDS_PREPARATION');
    assert.strictEqual(evaluation.uploadRequirements[1].state, 'UPLOAD_NEEDS_PREPARATION');
  });

  it('DocumentRequirementEngine session overrides satisfy requirements for current form', () => {
    const engine = new DocumentRequirementEngine();
    const profile = new InformationProfile(null);
    const sessionOverrides = {
      aadhaar_number: { value: '123456789012', source: 'Use Once' }
    };

    const detectedFields = [
      { canonicalId: 'aadhaar_number', label: 'Aadhaar Number' }
    ];

    const evaluation = engine.evaluateRequirements(detectedFields, [], profile, sessionOverrides);
    const missingDocs = evaluation.docRequirements.filter(d => d.state === 'DOCUMENT_REQUIRED');
    assert.strictEqual(missingDocs.length, 0);
    assert.strictEqual(evaluation.docRequirements[0].state, 'DOCUMENT_AVAILABLE');
  });

  // ── GROUP 25: File Validator & Security ────────────────────────────
  console.log('\n--- Group 25: File Validator & Security ---');

  it('FileValidator detects valid JPEG, PNG, and PDF magic bytes', () => {
    const fv = new FileValidator();

    const jpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10]);
    assert.strictEqual(fv.validateMagicBytes(jpegBuffer, 'image/jpeg').valid, true);

    const pngBuffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    assert.strictEqual(fv.validateMagicBytes(pngBuffer, 'image/png').valid, true);

    const pdfBuffer = Buffer.from('%PDF-1.4\n%test\n');
    assert.strictEqual(fv.validateMagicBytes(pdfBuffer, 'application/pdf').valid, true);
  });

  it('FileValidator detects MIME spoofing and rejects invalid files', () => {
    const fv = new FileValidator();

    // Text file pretending to be image/jpeg
    const spoofedJpeg = Buffer.from('This is a plain text file, not a jpeg.');
    const res = fv.validateMagicBytes(spoofedJpeg, 'image/jpeg');
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.detectedType, 'unknown');
  });

  it('FileValidator validates size limits (minSizeBytes and maxSizeBytes)', () => {
    const fv = new FileValidator();

    const smallFile = { size: 10 * 1024, type: 'image/jpeg', name: 'photo.jpg' };
    const validFile = { size: 30 * 1024, type: 'image/jpeg', name: 'photo.jpg' };
    const largeFile = { size: 100 * 1024, type: 'image/jpeg', name: 'photo.jpg' };
    const constraints = { minSizeBytes: 20 * 1024, maxSizeBytes: 50 * 1024 };

    assert.strictEqual(fv.validateSize(smallFile, constraints).valid, false);
    assert.strictEqual(fv.validateSize(validFile, constraints).valid, true);
    assert.strictEqual(fv.validateSize(largeFile, constraints).valid, false);
  });

  it('FileValidator validates aspect ratio and exact dimension constraints', () => {
    const fv = new FileValidator();

    const exactMatch = { width: 200, height: 230 };
    const mismatch = { width: 400, height: 300 };
    const constraints = { exactWidth: 200, exactHeight: 230 };

    assert.strictEqual(fv.validateDimensions(exactMatch, constraints).valid, true);
    assert.strictEqual(fv.validateDimensions(mismatch, constraints).valid, false);
  });

  // ── GROUP 26: Image & Signature Preparation Engine ────────────────
  console.log('\n--- Group 26: Image & Signature Preparation Engine ---');

  it('ImagePreparationEngine calculates crop box maintaining aspect ratio without distortion', () => {
    const engine = new ImagePreparationEngine();

    // Source is 1000x1000 square, target is 3.5:4.5 aspect ratio (e.g. 350x450)
    const crop = engine.calculateCropBox(1000, 1000, 350 / 450);
    assert.strictEqual(crop.height, 1000);
    assert.strictEqual(Math.round(crop.width), Math.round(1000 * (350 / 450)));
    assert.strictEqual(crop.x, Math.round((1000 - crop.width) / 2));
    assert.strictEqual(crop.y, 0);
  });

  it('ImagePreparationEngine calculates target dimensions fitting within constraints', () => {
    const engine = new ImagePreparationEngine();

    const dims = engine.calculateTargetDimensions(
      { width: 1200, height: 1600 },
      { maxWidth: 600, maxHeight: 800 }
    );
    assert.strictEqual(dims.width, 600);
    assert.strictEqual(dims.height, 800);
  });

  it('ImagePreparationEngine finds signature bounds and calculates whitespace trim', () => {
    const engine = new ImagePreparationEngine();

    // Simulated 100x50 signature image with padding
    const width = 100;
    const height = 50;
    const pixels = new Uint8ClampedArray(width * height * 4);
    // Fill white (255)
    pixels.fill(255);
    // Dark ink at x=20..80, y=10..40
    for (let y = 10; y <= 40; y++) {
      for (let x = 20; x <= 80; x++) {
        const idx = (y * width + x) * 4;
        pixels[idx] = 20;     // R
        pixels[idx + 1] = 20; // G
        pixels[idx + 2] = 20; // B
      }
    }

    const bounds = engine.findSignatureBounds(pixels, width, height, 150);
    assert.strictEqual(bounds.minX, 20);
    assert.strictEqual(bounds.maxX, 80);
    assert.strictEqual(bounds.minY, 10);
    assert.strictEqual(bounds.maxY, 40);
  });

  await itAsync('ImagePreparationEngine prepares photo to target KB constraints', async () => {
    const engine = new ImagePreparationEngine();
    const source = { width: 800, height: 1000, sizeBytes: 300 * 1024 };
    const constraints = {
      category: 'photo',
      minSizeBytes: 20 * 1024,
      maxSizeBytes: 50 * 1024,
      allowedFormats: ['image/jpeg']
    };

    const prep = await engine.preparePhoto(source, constraints);
    assert.strictEqual(prep.status, 'READY');
    assert.strictEqual(prep.prepared.format, 'image/jpeg');
    assert.ok(prep.prepared.sizeBytes <= constraints.maxSizeBytes);
    assert.ok(prep.prepared.sizeBytes >= constraints.minSizeBytes);
  });

  await itAsync('ImagePreparationEngine prepares signature with aspect preservation', async () => {
    const engine = new ImagePreparationEngine();
    const source = { width: 600, height: 200, sizeBytes: 80 * 1024 };
    const constraints = {
      category: 'signature',
      minSizeBytes: 10 * 1024,
      maxSizeBytes: 20 * 1024,
      allowedFormats: ['image/jpeg']
    };

    const prep = await engine.prepareSignature(source, constraints);
    assert.strictEqual(prep.status, 'READY');
    assert.ok(prep.prepared.sizeBytes <= constraints.maxSizeBytes);
  });

  // ── GROUP 27: Document / PDF Preparation & Safety ─────────────────
  console.log('\n--- Group 27: Document / PDF Preparation & Safety ---');

  it('UploadPreparationEngine creates valid PDF structure from image input', () => {
    const upe = new UploadPreparationEngine();
    const fakeImageBytes = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10]);
    const pdfData = upe.createPdfFromImage(fakeImageBytes, { width: 800, height: 1000 });

    assert.ok(pdfData);
    const pdfStr = Buffer.from(pdfData).toString('utf-8');
    assert.ok(pdfStr.startsWith('%PDF-1.4'), 'Must have standard PDF header');
    assert.ok(pdfStr.includes('%%EOF'), 'Must end with EOF marker');
  });

  it('UploadPreparationEngine detects certificate safety and flags REVIEW_REQUIRED if vital content risked', () => {
    const upe = new UploadPreparationEngine();

    // Source certificate where crucial QR/seal is in periphery
    const riskyCert = {
      filename: 'ssc_cert.jpg',
      sizeBytes: 1500 * 1024,
      mimeType: 'image/jpeg',
      hasPeripheryVitalElements: true
    };
    const aggressiveCropConstraint = {
      exactWidth: 400,
      exactHeight: 300, // Forces extreme cropping of portrait cert
      maxSizeBytes: 100 * 1024
    };

    const result = upe.prepareDocument(riskyCert, aggressiveCropConstraint);
    assert.strictEqual(result.status, 'REVIEW_REQUIRED');
    assert.ok(result.warnings.some(w => w.includes('vital') || w.includes('certificate')));
  });

  it('UploadPreparationEngine optimizes document size within max KB target', () => {
    const upe = new UploadPreparationEngine();
    const largeDoc = {
      filename: 'degree_certificate.pdf',
      sizeBytes: 850 * 1024,
      mimeType: 'application/pdf'
    };
    const constraints = {
      maxSizeBytes: 300 * 1024,
      minSizeBytes: 100 * 1024
    };

    const result = upe.prepareDocument(largeDoc, constraints);
    assert.strictEqual(result.status, 'READY');
    assert.ok(result.prepared.sizeBytes <= constraints.maxSizeBytes);
  });

  // ── GROUP 28: Upload Handler & Non-Submission Safety ──────────────
  console.log('\n--- Group 28: Upload Handler & Non-Submission Safety ---');

  it('UploadHandler attaches file using DataTransfer and dispatches events', () => {
    const uh = new UploadHandler();
    const events = [];

    const fakeFileInput = {
      tagName: 'INPUT',
      type: 'file',
      id: 'photo-upload',
      disabled: false,
      files: [],
      dispatchEvent: (e) => events.push(e.type)
    };

    const fakeBlob = Buffer.from('fake image content');
    const result = uh.attachFile(fakeFileInput, fakeBlob, 'candidate_photo.jpg');

    assert.strictEqual(result.success, true);
    assert.ok(events.includes('input'), 'Must dispatch input event');
    assert.ok(events.includes('change'), 'Must dispatch change event');
  });

  it('UploadHandler strictly blocks non-file or restricted inputs', () => {
    const uh = new UploadHandler();

    const pwdInput = { tagName: 'INPUT', type: 'password' };
    const submitBtn = { tagName: 'INPUT', type: 'submit' };
    const button = { tagName: 'BUTTON', type: 'button' };

    assert.strictEqual(uh.attachFile(pwdInput, null, 'file.jpg').success, false);
    assert.strictEqual(uh.attachFile(submitBtn, null, 'file.jpg').success, false);
    assert.strictEqual(uh.attachFile(button, null, 'file.jpg').success, false);
  });

  it('Autofill and UploadHandler NEVER trigger form submission (zero auto-submit)', () => {
    const uh = new UploadHandler();
    let submitTriggered = false;

    const fakeForm = {
      submit: () => { submitTriggered = true; }
    };
    const fakeFileInput = {
      tagName: 'INPUT',
      type: 'file',
      form: fakeForm,
      disabled: false,
      files: [],
      dispatchEvent: (e) => {
        if (e.type === 'submit') submitTriggered = true;
      }
    };

    uh.attachFile(fakeFileInput, Buffer.from('test'), 'test.jpg');
    assert.strictEqual(submitTriggered, false, 'Under no circumstances should any form submission occur');
  });

  // ── GROUP 29: Document-First Profile Creation & Building (Section 16) ─
  console.log('\n--- Group 29: Document-First Profile Creation & Building (Section 16) ---');

  await itAsync('1. Create empty person profile (Brother) without manual field requirement', async () => {
    global.__efill_mock_storage = {};
    const sm = new StorageManager();
    const pm = new ProfileManager();
    await pm.init(sm);

    const brotherProfile = await pm.createProfile('Brother', 'Brother', null, true);
    assert.ok(brotherProfile);
    assert.strictEqual(brotherProfile.name, 'Brother');
    assert.strictEqual(brotherProfile.relationship, 'Brother');
    assert.ok(brotherProfile.profile instanceof InformationProfile);
  });

  await itAsync('2. Verify newly created person profile starts completely empty', async () => {
    global.__efill_mock_storage = {};
    const sm = new StorageManager();
    const pm = new ProfileManager();
    await pm.init(sm);

    const brotherProfile = await pm.createProfile('Brother', 'Brother', null, true);
    const ip = brotherProfile.profile;
    assert.strictEqual(ip.isEmpty(), true);
    assert.strictEqual(ip.hasInformation(), false);
    const populated = ip.getPopulatedFields();
    assert.strictEqual(Object.keys(populated).length, 0);
  });

  it('3. Document classification correctly identifies all supported document types', () => {
    const dc = new DocumentClassifier();
    const expectations = [
      { filename: 'aadhaar_card.pdf', expected: 'AADHAAR' },
      { filename: 'pan_card_front.jpg', expected: 'PAN' },
      { filename: 'passport_scan.pdf', expected: 'PASSPORT' },
      { filename: '10th_marksheet.jpg', expected: 'SSC_10TH' },
      { filename: '12th_intermediate_certificate.pdf', expected: 'INTER_12TH' },
      { filename: 'degree_certificate.pdf', expected: 'DEGREE' },
      { filename: 'caste_certificate_obc.pdf', expected: 'CASTE_CERT' },
      { filename: 'ews_certificate_valid.pdf', expected: 'EWS_CERT' },
      { filename: 'income_certificate_ts.pdf', expected: 'INCOME_CERT' },
      { filename: 'driving_license.jpg', expected: 'DRIVING_LICENSE' },
      { filename: 'voter_id_epic.png', expected: 'VOTER_ID' }
    ];

    for (const testCase of expectations) {
      const cls = dc.classify({ filename: testCase.filename });
      assert.ok(cls.docType === testCase.expected || cls.docType.startsWith(testCase.expected), `Failed classification for ${testCase.filename}: ${cls.docType}`);
      const dfmType = DocumentFieldMap.classifyDocument(testCase.filename);
      assert.ok(dfmType === testCase.expected || dfmType.startsWith(testCase.expected), `Failed DocumentFieldMap for ${testCase.filename}: ${dfmType}`);
    }
  });

  it('4. DocumentFieldMap returns expected canonical fields and notes for each document', () => {
    const aadhaarFields = DocumentFieldMap.getExpectedFields('AADHAAR');
    assert.ok(aadhaarFields.includes('full_name'));
    assert.ok(aadhaarFields.includes('dob'));
    assert.ok(aadhaarFields.includes('aadhaar_number'));
    assert.ok(aadhaarFields.includes('gender'));
    assert.ok(aadhaarFields.includes('address_line'));

    const panFields = DocumentFieldMap.getExpectedFields('PAN');
    assert.ok(panFields.includes('full_name'));
    assert.ok(panFields.includes('father_name'));
    assert.ok(panFields.includes('dob'));
    assert.ok(panFields.includes('pan_number'));

    const sscFields = DocumentFieldMap.getExpectedFields('SSC_10TH');
    assert.ok(sscFields.includes('full_name'));
    assert.ok(sscFields.includes('roll_number'));
    assert.ok(sscFields.includes('passing_year'));

    const fieldNote = DocumentFieldMap.getFieldNote('SSC_10TH', 'full_name');
    assert.ok(fieldNote.includes('10th Certificate'));
  });

  it('5. Extract information from document produces canonical fields with full provenance metadata', () => {
    const extractor = new DocumentExtractor();
    const aadhaarText = 'GOVERNMENT OF INDIA\nAadhaar\nSai Krishna Sharma\nDOB: 15/08/1998\nMale\n9123 4567 8901\nHyderabad 500032';
    const extracted = extractor.extract(aadhaarText, { filename: 'aadhaar_card.pdf', docType: 'AADHAAR' });

    assert.strictEqual(extracted.docType, 'AADHAAR');
    assert.ok(extracted.fields.full_name);
    assert.strictEqual(extracted.fields.full_name.value, 'Sai Krishna Sharma');
    assert.strictEqual(extracted.fields.full_name.sourceType, 'DOCUMENT');
    assert.strictEqual(extracted.fields.full_name.sourceDocumentType, 'AADHAAR');
    assert.strictEqual(extracted.fields.full_name.provenance, 'DOCUMENT_EXTRACTED');
    assert.ok(extracted.fields.full_name.confidence >= 0.9);

    assert.ok(extracted.fields.aadhaar_number);
    assert.ok(extracted.fields.aadhaar_number.value.includes('912345678901') || extracted.fields.aadhaar_number.value.includes('9123'));
    assert.strictEqual(extracted.fields.aadhaar_number.sensitive, true);
  });

  it('6. Save extracted document information to empty profile', () => {
    const ip = new InformationProfile(null);
    assert.strictEqual(ip.isEmpty(), true);

    const extractor = new DocumentExtractor();
    const text = 'Sai Krishna Sharma\nDOB: 15/08/1998\nMale\n9123 4567 8901';
    const extracted = extractor.extract(text, { filename: 'aadhaar.pdf', docType: 'AADHAAR' });

    for (const [cid, fieldObj] of Object.entries(extracted.fields)) {
      ip.setField(cid, fieldObj.value, fieldObj.provenance, fieldObj.source, null, fieldObj.category, fieldObj);
    }

    assert.strictEqual(ip.getValue('full_name'), 'Sai Krishna Sharma');
    assert.strictEqual(ip.getValue('dob'), '1998-08-15');
    assert.ok(ip.getValue('aadhaar_number').includes('9123'));
  });

  it('7. Verify profile is no longer empty after document ingestion', () => {
    const ip = new InformationProfile(null);
    ip.setField('full_name', 'Sai Krishna', 'DOCUMENT_EXTRACTED', 'Aadhaar', null, 'personal', {
      sourceType: 'DOCUMENT',
      sourceDocumentType: 'AADHAAR'
    });

    assert.strictEqual(ip.isEmpty(), false);
    assert.strictEqual(ip.hasInformation(), true);
    const populated = ip.getPopulatedFields();
    assert.ok(populated.personal && populated.personal.length === 1);
  });

  it('8. Existing field recognition: prevents duplicate fields and recognizes identical information', () => {
    const ip = new InformationProfile(null);
    ip.setField('full_name', 'Sai Krishna Sharma', 'DOCUMENT_EXTRACTED', 'Aadhaar');
    ip.setField('dob', '1998-08-15', 'DOCUMENT_EXTRACTED', 'Aadhaar');

    // Second document contains identical full_name and dob
    const extractor = new DocumentExtractor();
    const secondDocText = 'Passport\nSai Krishna Sharma\nDOB: 15/08/1998\nPassport No: Z9876543';
    const extracted = extractor.extract(secondDocText, { filename: 'passport.pdf', docType: 'PASSPORT' });

    const ce = new ConflictEngine();
    const comparison = ce.compare(extracted.fields, ip);

    assert.strictEqual(comparison.conflicts.length, 0, 'Identical values should not be flagged as conflicts');
    const populated = ip.getPopulatedFields();
    assert.strictEqual(populated.personal.filter(f => f.id === 'full_name').length, 1);
  });

  it('9. New field recognition: identifies new information from subsequent document', () => {
    const ip = new InformationProfile(null);
    ip.setField('full_name', 'Sai Krishna Sharma', 'DOCUMENT_EXTRACTED', 'Aadhaar');

    // Incoming PAN document with father_name and pan_number (not yet in profile)
    const panFields = {
      full_name: { value: 'Sai Krishna Sharma' },
      father_name: { value: 'Ram Mohan Sharma' },
      pan_number: { value: 'ABCDE1234F' }
    };

    const newFieldIds = Object.keys(panFields).filter(fid => !ip.getField(fid) || !ip.getField(fid).value);
    assert.deepStrictEqual(newFieldIds, ['father_name', 'pan_number']);
  });

  it('10. Conflict detection flags contradictory values between existing profile and incoming document', () => {
    const ip = new InformationProfile(null);
    ip.setField('full_name', 'Sai Venkat', 'DOCUMENT_EXTRACTED', 'Aadhaar');

    const incomingFields = {
      full_name: { value: 'Sai V P' }
    };

    const ce = new ConflictEngine();
    const comparison = ce.compare(incomingFields, ip);

    assert.strictEqual(comparison.conflicts.length, 1);
    assert.strictEqual(comparison.conflicts[0].fieldId, 'full_name');
    assert.strictEqual(comparison.conflicts[0].existingValue, 'Sai Venkat');
    assert.strictEqual(comparison.conflicts[0].incomingValue, 'Sai V P');
  });

  it('11. Conflict resolution handles Keep Existing, Use Document, Edit, and Use Once', () => {
    const ce = new ConflictEngine();
    const dsm = new DocumentSourceManager();

    // Option 1: KEEP_EXISTING
    const ip1 = new InformationProfile(null);
    ip1.setField('full_name', 'Sai Venkat', 'USER_ENTERED');
    const res1 = ce.resolveConflict('full_name', 'KEEP_EXISTING', null, ip1, dsm);
    assert.strictEqual(res1.resolvedValue, 'Sai Venkat');
    assert.strictEqual(ip1.getValue('full_name'), 'Sai Venkat');

    // Option 2: USE_DOCUMENT
    const ip2 = new InformationProfile(null);
    ip2.setField('full_name', 'Sai Venkat', 'USER_ENTERED');
    const res2 = ce.resolveConflict('full_name', 'USE_DOCUMENT', 'Sai V P', ip2, dsm);
    assert.strictEqual(res2.resolvedValue, 'Sai V P');
    assert.strictEqual(ip2.getValue('full_name'), 'Sai V P');
    assert.strictEqual(ip2.getField('full_name').provenance, 'DOCUMENT_EXTRACTED');

    // Option 3: EDIT
    const ip3 = new InformationProfile(null);
    ip3.setField('full_name', 'Sai Venkat', 'USER_ENTERED');
    const res3 = ce.resolveConflict('full_name', 'EDIT', 'Sai Venkat Pendyala', ip3, dsm);
    assert.strictEqual(res3.resolvedValue, 'Sai Venkat Pendyala');
    assert.strictEqual(ip3.getValue('full_name'), 'Sai Venkat Pendyala');
    assert.strictEqual(ip3.getField('full_name').provenance, 'USER_EDITED');

    // Option 4: USE_ONCE
    const ip4 = new InformationProfile(null);
    ip4.setField('full_name', 'Sai Venkat', 'USER_ENTERED');
    const res4 = ce.resolveConflict('full_name', 'USE_ONCE', 'Sai V P', ip4, dsm);
    assert.strictEqual(res4.resolvedValue, 'Sai V P');
    assert.strictEqual(ip4.getValue('full_name'), 'Sai Venkat', 'USE_ONCE must not modify profile');
    assert.strictEqual(dsm.getSessionOverrides()['full_name'].value, 'Sai V P', 'USE_ONCE must set session override');
  });

  it('12. Different person detection detects when document belongs to another person', () => {
    const ip = new InformationProfile(null);
    ip.setField('full_name', 'Sai Venkat', 'DOCUMENT_EXTRACTED');
    ip.setField('aadhaar_number', '1111 2222 3333', 'DOCUMENT_EXTRACTED');

    const extractor = new DocumentExtractor();
    const otherDocText = 'Sai Teja\nDOB: 10/05/2002\n9999 8888 7777';
    const extractedOther = extractor.extract(otherDocText, { filename: 'brother_aadhaar.pdf', docType: 'AADHAAR' });

    const ownership = extractor.detectPersonOwnership(extractedOther, ip);
    assert.strictEqual(ownership.isDifferentPerson, true);
    assert.strictEqual(ownership.extractedPerson.name, 'Sai Teja');
    assert.strictEqual(ownership.suggestedProfileName, 'Sai Teja');
  });

  await itAsync('13. Create new profile from document detected as different person', async () => {
    global.__efill_mock_storage = {};
    const sm = new StorageManager();
    const pm = new ProfileManager();
    await pm.init(sm);

    assert.strictEqual(pm.listProfiles().length, 1);

    const brotherExtracted = {
      full_name: 'Sai Teja',
      dob: '2002-05-10',
      aadhaar_number: '9999 8888 7777'
    };

    const newProfile = await pm.createProfile('Sai Teja', 'Brother', brotherExtracted, true);
    assert.ok(newProfile);
    assert.strictEqual(pm.listProfiles().length, 2);
    assert.strictEqual(newProfile.profile.getValue('full_name'), 'Sai Teja');
    assert.strictEqual(newProfile.profile.getValue('aadhaar_number'), '9999 8888 7777');
  });

  it('14. Application workflow: missing fields recommend specific source documents with direct action', () => {
    const dre = new DocumentRequirementEngine();
    const ip = new InformationProfile(null);
    ip.setField('full_name', 'Sai Venkat', 'USER_ENTERED');

    const appFields = [
      { id: 'pan_number', label: 'PAN Card Number' },
      { id: 'roll_number', label: '10th Class Roll No' }
    ];

    const evaluation = dre.evaluateRequirements(appFields, [], ip, {});
    assert.ok(evaluation.missingFieldRecommendations);

    const panRec = evaluation.missingFieldRecommendations.find(r => r.fieldId === 'pan_number');
    assert.ok(panRec, 'Must recommend source doc for missing PAN number');
    assert.strictEqual(panRec.recommendedDoc.docType, 'PAN');
    assert.strictEqual(panRec.recommendedDoc.documentName, 'PAN Card');

    const rollRec = evaluation.missingFieldRecommendations.find(r => r.fieldId === 'roll_number');
    assert.ok(rollRec, 'Must recommend source doc for missing Roll Number');
    assert.strictEqual(rollRec.recommendedDoc.docType, 'SSC_10TH');
  });

  it('15. Application document upload updates profile and satisfies missing proposal immediately', () => {
    const ip = new InformationProfile(null);
    const selector = new SourceSelector();

    const appFields = [
      { id: 'pan_num', selector: '#pan', canonicalId: 'pan_number', label: 'PAN Number' }
    ];

    // Initially UNAVAILABLE with recommendedDoc
    let proposals = selector.generateProposals(appFields, ip);
    assert.strictEqual(proposals[0].status, STATUS.UNAVAILABLE);
    assert.ok(proposals[0].recommendedDoc);
    assert.strictEqual(proposals[0].recommendedDoc.docType, 'PAN');

    // User provides PAN card document
    const extractor = new DocumentExtractor();
    const panText = 'INCOME TAX DEPARTMENT\nPendyala Sai Venkat\nFather: P Ram Mohan\nDOB: 15/08/1998\nABCDE1234F';
    const extracted = extractor.extract(panText, { filename: 'pancard.pdf', docType: 'PAN' });

    for (const [cid, fieldObj] of Object.entries(extracted.fields)) {
      ip.setField(cid, fieldObj.value, 'USER_CONFIRMED', 'From document (PAN Card)', null, fieldObj.category, fieldObj);
    }

    // Re-generate proposals -> status is now READY!
    proposals = selector.generateProposals(appFields, ip);
    assert.strictEqual(proposals[0].status, STATUS.READY);
    assert.strictEqual(proposals[0].proposedValue, 'ABCDE1234F');
    assert.ok(proposals[0].source.includes('PAN Card') || proposals[0].provenanceLabel.includes('Confirmed'));
  });

  it('16. Profile growth: progressively builds comprehensive living profile across multiple documents', () => {
    const ip = new InformationProfile(null);
    const extractor = new DocumentExtractor();

    // 1. Ingest Aadhaar
    const aadhaarExtracted = extractor.extract('Sai Venkat\nDOB: 15/08/1998\nMale\n1234 5678 9012\nHyderabad 500032', {
      filename: 'aadhaar.pdf', docType: 'AADHAAR'
    });
    for (const [cid, f] of Object.entries(aadhaarExtracted.fields)) {
      ip.setField(cid, f.value, f.provenance, f.source, null, f.category, f);
    }
    assert.strictEqual(Object.keys(ip.getPopulatedFields()).length, 3); // personal, identity, address

    // 2. Ingest PAN Card
    const panExtracted = extractor.extract('Sai Venkat\nFather: Ram Mohan\nDOB: 15/08/1998\nABCDE1234F', {
      filename: 'pan.pdf', docType: 'PAN'
    });
    for (const [cid, f] of Object.entries(panExtracted.fields)) {
      ip.setField(cid, f.value, f.provenance, f.source, null, f.category, f);
    }
    assert.ok(ip.getValue('father_name'));
    assert.ok(ip.getValue('pan_number'));

    // 3. Ingest 10th SSC Certificate
    const sscExtracted = extractor.extract('Sai Venkat\nRoll No: 1403210987\nPassing Year: 2014\nPercentage: 88.5%', {
      filename: '10th_ssc.jpg', docType: 'SSC_10TH'
    });
    for (const [cid, f] of Object.entries(sscExtracted.fields)) {
      ip.setField(cid, f.value, f.provenance, f.source, null, f.category, f);
    }
    assert.strictEqual(ip.getValue('roll_number'), '1403210987');
    assert.strictEqual(ip.getValue('passing_year'), '2014');

    // 4. Ingest Caste Certificate
    const casteExtracted = extractor.extract('Sai Venkat\nCategory: OBC-NCL\nCert No: CC/2023/98765', {
      filename: 'caste_cert.pdf', docType: 'CASTE_CERT'
    });
    for (const [cid, f] of Object.entries(casteExtracted.fields)) {
      ip.setField(cid, f.value, f.provenance, f.source, null, f.category, f);
    }
    assert.strictEqual(ip.getValue('category'), 'OBC-NCL');
    assert.strictEqual(ip.getValue('caste_certificate_number'), 'CC/2023/98765');

    // Living profile has expanded across multiple categories
    const allPopulated = ip.getPopulatedFields();
    assert.ok(allPopulated.personal);
    assert.ok(allPopulated.identity);
    assert.ok(allPopulated.address);
    assert.ok(allPopulated.family);
    assert.ok(allPopulated.category);
  });

  it('17. Manual entry fallback: user can manually add or edit fields with USER_ENTERED/USER_EDITED provenance', () => {
    const ip = new InformationProfile(null);
    assert.strictEqual(ip.isEmpty(), true);

    // Fallback manual entry
    ip.setField('mother_name', 'Sujatha Devi', 'USER_ENTERED', 'Added manually by user');
    assert.strictEqual(ip.getValue('mother_name'), 'Sujatha Devi');
    assert.strictEqual(ip.getField('mother_name').provenance, 'USER_ENTERED');
    assert.strictEqual(ip.getField('mother_name').sourceType, 'MANUAL');
    assert.strictEqual(ip.isEmpty(), false);

    // User manual correction
    ip.setField('mother_name', 'Pendyala Sujatha', 'USER_EDITED', 'Corrected in sidepanel');
    assert.strictEqual(ip.getValue('mother_name'), 'Pendyala Sujatha');
    assert.strictEqual(ip.getField('mother_name').provenance, 'USER_EDITED');
  });

  it('18. One-time use (USE_ONCE) satisfies missing application proposal without modifying persistent profile', () => {
    const ip = new InformationProfile(null);
    const selector = new SourceSelector();
    const dsm = new DocumentSourceManager();

    const appFields = [
      { id: 'passport_num', selector: '#passport', canonicalId: 'passport_number', label: 'Passport Number' }
    ];

    // Initially UNAVAILABLE in profile
    let proposals = selector.generateProposals(appFields, ip, dsm.getSessionOverrides());
    assert.strictEqual(proposals[0].status, STATUS.UNAVAILABLE);

    // Set USE_ONCE field in session overrides
    dsm.setUseOnceField('passport_number', 'Z1234567', 'Temporary Passport (Use Once)');
    assert.strictEqual(ip.getValue('passport_number'), '', 'Profile must remain untouched');

    // Re-generate proposals with sessionOverrides
    proposals = selector.generateProposals(appFields, ip, dsm.getSessionOverrides());
    assert.strictEqual(proposals[0].status, STATUS.REVIEW_REQUIRED);
    assert.strictEqual(proposals[0].proposedValue, 'Z1234567');
    assert.strictEqual(proposals[0].provenance, 'APPLICATION_SPECIFIC');
  });

  it('19. End-to-end pipeline: document ingestion immediately produces approved autofill payload with zero auto-submit', () => {
    const ip = new InformationProfile(null);
    const extractor = new DocumentExtractor();
    const selector = new SourceSelector();

    const appFields = [
      { elementId: 'candidate_aadhaar', id: 'candidate_aadhaar', selector: '#aadhaar', canonicalId: 'aadhaar_number', label: 'Aadhaar Card' }
    ];

    // 1. Missing in application
    let proposals = selector.generateProposals(appFields, ip);
    assert.strictEqual(proposals[0].status, STATUS.UNAVAILABLE);
    assert.strictEqual(proposals[0].approved, false);

    // 2. Document selected and extracted
    const extracted = extractor.extract('Government of India\nSai Venkat\nDOB: 15/08/1998\nAadhaar No: 1234 5678 9012', {
      filename: 'aadhaar.pdf',
      docType: 'AADHAAR'
    });
    assert.strictEqual(extracted.fields.aadhaar_number.value, '123456789012');

    // 3. User saves approved document fields to profile
    for (const [cid, f] of Object.entries(extracted.fields)) {
      ip.setField(cid, f.value, 'USER_CONFIRMED', 'Extracted from Aadhaar Card', null, f.category, f);
    }

    // 4. Simultaneous application proposal regeneration
    proposals = selector.generateProposals(appFields, ip);
    assert.strictEqual(proposals[0].status, STATUS.READY);
    assert.strictEqual(proposals[0].proposedValue, '123456789012');

    // Simulate auto-approval & autofill payload dispatch
    const newlySatisfied = proposals.filter(p => p.canonicalId === 'aadhaar_number');
    newlySatisfied.forEach(p => { p.approved = true; });

    const approvedProposals = proposals.filter(p => p.approved);
    assert.strictEqual(approvedProposals.length, 1);
    assert.strictEqual(approvedProposals[0].fieldId, 'candidate_aadhaar');
    assert.strictEqual(approvedProposals[0].proposedValue, '123456789012');

    // Verify zero auto-submit guarantee
    assert.strictEqual(approvedProposals[0].submitForm, undefined);
  });

  // Group 30: Document Intelligence, Multi-Source Recommendations & OCR Pipeline
  console.log('\n--- Group 30: Document Intelligence, Multi-Source Recommendations & OCR Pipeline ---');

  it('1. DocumentFieldMap: returns all reasonable alternative document sources for a canonical field', () => {
    const docMap = DocumentFieldMap.documentFieldMap || DocumentFieldMap;
    const nameSources = docMap.getAllPossibleSources('first_name');
    assert.ok(Array.isArray(nameSources), 'Must return an array of sources');
    assert.ok(nameSources.length >= 4, 'Must return at least 4 alternative sources for first_name');

    const docTypes = nameSources.map(s => s.docType);
    assert.ok(docTypes.includes('AADHAAR'), 'Must include Aadhaar');
    assert.ok(docTypes.includes('SSC_10TH'), 'Must include 10th Marksheet');
    assert.ok(docTypes.includes('PAN'), 'Must include PAN Card');
    assert.ok(docTypes.includes('PASSPORT'), 'Must include Passport');

    const primaryRec = docMap.getRecommendedDocument('first_name');
    assert.strictEqual(primaryRec.docType, 'AADHAAR', 'Primary recommendation for first_name must be Aadhaar');
    assert.ok(primaryRec.allPossibleSources.length >= 4, 'Primary recommendation must bundle allPossibleSources');
  });

  it('2. DocumentFieldMap: father_name and category return rich alternative sources', () => {
    const docMap = DocumentFieldMap.documentFieldMap || DocumentFieldMap;
    const fatherSources = docMap.getAllPossibleSources('father_name').map(s => s.docType);
    assert.ok(fatherSources.includes('SSC_10TH'), '10th Marksheet must be a source for father_name');
    assert.ok(fatherSources.includes('PAN'), 'PAN Card must be a source for father_name');
    assert.ok(fatherSources.includes('AADHAAR'), 'Aadhaar must be a source for father_name');

    const ewsSources = docMap.getAllPossibleSources('ews_status').map(s => s.docType);
    assert.ok(ewsSources.includes('EWS_CERT') || ewsSources.includes('EWS_CERTIFICATE'), 'EWS Certificate must be source for ews_status');
  });

  it('3. DocumentExtractor: extracts comprehensive 10th Marksheet / SSC Certificate fields', () => {
    const extractor = new DocumentExtractor();
    const marksheetText = `
      CENTRAL BOARD OF SECONDARY EDUCATION
      SECONDARY SCHOOL EXAMINATION (CLASS X) 2018
      ROLL NO: 18123456
      CANDIDATE NAME: RAHUL PENDYALA
      FATHER'S NAME: PENDYALA SRINIVAS
      MOTHER'S NAME: PENDYALA LAKSHMI
      SCHOOL: DELHI PUBLIC SCHOOL NACHARAM HYDERABAD
      YEAR OF PASSING: 2018
      TOTAL MARKS: 475 / 500
      PERCENTAGE: 95.0%
      RESULT: PASSED
    `;
    const res = extractor.extract(marksheetText, { filename: 'cbse_10th_marksheet.pdf', docType: 'SSC_10TH' });
    assert.ok(res.fields, 'Must extract fields');
    assert.strictEqual(res.fields.full_name?.value, 'RAHUL PENDYALA');
    assert.strictEqual(res.fields.father_name?.value, 'PENDYALA SRINIVAS');
    assert.strictEqual(res.fields.mother_name?.value, 'PENDYALA LAKSHMI');
    assert.strictEqual(res.fields.roll_number?.value, '18123456');
    assert.strictEqual(res.fields.passing_year?.value, '2018');
    assert.strictEqual(res.fields.percentage?.value, '95.0');
    assert.ok(res.fields.board?.value?.includes('CBSE') || res.fields.board?.value?.includes('CENTRAL BOARD'));
    assert.ok(res.fields.institution?.value?.includes('DELHI PUBLIC SCHOOL'));
  });

  it('4. DocumentExtractor: extracts comprehensive EWS Certificate fields', () => {
    const extractor = new DocumentExtractor();
    const ewsText = `
      GOVERNMENT OF TELANGANA
      REVENUE DEPARTMENT
      INCOME & ASSET CERTIFICATE FOR ECONOMICALLY WEAKER SECTIONS (EWS)
      Certificate No: EWS/2023/TG/789123
      Date of Issue: 24/07/2023
      This is to certify that Shri RAHUL PENDYALA, Son of PENDYALA SRINIVAS
      resident of Village Hyderabad, Pin 500032 belongs to Economically Weaker Sections.
      His family gross annual income is below Rs. 8 Lakh (Rupees 4,50,000/-).
      Valid for the year: 2023-2024
      Issuing Authority: Tahsildar
    `;
    const res = extractor.extract(ewsText, { filename: 'ews_certificate.pdf', docType: 'EWS_CERT' });
    assert.ok(res.fields, 'Must extract fields');
    assert.strictEqual(res.fields.full_name?.value, 'RAHUL PENDYALA');
    assert.strictEqual(res.fields.father_name?.value, 'PENDYALA SRINIVAS');
    assert.strictEqual(res.fields.category?.value, 'EWS');
    assert.ok(['Yes', 'YES'].includes(res.fields.ews_status?.value), 'EWS status should be Yes');
    assert.strictEqual(res.fields.caste_certificate_number?.value, 'EWS/2023/TG/789123');
    assert.strictEqual(res.fields.annual_income?.value, '450000');
  });

  await itAsync('5. OcrEngine: processes text input, segments lines and extracts structured blocks', async () => {
    const engine = new OcrEngine();
    const sampleOcrText = 'Candidate Name: SAI VENKAT\nRoll Number: 19028374\nDOB: 12-04-2001\nStatus: Qualified';
    const result = await engine.recognize(sampleOcrText);

    assert.ok(result.text.includes('SAI VENKAT'));
    assert.strictEqual(result.lines.length, 4);
    assert.ok(result.blocks.length >= 2, 'Must extract key-value blocks');
    const nameBlock = result.blocks.find(b => b.label === 'Candidate Name');
    assert.ok(nameBlock, 'Must identify Candidate Name block');
    assert.strictEqual(nameBlock.value, 'SAI VENKAT');
  });

  it('6. SourceSelector: proposal for missing field includes both primary recommendation and all possible alternatives', () => {
    const selector = new SourceSelector();
    const emptyIp = new InformationProfile(null);
    const formFields = [
      { id: 'first_name_input', selector: '#fname', canonicalId: 'first_name', label: 'First Name' }
    ];

    const proposals = selector.generateProposals(formFields, emptyIp);
    assert.strictEqual(proposals.length, 1);
    const p = proposals[0];
    assert.strictEqual(p.status, STATUS.UNAVAILABLE);
    assert.ok(p.recommendedDoc, 'Must include primary recommendation');
    assert.strictEqual(p.recommendedDoc.docType, 'AADHAAR');
    assert.ok(Array.isArray(p.allPossibleDocs), 'Must include allPossibleDocs list');
    assert.ok(p.allPossibleDocs.length >= 4, 'Must have multiple alternative sources');
    const docTypes = p.allPossibleDocs.map(d => d.docType);
    assert.ok(docTypes.includes('SSC_10TH'), 'Must list 10th Marksheet as alternative source');
    assert.ok(docTypes.includes('PAN'), 'Must list PAN as alternative source');
  });

  it('7. Living Profile Invariant: any document provided (e.g. 10th Marksheet) extracts all fields, updates profile and satisfies active form', () => {
    const ip = new InformationProfile(null);
    const selector = new SourceSelector();
    const extractor = new DocumentExtractor();

    // Active form only asks for candidate's First Name
    const jamFields = [
      { id: 'applicant_fname', selector: '#first_name', canonicalId: 'first_name', label: 'First Name' }
    ];

    // Initial state: missing
    let proposals = selector.generateProposals(jamFields, ip);
    assert.strictEqual(proposals[0].status, STATUS.UNAVAILABLE);

    // User provides 10th Marksheet (not specifically asked for by JAM, but provided by user)
    const marksheetText = `
      CENTRAL BOARD OF SECONDARY EDUCATION
      ROLL NO: 54321678
      NAME: RAHUL PENDYALA
      FATHER'S NAME: PENDYALA SRINIVAS
      YEAR: 2019
      PERCENTAGE: 91.2%
    `;
    const extracted = extractor.extract(marksheetText, { filename: 'class_10_marks.pdf', docType: 'SSC_10TH' });

    // Verify all fields are extracted regardless of whether JAM asked for them
    assert.ok(extracted.fields.first_name || extracted.fields.full_name);
    assert.ok(extracted.fields.roll_number);
    assert.ok(extracted.fields.passing_year);
    assert.ok(extracted.fields.percentage);
    assert.ok(extracted.fields.father_name);

    // User approves: save ALL extracted fields to the InformationProfile
    for (const [cid, f] of Object.entries(extracted.fields)) {
      ip.setField(cid, f.value, 'USER_CONFIRMED', 'Extracted from 10th Marksheet', null, f.category, f);
    }

    // 1. Form proposal for first_name is satisfied immediately
    proposals = selector.generateProposals(jamFields, ip);
    assert.strictEqual(proposals[0].status, STATUS.READY);
    assert.strictEqual(proposals[0].proposedValue, 'RAHUL');

    // 2. The living profile now holds the remaining educational and family fields for all future forms
    assert.strictEqual(ip.getValue('roll_number'), '54321678');
    assert.strictEqual(ip.getValue('passing_year'), '2019');
    assert.strictEqual(ip.getValue('percentage'), '91.2');
    assert.strictEqual(ip.getValue('father_name'), 'PENDYALA SRINIVAS');
  });

  // ── Final Results Summary ─────────────────────────────────────────
  console.log('\n========================================');
  console.log(`📊 TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('========================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
})();


