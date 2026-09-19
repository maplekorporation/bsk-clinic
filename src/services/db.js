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
    const res = await fetch(`${API_BASE}/patients`, {
      headers: authHeaders(),
    });
    return handleResponse(res);
  },

  /**
   * Search patients by name or phone.
   */
  searchPatients: async (query) => {
    const res = await fetch(`${API_BASE}/patients/search?query=${encodeURIComponent(query)}`, {
      headers: authHeaders(),
    });
    return handleResponse(res);
  },

  /**
   * Create a new patient.
   * @param {{ name, phone, age, gender, address }} patient
   */
  savePatient: async (patient) => {
    const res = await fetch(`${API_BASE}/patients`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(patient),
    });
    return handleResponse(res);
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
   * Fetch all bookings (ordered by most recent).
   */
  getBookings: async () => {
    const res = await fetch(`${API_BASE}/bookings`, {
      headers: authHeaders(),
    });
    const data = await handleResponse(res);
    return (data || []).map(b => ({
      ...b,
      services: typeof b.services === 'string' ? JSON.parse(b.services) : (b.services || [])
    }));
  },

  /**
   * Create a new booking.
   * The backend will auto-compute subtotal/gst/total and generate a UID.
   * @param {{ patientId?, patientName?, patientPhone?, patientAge?, patientGender?, patientAddress?, services: [{name, price}], paymentMode, referredBy }} booking
   */
  saveBooking: async (booking) => {
    const res = await fetch(`${API_BASE}/bookings`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(booking),
    });
    const data = await handleResponse(res);
    if (data) {
      data.services = typeof data.services === 'string' ? JSON.parse(data.services) : (data.services || []);
    }
    return data;
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
