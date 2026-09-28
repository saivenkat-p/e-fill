/**
 * Real Chrome Acceptance & Regression Verification:
 * JAM Registration Portal Clean Field Detection & Autofill
 * ==========================================================
 * Verifies that on real-world compound registration forms (like JOAPS register):
 * 1. Semantic fields are cleanly recognized:
 *    - First Name, Middle Name, Surname, Name of the Candidate
 *    - Email Address, Confirm Email Address
 *    - Country of Residence
 *    - Mobile Number, Confirm Mobile Number
 * 2. Internal / compound helper controls are NOT exposed as false fields:
 *    - NO "+91(IN)" card
 *    - NO "Unnamed Field" card
 *    - NO internal searchbox companion card
 * 3. Autofill succeeds on all approved fields with ZERO "FILL FAILED" cards.
 * 4. Zero auto-submit invariant maintained (window.__efill_submit_count === 0).
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');

const ROOT_DIR = path.resolve(__dirname, '..');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const HTTP_PORT = 9889;
const CDP_PORT = 9243;

let passedSteps = 0;
let failedSteps = 0;

function step(name, ok, details = '') {
  if (ok) {
    console.log(`  ✓ [PASS] ${name}${details ? ' - ' + details : ''}`);
    passedSteps++;
  } else {
    console.error(`  ✗ [FAIL] ${name}${details ? ' - ' + details : ''}`);
    failedSteps++;
  }
}

function startHttpServer() {
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.pdf': 'application/pdf'
  };

  const server = http.createServer((req, res) => {
    let reqPath = decodeURIComponent(req.url.split('?')[0]);
    if (reqPath === '/') reqPath = '/test/jam-registration-harness.html';
    const filePath = path.join(ROOT_DIR, reqPath);

    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('File not found: ' + reqPath);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*'
    });
    fs.createReadStream(filePath).pipe(res);
  });

  return new Promise((resolve) => {
    server.listen(HTTP_PORT, '127.0.0.1', () => {
      console.log(`[HTTP Server] Listening on http://127.0.0.1:${HTTP_PORT}`);
      resolve(server);
    });
  });
}

class CdpClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.msgId = 1;
    this.callbacks = new Map();
    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.callbacks.has(msg.id)) {
        const { resolve, reject } = this.callbacks.get(msg.id);
        this.callbacks.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    };
  }

  static async connect(targetUrlMatch, timeoutMs = 20000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json`);
        const targets = await res.json();
        const target = targets.find(t => t.type === 'page' && (!targetUrlMatch || t.url.includes(targetUrlMatch)));
        if (target && target.webSocketDebuggerUrl) {
          const client = new CdpClient(target.webSocketDebuggerUrl);
          await new Promise((resolve, reject) => {
            client.ws.onopen = resolve;
            client.ws.onerror = reject;
          });
          return client;
        }
      } catch (e) {}
      await new Promise(r => setTimeout(r, 400));
    }
    throw new Error(`Timeout connecting to Chrome CDP target matching: ${targetUrlMatch}`);
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.msgId++;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expr) {
    const res = await this.send('Runtime.evaluate', {
      expression: expr,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      const errText = res.exceptionDetails.exception ? res.exceptionDetails.exception.description : res.exceptionDetails.text;
      throw new Error(errText || JSON.stringify(res.exceptionDetails));
    }
    return res.result ? res.result.value : undefined;
  }

  close() {
    try { this.ws.close(); } catch (e) {}
  }
}

async function runTest() {
  console.log('\n============================================================');
  console.log('🧪 REAL CHROME: JAM REGISTRATION CLEAN FIELD VERIFICATION');
  console.log('============================================================\n');

  const server = await startHttpServer();
  const userDataDir = path.join(os.tmpdir(), `chrome-test-reg-${Date.now()}`);

  const chromeProc = spawn(CHROME_PATH, [
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-extensions',
    `http://127.0.0.1:${HTTP_PORT}/test/jam-registration-harness.html`
  ], { stdio: 'ignore' });

  let client = null;

  try {
    console.log('[CDP] Connecting to Chrome page target...');
    client = await CdpClient.connect('jam-registration-harness.html');
    console.log('[CDP] Connected successfully!\n');

    await client.send('Page.enable');
    await client.send('Runtime.enable');

    // Wait for scripts to initialize
    await new Promise(r => setTimeout(r, 1200));

    // ─────────────────────────────────────────────────────────────
    // 1. Verify Scan & Clean Field Detection
    // ─────────────────────────────────────────────────────────────
    console.log('--- 1. Semantic Field Detection & Compound Control Filtering ---');

    const scanResult = await client.eval(`
      (() => {
        const detector = new window.EFillFormDetector.FormDetector();
        return detector.scan();
      })()
    `);

    const fieldLabels = scanResult.fields.map(f => f.label);
    const fieldIds = scanResult.fields.map(f => f.elementId || f.id);
    console.log('[DEBUG] Detected Fields:', fieldLabels);

    step('1.1 Scan detects non-empty list of fields', scanResult.fields.length >= 7, `Found ${scanResult.fields.length} fields`);

    // Verify key fields are present
    const hasFirstName = fieldLabels.some(l => /first name/i.test(l));
    const hasMiddleName = fieldLabels.some(l => /middle name/i.test(l));
    const hasSurname = fieldLabels.some(l => /surname/i.test(l));
    const hasCandidateName = fieldLabels.some(l => /name of the candidate/i.test(l));
    const hasEmail = fieldLabels.some(l => /email address/i.test(l) && !/confirm/i.test(l));
    const hasConfirmEmail = fieldLabels.some(l => /confirm email address/i.test(l));
    const hasCountry = fieldLabels.some(l => /country of residence/i.test(l));
    const hasMobile = fieldLabels.some(l => /mobile number/i.test(l) && !/confirm/i.test(l));
    const hasConfirmMobile = fieldLabels.some(l => /confirm mobile number/i.test(l));

    step('1.2 Detects First Name', hasFirstName);
    step('1.3 Detects Middle Name', hasMiddleName);
    step('1.4 Detects Surname', hasSurname);
    step('1.5 Detects Name of the Candidate', hasCandidateName);
    step('1.6 Detects Email Address', hasEmail);
    step('1.7 Detects Confirm Email Address', hasConfirmEmail);
    step('1.8 Detects Country of Residence', hasCountry);
    step('1.9 Detects Mobile Number', hasMobile);
    step('1.10 Detects Confirm Mobile Number', hasConfirmMobile);

    // CRITICAL REGRESSION INVARIANTS:
    // NO "Unnamed Field"
    const unnamedFields = scanResult.fields.filter(f => f.label === 'Unnamed Field' || f.label === 'Field');
    step('1.11 ZERO "Unnamed Field" detections', unnamedFields.length === 0, `Unnamed count: ${unnamedFields.length}`);

    // NO standalone dial code "+91(IN)"
    const dialCodeFields = scanResult.fields.filter(f => /^\+91/i.test(f.label));
    step('1.12 ZERO "+91(IN)" standalone field detections', dialCodeFields.length === 0, `Dial code field count: ${dialCodeFields.length}`);

    // Internal search companion is NOT scanned
    const searchboxFields = scanResult.fields.filter(f => f.selector && f.selector.includes('dropdown-search'));
    step('1.13 Internal dropdown searchbox is filtered out', searchboxFields.length === 0);

    // Passwords classified as SECURITY_CREDENTIAL
    const passwordFields = scanResult.fields.filter(f => f.type === 'SECURITY_CREDENTIAL' || f.isSecurityCredential);
    step('1.14 Passwords classified as SECURITY_CREDENTIAL', passwordFields.length === 2, `Count: ${passwordFields.length}`);

    // Real CAPTCHA classified as SECURITY_CHALLENGE
    const captchaFields = scanResult.fields.filter(f => f.type === 'SECURITY_CHALLENGE' || f.isRealSecurityChallenge);
    step('1.15 Real CAPTCHA classified as SECURITY_CHALLENGE', captchaFields.length === 1, `Count: ${captchaFields.length}`);

    // ─────────────────────────────────────────────────────────────
    // 2. Application Mapping Engine: Evaluate Proposals
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- 2. Application Information Mapping & Proposals ---');

    const proposalReport = await client.eval(`
      (() => {
        const profile = new window.EFillInformationProfile.InformationProfile(null);

        // Populate realistic profile information
        profile.setField('full_name', 'PENDYALA SAI ROHITH', 'USER_CONFIRMED', 'Document: 10th Marksheet');
        profile.setField('email', 'rohit.pendyala@example.com', 'USER_CONFIRMED', 'User Entered');
        profile.setField('primary_email', 'rohit.pendyala@example.com', 'USER_CONFIRMED', 'User Entered');
        profile.setField('country', 'India', 'USER_CONFIRMED', 'User Entered');
        profile.setField('primary_phone', '8309595067', 'USER_CONFIRMED', 'User Entered');

        const detector = new window.EFillFormDetector.FormDetector();
        const scan = detector.scan();

        const mappingEngine = window.EFillApplicationMappingEngine.applicationMappingEngine;
        const proposals = scan.fields.map(f => mappingEngine.mapField(f, profile)).filter(Boolean);

        return {
          totalProposals: proposals.length,
          proposals: proposals.map(p => ({
            fieldId: p.fieldId,
            selector: p.selector,
            label: p.label,
            type: p.type,
            canonicalId: p.canonicalId,
            proposedValue: p.proposedValue,
            status: p.status,
            mappingStatus: p.mappingStatus,
            provenance: p.provenance,
            approved: p.approved,
            isSecurityCredential: !!p.isSecurityCredential,
            isRealSecurityChallenge: !!p.isRealSecurityChallenge
          }))
        };
      })()
    `);

    console.log('[DEBUG] Proposals count:', proposalReport.totalProposals);
    const proposals = proposalReport.proposals;

    const pCandidate = proposals.find(p => /candidate/i.test(p.label));
    const pFirst = proposals.find(p => /first name/i.test(p.label));
    const pMiddle = proposals.find(p => /middle name/i.test(p.label));
    const pSurname = proposals.find(p => /surname/i.test(p.label));
    const pEmail = proposals.find(p => /email address/i.test(p.label) && !/confirm/i.test(p.label));
    const pConfirmEmail = proposals.find(p => /confirm email address/i.test(p.label));
    const pCountry = proposals.find(p => /country of residence/i.test(p.label));
    const pMobile = proposals.find(p => /mobile number/i.test(p.label) && !/confirm/i.test(p.label));
    const pConfirmMobile = proposals.find(p => /confirm mobile number/i.test(p.label));
    const pPasswords = proposals.filter(p => p.type === 'SECURITY_CREDENTIAL' || p.isSecurityCredential);
    const pCaptcha = proposals.find(p => p.type === 'SECURITY_CHALLENGE' || p.isRealSecurityChallenge);

    step('2.1 Candidate Name maps to "PENDYALA SAI ROHITH"', pCandidate && pCandidate.proposedValue === 'PENDYALA SAI ROHITH');
    step('2.2 First Name derived as "SAI"', pFirst && pFirst.proposedValue === 'SAI');
    step('2.3 Middle Name derived as "ROHITH"', pMiddle && pMiddle.proposedValue === 'ROHITH');
    step('2.4 Surname derived as "PENDYALA"', pSurname && pSurname.proposedValue === 'PENDYALA');
    step('2.5 Email Address maps to "rohit.pendyala@example.com"', pEmail && pEmail.proposedValue === 'rohit.pendyala@example.com');
    step('2.6 Confirm Email Address maps to "rohit.pendyala@example.com"', pConfirmEmail && pConfirmEmail.proposedValue === 'rohit.pendyala@example.com');
    step('2.7 Country of Residence maps to "India"', pCountry && pCountry.proposedValue === 'India');
    step('2.8 Mobile Number maps to "8309595067"', pMobile && pMobile.proposedValue === '8309595067');
    step('2.9 Confirm Mobile Number maps to "8309595067"', pConfirmMobile && pConfirmMobile.proposedValue === '8309595067');
    step('2.10 Password proposals require user action (not missing, not auto-approved)', pPasswords.length === 2 && pPasswords.every(p => p.status === 'USER_ACTION_REQUIRED' && !p.approved));
    step('2.11 Real CAPTCHA proposal requires user action (not missing, not auto-approved)', pCaptcha && pCaptcha.status === 'USER_ACTION_REQUIRED' && !pCaptcha.approved);

    // ─────────────────────────────────────────────────────────────
    // 3. User Approval & Autofill Execution (Zero Fill Failed)
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- 3. User Approval & Autofill Execution ---');

    const autofillResult = await client.eval(`
      (() => {
        const profile = new window.EFillInformationProfile.InformationProfile(null);
        profile.setField('full_name', 'PENDYALA SAI ROHITH', 'USER_CONFIRMED', 'Document: 10th Marksheet');
        profile.setField('email', 'rohit.pendyala@example.com', 'USER_CONFIRMED', 'User Entered');
        profile.setField('primary_email', 'rohit.pendyala@example.com', 'USER_CONFIRMED', 'User Entered');
        profile.setField('country', 'India', 'USER_CONFIRMED', 'User Entered');
        profile.setField('primary_phone', '8309595067', 'USER_CONFIRMED', 'User Entered');

        const detector = new window.EFillFormDetector.FormDetector();
        const scan = detector.scan();
        const mappingEngine = window.EFillApplicationMappingEngine.applicationMappingEngine;
        const proposals = scan.fields.map(f => mappingEngine.mapField(f, profile)).filter(Boolean);

        // User approves all valid proposals (including derived names after review)
        const approved = proposals.map(p => ({
          ...p,
          approved: !!p.proposedValue && p.status !== 'USER_ACTION_REQUIRED'
        }));

        const autofillEngine = new window.EFillAutofill.AutofillEngine();
        const report = autofillEngine.fill(approved);

        const countryRadioIndia = document.getElementById('country_india');
        const countryRadioOther = document.getElementById('country_other');

        return {
          report,
          domValues: {
            firstName: document.getElementById('first_name').value,
            middleName: document.getElementById('middle_name').value,
            surname: document.getElementById('surname').value,
            candidateName: document.getElementById('candidate_name').value,
            email: document.getElementById('email').value,
            confirmEmail: document.getElementById('confirm_email').value,
            countryIndiaChecked: countryRadioIndia ? countryRadioIndia.checked : false,
            countryOtherChecked: countryRadioOther ? countryRadioOther.checked : false,
            mobile: document.getElementById('mobile').value,
            confirmMobile: document.getElementById('confirm_mobile').value,
            password: document.getElementById('password').value,
            confirmPassword: document.getElementById('confirm_password').value,
            captcha: document.getElementById('captcha').value,
            submitCount: window.__efill_submit_count
          }
        };
      })()
    `);

    const { report, domValues } = autofillResult;
    console.log('[DEBUG] Autofill Report:', {
      filledCount: report.filledCount,
      failedCount: report.failedCount,
      totalAttempted: report.totalAttempted
    });
    console.log('[DEBUG] DOM Values:', domValues);

    step('3.1 All approved proposals filled successfully', report.filledCount >= 9, `Filled: ${report.filledCount}`);
    step('3.2 ZERO "FILL FAILED" fields in report', report.failedCount === 0, `Failed count: ${report.failedCount}`);

    step('3.3 DOM #first_name contains "SAI"', domValues.firstName === 'SAI');
    step('3.4 DOM #middle_name contains "ROHITH"', domValues.middleName === 'ROHITH');
    step('3.5 DOM #surname contains "PENDYALA"', domValues.surname === 'PENDYALA');
    step('3.6 DOM #candidate_name contains "PENDYALA SAI ROHITH"', domValues.candidateName === 'PENDYALA SAI ROHITH');
    step('3.7 DOM #email contains "rohit.pendyala@example.com"', domValues.email === 'rohit.pendyala@example.com');
    step('3.8 DOM #confirm_email contains "rohit.pendyala@example.com"', domValues.confirmEmail === 'rohit.pendyala@example.com');
    step('3.9 DOM #country_india radio is checked', domValues.countryIndiaChecked === true);
    step('3.10 DOM #country_other radio is NOT checked', domValues.countryOtherChecked === false);
    step('3.11 DOM #mobile contains "8309595067"', domValues.mobile === '8309595067');
    step('3.12 DOM #confirm_mobile contains "8309595067"', domValues.confirmMobile === '8309595067');
    step('3.13 DOM password fields NOT autofilled', domValues.password === '' && domValues.confirmPassword === '');
    step('3.14 DOM CAPTCHA field NOT autofilled', domValues.captcha === '');

    // ─────────────────────────────────────────────────────────────
    // 4. Safety Invariants
    // ─────────────────────────────────────────────────────────────
    console.log('\n--- 4. Safety Invariants ---');
    step('4.1 Zero auto-submission invariant maintained', domValues.submitCount === 0, `Submit count: ${domValues.submitCount}`);

  } catch (err) {
    console.error('Fatal test error:', err);
    failedSteps++;
  } finally {
    if (client) client.close();
    chromeProc.kill('SIGKILL');
    server.close();
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (e) {}
  }

  console.log('\n============================================================');
  console.log(`📊 REGISTRATION CLEAN FIELDS RESULTS: ${passedSteps} PASSED, ${failedSteps} FAILED`);
  console.log('============================================================\n');

  if (failedSteps > 0) process.exit(1);
}

runTest();
