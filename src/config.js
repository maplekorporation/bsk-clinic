/**
 * Application-wide configuration for the clinic's contact details.
 * These can be configured here directly or overridden via environment variables.
 */
export const CLINIC_CONFIG = {
  // The phone number formatting shown in UI text
  phoneDisplay: process.env.REACT_APP_CLINIC_PHONE_DISPLAY || "+919000123456",
  
  // The raw phone number used in tel: links
  phoneRaw: process.env.REACT_APP_CLINIC_PHONE_RAW || "+919000123456",
  
  // The email address for contact and inquiries
  email: process.env.REACT_APP_CLINIC_EMAIL || "care@bakoshrobonkendra.com",
  
  // The WhatsApp number (including country code, without '+' sign) for wa.me links
  whatsappNumber: process.env.REACT_APP_CLINIC_WHATSAPP || "919000123456"
};
