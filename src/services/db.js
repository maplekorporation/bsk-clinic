import { offlineStorage } from './offlineStorage';
import { syncManager } from './syncManager';
// API Client — talks to the BSK Clinic Spring Boot backend.
// Replaces the old localStorage-based mock (db.js).
// All requests include JWT auth headers after login.

const API_BASE = process.env.REACT_APP_API_BASE || '/api/clinic';

// ── Token management ────────────────────────────────────

const getToken = () => localStorage.getItem('bsk_token');
const setToken = (token) => localStorage.setItem('bsk_token', token);
const clearToken = () => localStorage.removeItem('bsk_token');

const getAuthRole = () => localStorage.getItem('bsk_role');
const setAuthRole = (role) => localStorage.setItem('bsk_role', role);
const clearAuthRole = () => localStorage.removeItem('bsk_role');

const getDisplayName = () => localStorage.getItem('bsk_display_name');
const setDisplayName = (name) => localStorage.setItem('bsk_display_name', name);
const clearDisplayName = () => localStorage.removeItem('bsk_display_name');

// ── HTTP helpers ────────────────────────────────────────

const authHeaders = () => {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
};

const handleResponse = async (res) => {
  if (res.ok) {
    // 204 No Content (e.g. DELETE responses)
    if (res.status === 204) return null;
    return res.json();
  }

  // Try to extract error body
  let errorMsg = `Request failed (${res.status})`;
  try {
    const body = await res.json();
    errorMsg = body.error || body.message || errorMsg;
  } catch (_) {
    // response wasn't JSON
  }
  throw new Error(errorMsg);
};

// ── Public API ──────────────────────────────────────────

