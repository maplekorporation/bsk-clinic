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

  getServices: async () => {
    return [
      { id: 'srv_1', name: 'ENT Consultation', price: 500, category: 'ENT Consultation' },
      { id: 'srv_2', name: 'Pure Tone Audiometry', price: 800, category: 'Hearing Tests & Diagnostics' },
      { id: 'srv_3', name: 'Tympanometry', price: 500, category: 'Hearing Tests & Diagnostics' },
      { id: 'srv_4', name: 'TdT', price: 400, category: 'Hearing Tests & Diagnostics' },
      { id: 'srv_5', name: 'SISI', price: 400, category: 'Hearing Tests & Diagnostics' },
      { id: 'srv_6', name: 'Eustachian Tube Function Test', price: 600, category: 'Hearing Tests & Diagnostics' },
      { id: 'srv_7', name: 'BERA', price: 2500, category: 'Hearing Tests & Diagnostics' },
      { id: 'srv_8', name: 'OAE', price: 1000, category: 'Hearing Tests & Diagnostics' },
      { id: 'srv_9', name: 'FOL', price: 1500, category: 'ENT Endoscopy' },
      { id: 'srv_10', name: 'DNE', price: 1500, category: 'ENT Endoscopy' },
      { id: 'srv_11', name: 'Otoendoscopy', price: 800, category: 'ENT Endoscopy' },
      { id: 'srv_12', name: 'Digital Hearing Aid Trial', price: 500, category: 'Hearing Aid Services' },
      { id: 'srv_13', name: 'Hearing Aid Fitting', price: 500, category: 'Hearing Aid Services' },
      { id: 'srv_14', name: 'Speech Therapy', price: 1000, category: 'Speech & Language Therapy' },
      { id: 'srv_15', name: 'Vestibular Rehab Therapy', price: 1200, category: 'Vestibular Rehabilitation' },
      { id: 'srv_16', name: 'Occupational Therapy', price: 1200, category: 'Occupational Therapy' },
      { id: 'srv_17', name: 'Psychological Assessment', price: 1500, category: 'Psychological Services' },
    ];
  },

  /**
   * Fetch all services (including inactive, for admin).
   */
  getAllServices: async () => {
    return [
      { id: 'srv_1', name: 'ENT Consultation', price: 500, category: 'ENT Consultation', isActive: true },
      { id: 'srv_2', name: 'Pure Tone Audiometry', price: 800, category: 'Hearing Tests & Diagnostics', isActive: true },
      { id: 'srv_3', name: 'Tympanometry', price: 500, category: 'Hearing Tests & Diagnostics', isActive: true },
      { id: 'srv_4', name: 'TdT', price: 400, category: 'Hearing Tests & Diagnostics', isActive: true },
      { id: 'srv_5', name: 'SISI', price: 400, category: 'Hearing Tests & Diagnostics', isActive: true },
      { id: 'srv_6', name: 'Eustachian Tube Function Test', price: 600, category: 'Hearing Tests & Diagnostics', isActive: true },
      { id: 'srv_7', name: 'BERA', price: 2500, category: 'Hearing Tests & Diagnostics', isActive: true },
      { id: 'srv_8', name: 'OAE', price: 1000, category: 'Hearing Tests & Diagnostics', isActive: true },
      { id: 'srv_9', name: 'FOL', price: 1500, category: 'ENT Endoscopy', isActive: true },
      { id: 'srv_10', name: 'DNE', price: 1500, category: 'ENT Endoscopy', isActive: true },
      { id: 'srv_11', name: 'Otoendoscopy', price: 800, category: 'ENT Endoscopy', isActive: true },
      { id: 'srv_12', name: 'Digital Hearing Aid Trial', price: 500, category: 'Hearing Aid Services', isActive: true },
      { id: 'srv_13', name: 'Hearing Aid Fitting', price: 500, category: 'Hearing Aid Services', isActive: true },
      { id: 'srv_14', name: 'Speech Therapy', price: 1000, category: 'Speech & Language Therapy', isActive: true },
      { id: 'srv_15', name: 'Vestibular Rehab Therapy', price: 1200, category: 'Vestibular Rehabilitation', isActive: true },
      { id: 'srv_16', name: 'Occupational Therapy', price: 1200, category: 'Occupational Therapy', isActive: true },
      { id: 'srv_17', name: 'Psychological Assessment', price: 1500, category: 'Psychological Services', isActive: true },
    ];
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
