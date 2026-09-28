/**
 * Real Chrome Verification: Application Plan Multi-Step Journey on JAM 2027 (Update 2)
 * ====================================================================================
 * Verifies in real Google Chrome via CDP:
 * 1. Step 1 (Examination Preferences):
 *    - Application Plan is initialized with domain, applicationName ("JAM 2027").
 *    - Step 1 is recorded as DISCOVERED with requirementsKnown = true.
 *    - Inferred stepper steps are recorded as INFERRED with requirementsKnown = false (no fabricated fields).
 *    - Session choice (jam_paper = 'Mathematics (MA)') satisfies requirement without polluting profile.
 *    - Step 1 autofill fills #jam_paper.
 * 2. User manually clicks "Save & Next" to advance to Step 2 (NO auto-navigation by E-Fill).
 * 3. Step 2 (Personal Details):
 *    - Application Plan accumulates Step 2 without wiping Step 1 (totalPagesDiscovered = 2).
 *    - Step 1 is COMPLETED, Step 2 is CURRENT.
 *    - Cumulative requirements contain both Step 1 and Step 2 fields.
 *    - Review & Fill works on Step 2 with Application Mapping Engine (PENDYALA SAI ROHITH -> SAI / ROHITH / PENDYALA).
 *    - User approves and autofills Step 2 DOM.
 *    - Zero auto-submit invariant maintained (submitCount === 0).
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');

const ROOT_DIR = path.resolve(__dirname, '..');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const HTTP_PORT = 9885;
const CDP_PORT = 9239;

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
        const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json`);
        const targets = await res.json();
        const target = targets.find(t => t.url && t.url.includes(targetUrlMatch));
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
  console.log('🧪 REAL CHROME VERIFICATION: APPLICATION PLAN MULTI-STEP (JAM)');
  console.log('================================================================\n');

  const tmpUserDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'efill-plan-chrome-'));

  const httpServer = await startHttpServer();
  let chromeProc = null;
  let sidepanelCdp = null;
  let jamCdp = null;

  try {
    console.log('[Chrome] Launching Chrome directly with Sidepanel UI and JAM Portal...');
    chromeProc = spawn(CHROME_PATH, [
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${tmpUserDataDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      `http://127.0.0.1:${HTTP_PORT}/sidepanel/index.html`,
      `http://127.0.0.1:${HTTP_PORT}/test/jam-test-harness.html`
    ], { stdio: 'ignore' });
    await new Promise(r => setTimeout(r, 2500));

    console.log('[CDP] Connecting to Sidepanel page in Chrome...');
    sidepanelCdp = await CdpClient.connect('sidepanel/index.html');
    await sidepanelCdp.send('Page.enable');
    await sidepanelCdp.send('Runtime.enable');
    console.log('[CDP] Connected to Sidepanel UI successfully!');

    console.log('[CDP] Connecting to JAM application page in Chrome...');
    jamCdp = await CdpClient.connect('jam-test-harness.html');
    await jamCdp.send('Page.enable');
    await jamCdp.send('Runtime.enable');
    console.log('[CDP] Connected to JAM application page successfully!');

    await new Promise(r => setTimeout(r, 1000));

    // ─────────────────────────────────────────────────────────────────────────
    // Step 0: Initialize Profile with 10th Marksheet details (Rohith)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- Step 0: Initialize Profile with 10th Marksheet Information ---');
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
    step('Step 0: Living Profile initialized with 10th Marksheet (PENDYALA SAI ROHITH)', true);

    // ─────────────────────────────────────────────────────────────────────────
    // Step 1: Scan JAM Step 1 (Examination Preferences) & Evaluate Plan
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- Step 1: Scan JAM Step 1 & Build Initial Application Plan ---');
    const scan1 = await jamCdp.eval(`({ ...window.EFillFormDetector.formDetector.scan(), eligible: true })`);

    await sidepanelCdp.eval(`
      (() => {
        window.__efill_sidepanel.renderScanResults(${JSON.stringify(scan1)});
      })()
    `);
    await new Promise(r => setTimeout(r, 600));

    const planSummary1 = await sidepanelCdp.eval(`
      (() => {
        const appPlan = window.EFillApplicationPlan.applicationPlan;
        const summary = appPlan.getSummary();
        return {
          applicationName: summary.applicationName,
          applicationId: summary.applicationId,
          domain: summary.domain,
          currentStep: summary.currentStep,
          totalPagesDiscovered: summary.totalPagesDiscovered,
          hasInferredFutureSteps: summary.hasInferredFutureSteps,
          sections: summary.sections.map(s => ({
            name: s.name,
            status: s.status,
            requirementsKnown: s.requirementsKnown,
            fieldCount: s.fieldCount
          })),
          requirementsCount: summary.totalRequirements
        };
      })()
    `);

    console.log('[DEBUG Plan Step 1 Summary]:', JSON.stringify(planSummary1, null, 2));

    step('Step 1: Application Plan detects identity generically ("JAM 2027")',
      planSummary1.applicationName.includes('JAM 2027') && planSummary1.applicationId.includes('jam'),
      `Name: "${planSummary1.applicationName}", ID: "${planSummary1.applicationId}"`
    );
    step('Step 1: Application Plan records Step 1 as DISCOVERED with requirementsKnown = true',
      planSummary1.sections.some(s => s.status === 'DISCOVERED' && s.requirementsKnown === true && s.fieldCount > 0)
    );
    step('Step 1: Stepper navigation steps registered as INFERRED with requirementsKnown = false',
      planSummary1.sections.some(s => s.status === 'INFERRED' && s.requirementsKnown === false && s.fieldCount === 0),
      'Inferred sections preserve unknown requirements without guessing'
    );
    step('Step 1: Total discovered pages = 1', planSummary1.totalPagesDiscovered === 1);

    // ─────────────────────────────────────────────────────────────────────────
    // Step 2: Record Session-Specific Choice (Exam Paper) in Application Plan
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- Step 2: User Chooses Exam Paper via Session Context ---');
    await sidepanelCdp.eval(`
      (() => {
        const appPlan = window.EFillApplicationPlan.applicationPlan;
        appPlan.setSessionValue('jam_paper', 'Mathematics (MA)', 'USER_SESSION_CHOICE');
        // Rescan to update proposals with session choice
        window.__efill_sidepanel.renderScanResults(${JSON.stringify(scan1)});
      })()
    `);
    await new Promise(r => setTimeout(r, 400));

    const sessionCheck = await sidepanelCdp.eval(`
      (() => {
        const appPlan = window.EFillApplicationPlan.applicationPlan;
        const prof = window.__efill_sidepanel.getInfoProfile();
        const props = window.__efill_sidepanel.getCurrentProposals();
        const paperProp = props.find(p => p.canonicalId === 'jam_paper' || p.fieldId === 'jam_paper');
        return {
          sessionVal: appPlan.getSessionValue('jam_paper'),
          profileVal: prof ? prof.getValue('jam_paper') : null,
          proposalStatus: paperProp?.status,
          proposedValue: paperProp?.proposedValue
        };
      })()
    `);

    step('Step 2: User choice saved into Application Plan session data', sessionCheck.sessionVal === 'Mathematics (MA)');
    step('Step 2: Persistent profile is NOT polluted with application-specific choice', !sessionCheck.profileVal);
    step('Step 2: Review & Fill proposal for jam_paper becomes READY using session choice',
      sessionCheck.proposalStatus === 'READY' && sessionCheck.proposedValue === 'Mathematics (MA)',
      `Status: ${sessionCheck.proposalStatus}, Value: "${sessionCheck.proposedValue}"`
    );

    // Autofill Step 1 in DOM
    await jamCdp.eval(`
      (() => {
        const approved = [{ fieldId: 'jam_paper', proposedValue: 'Mathematics (MA)', approved: true }];
        return window.EFillAutofill.autofillEngine.fill(approved);
      })()
    `);
    await new Promise(r => setTimeout(r, 400));

    const domVal1 = await jamCdp.eval(`document.getElementById('jam_paper')?.value`);
    step('Step 1 DOM: #jam_paper successfully filled with session choice ("Mathematics (MA)")', domVal1 === 'Mathematics (MA)');

    // ─────────────────────────────────────────────────────────────────────────
    // Step 3: User MANUALLY Navigates to Step 2 (NO auto-navigation by E-Fill)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- Step 3: User Manually Advances to Step 2 (Zero Auto-Navigation) ---');
    await jamCdp.eval(`
      document.getElementById('btn-save-next-1').click();
    `);
    await new Promise(r => setTimeout(r, 500));

    const page2Visible = await jamCdp.eval(`document.getElementById('jam-page-2').style.display !== 'none'`);
    step('Step 3: User manually advanced to Step 2 in DOM', page2Visible);

    // ─────────────────────────────────────────────────────────────────────────
    // Step 4: Scan Step 2 & Verify Cumulative Progressive Discovery
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- Step 4: Scan Step 2 & Verify Application Plan Accumulation ---');
    const scan2 = await jamCdp.eval(`({ ...window.EFillFormDetector.formDetector.scan(), eligible: true })`);

    await sidepanelCdp.eval(`
      (() => {
        window.__efill_sidepanel.renderScanResults(${JSON.stringify(scan2)});
      })()
    `);
    await new Promise(r => setTimeout(r, 600));

    const planSummary2 = await sidepanelCdp.eval(`
      (() => {
        const appPlan = window.EFillApplicationPlan.applicationPlan;
        const summary = appPlan.getSummary();
        const pages = appPlan.pages.map(p => ({
          stepIndex: p.stepIndex,
          status: p.status,
          section: p.section,
          fieldCount: p.fields.length
        }));
        return {
          totalPagesDiscovered: summary.totalPagesDiscovered,
          currentStep: summary.currentStep,
          pages,
          totalRequirements: summary.totalRequirements,
          reqFieldIds: appPlan.requirements.map(r => r.id),
          discoveredSections: summary.discoveredSections
        };
      })()
    `);

    console.log('[DEBUG Plan Step 2 Summary]:', JSON.stringify(planSummary2, null, 2));

    step('Step 4: Application Plan accumulates Step 2 without wiping Step 1 (totalPages = 2)',
      planSummary2.totalPagesDiscovered === 2,
      `Total pages: ${planSummary2.totalPagesDiscovered}`
    );
    step('Step 4: Step 1 is COMPLETED and Step 2 is CURRENT',
      planSummary2.pages[0].status === 'COMPLETED' && planSummary2.pages[1].status === 'CURRENT'
    );
    step('Step 4: Cumulative requirements contain both Step 1 fields (jam_paper) and Step 2 fields (applicant_name, ssc_roll_no)',
      planSummary2.reqFieldIds.includes('jam_paper') && planSummary2.reqFieldIds.includes('applicant_name') && planSummary2.reqFieldIds.includes('ssc_roll_no')
    );

    // ─────────────────────────────────────────────────────────────────────────
    // Step 5: Verify Review & Fill on Step 2 with Application Mapping Engine
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- Step 5: Verify Review & Fill on Step 2 with Application Mapping Engine ---');
    const props2 = await sidepanelCdp.eval(`
      (() => {
        const props = window.__efill_sidepanel.getCurrentProposals() || [];
        return props.map(p => ({
          fieldId: p.fieldId,
          canonicalId: p.canonicalId,
          proposedValue: p.proposedValue,
          status: p.status,
          provenance: p.provenance,
          approved: p.approved
        }));
      })()
    `);

    console.log('[DEBUG Proposals on Step 2]:', JSON.stringify(props2, null, 2));

    const fnProp = props2.find(p => p.canonicalId === 'first_name');
    const lnProp = props2.find(p => p.canonicalId === 'last_name');
    const percProp = props2.find(p => p.canonicalId === 'edu_percentage');

    step('Step 5: Review & Fill derives first_name = "SAI" from full_name with REVIEW_REQUIRED',
      fnProp && fnProp.proposedValue === 'SAI' && fnProp.status === 'REVIEW_REQUIRED'
    );
    step('Step 5: Review & Fill derives last_name = "PENDYALA" from full_name with REVIEW_REQUIRED',
      lnProp && lnProp.proposedValue === 'PENDYALA' && lnProp.status === 'REVIEW_REQUIRED'
    );
    step('Step 5: Review & Fill identifies edu_percentage = "85.67" as READY',
      percProp && percProp.proposedValue === '85.67' && percProp.status === 'READY'
    );

    // ─────────────────────────────────────────────────────────────────────────
    // Step 6: User Approves and Autofills Step 2 into Webpage DOM
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- Step 6: User Approves Proposals & Autofills Step 2 DOM ---');
    await jamCdp.eval(`
      (() => {
        const approved = [
          { fieldId: 'applicant_name', proposedValue: 'PENDYALA SAI ROHITH', approved: true },
          { fieldId: 'first_name', proposedValue: 'SAI', approved: true },
          { fieldId: 'last_name', proposedValue: 'PENDYALA', approved: true },
          { fieldId: 'ssc_percentage', proposedValue: '85.67', approved: true }
        ];
        return window.EFillAutofill.autofillEngine.fill(approved);
      })()
    `);
    await new Promise(r => setTimeout(r, 400));

    const domVal2 = await jamCdp.eval(`
      ({
        applicantName: document.getElementById('applicant_name')?.value,
        firstName: document.getElementById('first_name')?.value,
        lastName: document.getElementById('last_name')?.value,
        percentage: document.getElementById('ssc_percentage')?.value,
        submitCount: window.__efill_submit_count
      })
    `);

    step('Step 6: DOM #applicant_name receives "PENDYALA SAI ROHITH"', domVal2.applicantName === 'PENDYALA SAI ROHITH');
    step('Step 6: DOM #first_name receives "SAI"', domVal2.firstName === 'SAI');
    step('Step 6: DOM #last_name receives "PENDYALA"', domVal2.lastName === 'PENDYALA');
    step('Step 6: DOM #ssc_percentage receives "85.67"', domVal2.percentage === '85.67');
    step('Step 6: Zero auto-submit invariant maintained (submitCount === 0)', domVal2.submitCount === 0);

  } catch (err) {
    console.error('[Error during verification]:', err);
    failedSteps++;
  } finally {
    console.log('\n[Teardown] Closing Chrome and stopping server...');
    if (chromeProc) {
      chromeProc.kill('SIGKILL');
    }
    httpServer.close();
  }

  console.log('\n================================================================');
  console.log(`📊 REAL CHROME VERIFICATION RESULTS: ${passedSteps} PASSED, ${failedSteps} FAILED`);
  console.log('================================================================\n');

  if (failedSteps > 0) process.exit(1);
}

run();
