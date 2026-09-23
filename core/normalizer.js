/**
 * E-Fill Semantic Field Normalizer
 * Inspects multiple signals (label, name, id, placeholder, aria-label, section context, options)
 * to map form fields to canonical schema IDs with confidence scoring.
 */

(function (global) {
  'use strict';

  const schema = global.EFillCanonicalSchema || (typeof require !== 'undefined' ? require('./canonical-schema.js') : null);

  class FieldNormalizer {
    constructor(canonicalSchema = schema) {
      // Accept either:
      //   - a full schema object with CANONICAL_FIELDS / FIELD_DEFINITIONS
      //   - the raw CANONICAL_FIELDS dict itself (for backward-compat with tests)
      if (canonicalSchema && (canonicalSchema.CANONICAL_FIELDS || canonicalSchema.FIELD_DEFINITIONS)) {
        this.schema = canonicalSchema;
        this.fields = canonicalSchema.CANONICAL_FIELDS || canonicalSchema.FIELD_DEFINITIONS || {};
        this.contextRules = canonicalSchema.SECTION_CONTEXT_RULES || [];
      } else if (canonicalSchema && typeof canonicalSchema === 'object' && Object.values(canonicalSchema).some(v => v && v.aliases)) {
        // Looks like a raw CANONICAL_FIELDS dict — wrap it
        this.schema = { CANONICAL_FIELDS: canonicalSchema };
        this.fields = canonicalSchema;
        this.contextRules = (schema && schema.SECTION_CONTEXT_RULES) || [];
      } else {
        this.schema = canonicalSchema || {};
        this.fields = this.schema.CANONICAL_FIELDS || {};
        this.contextRules = this.schema.SECTION_CONTEXT_RULES || [];
      }
    }

    /**
     * Clean and normalize a string for comparison.
     */
    cleanText(str) {
      if (!str || typeof str !== 'string') return '';
      return str
        .toLowerCase()
        .replace(/[*:\-_/\\()[\]{}|]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    /**
     * Main normalization method.
     * @param {Object} signals Form field signals
     * @returns {Object} { canonicalId, confidence, reason, requiresReview }
     */
    normalize(signals) {
      if (!signals) {
        return { canonicalId: null, confidence: 0, reason: 'No signals provided', requiresReview: true };
      }

      const label = this.cleanText(signals.label);
      const name = this.cleanText(signals.name);
      const id = this.cleanText(signals.id);
      const placeholder = this.cleanText(signals.placeholder);
      const ariaLabel = this.cleanText(signals.ariaLabel);
      const sectionHeading = this.cleanText(signals.sectionHeading);
      const contextText = this.cleanText(signals.contextText);
      const inputType = (signals.type || '').toLowerCase();
      const options = (signals.options || []).map(o => this.cleanText(typeof o === 'string' ? o : o.text || o.value));

      // 1. High-priority standard autocomplete attributes
      const acMatch = this.checkAutocomplete(signals.autocomplete);
      if (acMatch) {
        return {
          canonicalId: acMatch,
          confidence: 0.95,
          reason: `Matched standard HTML autocomplete attribute: "${signals.autocomplete}"`,
          requiresReview: false
        };
      }

      // 2. Select options heuristic (e.g. Male/Female for gender)
      if (options.length > 0) {
        const genderOptions = ['male', 'female', 'transgender', 'other', 'm', 'f'];
        const matchesGender = options.filter(opt => genderOptions.includes(opt)).length >= 2;
        if (matchesGender) {
          return {
            canonicalId: 'gender',
            confidence: 0.98,
            reason: 'Dropdown options indicate gender selection',
            requiresReview: false
          };
        }
      }

      // 3. Section context disambiguation for generic labels (e.g. "Name" or "Number")
      const disambiguated = this.applyContextRules(label, sectionHeading, contextText);
      if (disambiguated) {
        return {
          canonicalId: disambiguated.id,
          confidence: disambiguated.confidence,
          reason: disambiguated.reason,
          requiresReview: disambiguated.confidence < 0.85
        };
      }

      // 4. Score all canonical fields against available signals
      let bestMatch = null;
      let highestScore = 0;
      let matchReason = '';

      for (const [canonicalKey, def] of Object.entries(this.fields)) {
        // Negative keyword check
        const hasNegativeInLabel = def.negativeKeywords.some(neg => label.includes(neg));
        const hasNegativeInName = def.negativeKeywords.some(neg => name.includes(neg));
        if (hasNegativeInLabel || hasNegativeInName) {
          continue; // Disqualified by negative keywords
        }

        for (const alias of def.aliases) {
          const aliasClean = this.cleanText(alias);

          // Signal 1: Explicit Label Match
          if (label) {
            if (label === aliasClean) {
              const score = 0.95;
              if (score > highestScore) {
                highestScore = score;
                bestMatch = canonicalKey;
                matchReason = `Exact label match: "${signals.label}"`;
              }
            } else if (label.startsWith(aliasClean + ' ') || label.endsWith(' ' + aliasClean)) {
              const score = 0.90;
              if (score > highestScore) {
                highestScore = score;
                bestMatch = canonicalKey;
                matchReason = `Label starts/ends with alias: "${aliasClean}"`;
              }
            } else if (label.includes(aliasClean)) {
              const score = 0.85;
              if (score > highestScore) {
                highestScore = score;
                bestMatch = canonicalKey;
                matchReason = `Label contains alias: "${aliasClean}"`;
              }
            }
          }

          // Signal 2: Aria-Label Match
          if (ariaLabel && ariaLabel.includes(aliasClean)) {
            const score = 0.88;
            if (score > highestScore) {
              highestScore = score;
              bestMatch = canonicalKey;
              matchReason = `Aria-label contains alias: "${aliasClean}"`;
            }
          }

          // Signal 3: Placeholder Match
          if (placeholder && placeholder.includes(aliasClean)) {
            const score = 0.80;
            if (score > highestScore) {
              highestScore = score;
              bestMatch = canonicalKey;
              matchReason = `Placeholder contains alias: "${aliasClean}"`;
            }
          }

          // Signal 4: Name or ID attribute
          const nameOrId = `${name} ${id}`;
          if (nameOrId.includes(aliasClean.replace(/\s+/g, '')) || nameOrId.includes(aliasClean.replace(/\s+/g, '_'))) {
            const score = 0.78;
            if (score > highestScore) {
              highestScore = score;
              bestMatch = canonicalKey;
              matchReason = `Field name/id matches alias: "${aliasClean}"`;
            }
          }
        }
      }

      // Input type confirmation / boost
      if (bestMatch === 'email' && inputType === 'email') {
        highestScore = Math.min(1.0, highestScore + 0.05);
      }
      if (bestMatch === 'primary_phone' && (inputType === 'tel' || inputType === 'number')) {
        highestScore = Math.min(1.0, highestScore + 0.05);
      }
      if (bestMatch === 'dob' && inputType === 'date') {
        highestScore = Math.min(1.0, highestScore + 0.05);
      }

      if (bestMatch && highestScore >= 0.70) {
        return {
          canonicalId: bestMatch,
          confidence: parseFloat(highestScore.toFixed(2)),
          reason: matchReason,
          requiresReview: highestScore < 0.85
        };
      }

      // Unidentified / Ambiguous field
      return {
        canonicalId: null,
        confidence: 0,
        reason: 'No high-confidence canonical match found',
        requiresReview: true
      };
    }

    checkAutocomplete(ac) {
      if (!ac || typeof ac !== 'string') return null;
      const clean = ac.trim().toLowerCase();
      const map = {
        'name': 'full_name',
        'given-name': 'first_name',
        'family-name': 'last_name',
        'bday': 'dob',
        'tel': 'primary_phone',
        'email': 'email',
        'sex': 'gender',
        'address-line1': 'address_line',
        'street-address': 'address_line',
        'postal-code': 'pincode'
      };
      return map[clean] || null;
    }

    applyContextRules(label, sectionHeading, contextText) {
      if (!label) return null;
      const fullContext = `${sectionHeading} ${contextText}`;

      for (const rule of this.contextRules) {
        const matchesSection = rule.keywords.some(kw => fullContext.includes(kw));
        if (matchesSection) {
          for (const [genericWord, canonicalId] of Object.entries(rule.genericMap)) {
            if (label === genericWord || label.endsWith(' ' + genericWord)) {
              return {
                id: canonicalId,
                confidence: 0.88,
                reason: `Disambiguated generic label "${label}" via context keywords: "${rule.keywords.join(', ')}"`
              };
            }
          }
        }
      }
      return null;
    }
  }

  const normalizer = new FieldNormalizer();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { FieldNormalizer, normalizer };
  } else {
    global.EFillNormalizer = { FieldNormalizer, normalizer };
  }
})(typeof window !== 'undefined' ? window : globalThis);
