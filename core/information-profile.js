/**
 * E-Fill Information Profile
 * ==========================
 * Manages the structured Information Profile with provenance on every stored value.
 *
 * DESIGN PRINCIPLE:
 *   Every important stored value carries:
 *     - value: the actual data
 *     - provenance: where it came from (USER_ENTERED, DOCUMENT_EXTRACTED, etc.)
 *     - source: human-readable description of the source
 *     - lastModified: ISO timestamp
 *     - sensitive: whether this field requires masking in UI
 *
 * Education records are stored as an ordered array of structured objects.
 * Each education record has its own fields with their own provenance.
 *
 * The InformationProfile is SEPARATE from the legacy flat profile used in tests.
 * It can be migrated from the legacy format via migrateFromLegacy().
 */

(function (global) {
  'use strict';

  const schema = global.EFillCanonicalSchema || (typeof require !== 'undefined' ? require('./canonical-schema.js') : null);

  const PROVENANCE_TYPES = (schema && schema.PROVENANCE_TYPES) || {
    USER_ENTERED: 'USER_ENTERED',
    DOCUMENT_EXTRACTED: 'DOCUMENT_EXTRACTED',
    USER_CONFIRMED: 'USER_CONFIRMED',
    USER_EDITED: 'USER_EDITED',
    IMPORTED: 'IMPORTED',
    APPLICATION_SPECIFIC: 'APPLICATION_SPECIFIC'
  };

  const SENSITIVE_FIELDS = (schema && schema.FIELD_SENSITIVITY && schema.FIELD_SENSITIVITY.SENSITIVE) ||
    new Set(['aadhaar_number', 'alt_id_number', 'bank_account_number', 'bank_ifsc', 'bank_account_holder', 'bank_name', 'annual_income']);

  /**
   * Create a single field entry with provenance.
   */
  function makeFieldEntry(value, provenance, source, sensitive, extraMeta = {}) {
    const now = new Date().toISOString();
    const strVal = value !== undefined && value !== null ? String(value) : '';
    const prov = provenance || PROVENANCE_TYPES.USER_ENTERED;

    let defaultSourceType = 'MANUAL';
    if (prov === PROVENANCE_TYPES.DOCUMENT_EXTRACTED || prov === PROVENANCE_TYPES.USER_CONFIRMED) {
      defaultSourceType = 'DOCUMENT';
    }

    return {
      canonicalField: extraMeta.canonicalField || null,
      value: strVal,
      sourceType: extraMeta.sourceType || defaultSourceType,
      sourceDocumentType: extraMeta.sourceDocumentType || null,
      provenance: prov,
      confidence: extraMeta.confidence !== undefined ? extraMeta.confidence : 1.0,
      lastUpdated: extraMeta.lastUpdated || now,
      lastModified: extraMeta.lastModified || now,
      source: source || (prov === PROVENANCE_TYPES.USER_ENTERED ? 'User Entry' : 'Information Profile'),
      sensitive: !!sensitive
    };
  }

  /**
   * Create an empty field entry.
   */
  function emptyField(sensitive, canonicalId) {
    return {
      canonicalField: canonicalId || null,
      value: '',
      sourceType: null,
      sourceDocumentType: null,
      provenance: null,
      confidence: 1.0,
      source: null,
      lastUpdated: null,
      lastModified: null,
      sensitive: !!sensitive
    };
  }

  class InformationProfile {
    constructor(data) {
      this._data = data || this._createEmpty();
    }

    _createEmpty() {
      return {
        profileId: `ip-${Date.now()}`,
        version: '2.0',
        lastUpdated: new Date().toISOString(),
        personal: {
          full_name:      emptyField(),
          first_name:     emptyField(),
          middle_name:    emptyField(),
          last_name:      emptyField(),
          dob:            emptyField(),
          gender:         emptyField(),
          nationality:    emptyField(),
          marital_status: emptyField()
        },
        identity: {
          aadhaar_number: emptyField(true),
          alt_id_type:    emptyField(),
          alt_id_number:  emptyField(true)
        },
        contact: {
          email:          emptyField(),
          primary_phone:  emptyField(),
          secondary_email: emptyField(),
          secondary_phone: emptyField()
        },
        address: {
          house_number:   emptyField(),
          address_line:   emptyField(),
          street:         emptyField(),
          landmark:       emptyField(),
          village:        emptyField(),
          mandal:         emptyField(),
          city:           emptyField(),
          district:       emptyField(),
          state:          emptyField(),
          country:        emptyField(),
          pincode:        emptyField()
        },
        family: {
          father_name:   emptyField(),
          mother_name:   emptyField(),
          guardian_name: emptyField(),
          spouse_name:   emptyField()
        },
        category: {
          category:       emptyField(),
          caste_community: emptyField(),
          ews_status:     emptyField(),
          annual_income:  emptyField(true)
        },
        education: [],   // Array of education record objects
        employment: {
          employment_status:    emptyField(),
          employer:             emptyField(),
          designation:          emptyField(),
          years_of_experience:  emptyField(),
          govt_employee_status: emptyField()
        },
        additional: {
          ex_serviceman_status:  emptyField(),
          disability_type:       emptyField(),
          disability_percentage: emptyField()
        },
        banking: {
          bank_account_holder: emptyField(true),
          bank_name:           emptyField(true),
          bank_account_number: emptyField(true),
          bank_ifsc:           emptyField(true)
        },
        custom: {} // Dictionary of custom user-added fields
      };
    }

    /**
     * Create an empty education record object.
     */
    static createEducationRecord(id, qualificationLabel) {
      return {
        id: id || `edu-${Date.now()}`,
        qualification: qualificationLabel || '',
        fields: {
          edu_qualification: emptyField(),
          edu_board:         emptyField(),
          edu_institution:   emptyField(),
          edu_year:          emptyField(),
          edu_percentage:    emptyField(),
          edu_marks:         emptyField(),
          edu_max_marks:     emptyField(),
          edu_roll_number:   emptyField()
        }
      };
    }

    /**
     * Get a value entry for a canonical or custom field ID.
     * For education fields, pass the educationRecordId.
     *
     * @returns {{ value, provenance, source, lastModified, sensitive, label, category } | null}
     */
    getField(canonicalId, educationRecordId) {
      if (!canonicalId) return null;

      // Handle education alias mappings if non-canonical shorthand is queried
      const eduAliases = {
        roll_number: 'edu_roll_number',
        board: 'edu_board',
        institution: 'edu_institution',
        passing_year: 'edu_year',
        percentage: 'edu_percentage'
      };
      const effectiveId = eduAliases[canonicalId] || canonicalId;

      if (effectiveId.startsWith('edu_')) {
        if (!educationRecordId) {
          // Return first education record that has this field set
          for (const rec of (this._data.education || [])) {
            const f = rec.fields && rec.fields[effectiveId];
            if (f && f.value) return f;
          }
          return emptyField();
        }
        const rec = (this._data.education || []).find(r => r.id === educationRecordId);
        return (rec && rec.fields && rec.fields[effectiveId]) || emptyField();
      }

      // Look through all standard sections
      for (const section of ['personal', 'identity', 'contact', 'address', 'family', 'category', 'employment', 'additional', 'banking']) {
        const sec = this._data[section];
        if (sec && canonicalId in sec) {
          return sec[canonicalId];
        }
      }

      // Check custom fields
      if (this._data.custom && this._data.custom[canonicalId]) {
        return this._data.custom[canonicalId];
      }

      return null;
    }

    /**
     * Set a value with provenance.
     * Automatically routes to the appropriate section based on canonical schema or custom.
     */
    setField(canonicalId, value, provenance, source, educationRecordId, category, extraMeta = {}) {
      if (!canonicalId) return this;
      const isSensitive = SENSITIVE_FIELDS.has(canonicalId);
      const meta = { canonicalField: canonicalId, ...extraMeta };
      const entry = makeFieldEntry(value, provenance, source, isSensitive, meta);

      if (canonicalId.startsWith('edu_')) {
        if (!this._data.education) this._data.education = [];
        let rec = null;
        if (educationRecordId) {
          rec = this._data.education.find(r => r.id === educationRecordId);
        }
        if (!rec) {
          if (this._data.education.length > 0) {
            rec = this._data.education[0];
          } else {
            rec = InformationProfile.createEducationRecord(`edu-${Date.now()}`, '10th / SSC');
            this._data.education.push(rec);
          }
        }
        if (rec) {
          if (!rec.fields) rec.fields = {};
          rec.fields[canonicalId] = entry;
          if (canonicalId === 'edu_qualification' && value) {
            rec.qualification = value;
          }
          this._data.lastUpdated = new Date().toISOString();
        }
        return this;
      }

      // 1. Check existing sections
      for (const section of ['personal', 'identity', 'contact', 'address', 'family', 'category', 'employment', 'additional', 'banking']) {
        const sec = this._data[section];
        if (sec && canonicalId in sec) {
          sec[canonicalId] = entry;
          this._data.lastUpdated = new Date().toISOString();
          return this;
        }
      }

      // 2. If canonical schema knows this field category, add to that section
      const schemaDef = schema && schema.CANONICAL_FIELDS && schema.CANONICAL_FIELDS[canonicalId];
      const targetSection = category || (schemaDef && schemaDef.category);
      if (targetSection && targetSection !== 'education' && this._data[targetSection] && !Array.isArray(this._data[targetSection])) {
        this._data[targetSection][canonicalId] = entry;
        this._data.lastUpdated = new Date().toISOString();
        return this;
      }

      // 3. Fallback to custom fields
      this.setCustomField(canonicalId, schemaDef?.label || canonicalId, value, targetSection || 'personal', provenance, source);
      return this;
    }

    /**
     * Clear a canonical field or custom field value.
     * For canonical fields, resets value to empty and removes provenance while preserving schema.
     */
    clearField(canonicalId, educationRecordId) {
      if (!canonicalId) return this;
      const isSensitive = SENSITIVE_FIELDS.has(canonicalId);
      const entry = emptyField(isSensitive);

      if (canonicalId.startsWith('edu_')) {
        if (educationRecordId) {
          const rec = (this._data.education || []).find(r => r.id === educationRecordId);
          if (rec && rec.fields && rec.fields[canonicalId]) {
            rec.fields[canonicalId] = entry;
            this._data.lastUpdated = new Date().toISOString();
          }
        } else {
          for (const rec of (this._data.education || [])) {
            if (rec.fields && rec.fields[canonicalId]) {
              rec.fields[canonicalId] = entry;
            }
          }
          this._data.lastUpdated = new Date().toISOString();
        }
        return this;
      }

      // Check standard sections
      for (const section of ['personal', 'identity', 'contact', 'address', 'family', 'category', 'employment', 'additional', 'banking']) {
        const sec = this._data[section];
        if (sec && canonicalId in sec) {
          sec[canonicalId] = entry;
          this._data.lastUpdated = new Date().toISOString();
          return this;
        }
      }

      // If custom field, remove it
      if (this._data.custom && this._data.custom[canonicalId]) {
        delete this._data.custom[canonicalId];
        this._data.lastUpdated = new Date().toISOString();
      }

      return this;
    }

    /**
     * Set a custom field with stable id, label, category, value, and provenance.
     */
    setCustomField(id, label, value, category, provenance, source) {
      if (!this._data.custom) this._data.custom = {};
      const isSensitive = SENSITIVE_FIELDS.has(id);
      const entry = makeFieldEntry(value, provenance, source, isSensitive);
      entry.id = id;
      entry.label = label || id;
      entry.category = category || 'personal';
      this._data.custom[id] = entry;
      this._data.lastUpdated = new Date().toISOString();
      return this;
    }

    /**
     * Get a specific custom field by its stable ID.
     */
    getCustomField(id) {
      if (!this._data.custom || !id) return null;
      return this._data.custom[id] || null;
    }

    /**
     * Update an existing custom field while preserving its stable ID.
     */
    updateCustomField(id, updates = {}) {
      if (!this._data.custom || !this._data.custom[id]) return null;
      const field = this._data.custom[id];
      if (updates.label !== undefined) field.label = updates.label;
      if (updates.value !== undefined) field.value = String(updates.value);
      if (updates.category !== undefined) field.category = updates.category;
      if (updates.provenance !== undefined) field.provenance = updates.provenance;
      if (updates.source !== undefined) field.source = updates.source;
      field.lastModified = new Date().toISOString();
      this._data.lastUpdated = new Date().toISOString();
      return field;
    }

    /**
     * Get all custom fields.
     */
    getCustomFields() {
      if (!this._data.custom) return [];
      return Object.keys(this._data.custom).map(k => this._data.custom[k]);
    }

    /**
     * Remove a custom field by its stable ID.
     */
    removeCustomField(id) {
      if (this._data.custom && this._data.custom[id]) {
        delete this._data.custom[id];
        this._data.lastUpdated = new Date().toISOString();
      }
    }

    /**
     * Get the simple value string for a canonical field.
     */
    getValue(canonicalId, educationRecordId) {
      const field = this.getField(canonicalId, educationRecordId);
      return field ? (field.value || '') : '';
    }

    /**
     * Get availability status for a field.
     * @returns {'AVAILABLE'|'MISSING'}
     */
    getAvailability(canonicalId, educationRecordId) {
      const field = this.getField(canonicalId, educationRecordId);
      if (!field || !field.value || field.value.trim() === '') return 'MISSING';
      return 'AVAILABLE';
    }

    /**
     * Checks if this profile has any entered or extracted information.
     * @returns {boolean}
     */
    hasInformation() {
      for (const section of ['personal', 'identity', 'contact', 'address', 'family', 'category', 'employment', 'additional', 'banking']) {
        const sec = this._data[section];
        if (sec) {
          for (const key of Object.keys(sec)) {
            const entry = sec[key];
            if (entry && entry.value && String(entry.value).trim()) {
              return true;
            }
          }
        }
      }
      if (this._data.education && this._data.education.length > 0) {
        for (const rec of this._data.education) {
          if (rec.fields) {
            for (const f of Object.values(rec.fields)) {
              if (f && f.value && String(f.value).trim()) return true;
            }
          }
        }
      }
      if (this._data.custom && Object.keys(this._data.custom).length > 0) {
        for (const c of Object.values(this._data.custom)) {
          if (c && c.value && String(c.value).trim()) return true;
        }
      }
      return false;
    }

    /**
     * Checks if the profile is empty (no information yet).
     * @returns {boolean}
     */
    isEmpty() {
      return !this.hasInformation();
    }

    /**
     * Returns all populated fields grouped by category.
     * @returns {Object} { [category]: Array<{ id, label, value, source, provenance, sensitive, lastUpdated }> }
     */
    getPopulatedFields() {
      const result = {};
      const sections = ['personal', 'identity', 'contact', 'address', 'family', 'category', 'education', 'employment', 'additional', 'banking'];

      for (const sec of sections) {
        result[sec] = [];
        if (sec === 'education') {
          for (const rec of (this._data.education || [])) {
            if (rec.fields) {
              for (const [fid, f] of Object.entries(rec.fields)) {
                if (f && f.value && String(f.value).trim()) {
                  const schemaDef = schema?.CANONICAL_FIELDS?.[fid];
                  result[sec].push({
                    id: fid,
                    label: schemaDef?.label || fid,
                    value: f.value,
                    source: f.source || 'Document Extracted',
                    sourceType: f.sourceType || 'DOCUMENT',
                    sourceDocumentType: f.sourceDocumentType || null,
                    provenance: f.provenance,
                    sensitive: !!f.sensitive,
                    lastUpdated: f.lastUpdated,
                    educationRecordId: rec.id
                  });
                }
              }
            }
          }
        } else {
          const sObj = this._data[sec];
          if (sObj) {
            for (const [fid, f] of Object.entries(sObj)) {
              if (f && f.value && String(f.value).trim()) {
                const schemaDef = schema?.CANONICAL_FIELDS?.[fid];
                result[sec].push({
                  id: fid,
                  label: schemaDef?.label || fid,
                  value: f.value,
                  source: f.source || 'Information Profile',
                  sourceType: f.sourceType || 'MANUAL',
                  sourceDocumentType: f.sourceDocumentType || null,
                  provenance: f.provenance,
                  sensitive: !!f.sensitive,
                  lastUpdated: f.lastUpdated
                });
              }
            }
          }
        }
      }

      // Custom fields
      result.custom = [];
      if (this._data.custom) {
        for (const [cid, c] of Object.entries(this._data.custom)) {
          if (c && c.value && String(c.value).trim()) {
            result.custom.push({
              id: cid,
              label: c.label || cid,
              value: c.value,
              source: c.source || 'Custom Field',
              sourceType: c.sourceType || 'MANUAL',
              sourceDocumentType: c.sourceDocumentType || null,
              provenance: c.provenance,
              sensitive: !!c.sensitive,
              lastUpdated: c.lastUpdated,
              category: c.category || 'personal'
            });
          }
        }
      }

      for (const k of Object.keys(result)) {
        if (!result[k] || result[k].length === 0) delete result[k];
      }

      return result;
    }

    // ── Education records ─────────────────────────────────────────────────

    getEducationRecords() {
      return this._data.education || [];
    }

    addEducationRecord(id, qualificationLabel) {
      const rec = InformationProfile.createEducationRecord(id, qualificationLabel);
      if (!this._data.education) this._data.education = [];
      this._data.education.push(rec);
      this._data.lastUpdated = new Date().toISOString();
      return rec;
    }

    updateEducationRecord(id, fieldId, value, provenance, source) {
      const rec = (this._data.education || []).find(r => r.id === id);
      if (!rec) return null;
      if (!rec.fields) rec.fields = {};
      rec.fields[fieldId] = makeFieldEntry(value, provenance, source, false);
      this._data.lastUpdated = new Date().toISOString();
      return rec;
    }

    removeEducationRecord(id) {
      if (!this._data.education) return;
      this._data.education = this._data.education.filter(r => r.id !== id);
      this._data.lastUpdated = new Date().toISOString();
    }

    // ── Serialization / Migration ─────────────────────────────────────────

    toJSON() {
      return JSON.parse(JSON.stringify(this._data));
    }

    static fromJSON(data) {
      const ip = new InformationProfile(null);
      ip._data = data;
      // Migration: migrate existing custom['annual_income'] into canonical category.annual_income
      if (ip._data && ip._data.custom && ip._data.custom.annual_income) {
        const customIncome = ip._data.custom.annual_income;
        if (!ip._data.category) ip._data.category = {};
        if (!ip._data.category.annual_income || !ip._data.category.annual_income.value) {
          ip._data.category.annual_income = makeFieldEntry(
            customIncome.value || '',
            customIncome.provenance || PROVENANCE_TYPES.USER_ENTERED,
            customIncome.source || 'Migrated from custom',
            true,
            {
              canonicalField: 'annual_income',
              sourceType: customIncome.sourceType,
              confidence: customIncome.confidence,
              lastUpdated: customIncome.lastUpdated
            }
          );
        }
        delete ip._data.custom.annual_income;
      }
      return ip;
    }

    /**
     * Convert to the legacy flat profile format.
     * Used for backward-compatibility with source-selector and tests.
     */
    toLegacyProfile() {
      const d = this._data;
      const pGet = (section, field) => {
        const s = d[section];
        if (!s) return '';
        const f = s[field];
        return f ? (f.value || '') : '';
      };

      const legacyEdu = (d.education || []).map(rec => {
        const fg = (fid) => (rec.fields && rec.fields[fid]) ? (rec.fields[fid].value || '') : '';
        return {
          id: rec.id,
          qualification: rec.qualification || fg('edu_qualification'),
          institution:   fg('edu_institution'),
          board:         fg('edu_board'),
          yearOfPassing: fg('edu_year'),
          marks:         fg('edu_marks'),
          maxMarks:      fg('edu_max_marks'),
          percentage:    fg('edu_percentage'),
          rollNumber:    fg('edu_roll_number')
        };
      });

      return {
        profileId: d.profileId,
        lastUpdated: d.lastUpdated,
        personal: {
          fullName:   pGet('personal', 'full_name'),
          firstName:  pGet('personal', 'first_name'),
          middleName: pGet('personal', 'middle_name'),
          lastName:   pGet('personal', 'last_name'),
          dob:        pGet('personal', 'dob'),
          gender:     pGet('personal', 'gender')
        },
        contact: {
          primaryPhone:   pGet('contact', 'primary_phone'),
          email:          pGet('contact', 'email'),
          secondaryPhone: pGet('contact', 'secondary_phone'),
          secondaryEmail: pGet('contact', 'secondary_email')
        },
        family: {
          fatherName:   pGet('family', 'father_name'),
          motherName:   pGet('family', 'mother_name'),
          guardianName: pGet('family', 'guardian_name'),
          spouseName:   pGet('family', 'spouse_name')
        },
        social: {
          category:   pGet('category', 'category'),
          caste:      pGet('category', 'caste_community'),
          ewsStatus:  pGet('category', 'ews_status'),
          annualIncome: pGet('category', 'annual_income'),
          disabilityStatus: pGet('additional', 'disability_type') ? 'Yes' : 'No',
          disabilityType:   pGet('additional', 'disability_type'),
          disabilityPercentage: pGet('additional', 'disability_percentage')
        },
        address: {
          houseNumber: pGet('address', 'house_number'),
          street:      pGet('address', 'street'),
          addressLine: pGet('address', 'address_line'),
          village:     pGet('address', 'village'),
          mandal:      pGet('address', 'mandal'),
          district:    pGet('address', 'district'),
          state:       pGet('address', 'state'),
          country:     pGet('address', 'country'),
          pincode:     pGet('address', 'pincode')
        },
        education: legacyEdu,
        identity: {
          aadhaarNumber: pGet('identity', 'aadhaar_number'),
          altIdType:     pGet('identity', 'alt_id_type'),
          altIdNumber:   pGet('identity', 'alt_id_number')
        },
        banking: {
          accountHolderName: pGet('banking', 'bank_account_holder'),
          bankName:          pGet('banking', 'bank_name'),
          accountNumber:     pGet('banking', 'bank_account_number'),
          ifsc:              pGet('banking', 'bank_ifsc')
        }
      };
    }

    /**
     * Migrate from a legacy flat profile to the new structured format.
     * All values receive USER_ENTERED provenance with source "Migrated from saved profile".
     */
    static migrateFromLegacy(legacy) {
      if (!legacy) return new InformationProfile(null);

      const ip = new InformationProfile(null);
      const MIGRATED = PROVENANCE_TYPES.USER_ENTERED;
      const SRC = 'Migrated from saved profile';

      const p = legacy.personal || {};
      const c = legacy.contact || {};
      const f = legacy.family || {};
      const a = legacy.address || {};
      const s = legacy.social || {};
      const id = legacy.identity || {};
      const b = legacy.banking || {};

      // Personal
      if (p.fullName)   ip.setField('full_name',   p.fullName,   MIGRATED, SRC);
      if (p.firstName)  ip.setField('first_name',  p.firstName,  MIGRATED, SRC);
      if (p.middleName) ip.setField('middle_name', p.middleName, MIGRATED, SRC);
      if (p.lastName)   ip.setField('last_name',   p.lastName,   MIGRATED, SRC);
      if (p.dob)        ip.setField('dob',         p.dob,        MIGRATED, SRC);
      if (p.gender)     ip.setField('gender',      p.gender,     MIGRATED, SRC);

      // Contact
      if (c.email)        ip.setField('email',          c.email,        MIGRATED, SRC);
      if (c.primaryPhone) ip.setField('primary_phone',  c.primaryPhone, MIGRATED, SRC);

      // Family
      if (f.fatherName)   ip.setField('father_name',   f.fatherName,   MIGRATED, SRC);
      if (f.motherName)   ip.setField('mother_name',   f.motherName,   MIGRATED, SRC);
      if (f.guardianName) ip.setField('guardian_name', f.guardianName, MIGRATED, SRC);

      // Address
      if (a.addressLine) ip.setField('address_line', a.addressLine, MIGRATED, SRC);
      if (a.houseNumber) ip.setField('house_number', a.houseNumber, MIGRATED, SRC);
      if (a.street)      ip.setField('street',       a.street,      MIGRATED, SRC);
      if (a.village)     ip.setField('village',      a.village,     MIGRATED, SRC);
      if (a.mandal)      ip.setField('mandal',       a.mandal,      MIGRATED, SRC);
      if (a.district)    ip.setField('district',     a.district,    MIGRATED, SRC);
      if (a.state)       ip.setField('state',        a.state,       MIGRATED, SRC);
      if (a.country)     ip.setField('country',      a.country,     MIGRATED, SRC);
      if (a.pincode)     ip.setField('pincode',      a.pincode,     MIGRATED, SRC);

      // Category
      if (s.category)  ip.setField('category',        s.category,  MIGRATED, SRC);
      if (s.caste)     ip.setField('caste_community', s.caste,     MIGRATED, SRC);
      if (s.ewsStatus) ip.setField('ews_status',      s.ewsStatus, MIGRATED, SRC);

      // Identity
      if (id.aadhaarNumber) ip.setField('aadhaar_number', id.aadhaarNumber, MIGRATED, SRC);
      if (id.altIdType)     ip.setField('alt_id_type',    id.altIdType,     MIGRATED, SRC);
      if (id.altIdNumber)   ip.setField('alt_id_number',  id.altIdNumber,   MIGRATED, SRC);

      // Banking
      if (b.accountHolderName) ip.setField('bank_account_holder', b.accountHolderName, MIGRATED, SRC);
      if (b.bankName)          ip.setField('bank_name',           b.bankName,           MIGRATED, SRC);
      if (b.accountNumber)     ip.setField('bank_account_number', b.accountNumber,      MIGRATED, SRC);
      if (b.ifsc)              ip.setField('bank_ifsc',           b.ifsc,               MIGRATED, SRC);

      // Education records
      for (const edu of (legacy.education || [])) {
        const rec = ip.addEducationRecord(edu.id, edu.qualification);
        const rf = (fid, val) => { if (val) ip.updateEducationRecord(rec.id, fid, val, MIGRATED, SRC); };
        rf('edu_qualification', edu.qualification);
        rf('edu_institution',   edu.institution);
        rf('edu_board',         edu.board);
        rf('edu_year',          edu.yearOfPassing);
        rf('edu_percentage',    edu.percentage);
        rf('edu_marks',         edu.marks);
        rf('edu_max_marks',     edu.maxMarks);
        rf('edu_roll_number',   edu.rollNumber);
      }

      return ip;
    }

    /**
     * Detect whether a data blob is a v2 InformationProfile (has `version: '2.0'`).
     */
    static isV2Format(data) {
      return data && data.version === '2.0' && (data.personal !== undefined);
    }

    /**
     * Detect whether a data blob is the legacy flat format.
     */
    static isLegacyFormat(data) {
      return data && !data.version && data.personal && typeof data.personal.fullName === 'string';
    }
  }

  const InformationProfileModule = { InformationProfile, makeFieldEntry, emptyField };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = InformationProfileModule;
  } else {
    global.EFillInformationProfile = InformationProfileModule;
  }
})(typeof window !== 'undefined' ? window : globalThis);
