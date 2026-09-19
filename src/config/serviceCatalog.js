/**
 * ═══════════════════════════════════════════════════════════════
 *  SERVICE CATALOG — Single source of truth for all clinic services
 * ═══════════════════════════════════════════════════════════════
 *
 *  To add/edit/remove a service, update the array below.
 *  Each entry requires:
 *    - id         : unique identifier (string)
 *    - name       : display name
 *    - price      : base price in ₹ (set 0 for variable-price items)
 *    - category   : grouping label (used for filter chips)
 *
 *  Optional flags:
 *    - perSession      : true → price is per-session (shown as "₹X/session")
 *    - isVariablePrice : true → receptionist enters price at booking time
 *    - isActive        : false → hidden from receptionist, visible in admin
 */

const SERVICE_CATALOG = [

  // ─── Hearing Tests & Diagnostics ──────────────────────────────
  { id: 'srv_1',  name: 'Pure Tone Audiometry',           price: 500,  category: 'Hearing Tests & Diagnostics' },
  { id: 'srv_2',  name: 'Tympanometry',                   price: 500,  category: 'Hearing Tests & Diagnostics' },
  { id: 'srv_3',  name: 'Speech Discrimination Score',    price: 500,  category: 'Hearing Tests & Diagnostics' },
  { id: 'srv_4',  name: 'Tone Decay Test',                price: 1000, category: 'Hearing Tests & Diagnostics' },
  { id: 'srv_5',  name: 'Oto Acoustic Emissions Test',    price: 1500, category: 'Hearing Tests & Diagnostics' },
  { id: 'srv_6',  name: 'BERA',                           price: 2000, category: 'Hearing Tests & Diagnostics' },

  // ─── ENT Endoscopy ────────────────────────────────────────────
  { id: 'srv_7',  name: 'Fiber Optic Laryngoscopy',       price: 1500, category: 'ENT Endoscopy' },
  { id: 'srv_8',  name: 'Oto Endoscopy',                  price: 800,  category: 'ENT Endoscopy' },
  { id: 'srv_9',  name: 'Nasal Endoscopy',                price: 1000, category: 'ENT Endoscopy' },

  // ─── Sleep Studies ────────────────────────────────────────────
  { id: 'srv_10', name: 'Polysomnography',                price: 4000, category: 'Sleep Studies' },

  // ─── Therapy Sessions ────────────────────────────────────────
  { id: 'srv_11', name: 'Speech Therapy',                 price: 300,  category: 'Therapy Sessions', perSession: true },
  { id: 'srv_12', name: 'Voice Therapy',                  price: 300,  category: 'Therapy Sessions', perSession: true },
  { id: 'srv_13', name: 'Vestibular Rehab Therapy',       price: 200,  category: 'Therapy Sessions', perSession: true },

  // ─── Hearing Aid Services (Variable Price) ────────────────────
  { id: 'srv_14', name: 'Hearing Aids (Digital/Programmable) - Trial, Fitting & Servicing', price: 0, category: 'Hearing Aid Services', isVariablePrice: true },

  // ─── Consultation Services (Variable Price) ───────────────────
  { id: 'srv_15', name: 'Consultancy', price: 0, category: 'Consultation', isVariablePrice: true },

];

// ─── Helper Functions ───────────────────────────────────────────

/** Returns only active services (for receptionist booking view). */
export const getActiveServices = (catalog) => {
  return catalog.filter(s => s.isActive !== false);
};

/** Find a service by its ID. */
export const getServiceById = (catalog, id) => {
  return catalog.find(s => s.id === id) || null;
};

/** Get unique category names from the catalog. */
export const getCategories = (catalog) => {
  return [...new Set(catalog.map(s => s.category).filter(Boolean))];
};

/** Generate the next available service ID (e.g. 'srv_15'). */
export const generateServiceId = (catalog) => {
  const maxNum = catalog.reduce((max, s) => {
    const match = s.id.match(/^srv_(\d+)$/);
    return match ? Math.max(max, parseInt(match[1], 10)) : max;
  }, 0);
  return `srv_${maxNum + 1}`;
};

export default SERVICE_CATALOG;
