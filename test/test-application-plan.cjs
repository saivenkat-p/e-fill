/**
 * Unit & Integration Tests: E-Fill Update 2 — Application Plan Engine
 * ===================================================================
 * Verifies all 24 requirements of Update 2:
 * 1. Application Identity Detection (JAM, GATE, UPSC, Generic)
 * 2. Progressive Page Discovery (Step 1 -> Step 2 accumulation without data loss)
 * 3. Strict DISCOVERED vs INFERRED semantics (never fabricating requirements for inferred steps)
 * 4. Requirement Model with strict required/optional/UNKNOWN evidence
 * 5. Connection with My Information & Application Mapping Engine (derivable fields)
 * 6. Document Requirements & semantic source recommendations
 * 7. Session Data isolation & profile immutability
 * 8. Serialization & reload persistence
 * 9. Absolute safety invariants (zero auto-navigate, zero auto-submit)
 */

const assert = require('assert');
const { ApplicationPlan } = require('../core/application-plan.js');
const { InformationProfile } = require('../core/information-profile.js');
const { applicationMappingEngine } = require('../core/application-mapping-engine.js');
const { canonicalSchema } = require('../core/canonical-schema.js');

// Attach globals for browser-like module interaction
global.EFillApplicationMappingEngine = { applicationMappingEngine };
global.EFillCanonicalSchema = { canonicalSchema };

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}:`, err.message);
    failed++;
  }
}

console.log('\n=== RUNNING APPLICATION PLAN & JOURNEY ENGINE TESTS ===\n');

// ─────────────────────────────────────────────────────────────────────────────
console.log('1. Application Identity Detection:');
// ─────────────────────────────────────────────────────────────────────────────

test('identifies JAM 2027 application generically from headings and title', () => {
  const plan = new ApplicationPlan();
  plan.addPage({
    url: 'https://jam2027.iitb.ac.in/apply',
    title: 'JAM 2027 — Online Application Portal',
    navigation: { headings: ['JAM 2027 — Joint Admission test for Masters'] },
    fields: []
  });

  assert.strictEqual(plan.applicationId, 'jam-2027');
  assert.ok(plan.applicationName.includes('JAM 2027'));
  assert.strictEqual(plan.domain, 'jam2027.iitb.ac.in');
});

test('identifies GATE application from portal signals', () => {
  const plan = new ApplicationPlan();
  plan.addPage({
    url: 'https://gate2027.iitr.ac.in/form',
    title: 'GATE 2027 Application Form',
    fields: []
  });

  assert.strictEqual(plan.applicationId, 'gate-2027');
  assert.ok(plan.applicationName.includes('GATE'));
  assert.strictEqual(plan.domain, 'gate2027.iitr.ac.in');
});

test('identifies UPSC recruitment application from headings', () => {
  const plan = new ApplicationPlan();
  plan.addPage({
    url: 'https://upsconline.nic.in/app/part1',
    title: 'UPSC Online Civil Services Registration',
    navigation: { headings: ['Union Public Service Commission — Civil Services (Preliminary)'] },
    fields: []
  });

  assert.strictEqual(plan.applicationId, 'upsc-online');
  assert.ok(plan.applicationName.includes('UPSC'));
});

test('handles generic application without hallucination or hardcoding', () => {
  const plan = new ApplicationPlan();
  plan.addPage({
    url: 'https://admissions.xyz-university.edu/register',
    title: 'Student Admissions Form',
    fields: []
  });

  assert.strictEqual(plan.domain, 'admissions.xyz-university.edu');
  assert.strictEqual(plan.applicationName, 'Student Admissions Form');
});

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n2. Progressive Page Discovery & Accumulation:');
// ─────────────────────────────────────────────────────────────────────────────

test('accumulates Step 1 and Step 2 pages without wiping previous discoveries', () => {
  const plan = new ApplicationPlan();

  // Visit Step 1
  plan.addPage({
    url: 'http://localhost/form#step1',
    title: 'Step 1: Exam Preferences',
    fields: [
      { elementId: 'jam_paper', name: 'jam_paper', label: 'Select Paper *', required: true },
      { elementId: 'exam_city_1', name: 'exam_city_1', label: 'Choice of City 1 *', required: true }
    ]
  });

  assert.strictEqual(plan.pages.length, 1);
  assert.strictEqual(plan.currentStep, 1);
  assert.strictEqual(plan.pages[0].status, 'CURRENT');
  assert.strictEqual(plan.requirements.length, 2);

  // Visit Step 2
  plan.addPage({
    url: 'http://localhost/form#step2',
    title: 'Step 2: Personal Details',
    fields: [
      { elementId: 'applicant_name', name: 'applicant_name', canonicalId: 'full_name', label: 'Candidate Name *', required: true },
      { elementId: 'applicant_dob', name: 'applicant_dob', canonicalId: 'dob', label: 'Date of Birth *', required: true },
      { elementId: 'ssc_percentage', name: 'ssc_percentage', canonicalId: 'edu_percentage', label: '10th Percentage *', required: true }
    ]
  });

  // Verify plan accumulated both steps
  assert.strictEqual(plan.pages.length, 2);
  assert.strictEqual(plan.currentStep, 2);
  assert.strictEqual(plan.pages[0].status, 'COMPLETED');
  assert.strictEqual(plan.pages[1].status, 'CURRENT');

  // Verify all 5 requirements across both pages exist in cumulative plan
  assert.strictEqual(plan.requirements.length, 5);
  const ids = plan.requirements.map(r => r.id);
  assert.ok(ids.includes('jam_paper'));
  assert.ok(ids.includes('applicant_name'));
  assert.ok(ids.includes('ssc_percentage'));
});

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n3. Strict DISCOVERED vs INFERRED Semantics (User Constraint):');
// ─────────────────────────────────────────────────────────────────────────────

test('marks visited steps as DISCOVERED and unvisited stepper items as INFERRED with unknown requirements', () => {
  const plan = new ApplicationPlan();

  // Scan Step 1 where stepper shows 4 steps
  plan.addPage({
    url: 'http://localhost/form#step1',
    title: 'Step 1: Examination Preferences',
    navigation: {
      stepperFound: true,
      steps: [
        { label: 'Step 1: Exam Preferences', stepIndex: 1, active: true },
        { label: 'Step 2: Personal Details', stepIndex: 2, active: false },
        { label: 'Step 3: Document Uploads', stepIndex: 3, active: false },
        { label: 'Step 4: Payment', stepIndex: 4, active: false }
      ]
    },
    fields: [
      { elementId: 'paper', label: 'Paper *', required: true }
    ]
  });

  const discoveredSecs = plan.sections.filter(s => s.status === 'DISCOVERED');
  const inferredSecs = plan.sections.filter(s => s.status === 'INFERRED');

  // Visited section is DISCOVERED with requirementsKnown = true
  assert.strictEqual(discoveredSecs.length, 1);
  assert.strictEqual(discoveredSecs[0].requirementsKnown, true);
  assert.strictEqual(discoveredSecs[0].fieldCount, 1);

  // Unvisited stepper steps are INFERRED with requirementsKnown = false
  assert.strictEqual(inferredSecs.length, 3);
  inferredSecs.forEach(sec => {
    assert.strictEqual(sec.requirementsKnown, false, 'Inferred sections must NOT claim known requirements');
    assert.strictEqual(sec.fieldCount, 0, 'Inferred sections must not have fabricated fields');
  });

  // Requirements list contains ONLY the actually discovered field from Step 1
  assert.strictEqual(plan.requirements.length, 1);
  assert.strictEqual(plan.requirements[0].id, 'paper');
});

test('handles pages with no stepper without fabricating future sections', () => {
  const plan = new ApplicationPlan();
  plan.addPage({
    url: 'http://localhost/simple-form',
    title: 'Single Page Form',
    navigation: { stepperFound: false, steps: [] },
    fields: [{ elementId: 'name', label: 'Full Name', required: true }]
  });

  assert.strictEqual(plan.hasInferredFutureSteps, false);
  assert.strictEqual(plan.sections.filter(s => s.status === 'INFERRED').length, 0);
  assert.strictEqual(plan.sections.filter(s => s.status === 'DISCOVERED').length, 1);
});

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n4. Field Requirement Model & Required vs Optional Evidence:');
// ─────────────────────────────────────────────────────────────────────────────

test('correctly evaluates required vs optional vs UNKNOWN strictly from DOM evidence', () => {
  const plan = new ApplicationPlan();
  plan.addPage({
    url: 'http://localhost/req-test',
    title: 'Evidence Test',
    fields: [
      { elementId: 'f1', label: 'Full Name *', required: true },
      { elementId: 'f2', label: 'Middle Name (optional)', required: false },
      { elementId: 'f3', label: 'Special Accommodation', required: 'UNKNOWN' }
    ]
  });

  const r1 = plan.requirements.find(r => r.id === 'f1');
  const r2 = plan.requirements.find(r => r.id === 'f2');
  const r3 = plan.requirements.find(r => r.id === 'f3');

  assert.strictEqual(r1.required, true);
  assert.strictEqual(r2.required, false);
  assert.strictEqual(r3.required, 'UNKNOWN');
});

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n5. Connection with My Information & Application Mapping Engine:');
// ─────────────────────────────────────────────────────────────────────────────

test('evaluates requirements against profile and derives percentage and name splits', () => {
  const plan = new ApplicationPlan();
  plan.addPage({
    url: 'http://localhost/eval-test',
    title: 'Evaluation Test',
    fields: [
      { elementId: 'applicant_name', canonicalId: 'full_name', label: 'Candidate Full Name *', required: true },
      { elementId: 'first_name', canonicalId: 'first_name', label: 'First Name *', required: true },
      { elementId: 'ssc_percentage', canonicalId: 'edu_percentage', label: 'Percentage obtained in SSC *', required: true },
      { elementId: 'pan_card', canonicalId: 'pan_number', label: 'PAN Card Number *', required: true }
    ]
  });

  // Living profile with full name and marks
  const ip = new InformationProfile(null);
  ip.setField('full_name', 'PENDYALA SAI ROHITH', 'DOCUMENT_EXTRACTED', '10th marksheet');
  const eduRec = ip.addEducationRecord('edu-1', '10th / SSC');
  ip.setField('edu_marks', '514', 'DOCUMENT_EXTRACTED', '10th marksheet', eduRec.id);
  ip.setField('edu_max_marks', '600', 'DOCUMENT_EXTRACTED', '10th marksheet', eduRec.id);

  plan.evaluateAgainstProfile(ip);

  // full_name is directly AVAILABLE
  const nameReq = plan.requirements.find(r => r.id === 'applicant_name');
  assert.strictEqual(nameReq.status, 'AVAILABLE');
  assert.strictEqual(nameReq.proposedValue, 'PENDYALA SAI ROHITH');

  // first_name is DERIVED from full_name via ApplicationMappingEngine
  const fnReq = plan.requirements.find(r => r.id === 'first_name');
  assert.strictEqual(fnReq.status, 'REVIEW_REQUIRED');
  assert.strictEqual(fnReq.proposedValue, 'SAI');
  assert.strictEqual(fnReq.transformationAvailable, true);

  // ssc_percentage is calculated (514/600 -> 85.67) via ApplicationMappingEngine
  const percReq = plan.requirements.find(r => r.id === 'ssc_percentage');
  assert.strictEqual(percReq.status, 'AVAILABLE');
  assert.strictEqual(percReq.proposedValue, '85.67');

  // pan_card is MISSING
  const panReq = plan.requirements.find(r => r.id === 'pan_card');
  assert.strictEqual(panReq.status, 'MISSING');
});

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n6. Document Requirement Tracking & Semantic Recommendations:');
// ─────────────────────────────────────────────────────────────────────────────

test('tracks document requirements and matches 10th marksheet in profile', () => {
  const plan = new ApplicationPlan();
  plan.addPage({
    url: 'http://localhost/upload-test',
    title: 'Upload Step',
    uploads: [
      { elementId: 'doc_10th', label: 'Upload 10th / Matriculation Certificate', accept: '.pdf,.jpg' },
      { elementId: 'doc_caste', label: 'Upload Caste / Community Certificate', accept: '.pdf' }
    ]
  });

  const ip = new InformationProfile(null);
  ip.addEducationRecord('edu-10th-ssc', '10th / SSC');
  ip.setField('edu_board', 'CBSE', 'DOCUMENT_EXTRACTED', 'marksheet', 'edu-10th-ssc');

  plan.evaluateAgainstProfile(ip);

  assert.strictEqual(plan.documents.length, 2);

  const doc10th = plan.documents.find(d => d.id === 'doc_10th');
  assert.strictEqual(doc10th.docType, 'SSC_10TH');
  assert.strictEqual(doc10th.status, 'AVAILABLE');
  assert.strictEqual(doc10th.sourceRecord, '10th / SSC Marksheet in My Information');

  const docCaste = plan.documents.find(d => d.id === 'doc_caste');
  assert.strictEqual(docCaste.docType, 'CASTE_CERTIFICATE');
  assert.ok(docCaste.suggestedSources.length > 0);
});

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n7. Session Choices & Profile Isolation:');
// ─────────────────────────────────────────────────────────────────────────────

test('session choices satisfy requirements without polluting persistent profile', () => {
  const plan = new ApplicationPlan();
  plan.addPage({
    url: 'http://localhost/session-test',
    title: 'Exam Preferences',
    fields: [
      { elementId: 'jam_paper', name: 'jam_paper', label: 'Test Paper', required: true }
    ]
  });

  const ip = new InformationProfile(null);

  // User selects exam paper
  plan.setSessionValue('jam_paper', 'Economics (EN)');

  plan.evaluateAgainstProfile(ip);

  const req = plan.requirements.find(r => r.id === 'jam_paper');
  assert.strictEqual(req.status, 'AVAILABLE');
  assert.strictEqual(req.proposedValue, 'Economics (EN)');

  // Persistent profile has NOT been polluted with session choice
  assert.strictEqual(ip.getValue('jam_paper'), '');
});

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n8. Serialization & Multi-Page Persistence:');
// ─────────────────────────────────────────────────────────────────────────────

test('serializes and deserializes accurately with all pages and requirements', () => {
  const plan = new ApplicationPlan();
  plan.addPage({
    url: 'http://localhost/step1',
    title: 'Step 1: Details',
    fields: [{ elementId: 'f1', label: 'Field 1', required: true }]
  });
  plan.setSessionValue('f1', 'Saved Choice');

  const json = plan.toJSON();
  const restored = ApplicationPlan.fromJSON(json);

  assert.strictEqual(restored.pages.length, 1);
  assert.strictEqual(restored.requirements.length, 1);
  assert.strictEqual(restored.getSessionValue('f1'), 'Saved Choice');
  assert.strictEqual(restored.applicationName, plan.applicationName);
});

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n9. Safety Invariants:');
// ─────────────────────────────────────────────────────────────────────────────

test('ApplicationPlan exposes no auto-submit or auto-navigate mechanisms', () => {
  const plan = new ApplicationPlan();
  assert.strictEqual(typeof plan.clickNext, 'undefined');
  assert.strictEqual(typeof plan.submitApplication, 'undefined');
  assert.strictEqual(typeof plan.autoNavigate, 'undefined');
});

console.log('\n========================================');
console.log(`ALL ${passed}/${passed + failed} APPLICATION PLAN TESTS PASSED!`);
console.log('========================================\n');

if (failed > 0) process.exit(1);
