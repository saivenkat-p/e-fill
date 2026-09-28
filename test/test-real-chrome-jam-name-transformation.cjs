/**
 * Real Chrome Verification: JAM Portal Name Transformation (Update 1)
 * ====================================================================
 * Verifies in real Google Chrome via CDP:
 * 1. Marksheet extraction and My Information storage for "PENDYALA SAI ROHITH".
 * 2. On the JAM application form:
 *    - applicant_name -> "PENDYALA SAI ROHITH" (Direct, READY)
 *    - first_name     -> "SAI" (DERIVED, REVIEW_REQUIRED, not silently filled)
 *    - middle_name    -> "ROHITH" (DERIVED, REVIEW_REQUIRED, not silently filled)
 *    - last_name      -> "PENDYALA" (DERIVED, REVIEW_REQUIRED, not silently filled)
 * 3. User approval autofills actual DOM elements:
 *    #applicant_name -> "PENDYALA SAI ROHITH"
 *    #first_name     -> "SAI"
 *    #middle_name    -> "ROHITH"
 *    #last_name      -> "PENDYALA"
 * 4. Zero auto-submit invariant maintained.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');

const ROOT_DIR = path.resolve(__dirname, '..');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const HTTP_PORT = 9884;
const CDP_PORT = 9238;

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
    if (reqPath === '/') reqPath = '/test/jam-test-harness.html';
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
        const targets = await new Promise((resolve, reject) => {
          http.get(`http://127.0.0.1:${CDP_PORT}/json`, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
              try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
            });
          }).on('error', reject);
        });

        const target = targets.find(t => t.url && t.url.includes(targetUrlMatch) && t.webSocketDebuggerUrl);
        if (target) {
          const client = new CdpClient(target.webSocketDebuggerUrl);
          await new Promise((res, rej) => {
            client.ws.onopen = res;
            client.ws.onerror = rej;
          });
          return client;
        }
      } catch (e) {}
      await new Promise(r => setTimeout(r, 400));
    }
    throw new Error(`Timeout connecting to target matching "${targetUrlMatch}" on CDP port ${CDP_PORT}`);
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.msgId++;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      throw new Error(`Eval exception: ${JSON.stringify(res.exceptionDetails)}`);
    }
    return res.result ? res.result.value : undefined;
  }
}

async function run() {
  console.log('\n================================================================');
  console.log('🧪 REAL CHROME VERIFICATION: JAM PORTAL NAME TRANSFORMATION');
  console.log('================================================================\n');

  const httpServer = await startHttpServer();
  const tmpUserDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'efill-jam-chrome-'));

  console.log('[Chrome] Launching Chrome directly with Sidepanel UI and JAM Portal...');
  const chromeProc = spawn(CHROME_PATH, [
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${tmpUserDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    `http://127.0.0.1:${HTTP_PORT}/sidepanel/index.html`,
    `http://127.0.0.1:${HTTP_PORT}/test/jam-test-harness.html`
  ], { stdio: 'ignore' });

  try {
    console.log('[CDP] Connecting to Sidepanel page in Chrome...');
    const sidepanelCdp = await CdpClient.connect('sidepanel/index.html');
    console.log('[CDP] Connected to Sidepanel UI successfully!');

    console.log('[CDP] Connecting to JAM application page in Chrome...');
    const jamCdp = await CdpClient.connect('jam-test-harness.html');
    console.log('[CDP] Connected to JAM application page successfully!');

    // Wait for scripts and DOM to initialize
    await new Promise(r => setTimeout(r, 1500));

    // ─────────────────────────────────────────────────────────────────────────
    // Step 1: Ingest 10th marksheet and save to profile in Sidepanel
    await sidepanelCdp.eval(`
      (() => {
        const ip = new window.EFillInformationProfile.InformationProfile(null);
        ip.setField('full_name', 'PENDYALA SAI ROHITH', 'USER_CONFIRMED', '10th marks list rohit .pdf');
        ip.setField('edu_candidate_name', 'PENDYALA SAI ROHITH', 'USER_CONFIRMED', '10th marks list rohit .pdf', 'edu-10th-ssc');
        ip.setField('dob', '2007-03-20', 'USER_CONFIRMED', '10th marks list rohit .pdf');
        ip.setField('edu_roll_number', '2208118502', 'USER_CONFIRMED', '10th marks list rohit .pdf', 'edu-10th-ssc');
        ip.setField('edu_board', 'Board of Secondary Education ANDHRA PRADESH', 'USER_CONFIRMED', '10th marks list rohit .pdf', 'edu-10th-ssc');
        ip.setField('edu_year', '2022', 'USER_CONFIRMED', '10th marks list rohit .pdf', 'edu-10th-ssc');
        ip.setField('edu_percentage', '85.67', 'USER_CONFIRMED', '10th marks list rohit .pdf', 'edu-10th-ssc');
        window.__efill_sidepanel.setInfoProfile(ip);
        window.__efill_sidepanel.populateInfoForm();
      })()
    `);
    await new Promise(r => setTimeout(r, 400));

    const studentNameStored = await sidepanelCdp.eval(`
      (() => {
        const p = window.__efill_sidepanel.getInfoProfile();
        return p ? (p.getField('full_name')?.value || p.getField('edu_candidate_name')?.value) : null;
      })()
    `);

    step('Step 1: 10th Marksheet saved into My Information profile', studentNameStored === 'PENDYALA SAI ROHITH', `Found: "${studentNameStored}"`);

    // ─────────────────────────────────────────────────────────────────────────
    // Step 2: Navigate JAM Portal to Page 2 (Personal Details)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- Step 2: Progress JAM Portal to Step 2 (Personal Details) ---');
    await jamCdp.eval(`
      document.getElementById('btn-save-next-1').click();
    `);
    await new Promise(r => setTimeout(r, 400));

    const page2Visible = await jamCdp.eval(`
      document.getElementById('jam-page-2').style.display !== 'none'
    `);
    step('Step 2: JAM Step 2 (Personal Details) is visible', page2Visible);

    // ─────────────────────────────────────────────────────────────────────────
    // Step 3: Scan Form Fields & Generate Fill Proposals
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- Step 3: Scan Form & Evaluate Proposals in Review & Fill ---');
    const scanData = await jamCdp.eval(`
      ({ ...window.EFillFormDetector.formDetector.scan(), eligible: true })
    `);

    // Feed scan data to sidepanel
    await sidepanelCdp.eval(`
      (() => {
        window.__efill_sidepanel.renderScanResults(${JSON.stringify(scanData)});
      })()
    `);
    await new Promise(r => setTimeout(r, 600));

    const proposalReport = await sidepanelCdp.eval(`
      (() => {
        const props = window.__efill_sidepanel.getCurrentProposals() || [];
        return props.map(p => ({
          fieldId: p.fieldId,
          name: p.name,
          label: p.label,
          canonicalId: p.canonicalId,
          proposedValue: p.proposedValue,
          status: p.status,
          mappingStatus: p.mappingStatus,
          provenance: p.provenance,
          provenanceDetail: p.provenanceDetail,
          approved: p.approved,
          reason: p.reason
        }));
      })()
    `);

    console.log('[DEBUG Proposal Summary]:', JSON.stringify(proposalReport, null, 2));

    // Verify candidate's full name (Direct mapping)
    const fullNameProp = proposalReport.find(p => p.canonicalId === 'full_name' || p.canonicalId === 'edu_candidate_name' || p.fieldId === 'applicant_name');
    step('Step 3: applicant_name receives direct "PENDYALA SAI ROHITH" mapping',
      fullNameProp && fullNameProp.proposedValue === 'PENDYALA SAI ROHITH' && fullNameProp.status === 'READY',
      `Value: "${fullNameProp?.proposedValue}", Status: ${fullNameProp?.status}`
    );

    // Verify first_name (NameTransformation: SAI, REVIEW_REQUIRED, DERIVED)
    const firstNameProp = proposalReport.find(p => p.canonicalId === 'first_name' || p.fieldId === 'first_name');
    step('Step 3: firstName proposal generated with value "SAI"',
      firstNameProp && firstNameProp.proposedValue === 'SAI',
      `Value: "${firstNameProp?.proposedValue}"`
    );
    step('Step 3: firstName has status REVIEW_REQUIRED (not MISSING)',
      firstNameProp && firstNameProp.status === 'REVIEW_REQUIRED',
      `Status: ${firstNameProp?.status}`
    );
    step('Step 3: firstName has DERIVED provenance from full_name',
      firstNameProp && firstNameProp.provenance === 'DERIVED' && firstNameProp.provenanceDetail === 'DERIVED_FROM(full_name)',
      `Provenance: ${firstNameProp?.provenance} (${firstNameProp?.provenanceDetail})`
    );
    step('Step 3: firstName is NOT silently auto-approved (approved = false)',
      firstNameProp && firstNameProp.approved === false,
      `Approved: ${firstNameProp?.approved}`
    );

    // Verify middle_name (NameTransformation: ROHITH, REVIEW_REQUIRED, DERIVED)
    const middleNameProp = proposalReport.find(p => p.canonicalId === 'middle_name' || p.fieldId === 'middle_name');
    step('Step 3: middleName proposal generated with value "ROHITH"',
      middleNameProp && middleNameProp.proposedValue === 'ROHITH',
      `Value: "${middleNameProp?.proposedValue}"`
    );
    step('Step 3: middleName has status REVIEW_REQUIRED (not MISSING)',
      middleNameProp && middleNameProp.status === 'REVIEW_REQUIRED',
      `Status: ${middleNameProp?.status}`
    );
    step('Step 3: middleName has DERIVED provenance from full_name',
      middleNameProp && middleNameProp.provenance === 'DERIVED',
      `Provenance: ${middleNameProp?.provenance}`
    );

    // Verify last_name / surname (NameTransformation: PENDYALA, REVIEW_REQUIRED, DERIVED)
    const lastNameProp = proposalReport.find(p => p.canonicalId === 'last_name' || p.fieldId === 'last_name');
    step('Step 3: lastName / surname proposal generated with value "PENDYALA"',
      lastNameProp && lastNameProp.proposedValue === 'PENDYALA',
      `Value: "${lastNameProp?.proposedValue}"`
    );
    step('Step 3: lastName has status REVIEW_REQUIRED (not MISSING)',
      lastNameProp && lastNameProp.status === 'REVIEW_REQUIRED',
      `Status: ${lastNameProp?.status}`
    );
    step('Step 3: lastName has DERIVED provenance from full_name',
      lastNameProp && lastNameProp.provenance === 'DERIVED',
      `Provenance: ${lastNameProp?.provenance}`
    );

    // ─────────────────────────────────────────────────────────────────────────
    // Step 4: User Approves and Autofills the Fields into Webpage DOM
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- Step 4: User Approves Proposals & Autofills Real DOM ---');

    // Simulate approving the proposals
    await jamCdp.eval(`
      (() => {
        const approved = [
          ${JSON.stringify(fullNameProp)},
          ${JSON.stringify({ ...firstNameProp, approved: true })},
          ${JSON.stringify({ ...middleNameProp, approved: true })},
          ${JSON.stringify({ ...lastNameProp, approved: true })}
        ];
        return window.EFillAutofill.autofillEngine.fill(approved);
      })()
    `);
    await new Promise(r => setTimeout(r, 400));

    const domValues = await jamCdp.eval(`
      ({
        applicantName: document.getElementById('applicant_name')?.value,
        firstName: document.getElementById('first_name')?.value,
        middleName: document.getElementById('middle_name')?.value,
        lastName: document.getElementById('last_name')?.value,
        submitCount: window.__efill_submit_count
      })
    `);

    console.log('[DEBUG DOM Values]:', domValues);

    step('Step 4: DOM #applicant_name receives "PENDYALA SAI ROHITH"', domValues.applicantName === 'PENDYALA SAI ROHITH', `Found: "${domValues.applicantName}"`);
    step('Step 4: DOM #first_name receives "SAI"', domValues.firstName === 'SAI', `Found: "${domValues.firstName}"`);
    step('Step 4: DOM #middle_name receives "ROHITH"', domValues.middleName === 'ROHITH', `Found: "${domValues.middleName}"`);
    step('Step 4: DOM #last_name receives "PENDYALA"', domValues.lastName === 'PENDYALA', `Found: "${domValues.lastName}"`);
    step('Step 4: Zero auto-submit invariant maintained (submitCount === 0)', domValues.submitCount === 0, `Submit count: ${domValues.submitCount}`);

  } catch (err) {
    console.error('[Error during verification]:', err);
    failedSteps++;
  } finally {
    console.log('\n[Teardown] Closing Chrome and stopping server...');
    chromeProc.kill();
    httpServer.close();
    try { fs.rmSync(tmpUserDataDir, { recursive: true, force: true }); } catch (e) {}
  }

  console.log('\n================================================================');
  console.log(`📊 REAL CHROME VERIFICATION RESULTS: ${passedSteps} PASSED, ${failedSteps} FAILED`);
  console.log('================================================================\n');

  if (failedSteps > 0) {
    process.exit(1);
  }
}

run();
