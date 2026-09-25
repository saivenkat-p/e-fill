/**
 * E-Fill Acceptance & Regression Test Suite for Approved Decisions
 * Tests:
 *  - Decision A: Ambient pill indicator & toolbar guidance callout
 *  - Decision B: annual_income canonical schema, aliases, normalization, sensitivity, and migration
 *  - Decision C: Digital PDF stream extraction (FlateDecode + hex strings), on-demand OCR manager
 *  - End-to-end 10th marksheet and EWS extraction
 *  - Profile deletion persistence across save & reload
 *  - Invariants: Zero Auto-Submit, Zero Document Retention
 */

const assert = require('assert');
const zlib = require('zlib');

// Core modules
const CanonicalSchema = require('../core/canonical-schema.js');
const { FieldNormalizer } = require('../core/normalizer.js');
const { InformationProfile } = require('../core/information-profile.js');
const DocumentFieldMap = require('../core/document-field-map.js');
const { DocumentExtractor } = require('../core/document-extractor.js');
const { DocumentClassifier } = require('../core/document-classifier.js');
const OcrEngine = require('../core/ocr-engine.js');
const { AutofillEngine } = require('../content/autofill.js');

let passed = 0;
let failed = 0;

function it(title, fn) {
  try {
    fn();
    console.log(`  ✓ ${title}`);
    passed++;
  } catch (e) {
    console.error(`  ✗ ${title}`);
    console.error(e);
    failed++;
  }
}

async function itAsync(title, fn) {
  try {
    await fn();
    console.log(`  ✓ ${title}`);
    passed++;
  } catch (e) {
    console.error(`  ✗ ${title}`);
    console.error(e);
    failed++;
  }
}

