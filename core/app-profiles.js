/**
 * E-Fill Application Profiles Registry
 * =====================================
 * Defines supported government/official application portals.
 *
 * Each profile specifies:
 *   id           - Unique machine key
 *   name         - Human-readable application name
 *   description  - Brief description
 *   urlPatterns  - Array of pattern objects. A page matches if ANY pattern matches.
 *                  Each pattern has:
 *                    protocol: 'file', 'http', 'https', or '*' (any)
 *                    hostname: exact hostname string OR a regex string (wrapped in ^...$), OR '*' (any)
 *                    pathPrefix: optional, page path must start with this string
 *                    pathPattern: optional regex string matched against pathname
 *                  At least one of pathPrefix or pathPattern OR a broad hostname match is required.
 *   version      - Profile version string
 *   fieldHints   - Optional array of canonical IDs this application is known to contain
 *   notes        - Optional string for developer notes
 *
 * HOW TO ADD A NEW PORTAL (Phase 2 and beyond):
 *   1. Identify the official domain(s) for the application.
 *   2. Identify the URL pattern(s) for the form pages (not the home page).
 *   3. Add a new entry to APPLICATION_PROFILES below.
 *   4. Optionally add fieldHints to help prioritize which fields to look for.
 *   5. Add a corresponding test case in test/test-runner.cjs.
 *
 * NEVER hardcode an arbitrary website as ineligible. The eligibility decision
 * is: "matches a known profile" = eligible, "no match" = ineligible.
 */

