/**
 * Real Chrome Verification: Application Plan on Unfamiliar Multi-Step Application (Update 2)
 * ==========================================================================================
 * Tests E-Fill on a completely unfamiliar, non-JAM application:
 * "National Science Fellowship Portal" with custom field IDs and labels.
 *
 * Verifies:
 * 1. Step 1 (Research Stream & Domicile):
 *    - Application Plan detects generic title "National Science Fellowship Portal"
 *    - Records Step 1 as DISCOVERED with requirementsKnown = true
 *    - Records Steps 2 and 3 as INFERRED with requirementsKnown = false (no fabricated fields)
 *    - Maps domicile_state to profile.state ("Andhra Pradesh")
 *    - Isolates session choice for fellowship_stream without profile pollution
 *    - Autofills Step 1 into webpage DOM
 * 2. User manually clicks "Save & Continue" to advance (zero auto-navigation)
 * 3. Step 2 (Candidate Identification & Merit):
 *    - Application Plan accumulates Step 2 without wiping Step 1 (totalPagesDiscovered = 2)
 *    - Step 1 status = COMPLETED, Step 2 status = CURRENT
 *    - Cumulative requirements contain Step 1 and Step 2 fields
 *    - Review & Fill maps unfamiliar IDs:
 *        applicant_legal_id -> "PENDYALA SAI ROHITH"
 *        evaluated_percentage -> "85.67"
 *        matric_roll -> "2103204561"
 *    - User approves and autofills Step 2 DOM
 *    - Invariant: window.__efill_submit_count === 0 (zero auto-submit)
 *    - Invariant: persistent profile remains unpolluted by session choices
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');

const ROOT_DIR = path.resolve(__dirname, '..');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const HTTP_PORT = 9886;
const CDP_PORT = 9240;

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
    if (reqPath === '/') reqPath = '/test/unfamiliar-test-harness.html';
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
        const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
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
      } catch (e) {
        // Retry
      }
      await new Promise(r => setTimeout(r, 400));
    }
    throw new Error(`Timeout waiting for target matching: ${targetUrlMatch}`);
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
      throw new Error('Eval failed: ' + (res.exceptionDetails.text || JSON.stringify(res.exceptionDetails)));
    }
    return res.result?.value;
  }
}

async function run() {
  console.log('================================================================');
  console.log('🚀 REAL CHROME VERIFICATION: UNFAMILIAR APPLICATION PLAN (UPDATE 2)');
  console.log('================================================================\n');

  const httpServer = await startHttpServer();

  const tempUserDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'efill-unfam-chrome-'));
  const testUrl = `http://127.0.0.1:${HTTP_PORT}/test/unfamiliar-test-harness.html`;
  const sidepanelUrl = `http://127.0.0.1:${HTTP_PORT}/sidepanel/index.html`;

  console.log(`[Chrome] Launching Chrome with remote debugging on port ${CDP_PORT}...`);
  const chromeProc = spawn(CHROME_PATH, [
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${tempUserDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    testUrl,
    sidepanelUrl
  ], { stdio: 'ignore' });

  let appCdp, sidepanelCdp;

  try {
    console.log('[CDP] Connecting to Sidepanel UI in Chrome...');
    sidepanelCdp = await CdpClient.connect('sidepanel/index.html');
    await sidepanelCdp.send('Page.enable');
    await sidepanelCdp.send('Runtime.enable');
    console.log('[CDP] Connected to Sidepanel UI successfully!');

    console.log('[CDP] Connecting to Unfamiliar application page in Chrome...');
    appCdp = await CdpClient.connect('unfamiliar-test-harness.html');
    await appCdp.send('Page.enable');
    await appCdp.send('Runtime.enable');
    console.log('[CDP] Connected to Unfamiliar application page successfully!');

    await new Promise(r => setTimeout(r, 1000));

    // ─────────────────────────────────────────────────────────────────────────
    // Step 0: Initialize Profile with 10th Marksheet details
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- Step 0: Initialize Profile with 10th Marksheet Information ---');
    await sidepanelCdp.eval(`
      (() => {
        const ip = new window.EFillInformationProfile.InformationProfile(null);
        ip.setField('full_name', 'PENDYALA SAI ROHITH', 'USER_CONFIRMED', '10th marks list rohit .pdf');
        ip.setField('state', 'Andhra Pradesh', 'USER_CONFIRMED', 'aadhaar.pdf');
        ip.setField('edu_percentage', '85.67', 'USER_CONFIRMED', '10th marks list rohit .pdf', 'edu-10th-ssc');
        ip.setField('edu_roll_number', '2103204561', 'USER_CONFIRMED', '10th marks list rohit .pdf', 'edu-10th-ssc');
        window.__efill_sidepanel.setInfoProfile(ip);
        window.__efill_sidepanel.populateInfoForm();
      })()
    `);
    step('Step 0: Profile initialized with 10th Marksheet (PENDYALA SAI ROHITH)', true);

    // ─────────────────────────────────────────────────────────────────────────
    // Step 1: Scan Unfamiliar Step 1 (Research Stream & Domicile)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- Step 1: Scan Unfamiliar Step 1 & Build Initial Application Plan ---');
    const scan1 = await appCdp.eval(`({ ...window.EFillFormDetector.formDetector.scan(), eligible: true })`);

    step('Step 1: Form detector finds 2 fields on Step 1', scan1.fields.length === 2);
    step('Step 1: Stepper navigation finds 3 steps', scan1.navigation?.steps?.length === 3);

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

    console.log('[DEBUG Step 1 Plan Summary]:', JSON.stringify(planSummary1, null, 2));

    step('Step 1: Application Plan detects identity generically ("National Science Fellowship Portal")',
      planSummary1.applicationName.includes('National Science Fellowship'),
      `Name: "${planSummary1.applicationName}"`
    );
    step('Step 1: Application Plan records Step 1 as DISCOVERED with requirementsKnown = true',
      planSummary1.sections.some(s => s.status === 'DISCOVERED' && s.requirementsKnown === true)
    );
    step('Step 1: Stepper navigation steps registered as INFERRED with requirementsKnown = false',
      planSummary1.sections.some(s => s.status === 'INFERRED' && s.requirementsKnown === false && s.fieldCount === 0),
      'Inferred sections preserve unknown requirements without guessing'
    );
    step('Step 1: Total discovered pages = 1', planSummary1.totalPagesDiscovered === 1);

    // ─────────────────────────────────────────────────────────────────────────
    // Step 2: Session Value & Autofill for Step 1
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- Step 2: Session Value & Autofill for Step 1 ---');
    await sidepanelCdp.eval(`
      (() => {
        const appPlan = window.EFillApplicationPlan.applicationPlan;
        appPlan.setSessionValue('fellowship_stream', 'COMP', 'USER_SESSION_CHOICE');
        window.__efill_sidepanel.renderScanResults(${JSON.stringify(scan1)});
      })()
    `);
    await new Promise(r => setTimeout(r, 400));

    const sessionCheck = await sidepanelCdp.eval(`
      (() => {
        const appPlan = window.EFillApplicationPlan.applicationPlan;
        const prof = window.__efill_sidepanel.getInfoProfile();
        const props = window.__efill_sidepanel.getCurrentProposals();
        const streamProp = props.find(p => p.canonicalId === 'fellowship_stream' || p.fieldId === 'fellowship_stream');
        const domicileProp = props.find(p => p.canonicalId === 'domicile_state' || p.fieldId === 'domicile_state');
        return {
          sessionVal: appPlan.getSessionValue('fellowship_stream'),
          profileVal: prof ? prof.getValue('fellowship_stream') : null,
          streamStatus: streamProp?.status,
          streamValue: streamProp?.proposedValue,
          domicileStatus: domicileProp?.status,
          domicileValue: domicileProp?.proposedValue
        };
      })()
    `);

    step('Step 2: fellowship_stream saved into Application Plan session data', sessionCheck.sessionVal === 'COMP');
    step('Step 2: Persistent profile is NOT polluted with session choice', !sessionCheck.profileVal);
    step('Step 2: domicile_state proposes "Andhra Pradesh" (READY)',
      sessionCheck.domicileStatus === 'READY' && sessionCheck.domicileValue === 'Andhra Pradesh'
    );
    step('Step 2: fellowship_stream proposes session choice "COMP" (READY)',
      sessionCheck.streamStatus === 'READY' && sessionCheck.streamValue === 'COMP'
    );

    // Autofill Step 1 into DOM
    await appCdp.eval(`
      (() => {
        const approved = [
          { fieldId: 'domicile_state', proposedValue: 'Andhra Pradesh', approved: true },
          { fieldId: 'fellowship_stream', proposedValue: 'COMP', approved: true }
        ];
        return window.EFillAutofill.autofillEngine.fill(approved);
      })()
    `);
    await new Promise(r => setTimeout(r, 400));

    const domVal1 = await appCdp.eval(`
      ({
        domicile: document.getElementById('domicile_state')?.value,
        stream: document.getElementById('fellowship_stream')?.value
      })
    `);

    step('Step 2: DOM #domicile_state filled with "Andhra Pradesh"', domVal1.domicile === 'Andhra Pradesh');
    step('Step 2: DOM #fellowship_stream filled with "COMP"', domVal1.stream === 'COMP');

    // ─────────────────────────────────────────────────────────────────────────
    // Step 3: Advance to Step 2 via User Action (Zero Auto-Navigation)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- Step 3: Advance to Step 2 via User Action (Zero Auto-Navigation) ---');
    await appCdp.eval(`
      document.getElementById('btn-save-next-fellow-1').click();
    `);
    await new Promise(r => setTimeout(r, 500));

    const page2Visible = await appCdp.eval(`document.getElementById('fellow-page-2').style.display !== 'none'`);
    step('Step 3: User manually advanced to Step 2 in DOM', page2Visible);

    // ─────────────────────────────────────────────────────────────────────────
    // Step 4: Scan Step 2 & Verify Cumulative Progressive Discovery
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- Step 4: Scan Step 2 & Verify Application Plan Accumulation ---');
    const scan2 = await appCdp.eval(`({ ...window.EFillFormDetector.formDetector.scan(), eligible: true })`);

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
    step('Step 4: Cumulative requirements contain Step 1 and Step 2 fields',
      planSummary2.reqFieldIds.includes('fellowship_stream') &&
      planSummary2.reqFieldIds.includes('domicile_state') &&
      planSummary2.reqFieldIds.includes('applicant_legal_id') &&
      planSummary2.reqFieldIds.includes('evaluated_percentage') &&
      planSummary2.reqFieldIds.includes('matric_roll')
    );

    // ─────────────────────────────────────────────────────────────────────────
    // Step 5: Verify Proposals on Step 2
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- Step 5: Verify Proposals on Step 2 ---');
    const props2 = await sidepanelCdp.eval(`
      (() => {
        const props = window.__efill_sidepanel.getCurrentProposals() || [];
        return props.map(p => ({
          fieldId: p.fieldId,
          canonicalId: p.canonicalId,
          proposedValue: p.proposedValue,
          status: p.status
        }));
      })()
    `);

    console.log('[DEBUG Proposals on Step 2]:', JSON.stringify(props2, null, 2));

    const nameProp = props2.find(p => p.fieldId === 'applicant_legal_id');
    const percProp = props2.find(p => p.fieldId === 'evaluated_percentage');
    const rollProp = props2.find(p => p.fieldId === 'matric_roll');

    step('Step 5: applicant_legal_id maps to "PENDYALA SAI ROHITH" (READY)',
      nameProp && nameProp.proposedValue === 'PENDYALA SAI ROHITH' && nameProp.status === 'READY'
    );
    step('Step 5: evaluated_percentage maps to "85.67" (READY)',
      percProp && percProp.proposedValue === '85.67' && percProp.status === 'READY'
    );
    step('Step 5: matric_roll maps to "2103204561" (READY)',
      rollProp && rollProp.proposedValue === '2103204561' && rollProp.status === 'READY'
    );

    // ─────────────────────────────────────────────────────────────────────────
    // Step 6: Autofill Step 2 & Check Safety Invariants
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- Step 6: Autofill Step 2 & Check Safety Invariants ---');
    await appCdp.eval(`
      (() => {
        const approved = [
          { fieldId: 'applicant_legal_id', proposedValue: 'PENDYALA SAI ROHITH', approved: true },
          { fieldId: 'evaluated_percentage', proposedValue: '85.67', approved: true },
          { fieldId: 'matric_roll', proposedValue: '2103204561', approved: true }
        ];
        return window.EFillAutofill.autofillEngine.fill(approved);
      })()
    `);
    await new Promise(r => setTimeout(r, 400));

    const domVal2 = await appCdp.eval(`
      ({
        legalId: document.getElementById('applicant_legal_id')?.value,
        perc: document.getElementById('evaluated_percentage')?.value,
        roll: document.getElementById('matric_roll')?.value,
        submitCount: window.__efill_submit_count
      })
    `);

    step('Step 6: DOM #applicant_legal_id filled with "PENDYALA SAI ROHITH"', domVal2.legalId === 'PENDYALA SAI ROHITH');
    step('Step 6: DOM #evaluated_percentage filled with "85.67"', domVal2.perc === '85.67');
    step('Step 6: DOM #matric_roll filled with "2103204561"', domVal2.roll === '2103204561');
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
  console.log(`📊 REAL CHROME UNFAMILIAR VERIFICATION: ${passedSteps} PASSED, ${failedSteps} FAILED`);
  console.log('================================================================\n');

  if (failedSteps > 0) process.exit(1);
}

run();
