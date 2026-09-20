// IndexedDB storage manager for BSK Clinic Offline Mode
// Provides resilient local caching and an Outbox queue for requests when offline.

const DB_NAME = 'bsk_clinic_offline_db';
const DB_VERSION = 1;

let dbPromise = null;

/**
 * Open or upgrade the IndexedDB database.
 */
export const openOfflineDb = () => {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      console.warn('IndexedDB not supported in this environment');
      resolve(null);
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // 1. Outbox queue for offline mutations (bookings, patients)
      if (!db.objectStoreNames.contains('outbox')) {
        const outboxStore = db.createObjectStore('outbox', { keyPath: 'id', autoIncrement: true });
        outboxStore.createIndex('status', 'status', { unique: false });
        outboxStore.createIndex('createdAt', 'createdAt', { unique: false });
        outboxStore.createIndex('clientRequestId', 'clientRequestId', { unique: false });
      }

      // 2. Local cache for patients (for offline search and selection)
      if (!db.objectStoreNames.contains('cached_patients')) {
        db.createObjectStore('cached_patients', { keyPath: 'id' });
      }

      // 3. Local cache for services catalog
      if (!db.objectStoreNames.contains('cached_services')) {
        db.createObjectStore('cached_services', { keyPath: 'id' });
      }

      // 4. Local cache for bookings (includes offline pending bookings)
      if (!db.objectStoreNames.contains('cached_bookings')) {
        db.createObjectStore('cached_bookings', { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = (e) => {
      console.error('Failed to open IndexedDB:', e);
      resolve(null);
    };
  });

  return dbPromise;
};

export const offlineStorage = {
  // ── Outbox operations ─────────────────────────────

  addToOutbox: async ({ type, payload, clientRequestId, tempId }) => {
    const item = {
      type, // 'PATIENT' | 'BOOKING'
      payload,
      clientRequestId,
      tempId,
      status: 'PENDING',
      attempts: 0,
      createdAt: new Date().toISOString(),
      lastError: null,
    };

    return new Promise(async (resolve) => {
      const db = await openOfflineDb();
      if (!db) return resolve(null);
      const tx = db.transaction('outbox', 'readwrite');
      const store = tx.objectStore('outbox');
      const req = store.add(item);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
  },

  getPendingOutboxItems: async () => {
    return new Promise(async (resolve) => {
      const db = await openOfflineDb();
      if (!db) return resolve([]);
      const tx = db.transaction('outbox', 'readonly');
      const store = tx.objectStore('outbox');
      const req = store.getAll();
      req.onsuccess = () => {
        const items = (req.result || []).filter(item => item.status === 'PENDING' || item.status === 'RETRY');
        items.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)); // FIFO order
        resolve(items);
      };
      req.onerror = () => resolve([]);
    });
  },

  getPendingOutboxCount: async () => {
    const items = await offlineStorage.getPendingOutboxItems();
    return items.length;
  },

  updateOutboxItem: async (id, updates) => {
    return new Promise(async (resolve) => {
      const db = await openOfflineDb();
      if (!db) return resolve(false);
      const tx = db.transaction('outbox', 'readwrite');
      const store = tx.objectStore('outbox');
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        if (!getReq.result) return resolve(false);
        const updated = { ...getReq.result, ...updates };
        const putReq = store.put(updated);
        putReq.onsuccess = () => resolve(true);
        putReq.onerror = () => resolve(false);
      };
      getReq.onerror = () => resolve(false);
    });
  },

  removeOutboxItem: async (id) => {
    return new Promise(async (resolve) => {
      const db = await openOfflineDb();
      if (!db) return resolve(false);
      const tx = db.transaction('outbox', 'readwrite');
      const store = tx.objectStore('outbox');
      const req = store.delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    });
  },

  // ── Services Cache ────────────────────────────────

  cacheServices: async (services) => {
    if (!Array.isArray(services)) return;
    const db = await openOfflineDb();
    if (!db) return;
    const tx = db.transaction('cached_services', 'readwrite');
    const store = tx.objectStore('cached_services');
    store.clear();
    services.forEach(s => store.put(s));
  },

  getCachedServices: async () => {
    return new Promise(async (resolve) => {
      const db = await openOfflineDb();
      if (!db) return resolve([]);
      const tx = db.transaction('cached_services', 'readonly');
      const store = tx.objectStore('cached_services');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  },

  // ── Patients Cache ────────────────────────────────

  cachePatients: async (patients) => {
    if (!Array.isArray(patients)) return;
    const db = await openOfflineDb();
    if (!db) return;
    const tx = db.transaction('cached_patients', 'readwrite');
    const store = tx.objectStore('cached_patients');
    patients.forEach(p => store.put(p));
  },

  getCachedPatients: async () => {
    return new Promise(async (resolve) => {
      const db = await openOfflineDb();
      if (!db) return resolve([]);
      const tx = db.transaction('cached_patients', 'readonly');
      const store = tx.objectStore('cached_patients');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  },

  addCachedPatient: async (patient) => {
    const db = await openOfflineDb();
    if (!db) return;
    const tx = db.transaction('cached_patients', 'readwrite');
    tx.objectStore('cached_patients').put(patient);
  },

  // ── Bookings Cache ────────────────────────────────

  cacheBookings: async (bookings) => {
    if (!Array.isArray(bookings)) return;
    const db = await openOfflineDb();
    if (!db) return;
    const tx = db.transaction('cached_bookings', 'readwrite');
    const store = tx.objectStore('cached_bookings');
    bookings.forEach(b => store.put(b));
  },

  getCachedBookings: async () => {
    return new Promise(async (resolve) => {
      const db = await openOfflineDb();
      if (!db) return resolve([]);
      const tx = db.transaction('cached_bookings', 'readonly');
      const store = tx.objectStore('cached_bookings');
      const req = store.getAll();
      req.onsuccess = () => {
        const list = req.result || [];
        list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
        resolve(list);
      };
      req.onerror = () => resolve([]);
    });
  },

  addCachedBooking: async (booking) => {
    const db = await openOfflineDb();
    if (!db) return;
    const tx = db.transaction('cached_bookings', 'readwrite');
    tx.objectStore('cached_bookings').put(booking);
  },

  replaceCachedBooking: async (tempId, canonicalBooking) => {
    const db = await openOfflineDb();
    if (!db) return;
    const tx = db.transaction('cached_bookings', 'readwrite');
    const store = tx.objectStore('cached_bookings');
    store.delete(tempId);
    store.put(canonicalBooking);
  }
};
