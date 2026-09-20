/**
 * Application-wide configuration for the clinic's contact details.
 * These can be configured here directly or overridden via environment variables.
 */
export const CLINIC_CONFIG = {
  // The phone number formatting shown in UI text
  phoneDisplay: process.env.REACT_APP_CLINIC_PHONE_DISPLAY || "+91 9999999999",
  
  // The raw phone number used in tel: links
  phoneRaw: process.env.REACT_APP_CLINIC_PHONE_RAW || "+919999999999",
  
  // The email address for contact and inquiries
  email: process.env.REACT_APP_CLINIC_EMAIL || "avijitchoudhuryent79@gmail.com",
  
  // The WhatsApp number (including country code, without '+' sign) for wa.me links
  whatsappNumber: process.env.REACT_APP_CLINIC_WHATSAPP || "919999999999",

  // Clinic address details
  addressLine1: "Baak O Shrobon Kendra, Surakshya Polyclinic, 2nd Floor, Ganga Ghosh Building,",
  addressLine2: "Beside Style Bazar, Raghunathganj, Murshidabad - 742225",
  fullAddress: "Baak O Shrobon Kendra, Surakshya Polyclinic, 2nd Floor, Ganga Ghosh Building, Beside Style Bazar, Raghunathganj, Murshidabad - 742225",

  // Google Maps URLs
  googleMapsUrl: "https://maps.app.goo.gl/UDdZSJ1otNjWZRv1A",
  googleMapsEmbedUrl: "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3637.288673891465!2d88.0585443760338!3d24.460543078190776!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x39fa36f7669d39a3%3A0xfb537ad6fd84adce!2ssuraksha%20polyclinic%20%26%20diagnostic%20centre!5e0!3m2!1sen!2sin!4v1710000000000!5m2!1sen!2sin",

  // Developer website
  developerUrl: "https://www.maplekorporation.com/"
};