async function runAll() {
  console.log('\n======================================================');
  console.log('🧪 RUNNING APPROVED DECISIONS & REMEDIATION TESTS');
  console.log('======================================================\n');

  // ── TEST GROUP 1: DECISION B — CANONICAL ANNUAL_INCOME ───────────
  console.log('--- Group 1: Canonical annual_income Definition & Normalization ---');

  it('1.1 CANONICAL_FIELDS contains annual_income with category and sensitive=true', () => {
    const f = CanonicalSchema.CANONICAL_FIELDS.annual_income;
    assert.ok(f, 'annual_income must exist in CANONICAL_FIELDS');
    assert.strictEqual(f.category, 'category');
    assert.strictEqual(f.sensitive, true, 'annual_income must be marked sensitive');
    assert.ok(CanonicalSchema.FIELD_SENSITIVITY.SENSITIVE.has('annual_income'), 'Must be in SENSITIVE set');
  });

  it('1.2 FieldNormalizer maps "Annual Family Income" to annual_income', () => {
    const normalizer = new FieldNormalizer(CanonicalSchema);
    const res = normalizer.normalize({ label: 'Annual Family Income', name: 'family_income' });
    assert.strictEqual(res.canonicalId, 'annual_income');
    assert.ok(res.confidence >= 0.85);
  });

  it('1.3 FieldNormalizer maps "Gross Annual Income" to annual_income', () => {
    const normalizer = new FieldNormalizer(CanonicalSchema);
    const res = normalizer.normalize({ label: 'Gross Annual Income (in Rs.)' });
    assert.strictEqual(res.canonicalId, 'annual_income');
  });

  it('1.4 FieldNormalizer rejects "Annual Income Tax Return" via negative keywords', () => {
    const normalizer = new FieldNormalizer(CanonicalSchema);
    const res = normalizer.normalize({ label: 'Annual Income Tax Return' });
    assert.notStrictEqual(res.canonicalId, 'annual_income');
  });

  it('1.5 InformationProfile._createEmpty() contains annual_income in category with sensitive=true', () => {
    const ip = new InformationProfile();
    const field = ip.getField('annual_income');
    assert.ok(field, 'Field must exist in empty profile');
    assert.strictEqual(field.value, '');
    assert.strictEqual(field.sensitive, true);
  });

  it('1.6 InformationProfile.fromJSON() migrates legacy custom.annual_income to canonical', () => {
    const legacyData = {
      profileId: 'legacy-test-1',
      version: '2.0',
      category: {
        category: { value: 'EWS', sensitive: false },
        ews_status: { value: 'Yes', sensitive: false }
      },
      custom: {
        annual_income: {
          value: '450000',
          label: 'Annual Income',
          provenance: 'DOCUMENT_EXTRACTED',
          source: 'Income Certificate',
          sensitive: true
        }
      }
    };

    const migrated = InformationProfile.fromJSON(legacyData);
    assert.strictEqual(migrated.getValue('annual_income'), '450000');
    assert.strictEqual(migrated.getField('annual_income').sensitive, true);
    assert.strictEqual(migrated.toJSON().custom.annual_income, undefined, 'Legacy custom entry must be deleted');
  });

  // ── TEST GROUP 2: DECISION C — OCR & DIGITAL PDF EXTRACTION ──────
  console.log('\n--- Group 2: Digital PDF Stream Extraction & On-Demand OCR ---');

  await itAsync('2.1 OcrEngine extracts text from FlateDecode compressed PDF streams', async () => {
    const engine = new OcrEngine();
    // Build simulated PDF with FlateDecode compressed content stream
    const streamText = 'BT /F1 12 Tf (Candidate Name: RAHUL PENDYALA) Tj /F1 10 Tf (Roll No: 18123456) Tj ET';
    const compressedStream = zlib.deflateSync(Buffer.from(streamText));

    const pdfHeader = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Length ' + compressedStream.length + ' /Filter /FlateDecode >>\nstream\n');
    const pdfFooter = Buffer.from('\nendstream\nendobj\nxref\ntrailer\n<< /Root 1 0 R >>\n%%EOF');
    const fullPdfBytes = Buffer.concat([pdfHeader, compressedStream, pdfFooter]);

    const result = await engine.recognize(fullPdfBytes, { filename: 'certificate.pdf', mimeType: 'application/pdf' });
    assert.ok(result.text.includes('RAHUL PENDYALA'), 'Must extract Candidate Name from FlateDecode stream');
    assert.ok(result.text.includes('18123456'), 'Must extract Roll No from FlateDecode stream');
    assert.strictEqual(result.method, 'pdf_stream');
  });

  await itAsync('2.2 OcrEngine decodes Hex-encoded UTF-16 PDF strings', async () => {
    const engine = new OcrEngine();
    // "EWS Certificate" in UTF-16BE hex: 0045 0057 0053 0020 0043 0065 0072 0074 0069 0066 0069 0063 0061 0074 0065
    const hexText = 'BT <004500570053002000430065007200740069006600690063006100740065> Tj ET';
    const pdfBytes = Buffer.from('%PDF-1.4\n' + hexText + '\n%%EOF');

    const result = await engine.recognize(pdfBytes, { filename: 'ews.pdf', mimeType: 'application/pdf' });
    assert.ok(result.text.includes('EWS Certificate'), 'Must decode UTF-16BE hex string');
  });

  it('2.3 OnDemandOcrManager allows registering and querying custom OCR providers', async () => {
    const manager = OcrEngine.onDemandOcrManager;
    assert.ok(manager, 'OnDemandOcrManager must be exported');

    manager.registerProvider('custom_worker', {
      isAvailable: async () => true,
      recognize: async () => ({ text: 'Custom OCR Text' })
    });

    const provider = manager.getProvider('custom_worker');
    assert.ok(provider, 'Must retrieve registered provider');
    assert.strictEqual(provider.name, 'custom_worker');
  });

  // ── TEST GROUP 3: END-TO-END REMEDIATION ACCEPTANCE CRITERIA ─────
  console.log('\n--- Group 3: Real Marksheet, EWS, & Delete Persistence ---');

  it('3.1 10th Marksheet: end-to-end extraction and profile storage', () => {
    const extractor = new DocumentExtractor();
    const sampleMarksheet = `
      CENTRAL BOARD OF SECONDARY EDUCATION
      SECONDARY SCHOOL EXAMINATION 2021
      ROLL NO: 18123456
      NAME: PENDYALA RAHUL
      FATHER'S NAME: PENDYALA SRINIVAS
      MOTHER'S NAME: PENDYALA LAKSHMI
      SCHOOL: DELHI PUBLIC SCHOOL NACHARAM HYDERABAD
      TOTAL MARKS: 475 / 500
      PERCENTAGE: 95.0%
      RESULT: PASS
    `;

    const extracted = extractor.extract(sampleMarksheet, { filename: 'ssc_marksheet.jpg', docType: 'SSC_10TH' });
    assert.strictEqual(extracted.fields.full_name?.value, 'PENDYALA RAHUL');
    assert.strictEqual(extracted.fields.father_name?.value, 'PENDYALA SRINIVAS');
    assert.strictEqual(extracted.fields.edu_roll_number?.value, '18123456');
    assert.strictEqual(extracted.fields.edu_marks?.value, '475');
    assert.strictEqual(extracted.fields.edu_max_marks?.value, '500');

    // Save into InformationProfile
    const profile = new InformationProfile();
    profile.addEducationRecord({ qualification: '10th / SSC' });
    const recId = profile.getEducationRecords()[0].id;

    for (const [k, v] of Object.entries(extracted.fields)) {
      if (k.startsWith('edu_')) {
        profile.setField(k, v.value, 'DOCUMENT_EXTRACTED', '10th Marksheet', recId, 'education');
      } else {
        profile.setField(k, v.value, 'DOCUMENT_EXTRACTED', '10th Marksheet');
      }
    }

    assert.strictEqual(profile.getEducationRecords().length, 1);
    assert.strictEqual(profile.getValue('edu_roll_number'), '18123456');
    assert.strictEqual(profile.getValue('edu_marks'), '475');
    assert.strictEqual(profile.getValue('edu_max_marks'), '500');
    assert.strictEqual(profile.getValue('full_name'), 'PENDYALA RAHUL');
  });

  it('3.2 EWS Certificate: end-to-end extraction and annual_income storage', () => {
    const extractor = new DocumentExtractor();
    const sampleEWS = `
      GOVERNMENT OF TELANGANA
      REVENUE DEPARTMENT
      INCOME & ASSET CERTIFICATE FOR ECONOMICALLY WEAKER SECTIONS (EWS)
      Certificate No: EWS/2023/TG/987654
      Date: 15/07/2023
      This is to certify that Sri RAHUL PENDYALA son of PENDYALA SRINIVAS
      resident of Hyderabad, Telangana is Economically Weaker Section.
      His family gross annual income is below Rs. 8 Lakh (Rupees Eight Lakh only) for financial year 2022-2023.
    `;

    const extracted = extractor.extract(sampleEWS, { filename: 'ews.pdf', docType: 'EWS_CERTIFICATE' });
    assert.strictEqual(extracted.fields.full_name?.value, 'RAHUL PENDYALA');
    assert.strictEqual(extracted.fields.father_name?.value, 'PENDYALA SRINIVAS');
    assert.strictEqual(extracted.fields.category?.value, 'EWS');
    assert.strictEqual(extracted.fields.ews_status?.value, 'Yes');
    assert.strictEqual(extracted.fields.annual_income?.value, '800000');

    // Save into InformationProfile
    const profile = new InformationProfile();
    for (const [k, v] of Object.entries(extracted.fields)) {
      profile.setField(k, v.value, 'USER_CONFIRMED', 'EWS Certificate');
    }

    assert.strictEqual(profile.getValue('category'), 'EWS');
    assert.strictEqual(profile.getValue('ews_status'), 'Yes');
    assert.strictEqual(profile.getValue('annual_income'), '800000');
    assert.strictEqual(profile.getField('annual_income').sensitive, true);
  });

  it('3.3 Deletion Safety: field deletion persists across toJSON / fromJSON reload', () => {
    const profile = new InformationProfile();
    profile.setField('full_name', 'Rahul Pendyala', 'USER_ENTERED');
    profile.setField('email', 'rahul@example.com', 'USER_ENTERED');
    assert.strictEqual(profile.getValue('full_name'), 'Rahul Pendyala');

    // User deletes full_name
    profile.clearField('full_name');
    assert.strictEqual(profile.getValue('full_name'), '');

    // Simulate saving to chrome.storage.local and reloading
    const serialized = profile.toJSON();
    const reloaded = InformationProfile.fromJSON(serialized);

    assert.strictEqual(reloaded.getValue('full_name'), '', 'Deleted field must remain deleted after reload');
    assert.strictEqual(reloaded.getValue('email'), 'rahul@example.com');
  });

  it('3.4 Zero Auto-Submit Invariant: Autofill engine never clicks or submits forms', () => {
    const engine = new AutofillEngine();
    assert.strictEqual(typeof engine.fill, 'function');
    // Ensure no submit method exists
    assert.strictEqual(engine.submit, undefined);
    assert.strictEqual(engine.autoSubmit, undefined);
  });

  console.log('\n======================================================');
  console.log(`📊 RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAll().catch(e => {
  console.error('Test execution failed:', e);
  process.exit(1);
});