(function (global) {
  'use strict';

  const APPLICATION_PROFILES = [

    // ─────────────────────────────────────────────────────────────────────────
    // DEV / TEST
    // ─────────────────────────────────────────────────────────────────────────
    {
      id: 'efill-test-harness',
      name: 'E-Fill Test Harness (Development)',
      description: 'Local development test form simulating a government recruitment portal.',
      version: '1.0',
      urlPatterns: [
        {
          protocol: 'file',
          hostname: '*',
          pathPattern: '.*[/\\\\]E-fill[/\\\\]test[/\\\\]test-harness\\.html'
        }
      ],
      fieldHints: [
        'full_name', 'dob', 'gender', 'primary_phone', 'email',
        'father_name', 'mother_name', 'address_line', 'district', 'state', 'pincode'
      ],
      notes: 'Development profile. Always eligible for local testing.'
    },

    // ─────────────────────────────────────────────────────────────────────────
    // TELANGANA STATE GOVERNMENT PORTALS (examples for Phase 2)
    // ─────────────────────────────────────────────────────────────────────────
    {
      id: 'tspsc-recruitment',
      name: 'TSPSC Online Application',
      description: 'Telangana State Public Service Commission recruitment portal.',
      version: '1.0',
      urlPatterns: [
        { protocol: 'https', hostname: 'tspsc.gov.in', pathPrefix: '/apply' },
        { protocol: 'https', hostname: 'www.tspsc.gov.in', pathPrefix: '/apply' },
        { protocol: 'https', hostname: 'online.tspsc.gov.in' }
      ],
      fieldHints: [
        'full_name', 'dob', 'gender', 'primary_phone', 'email',
        'father_name', 'mother_name', 'address_line', 'district', 'state', 'pincode'
      ]
    },
    {
      id: 'ts-epass',
      name: 'TS ePASS Scholarship Portal',
      description: 'Telangana Post Matric Scholarship portal.',
      version: '1.0',
      urlPatterns: [
        { protocol: 'https', hostname: 'telanganaepass.cgg.gov.in' },
        { protocol: 'https', hostname: 'epass.telangana.gov.in' }
      ],
      fieldHints: ['full_name', 'dob', 'gender', 'primary_phone', 'email', 'address_line', 'state', 'pincode']
    },

    // ─────────────────────────────────────────────────────────────────────────
    // ANDHRA PRADESH STATE GOVERNMENT PORTALS
    // ─────────────────────────────────────────────────────────────────────────
    {
      id: 'appsc-recruitment',
      name: 'APPSC Online Application',
      description: 'Andhra Pradesh Public Service Commission recruitment portal.',
      version: '1.0',
      urlPatterns: [
        { protocol: 'https', hostname: 'psc.ap.gov.in' },
        { protocol: 'https', hostname: 'www.psc.ap.gov.in' },
        { protocol: 'https', hostname: 'appsc.gov.in' }
      ],
      fieldHints: [
        'full_name', 'dob', 'gender', 'primary_phone', 'email',
        'father_name', 'mother_name', 'address_line', 'district', 'state', 'pincode'
      ]
    },

    // ─────────────────────────────────────────────────────────────────────────
    // CENTRAL GOVERNMENT PORTALS
    // ─────────────────────────────────────────────────────────────────────────
    {
      id: 'ssc-cgl',
      name: 'SSC Online Application',
      description: 'Staff Selection Commission recruitment portal.',
      version: '1.0',
      urlPatterns: [
        { protocol: 'https', hostname: 'ssc.nic.in' },
        { protocol: 'https', hostname: 'ssconline.nic.in' },
        { protocol: 'https', hostname: 'ssc.gov.in' }
      ],
      fieldHints: [
        'full_name', 'dob', 'gender', 'primary_phone', 'email',
        'father_name', 'mother_name', 'address_line', 'district', 'state', 'pincode'
      ]
    },
    {
      id: 'upsc-recruitment',
      name: 'UPSC Online Application',
      description: 'Union Public Service Commission recruitment portal.',
      version: '1.0',
      urlPatterns: [
        { protocol: 'https', hostname: 'upsconline.nic.in' },
        { protocol: 'https', hostname: 'www.upsc.gov.in' }
      ],
      fieldHints: [
        'full_name', 'dob', 'gender', 'primary_phone', 'email',
        'father_name', 'mother_name', 'address_line', 'district', 'state', 'pincode'
      ]
    },
    {
      id: 'nta-portal',
      name: 'NTA Examination Portal',
      description: 'National Testing Agency exam registration portal.',
      version: '1.0',
      urlPatterns: [
        { protocol: 'https', hostname: 'nta.ac.in' },
        { protocol: 'https', hostname: 'ntaexam.cdac.in' },
        { protocol: 'https', hostname: 'jeemain.nta.ac.in' },
        { protocol: 'https', hostname: 'neet.nta.nic.in' },
        { protocol: 'https', hostname: 'cuet.samarth.ac.in' }
      ],
      fieldHints: [
        'full_name', 'dob', 'gender', 'primary_phone', 'email',
        'father_name', 'mother_name', 'address_line', 'state', 'pincode'
      ]
    },
    {
      id: 'ibps-recruitment',
      name: 'IBPS Online Application',
      description: 'Institute of Banking Personnel Selection portal.',
      version: '1.0',
      urlPatterns: [
        { protocol: 'https', hostname: 'ibps.in' },
        { protocol: 'https', hostname: 'www.ibps.in' },
        { protocol: 'https', hostname: 'ibpsonline.ibps.in' }
      ],
      fieldHints: [
        'full_name', 'dob', 'gender', 'primary_phone', 'email',
        'father_name', 'mother_name', 'address_line', 'district', 'state', 'pincode'
      ]
    },

    // ─────────────────────────────────────────────────────────────────────────
    // GATE — GRADUATE APTITUDE TEST IN ENGINEERING
    // ─────────────────────────────────────────────────────────────────────────
    //
    // GATE is organized by IITs on rotation. The GOAPS (GATE Online Application
    // Processing System) hostname changes each cycle based on the organizing IIT.
    //
    // HOW TO ADD A FUTURE CYCLE (read before editing):
    //   1. Confirm the new official GOAPS hostname from the official GATE
    //      notification or gate.iitx.ac.in (do NOT add unverified hosts).
    //   2. Add a new urlPattern entry: { protocol: 'https', hostname: 'goaps.iitx.ac.in' }
    //   3. Bump the version string.
    //   4. Add a recognition test in Group 17 of test/test-runner.cjs.
    //
    // CURRENT CYCLE: GATE 2027 — Organizer: IIT Madras
    // ─────────────────────────────────────────────────────────────────────────
    {
      id: 'gate-goaps',
      name: 'GATE Online Application System (GOAPS)',
      description:
        'Graduate Aptitude Test in Engineering — official online application portal. ' +
        'Currently operated by IIT Madras for GATE 2027 (goaps.iitm.ac.in). ' +
        'To support future cycles, add the new GOAPS hostname as a urlPattern ' +
        'after official confirmation. Do not add unverified hosts.',
      version: '1.0',
      urlPatterns: [
        // GATE 2027 — IIT Madras organizer.
        // The entire goaps.iitm.ac.in domain is the GATE application system;
        // no pathPrefix restriction is needed — every page on this host is part
        // of the GATE portal (login, dashboard, applicationFiling, payment, etc.).
        { protocol: 'https', hostname: 'goaps.iitm.ac.in' }
      ],
      fieldHints: [
        // Personal
        'full_name', 'dob', 'gender', 'nationality',
        // Category / Reservation
        'category', 'ews_status', 'disability_type',
        // Contact
        'primary_phone', 'email',
        // Address
        'address_line', 'city', 'district', 'state', 'pincode',
        // Family
        'father_name', 'mother_name',
        // Identity
        'aadhaar_number',
        // Education (GATE requires qualifying degree details)
        'edu_qualification', 'edu_institution', 'edu_board',
        'edu_year', 'edu_percentage', 'edu_roll_number'
      ],
      notes:
        'Only goaps.iitm.ac.in (GATE 2027, IIT Madras) is registered here. ' +
        'Do not add unverified or rotational hosts without official confirmation. ' +
        'See the HOW TO ADD comment above for the extensibility pattern.'
    }

  ];

  const AppProfiles = { APPLICATION_PROFILES };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = AppProfiles;
  } else {
    global.EFillAppProfiles = AppProfiles;
  }
})(typeof window !== 'undefined' ? window : globalThis);
