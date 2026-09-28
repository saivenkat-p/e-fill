/**
 * Unit Test Suite: Conversational Assistant Question Semantics, Answer Validation & Persistence Decision
 * =======================================================================================================
 * Validates:
 * 1. Semantic Question Generation (Field Semantics vs Field Values, no "Please choose a value for India")
 * 2. Genuinely Missing Check (Available fields in profile/document/derivation are not asked)
 * 3. Semantic Answer Validation (Email, Mobile, DOB, Percentage, Name, Roll No, Options)
 * 4. Persistence Decision & Data Isolation (Save to My Information vs Use for this application only)
 * 5. Application-Specific Choices (Never pollute persistent profile)
 */

const assert = require('assert');
const path = require('path');

const { ConversationalAssistant } = require('../core/conversational-assistant.js');
const { ApplicationPlan } = require('../core/application-plan.js');
const { InformationProfile } = require('../core/information-profile.js');

let passedTests = 0;
let totalTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
  }
}

console.log('\n=== RUNNING CONVERSATIONAL ASSISTANT & VALIDATION TESTS ===\n');

// ─────────────────────────────────────────────────────────────────────────────
// 1. Question Generator: Field Semantics vs Field Value (Issue 1)
// ─────────────────────────────────────────────────────────────────────────────
console.log('1. Question Generator (Field Semantics vs Field Value):');

test('generates "What is your country?" when canonicalId is country (even if field.label is "India")', () => {
  const assistant = new ConversationalAssistant();
  const prompt = assistant.getSemanticQuestionPrompt({ label: 'India', elementId: 'country_sel' }, 'country');
  assert.strictEqual(prompt, 'What is your country?');
  assert.ok(!prompt.includes('value for India'), 'Must not say "Please choose a value for India"');
});

test('generates "What is your nationality?" when canonicalId is nationality (even if label is "Indian")', () => {
  const assistant = new ConversationalAssistant();
  const prompt = assistant.getSemanticQuestionPrompt({ label: 'Indian', elementId: 'nat_input' }, 'nationality');
  assert.strictEqual(prompt, 'What is your nationality?');
});

test('generates "What is your email address?" for email fields', () => {
  const assistant = new ConversationalAssistant();
  const prompt = assistant.getSemanticQuestionPrompt({ label: 'Email', elementId: 'user_email' }, 'primary_email');
  assert.strictEqual(prompt, 'What is your email address?');
});

test('generates "What is your mobile number?" for mobile/phone fields', () => {
  const assistant = new ConversationalAssistant();
  const prompt = assistant.getSemanticQuestionPrompt({ label: 'Mobile Number *', elementId: 'mobile_no' }, 'primary_phone');
  assert.strictEqual(prompt, 'What is your mobile number?');
});

test('generates "What is your date of birth?" for dob fields', () => {
  const assistant = new ConversationalAssistant();
  const prompt = assistant.getSemanticQuestionPrompt({ label: 'Date of Birth', elementId: 'dob_input' }, 'dob');
  assert.strictEqual(prompt, 'What is your date of birth?');
});

test('generates "What is your percentage?" for percentage fields', () => {
  const assistant = new ConversationalAssistant();
  const prompt = assistant.getSemanticQuestionPrompt({ label: 'Percentage obtained', elementId: 'ssc_perc' }, 'edu_percentage');
  assert.strictEqual(prompt, 'What is your percentage?');
});

