/**
 * E-Fill Information Availability Engine
 * =======================================
 * Determines the availability status of every detected application field
 * against the user's Information Profile.
 *
 * Availability states (exactly as specified):
 *   AVAILABLE       — value is present, single source, high confidence
 *   MISSING         — no value in profile for this canonical field
 *   CONFLICT        — multiple sources provide different values for this field
 *   AMBIGUOUS       — value exists but the best source is unclear
 *   REVIEW_REQUIRED — value exists but provenance is weak/unconfirmed
 *
 * IMPORTANT: This engine never guesses. When in doubt it returns
 * REVIEW_REQUIRED, not AVAILABLE.
 */

(function (global) {
  'use strict';

  const schema = global.EFillCanonicalSchema || (typeof require !== 'undefined' ? require('./canonical-schema.js') : null);
  const ipMod  = global.EFillInformationProfile || (typeof require !== 'undefined' ? require('./information-profile.js') : null);

  const PROVENANCE_TYPES = (schema && schema.PROVENANCE_TYPES) || {
    USER_ENTERED: 'USER_ENTERED',
    DOCUMENT_EXTRACTED: 'DOCUMENT_EXTRACTED',
    USER_CONFIRMED: 'USER_CONFIRMED',
    USER_EDITED: 'USER_EDITED',
    IMPORTED: 'IMPORTED',
    APPLICATION_SPECIFIC: 'APPLICATION_SPECIFIC'
  };

  // Provenances that automatically flag REVIEW_REQUIRED
  const REVIEW_PROVENANCES = new Set([
    PROVENANCE_TYPES.DOCUMENT_EXTRACTED  // extracted but not yet confirmed
  ]);

  // Provenances considered "strong" (no extra review needed for value existence)
  const STRONG_PROVENANCES = new Set([
    PROVENANCE_TYPES.USER_ENTERED,
    PROVENANCE_TYPES.USER_CONFIRMED,
    PROVENANCE_TYPES.USER_EDITED
  ]);

  class AvailabilityEngine {
    /**
     * Check a single canonical field against the profile.
     *
     * @param {string} canonicalId
     * @param {Object|InformationProfile} profile  — can be v2 InformationProfile or legacy flat
     * @param {Object} [extraSources]  — optional: { canonicalId: { value, source } } from other sources
     * @returns {{
     *   status: 'AVAILABLE'|'MISSING'|'CONFLICT'|'AMBIGUOUS'|'REVIEW_REQUIRED',
     *   value: string,
     *   source: string,
     *   provenance: string|null,
     *   conflicts: Array,
     *   notes: string
     * }}
     */
    check(canonicalId, profile, extraSources) {
      if (!canonicalId || !profile) {
        return this._result('MISSING', '', null, null, [], 'No canonicalId or profile provided');
      }

      // Extract primary value from profile
      const primary = this._extractFromProfile(canonicalId, profile);

      // Gather all available values (profile + any extra sources)
      const allSources = [];
      if (primary && primary.value) {
        allSources.push(primary);
      }
      if (extraSources && extraSources[canonicalId]) {
        allSources.push(extraSources[canonicalId]);
      }

      // ── MISSING ────────────────────────────────────────────────────────────
      if (allSources.length === 0) {
        return this._result('MISSING', '', null, null, [], `No value found in profile for "${canonicalId}"`);
      }

      // ── SINGLE SOURCE ──────────────────────────────────────────────────────
      if (allSources.length === 1) {
        const s = allSources[0];

        // Value without provenance → AMBIGUOUS
        if (!s.provenance) {
          return this._result('AMBIGUOUS', s.value, s.source, null, [],
            'Value present but source/provenance is unknown');
        }

        // Extracted but not confirmed → REVIEW_REQUIRED
        if (REVIEW_PROVENANCES.has(s.provenance)) {
          return this._result('REVIEW_REQUIRED', s.value, s.source, s.provenance, [],
            'Value was extracted from document but has not been confirmed by user');
        }

        // Strong provenance → AVAILABLE
        if (STRONG_PROVENANCES.has(s.provenance)) {
          return this._result('AVAILABLE', s.value, s.source, s.provenance, [],
            `Value available (${this._provenanceLabel(s.provenance)})`);
        }

        // Any other provenance → REVIEW_REQUIRED (conservative)
        return this._result('REVIEW_REQUIRED', s.value, s.source, s.provenance, [],
          `Review recommended for provenance: ${s.provenance}`);
      }

      // ── MULTIPLE SOURCES ───────────────────────────────────────────────────
      const uniqueValues = [...new Set(allSources.map(s => (s.value || '').trim().toLowerCase()))];

      if (uniqueValues.length === 1) {
        // All sources agree → use the most trusted source
        const best = this._chooseBestSource(allSources);
        if (REVIEW_PROVENANCES.has(best.provenance)) {
          return this._result('REVIEW_REQUIRED', best.value, best.source, best.provenance, [],
            'Multiple sources agree but value not yet user-confirmed');
        }
        return this._result('AVAILABLE', best.value, best.source, best.provenance, [],
          'Multiple sources agree on value');
      }

      // Values differ → CONFLICT
      const conflicts = allSources.map(s => ({
        value: s.value,
        source: s.source,
        provenance: s.provenance
      }));

      return this._result('CONFLICT', '', null, null, conflicts,
        `Conflicting values from ${conflicts.length} sources — user must choose`);
    }

    /**
     * Check all detected form fields at once.
     *
     * @param {Array} detectedFields  — from FormDetector + Normalizer
     * @param {Object} profile
     * @param {Object} [extraSources]
     * @returns {Object} { byCanonicalId: { [id]: result }, summary: { available, missing, conflict, ambiguous, reviewRequired } }
     */
    checkAll(detectedFields, profile, extraSources) {
      const byCanonicalId = {};
      const summary = { available: 0, missing: 0, conflict: 0, ambiguous: 0, reviewRequired: 0 };

      for (const field of (detectedFields || [])) {
        const cid = field.canonicalId;
        if (!cid) continue;
        if (byCanonicalId[cid]) continue; // deduplicate

        const result = this.check(cid, profile, extraSources);
        byCanonicalId[cid] = result;

        switch (result.status) {
          case 'AVAILABLE':       summary.available++;       break;
          case 'MISSING':         summary.missing++;         break;
          case 'CONFLICT':        summary.conflict++;        break;
          case 'AMBIGUOUS':       summary.ambiguous++;       break;
          case 'REVIEW_REQUIRED': summary.reviewRequired++;  break;
        }
      }

      return { byCanonicalId, summary };
    }

    // ── Internal helpers ─────────────────────────────────────────────────────

    _result(status, value, source, provenance, conflicts, notes) {
      return { status, value: value || '', source: source || null, provenance: provenance || null, conflicts: conflicts || [], notes: notes || '' };
    }

    _provenanceLabel(prov) {
      const labels = {
        USER_ENTERED: 'User entered',
        USER_CONFIRMED: 'User confirmed',
        USER_EDITED: 'User edited',
        DOCUMENT_EXTRACTED: 'Extracted from document',
        IMPORTED: 'Imported',
        APPLICATION_SPECIFIC: 'Application-specific'
      };
      return labels[prov] || prov;
    }

    _chooseBestSource(sources) {
      // Priority: USER_CONFIRMED > USER_EDITED > USER_ENTERED > DOCUMENT_EXTRACTED > others
      const priority = {
        USER_CONFIRMED: 5, USER_EDITED: 4, USER_ENTERED: 3,
        DOCUMENT_EXTRACTED: 2, IMPORTED: 1, APPLICATION_SPECIFIC: 0
      };
      return [...sources].sort((a, b) => (priority[b.provenance] || 0) - (priority[a.provenance] || 0))[0];
    }

    /**
     * Extract a value + provenance from either v2 InformationProfile or legacy flat profile.
     */
    _extractFromProfile(canonicalId, profile) {
      // v2 InformationProfile object (has getField method)
      if (profile && typeof profile.getField === 'function') {
        const field = profile.getField(canonicalId);
        if (field && field.value) {
          return { value: field.value, source: field.source || 'Information Profile', provenance: field.provenance };
        }
        return null;
      }

      // v2 InformationProfile raw data (has version: '2.0')
      if (profile && profile.version === '2.0') {
        const ip = ipMod ? ipMod.InformationProfile.fromJSON(profile) : null;
        if (ip) {
          const field = ip.getField(canonicalId);
          if (field && field.value) {
            return { value: field.value, source: field.source || 'Information Profile', provenance: field.provenance };
          }
        }
        return null;
      }

      // Legacy flat profile — extract value, assign USER_ENTERED provenance
      const val = this._extractLegacy(canonicalId, profile);
      if (!val) return null;
      return { value: val.value, source: val.source || 'Saved Profile', provenance: PROVENANCE_TYPES.USER_ENTERED };
    }

    /**
     * Extract value from legacy flat profile by canonical ID.
     */
    _extractLegacy(canonicalId, profile) {
      if (!profile) return null;
      const p = profile.personal || {};
      const c = profile.contact || {};
      const f = profile.family || {};
      const a = profile.address || {};

      const map = {
        full_name:     { value: p.fullName || `${p.firstName || ''} ${p.lastName || ''}`.trim(), source: 'Profile: Personal (Full Name)' },
        first_name:    { value: p.firstName,  source: 'Profile: Personal (First Name)' },
        middle_name:   { value: p.middleName, source: 'Profile: Personal (Middle Name)' },
        last_name:     { value: p.lastName,   source: 'Profile: Personal (Last Name)' },
        dob:           { value: p.dob,        source: 'Profile: Personal (Date of Birth)' },
        gender:        { value: p.gender,     source: 'Profile: Personal (Gender)' },
        primary_phone: { value: c.primaryPhone, source: 'Profile: Contact (Mobile)' },
        email:         { value: c.email,        source: 'Profile: Contact (Email)' },
        father_name:   { value: f.fatherName,   source: 'Profile: Family (Father)' },
        mother_name:   { value: f.motherName,   source: 'Profile: Family (Mother)' },
        guardian_name: { value: f.guardianName, source: 'Profile: Family (Guardian)' },
        address_line:  { value: a.addressLine || `${a.houseNumber || ''}, ${a.street || ''}`.trim(), source: 'Profile: Address' },
        house_number:  { value: a.houseNumber,  source: 'Profile: Address' },
        street:        { value: a.street,       source: 'Profile: Address' },
        village:       { value: a.village,      source: 'Profile: Address' },
        mandal:        { value: a.mandal,       source: 'Profile: Address' },
        district:      { value: a.district,     source: 'Profile: Address (District)' },
        state:         { value: a.state,        source: 'Profile: Address (State)' },
        country:       { value: a.country,      source: 'Profile: Address (Country)' },
        pincode:       { value: a.pincode,      source: 'Profile: Address (PIN)' }
      };

      const entry = map[canonicalId];
      return entry && entry.value ? entry : null;
    }
  }

  const availabilityEngine = new AvailabilityEngine();

  const AvailabilityEngineModule = { AvailabilityEngine, availabilityEngine };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = AvailabilityEngineModule;
  } else {
    global.EFillAvailabilityEngine = AvailabilityEngineModule;
  }
})(typeof window !== 'undefined' ? window : globalThis);
