/**
 * E-Fill Storage Layer
 * ====================
 * Local-first storage:
 *   - chrome.storage.local for structured profile, settings, metadata
 *   - IndexedDB for documents (Phase 6+)
 *
 * Storage keys:
 *   efill_user_profile       — legacy flat profile (v1, backward-compat)
 *   efill_information_profile — v2 InformationProfile with provenance (new)
 *   efill_settings           — user settings
 *
 * Migration:
 *   On first load with a new installation, if only the legacy profile exists,
 *   it is automatically migrated to v2 format and saved under the new key.
 *   The legacy key is preserved for backward-compatibility.
 */

(function (global) {
  'use strict';

  const STORAGE_KEYS = {
    USER_PROFILE:          'efill_user_profile',         // v1 legacy flat
    INFORMATION_PROFILE:   'efill_information_profile',  // v2 structured with provenance
    SETTINGS:              'efill_settings'
  };

  const DEFAULT_SETTINGS = {
    autoHighlightFields: true,
    confidenceThreshold: 0.7,
    enableIndicator: true
  };

  // ── Storage Adapter ────────────────────────────────────────────────────────
  class StorageAdapter {
    async get(key) {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        return new Promise((resolve) => {
          chrome.storage.local.get([key], (res) => resolve(res[key]));
        });
      }
      if (typeof localStorage !== 'undefined') {
        const val = localStorage.getItem(key);
        return val ? JSON.parse(val) : undefined;
      }
      return global.__efill_mock_storage ? global.__efill_mock_storage[key] : undefined;
    }

    async set(key, value) {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        return new Promise((resolve) => {
          chrome.storage.local.set({ [key]: value }, resolve);
        });
      }
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, JSON.stringify(value));
        return;
      }
      if (!global.__efill_mock_storage) global.__efill_mock_storage = {};
      global.__efill_mock_storage[key] = value;
    }

    async remove(key) {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        return new Promise((resolve) => {
          chrome.storage.local.remove([key], resolve);
        });
      }
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(key);
        return;
      }
      if (global.__efill_mock_storage) delete global.__efill_mock_storage[key];
    }
  }

  // ── StorageManager ─────────────────────────────────────────────────────────
  class StorageManager {
    constructor() {
      this.adapter = new StorageAdapter();
      this.db = null;
    }

    // ── Legacy flat profile (v1) ─────────────────────────────────────────────
    // Kept for backward-compatibility with tests and source-selector fallback.

    async getProfile() {
      let profile = await this.adapter.get(STORAGE_KEYS.USER_PROFILE);
      if (!profile) {
        const schema = global.EFillCanonicalSchema || (typeof require !== 'undefined' ? require('./canonical-schema.js') : null);
        profile = schema ? schema.DEFAULT_SYNTHETIC_PROFILE : null;
        if (profile) await this.saveProfile(profile);
      }
      return profile;
    }

    async saveProfile(profile) {
      if (!profile || typeof profile !== 'object') throw new Error('Invalid profile object.');
      profile.lastUpdated = new Date().toISOString();
      await this.adapter.set(STORAGE_KEYS.USER_PROFILE, profile);
      return profile;
    }

    async resetToDefaultProfile() {
      const schema = global.EFillCanonicalSchema || (typeof require !== 'undefined' ? require('./canonical-schema.js') : null);
      if (schema && schema.DEFAULT_SYNTHETIC_PROFILE) {
        const copy = JSON.parse(JSON.stringify(schema.DEFAULT_SYNTHETIC_PROFILE));
        copy.lastUpdated = new Date().toISOString();
        await this.adapter.set(STORAGE_KEYS.USER_PROFILE, copy);
        return copy;
      }
      return null;
    }

    // ── v2 InformationProfile ────────────────────────────────────────────────

    /**
     * Get the v2 InformationProfile.
     * If it doesn't exist, attempts migration from the legacy v1 profile.
     * Returns raw JSON data (not an InformationProfile class instance) for simplicity.
     */
    async getInformationProfile() {
      let data = await this.adapter.get(STORAGE_KEYS.INFORMATION_PROFILE);

      // If v2 profile exists and is valid, return it
      if (data && data.version === '2.0') {
        return data;
      }

      // Try to migrate from legacy
      const legacy = await this.getProfile();
      if (legacy) {
        const migrated = await this.migrateProfileIfNeeded(legacy);
        if (migrated) return migrated;
      }

      // Last resort: create empty v2 profile
      const ipMod = global.EFillInformationProfile || (typeof require !== 'undefined' ? require('./information-profile.js') : null);
      if (ipMod) {
        const ip = new ipMod.InformationProfile(null);
        const raw = ip.toJSON();
        await this.saveInformationProfile(raw);
        return raw;
      }

      return null;
    }

    /**
     * Save raw v2 InformationProfile JSON data.
     */
    async saveInformationProfile(profileData) {
      if (!profileData || typeof profileData !== 'object') throw new Error('Invalid information profile data.');
      profileData.lastUpdated = new Date().toISOString();
      await this.adapter.set(STORAGE_KEYS.INFORMATION_PROFILE, profileData);
      return profileData;
    }

    /**
     * Get initialized ProfileManager instance for multi-person profile management.
     */
    async getProfileManager() {
      const pmMod = global.EFillProfileManager || (typeof require !== 'undefined' ? require('./profile-manager.js') : null);
      if (!pmMod) return null;
      const pm = pmMod.profileManager;
      if (!pm.initialized) {
        await pm.init(this);
      }
      return pm;
    }

    /**
     * Migrate legacy flat profile to v2 InformationProfile.
     * Only migrates if the v2 profile doesn't already exist.
     * Returns the new v2 profile data, or null if migration not needed.
     */
    async migrateProfileIfNeeded(legacyProfile) {
      const existing = await this.adapter.get(STORAGE_KEYS.INFORMATION_PROFILE);
      if (existing && existing.version === '2.0') return existing; // Already migrated

      const ipMod = global.EFillInformationProfile || (typeof require !== 'undefined' ? require('./information-profile.js') : null);
      if (!ipMod || !legacyProfile) return null;

      const ip = ipMod.InformationProfile.migrateFromLegacy(legacyProfile);
      const raw = ip.toJSON();
      await this.saveInformationProfile(raw);
      return raw;
    }

    // ── Settings ─────────────────────────────────────────────────────────────

    async getSettings() {
      const settings = await this.adapter.get(STORAGE_KEYS.SETTINGS);
      return Object.assign({}, DEFAULT_SETTINGS, settings || {});
    }

    async saveSettings(settings) {
      const updated = Object.assign({}, await this.getSettings(), settings);
      await this.adapter.set(STORAGE_KEYS.SETTINGS, updated);
      return updated;
    }

    // ── IndexedDB Document Vault (Phase 6+ readiness) ────────────────────────

    async openDocumentDB() {
      if (this.db) return this.db;
      if (typeof indexedDB === 'undefined') return null;

      return new Promise((resolve, reject) => {
        const req = indexedDB.open('EFillDocumentVault', 1);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains('documents')) {
            db.createObjectStore('documents', { keyPath: 'id' });
          }
        };
        req.onsuccess = (e) => { this.db = e.target.result; resolve(this.db); };
        req.onerror = () => reject(req.error);
      });
    }
  }

  const storageManager = new StorageManager();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { StorageManager, storageManager, STORAGE_KEYS };
  } else {
    global.EFillStorage = { StorageManager, storageManager, STORAGE_KEYS };
  }
})(typeof window !== 'undefined' ? window : globalThis);