test('generates clean question for unfamiliar field with valid label', () => {
  const assistant = new ConversationalAssistant();
  const prompt = assistant.getSemanticQuestionPrompt({ label: 'Proposed Field of Research *', elementId: 'stream' }, 'fellowship_stream');
  assert.strictEqual(prompt, 'What is your proposed field of research?');
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Genuinely Missing Check (Issue 1)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n2. Genuinely Missing Check (Available information is not asked):');

test('does NOT ask for country if country is already present in profile', () => {
  const plan = new ApplicationPlan();
  const profile = new InformationProfile();
  profile.setField('country', 'India', 'USER_ENTERED', 'Manual Entry');

  plan.addPage({
    url: 'https://example.com/apply',
    title: 'Test Portal',
    fields: [
      { elementId: 'country_input', canonicalId: 'country', label: 'Country' },
      { elementId: 'email_input', canonicalId: 'primary_email', label: 'Email Address' }
    ]
  }, profile);

  const assistant = new ConversationalAssistant(plan, profile);
  const questions = assistant.getPendingQuestions();

  assert.strictEqual(questions.length, 1, 'Only missing email should be asked');
  assert.strictEqual(questions[0].canonicalId, 'primary_email');
});

test('does NOT ask for field if already filled in DOM', () => {
  const plan = new ApplicationPlan();
  const profile = new InformationProfile();

  plan.addPage({
    url: 'https://example.com/apply',
    title: 'Test Portal',
    fields: [
      { elementId: 'country_input', canonicalId: 'country', label: 'Country', currentValue: 'India' },
      { elementId: 'email_input', canonicalId: 'primary_email', label: 'Email Address', currentValue: '' }
    ]
  }, profile);

  const assistant = new ConversationalAssistant(plan, profile);
  const questions = assistant.getPendingQuestions();

  assert.strictEqual(questions.length, 1);
  assert.strictEqual(questions[0].canonicalId, 'primary_email');
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Semantic Answer Validation (Issue 2)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n3. Semantic Answer Validation (Issue 2):');

test('rejects obviously invalid email "456"', () => {
  const assistant = new ConversationalAssistant();
  const res = assistant.validateAnswer('primary_email', '456', { canonicalId: 'primary_email' });
  assert.strictEqual(res.valid, false);
  assert.ok(res.error.includes('valid email address'), 'Error must explain valid email format');
});

test('rejects malformed email "user@domain"', () => {
  const assistant = new ConversationalAssistant();
  const res = assistant.validateAnswer('primary_email', 'user@domain', { canonicalId: 'primary_email' });
  assert.strictEqual(res.valid, false);
});

test('accepts valid email "sai@example.com"', () => {
  const assistant = new ConversationalAssistant();
  const res = assistant.validateAnswer('primary_email', 'sai@example.com', { canonicalId: 'primary_email' });
  assert.strictEqual(res.valid, true);
  assert.strictEqual(res.normalizedValue, 'sai@example.com');
  assert.strictEqual(res.error, null);
});

test('rejects obviously invalid mobile "123" and "abc"', () => {
  const assistant = new ConversationalAssistant();
  const res1 = assistant.validateAnswer('primary_phone', '123', { canonicalId: 'primary_phone' });
  assert.strictEqual(res1.valid, false);
  const res2 = assistant.validateAnswer('primary_phone', 'abcdefghij', { canonicalId: 'primary_phone' });
  assert.strictEqual(res2.valid, false);
});

test('accepts valid 10-digit mobile number', () => {
  const assistant = new ConversationalAssistant();
  const res = assistant.validateAnswer('primary_phone', '9876543210', { canonicalId: 'primary_phone' });
  assert.strictEqual(res.valid, true);
  assert.strictEqual(res.normalizedValue, '9876543210');
});

test('rejects invalid percentage "-10" and "105" and "abc"', () => {
  const assistant = new ConversationalAssistant();
  assert.strictEqual(assistant.validateAnswer('edu_percentage', '-10', { canonicalId: 'edu_percentage' }).valid, false);
  assert.strictEqual(assistant.validateAnswer('edu_percentage', '105', { canonicalId: 'edu_percentage' }).valid, false);
  assert.strictEqual(assistant.validateAnswer('edu_percentage', 'abc', { canonicalId: 'edu_percentage' }).valid, false);
});

test('accepts and normalizes valid percentage "85.67%"', () => {
  const assistant = new ConversationalAssistant();
  const res = assistant.validateAnswer('edu_percentage', '85.67%', { canonicalId: 'edu_percentage' });
  assert.strictEqual(res.valid, true);
  assert.strictEqual(res.normalizedValue, '85.67');
});

test('rejects invalid date of birth (letters, invalid month, future date)', () => {
  const assistant = new ConversationalAssistant();
  assert.strictEqual(assistant.validateAnswer('dob', 'yesterday', { canonicalId: 'dob' }).valid, false);
  assert.strictEqual(assistant.validateAnswer('dob', '2005-15-20', { canonicalId: 'dob' }).valid, false);
  assert.strictEqual(assistant.validateAnswer('dob', '2099-01-01', { canonicalId: 'dob' }).valid, false);
});

test('accepts and normalizes valid DD/MM/YYYY date to ISO YYYY-MM-DD', () => {
  const assistant = new ConversationalAssistant();
  const res = assistant.validateAnswer('dob', '20/03/2007', { canonicalId: 'dob' });
  assert.strictEqual(res.valid, true);
  assert.strictEqual(res.normalizedValue, '2007-03-20');
});

test('rejects invalid names (pure numbers or single character)', () => {
  const assistant = new ConversationalAssistant();
  assert.strictEqual(assistant.validateAnswer('full_name', '12345', { canonicalId: 'full_name' }).valid, false);
  assert.strictEqual(assistant.validateAnswer('first_name', 'a', { canonicalId: 'first_name' }).valid, false);
});

test('accepts valid name "Pendyala Sai Rohith"', () => {
  const assistant = new ConversationalAssistant();
  const res = assistant.validateAnswer('full_name', 'Pendyala Sai Rohith', { canonicalId: 'full_name' });
  assert.strictEqual(res.valid, true);
  assert.strictEqual(res.normalizedValue, 'Pendyala Sai Rohith');
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Persistence Decision & Data Isolation (Issue 3)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n4. Persistence Decision & Data Isolation (Issue 3):');

test('submitAnswer rejects invalid email without modifying session or profile', () => {
  const plan = new ApplicationPlan();
  const profile = new InformationProfile();
  const assistant = new ConversationalAssistant(plan, profile);

  const res = assistant.submitAnswer('primary_email', '456', { canonicalId: 'primary_email' });
  assert.strictEqual(res.success, false);
  assert.ok(res.error);
  assert.strictEqual(plan.getSessionValue('primary_email'), null);
  assert.strictEqual(profile.getValue('primary_email'), '');
});

test('submitAnswer with persistToProfile=true saves to both profile and session', () => {
  const plan = new ApplicationPlan();
  const profile = new InformationProfile();
  const assistant = new ConversationalAssistant(plan, profile);

  const res = assistant.submitAnswer('primary_email', 'sai@example.com', {
    persistToProfile: true,
    canonicalId: 'primary_email'
  });

  assert.strictEqual(res.success, true);
  assert.strictEqual(res.persistedToProfile, true);
  assert.strictEqual(plan.getSessionValue('primary_email'), 'sai@example.com');
  assert.strictEqual(profile.getValue('primary_email'), 'sai@example.com');
  assert.strictEqual(profile.getField('primary_email').provenance, 'USER_ENTERED');
});

test('submitAnswer with persistToProfile=false saves to session ONLY, profile remains empty', () => {
  const plan = new ApplicationPlan();
  const profile = new InformationProfile();
  const assistant = new ConversationalAssistant(plan, profile);

  const res = assistant.submitAnswer('primary_email', 'sai@example.com', {
    persistToProfile: false,
    canonicalId: 'primary_email'
  });

  assert.strictEqual(res.success, true);
  assert.strictEqual(res.persistedToProfile, false);
  assert.strictEqual(plan.getSessionValue('primary_email'), 'sai@example.com');
  assert.strictEqual(profile.getValue('primary_email'), '', 'Profile must NOT be modified when persistToProfile is false');
});

test('application-specific fields (jam_paper) NEVER pollute persistent profile even with persistToProfile=true', () => {
  const plan = new ApplicationPlan();
  const profile = new InformationProfile();
  const assistant = new ConversationalAssistant(plan, profile);

  const res = assistant.submitAnswer('jam_paper', 'Mathematics (MA)', {
    persistToProfile: true,
    canonicalId: 'jam_paper',
    fieldDef: {
      elementId: 'jam_paper',
      options: ['Mathematics (MA)', 'Physics (PH)']
    }
  });

  assert.strictEqual(res.success, true);
  assert.strictEqual(res.persistedToProfile, false, 'App-specific fields must not persist to personal profile');
  assert.strictEqual(plan.getSessionValue('jam_paper'), 'Mathematics (MA)');
  assert.strictEqual(profile.getValue('jam_paper'), '');
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Mock Human Verification vs Real CAPTCHA Protection
// ─────────────────────────────────────────────────────────────────────────────
console.log('5. Mock Human Verification vs Real Security Challenge:');

test('mock challenge question generated with math calculation prompt ("What is the answer to 8 - 4?")', () => {
  const plan = new ApplicationPlan();
  plan.addPage({
    url: 'https://portal.test/app',
    title: 'Test Portal',
    fields: [
      {
        elementId: 'mock_captcha_answer',
        id: 'mock_captcha_answer',
        name: 'mock_captcha_answer',
        label: 'Mock Human Verification (8 - 4 = ?)',
        isMockSecurityChallenge: true,
        securityChallengeType: 'MOCK_SECURITY_CHALLENGE',
        challengeQuestion: '8 - 4 = ?',
        challengeExpectedAnswer: '4',
        challengePrompt: 'What is the answer to 8 - 4?'
      }
    ]
  });
  const assistant = new ConversationalAssistant(plan);
  const questions = assistant.getPendingQuestions();
  assert.strictEqual(questions.length, 1);
  assert.strictEqual(questions[0].isMockSecurityChallenge, true);
  assert.strictEqual(questions[0].prompt, 'What is the answer to 8 - 4?');
  assert.strictEqual(questions[0].challengeExpectedAnswer, '4');
});

test('real CAPTCHA is strictly excluded from conversational assistant questions', () => {
  const plan = new ApplicationPlan();
  plan.addPage({
    url: 'https://portal.test/app',
    title: 'Test Portal',
    fields: [
      {
        elementId: 'real_captcha_input',
        id: 'real_captcha_input',
        name: 'captcha',
        label: 'Security Code (Real CAPTCHA)',
        isRealSecurityChallenge: true,
        securityChallengeType: 'REAL_SECURITY_CHALLENGE'
      }
    ]
  });
  const assistant = new ConversationalAssistant(plan);
  const questions = assistant.getPendingQuestions();
  assert.strictEqual(questions.length, 0, 'Real CAPTCHA must NEVER produce assistant questions');
});

test('mock challenge validation rejects incorrect answer "5"', () => {
  const assistant = new ConversationalAssistant();
  const res = assistant.validateAnswer('mock_captcha_answer', '5', {
    isMockSecurityChallenge: true,
    challengeExpectedAnswer: '4',
    challengeQuestion: '8 - 4 = ?'
  });
  assert.strictEqual(res.valid, false);
  assert.strictEqual(res.error, '❌ Incorrect answer. Please try again.');
});

test('mock challenge validation accepts correct answer "4"', () => {
  const assistant = new ConversationalAssistant();
  const res = assistant.validateAnswer('mock_captcha_answer', '4', {
    isMockSecurityChallenge: true,
    challengeExpectedAnswer: '4',
    challengeQuestion: '8 - 4 = ?'
  });
  assert.strictEqual(res.valid, true);
  assert.strictEqual(res.error, null);
  assert.strictEqual(res.normalizedValue, '4');
});

test('mock challenge answers NEVER persist to InformationProfile even if requested', () => {
  const plan = new ApplicationPlan();
  const profile = new InformationProfile();
  const assistant = new ConversationalAssistant(plan, profile);

  const res = assistant.submitAnswer('mock_captcha_answer', '4', {
    persistToProfile: true, // Should be ignored!
    canonicalId: 'mock_security_challenge',
    fieldDef: {
      isMockSecurityChallenge: true,
      challengeExpectedAnswer: '4'
    }
  });

  assert.strictEqual(res.success, true);
  assert.strictEqual(res.persistedToProfile, false, 'Must not persist mock challenge to profile');
  assert.strictEqual(plan.getSessionValue('mock_captcha_answer'), '4');
  assert.strictEqual(profile.getValue('mock_security_challenge'), '', 'Profile must not contain mock challenge');
  assert.strictEqual(profile.getValue('mock_captcha_answer'), '', 'Profile must not contain mock captcha field');
});

test('real CAPTCHA proposal has status USER_ACTION_REQUIRED and blocks autofill', () => {
  const { SourceSelector } = require('../core/source-selector.js');
  const selector = new SourceSelector();
  const proposals = selector.generateProposals([
    {
      elementId: 'real_captcha_input',
      name: 'captcha',
      label: 'Enter Security Code',
      isRealSecurityChallenge: true,
      securityChallengeType: 'REAL_SECURITY_CHALLENGE'
    }
  ], {});

  assert.strictEqual(proposals.length, 1);
  assert.strictEqual(proposals[0].status, 'USER_ACTION_REQUIRED');
  assert.strictEqual(proposals[0].approved, false);
  assert.ok(proposals[0].reason.includes('Real CAPTCHA'));
});

console.log('\n========================================');
console.log(`TOTAL: ${passedTests}/${totalTests} TESTS PASSED`);
console.log('========================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
}