export const db = {

  // ──── Auth ─────────────────────────────────────────

  /**
   * Log in and receive a JWT token.
   * @returns {{ token, role, displayName, message }}
   */
  login: async (username, password) => {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    const data = await handleResponse(res);

    // Persist session
    setToken(data.token);
    setAuthRole(data.role);
    setDisplayName(data.displayName);

    return data;
  },

  /**
   * Clear the local session.
   */
  logout: () => {
    clearToken();
    clearAuthRole();
    clearDisplayName();
  },

  /**
   * Check if the user is currently logged in (has a token).
   */
  isLoggedIn: () => !!getToken(),

  /**
   * Get the current user's role.
   */
  getRole: () => getAuthRole(),

  /**
   * Get the current user's display name.
   */
  getDisplayName: () => getDisplayName(),

  // ──── Services (Catalog) ───────────────────────────
  // Primary source: backend API (database).
  // Fallback: localStorage cache → initial config file.

  /**
   * Internal helper: loads catalog from backend, with localStorage + config fallback.
   * @param {boolean} allServices - if true, fetch all (including inactive) via /all endpoint
   */
  _loadCatalog: async (allServices = false) => {
    const STORAGE_KEY = 'bsk_service_catalog';
    const endpoint = allServices ? `${API_BASE}/services/all` : `${API_BASE}/services`;

    // 1. Try the backend first (single source of truth)
    try {
      const res = await fetch(endpoint, { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          // Map backend shape → frontend shape & cache locally
          const mapped = data.map(s => ({
            id: `srv_${s.id}`,
            _backendId: s.id,
            name: s.name,
            price: s.price || 0,
            category: s.category || 'Uncategorized',
            isActive: s.isActive !== false,
            isVariablePrice: s.price === 0 || s.price === null || (s.name && (s.name.toLowerCase().includes('hearing aid') || s.name.toLowerCase().includes('consultan'))),
          }));

          // If backend catalog does not have Consultancy yet, attempt to auto-create it on backend
          const hasConsultancy = mapped.some(s => s.name && s.name.toLowerCase() === 'consultancy');
          if (!hasConsultancy && authHeaders().Authorization) {
            fetch(`${API_BASE}/services`, {
              method: 'POST',
              headers: authHeaders(),
              body: JSON.stringify({
                name: 'Consultancy',
                price: 0,
                category: 'Consultation',
                isActive: true,
              }),
            }).catch(() => {});
          }

          try { localStorage.setItem(STORAGE_KEY, JSON.stringify(mapped)); } catch (_) {}
          offlineStorage.cacheServices(mapped).catch(() => {});
          return mapped;
        }
      }
    } catch (e) {
      console.warn('Backend services fetch failed, using cache:', e.message);
    }

    // 2. Fallback: localStorage cache
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Ensure Consultancy from default catalog is merged if missing from cache
          const { default: SERVICE_CATALOG } = await import('../config/serviceCatalog');
          const missing = SERVICE_CATALOG.filter(def => !parsed.some(p => p.name && p.name.toLowerCase() === def.name.toLowerCase()));
          if (missing.length > 0) {
            const merged = [...parsed, ...missing];
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify(merged)); } catch (_) {}
            return merged;
          }
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Failed to parse service catalog from localStorage', e);
    }

    // 3. Last resort: initial config file
    const { default: SERVICE_CATALOG } = await import('../config/serviceCatalog');
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(SERVICE_CATALOG)); } catch (_) {}
    return SERVICE_CATALOG;
  },

  /**
   * Fetch active services (for receptionist booking view).
   */
  getServices: async () => {
    const catalog = await db._loadCatalog(false);
    return catalog.filter(s => s.isActive !== false);
  },

  /**
   * Fetch all services including inactive (for admin management).
   */
  getAllServices: async () => {
    const catalog = await db._loadCatalog(true);
    return catalog.map(s => ({ ...s, isActive: s.isActive !== false }));
  },

  /**
   * Save (add or update) a service — persists to backend DB.
   */
  saveService: async (service) => {
    // Check if the service already exists in the backend or catalog
    const catalog = await db.getAllServices();
    const existing = catalog.find(s => (service._backendId && s._backendId === service._backendId) || s.id === service.id);

    if (existing && existing._backendId) {
      // Update existing service
      try {
        const res = await fetch(`${API_BASE}/services/${existing._backendId}`, {
          method: 'PUT',
          headers: authHeaders(),
          body: JSON.stringify({
            name: service.name,
            price: Number(service.price) || 0,
            category: service.category,
            isActive: service.isActive !== false,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message || `Failed to update service (${res.status})`);
        }
      } catch (e) {
        console.error('Backend updateService failed:', e);
        throw e;
      }
    } else {
      // Create a brand new service via POST /api/clinic/services
      try {
        const res = await fetch(`${API_BASE}/services`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({
            name: service.name,
            price: Number(service.price) || 0,
            category: service.category,
            isActive: service.isActive !== false,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message || `Failed to create service (${res.status})`);
        }
      } catch (e) {
        console.error('Backend createService failed:', e);
        throw e;
      }
    }

    // Refresh catalog from backend after mutation
    return db.getAllServices();
  },

  /**
   * Update only the price of a service — persists to backend DB.
   */
  updateServicePrice: async (id, newPrice) => {
    const priceNum = Math.max(0, parseInt(newPrice, 10) || 0);

    // Extract numeric backend ID
    const numMatch = String(id).match(/\d+/);
    const numericId = numMatch ? parseInt(numMatch[0], 10) : null;

    if (numericId) {
      try {
        const res = await fetch(`${API_BASE}/services/${numericId}/price`, {
          method: 'PUT',
          headers: authHeaders(),
          body: JSON.stringify({ price: priceNum }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.message || `Failed to update price (${res.status})`);
        }
      } catch (e) {
        console.error('Backend price update failed:', e);
        throw e; // Let caller know the update didn't persist
      }
    }

    // Also update localStorage cache for immediate UI consistency
    const STORAGE_KEY = 'bsk_service_catalog';
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const catalog = JSON.parse(stored);
        const updated = catalog.map(s => s.id === id ? { ...s, price: priceNum, isVariablePrice: false } : s);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      }
    } catch (_) {}

    // Refresh from backend to ensure consistency
    return db.getAllServices();
  },

  /**
   * Toggle active/inactive status of a service — persists to backend DB.
   */
  toggleServiceActive: async (id) => {
    const numMatch = String(id).match(/\d+/);
    const numericId = numMatch ? parseInt(numMatch[0], 10) : null;

    if (numericId) {
      try {
        const res = await fetch(`${API_BASE}/services/${numericId}/toggle`, {
          method: 'PUT',
          headers: authHeaders(),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.message || `Failed to toggle service (${res.status})`);
        }
      } catch (e) {
        console.error('Backend toggle failed:', e);
        throw e;
      }
    }

    // Update localStorage cache
    const STORAGE_KEY = 'bsk_service_catalog';
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const catalog = JSON.parse(stored);
        const updated = catalog.map(s => s.id === id ? { ...s, isActive: !s.isActive } : s);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      }
    } catch (_) {}

    return db.getAllServices();
  },

  /**
   * Delete a service from the catalog — persists to backend DB.
   */
  deleteService: async (id) => {
    const numMatch = String(id).match(/\d+/);
    const numericId = numMatch ? parseInt(numMatch[0], 10) : null;

    if (numericId) {
      try {
        const res = await fetch(`${API_BASE}/services/${numericId}`, {
          method: 'DELETE',
          headers: authHeaders(),
        });
        if (!res.ok && res.status !== 404) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.message || `Failed to delete service (${res.status})`);
        }
      } catch (e) {
        console.error('Backend deleteService failed:', e);
        throw e;
      }
    }

    const STORAGE_KEY = 'bsk_service_catalog';
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const catalog = JSON.parse(stored);
        const updated = catalog.filter(s => s.id !== id);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      }
    } catch (_) {}
    return db.getAllServices();
  },

  // ──── Patients ─────────────────────────────────────

  /**
   * Fetch all patients.
   */
  getPatients: async () => {
    let serverPatients = [];
    try {
      const res = await fetch(`${API_BASE}/patients`, {
        headers: authHeaders(),
      });
      const data = await handleResponse(res);
      if (Array.isArray(data)) {
        serverPatients = data;
        offlineStorage.cachePatients(data).catch(() => {});
      }
    } catch (e) {
      console.warn('Backend getPatients failed, loading from offline cache:', e.message);
      const cached = await offlineStorage.getCachedPatients();
      serverPatients = Array.isArray(cached) ? cached : [];
    }

    // Merge any pending offline outbox patients so they appear immediately with Pending Sync status
    try {
      const pendingItems = await offlineStorage.getPendingOutboxItems();
      const pendingPatients = pendingItems
        .filter(item => item.type === 'PATIENT' && item.payload)
        .map(item => ({
          ...item.payload,
          id: item.tempId,
          isOffline: true,
          createdAt: item.createdAt,
        }))
        .filter(pp => !serverPatients.some(sp => sp.id === pp.id || (sp.name === pp.name && sp.phone === pp.phone)));

      return [...pendingPatients, ...serverPatients];
    } catch (_) {
      return serverPatients;
    }
  },

  /**
   * Search patients by name or phone.
   */
  searchPatients: async (query) => {
    try {
      const res = await fetch(`${API_BASE}/patients/search?query=${encodeURIComponent(query)}`, {
        headers: authHeaders(),
      });
      return await handleResponse(res);
    } catch (e) {
      console.warn('Backend searchPatients failed, searching offline cache:', e.message);
      const cached = await offlineStorage.getCachedPatients();
      const q = (query || '').trim().toLowerCase();
      return (cached || []).filter(p => 
        (p.name && p.name.toLowerCase().includes(q)) || 
        (p.phone && p.phone.includes(q))
      ).slice(0, 20);
    }
  },

  /**
   * Create a new patient with offline outbox fallback.
   * @param {{ name, phone, age, gender, address }} patient
   */
  savePatient: async (patient) => {
    const isOnline = syncManager.isOnline && (typeof navigator === 'undefined' || navigator.onLine);

    if (!isOnline) {
      const tempId = 'temp_p_' + Date.now();
      const offlinePatient = {
        ...patient,
        id: tempId,
        isOffline: true,
        createdAt: new Date().toISOString(),
      };
      await offlineStorage.addToOutbox({
        type: 'PATIENT',
        payload: patient,
        tempId,
      });
      await offlineStorage.addCachedPatient(offlinePatient);
      syncManager.updatePendingCount();
      return offlinePatient;
    }

    try {
      const res = await fetch(`${API_BASE}/patients`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(patient),
      });
      const data = await handleResponse(res);
      offlineStorage.addCachedPatient(data).catch(() => {});
      return data;
    } catch (e) {
      console.warn('Backend savePatient failed, saving to offline outbox:', e.message);
      const tempId = 'temp_p_' + Date.now();
      const offlinePatient = {
        ...patient,
        id: tempId,
        isOffline: true,
        createdAt: new Date().toISOString(),
      };
      await offlineStorage.addToOutbox({
        type: 'PATIENT',
        payload: patient,
        tempId,
      });
      await offlineStorage.addCachedPatient(offlinePatient);
      syncManager.updatePendingCount();
      return offlinePatient;
    }
  },

  /**
   * Update an existing patient.
   */
  updatePatient: async (id, patient) => {
    const res = await fetch(`${API_BASE}/patients/${id}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(patient),
    });
    return handleResponse(res);
  },

  /**
   * Delete a patient.
   */
  deletePatient: async (id) => {
    const res = await fetch(`${API_BASE}/patients/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    return handleResponse(res);
  },

  // ──── Bookings ─────────────────────────────────────

  /**
   * Fetch all bookings (ordered by most recent) with offline pending items merged.
   */
  getBookings: async () => {
    try {
      const res = await fetch(`${API_BASE}/bookings`, {
        headers: authHeaders(),
      });
      const data = await handleResponse(res);
      const parsedServerBookings = (data || []).map(b => ({
        ...b,
        services: typeof b.services === 'string' ? JSON.parse(b.services) : (b.services || [])
      }));

      // Merge any pending offline outbox bookings
      const pendingItems = await offlineStorage.getPendingOutboxItems();
      const pendingBookings = pendingItems
        .filter(item => item.type === 'BOOKING' && item.payload)
        .map(item => ({
          ...item.payload,
          id: item.tempId,
          uid: item.tempId ? `OFFLINE-${item.tempId.replace('offline_', '')}` : 'OFFLINE-BKG',
          isOffline: true,
          status: 'Pending Sync',
          createdAt: item.createdAt,
        }));

      const merged = [...pendingBookings, ...parsedServerBookings];
      offlineStorage.cacheBookings(merged).catch(() => {});
      return merged;
    } catch (e) {
      console.warn('Backend getBookings failed, reading from offline cache:', e.message);
      const cached = await offlineStorage.getCachedBookings();
      if (cached && cached.length > 0) return cached;
      throw e;
    }
  },

  /**
   * Create a new booking with offline outbox fallback.
   * Generates a clientRequestId for idempotent replay.
   * @param {{ patientId?, patientName?, patientPhone?, patientAge?, patientGender?, patientAddress?, services: [{name, price}], paymentMode, referredBy }} booking
   */
  saveBooking: async (booking) => {
    const clientRequestId = 'req_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
    const bookingWithIdempotency = { ...booking, clientRequestId };

    const isOnline = syncManager.isOnline && (typeof navigator === 'undefined' || navigator.onLine);

    if (!isOnline) {
      const tempId = 'offline_' + Date.now();
      const offlineBooking = {
        ...bookingWithIdempotency,
        id: tempId,
        uid: `OFFLINE-${Math.floor(1000 + Math.random() * 9000)}`,
        isOffline: true,
        createdAt: new Date().toISOString(),
        status: 'Pending Sync',
      };
      await offlineStorage.addToOutbox({
        type: 'BOOKING',
        payload: bookingWithIdempotency,
        clientRequestId,
        tempId,
      });
      await offlineStorage.addCachedBooking(offlineBooking);
      syncManager.updatePendingCount();
      return offlineBooking;
    }

    try {
      const res = await fetch(`${API_BASE}/bookings`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(bookingWithIdempotency),
      });
      const data = await handleResponse(res);
      if (data) {
        data.services = typeof data.services === 'string' ? JSON.parse(data.services) : (data.services || []);
        offlineStorage.addCachedBooking(data).catch(() => {});
      }
      return data;
    } catch (e) {
      console.warn('Backend saveBooking failed, queuing into offline outbox:', e.message);
      const tempId = 'offline_' + Date.now();
      const offlineBooking = {
        ...bookingWithIdempotency,
        id: tempId,
        uid: `OFFLINE-${Math.floor(1000 + Math.random() * 9000)}`,
        isOffline: true,
        createdAt: new Date().toISOString(),
        status: 'Pending Sync',
      };
      await offlineStorage.addToOutbox({
        type: 'BOOKING',
        payload: bookingWithIdempotency,
        clientRequestId,
        tempId,
      });
      await offlineStorage.addCachedBooking(offlineBooking);
      syncManager.updatePendingCount();
      return offlineBooking;
    }
  },

  /**
   * Fetch today's bookings.
   */
  getTodayBookings: async () => {
    const res = await fetch(`${API_BASE}/bookings/today`, {
      headers: authHeaders(),
    });
    const data = await handleResponse(res);
    return (data || []).map(b => ({
      ...b,
      services: typeof b.services === 'string' ? JSON.parse(b.services) : (b.services || [])
    }));
  },

  // ──── Dashboard (Admin) ────────────────────────────

  /**
   * Fetch aggregated dashboard statistics.
   */
  getDashboardStats: async () => {
    const res = await fetch(`${API_BASE}/dashboard/stats`, {
      headers: authHeaders(),
    });
    return handleResponse(res);
  },
};


db.syncManager = syncManager;
db.offlineStorage = offlineStorage;
