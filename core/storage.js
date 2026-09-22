/**
 * E-Fill Storage Layer
 * Local-first storage:
 * - chrome.storage.local for lightweight profile, settings, metadata
 * - IndexedDB for documents, certificates, photos (prepared for future phases)
 * - Extensible adapter interface for future cloud sync without breaking changes.
 */

(function (global) {
  'use strict';

  const STORAGE_KEYS = {
    USER_PROFILE: 'efill_user_profile',
    SETTINGS: 'efill_settings'
  };

  const DEFAULT_SETTINGS = {
    autoHighlightFields: true,
    confidenceThreshold: 0.7,
    enableIndicator: true
  };

  class StorageAdapter {
    async get(key) {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        return new Promise((resolve) => {
          chrome.storage.local.get([key], (res) => resolve(res[key]));
        });
      }
      // Fallback for node or tests
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

  class StorageManager {
    constructor() {
      this.adapter = new StorageAdapter();
      this.db = null;
    }

    async getProfile() {
      let profile = await this.adapter.get(STORAGE_KEYS.USER_PROFILE);
      if (!profile) {
        // Fallback to default synthetic profile
        const schema = global.EFillCanonicalSchema || (typeof require !== 'undefined' ? require('./canonical-schema.js') : null);
        profile = schema ? schema.DEFAULT_SYNTHETIC_PROFILE : null;
        if (profile) {
          await this.saveProfile(profile);
        }
      }
      return profile;
    }

    async saveProfile(profile) {
      if (!profile || typeof profile !== 'object') {
        throw new Error('Invalid profile object.');
      }
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

    async getSettings() {
      const settings = await this.adapter.get(STORAGE_KEYS.SETTINGS);
      return Object.assign({}, DEFAULT_SETTINGS, settings || {});
    }

    async saveSettings(settings) {
      const updated = Object.assign({}, await this.getSettings(), settings);
      await this.adapter.set(STORAGE_KEYS.SETTINGS, updated);
      return updated;
    }

    /**
     * IndexedDB Initialization for Document Vault (Phase 3 readiness)
     */
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
        req.onsuccess = (e) => {
          this.db = e.target.result;
          resolve(this.db);
        };
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
