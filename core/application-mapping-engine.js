/**
 * E-Fill Application Information Mapping & Transformation Engine
 * ===============================================================
 * Architecture: APPLICATION-FIRST UNDERSTANDING
 *
 * Core Flow:
 *   APPLICATION FIELD
 *         ↓
 *   UNDERSTAND REQUIREMENT (Semantic Requirement Analysis)
 *         ↓
 *   FIND INFORMATION (Profile, Education Records, Documents, Session)
 *         ↓
 *   MAP / TRANSFORM INFORMATION (13 Semantic Plugins)
 *         ↓
 *   PROPOSE RESULT (with Provenance, Confidence, Rationale)
 *         ↓
 *   USER REVIEW
 *         ↓
 *   APPROVED AUTOFILL
 *
 * Works in both Browser and Node.js environments.
 */

(function (global) {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────────
  // CONSTANTS & STATUS TAXONOMY
  // ─────────────────────────────────────────────────────────────────────────

  const MAPPING_STATUS = {
    DIRECTLY_AVAILABLE: 'DIRECTLY_AVAILABLE', // Exact match in profile/sources
    TRANSFORMABLE:      'TRANSFORMABLE',      // Deterministic transformation (format, case, prefix)
    DERIVABLE:          'DERIVABLE',          // Derived / calculated / decomposed from existing data
    REVIEW_REQUIRED:    'REVIEW_REQUIRED',    // Valid transformation that requires user verification
    AMBIGUOUS:          'AMBIGUOUS',          // Multiple plausible interpretations exist
    CONFLICT:           'CONFLICT',           // Divergent values detected across profile/documents
    MISSING:            'MISSING',            // Required by application but profile/docs lack data
    UNRESOLVED:         'UNRESOLVED',         // Form options/constraints cannot be safely resolved
    UNKNOWN:            'UNKNOWN'             // Application field cannot be confidently understood
  };

  // Map MAPPING_STATUS to proposal STATUS expected by Sidepanel & Autofill
  const PROPOSAL_STATUS_MAP = {
    DIRECTLY_AVAILABLE: 'READY',
    TRANSFORMABLE:      'READY',
    DERIVABLE:          'READY',
    REVIEW_REQUIRED:    'REVIEW_REQUIRED',
    AMBIGUOUS:          'AMBIGUOUS',
    CONFLICT:           'CONFLICT',
    MISSING:            'UNAVAILABLE',
    UNRESOLVED:         'UNAVAILABLE',
    UNKNOWN:            'UNAVAILABLE'
  };

  // ─────────────────────────────────────────────────────────────────────────
  // HELPER UTILITIES
  // ─────────────────────────────────────────────────────────────────────────

  function cleanStr(s) {
    if (!s || typeof s !== 'string') return '';
    return s.toLowerCase().replace(/[*:\-_/\\()[\]{}|]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function titleCase(str) {
    if (!str) return '';
    return str.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 1. FIELD SEMANTIC UNDERSTANDING
  // ─────────────────────────────────────────────────────────────────────────

  class FieldSemanticUnderstanding {
    /**
     * Inspects application field signals and builds a structured Semantic Requirement.
     */
    static analyzeRequirement(field) {
      if (!field) return null;

      const label = cleanStr(field.label || '');
      const name = cleanStr(field.name || '');
      const id = cleanStr(field.elementId || field.id || '');
      const placeholder = cleanStr(field.placeholder || '');
      const ariaLabel = cleanStr(field.ariaLabel || '');
      const sectionHeading = cleanStr(field.sectionHeading || '');
      const contextText = cleanStr(field.contextText || '');
      const type = (field.type || 'text').toLowerCase();
      const tagName = (field.tagName || 'input').toLowerCase();
      const options = Array.isArray(field.options) ? field.options : [];

      const combinedText = `${label} ${name} ${id} ${placeholder} ${ariaLabel} ${sectionHeading} ${contextText}`;

      let intent = 'UNKNOWN';
      let canonicalId = field.canonicalId || null;
      let dataType = type;
      if (tagName === 'select' || type === 'select-one' || type === 'select-multiple') dataType = 'select';
      else if (type === 'date') dataType = 'date';
      else if (type === 'file') dataType = 'file';

      const required = !!field.required || combinedText.includes('required') || combinedText.includes('*');
      const constraints = {
        maxLength: field.maxLength || field.maxlength || null,
        pattern: field.pattern || null,
        placeholder: field.placeholder || null,
        accept: field.accept || null
      };

      // ── Semantic Intent Detection Heuristics ──

      // 1. Name as per matriculation / Certificate Student Name
      if (/name as per|certificate name|matriculation certificate/i.test(combinedText) ||
          (/name/i.test(combinedText) && /matric|ssc|class 10|xth/i.test(combinedText) && !/father|mother|school|institution|board/i.test(combinedText))) {
        intent = 'NAME_CERTIFICATE';
        canonicalId = canonicalId || 'edu_candidate_name';
      }

      // 2. Education Marks & Percentage
      else if (/percentage|percent|cgpa|marks obtained|max marks|total marks|aggregate/i.test(combinedText) &&
          /ssc|10th|matric|class 10|xth|high school/i.test(combinedText)) {
        if (/percentage|percent|cgpa/i.test(label || name || id)) {
          intent = 'EDUCATION_PERCENTAGE';
          canonicalId = canonicalId || 'edu_10th_percentage';
        } else if (/max|maximum|total/i.test(label || name || id)) {
          intent = 'EDUCATION_MAX_MARKS';
          canonicalId = canonicalId || 'edu_10th_max_marks';
        } else {
          intent = 'EDUCATION_MARKS';
          canonicalId = canonicalId || 'edu_10th_marks';
        }
      } else if (/percentage|percent|cgpa/i.test(label || name || id)) {
        intent = 'PERCENTAGE_GENERIC';
        canonicalId = canonicalId || 'percentage';
      }

      // 3. Education Qualifications & Details (10th/SSC)
      else if (/ssc|10th|matric|class 10|xth/i.test(combinedText)) {
        if (/roll|seat|hall ticket/i.test(combinedText)) {
          intent = 'EDUCATION_ROLL_NO';
          canonicalId = canonicalId || 'edu_10th_roll_number';
        } else if (/board|council/i.test(combinedText)) {
          intent = 'EDUCATION_BOARD';
          canonicalId = canonicalId || 'edu_10th_board';
        } else if (/year|passing year|year of passing/i.test(combinedText)) {
          intent = 'EDUCATION_YEAR';
          canonicalId = canonicalId || 'edu_10th_year';
        } else if (/school|institution/i.test(combinedText)) {
          intent = 'EDUCATION_INSTITUTION';
          canonicalId = canonicalId || 'edu_10th_school';
        }
      }

      // 4. Name Components (First, Middle, Last / Surname)
      else if (/first\s*name|given\s*name|forename/i.test(combinedText) && !/father|mother|guardian/i.test(combinedText)) {
        intent = 'NAME_FIRST';
        canonicalId = canonicalId || 'first_name';
      } else if (/last\s*name|surname|family\s*name/i.test(combinedText) && !/father|mother|guardian/i.test(combinedText)) {
        intent = 'NAME_LAST';
        canonicalId = canonicalId || 'last_name';
      } else if (/middle\s*name/i.test(combinedText) && !/father|mother|guardian/i.test(combinedText)) {
        intent = 'NAME_MIDDLE';
        canonicalId = canonicalId || 'middle_name';
      } else if (/full\s*name|complete\s*name|candidate.*name|applicant.*name/i.test(combinedText) && !/father|mother|guardian/i.test(combinedText)) {
        intent = 'NAME_FULL';
        canonicalId = canonicalId || 'full_name';
      }

      // 5. Family Names
      else if (/father.*name/i.test(combinedText)) {
        intent = 'NAME_FATHER';
        canonicalId = canonicalId || 'father_name';
      } else if (/mother.*name/i.test(combinedText)) {
        intent = 'NAME_MOTHER';
        canonicalId = canonicalId || 'mother_name';
      }

      // 6. Date of Birth
      else if (/date of birth|dob|birth date|born on/i.test(combinedText)) {
        if (/day|dd\b/i.test(label || name || id)) {
          intent = 'DOB_DAY';
          canonicalId = canonicalId || 'dob_day';
        } else if (/month|mm\b/i.test(label || name || id)) {
          intent = 'DOB_MONTH';
          canonicalId = canonicalId || 'dob_month';
        } else if (/year|yyyy\b/i.test(label || name || id)) {
          intent = 'DOB_YEAR';
          canonicalId = canonicalId || 'dob_year';
        } else {
          intent = 'DATE_DOB';
          canonicalId = canonicalId || 'dob';
        }
      }

      // 7. Gender
      else if (/gender|sex/i.test(combinedText) || (options.length > 0 && options.some(o => /male|female/i.test(o.text || o.value || o)))) {
        intent = 'GENDER';
        canonicalId = canonicalId || 'gender';
      }

      // 8. Social Category / Reservation
      else if (/category|reservation|social status|community/i.test(combinedText) && !/exam|paper|post/i.test(combinedText)) {
        intent = 'CATEGORY_RESERVATION';
        canonicalId = canonicalId || 'category';
      }

      // 9. Address & Domicile
      else if (/permanent.*residence|permanent.*address|domicile.*address|place of residence/i.test(combinedText)) {
        intent = 'ADDRESS_PERMANENT';
        canonicalId = canonicalId || 'address_line';
      } else if (/present.*address|correspondence.*address|current.*address/i.test(combinedText)) {
        intent = 'ADDRESS_PRESENT';
        canonicalId = canonicalId || 'address_line';
      } else if (/pincode|postal code|pin code|zip/i.test(combinedText)) {
        intent = 'ADDRESS_PINCODE';
        canonicalId = canonicalId || 'pincode';
      } else if (/district/i.test(combinedText) && !/exam/i.test(combinedText)) {
        intent = 'ADDRESS_DISTRICT';
        canonicalId = canonicalId || 'district';
      } else if (/state|province/i.test(combinedText) && !/exam/i.test(combinedText)) {
        intent = 'ADDRESS_STATE';
        canonicalId = canonicalId || 'state';
      } else if (/address/i.test(combinedText)) {
        intent = 'ADDRESS_GENERIC';
        canonicalId = canonicalId || 'address_line';
      }

      // 10. Contact Details
      else if (/mobile|phone|contact number|cell/i.test(combinedText)) {
        intent = 'PHONE_PRIMARY';
        canonicalId = canonicalId || 'primary_phone';
      } else if (/email|e-mail/i.test(combinedText)) {
        intent = 'EMAIL_PRIMARY';
        canonicalId = canonicalId || 'email';
      }

      // 11. Document Upload / File Input
      else if (dataType === 'file' || /upload|browse file|attach/i.test(combinedText)) {
        intent = 'DOCUMENT_UPLOAD';
      }

      // 12. Unidentified / Unknown
      else {
        // If normalizer already found a canonicalId with strong confidence, preserve it
        if (field.canonicalId && field.confidence && field.confidence >= 0.70) {
          intent = 'CANONICAL_MATCHED';
          canonicalId = field.canonicalId;
        } else {
          intent = 'UNKNOWN';
        }
      }

      return {
        canonicalId,
        label: field.label || field.name || field.elementId || 'Field',
        section: field.sectionHeading || '',
        intent,
        dataType,
        required,
        constraints,
        acceptedOptions: options,
        sourceCandidates: [],
        mappingStatus: null,
        rawSignals: {
          elementId: field.elementId || field.id || '',
          selector: field.selector || '',
          name: field.name || '',
          tagName: field.tagName || '',
          type: field.type || '',
          placeholder: field.placeholder || '',
          ariaLabel: field.ariaLabel || '',
          title: field.title || '',
          sectionHeading: field.sectionHeading || '',
          contextText: field.contextText || ''
        }
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TRANSFORMATION PLUGINS
  // ─────────────────────────────────────────────────────────────────────────

  // 2. Direct Mapping Plugin
  class DirectMappingPlugin {
    static evaluate(requirement, profileData, sessionOverrides) {
      const cid = requirement.canonicalId;
      if (!cid) return null;

      // 1. Check session overrides first
      if (sessionOverrides && sessionOverrides[cid] !== undefined && sessionOverrides[cid] !== null && String(sessionOverrides[cid]).trim() !== '') {
        return {
          status: MAPPING_STATUS.DIRECTLY_AVAILABLE,
          proposedValue: String(sessionOverrides[cid]),
          originalValue: sessionOverrides[cid],
          source: 'Session Document Override',
          provenance: 'DOCUMENT_EXTRACTED',
          provenanceDetail: 'SESSION_OVERRIDE',
          confidence: 0.98,
          transformation: 'DIRECT',
          reason: `Direct match from session document override for "${cid}"`
        };
      }

      // 2. Check profile data (structured or flat)
      const valObj = extractProfileValue(cid, profileData);
      if (valObj && valObj.value !== undefined && valObj.value !== null && String(valObj.value).trim() !== '') {
        return {
          status: MAPPING_STATUS.DIRECTLY_AVAILABLE,
          proposedValue: String(valObj.value),
          originalValue: valObj.value,
          source: valObj.source || 'Information Profile',
          provenance: valObj.provenance || 'USER_ENTERED',
          provenanceDetail: 'DIRECT_PROFILE_MATCH',
          confidence: 0.95,
          transformation: 'DIRECT',
          reason: `Direct match for "${cid}" in profile`
        };
      }

      return null;
    }
  }

  // 3. Name Transformation Plugin
  class NameTransformationPlugin {
    static evaluate(requirement, profileData, sessionOverrides) {
      const intent = requirement.intent;
      const cid = requirement.canonicalId;
      if (!intent.startsWith('NAME_') && !['first_name', 'middle_name', 'last_name', 'full_name', 'edu_candidate_name'].includes(cid)) {
        return null;
      }

      // Check if candidate/full name exists in profile or educational records
      const fullCandidates = [
        extractProfileValue('full_name', profileData),
        extractProfileValue('edu_candidate_name', profileData),
        extractProfileValue('student_name', profileData)
      ].filter(c => c && c.value && String(c.value).trim() !== '');

      const storedFullName = fullCandidates.length > 0 ? String(fullCandidates[0].value).trim() : '';

      // Also check separate names in profile
      const storedFirst = extractProfileValue('first_name', profileData)?.value || '';
      const storedMiddle = extractProfileValue('middle_name', profileData)?.value || '';
      const storedLast = extractProfileValue('last_name', profileData)?.value || '';

      // A. Form requires FIRST_NAME
      if (intent === 'NAME_FIRST' || cid === 'first_name') {
        if (storedFirst) {
          return {
            status: MAPPING_STATUS.DIRECTLY_AVAILABLE,
            proposedValue: storedFirst,
            originalValue: storedFirst,
            source: 'Profile: Personal',
            provenance: 'USER_ENTERED',
            confidence: 0.95,
            transformation: 'DIRECT',
            reason: 'Direct match for First Name in profile'
          };
        }
        if (storedFullName) {
          const tokens = storedFullName.split(/\s+/).filter(Boolean);
          if (tokens.length === 1) {
            return {
              status: MAPPING_STATUS.DERIVABLE,
              proposedValue: tokens[0],
              originalValue: storedFullName,
              source: 'Information Profile (Full Name)',
              provenance: 'DERIVED',
              provenanceDetail: 'DERIVED_FROM(full_name)',
              confidence: 0.85,
              transformation: 'NAME_DECOMPOSITION',
              reason: 'Single-token name derived from Full Name'
            };
          } else if (tokens.length === 2) {
            return {
              status: MAPPING_STATUS.DERIVABLE,
              proposedValue: tokens[0],
              originalValue: storedFullName,
              source: 'Information Profile (Full Name)',
              provenance: 'DERIVED',
              provenanceDetail: 'DERIVED_FROM(full_name)',
              confidence: 0.90,
              transformation: 'NAME_DECOMPOSITION',
              reason: `Derived First Name "${tokens[0]}" from Full Name "${storedFullName}"`
            };
          } else {
            // 3+ tokens (e.g. "PENDYALA SAI ROHITH"):
            // In South Asian/Indian conventions (e.g. AP/Telangana), surname is tokens[0] ("PENDYALA"),
            // First/Given name is tokens[1] ("SAI"), and Middle name is tokens[2] ("ROHITH").
            // Western alternative: First name is tokens[0] ("PENDYALA").
            return {
              status: MAPPING_STATUS.REVIEW_REQUIRED,
              proposedValue: tokens[1],
              originalValue: storedFullName,
              source: 'Information Profile (Full Name)',
              provenance: 'DERIVED',
              provenanceDetail: 'DERIVED_FROM(full_name)',
              confidence: 0.75,
              transformation: 'NAME_DECOMPOSITION',
              reason: `Derived First Name "${tokens[1]}" from full name "${storedFullName}". User review required to confirm name component order.`,
              alternatives: [
                { label: 'Western First Name', value: tokens[0] },
                { label: 'Given Name (Combined)', value: tokens.slice(1).join(' ') }
              ]
            };
          }
        }
      }

      // B. Form requires LAST_NAME / SURNAME
      if (intent === 'NAME_LAST' || cid === 'last_name') {
        if (storedLast) {
          return {
            status: MAPPING_STATUS.DIRECTLY_AVAILABLE,
            proposedValue: storedLast,
            originalValue: storedLast,
            source: 'Profile: Personal',
            provenance: 'USER_ENTERED',
            confidence: 0.95,
            transformation: 'DIRECT',
            reason: 'Direct match for Last Name / Surname in profile'
          };
        }
        if (storedFullName) {
          const tokens = storedFullName.split(/\s+/).filter(Boolean);
          if (tokens.length >= 2) {
            // For 2 tokens: "Rohit Sharma" -> "Sharma"
            // For 3 tokens: "PENDYALA SAI ROHITH" -> leading token "PENDYALA" is surname
            const primarySurname = tokens.length === 2 ? tokens[1] : tokens[0];
            const altSurname = tokens[tokens.length - 1];
            return {
              status: tokens.length === 2 ? MAPPING_STATUS.DERIVABLE : MAPPING_STATUS.REVIEW_REQUIRED,
              proposedValue: primarySurname,
              originalValue: storedFullName,
              source: 'Information Profile (Full Name)',
              provenance: 'DERIVED',
              provenanceDetail: 'DERIVED_FROM(full_name)',
              confidence: tokens.length === 2 ? 0.90 : 0.75,
              transformation: 'NAME_DECOMPOSITION',
              reason: `Derived Surname/Last Name "${primarySurname}" from Full Name "${storedFullName}".`,
              alternatives: tokens.length > 2 ? [
                { label: 'Leading Surname (Regional)', value: tokens[0] },
                { label: 'Trailing Last Name (Western)', value: altSurname }
              ] : []
            };
          }
        }
      }

      // C. Form requires MIDDLE_NAME
      if (intent === 'NAME_MIDDLE' || cid === 'middle_name') {
        if (storedMiddle) {
          return {
            status: MAPPING_STATUS.DIRECTLY_AVAILABLE,
            proposedValue: storedMiddle,
            originalValue: storedMiddle,
            source: 'Profile: Personal',
            provenance: 'USER_ENTERED',
            confidence: 0.95,
            transformation: 'DIRECT',
            reason: 'Direct match for Middle Name in profile'
          };
        }
        if (storedFullName) {
          const tokens = storedFullName.split(/\s+/).filter(Boolean);
          if (tokens.length >= 3) {
            // For 3 tokens "PENDYALA SAI ROHITH":
            // In surname-first convention, tokens[2] is middle/secondary name ("ROHITH")
            // In Western convention, tokens[1] is middle name ("SAI")
            const middle = tokens[2];
            return {
              status: MAPPING_STATUS.REVIEW_REQUIRED,
              proposedValue: middle,
              originalValue: storedFullName,
              source: 'Information Profile (Full Name)',
              provenance: 'DERIVED',
              provenanceDetail: 'DERIVED_FROM(full_name)',
              confidence: 0.75,
              transformation: 'NAME_DECOMPOSITION',
              reason: `Derived Middle Name "${middle}" from full name "${storedFullName}". User review required.`,
              alternatives: [
                { label: 'Western Middle Name', value: tokens[1] }
              ]
            };
          }
        }
      }

      // D. Form requires FULL_NAME or CERTIFICATE_NAME
      if (intent === 'NAME_FULL' || intent === 'NAME_CERTIFICATE' || cid === 'full_name' || cid === 'edu_candidate_name') {
        if (storedFullName) {
          // If form expects UPPERCASE (like govt exam certificate name)
          const isExamOrCert = intent === 'NAME_CERTIFICATE' || cleanStr(requirement.label).includes('certificate') || cleanStr(requirement.label).includes('matriculation');
          const finalVal = isExamOrCert ? storedFullName.toUpperCase() : storedFullName;
          return {
            status: MAPPING_STATUS.DIRECTLY_AVAILABLE,
            proposedValue: finalVal,
            originalValue: storedFullName,
            source: fullCandidates[0]?.source || 'Information Profile',
            provenance: fullCandidates[0]?.provenance || 'DOCUMENT_EXTRACTED',
            provenanceDetail: isExamOrCert ? 'UPPERCASE_NORMALIZED' : 'EXACT',
            confidence: 0.95,
            transformation: isExamOrCert ? 'NAME_CASING' : 'DIRECT',
            reason: `Full name matched from profile${isExamOrCert ? ' (formatted for certificate requirement)' : ''}`
          };
        } else if (storedFirst || storedLast) {
          // Reverse assembly from separate names
          const assembled = [storedFirst, storedMiddle, storedLast].filter(Boolean).join(' ');
          return {
            status: MAPPING_STATUS.DERIVABLE,
            proposedValue: assembled,
            originalValue: `${storedFirst} / ${storedLast}`,
            source: 'Profile: Personal (Names)',
            provenance: 'DERIVED',
            provenanceDetail: 'DERIVED_FROM(first_name, last_name)',
            confidence: 0.90,
            transformation: 'NAME_ASSEMBLY',
            reason: `Assembled Full Name from individual name parts: "${assembled}"`
          };
        }
      }

      return null;
    }
  }

  // 4. Address Transformation Plugin
  class AddressTransformationPlugin {
    static evaluate(requirement, profileData) {
      const intent = requirement.intent;
      const cid = requirement.canonicalId;
      if (!intent.startsWith('ADDRESS_') && !['address_line', 'house_number', 'street', 'village', 'mandal', 'district', 'state', 'pincode'].includes(cid)) {
        return null;
      }

      const addrLine = extractProfileValue('address_line', profileData)?.value || '';
      const houseNo  = extractProfileValue('house_number', profileData)?.value || '';
      const street   = extractProfileValue('street', profileData)?.value || '';
      const village  = extractProfileValue('village', profileData)?.value || '';
      const mandal   = extractProfileValue('mandal', profileData)?.value || '';
      const district = extractProfileValue('district', profileData)?.value || '';
      const state    = extractProfileValue('state', profileData)?.value || '';
      const pincode  = extractProfileValue('pincode', profileData)?.value || '';

      // A. Form requires full address / permanent place of residence
      if (intent === 'ADDRESS_PERMANENT' || intent === 'ADDRESS_PRESENT' || intent === 'ADDRESS_GENERIC' || cid === 'address_line') {
        if (addrLine) {
          return {
            status: MAPPING_STATUS.DIRECTLY_AVAILABLE,
            proposedValue: addrLine,
            originalValue: addrLine,
            source: 'Profile: Address',
            provenance: 'USER_ENTERED',
            confidence: 0.95,
            transformation: 'DIRECT',
            reason: 'Address matched from profile'
          };
        }
        // Compose from components
        const parts = [houseNo, street, village, mandal, district, state ? `${state} - ${pincode}` : pincode].filter(Boolean);
        if (parts.length > 0) {
          const composed = parts.join(', ');
          return {
            status: MAPPING_STATUS.DERIVABLE,
            proposedValue: composed,
            originalValue: parts.join('; '),
            source: 'Profile: Address (Components)',
            provenance: 'DERIVED',
            provenanceDetail: 'DERIVED_FROM(address_components)',
            confidence: 0.90,
            transformation: 'ADDRESS_COMPOSITION',
            reason: `Composed full address from stored components: "${composed}"`
          };
        }
      }

      // B. Component fields (district, state, pincode)
      if (cid === 'district' && district) {
        return { status: MAPPING_STATUS.DIRECTLY_AVAILABLE, proposedValue: district, originalValue: district, source: 'Profile: Address', provenance: 'USER_ENTERED', confidence: 0.95, transformation: 'DIRECT', reason: 'District from profile' };
      }
      if (cid === 'state' && state) {
        return { status: MAPPING_STATUS.DIRECTLY_AVAILABLE, proposedValue: state, originalValue: state, source: 'Profile: Address', provenance: 'USER_ENTERED', confidence: 0.95, transformation: 'DIRECT', reason: 'State from profile' };
      }
      if (cid === 'pincode' && pincode) {
        return { status: MAPPING_STATUS.DIRECTLY_AVAILABLE, proposedValue: pincode, originalValue: pincode, source: 'Profile: Address', provenance: 'USER_ENTERED', confidence: 0.95, transformation: 'DIRECT', reason: 'Pincode from profile' };
      }

      return null;
    }
  }

  // 5. Date Transformation Plugin
  class DateTransformationPlugin {
    static evaluate(requirement, profileData) {
      const intent = requirement.intent;
      const cid = requirement.canonicalId;
      if (intent !== 'DATE_DOB' && intent !== 'DOB_DAY' && intent !== 'DOB_MONTH' && intent !== 'DOB_YEAR' && cid !== 'dob') {
        return null;
      }

      const dobVal = extractProfileValue('dob', profileData)?.value;
      if (!dobVal) return null;

      const dateStr = String(dobVal).trim();
      // Parse ISO YYYY-MM-DD or DD/MM/YYYY
      let y = '', m = '', d = '';
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        [y, m, d] = dateStr.split('-');
      } else if (/^\d{2}[/-]\d{2}[/-]\d{4}$/.test(dateStr)) {
        const parts = dateStr.split(/[/-]/);
        d = parts[0]; m = parts[1]; y = parts[2];
      }

      if (!y || !m || !d) return null;

      // Split fields
      if (intent === 'DOB_DAY' || cid === 'dob_day') {
        return { status: MAPPING_STATUS.TRANSFORMABLE, proposedValue: d, originalValue: dateStr, source: 'Profile: Personal (DOB)', provenance: 'APPLICATION_TRANSFORMED', confidence: 0.95, transformation: 'DATE_SPLIT', reason: 'Extracted day (DD) from date of birth' };
      }
      if (intent === 'DOB_MONTH' || cid === 'dob_month') {
        return { status: MAPPING_STATUS.TRANSFORMABLE, proposedValue: m, originalValue: dateStr, source: 'Profile: Personal (DOB)', provenance: 'APPLICATION_TRANSFORMED', confidence: 0.95, transformation: 'DATE_SPLIT', reason: 'Extracted month (MM) from date of birth' };
      }
      if (intent === 'DOB_YEAR' || cid === 'dob_year') {
        return { status: MAPPING_STATUS.TRANSFORMABLE, proposedValue: y, originalValue: dateStr, source: 'Profile: Personal (DOB)', provenance: 'APPLICATION_TRANSFORMED', confidence: 0.95, transformation: 'DATE_SPLIT', reason: 'Extracted year (YYYY) from date of birth' };
      }

      // Input type="date" requires YYYY-MM-DD
      if (requirement.dataType === 'date' || requirement.rawSignals?.type === 'date') {
        const iso = `${y}-${m}-${d}`;
        return {
          status: MAPPING_STATUS.TRANSFORMABLE,
          proposedValue: iso,
          originalValue: dateStr,
          source: 'Profile: Personal (DOB)',
          provenance: 'APPLICATION_TRANSFORMED',
          confidence: 0.98,
          transformation: 'DATE_FORMAT',
          reason: 'Formatted Date of Birth as ISO YYYY-MM-DD for native date picker'
        };
      }

      // Check placeholder / label format hints
      const rawLabel = (requirement.label || '').toLowerCase();
      const rawPlaceholder = (requirement.constraints?.placeholder || '').toLowerCase();
      if (/dd[/-]mm[/-]yyyy|dd\s*mm\s*yyyy/.test(rawPlaceholder) || /dd[/-]mm[/-]yyyy|dd\s*mm\s*yyyy/.test(rawLabel)) {
        const sep = rawPlaceholder.includes('dd-mm-yyyy') || rawLabel.includes('dd-mm-yyyy') ? '-' : '/';
        const formatted = `${d}${sep}${m}${sep}${y}`;
        return {
          status: MAPPING_STATUS.TRANSFORMABLE,
          proposedValue: formatted,
          originalValue: dateStr,
          source: 'Profile: Personal (DOB)',
          provenance: 'APPLICATION_TRANSFORMED',
          confidence: 0.95,
          transformation: 'DATE_FORMAT',
          reason: `Converted Date of Birth to DD${sep}MM${sep}YYYY format`
        };
      }

      // Default: ISO or DD/MM/YYYY
      return {
        status: MAPPING_STATUS.TRANSFORMABLE,
        proposedValue: `${y}-${m}-${d}`,
        originalValue: dateStr,
        source: 'Profile: Personal (DOB)',
        provenance: 'APPLICATION_TRANSFORMED',
        confidence: 0.90,
        transformation: 'DATE_FORMAT',
        reason: 'Standard date of birth value'
      };
    }
  }

  // 6. Education Mapping Plugin
  class EducationMappingPlugin {
    static evaluate(requirement, profileData, sessionOverrides) {
      const intent = requirement.intent;
      const cid = requirement.canonicalId;
      if (!intent.startsWith('EDUCATION_') && !cid?.startsWith('edu_')) {
        return null;
      }

      // SSC / 10th specific resolution
      if (intent === 'EDUCATION_ROLL_NO' || cid === 'edu_10th_roll_number' || cid === 'ssc_roll_no') {
        const roll = extractProfileValue('edu_10th_roll_number', profileData)?.value ||
                     extractProfileValue('roll_number', profileData)?.value ||
                     sessionOverrides?.edu_10th_roll_number;
        if (roll) {
          return { status: MAPPING_STATUS.DIRECTLY_AVAILABLE, proposedValue: String(roll), originalValue: roll, source: 'Education: 10th / SSC Record', provenance: 'DOCUMENT_EXTRACTED', confidence: 0.95, transformation: 'DIRECT', reason: 'Class 10 Roll Number from educational record' };
        }
      }

      if (intent === 'EDUCATION_BOARD' || cid === 'edu_10th_board' || cid === 'ssc_board') {
        const board = extractProfileValue('edu_10th_board', profileData)?.value ||
                      extractProfileValue('board', profileData)?.value ||
                      sessionOverrides?.edu_10th_board;
        if (board) {
          return { status: MAPPING_STATUS.DIRECTLY_AVAILABLE, proposedValue: String(board), originalValue: board, source: 'Education: 10th / SSC Record', provenance: 'DOCUMENT_EXTRACTED', confidence: 0.95, transformation: 'DIRECT', reason: 'Class 10 Board from educational record' };
        }
      }

      if (intent === 'EDUCATION_YEAR' || cid === 'edu_10th_year' || cid === 'ssc_year') {
        const year = extractProfileValue('edu_10th_year', profileData)?.value ||
                     extractProfileValue('year_of_passing', profileData)?.value ||
                     sessionOverrides?.edu_10th_year;
        if (year) {
          return { status: MAPPING_STATUS.DIRECTLY_AVAILABLE, proposedValue: String(year), originalValue: year, source: 'Education: 10th / SSC Record', provenance: 'DOCUMENT_EXTRACTED', confidence: 0.95, transformation: 'DIRECT', reason: 'Passing Year from educational record' };
        }
      }

      return null;
    }
  }

  // 7. Marks & Percentage Transformation Plugin
  class MarksPercentageTransformationPlugin {
    static evaluate(requirement, profileData, sessionOverrides) {
      const intent = requirement.intent;
      const cid = requirement.canonicalId;
      if (intent !== 'EDUCATION_PERCENTAGE' && intent !== 'PERCENTAGE_GENERIC' && cid !== 'edu_10th_percentage' && cid !== 'percentage') {
        return null;
      }

      // Check if percentage already stored directly
      const directPct = extractProfileValue('edu_10th_percentage', profileData)?.value ||
                        extractProfileValue('percentage', profileData)?.value ||
                        sessionOverrides?.edu_10th_percentage;
      if (directPct) {
        return {
          status: MAPPING_STATUS.DIRECTLY_AVAILABLE,
          proposedValue: String(directPct).replace('%', '').trim(),
          originalValue: directPct,
          source: 'Education: 10th Record',
          provenance: 'DOCUMENT_EXTRACTED',
          confidence: 0.95,
          transformation: 'DIRECT',
          reason: 'Percentage directly found in educational records'
        };
      }

      // Calculate percentage from marks obtained and maximum marks
      const marks = extractProfileValue('edu_10th_marks', profileData)?.value ||
                    extractProfileValue('marks_obtained', profileData)?.value ||
                    sessionOverrides?.edu_10th_marks;
      const maxMarks = extractProfileValue('edu_10th_max_marks', profileData)?.value ||
                       extractProfileValue('maximum_marks', profileData)?.value ||
                       sessionOverrides?.edu_10th_max_marks;

      if (marks !== undefined && maxMarks !== undefined && Number(maxMarks) > 0) {
        const m = parseFloat(marks);
        const max = parseFloat(maxMarks);
        if (!isNaN(m) && !isNaN(max) && max > 0) {
          const pct = ((m / max) * 100).toFixed(2);
          const needsSymbol = cleanStr(requirement.constraints?.placeholder || '').includes('%');
          const formattedPct = needsSymbol ? `${pct}%` : pct;

          return {
            status: MAPPING_STATUS.DERIVABLE,
            proposedValue: formattedPct,
            originalValue: `${m} / ${max}`,
            source: 'Education: 10th Marks',
            provenance: 'DERIVED',
            provenanceDetail: 'DERIVED_FROM(edu_10th_marks, edu_10th_max_marks)',
            confidence: 0.92,
            transformation: 'PERCENTAGE_CALCULATION',
            reason: `Calculated Percentage: (${m} / ${max}) × 100 = ${pct}%`
          };
        }
      }

      return null;
    }
  }

  // 8. Category & Reservation Mapping Plugin
  class CategoryMappingPlugin {
    static evaluate(requirement, profileData) {
      if (requirement.intent !== 'CATEGORY_RESERVATION' && requirement.canonicalId !== 'category') {
        return null;
      }

      const catVal = extractProfileValue('category', profileData)?.value;
      if (!catVal) return null;

      const userCat = String(catVal).trim().toLowerCase();
      const options = requirement.acceptedOptions || [];

      if (options.length > 0) {
        // Map synonyms
        const SYNONYMS = {
          'general': ['general', 'gen', 'ur', 'unreserved', 'open'],
          'obc': ['obc', 'obc-ncl', 'obc - ncl', 'other backward classes', 'bc-a', 'bc-b'],
          'obc-ncl': ['obc-ncl', 'obc - ncl', 'obc (non-creamy layer)', 'obc non-creamy layer', 'obc'],
          'sc': ['sc', 'scheduled caste', 'scheduled castes'],
          'st': ['st', 'scheduled tribe', 'scheduled tribes'],
          'ews': ['ews', 'economically weaker section', 'economically weaker sections']
        };

        const targetGroup = Object.keys(SYNONYMS).find(k => k === userCat || SYNONYMS[k].includes(userCat)) || userCat;
        const acceptableTokens = SYNONYMS[targetGroup] || [targetGroup];

        for (const opt of options) {
          const optText = cleanStr(opt.text || opt.value || opt);
          const optVal  = cleanStr(opt.value || opt.text || opt);

          for (const token of acceptableTokens) {
            if (optText === token || optVal === token || optText.startsWith(token + ' ') || optText.includes(`(${token})`) || optText.includes(token)) {
              return {
                status: MAPPING_STATUS.TRANSFORMABLE,
                proposedValue: opt.value || opt.text,
                originalValue: catVal,
                source: 'Profile: Personal (Category)',
                provenance: 'APPLICATION_TRANSFORMED',
                confidence: 0.95,
                transformation: 'OPTION_MATCHING',
                reason: `Matched category "${catVal}" to application option "${opt.text || opt.value}"`
              };
            }
          }
        }
      }

      return {
        status: MAPPING_STATUS.DIRECTLY_AVAILABLE,
        proposedValue: catVal,
        originalValue: catVal,
        source: 'Profile: Personal (Category)',
        provenance: 'USER_ENTERED',
        confidence: 0.90,
        transformation: 'DIRECT',
        reason: 'Category from profile'
      };
    }
  }

  // 9. Gender & Option Mapping Plugin
  class GenderOptionPlugin {
    static evaluate(requirement, profileData) {
      if (requirement.intent !== 'GENDER' && requirement.canonicalId !== 'gender') {
        return null;
      }

      const genderVal = extractProfileValue('gender', profileData)?.value;
      if (!genderVal) return null;

      const userG = String(genderVal).trim().toLowerCase();
      const options = requirement.acceptedOptions || [];

      if (options.length > 0) {
        for (const opt of options) {
          const optText = cleanStr(opt.text || opt.value || opt);
          const optVal  = cleanStr(opt.value || opt.text || opt);

          if (userG.startsWith('m') && (optText === 'male' || optVal === 'male' || optVal === 'm' || optVal === '1')) {
            return {
              status: MAPPING_STATUS.TRANSFORMABLE,
              proposedValue: opt.value || opt.text,
              originalValue: genderVal,
              source: 'Profile: Personal (Gender)',
              provenance: 'APPLICATION_TRANSFORMED',
              confidence: 0.98,
              transformation: 'OPTION_MATCHING',
              reason: `Matched Gender "Male" to dropdown option "${opt.text || opt.value}"`
            };
          }
          if (userG.startsWith('f') && (optText === 'female' || optVal === 'female' || optVal === 'f' || optVal === '2')) {
            return {
              status: MAPPING_STATUS.TRANSFORMABLE,
              proposedValue: opt.value || opt.text,
              originalValue: genderVal,
              source: 'Profile: Personal (Gender)',
              provenance: 'APPLICATION_TRANSFORMED',
              confidence: 0.98,
              transformation: 'OPTION_MATCHING',
              reason: `Matched Gender "Female" to dropdown option "${opt.text || opt.value}"`
            };
          }
        }
      }

      return {
        status: MAPPING_STATUS.DIRECTLY_AVAILABLE,
        proposedValue: titleCase(genderVal),
        originalValue: genderVal,
        source: 'Profile: Personal (Gender)',
        provenance: 'USER_ENTERED',
        confidence: 0.90,
        transformation: 'DIRECT',
        reason: 'Gender from profile'
      };
    }
  }

  // 10. Format Transformation Plugin (Phone stripping, whitespace)
  class FormatTransformationPlugin {
    static evaluate(requirement, profileData) {
      const intent = requirement.intent;
      const cid = requirement.canonicalId;

      if (intent === 'PHONE_PRIMARY' || cid === 'primary_phone') {
        const phone = extractProfileValue('primary_phone', profileData)?.value;
        if (!phone) return null;

        const cleanPhone = String(phone).replace(/\D/g, '');
        // Strip country code +91 if length > 10 and starts with 91
        let finalPhone = cleanPhone;
        if (cleanPhone.length === 12 && cleanPhone.startsWith('91')) {
          finalPhone = cleanPhone.slice(2);
        } else if (cleanPhone.length === 11 && cleanPhone.startsWith('0')) {
          finalPhone = cleanPhone.slice(1);
        }

        return {
          status: finalPhone !== phone ? MAPPING_STATUS.TRANSFORMABLE : MAPPING_STATUS.DIRECTLY_AVAILABLE,
          proposedValue: finalPhone,
          originalValue: phone,
          source: 'Profile: Contact (Phone)',
          provenance: finalPhone !== phone ? 'APPLICATION_TRANSFORMED' : 'USER_ENTERED',
          confidence: 0.95,
          transformation: finalPhone !== phone ? 'PHONE_CLEANUP' : 'DIRECT',
          reason: finalPhone !== phone ? 'Stripped country code / leading zeros for 10-digit mobile field' : 'Mobile number from profile'
        };
      }

      return null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // VALUE EXTRACTION HELPER
  // ─────────────────────────────────────────────────────────────────────────

  function extractProfileValue(canonicalKey, profile) {
    if (!profile || !canonicalKey) return null;

    // 1. If profile is an InformationProfile instance with getField()
    if (typeof profile.getField === 'function') {
      const entry = profile.getField(canonicalKey);
      if (entry && entry.value !== undefined && entry.value !== null && String(entry.value).trim() !== '') {
        return {
          value: String(entry.value).trim(),
          provenance: entry.provenance || 'USER_ENTERED',
          source: entry.source || 'Information Profile'
        };
      }
      // Aliases / Cross-section checks
      if (canonicalKey === 'full_name' || canonicalKey === 'candidate_name') {
        const eduCand = profile.getField('edu_candidate_name') || profile.getField('student_name');
        if (eduCand && eduCand.value) {
          return {
            value: String(eduCand.value).trim(),
            provenance: eduCand.provenance || 'DOCUMENT_EXTRACTED',
            source: eduCand.source || 'Education: 10th / SSC Record'
          };
        }
      }
      if (canonicalKey === 'edu_candidate_name') {
        const fn = profile.getField('full_name') || profile.getField('candidate_name');
        if (fn && fn.value) {
          return {
            value: String(fn.value).trim(),
            provenance: fn.provenance || 'USER_ENTERED',
            source: fn.source || 'Information Profile'
          };
        }
      }
      if (canonicalKey === 'primary_phone') {
        const p = profile.getField('phone') || profile.getField('mobile');
        if (p && p.value) return { value: String(p.value).trim(), provenance: p.provenance || 'USER_ENTERED', source: p.source || 'Information Profile' };
      }
    }

    // 2. Resolve underlying data structure (_data or plain profile object)
    const data = profile._data || profile;
    const personal  = data.personal || {};
    const contact   = data.contact || {};
    const family    = data.family || {};
    const address   = data.address || {};
    const education = data.education || [];

    const checkField = (f) => {
      if (!f) return null;
      const v = typeof f === 'object' && f !== null && f.value !== undefined ? f.value : f;
      if (v !== undefined && v !== null && String(v).trim() !== '') {
        return {
          value: String(v).trim(),
          provenance: (typeof f === 'object' && f !== null && f.provenance) ? f.provenance : 'USER_ENTERED',
          source: (typeof f === 'object' && f !== null && f.source) ? f.source : 'Information Profile'
        };
      }
      return null;
    };

    // Personal / Identity / Full Name resolution
    if (canonicalKey === 'full_name' || canonicalKey === 'candidate_name') {
      const fn = checkField(personal.full_name) || checkField(personal.fullName);
      if (fn) return fn;
      const fnEdu = checkEducationFields(education, ['edu_candidate_name', 'candidate_name', 'student_name']);
      if (fnEdu) return fnEdu;
    }
    if (canonicalKey === 'edu_candidate_name' || canonicalKey === 'student_name') {
      const fnEdu = checkEducationFields(education, ['edu_candidate_name', 'candidate_name', 'student_name']);
      if (fnEdu) return fnEdu;
      const fn = checkField(personal.full_name) || checkField(personal.fullName);
      if (fn) return fn;
    }
    if (canonicalKey === 'first_name') return checkField(personal.first_name) || checkField(personal.firstName);
    if (canonicalKey === 'middle_name') return checkField(personal.middle_name) || checkField(personal.middleName);
    if (canonicalKey === 'last_name') return checkField(personal.last_name) || checkField(personal.lastName);
    if (canonicalKey === 'dob') return checkField(personal.dob);
    if (canonicalKey === 'gender') return checkField(personal.gender);
    if (canonicalKey === 'category') return checkField(personal.category) || checkField(data.category?.category);

    // Contact
    if (canonicalKey === 'primary_phone') return checkField(contact.primary_phone) || checkField(contact.primaryPhone);
    if (canonicalKey === 'email') return checkField(contact.email);

    // Family
    if (canonicalKey === 'father_name') return checkField(family.father_name) || checkField(family.fatherName) || checkEducationFields(education, ['edu_father_name', 'father_name']);
    if (canonicalKey === 'mother_name') return checkField(family.mother_name) || checkField(family.motherName) || checkEducationFields(education, ['edu_mother_name', 'mother_name']);

    // Address
    if (canonicalKey === 'address_line') return checkField(address.address_line) || checkField(address.addressLine);
    if (canonicalKey === 'house_number') return checkField(address.house_number) || checkField(address.houseNumber);
    if (canonicalKey === 'street') return checkField(address.street);
    if (canonicalKey === 'village') return checkField(address.village);
    if (canonicalKey === 'mandal') return checkField(address.mandal);
    if (canonicalKey === 'district') return checkField(address.district);
    if (canonicalKey === 'state') return checkField(address.state);
    if (canonicalKey === 'pincode') return checkField(address.pincode);

    // Education (10th / SSC)
    if (canonicalKey.startsWith('edu_') || canonicalKey.startsWith('ssc_')) {
      const simpleKey = canonicalKey.replace(/^edu_10th_|^ssc_|^edu_/, '');
      const eduVal = checkEducationFields(education, [canonicalKey, `edu_10th_${simpleKey}`, `edu_${simpleKey}`, simpleKey]);
      if (eduVal) return eduVal;
    }

    // Direct lookup on raw profile object (flat format)
    if (data[canonicalKey] !== undefined && data[canonicalKey] !== null) {
      return checkField(data[canonicalKey]);
    }

    return null;
  }

  function checkEducationFields(education, keys) {
    if (!education) return null;
    const records = Array.isArray(education)
      ? education
      : (Array.isArray(education.records) ? education.records : Object.values(education));

    for (const rec of records) {
      if (!rec || !rec.fields) continue;
      for (const k of keys) {
        const f = rec.fields[k];
        if (f) {
          const v = typeof f === 'object' && f !== null && f.value !== undefined ? f.value : f;
          if (v !== undefined && v !== null && String(v).trim() !== '') {
            return {
              value: String(v).trim(),
              provenance: (typeof f === 'object' && f !== null && f.provenance) ? f.provenance : 'DOCUMENT_EXTRACTED',
              source: (typeof f === 'object' && f !== null && f.source) ? f.source : `Education: ${rec.qualification || rec.title || rec.type || '10th'}`
            };
          }
        }
      }
    }
    return null;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MAIN ENGINE COORDINATOR
  // ─────────────────────────────────────────────────────────────────────────

  class ApplicationMappingEngine {
    constructor() {
      this.plugins = [
        NameTransformationPlugin,
        AddressTransformationPlugin,
        DateTransformationPlugin,
        EducationMappingPlugin,
        MarksPercentageTransformationPlugin,
        CategoryMappingPlugin,
        GenderOptionPlugin,
        FormatTransformationPlugin,
        DirectMappingPlugin
      ];
    }

    /**
     * Maps an application field to the best available profile or transformed source.
     *
     * @param {Object} field             - Raw detected form field from content script
     * @param {Object} profile           - v2 InformationProfile or legacy flat profile
     * @param {Object} [sessionOverrides] - Temporary document extraction overrides
     * @returns {Object} Structured proposal matching SourceSelector format
     */
    mapField(field, profile, sessionOverrides) {
      // 1. Field Semantic Understanding
      const req = FieldSemanticUnderstanding.analyzeRequirement(field);
      if (!req) return null;

      // Security credential: Passwords and credentials must NEVER be treated as missing or autofilled
      if (field.isSecurityCredential || field.type === 'SECURITY_CREDENTIAL' || field.securityType === 'SECURITY_CREDENTIAL') {
        req.mappingStatus = 'SECURITY_CREDENTIAL';
        return {
          fieldId:              field.elementId || '',
          selector:             field.selector || '',
          name:                 field.name || '',
          tagName:              field.tagName || 'input',
          label:                field.label || 'Password',
          type:                 'SECURITY_CREDENTIAL',
          canonicalId:          null,
          proposedValue:        '',
          originalProfileValue: null,
          source:               'Security Credential',
          provenance:           null,
          provenanceLabel:      '🔐 User Action',
          provenanceDetail:     null,
          status:               'USER_ACTION_REQUIRED',
          mappingStatus:        'SECURITY_CREDENTIAL',
          confidence:           1.0,
          transformation:       'NONE',
          transformationNote:   'Enter directly on the application',
          alternatives:         [],
          semanticRequirement:  req,
          reason:               'Enter directly on the application',
          isSecurityCredential: true,
          securityType:         'SECURITY_CREDENTIAL',
          approved:             false,
          userEdited:           false,
          conflicts:            []
        };
      }

      // Real security challenge: CAPTCHA / human verification must NEVER be treated as missing or autofilled
      if (field.isRealSecurityChallenge || field.type === 'SECURITY_CHALLENGE' || field.securityChallengeType === 'SECURITY_CHALLENGE' || field.securityChallengeType === 'REAL_SECURITY_CHALLENGE') {
        req.mappingStatus = 'SECURITY_CHALLENGE';
        return {
          fieldId:              field.elementId || '',
          selector:             field.selector || '',
          name:                 field.name || '',
          tagName:              field.tagName || 'input',
          label:                'Website Security',
          type:                 'SECURITY_CHALLENGE',
          canonicalId:          null,
          proposedValue:        '',
          originalProfileValue: null,
          source:               'Website Security Challenge',
          provenance:           null,
          provenanceLabel:      '🔐 Website Security',
          provenanceDetail:     null,
          status:               'USER_ACTION_REQUIRED',
          mappingStatus:        'SECURITY_CHALLENGE',
          confidence:           1.0,
          transformation:       'NONE',
          transformationNote:   'Complete the CAPTCHA directly on the application page.',
          alternatives:         [],
          semanticRequirement:  req,
          reason:               'Complete the CAPTCHA directly on the application page.',
          isRealSecurityChallenge: true,
          securityChallengeType: 'SECURITY_CHALLENGE',
          approved:             false,
          userEdited:           false,
          conflicts:            []
        };
      }

      // 2. If the field is completely UNKNOWN and cannot be understood
      if (req.intent === 'UNKNOWN' && !req.canonicalId) {
        req.mappingStatus = MAPPING_STATUS.UNKNOWN;
        return this._buildProposal(req, {
          status: MAPPING_STATUS.UNKNOWN,
          proposedValue: '',
          originalValue: null,
          source: 'None',
          provenance: null,
          confidence: 0,
          transformation: 'NONE',
          reason: 'Application field requirement cannot be confidently identified — user review required'
        });
      }

      // 3. Coordinate transformation plugins
      let result = null;
      for (const plugin of this.plugins) {
        result = plugin.evaluate(req, profile, sessionOverrides);
        if (result) break;
      }

      // 4. Missing Information Detection & Application Choices
      if (!result || !result.proposedValue) {
        if (field.isRadioGroup || (field.options && field.options.length > 0 && field.type === 'radio')) {
          req.mappingStatus = 'APPLICATION_CHOICE';
          return {
            fieldId:              field.elementId || '',
            selector:             field.selector || '',
            name:                 field.name || '',
            tagName:              field.tagName || '',
            label:                req.label || field.elementId || 'Application Choice',
            type:                 'radio',
            canonicalId:          req.canonicalId,
            proposedValue:        '',
            originalProfileValue: null,
            options:              field.options || [],
            source:               'Application Choices',
            provenance:           null,
            provenanceLabel:      '🔘 Choice Required',
            status:               'APPLICATION_CHOICE',
            mappingStatus:        'APPLICATION_CHOICE',
            confidence:           0.8,
            transformation:       'NONE',
            transformationNote:   'Please select an option for this application',
            alternatives:         field.options || [],
            semanticRequirement:  req,
            reason:               'Please select an option for this application',
            isApplicationChoice:  true,
            approved:             false,
            userEdited:           false,
            conflicts:            []
          };
        }

        req.mappingStatus = MAPPING_STATUS.MISSING;
        return this._buildProposal(req, {
          status: MAPPING_STATUS.MISSING,
          proposedValue: '',
          originalValue: null,
          source: 'Information Profile',
          provenance: null,
          confidence: 0,
          transformation: 'NONE',
          reason: `No saved information in profile for "${req.label || req.canonicalId}"`
        });
      }

      req.mappingStatus = result.status;
      const prop = this._buildProposal(req, result);
      if (field.options && field.options.length > 0) {
        prop.options = field.options;
      }
      return prop;
    }

    _buildProposal(req, result) {
      const raw = req.rawSignals || {};
      const status = PROPOSAL_STATUS_MAP[result.status] || 'UNAVAILABLE';
      const approved = (status === 'READY');

      return {
        fieldId:              raw.elementId || '',
        selector:             raw.selector || '',
        name:                 raw.name || '',
        tagName:              raw.tagName || '',
        label:                req.label || raw.elementId || 'Field',
        type:                 raw.type || 'text',
        canonicalId:          req.canonicalId,
        proposedValue:        result.proposedValue || '',
        originalProfileValue: result.originalValue,
        source:               result.source || 'Information Profile',
        provenance:           result.provenance,
        provenanceLabel:      this._provenanceLabel(result.provenance),
        provenanceDetail:     result.provenanceDetail || null,
        status:               status,
        mappingStatus:        result.status,
        confidence:           result.confidence !== undefined ? result.confidence : 0.8,
        transformation:       result.transformation || 'DIRECT',
        transformationNote:   result.reason || '',
        alternatives:         result.alternatives || [],
        semanticRequirement:  req,
        reason:               result.reason || `Status: ${status}`,
        approved:             approved,
        userEdited:           false,
        conflicts:            []
      };
    }

    _provenanceLabel(provenance) {
      const labels = {
        USER_ENTERED:            '✏️ User entered',
        USER_CONFIRMED:          '✓ Confirmed',
        USER_EDITED:             '✏️ User edited',
        DOCUMENT_EXTRACTED:      '📄 From document',
        IMPORTED:                '↓ Imported',
        APPLICATION_SPECIFIC:    '🔧 App-specific',
        DERIVED:                 '🔄 Derived',
        APPLICATION_TRANSFORMED: '⚙️ Transformed'
      };
      return provenance ? (labels[provenance] || provenance) : null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // EXPORTS
  // ─────────────────────────────────────────────────────────────────────────

  const applicationMappingEngine = new ApplicationMappingEngine();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      MAPPING_STATUS,
      PROPOSAL_STATUS_MAP,
      FieldSemanticUnderstanding,
      ApplicationMappingEngine,
      applicationMappingEngine
    };
  }

  if (typeof global !== 'undefined') {
    global.EFillApplicationMappingEngine = {
      MAPPING_STATUS,
      PROPOSAL_STATUS_MAP,
      FieldSemanticUnderstanding,
      ApplicationMappingEngine,
      applicationMappingEngine
    };
  }

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
