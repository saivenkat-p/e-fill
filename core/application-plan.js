/**
 * E-Fill Application Plan Engine
 * ==============================
 * Coordination layer for the user's whole application journey.
 * Understands what the entire application requires across all discovered steps,
 * rather than treating each webpage as an isolated form.
 *
 * ARCHITECTURAL PRINCIPLES:
 *   - DISCOVERED: Visited/scanned pages. Actual requirements and fields are known.
 *   - INFERRED: Visible navigation signals (stepper, breadcrumbs, tabs) show that a section exists.
 *     Requirements remain UNKNOWN until the section is actually visited.
 *   - UNKNOWN / NOT YET DISCOVERED: No reliable evidence yet; "Future sections will be discovered as you proceed."
 *   - Never fabricates requirements or undiscovered future pages.
 *   - Zero Auto-Navigation: Never clicks Next, never auto-submits, never accepts declarations.
 *   - Clean Separation: Session choices (e.g. exam cities) do NOT pollute persistent My Information.
 */

(function (global) {
  'use strict';

  function getMappingEngine() {
    if (global.EFillApplicationMappingEngine?.applicationMappingEngine) {
      return global.EFillApplicationMappingEngine.applicationMappingEngine;
    }
    if (typeof require !== 'undefined') {
      try {
        const mod = require('./application-mapping-engine.js');
        return mod.applicationMappingEngine || null;
      } catch (e) {}
    }
    return null;
  }

  function getDocumentFieldMap() {
    return global.EFillDocumentFieldMap || null;
  }

  function getDocumentClassifier() {
    return global.EFillDocumentClassifier?.documentClassifier || null;
  }

  class ApplicationPlan {
    constructor(appId = null, title = null) {
      this.id = `plan-${Date.now()}`;
      this.applicationId = appId || 'generic-application';
      this.domain = '';
      this.applicationName = title || 'Online Application';
      this.status = 'IN_PROGRESS'; // IN_PROGRESS | READY | REVIEW_REQUIRED | BLOCKED
      this.pages = []; // [{ id, url, title, section, fields: [], uploads: [], requirements: [], status, discoveredAt, stepIndex }]
      this.sections = []; // [{ id, name, status: 'DISCOVERED'|'INFERRED'|'UNKNOWN', requirementsKnown: boolean, pageId, fieldCount, readyCount, missingCount, reviewCount }]
      this.requirements = []; // Structured field requirements across all discovered pages
      this.documents = []; // Structured document requirements across all discovered pages (Information Sources)
      this.uploads = []; // Structured application upload requirements across all discovered pages (<input type="file">)
      this.informationRequirements = []; // Category-grouped information requirements
      this.currentStep = 1;
      this.totalInferredSteps = 0;
      this.hasInferredFutureSteps = false;
      this.sessionData = {}; // fieldId -> { value, source, timestamp }
      this.detectedSections = new Set(); // Discovered section names (backwards-compat)
      this.inferredSections = new Set(); // Inferred section names from stepper
      this.discoveredAt = new Date().toISOString();
      this.updatedAt = new Date().toISOString();

      // Legacy requirements object for backwards compatibility with earlier tests
      this.legacyRequirements = {
        available: [],
        missing: [],
        conflicts: [],
        review: []
      };
    }

    /**
     * Determines application identity generically using domain, URL, title, and headings.
     */
    detectApplicationIdentity(scanData) {
      const url = scanData.url || (typeof window !== 'undefined' ? window.location.href : '');
      const title = scanData.title || (typeof document !== 'undefined' ? document.title : '');
      const navHeadings = (scanData.navigation?.headings || []);

      let domain = '';
      try {
        if (url) {
          const u = new URL(url);
          domain = u.hostname;
        }
      } catch (e) {
        domain = 'local';
      }
      this.domain = domain;

      // Extract meaningful name
      const allText = [title, ...navHeadings, url].join(' ');
      if (/JAM\s*(?:20\d\d)?/i.test(allText)) {
        const yr = allText.match(/JAM\s*(20\d\d)/i)?.[1] || '2027';
        this.applicationName = `JAM ${yr} — Joint Admission test for Masters`;
        this.applicationId = `jam-${yr.toLowerCase()}`;
      } else if (/GATE\s*(?:20\d\d)?/i.test(allText)) {
        const yr = allText.match(/GATE\s*(20\d\d)/i)?.[1] || '';
        this.applicationName = `GATE ${yr} Application Portal`.trim();
        this.applicationId = `gate-${yr.toLowerCase()}`;
      } else if (/UPSC|Civil\s*Services/i.test(allText)) {
        this.applicationName = 'UPSC Online Application Portal';
        this.applicationId = 'upsc-online';
      } else if (/SSC|Staff\s*Selection/i.test(allText)) {
        this.applicationName = 'SSC Recruitment Application';
        this.applicationId = 'ssc-recruitment';
      } else if (navHeadings.length > 0) {
        this.applicationName = navHeadings[0];
        this.applicationId = `app-${domain.replace(/\./g, '-')}`;
      } else if (title && !title.includes('localhost') && title.length < 80) {
        this.applicationName = title.split('—')[0].split('-')[0].trim();
        this.applicationId = `app-${domain.replace(/\./g, '-')}`;
      } else {
        this.applicationName = 'Online Application Portal';
        this.applicationId = `app-${domain.replace(/\./g, '-')}`;
      }
    }

    /**
     * Records a newly scanned page in the application journey.
     * Progressively accumulates pages and requirements without wiping previous discoveries.
     *
     * @param {Object} scanData Form scan result from FormDetector
     * @returns {ApplicationPlan} this
     */
    addPage(scanData) {
      if (!scanData) return this;
      this.updatedAt = new Date().toISOString();

      const url = scanData.url || (typeof window !== 'undefined' ? window.location.href : '');
      const title = scanData.title || (typeof document !== 'undefined' ? document.title : 'Application Page');
      const fields = scanData.fields || [];
      const uploads = scanData.uploads || [];
      const navigation = scanData.navigation || {};

      this.detectApplicationIdentity(scanData);

      // Determine section name for this page
      const sectionName = this._inferSectionName(fields, uploads, title, navigation);
      const activeStepLabel = navigation && navigation.steps && navigation.steps.find(s => s.active)?.label;
      const pageKey = activeStepLabel ? `${url}::${activeStepLabel}` : `${url}::${sectionName}`;

      // Check if page already recorded (matches pageKey or exact url+section)
      let existingPage = this.pages.find(p => (p.pageKey && p.pageKey === pageKey) || (p.url === url && p.section === sectionName));
      if (existingPage) {
        existingPage.title = title;
        existingPage.fields = fields;
        existingPage.uploads = uploads;
        existingPage.section = sectionName;
        existingPage.status = 'CURRENT';
      } else {
        // Mark previous current page as COMPLETED
        this.pages.forEach(p => {
          if (p.status === 'CURRENT') {
            p.status = 'COMPLETED';
          }
        });

        const newIndex = this.pages.length + 1;
        existingPage = {
          id: `page-${newIndex}`,
          pageKey,
          url,
          title,
          section: sectionName,
          fields,
          uploads,
          requirements: [],
          status: 'CURRENT',
          discoveredAt: new Date().toISOString(),
          stepIndex: newIndex
        };
        this.pages.push(existingPage);
      }

      this.currentStep = existingPage.stepIndex;
      this.detectedSections.add(sectionName);

      // Record navigation stepper signals (INFERRED sections)
      if (navigation && navigation.steps && navigation.steps.length > 0) {
        this.totalInferredSteps = navigation.steps.length;
        this.hasInferredFutureSteps = true;

        navigation.steps.forEach(step => {
          const stepLabel = step.label.replace(/^Step\s*\d+\s*[:\-]?\s*/i, '').trim();
          if (!this.detectedSections.has(stepLabel)) {
            this.inferredSections.add(stepLabel);
          }
        });
      }

      // Rebuild cumulative requirements across all discovered pages
      this._rebuildCumulativeRequirements();

      return this;
    }

    /**
     * Rebuilds cumulative field and document requirements across all discovered pages.
     * Preserves evidence from all visited pages.
     */
    _rebuildCumulativeRequirements() {
      const allReqs = [];
      const allDocs = [];

      this.pages.forEach(page => {
        const pageReqs = [];

        // 1. Process Form Fields
        (page.fields || []).forEach(f => {
          const fid = f.elementId || f.name || f.id || `field_${allReqs.length + 1}`;
          const cid = f.canonicalId || fid;

          // Determine required evidence strictly
          let reqValue = 'UNKNOWN';
          if (f.required === true || f.rawRequired === true || f.ariaRequired === true || /\*|\(required\)/i.test(f.label || '')) {
            reqValue = true;
          } else if (f.required === false || /\(optional\)/i.test(f.label || '')) {
            reqValue = false;
          }

          const isMock = !!(f.isMockSecurityChallenge || (f.id && f.id.startsWith('mock_captcha')) || (f.name && f.name.startsWith('mock_captcha')) || cid === 'mock_security_challenge');
          const isRealCaptcha = !isMock && !!(f.isRealSecurityChallenge || (f.name && /captcha|recaptcha/i.test(f.name)));

          const req = {
            id: fid,
            canonicalId: cid,
            label: f.label || cid,
            section: page.section || 'General',
            pageId: page.id,
            pageUrl: page.url,
            required: reqValue,
            dataType: isMock ? 'MOCK_SECURITY_CHALLENGE' : (f.type || 'text'),
            constraints: {
              pattern: f.pattern,
              maxLength: f.maxLength,
              minLength: f.minLength,
              options: f.options
            },
            options: f.options || [],
            status: isRealCaptcha ? 'USER_ACTION_REQUIRED' : (isMock ? 'ASSISTANT_ASSISTED_CHALLENGE' : 'UNKNOWN'),
            proposedValue: '',
            sourceCandidates: [],
            transformationAvailable: false,
            discoveredFrom: page.url,
            isSecurityChallenge: isMock || isRealCaptcha,
            isMockSecurityChallenge: isMock,
            isRealSecurityChallenge: isRealCaptcha,
            securityChallengeType: isMock ? 'MOCK_SECURITY_CHALLENGE' : (isRealCaptcha ? 'REAL_SECURITY_CHALLENGE' : null),
            challengeQuestion: f.challengeQuestion || (isMock ? '8 - 4 = ?' : null),
            challengeExpectedAnswer: f.challengeExpectedAnswer || (isMock ? '4' : null),
            challengePrompt: f.challengePrompt || (isMock ? 'What is the answer to 8 - 4?' : null)
          };

          pageReqs.push(req);
          allReqs.push(req);
        });

        page.requirements = pageReqs;

        // 2. Process Document Uploads
        (page.uploads || []).forEach(u => {
          const uid = u.elementId || u.id || `doc_${allDocs.length + 1}`;
          let inferredDocType = 'DOCUMENT';
          const lbl = (u.label || '').toLowerCase();
          const ctx = (u.contextText || '').toLowerCase();
          const combined = `${lbl} ${ctx}`;

          if (/10th|ssc|matric/i.test(combined)) inferredDocType = 'SSC_10TH';
          else if (/12th|inter|hsc/i.test(combined)) inferredDocType = 'INTER_12TH';
          else if (/photo|photograph|passport\s*photo/i.test(combined)) inferredDocType = 'PHOTO';
          else if (/signature|sign/i.test(combined)) inferredDocType = 'SIGNATURE';
          else if (/caste|category|community/i.test(combined)) inferredDocType = 'CASTE_CERTIFICATE';
          else if (/income|ews/i.test(combined)) inferredDocType = 'EWS_CERTIFICATE';
          else if (/aadhaar/i.test(combined)) inferredDocType = 'AADHAAR';
          else if (/pan/i.test(combined)) inferredDocType = 'PAN';

          allDocs.push({
            id: uid,
            name: u.name || uid,
            label: u.label || 'Upload Document',
            docType: inferredDocType,
            required: true,
            pageId: page.id,
            pageUrl: page.url,
            status: 'MISSING',
            sourceRecord: null,
            suggestedSources: this._getSuggestedSourcesForDoc(inferredDocType),
            accept: u.accept || ''
          });
        });

        // 3. Process Application Upload Requirements (<input type="file"> controls)
        (page.uploads || []).forEach(u => {
          allUploads.push({
            id: u.id || u.elementId || `upload_${allUploads.length + 1}`,
            elementId: u.elementId || u.id,
            selector: u.selector || (u.id ? `#${u.id}` : `input[type="file"]`),
            type: u.type || 'OTHER',
            label: u.label || 'Upload File',
            required: u.required !== undefined ? u.required : true,
            format: u.format || {},
            dimensions: u.dimensions || {},
            aspectRatio: u.aspectRatio || null,
            fileSize: u.fileSize || {},
            sourceEvidence: u.sourceEvidence || '',
            confidence: u.confidence || 'HIGH',
            state: u.state || 'MISSING_SOURCE',
            pageId: page.id,
            pageUrl: page.url,
            section: page.section || 'Documents & Uploads'
          });
        });
      });

      this.requirements = allReqs;
      this.documents = allDocs; // Information sources (Aadhaar, 10th marksheet, etc.)
      this.uploads = allUploads; // Application upload requirements (<input type="file">)

      // Update sections list
      this._updateSectionsList();
    }

    /**
     * Determines suggested sources for a required document type.
     */
    _getSuggestedSourcesForDoc(docType) {
      switch (docType) {
        case 'SSC_10TH':
          return ['10th / SSC Marksheet or Certificate'];
        case 'INTER_12TH':
          return ['12th / Intermediate Marksheet'];
        case 'PHOTO':
          return ['Passport Size Photograph (JPEG/PNG)'];
        case 'SIGNATURE':
          return ['Candidate Signature (Scanned image)'];
        case 'CASTE_CERTIFICATE':
          return ['Caste / Community Certificate', 'State Government OBC/SC/ST Certificate'];
        case 'EWS_CERTIFICATE':
          return ['Income & Asset Certificate (EWS)', 'Income Certificate'];
        case 'AADHAAR':
          return ['Aadhaar Card (UIDAI)'];
        default:
          return ['Relevant Certificate or Document'];
      }
    }

    /**
     * Rebuilds structured sections array maintaining strict DISCOVERED vs INFERRED semantics.
     */
    _updateSectionsList() {
      const sectionMap = new Map();

      // 1. Process DISCOVERED pages
      this.pages.forEach(p => {
        const secName = p.section || 'Application Details';
        if (!sectionMap.has(secName)) {
          sectionMap.set(secName, {
            id: `sec-${secName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
            name: secName,
            status: 'DISCOVERED',
            requirementsKnown: true,
            pageId: p.id,
            pageUrl: p.url,
            fieldCount: 0,
            readyCount: 0,
            missingCount: 0,
            reviewCount: 0,
            conflictCount: 0
          });
        }
      });

      // Update metrics for discovered sections
      this.requirements.forEach(req => {
        const sec = sectionMap.get(req.section);
        if (sec) {
          sec.fieldCount++;
          if (req.status === 'AVAILABLE' || req.status === 'FILLED') sec.readyCount++;
          else if (req.status === 'MISSING') sec.missingCount++;
          else if (req.status === 'REVIEW_REQUIRED' || req.status === 'DERIVABLE' || req.status === 'TRANSFORMABLE') sec.reviewCount++;
          else if (req.status === 'CONFLICT') sec.conflictCount++;
        }
      });

      // 2. Add INFERRED sections from stepper (strictly requirementsKnown = false)
      this.inferredSections.forEach(infName => {
        if (!sectionMap.has(infName)) {
          sectionMap.set(infName, {
            id: `sec-${infName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
            name: infName,
            status: 'INFERRED',
            requirementsKnown: false, // Inferred sections do not claim known requirements!
            pageId: null,
            pageUrl: null,
            fieldCount: 0,
            readyCount: 0,
            missingCount: 0,
            reviewCount: 0,
            conflictCount: 0
          });
        }
      });

      this.sections = Array.from(sectionMap.values());
    }

    /**
     * Evaluates all application requirements against My Information + Application Mapping Engine + Session Choices.
     *
     * @param {InformationProfile|Object} profile Current InformationProfile instance
     * @param {Object} [sessionOverrides] Optional direct session overrides
     * @returns {Object} Cumulative requirements summary
     */
    evaluateAgainstProfile(profile, sessionOverrides = {}) {
      const mappingEngine = getMappingEngine();

      this.legacyRequirements = {
        available: [],
        missing: [],
        conflicts: [],
        review: []
      };

      // 1. Evaluate Field Requirements
      this.requirements.forEach(req => {
        const fid = req.id;
        const cid = req.canonicalId;

        // REAL SECURITY CHALLENGE: Never solve, never profile lookup, user action required
        if (req.isRealSecurityChallenge || req.securityChallengeType === 'REAL_SECURITY_CHALLENGE') {
          req.status = 'USER_ACTION_REQUIRED';
          req.reason = 'Complete directly on website (Real CAPTCHA)';
          return;
        }

        // MOCK SECURITY CHALLENGE: Assistant assisted, session-only, never profile lookup
        if (req.isMockSecurityChallenge || req.securityChallengeType === 'MOCK_SECURITY_CHALLENGE' || cid === 'mock_security_challenge') {
          const sessionVal = this.getSessionValue(fid) || this.getSessionValue(cid) || sessionOverrides[fid] || sessionOverrides[cid];
          if (sessionVal) {
            req.status = 'AVAILABLE';
            req.proposedValue = sessionVal;
          } else {
            req.status = 'ASSISTANT_ASSISTED_CHALLENGE';
          }
          return;
        }

        // A. Check Application Session Data (highest priority for this specific application session)
        const sessionVal = this.getSessionValue(cid) || this.getSessionValue(fid) || sessionOverrides[cid] || sessionOverrides[fid];
        if (sessionVal) {
          req.status = 'AVAILABLE';
          req.proposedValue = sessionVal;
          req.sourceCandidates = [{ source: 'Application Session Choice', value: sessionVal }];
          this.legacyRequirements.available.push({
            field: req,
            canonicalId: cid,
            value: sessionVal,
            source: 'Application Session Choice',
            isSessionOnly: true
          });
          return;
        }

        // B. Check My Information Profile & Application Mapping Engine
        if (profile) {
          // Direct canonical lookup
          let profileVal = null;
          if (typeof profile.getField === 'function') {
            const entry = profile.getField(cid);
            profileVal = entry && entry.value ? String(entry.value).trim() : null;
          } else if (profile[cid] !== undefined) {
            profileVal = String(profile[cid]).trim();
          }

          if (profileVal) {
            req.status = 'AVAILABLE';
            req.proposedValue = profileVal;
            req.sourceCandidates = [{ source: 'My Information', value: profileVal }];
            this.legacyRequirements.available.push({
              field: req,
              canonicalId: cid,
              value: profileVal,
              source: 'My Information',
              isSessionOnly: false
            });
            return;
          }

          // Transformation & Derivation via ApplicationMappingEngine
          if (mappingEngine && typeof mappingEngine.mapField === 'function') {
            try {
              const appField = {
                id: fid,
                name: fid,
                label: req.label,
                canonicalId: cid,
                type: req.dataType,
                options: req.options
              };

              const mapResult = mappingEngine.mapField(appField, profile);
              if (mapResult && mapResult.proposedValue) {
                req.proposedValue = mapResult.proposedValue;
                req.transformationAvailable = true;

                if (mapResult.status === 'READY') {
                  req.status = 'AVAILABLE';
                  req.sourceCandidates = [{ source: mapResult.provenanceDetail || mapResult.source || 'Direct Mapping', value: mapResult.proposedValue }];
                  this.legacyRequirements.available.push({
                    field: req,
                    canonicalId: cid,
                    value: mapResult.proposedValue,
                    source: mapResult.provenanceDetail || 'Transformed'
                  });
                } else if (mapResult.status === 'REVIEW_REQUIRED') {
                  req.status = 'REVIEW_REQUIRED';
                  req.sourceCandidates = [{ source: mapResult.provenanceDetail || mapResult.source || 'Derived', value: mapResult.proposedValue }];
                  this.legacyRequirements.review.push({
                    field: req,
                    canonicalId: cid,
                    value: mapResult.proposedValue,
                    reason: mapResult.reason
                  });
                }
                return;
              } else if (mapResult && mapResult.status === 'UNKNOWN') {
                req.status = 'UNKNOWN';
                return;
              }
            } catch (err) {
              console.warn('[ApplicationPlan] Mapping engine error for field:', cid, err);
            }
          }
        }

        // C. Otherwise Missing or Unknown
        if (req.required === false) {
          req.status = 'NOT_APPLICABLE';
        } else {
          req.status = 'MISSING';
          this.legacyRequirements.missing.push({
            field: req,
            canonicalId: cid,
            label: req.label || cid,
            options: req.options || [],
            disabled: !!req.disabled
          });
        }
      });

      // 2. Evaluate Document Requirements
      this.documents.forEach(doc => {
        if (profile) {
          if (doc.docType === 'SSC_10TH') {
            let has10th = false;
            if (typeof profile.getEducationRecords === 'function') {
              const recs = profile.getEducationRecords();
              has10th = recs.some(r => /10th|ssc/i.test(r.qualification || ''));
            }
            if (has10th || profile.getField?.('edu_board')?.value || profile.getField?.('edu_roll_number')?.value) {
              doc.status = 'AVAILABLE';
              doc.sourceRecord = '10th / SSC Marksheet in My Information';
            } else {
              doc.status = 'MISSING';
            }
          } else if (doc.docType === 'INTER_12TH') {
            let has12th = false;
            if (typeof profile.getEducationRecords === 'function') {
              const recs = profile.getEducationRecords();
              has12th = recs.some(r => /12th|inter|hsc/i.test(r.qualification || ''));
            }
            doc.status = has12th ? 'AVAILABLE' : 'MISSING';
          } else if (doc.docType === 'CASTE_CERTIFICATE') {
            const cat = profile.getField?.('category')?.value || profile.category;
            doc.status = (cat && !/general|unreserved|ur/i.test(cat)) ? 'MISSING' : 'NOT_APPLICABLE';
          } else {
            doc.status = 'MISSING';
          }
        } else {
          doc.status = 'MISSING';
        }
      });

      // 3. Update sections metrics with evaluated requirement statuses
      this._updateSectionsList();

      return {
        available: this.legacyRequirements.available,
        missing: this.legacyRequirements.missing,
        review: this.legacyRequirements.review,
        conflicts: this.legacyRequirements.conflicts,
        documents: this.documents,
        sections: this.sections
      };
    }

    /**
     * Helper to classify an appropriate section name for a set of fields on a page.
     */
    _inferSectionName(fields, uploads, title, navigation) {
      if (navigation && navigation.steps) {
        const activeNavStep = navigation.steps.find(s => s.active);
        if (activeNavStep && activeNavStep.label) {
          return activeNavStep.label.replace(/^Step\s*\d+\s*[:\-]?\s*/i, '').trim();
        }
      }

      if (title && /Step\s*1|Exam|Paper/i.test(title)) return 'Examination Preferences';
      if (title && /Step\s*2|Personal|Qualification/i.test(title)) return 'Personal & Educational Details';
      if (title && /Step\s*3|Upload|Document/i.test(title)) return 'Document Uploads';

      const cids = (fields || []).map(f => f.canonicalId || f.name || f.id || '').join(' ').toLowerCase();
      if (/jam_|exam_|paper|choice_city/i.test(cids)) return 'Examination Preferences';
      if (/ssc_|edu_|marks|percentage|roll_no|board/i.test(cids)) return 'Educational Qualifications';
      if (/name|dob|gender|category/i.test(cids)) return 'Personal Details';
      if (uploads && uploads.length > 0) return 'Document Requirements';

      return 'Application Information';
    }

    /**
     * Stores an application-specific session choice (e.g. chosen exam city or test paper).
     * Strictly confined to application session context.
     */
    setSessionValue(fieldId, value, source = 'USER_CHOICE') {
      if (!fieldId) return;
      this.sessionData[fieldId] = {
        value: String(value ?? '').trim(),
        source,
        timestamp: new Date().toISOString()
      };
      this.updatedAt = new Date().toISOString();
    }

    /**
     * Retrieves an application session choice value.
     */
    getSessionValue(fieldId) {
      return this.sessionData[fieldId] ? this.sessionData[fieldId].value : null;
    }

    /**
     * Returns the currently active page in the application journey.
     */
    getActivePage() {
      return this.pages.find(p => p.status === 'CURRENT') || (this.pages.length > 0 ? this.pages[this.pages.length - 1] : null);
    }

    /**
     * Checks if a section name is discovered on any visited page.
     */
    isSectionDiscovered(sectionName) {
      return this.detectedSections.has(sectionName);
    }

    /**
     * Returns true if a section is inferred from visible navigation/stepper.
     */
    isSectionInferred(sectionName) {
      return this.inferredSections.has(sectionName);
    }

    /**
     * Returns comprehensive summary of application plan state.
     */
    getSummary() {
      const discoveredCount = this.sections.filter(s => s.status === 'DISCOVERED').length;
      const inferredCount = this.sections.filter(s => s.status === 'INFERRED').length;
      const readyReqs = this.requirements.filter(r => r.status === 'AVAILABLE' || r.status === 'FILLED').length;
      const missingReqs = this.requirements.filter(r => r.status === 'MISSING').length;
      const reviewReqs = this.requirements.filter(r => r.status === 'REVIEW_REQUIRED' || r.status === 'DERIVABLE').length;

      return {
        id: this.id,
        applicationId: this.applicationId,
        applicationName: this.applicationName,
        domain: this.domain,
        status: this.status,
        currentStep: this.currentStep,
        totalPagesDiscovered: this.pages.length,
        totalInferredSteps: this.totalInferredSteps,
        hasInferredFutureSteps: this.hasInferredFutureSteps,
        discoveredSectionCount: discoveredCount,
        inferredSectionCount: inferredCount,
        sections: this.sections,
        discoveredSections: Array.from(this.detectedSections),
        inferredSections: Array.from(this.inferredSections),
        totalRequirements: this.requirements.length,
        readyCount: readyReqs,
        missingCount: missingReqs,
        reviewCount: reviewReqs,
        availableCount: this.legacyRequirements.available.length,
        documentsCount: this.documents.length
      };
    }

    /**
     * Serializes plan to plain JSON object for safe multi-page session persistence.
     */
    toJSON() {
      return {
        id: this.id,
        applicationId: this.applicationId,
        applicationName: this.applicationName,
        domain: this.domain,
        status: this.status,
        currentStep: this.currentStep,
        totalInferredSteps: this.totalInferredSteps,
        hasInferredFutureSteps: this.hasInferredFutureSteps,
        pages: this.pages,
        sections: this.sections,
        requirements: this.requirements,
        documents: this.documents,
        sessionData: this.sessionData,
        detectedSections: Array.from(this.detectedSections),
        inferredSections: Array.from(this.inferredSections),
        discoveredAt: this.discoveredAt,
        updatedAt: this.updatedAt
      };
    }

    /**
     * Reconstructs an ApplicationPlan instance from serialized JSON.
     */
    static fromJSON(data) {
      if (!data) return new ApplicationPlan();
      const plan = new ApplicationPlan(data.applicationId, data.applicationName);
      plan.id = data.id || plan.id;
      plan.domain = data.domain || '';
      plan.status = data.status || 'IN_PROGRESS';
      plan.currentStep = data.currentStep || 1;
      plan.totalInferredSteps = data.totalInferredSteps || 0;
      plan.hasInferredFutureSteps = !!data.hasInferredFutureSteps;
      plan.pages = Array.isArray(data.pages) ? data.pages : [];
      plan.sections = Array.isArray(data.sections) ? data.sections : [];
      plan.requirements = Array.isArray(data.requirements) ? data.requirements : [];
      plan.documents = Array.isArray(data.documents) ? data.documents : [];
      plan.sessionData = data.sessionData || {};
      plan.detectedSections = new Set(data.detectedSections || []);
      plan.inferredSections = new Set(data.inferredSections || []);
      plan.discoveredAt = data.discoveredAt || plan.discoveredAt;
      plan.updatedAt = data.updatedAt || plan.updatedAt;
      return plan;
    }
  }

  const applicationPlanInstance = new ApplicationPlan();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ApplicationPlan, applicationPlan: applicationPlanInstance };
  } else {
    global.EFillApplicationPlan = { ApplicationPlan, applicationPlan: applicationPlanInstance };
  }
})(typeof window !== 'undefined' ? window : globalThis);
