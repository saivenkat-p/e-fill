/**
 * E-Fill Page Classifier
 * ======================
 * Classifies the current page to provide context for form scanning.
 *
 * ARCHITECTURE:
 *   Application profiles are OPTIONAL CONTEXT, not a scanning gate.
 *
 *   eligible = true  → page is scannable (all non-browser-internal pages)
 *   eligible = false → page cannot be scanned (only chrome://, edge://, etc.)
 *
 *   profile = <matched profile>  → application-specific hints available
 *   profile = null               → no profile matched; generic form scanning is used
 *
 *   A missing application profile NEVER prevents scanning.
 *   E-Fill can inspect any page that has meaningful form controls.
 *
 * This module is pure and has no side effects.
 * It depends only on EFillAppProfiles (app-profiles.js).
 */

(function (global) {
  'use strict';

  class PageClassifier {
    /**
     * @param {Array} profiles  Array from APPLICATION_PROFILES
     */
    constructor(profiles) {
      this.profiles = Array.isArray(profiles) ? profiles : [];
    }

    /**
     * Classify a URL and return scanning context.
     *
     * @param {string} url  Full page URL string (window.location.href)
     * @returns {{
     *   eligible: boolean,    // true = page is scannable; false = browser-internal only
     *   profile: Object|null, // matched application profile, or null if none matched
     *   reason: string        // human-readable explanation
     * }}
     */
    classify(url) {
      if (!url || typeof url !== 'string') {
        return { eligible: false, profile: null, reason: 'No URL provided' };
      }

      // Reject browser-internal pages immediately.
      // Content scripts cannot be injected into these pages.
      if (
        url.startsWith('chrome://') ||
        url.startsWith('chrome-extension://') ||
        url.startsWith('edge://') ||
        url.startsWith('about:') ||
        url.startsWith('moz-extension://')
      ) {
        return {
          eligible: false,
          profile: null,
          reason: 'Browser-internal page — E-Fill does not operate here'
        };
      }

      let parsed;
      try {
        parsed = new URL(url);
      } catch (e) {
        return { eligible: false, profile: null, reason: 'Could not parse page URL' };
      }

      // Try to match an application profile for additional context.
      // A matched profile provides field hints, known terminology, etc.
      // Not matching is fine — generic semantic form intelligence will be used.
      for (const profile of this.profiles) {
        if (this.matchesProfile(parsed, profile)) {
          return {
            eligible: true,
            profile,
            reason: `Matched profile: ${profile.name}`
          };
        }
      }

      // No profile matched — page is still fully scannable.
      // Generic form detection and canonical field mapping will run.
      return {
        eligible: true,
        profile: null,
        reason: 'No application profile matched — using generic form scanning'
      };
    }

    /**
     * Check if a parsed URL matches a single application profile.
     */
    matchesProfile(parsed, profile) {
      if (!profile.urlPatterns || !Array.isArray(profile.urlPatterns)) return false;

      for (const pattern of profile.urlPatterns) {
        if (this.matchesUrlPattern(parsed, pattern)) return true;
      }

      return false;
    }

    /**
     * Check if a parsed URL matches a single URL pattern object.
     *
     * Pattern fields (all optional unless specified):
     *   protocol    - 'file', 'http', 'https', or '*' (any)
     *   hostname    - exact string OR regex string (e.g. '^.*\\.gov\\.in$') OR '*'
     *   pathPrefix  - string: pathname must start with this value
     *   pathPattern - regex string matched against the full pathname
     */
    matchesUrlPattern(parsed, pattern) {
      // 1. Protocol check
      if (pattern.protocol && pattern.protocol !== '*') {
        // URL.protocol includes trailing colon: "https:" / "file:"
        const expectedProtocol = pattern.protocol.endsWith(':')
          ? pattern.protocol
          : pattern.protocol + ':';
        if (parsed.protocol !== expectedProtocol) return false;
      }

      // 2. Hostname check
      if (pattern.hostname && pattern.hostname !== '*') {
        const hostname = parsed.hostname || '';

        // For file:// URLs, hostname is empty string
        if (pattern.hostname === 'localhost' && hostname === '') {
          // file:// on local machine — allow
        } else if (pattern.hostname.startsWith('^') || pattern.hostname.endsWith('$')) {
          // Treat as regex
          try {
            if (!new RegExp(pattern.hostname, 'i').test(hostname)) return false;
          } catch (e) {
            return false;
          }
        } else {
          // Exact hostname match (case insensitive)
          if (hostname.toLowerCase() !== pattern.hostname.toLowerCase()) return false;
        }
      }

      // 3. Path prefix check (fastest, preferred for well-known portals)
      if (pattern.pathPrefix) {
        if (!parsed.pathname.startsWith(pattern.pathPrefix)) return false;
      }

      // 4. Path pattern (regex) — used for file:// URLs with embedded path
      if (pattern.pathPattern) {
        try {
          // For file:// URLs, the full path is in pathname. For others, combine.
          const fullPath = parsed.protocol === 'file:'
            ? decodeURIComponent(parsed.pathname)
            : parsed.pathname;

          if (!new RegExp(pattern.pathPattern, 'i').test(fullPath)) return false;
        } catch (e) {
          return false;
        }
      }

      // All specified checks passed
      return true;
    }
  }

  // Singleton factory — initialized from the global profiles registry
  function createClassifier() {
    const profiles =
      (typeof global !== 'undefined' && global.EFillAppProfiles?.APPLICATION_PROFILES) ||
      (typeof window !== 'undefined' && window.EFillAppProfiles?.APPLICATION_PROFILES) ||
      [];
    return new PageClassifier(profiles);
  }

  const PageClassifierModule = { PageClassifier, createClassifier };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = PageClassifierModule;
  } else {
    global.EFillPageClassifier = PageClassifierModule;
  }
})(typeof window !== 'undefined' ? window : globalThis);
