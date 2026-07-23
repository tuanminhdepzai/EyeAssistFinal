/**
 * ProfileManager — IndexedDB CRUD for user profiles
 *
 * Stores:
 *   - Calibration params (mapping coefficients)
 *   - Adaptive learner state (thresholds, blink stats)
 *   - Mode selection (A/B/C)
 *   - UI preferences
 */
export class ProfileManager {
  constructor() {
    this.dbName = 'EyeAssistProfiles';
    this.dbVersion = 1;
    this.db = null;
    this.defaultProfile = {
      id: 'default',
      name: 'Người dùng mặc định',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      mode: 'A',
      calibrationPoints: [],
      adaptiveState: null,
      accuracy: 0,
      gazeCalibrated: false,
      winkCapable: false,
      uiPreferences: {
        fontSize: 16,
        highContrast: false
      }
    };
  }

  async open() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('profiles')) {
          db.createObjectStore('profiles', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('sessions')) {
          db.createObjectStore('sessions', { keyPath: 'id', autoIncrement: true });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve();
      };

      request.onerror = (event) => {
        console.warn('IndexedDB error:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  async get(profileId = 'default') {
    if (!this.db) await this.open();
    return new Promise((resolve) => {
      const tx = this.db.transaction('profiles', 'readonly');
      const store = tx.objectStore('profiles');
      const request = store.get(profileId);

      request.onsuccess = () => {
        resolve(request.result || { ...this.defaultProfile });
      };
      request.onerror = () => resolve({ ...this.defaultProfile });
    });
  }

  async save(profile) {
    if (!this.db) await this.open();
    profile.updatedAt = Date.now();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('profiles', 'readwrite');
      const store = tx.objectStore('profiles');
      const request = store.put(profile);

      request.onsuccess = () => resolve(true);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async saveSession(sessionData) {
    if (!this.db) await this.open();
    sessionData.timestamp = Date.now();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('sessions', 'readwrite');
      const store = tx.objectStore('sessions');
      const request = store.add(sessionData);
      request.onsuccess = () => resolve(true);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async getSessions(limit = 10) {
    if (!this.db) await this.open();
    return new Promise((resolve) => {
      const tx = this.db.transaction('sessions', 'readonly');
      const store = tx.objectStore('sessions');
      const request = store.getAll();

      request.onsuccess = () => {
        const all = request.result || [];
        resolve(all.slice(-limit));
      };
      request.onerror = () => resolve([]);
    });
  }

  async deleteProfile(profileId = 'default') {
    if (!this.db) await this.open();
    return new Promise((resolve) => {
      const tx = this.db.transaction('profiles', 'readwrite');
      const store = tx.objectStore('profiles');
      store.delete(profileId);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  }
}
