/**
 * E-Fill Profile Manager
 * =======================
 * Manages multiple independent person information profiles (e.g. Sai Venkat, Brother, Father, Mother, Friend).
 *
 * CORE INVARIANTS:
 *   - Each profile is completely isolated. Data is never mixed between people.
 *   - The currently selected profile is the active source for the application session.
 *   - Switching profiles triggers immediate recalculation of application proposals.
 *   - "My Information" UI is a continuous page that displays the currently selected profile.
 *   - Automatic backward-compatible migration from single-profile storage.
 */

(function (global) {
  'use strict';

  const schema = global.EFillCanonicalSchema || (typeof require !== 'undefined' ? require('./canonical-schema.js') : null);
  const ipMod  = global.EFillInformationProfile || (typeof require !== 'undefined' ? require('./information-profile.js') : null);

  const STORAGE_KEYS = {
    PROFILES_STORE:      'efill_profiles_store',      // { profiles: { [id]: profileEntry }, selectedId: string }
    SELECTED_PROFILE_ID: 'efill_selected_profile_id'
  };

  class ProfileManager {
    constructor(storageAdapter) {
      this.storage = storageAdapter || null;
      this.profiles = {};          // { [id]: { id, name, relationship, createdAt, lastUpdated, profileData } }
      this.selectedProfileId = null;
      this.initialized = false;
    }

    /**
     * Initialize manager and load/migrate profiles from storage.
     */
    async init(storageManager) {
      if (storageManager) {
        this.storage = storageManager.adapter || storageManager;
      }

      let storeData = null;
      if (this.storage && typeof this.storage.get === 'function') {
        storeData = await this.storage.get(STORAGE_KEYS.PROFILES_STORE);
      }

      if (storeData && storeData.profiles && Object.keys(storeData.profiles).length > 0) {
        this.profiles = storeData.profiles;
        this.selectedProfileId = storeData.selectedId || Object.keys(this.profiles)[0];
      } else {
        // Migrate from legacy single-profile storage if present
        await this._migrateInitialProfile(storageManager);
      }

      this.initialized = true;
      return this;
    }

    /**
     * Migrate single profile into multi-person profile store.
     */
    async _migrateInitialProfile(storageManager) {
      let initialData = null;
      let initialName = 'Sai Venkat';

      if (storageManager) {
        try {
          if (typeof storageManager.getInformationProfile === 'function') {
            const rawV2 = await storageManager.getInformationProfile();
            if (rawV2 && rawV2.personal) {
              initialData = rawV2;
              const fn = rawV2.personal?.full_name?.value;
              if (fn && fn.trim()) initialName = fn.trim();
            }
          }
          if (!initialData && typeof storageManager.getProfile === 'function') {
            const legacy = await storageManager.getProfile();
            if (legacy && legacy.personal) {
              const IPClass = ipMod?.InformationProfile;
              if (IPClass) {
                const ip = IPClass.migrateFromLegacy(legacy);
                initialData = ip.toJSON();
              }
              if (legacy.personal?.fullName) initialName = legacy.personal.fullName;
            }
          }
        } catch (e) {
          console.warn('[E-Fill ProfileManager] Migration check note:', e.message);
        }
      }

      if (!initialData) {
        // Fallback to default synthetic profile
        const IPClass = ipMod?.InformationProfile;
        if (IPClass && schema?.DEFAULT_SYNTHETIC_PROFILE) {
          const ip = IPClass.migrateFromLegacy(schema.DEFAULT_SYNTHETIC_PROFILE);
          initialData = ip.toJSON();
          initialName = schema.DEFAULT_SYNTHETIC_PROFILE.personal?.fullName || 'Sai Venkat';
        } else if (IPClass) {
          const ip = new IPClass(null);
          initialData = ip.toJSON();
        }
      }

      const defaultId = 'prof_default_sai_venkat';
      this.profiles = {
        [defaultId]: {
          id: defaultId,
          name: initialName,
          relationship: 'Self',
          createdAt: new Date().toISOString(),
          lastUpdated: new Date().toISOString(),
          profileData: initialData
        }
      };
      this.selectedProfileId = defaultId;

      await this._persist();
    }

    /**
     * List all profiles with summary metadata.
     */
    listProfiles() {
      return Object.values(this.profiles).map(p => ({
        id: p.id,
        name: p.name,
        relationship: p.relationship || 'Other',
        isSelected: p.id === this.selectedProfileId,
        lastUpdated: p.lastUpdated,
        createdAt: p.createdAt
      }));
    }

    /**
     * Get the ID of the currently selected profile.
     */
    getSelectedProfileId() {
      if (!this.selectedProfileId || !this.profiles[this.selectedProfileId]) {
        const keys = Object.keys(this.profiles);
        this.selectedProfileId = keys.length > 0 ? keys[0] : null;
      }
      return this.selectedProfileId;
    }

    /**
     * Set the currently selected profile.
     * Returns true if changed, false if invalid or same.
     */
    async setSelectedProfileId(id) {
      if (!id || !this.profiles[id]) {
        throw new Error(`Profile "${id}" does not exist`);
      }
      if (this.selectedProfileId === id) return false;

      this.selectedProfileId = id;
      await this._persist();
      return true;
    }

    /**
     * Get selected profile entry with instantiated InformationProfile.
     */
    getSelectedProfile() {
      const id = this.getSelectedProfileId();
      if (!id) return null;
      return this.getProfile(id);
    }

    /**
     * Get profile entry by ID with instantiated InformationProfile.
     */
    getProfile(id) {
      const entry = this.profiles[id];
      if (!entry) return null;

      const IPClass = ipMod?.InformationProfile;
      const profileInstance = IPClass ? IPClass.fromJSON(JSON.parse(JSON.stringify(entry.profileData))) : entry.profileData;

      return {
        id: entry.id,
        name: entry.name,
        relationship: entry.relationship || 'Other',
        lastUpdated: entry.lastUpdated,
        createdAt: entry.createdAt,
        profile: profileInstance
      };
    }

    getProfileById(id) {
      return this.getProfile(id);
    }

    /**
     * Create a new independent information profile.
     * @param {string} name - e.g. "Brother", "Father", "Pendyala Rahul"
     * @param {string} [relationship] - e.g. "Brother", "Father", "Friend", "Self"
     * @param {Object} [initialData] - optional initial InformationProfile data
     * @param {boolean} [selectImmediately=false]
     */
    async createProfile(name, relationship, initialData, selectImmediately = false) {
      if (!name || !name.trim()) {
        throw new Error('Profile name is required');
      }

      const id = `prof_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 5)}`;
      const IPClass = ipMod?.InformationProfile;
      let pData = null;

      if (initialData && typeof initialData === 'object') {
        if (initialData.personal || initialData.version === '2.0') {
          pData = JSON.parse(JSON.stringify(initialData));
        } else if (IPClass) {
          const ip = new IPClass(null);
          for (const [k, v] of Object.entries(initialData)) {
            const val = typeof v === 'object' && v !== null && 'value' in v ? v.value : v;
            ip.setField(k, val, 'USER_ENTERED', 'Initial profile creation');
          }
          pData = ip.toJSON();
        } else {
          pData = initialData;
        }
      } else if (IPClass) {
        const ip = new IPClass(null);
        pData = ip.toJSON();
      }

      const newEntry = {
        id,
        name: name.trim(),
        relationship: relationship || 'Other',
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        profileData: pData
      };

      this.profiles[id] = newEntry;

      if (selectImmediately || !this.selectedProfileId) {
        this.selectedProfileId = id;
      }

      await this._persist();
      return this.getProfile(id);
    }

    /**
     * Update an existing profile's data or metadata.
     */
    async updateProfile(id, updates = {}) {
      const entry = this.profiles[id];
      if (!entry) throw new Error(`Profile "${id}" not found`);

      if (typeof updates.toJSON === 'function' || updates.personal) {
        entry.profileData = typeof updates.toJSON === 'function' ? updates.toJSON() : JSON.parse(JSON.stringify(updates));
      } else {
        if (updates.name !== undefined && updates.name.trim()) {
          entry.name = updates.name.trim();
        }
        if (updates.relationship !== undefined) {
          entry.relationship = updates.relationship;
        }
        if (updates.profileData !== undefined) {
          entry.profileData = typeof updates.profileData.toJSON === 'function'
            ? updates.profileData.toJSON()
            : JSON.parse(JSON.stringify(updates.profileData));
        }
      }

      entry.lastUpdated = new Date().toISOString();
      await this._persist();
      return this.getProfile(id);
    }

    /**
     * Convenience method to save current active InformationProfile data.
     */
    async saveCurrentProfileData(profileInstanceOrData) {
      const id = this.getSelectedProfileId();
      if (!id) throw new Error('No profile currently selected');
      return this.updateProfile(id, { profileData: profileInstanceOrData });
    }

    /**
     * Rename a profile.
     */
    async renameProfile(id, newName) {
      if (!newName || !newName.trim()) throw new Error('New profile name cannot be empty');
      return this.updateProfile(id, { name: newName.trim() });
    }

    /**
     * Delete a profile.
     * Invariant: cannot delete the last remaining profile.
     */
    async deleteProfile(id) {
      if (!this.profiles[id]) return false;
      const keys = Object.keys(this.profiles);
      if (keys.length <= 1) {
        throw new Error('Cannot delete the only remaining profile');
      }

      delete this.profiles[id];

      if (this.selectedProfileId === id) {
        this.selectedProfileId = Object.keys(this.profiles)[0];
      }

      await this._persist();
      return true;
    }

    /**
     * Internal persist helper.
     */
    async _persist() {
      if (this.storage && typeof this.storage.set === 'function') {
        const storePayload = {
          profiles: this.profiles,
          selectedId: this.selectedProfileId,
          lastUpdated: new Date().toISOString()
        };
        await this.storage.set(STORAGE_KEYS.PROFILES_STORE, storePayload);

        // Also update backward-compatible single profile keys for older tools/scripts
        const selected = this.profiles[this.selectedProfileId];
        if (selected && selected.profileData) {
          await this.storage.set('efill_information_profile', selected.profileData);
          if (ipMod?.InformationProfile) {
            try {
              const ip = ipMod.InformationProfile.fromJSON(selected.profileData);
              await this.storage.set('efill_user_profile', ip.toLegacyProfile());
            } catch (e) {}
          }
        }
      }
    }
  }

  const profileManager = new ProfileManager();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ProfileManager, profileManager, STORAGE_KEYS };
  } else {
    global.EFillProfileManager = { ProfileManager, profileManager, STORAGE_KEYS };
  }
})(typeof window !== 'undefined' ? window : globalThis);
