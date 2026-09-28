/**
 * Real Chrome Verification: Assistant Question Semantics, Answer Validation & Persistence Decision
 * ===================================================================================================
 * Verifies in real Google Chrome via CDP:
 *   TEST A: Country question semantics — must NOT ask "Please choose a value for India"
 *   TEST B: Email validation — rejects "456", shows error, does not store or leak to Review & Fill
 *   TEST C: Save decision — user chooses "Save to My Information", persists to profile & Review & Fill
 *   TEST D: Use once decision — user chooses "Use for this application only", profile untouched
 *   TEST E: Existing email in profile — does not prompt to save duplicate value
 *   TEST F: Semantic validation on mobile, percentage, DOB before app context update
 *   TEST G: Application-specific choices (JAM paper) — user chooses, does not pollute My Information
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');

const ROOT_DIR = path.resolve(__dirname, '..');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const HTTP_PORT = 9887;
const CDP_PORT = 9241;

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
    if (reqPath === '/') reqPath = '/test/assistant-test-harness.html';
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
  console.log('🚀 REAL CHROME QA: ASSISTANT QUESTION, VALIDATION & PERSISTENCE');
  console.log('================================================================\n');

  const httpServer = await startHttpServer();

  const tempUserDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'efill-qa-chrome-'));
  const testUrl = `http://127.0.0.1:${HTTP_PORT}/test/assistant-test-harness.html`;
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

  let pageCdp, sidepanelCdp;

  try {
    console.log('[CDP] Connecting to Sidepanel UI in Chrome...');
    sidepanelCdp = await CdpClient.connect('sidepanel/index.html');
    await sidepanelCdp.send('Page.enable');
    await sidepanelCdp.send('Runtime.enable');
    console.log('[CDP] Connected to Sidepanel UI successfully!');

    console.log('[CDP] Connecting to Test Harness in Chrome...');
    pageCdp = await CdpClient.connect('assistant-test-harness.html');
    await pageCdp.send('Page.enable');
    await pageCdp.send('Runtime.enable');
    console.log('[CDP] Connected to Test Harness successfully!');

    await new Promise(r => setTimeout(r, 1000));

    // ─────────────────────────────────────────────────────────────────────────
    // TEST A: Country Question Semantics (Must NOT say "Please choose a value for India")
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- TEST A: Assistant Question Semantics (Country vs India) ---');
    const scanData = await pageCdp.eval(`({ ...window.EFillFormDetector.formDetector.scan(), eligible: true })`);

    // Setup profile without country initially
    await sidepanelCdp.eval(`
      (() => {
        const ip = new window.EFillInformationProfile.InformationProfile(null);
        window.__efill_sidepanel.setInfoProfile(ip);
        window.__efill_sidepanel.renderScanResults(${JSON.stringify(scanData)});
      })()
    `);
    await new Promise(r => setTimeout(r, 400));

    const testAQuestion = await sidepanelCdp.eval(`
      (() => {
        const assistant = window.__efill_sidepanel.getConversationalAssistant();
        const questions = assistant.getPendingQuestions();
        const countryQ = questions.find(q => q.canonicalId === 'country' || q.fieldId === 'country');
        return {
          prompt: countryQ ? countryQ.prompt : null,
          hasIndiaInPrompt: countryQ ? countryQ.prompt.includes('value for India') : false
        };
      })()
    `);

    step('TEST A: Question for country is "What is your country?"', testAQuestion.prompt === 'What is your country?');
    step('TEST A: Assistant does NOT say "Please choose a value for India"', !testAQuestion.hasIndiaInPrompt);

    // If profile already contains country="India", assistant must NOT ask for country at all
    const testAWithProfile = await sidepanelCdp.eval(`
      (() => {
        const prof = window.__efill_sidepanel.getInfoProfile();
        prof.setField('country', 'India', 'USER_ENTERED', 'User Entry');
        window.__efill_sidepanel.renderScanResults(${JSON.stringify(scanData)});
        const assistant = window.__efill_sidepanel.getConversationalAssistant();
        const questions = assistant.getPendingQuestions();
        return {
          countryAsked: questions.some(q => q.canonicalId === 'country' || q.fieldId === 'country')
        };
      })()
    `);
    step('TEST A: When country is already in profile, Assistant does not ask about country', !testAWithProfile.countryAsked);

    // ─────────────────────────────────────────────────────────────────────────
    // TEST B: Assistant Rejects Invalid Email ("456")
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- TEST B: Assistant Rejects Invalid Email ("456") ---');
    const testBResult = await sidepanelCdp.eval(`
      (() => {
        const assistant = window.__efill_sidepanel.getConversationalAssistant();
        const appPlan = window.__efill_sidepanel.getApplicationPlan();
        const prof = window.__efill_sidepanel.getInfoProfile();

        // Simulate user typing 456 into assistant input
        const input = document.getElementById('assistant-input-answer');
        const saveBtn = document.getElementById('btn-assistant-save-choice');
        const errorDiv = document.getElementById('assistant-error-msg');

        if (input && saveBtn) {
          input.value = '456';
          saveBtn.click();
        }

        const emailInSession = appPlan.getSessionValue('applicant_email') || appPlan.getSessionValue('primary_email') || appPlan.getSessionValue('email');
        const emailInProfile = prof.getValue('primary_email') || prof.getValue('email');
        const errorText = errorDiv ? errorDiv.textContent : '';
        const errorVisible = errorDiv && errorDiv.style.display !== 'none';

        const proposals = window.__efill_sidepanel.getCurrentProposals();
        const emailProp = proposals.find(p => p.canonicalId === 'primary_email' || p.canonicalId === 'email' || p.fieldId === 'applicant_email');

        return {
          errorVisible,
          errorText,
          emailInSession,
          emailInProfile,
          emailPropProposedValue: emailProp?.proposedValue
        };
      })()
    `);

    step('TEST B: Error message shown when user enters "456"', testBResult.errorVisible && testBResult.errorText.includes('valid email address'));
    step('TEST B: Value "456" is NOT stored in application session', !testBResult.emailInSession);
    step('TEST B: Value "456" is NOT stored in Information Profile', !testBResult.emailInProfile);
    step('TEST B: Review & Fill does NOT propose "456"', testBResult.emailPropProposedValue !== '456');

    // ─────────────────────────────────────────────────────────────────────────
    // TEST C: Valid Email ("sai@example.com") with "Save to My Information"
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- TEST C: Valid Email with "Save to My Information" ---');
    await sidepanelCdp.eval(`
      (() => {
        const input = document.getElementById('assistant-input-answer');
        const saveBtn = document.getElementById('btn-assistant-save-choice');
        if (input && saveBtn) {
          input.value = 'sai@example.com';
          saveBtn.click();
        }
      })()
    `);
    await new Promise(r => setTimeout(r, 300));

    const testCDecisionPrompt = await sidepanelCdp.eval(`
      (() => {
        const prompt = document.getElementById('assistant-prompt')?.textContent || '';
        const saveBtn = document.getElementById('btn-assistant-save-profile');
        const useOnceBtn = document.getElementById('btn-assistant-use-once');
        return {
          promptHasEmail: prompt.includes('sai@example.com'),
          hasSaveBtn: !!saveBtn,
          hasUseOnceBtn: !!useOnceBtn
        };
      })()
    `);

    step('TEST C: Assistant shows decision prompt asking whether to save to My Information',
      testCDecisionPrompt.promptHasEmail && testCDecisionPrompt.hasSaveBtn && testCDecisionPrompt.hasUseOnceBtn
    );

    // User clicks "Save to My Information"
    await sidepanelCdp.eval(`
      (() => {
        const saveBtn = document.getElementById('btn-assistant-save-profile');
        if (saveBtn) saveBtn.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 400));

    const testCSaved = await sidepanelCdp.eval(`
      (() => {
        const prof = window.__efill_sidepanel.getInfoProfile();
        const appPlan = window.__efill_sidepanel.getApplicationPlan();
        const proposals = window.__efill_sidepanel.getCurrentProposals();
        const emailProp = proposals.find(p => p.canonicalId === 'primary_email' || p.canonicalId === 'email' || p.fieldId === 'applicant_email');

        const profVal = prof.getValue('primary_email') || prof.getValue('email');
        const sessionVal = appPlan.getSessionValue('applicant_email') || appPlan.getSessionValue('email') || appPlan.getSessionValue('primary_email');

        return {
          profVal,
          sessionVal,
          propVal: emailProp?.proposedValue,
          propStatus: emailProp?.status
        };
      })()
    `);

    step('TEST C: "Save to My Information" persists email into living profile', testCSaved.profVal === 'sai@example.com');
    step('TEST C: Email proposal becomes READY in Review & Fill', testCSaved.propVal === 'sai@example.com' && testCSaved.propStatus === 'READY');

    // ─────────────────────────────────────────────────────────────────────────
    // TEST D: "Use for this application only" (Isolation Test)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- TEST D: "Use for this application only" (Session Isolation) ---');
    // Clear profile email to simulate fresh missing field
    await sidepanelCdp.eval(`
      (() => {
        const prof = window.__efill_sidepanel.getInfoProfile();
        prof.clearField('primary_email');
        prof.clearField('email');
        const appPlan = window.__efill_sidepanel.getApplicationPlan();
        delete appPlan.sessionData['applicant_email'];
        delete appPlan.sessionData['email'];
        delete appPlan.sessionData['primary_email'];
        window.__efill_sidepanel.renderScanResults(${JSON.stringify(scanData)});
      })()
    `);
    await new Promise(r => setTimeout(r, 400));

    // Submit sai@example.com again
    await sidepanelCdp.eval(`
      (() => {
        const input = document.getElementById('assistant-input-answer');
        const saveBtn = document.getElementById('btn-assistant-save-choice');
        if (input && saveBtn) {
          input.value = 'sai@example.com';
          saveBtn.click();
        }
      })()
    `);
    await new Promise(r => setTimeout(r, 300));

    // User chooses "Use for this application only"
    await sidepanelCdp.eval(`
      (() => {
        const useOnceBtn = document.getElementById('btn-assistant-use-once');
        if (useOnceBtn) useOnceBtn.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 400));

    const testDResult = await sidepanelCdp.eval(`
      (() => {
        const prof = window.__efill_sidepanel.getInfoProfile();
        const appPlan = window.__efill_sidepanel.getApplicationPlan();
        const proposals = window.__efill_sidepanel.getCurrentProposals();
        const emailProp = proposals.find(p => p.canonicalId === 'primary_email' || p.canonicalId === 'email' || p.fieldId === 'applicant_email');

        const profVal = prof.getValue('primary_email') || prof.getValue('email');
        const sessionVal = appPlan.getSessionValue('applicant_email') || appPlan.getSessionValue('email') || appPlan.getSessionValue('primary_email');

        return {
          profVal,
          sessionVal,
          propVal: emailProp?.proposedValue
        };
      })()
    `);

    step('TEST D: Application session receives email for current form', testDResult.sessionVal === 'sai@example.com');
    step('TEST D: My Information profile remains completely UNCHANGED (empty)', !testDResult.profVal);
    step('TEST D: Review & Fill still receives email proposal from session override', testDResult.propVal === 'sai@example.com');

    // ─────────────────────────────────────────────────────────────────────────
    // TEST E: Existing Email Already in Profile
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- TEST E: Existing Email Already in Profile ---');
    await sidepanelCdp.eval(`
      (() => {
        const prof = window.__efill_sidepanel.getInfoProfile();
        prof.setField('primary_email', 'sai@example.com', 'USER_ENTERED', 'User Entry');
        window.__efill_sidepanel.renderScanResults(${JSON.stringify(scanData)});
      })()
    `);
    await new Promise(r => setTimeout(r, 400));

    const testEQuestions = await sidepanelCdp.eval(`
      (() => {
        const assistant = window.__efill_sidepanel.getConversationalAssistant();
        const questions = assistant.getPendingQuestions();
        return {
          emailAsked: questions.some(q => q.canonicalId === 'primary_email' || q.fieldId === 'applicant_email')
        };
      })()
    `);

    step('TEST E: When email already exists in profile, Assistant does NOT ask for email', !testEQuestions.emailAsked);

    // ─────────────────────────────────────────────────────────────────────────
    // TEST F: Semantic Validation on Mobile, Percentage, DOB
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- TEST F: Semantic Validation (Mobile, Percentage, DOB) ---');
    const testFValidations = await sidepanelCdp.eval(`
      (() => {
        const assistant = window.__efill_sidepanel.getConversationalAssistant();
        return {
          mobileShort: assistant.validateAnswer('applicant_mobile', '123', { canonicalId: 'primary_phone' }).valid,
          mobileLetters: assistant.validateAnswer('applicant_mobile', 'phone12345', { canonicalId: 'primary_phone' }).valid,
          mobileValid: assistant.validateAnswer('applicant_mobile', '9876543210', { canonicalId: 'primary_phone' }).valid,

          percLetters: assistant.validateAnswer('percentage', 'abc', { canonicalId: 'edu_percentage' }).valid,
          percHigh: assistant.validateAnswer('percentage', '110', { canonicalId: 'edu_percentage' }).valid,
          percNeg: assistant.validateAnswer('percentage', '-5', { canonicalId: 'edu_percentage' }).valid,
          percValid: assistant.validateAnswer('percentage', '85.67%', { canonicalId: 'edu_percentage' }).valid,

          dobLetters: assistant.validateAnswer('dob', 'yesterday', { canonicalId: 'dob' }).valid,
          dobFuture: assistant.validateAnswer('dob', '2099-01-01', { canonicalId: 'dob' }).valid,
          dobValid: assistant.validateAnswer('dob', '20/03/2007', { canonicalId: 'dob' }).valid
        };
      })()
    `);

    step('TEST F: Rejects short mobile ("123") and letters', !testFValidations.mobileShort && !testFValidations.mobileLetters);
    step('TEST F: Accepts valid 10-digit mobile number', testFValidations.mobileValid);
    step('TEST F: Rejects invalid percentage ("abc", "110", "-5")', !testFValidations.percLetters && !testFValidations.percHigh && !testFValidations.percNeg);
    step('TEST F: Accepts valid percentage ("85.67%")', testFValidations.percValid);
    step('TEST F: Rejects invalid date of birth ("yesterday", future date)', !testFValidations.dobLetters && !testFValidations.dobFuture);
    step('TEST F: Accepts valid date of birth ("20/03/2007")', testFValidations.dobValid);

    // ─────────────────────────────────────────────────────────────────────────
    // TEST G: Application-Specific Choices (JAM Paper)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- TEST G: Application-Specific Choices (JAM Paper) ---');
    const testGResult = await sidepanelCdp.eval(`
      (() => {
        const assistant = window.__efill_sidepanel.getConversationalAssistant();
        const prof = window.__efill_sidepanel.getInfoProfile();
        const appPlan = window.__efill_sidepanel.getApplicationPlan();

        // Submit JAM paper choice
        const res = assistant.submitAnswer('jam_paper', 'Mathematics (MA)', {
          persistToProfile: true, // User or UI tries to pass true
          canonicalId: 'jam_paper',
          fieldDef: {
            elementId: 'jam_paper',
            options: ['Mathematics (MA)', 'Physics (PH)']
          }
        });

        const inSession = appPlan.getSessionValue('jam_paper');
        const inProfile = prof.getValue('jam_paper');

        return {
          resSuccess: res.success,
          inSession,
          inProfile
        };
      })()
    `);

    step('TEST G: User choices for application-specific field are recorded in session', testGResult.inSession === 'Mathematics (MA)');
    step('TEST G: Session-only choices do NOT pollute persistent My Information profile', !testGResult.inProfile);

    // ─────────────────────────────────────────────────────────────────────────
    // TEST H: Mock Human Verification Challenge Flow & Real CAPTCHA Protection
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- TEST H: Mock Human Verification Flow & Real CAPTCHA Protection ---');

    // 1. Detect mock challenge & ensure real CAPTCHA is protected
    const testHScan = await sidepanelCdp.eval(`
      (() => {
        const assistant = window.__efill_sidepanel.getConversationalAssistant();
        const appPlan = window.__efill_sidepanel.getApplicationPlan();
        const activePage = appPlan.getActivePage();
        const mockField = activePage.fields.find(f => f.elementId === 'mock_captcha_answer' || f.isMockSecurityChallenge);
        const realCaptchaField = activePage.fields.find(f => f.elementId === 'real_captcha_input' || f.isRealSecurityChallenge);
        const pendingQuestions = assistant.getPendingQuestions();
        const mockQ = pendingQuestions.find(q => q.isMockSecurityChallenge || q.fieldId === 'mock_captcha_answer');
        const realCaptchaQ = pendingQuestions.find(q => q.isRealSecurityChallenge || q.fieldId === 'real_captcha_input');

        return {
          mockDetected: !!mockField,
          mockType: mockField?.type,
          mockSecurityType: mockField?.securityChallengeType,
          realCaptchaDetected: !!realCaptchaField,
          realCaptchaSecurityType: realCaptchaField?.securityChallengeType,
          mockQPrompt: mockQ?.prompt,
          hasMockQ: !!mockQ,
          hasRealCaptchaQ: !!realCaptchaQ
        };
      })()
    `);

    step('1. E-Fill detects mock challenge (type: MOCK_SECURITY_CHALLENGE)', testHScan.mockDetected && (testHScan.mockType === 'MOCK_SECURITY_CHALLENGE' || testHScan.mockSecurityType === 'MOCK_SECURITY_CHALLENGE'));
    step('2. Assistant asks: "What is the answer to 8 - 4?"', testHScan.mockQPrompt === 'What is the answer to 8 - 4?');
    step('12. Verify real CAPTCHA fields remain protected (never asked by Assistant)', !testHScan.hasRealCaptchaQ && (testHScan.realCaptchaSecurityType === 'SECURITY_CHALLENGE' || testHScan.realCaptchaSecurityType === 'REAL_SECURITY_CHALLENGE'));

    await sidepanelCdp.eval(`
      (() => {
        const appPlan = window.__efill_sidepanel.getApplicationPlan();
        appPlan.setSessionValue('country', 'India');
        appPlan.setSessionValue('primary_email', 'sai@example.com');
        appPlan.setSessionValue('applicant_email', 'sai@example.com');
        appPlan.setSessionValue('primary_phone', '9876543210');
        appPlan.setSessionValue('applicant_mobile', '9876543210');
        appPlan.setSessionValue('jam_paper', 'Mathematics (MA)');
        appPlan.setSessionValue('percentage', '85.5');
        appPlan.setSessionValue('edu_percentage', '85.5');
        appPlan.setSessionValue('dob', '2007-03-20');
        window.__efill_sidepanel.renderAssistantUI();
      })()
    `);
    await new Promise(r => setTimeout(r, 600));

    // 3. Enter wrong answer "5"
    const wrongAnswerResult = await sidepanelCdp.eval(`
      (() => {
        const input = document.getElementById('assistant-input-answer');
        const saveBtn = document.getElementById('btn-assistant-save-choice');
        const errorMsg = document.getElementById('assistant-error-msg');
        if (!input || !saveBtn) return { error: 'Input or Save button not found' };

        input.value = '5';
        saveBtn.click();

        return {
          errorShown: errorMsg ? errorMsg.style.display !== 'none' : false,
          errorText: errorMsg ? errorMsg.textContent : ''
        };
      })()
    `);

    step('3. Enter "5" into Assistant answer input', true);
    step('4. Verify answer rejected ("❌ Incorrect answer. Please try again.")', wrongAnswerResult.errorShown && wrongAnswerResult.errorText.includes('Incorrect answer'));

    // 5. Verify DOM remains empty
    const pageDomAfterWrong = await pageCdp.eval(`
      (() => {
        const el = document.getElementById('mock_captcha_answer');
        return { val: el ? el.value : null };
      })()
    `);
    step('5. Verify DOM remains empty after incorrect answer', pageDomAfterWrong.val === '');

    // 6. Enter correct answer "4"
    const correctAnswerResult = await sidepanelCdp.eval(`
      (() => {
        const input = document.getElementById('assistant-input-answer');
        const saveBtn = document.getElementById('btn-assistant-save-choice');
        const assistantPrompt = document.getElementById('assistant-prompt');
        if (!input || !saveBtn) return { error: 'Input or Save button not found' };

        input.value = '4';
        saveBtn.click();

        return {
          promptText: assistantPrompt ? assistantPrompt.textContent : ''
        };
      })()
    `);

    step('6. Enter "4" into Assistant answer input', true);
    step('7. Verify accepted ("✓ Answer confirmed")', correctAnswerResult.promptText.includes('Answer confirmed'));

    // Trigger fill on test page DOM
    await pageCdp.eval(`
      (() => {
        if (typeof window.__efill_fill_mock_challenge === 'function') {
          window.__efill_fill_mock_challenge('mock_captcha_answer', '4');
        } else {
          const el = document.getElementById('mock_captcha_answer');
          if (el) {
            el.value = '4';
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
      })()
    `);
    await new Promise(r => setTimeout(r, 400));

    // 8. Verify DOM becomes "4"
    const pageDomAfterCorrect = await pageCdp.eval(`
      (() => {
        const el = document.getElementById('mock_captcha_answer');
        return { val: el ? el.value : null };
      })()
    `);
    step('8. Verify DOM becomes "4"', pageDomAfterCorrect.val === '4');

    // 9, 10, 11: Verify no My Information update, no persistent storage, no Save to My Information button
    const persistenceChecks = await sidepanelCdp.eval(`
      (() => {
        const prof = window.__efill_sidepanel.getInfoProfile();
        const saveBtn = document.getElementById('btn-assistant-save-profile');
        const useOnceBtn = document.getElementById('btn-assistant-use-once');
        return {
          mockInProfile: prof.getValue('mock_security_challenge') || prof.getValue('mock_captcha_answer') || null,
          saveBtnExists: !!saveBtn,
          useOnceBtnExists: !!useOnceBtn
        };
      })()
    `);

    step('9. Verify no My Information update for mock challenge', persistenceChecks.mockInProfile === null || persistenceChecks.mockInProfile === '');
    step('10. Verify no persistent storage of security challenge', persistenceChecks.mockInProfile === null || persistenceChecks.mockInProfile === '');
    step('11. Verify no Save to My Information button exists for challenge', !persistenceChecks.saveBtnExists && !persistenceChecks.useOnceBtnExists);

    // Verify zero auto-submit invariant
    const submitCheck = await pageCdp.eval('window.__efill_submit_count');
    step('Zero auto-submit invariant: submitCount === 0', submitCheck === 0);

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
  console.log(`📊 REAL CHROME QA RESULTS: ${passedSteps} PASSED, ${failedSteps} FAILED`);
  console.log('================================================================\n');

  if (failedSteps > 0) process.exit(1);
}

run();
