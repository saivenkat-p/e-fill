/**
 * E-Fill Conversational Assistant
 * ================================
 * Facilitates interactive information collection for missing or ambiguous fields:
 *   - Identifies genuinely missing fields on the active page from the Application Plan
 *   - Distinguishes FIELD SEMANTICS from FIELD VALUES when generating questions
 *   - Performs semantic validation and normalization on user answers BEFORE accepting
 *   - Supports persistence decisions: Save to My Information vs Use for this application only
 *   - Isolates application-specific choices from persistent personal profiles
 *
 * SAFETY INVARIANTS:
 *   - The assistant NEVER decides exam papers, cities, categories, or legal answers for the user.
 *   - All choices must be explicitly made or confirmed by the user.
 *   - Invalid inputs (e.g. "456" for email) are rejected before application context or Review & Fill.
 *   - The assistant is NOT a separate source of truth; answers enter the Application Plan.
 *   - Never silently overwrites existing persistent profile information.
 */

(function (global) {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────────
  // Helper: Detect if a text string is actually a VALUE rather than a field label
  // ─────────────────────────────────────────────────────────────────────────
  const COMMON_VALUES = new Set([
    'india', 'indian', 'bharat', 'usa', 'united states', 'uk', 'united kingdom',
    'canada', 'australia', 'germany', 'france', 'japan', 'china',
    'male', 'female', 'transgender', 'other',
    'yes', 'no', 'true', 'false',
    'general', 'obc', 'obc-ncl', 'sc', 'st', 'ews', 'unreserved', 'pwd',
    'select', 'choose', '-- select --', '-- choose --', 'none', 'n/a', 'na'
  ]);

  function isLikelyValueNotLabel(text, field = null) {
    if (!text || typeof text !== 'string') return true;
    const clean = text.trim().toLowerCase();
    if (!clean) return true;

    // Direct dictionary check
    if (COMMON_VALUES.has(clean)) return true;

    // Check if matches option in select element
    if (field && Array.isArray(field.options) && field.options.length > 0) {
      for (const opt of field.options) {
        const val = typeof opt === 'string' ? opt : (opt.value || opt.text || '');
        const txt = typeof opt === 'string' ? opt : (opt.text || opt.value || '');
        if (clean === val.trim().toLowerCase() || clean === txt.trim().toLowerCase()) {
          return true;
        }
      }
    }

    // Check if equals element's current value or placeholder
    if (field && field.currentValue && clean === String(field.currentValue).trim().toLowerCase()) return true;
    if (field && field.placeholder && clean === String(field.placeholder).trim().toLowerCase() && COMMON_VALUES.has(clean)) return true;

    return false;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Helper: Date parsing & validation
  // ─────────────────────────────────────────────────────────────────────────
  function parseAndValidateDate(str, isBirthDate = false) {
    const s = String(str || '').trim();
    if (!s) return { valid: false, error: 'Please enter a date.' };

    let y, m, d;
    const isoMatch = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/);
    if (isoMatch) {
      y = parseInt(isoMatch[1], 10);
      m = parseInt(isoMatch[2], 10);
      d = parseInt(isoMatch[3], 10);
    } else {
      const dmyMatch = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})$/);
      if (dmyMatch) {
        d = parseInt(dmyMatch[1], 10);
        m = parseInt(dmyMatch[2], 10);
        y = parseInt(dmyMatch[3], 10);
      } else {
        return { valid: false, error: 'Please enter a valid date (e.g. DD/MM/YYYY or YYYY-MM-DD).' };
      }
    }

    if (m < 1 || m > 12) return { valid: false, error: 'Invalid month in date (must be 1–12).' };
    if (d < 1 || d > 31) return { valid: false, error: 'Invalid day in date.' };

    const daysInMonth = new Date(y, m, 0).getDate();
    if (d > daysInMonth) return { valid: false, error: `Invalid day for month ${m} (maximum ${daysInMonth} days).` };

    const currentYear = new Date().getFullYear();
    if (y < 1900 || y > currentYear + 20) return { valid: false, error: 'Year out of realistic range.' };

    if (isBirthDate) {
      const inputDate = new Date(y, m - 1, d);
      if (inputDate > new Date()) return { valid: false, error: 'Date of birth cannot be in the future.' };
    }

    const mm = String(m).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    return { valid: true, iso: `${y}-${mm}-${dd}` };
  }

  class ConversationalAssistant {
    constructor(applicationPlan = null, profile = null) {
      this.plan = applicationPlan || (global.EFillApplicationPlan ? global.EFillApplicationPlan.applicationPlan : null);
      this.profile = profile;
    }

    setPlan(plan) {
      this.plan = plan;
    }

    setProfile(profile) {
      this.profile = profile;
    }

    /**
     * Check if a field is an application-specific choice rather than a general profile field.
     */
    isApplicationSpecificField(fieldId, canonicalId) {
      const fid = (fieldId || '').toLowerCase();
      const cid = (canonicalId || '').toLowerCase();
      const appSpecificKeywords = [
        'jam_paper', 'test_paper', 'exam_paper', 'paper',
        'exam_city', 'city_1', 'city_2', 'city_3', 'center', 'centre',
        'fellowship_stream', 'stream', 'specialization',
        'declaration', 'agree', 'undertaking'
      ];
      return appSpecificKeywords.some(k => fid.includes(k) || cid.includes(k));
    }

    /**
     * Generates a natural semantic question based on field meaning, NOT on values.
     * @param {Object} field Field object from form detector
     * @param {string} canonicalId Canonical field ID
     * @returns {string} Human-friendly question
     */
    getSemanticQuestionPrompt(field, canonicalId) {
      const cid = (canonicalId || field.canonicalId || field.id || field.elementId || field.name || '').toLowerCase();

      // Standard semantic field question dictionary
      const semanticPrompts = {
        country: 'What is your country?',
        nationality: 'What is your nationality?',
        primary_email: 'What is your email address?',
        email: 'What is your email address?',
        applicant_email: 'What is your email address?',
        primary_phone: 'What is your mobile number?',
        phone: 'What is your mobile number?',
        mobile: 'What is your mobile number?',
        contact_mobile: 'What is your mobile number?',
        dob: 'What is your date of birth?',
        date_of_birth: 'What is your date of birth?',
        edu_percentage: 'What is your percentage?',
        percentage: 'What is your percentage?',
        ssc_percentage: 'What is your percentage?',
        hsc_percentage: 'What is your percentage?',
        full_name: 'What is your full name?',
        applicant_name: "What is the applicant's full name?",
        candidate_name: "What is the candidate's full name?",
        first_name: 'What is your first name?',
        middle_name: 'What is your middle name?',
        last_name: 'What is your last name / surname?',
        surname: 'What is your last name / surname?',
        father_name: "What is your father's name?",
        mother_name: "What is your mother's name?",
        gender: 'What is your gender?',
        category: 'What is your category?',
        state: 'What is your state of domicile / residence?',
        domicile_state: 'What is your state of domicile / residence?',
        district: 'What is your district?',
        city: 'What is your city or village?',
        village: 'What is your city or village?',
        pincode: 'What is your PIN code?',
        pin_code: 'What is your PIN code?',
        address_line: 'What is your permanent address?',
        permanent_address: 'What is your permanent address?',
        address: 'What is your address?',
        aadhaar_number: 'What is your Aadhaar number?',
        pan_number: 'What is your PAN number?',
        edu_roll_number: 'What is your roll number / registration number?',
        roll_number: 'What is your roll number / registration number?',
        matric_roll: 'What is your roll number / registration number?',
        registration_number: 'What is your registration number?',
        edu_board: 'What is your examination board?',
        board: 'What is your examination board?',
        edu_year: 'What is your year of passing?',
        passing_year: 'What is your year of passing?',
        year_of_passing: 'What is your year of passing?',
        jam_paper: 'Which test paper are you appearing for in JAM 2027?',
        exam_city_1: 'What is your First Choice for Examination City?',
        exam_city_2: 'What is your Second Choice for Examination City?',
        exam_city_3: 'What is your Third Choice for Examination City?',
        fellowship_stream: 'What is your proposed field of research?'
      };

      for (const [key, prompt] of Object.entries(semanticPrompts)) {
        if (cid === key || cid.endsWith(`_${key}`) || cid.startsWith(`${key}_`)) {
          return prompt;
        }
      }

      // If raw label is available, check that it's NOT a value (e.g. "India")
      let rawLabel = (field.label || '').trim();
      if (rawLabel && !isLikelyValueNotLabel(rawLabel, field)) {
        // Strip trailing asterisks, colons, or "(required)"
        const cleanLabel = rawLabel.replace(/[\*:]|\(required\)/gi, '').trim();
        if (cleanLabel.length > 1) {
          if (Array.isArray(field.options) && field.options.length > 0) {
            return `Please choose your ${cleanLabel}:`;
          }
          return `What is your ${cleanLabel}?`;
        }
      }

      // If raw label was a value or empty, fall back to canonical label or element name
      const schemaDef = (global.EFillCanonicalSchema && global.EFillCanonicalSchema.CANONICAL_FIELDS)
        ? global.EFillCanonicalSchema.CANONICAL_FIELDS[canonicalId]
        : null;

      if (schemaDef && schemaDef.label) {
        return `What is your ${schemaDef.label}?`;
      }

      return `Please enter your information for ${canonicalId || field.elementId || 'this field'}:`;
    }

    /**
     * Checks if a field is genuinely missing or already available from profile/session/derivation.
     */
    isFieldAvailable(field, canonicalId, fieldId, activePage) {
      const cid = canonicalId;
      const fid = fieldId;

      if (field.isSecurityCredential || field.type === 'SECURITY_CREDENTIAL' || field.securityType === 'SECURITY_CREDENTIAL' ||
          field.type === 'password' || field.isRealSecurityChallenge || field.type === 'SECURITY_CHALLENGE' || field.isSubsequentRadio) {
        return true;
      }

      // Check if this is a mock security challenge
      if (field.isMockSecurityChallenge || field.securityChallengeType === 'MOCK_SECURITY_CHALLENGE' || cid === 'mock_security_challenge' || fid.startsWith('mock_captcha')) {
        if (field.currentValue && String(field.currentValue).trim() !== '') return true;
        if (this.plan && (this.plan.getSessionValue(cid) || this.plan.getSessionValue(fid) || (field.elementId && this.plan.getSessionValue(field.elementId)))) return true;
        return false;
      }

      // 1. Check DOM current value
      if (field.currentValue && String(field.currentValue).trim() !== '') {
        return true;
      }

      // 2. Check Application Plan session data
      if (this.plan) {
        if (this.plan.getSessionValue(cid) || this.plan.getSessionValue(fid) || (field.elementId && this.plan.getSessionValue(field.elementId))) {
          return true;
        }
      }

      // 3. Check living InformationProfile
      if (this.profile) {
        let profVal = null;
        if (typeof this.profile.getValue === 'function') {
          profVal = this.profile.getValue(cid) || this.profile.getValue(fid);
        } else if (typeof this.profile.getField === 'function') {
          const entry = this.profile.getField(cid) || this.profile.getField(fid);
          profVal = entry ? entry.value : null;
        } else {
          profVal = this.profile[cid] || this.profile[fid] || null;
        }

        if (profVal && String(profVal).trim() !== '') {
          return true;
        }
      }

      // 4. Check ApplicationMappingEngine for derivations (e.g. name splits, marks to percentage)
      const mappingEngine = global.EFillApplicationMappingEngine ? global.EFillApplicationMappingEngine.applicationMappingEngine : null;
      if (mappingEngine && this.profile) {
        try {
          const mapped = mappingEngine.mapField(field, this.profile);
          if (mapped && mapped.proposedValue && String(mapped.proposedValue).trim() !== '') {
            return true;
          }
        } catch (e) {}
      }

      // 5. Check ApplicationPlan requirements
      if (this.plan && Array.isArray(this.plan.requirements)) {
        const req = this.plan.requirements.find(r =>
          (r.canonicalId === cid || r.id === fid || r.id === field.elementId) &&
          (!activePage || !activePage.url || r.pageUrl === activePage.url)
        );
        if (req && (
          req.status === 'AVAILABLE' ||
          req.status === 'READY' ||
          req.status === 'FILLED' ||
          req.status === 'DERIVABLE' ||
          req.status === 'TRANSFORMABLE' ||
          (req.proposedValue && String(req.proposedValue).trim() !== '')
        )) {
          return true;
        }
      }

      return false;
    }

    /**
     * Generates progressive interactive questions for genuinely missing fields on the active page.
     * @returns {Array} List of question objects with available DOM options
     */
    getPendingQuestions() {
      if (!this.plan) return [];

      const activePage = this.plan.getActivePage();
      if (!activePage || !activePage.fields) return [];

      const questions = [];

      activePage.fields.forEach(field => {
        // STRICT SECURITY CREDENTIAL PROTECTION: Passwords are NEVER asked by the assistant
        if (field.isSecurityCredential || field.type === 'SECURITY_CREDENTIAL' || field.securityType === 'SECURITY_CREDENTIAL' ||
            field.type === 'password' || (field.name && /^(?:password|confirm_password|new_password|passwd)$/i.test(field.name))) {
          return;
        }

        // STRICT REAL CAPTCHA PROTECTION: Real CAPTCHA is NEVER solved or asked by the assistant
        if (field.isRealSecurityChallenge || field.type === 'SECURITY_CHALLENGE' || field.securityChallengeType === 'SECURITY_CHALLENGE' || field.securityChallengeType === 'REAL_SECURITY_CHALLENGE' ||
            (field.name && /^(?:captcha|recaptcha|hcaptcha|cf-turnstile|security[_-]?code)$/i.test(field.name) && !field.isMockSecurityChallenge)) {
          return;
        }

        // Skip subsequent radio option elements (handled as a unified group)
        if (field.isSubsequentRadio) {
          return;
        }

        const cid = field.canonicalId;
        const fid = field.elementId || field.id || cid;

        // Skip if already available from document/profile/session/derivation
        if (this.isFieldAvailable(field, cid, fid, activePage)) {
          return;
        }

        // Check if this is a MOCK security challenge
        if (field.isMockSecurityChallenge || field.securityChallengeType === 'MOCK_SECURITY_CHALLENGE' || cid === 'mock_security_challenge' || fid.startsWith('mock_captcha')) {
          const prompt = field.challengePrompt || (field.challengeQuestion ? `What is the answer to ${field.challengeQuestion.replace('?', '').replace('=', '').trim()}?` : 'What is the answer to 8 - 4?');
          questions.push({
            fieldId: fid,
            canonicalId: 'mock_security_challenge',
            elementId: field.elementId || field.id,
            selector: field.selector,
            label: field.label || 'Mock Human Verification',
            prompt: prompt,
            type: 'text',
            options: [],
            disabled: false,
            isApplicationSpecific: true,
            isSecurityChallenge: true,
            isMockSecurityChallenge: true,
            challengeExpectedAnswer: field.challengeExpectedAnswer || '4',
            challengeQuestion: field.challengeQuestion || '8 - 4 = ?'
          });
          return;
        }

        // Clean select options if present
        const options = (field.options || [])
          .filter(opt => {
            const val = typeof opt === 'string' ? opt : opt.value;
            const text = typeof opt === 'string' ? opt : opt.text;
            return val && !text.includes('-- Select') && !text.includes('-- Choose');
          })
          .map(opt => (typeof opt === 'string' ? opt : (opt.text || opt.value)));

        const prompt = this.getSemanticQuestionPrompt(field, cid);

        questions.push({
          fieldId: fid,
          canonicalId: cid,
          elementId: field.elementId || field.id,
          selector: field.selector,
          label: field.label || cid,
          prompt,
          type: options.length > 0 ? 'choice' : 'text',
          options,
          disabled: !!field.disabled,
          isApplicationSpecific: this.isApplicationSpecificField(fid, cid)
        });
      });

      return questions;
    }

    /**
     * Semantic validation and normalization of user answers.
     * Ensures invalid values (e.g. "456" for email) are rejected before being accepted or stored.
     * @param {string} fieldId Field identifier
     * @param {string} answer Raw user input
     * @param {Object} [fieldDef] Optional field definition/metadata
     * @returns {{ valid: boolean, normalizedValue: string, error: string|null, targetCanonicalId: string }}
     */
    validateAnswer(fieldId, answer, fieldDef = {}) {
      const cid = (fieldDef.canonicalId || fieldId || '').toLowerCase();
      const label = (fieldDef.label || '').toLowerCase();
      const name = (fieldDef.name || fieldDef.elementId || '').toLowerCase();
      const val = String(answer !== undefined && answer !== null ? answer : '').trim();

      if (!val) {
        return {
          valid: false,
          error: 'Please enter a value.',
          normalizedValue: '',
          targetCanonicalId: cid
        };
      }

      // ── 0. MOCK SECURITY CHALLENGE VALIDATION ────────────────────────────
      if (fieldDef.isMockSecurityChallenge || cid === 'mock_security_challenge' || fieldId.startsWith('mock_captcha') || fieldId.startsWith('mock_challenge') || label.includes('mock human verification')) {
        let expected = fieldDef.challengeExpectedAnswer;
        if (!expected) {
          const qText = `${fieldDef.challengeQuestion || ''} ${fieldDef.prompt || ''} ${label}`;
          const mathMatch = qText.match(/(\d+)\s*([\+\-\*\/])\s*(\d+)/);
          if (mathMatch) {
            const n1 = parseInt(mathMatch[1], 10);
            const op = mathMatch[2];
            const n2 = parseInt(mathMatch[3], 10);
            if (op === '+') expected = String(n1 + n2);
            else if (op === '-') expected = String(n1 - n2);
            else if (op === '*') expected = String(n1 * n2);
            else if (op === '/') expected = String(Math.floor(n1 / n2));
          } else {
            expected = '4';
          }
        }
        if (val !== String(expected).trim()) {
          return {
            valid: false,
            error: '❌ Incorrect answer. Please try again.',
            normalizedValue: val,
            targetCanonicalId: 'mock_security_challenge'
          };
        }
        return {
          valid: true,
          error: null,
          normalizedValue: val,
          targetCanonicalId: 'mock_security_challenge'
        };
      }

      // ── 1. EMAIL VALIDATION ──────────────────────────────────────────────
      if (cid.includes('email') || label.includes('email') || name.includes('email')) {
        const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        if (!emailRegex.test(val)) {
          return {
            valid: false,
            error: 'Please enter a valid email address (e.g. name@example.com).',
            normalizedValue: val,
            targetCanonicalId: 'email'
          };
        }
        return {
          valid: true,
          error: null,
          normalizedValue: val.toLowerCase(),
          targetCanonicalId: 'email'
        };
      }

      // ── 2. MOBILE / PHONE VALIDATION ────────────────────────────────────
      if (cid.includes('phone') || cid.includes('mobile') || label.includes('mobile') || label.includes('phone') || name.includes('mobile') || name.includes('phone')) {
        const digitsOnly = val.replace(/[\s\-\(\)\.]/g, '');
        const phoneRegex = /^\+?\d{10,15}$/;
        if (!phoneRegex.test(digitsOnly) || digitsOnly.replace(/^\+/, '').length < 10) {
          return {
            valid: false,
            error: 'Please enter a valid 10-digit mobile number.',
            normalizedValue: val,
            targetCanonicalId: 'primary_phone'
          };
        }
        return {
          valid: true,
          error: null,
          normalizedValue: digitsOnly,
          targetCanonicalId: 'primary_phone'
        };
      }

      // ── 3. DATE OF BIRTH / DATE VALIDATION ──────────────────────────────
      if (cid === 'dob' || cid.includes('date_of_birth') || cid.includes('birth_date') || label.includes('date of birth') || label.includes('dob') || name.includes('dob')) {
        const parsed = parseAndValidateDate(val, true);
        if (!parsed.valid) {
          return {
            valid: false,
            error: parsed.error || 'Please enter a valid date of birth (e.g. DD/MM/YYYY or YYYY-MM-DD).',
            normalizedValue: val,
            targetCanonicalId: 'dob'
          };
        }
        return {
          valid: true,
          error: null,
          normalizedValue: parsed.iso,
          targetCanonicalId: 'dob'
        };
      }

      // ── 4. PERCENTAGE VALIDATION ─────────────────────────────────────────
      if (cid.includes('percentage') || label.includes('percentage') || label.includes('%') || name.includes('percentage')) {
        const cleanNum = val.replace('%', '').trim();
        const num = parseFloat(cleanNum);
        if (isNaN(num) || num < 0 || num > 100 || !/^-?\d+(?:\.\d+)?$/.test(cleanNum)) {
          return {
            valid: false,
            error: 'Please enter a valid percentage between 0 and 100 (e.g. 85.5).',
            normalizedValue: val,
            targetCanonicalId: 'edu_percentage'
          };
        }
        return {
          valid: true,
          error: null,
          normalizedValue: String(parseFloat(num.toFixed(2))),
          targetCanonicalId: 'edu_percentage'
        };
      }

      // ── 5. NAME VALIDATION ───────────────────────────────────────────────
      if (cid === 'full_name' || cid === 'first_name' || cid === 'middle_name' || cid === 'last_name' || cid === 'father_name' || cid === 'mother_name' || (label.includes('name') && !label.includes('user') && !label.includes('file'))) {
        if (/^\d+$/.test(val) || val.length < 2 || /^[^a-zA-Z\s]+$/.test(val)) {
          return {
            valid: false,
            error: 'Please enter a valid name.',
            normalizedValue: val,
            targetCanonicalId: cid
          };
        }
        return {
          valid: true,
          error: null,
          normalizedValue: val,
          targetCanonicalId: cid
        };
      }

      // ── 6. ROLL NUMBER / REGISTRATION NUMBER ────────────────────────────
      if (cid.includes('roll') || cid.includes('registration') || label.includes('roll') || label.includes('registration') || name.includes('roll')) {
        if (val.length < 2 || /^\s+$/.test(val)) {
          return {
            valid: false,
            error: 'Please enter a valid roll / registration number.',
            normalizedValue: val,
            targetCanonicalId: cid
          };
        }
        return {
          valid: true,
          error: null,
          normalizedValue: val,
          targetCanonicalId: cid
        };
      }

      // ── 7. PIN CODE VALIDATION ───────────────────────────────────────────
      if (cid.includes('pincode') || cid.includes('pin_code') || label.includes('pin code') || label.includes('pincode')) {
        if (!/^\d{6}$/.test(val)) {
          return {
            valid: false,
            error: 'Please enter a valid 6-digit PIN code.',
            normalizedValue: val,
            targetCanonicalId: 'pincode'
          };
        }
        return {
          valid: true,
          error: null,
          normalizedValue: val,
          targetCanonicalId: 'pincode'
        };
      }

      // ── 8. CHOICE OPTIONS MATCHING ──────────────────────────────────────
      if (fieldDef.options && Array.isArray(fieldDef.options) && fieldDef.options.length > 0) {
        const match = fieldDef.options.find(opt => {
          const optVal = typeof opt === 'string' ? opt : (opt.value || opt.text || '');
          const optText = typeof opt === 'string' ? opt : (opt.text || opt.value || '');
          return optVal.toLowerCase() === val.toLowerCase() || optText.toLowerCase() === val.toLowerCase();
        });
        if (!match) {
          return {
            valid: false,
            error: 'Please select one of the available choices.',
            normalizedValue: val,
            targetCanonicalId: cid
          };
        }
        const matchedVal = typeof match === 'string' ? match : (match.value || match.text);
        return {
          valid: true,
          error: null,
          normalizedValue: matchedVal,
          targetCanonicalId: cid
        };
      }

      // ── 9. DEFAULT CONSERVATIVE ACCEPTANCE ──────────────────────────────
      return {
        valid: true,
        error: null,
        normalizedValue: val,
        targetCanonicalId: cid
      };
    }

    /**
     * Submits a validated user answer.
     * @param {string} fieldId Field canonical ID or element ID
     * @param {string} answer User-chosen option or entered text
     * @param {Object} [options] { persistToProfile: boolean, canonicalId: string, fieldDef: Object }
     * @returns {Object} Result of applying answer
     */
    submitAnswer(fieldId, answer, options = {}) {
      if (!fieldId || answer === undefined || answer === null || !this.plan) {
        return { success: false, error: 'Invalid field or answer' };
      }

      const fieldDef = options.fieldDef || {};
      const validation = this.validateAnswer(fieldId, answer, fieldDef);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error,
          rejected: true
        };
      }

      const val = validation.normalizedValue;
      const targetCid = options.canonicalId || validation.targetCanonicalId || fieldId;

      // Check if saving to persistent profile
      let persistedToProfile = false;
      const isMockChallenge = fieldDef.isMockSecurityChallenge || targetCid === 'mock_security_challenge' || fieldId.startsWith('mock_captcha');
      if (options.persistToProfile && this.profile && !isMockChallenge) {
        const isAppSpecific = this.isApplicationSpecificField(fieldId, targetCid);
        if (!isAppSpecific) {
          if (typeof this.profile.setField === 'function') {
            this.profile.setField(targetCid, val, 'USER_ENTERED', 'Conversational Assistant');
            persistedToProfile = true;
          }
        }
      }

      // Always record in Application Plan session context
      this.plan.setSessionValue(fieldId, val, 'CONVERSATIONAL_ASSISTANT');
      if (targetCid && targetCid !== fieldId) {
        this.plan.setSessionValue(targetCid, val, 'CONVERSATIONAL_ASSISTANT');
      }

      // Re-evaluate Application Plan
      if (this.profile) {
        this.plan.evaluateAgainstProfile(this.profile);
      }

      return {
        success: true,
        fieldId,
        canonicalId: targetCid,
        value: val,
        persistedToProfile,
        planSummary: this.plan.getSummary()
      };
    }
  }

  const conversationalAssistantInstance = new ConversationalAssistant();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ConversationalAssistant, conversationalAssistant: conversationalAssistantInstance };
  } else {
    global.EFillConversationalAssistant = { ConversationalAssistant, conversationalAssistant: conversationalAssistantInstance };
  }
})(typeof window !== 'undefined' ? window : globalThis);
