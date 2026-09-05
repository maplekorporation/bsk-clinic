import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { db } from './services/db';
import en from './locales/en';
import bn from './locales/bn';
import ServiceMultiSelect from './components/ServiceMultiSelect';

// Simple hash-based router
function useHashRoute() {
  const [hash, setHash] = useState(() => window.location.hash || '#/');

  useEffect(() => {
    const handleHashChange = () => {
      setHash(window.location.hash || '#/');
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const navigate = useCallback((path) => {
    window.location.hash = path;
  }, []);

  return [hash, navigate];
}

const getPaginationRange = (currentPage, totalPages) => {
  const pages = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    if (currentPage <= 4) {
      pages.push(1, 2, 3, 4, 5, '...', totalPages);
    } else if (currentPage >= totalPages - 3) {
      pages.push(1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
    } else {
      pages.push(1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages);
    }
  }
  return pages;
};

const convertNumberToWords = (amount) => {
  if (!amount || amount === 0) return "Rupees Zero Only";
  const singleDigits = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
  const doubleDigits = ["Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tensMultiple = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  let num = Math.floor(amount);
  let words = "";

  const convertThreeDigitsOrLess = (n) => {
    let temp = "";
    if (n >= 100) {
      temp += singleDigits[Math.floor(n / 100)] + " Hundred ";
      n %= 100;
    }
    if (n >= 10 && n < 20) {
      temp += doubleDigits[n - 10] + " ";
    } else if (n >= 20) {
      temp += tensMultiple[Math.floor(n / 10)] + " " + singleDigits[n % 10] + " ";
    } else if (n > 0) {
      temp += singleDigits[n] + " ";
    }
    return temp;
  };

  if (num >= 10000000) {
    words += convertThreeDigitsOrLess(Math.floor(num / 10000000)) + "Crore ";
    num %= 10000000;
  }
  if (num >= 100000) {
    words += convertThreeDigitsOrLess(Math.floor(num / 100000)) + "Lakh ";
    num %= 100000;
  }
  if (num >= 1000) {
    words += convertThreeDigitsOrLess(Math.floor(num / 1000)) + "Thousand ";
    num %= 1000;
  }
  if (num > 0) {
    words += convertThreeDigitsOrLess(num);
  }

  return "Rupees " + words.trim().replace(/\s+/g, ' ') + " Only";
};

function App() {
  const [hash, navigate] = useHashRoute();
  const [view, setView] = useState('landing'); // 'landing' | 'receptionist'

  // ==========================================
  // 0. Authentication State
  // ==========================================
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return db.isLoggedIn() && db.getRole() === 'RECEPTIONIST';
  });
  const [authError, setAuthError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Admin Authentication State
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(() => {
    return db.isLoggedIn() && db.getRole() === 'ADMIN';
  });
  const [adminAuthError, setAdminAuthError] = useState('');
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [adminTab, setAdminTab] = useState('overview');
  const [patientGenderFilter, setPatientGenderFilter] = useState('All');
  const [adminPeriodFilter, setAdminPeriodFilter] = useState('today');
  const [overviewBookingIdSearch, setOverviewBookingIdSearch] = useState('');

  useEffect(() => {
    setOverviewBookingsPage(1);
  }, [adminPeriodFilter, overviewBookingIdSearch]);

  // Redirect to login if not authenticated, or to dashboard if already authenticated
  useEffect(() => {
    if (hash === '#/receptionist' && !isAuthenticated) {
      navigate('/registration');
    } else if (hash === '#/admin' && !isAdminAuthenticated) {
      navigate('/admin-login');
    } else if (hash === '#/registration' && isAuthenticated) {
      navigate('/receptionist');
    } else if (hash === '#/admin-login' && isAdminAuthenticated) {
      navigate('/admin');
    }
  }, [hash, isAuthenticated, isAdminAuthenticated, navigate]);

  const handleLogin = async (username, password) => {
    try {
      const data = await db.login(username, password);
      if (data.role === 'RECEPTIONIST' || data.role === 'ADMIN') {
        // If an ADMIN logs in through the receptionist portal, let's allow it or restrict?
        // Let's allow access to the receptionist tab since ADMIN has role ADMIN and security config allows both
        setIsAuthenticated(true);
        setAuthError('');
        navigate('/receptionist');
      } else {
        db.logout();
        setAuthError('Access denied. Invalid role.');
      }
    } catch (err) {
      setAuthError(err.message || 'Invalid username or password. Please try again.');
    }
  };

  const handleLogout = () => {
    db.logout();
    setIsAuthenticated(false);
    setAuthError('');
    navigate('');
  };

  const handleAdminLogin = async (username, password) => {
    try {
      const data = await db.login(username, password);
      if (data.role === 'ADMIN') {
        setIsAdminAuthenticated(true);
        setAdminAuthError('');
        navigate('/admin');
      } else {
        db.logout();
        setAdminAuthError('Access denied. Admin role required.');
      }
    } catch (err) {
      setAdminAuthError(err.message || 'Invalid admin credentials. Access denied.');
    }
  };

  const handleAdminLogout = () => {
    db.logout();
    setIsAdminAuthenticated(false);
    setAdminAuthError('');
    navigate('');
  };

  // ==========================================
  // 1. Page Loader State
  // ==========================================
  const [loaderVisible, setLoaderVisible] = useState(true);
  const [loaderOpacity, setLoaderOpacity] = useState(1);

  useEffect(() => {
    // Fade out loader after 300ms, then remove from DOM after another 500ms
    const fadeTimer = setTimeout(() => {
      setLoaderOpacity(0);
      const removeTimer = setTimeout(() => {
        setLoaderVisible(false);
      }, 500);
      return () => clearTimeout(removeTimer);
    }, 300);

    return () => clearTimeout(fadeTimer);
  }, []);

  // ==========================================
  // 2. Dark Mode Theme Controller
  // ==========================================
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('theme') === 'dark';
  });

  useEffect(() => {
    if (darkMode) {
      document.body.classList.add('dark-mode');
      localStorage.setItem('theme', 'dark');
    } else {
      document.body.classList.remove('dark-mode');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  // ==========================================
  // 2b. Language / i18n Controller (landing page only)
  // ==========================================
  const [language, setLanguage] = useState(() => {
    return localStorage.getItem('lang') || 'bn';
  });

  const t = language === 'bn' ? bn : en;

  const translateDigits = (str) => {
    if (language !== 'bn') return str;
    const englishToBengali = {
      '0': '০', '1': '১', '2': '২', '3': '৩', '4': '৪',
      '5': '৫', '6': '৬', '7': '৭', '8': '৮', '9': '৯'
    };
    return str.toString().replace(/[0-9]/g, w => englishToBengali[w]);
  };

  useEffect(() => {
    localStorage.setItem('lang', language);
    document.documentElement.lang = language === 'bn' ? 'bn' : 'en';
    document.title = language === 'bn'
      ? 'বাক ও শ্রবণ কেন্দ্র | হিয়ারিং টেস্ট, স্পিচ থেরাপি এবং ইএনটি বিশেষজ্ঞ'
      : 'Baak o Shrobon Kendra | Hearing Test, Speech Therapy & ENT Specialist';
  }, [language]);

  const toggleLanguage = () => {
    setLanguage(prev => prev === 'en' ? 'bn' : 'en');
  };

  // ==========================================
  // 3. Sticky Navbar & Scroll Indicators
  // ==========================================
  const [scrolled, setScrolled] = useState(false);
  const [backToTopVisible, setBackToTopVisible] = useState(false);
  const [activeSection, setActiveSection] = useState('home');

  useEffect(() => {
    const handleScroll = () => {
      const scrollPos = window.scrollY;

      // Sticky Header class
      setScrolled(scrollPos > 20);

      // Back to top visibility
      setBackToTopVisible(scrollPos > 500);

      // Active Section Highlighting
      const sections = document.querySelectorAll('section[id]');
      sections.forEach(current => {
        const sectionHeight = current.offsetHeight;
        const sectionTop = current.offsetTop - 120; // offset navbar height
        const sectionId = current.getAttribute('id');

        if (scrollPos > sectionTop && scrollPos <= sectionTop + sectionHeight) {
          setActiveSection(sectionId);
        }
      });
    };

    window.addEventListener('scroll', handleScroll);
    handleScroll(); // Run initially

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  // ==========================================
  // 4. Mobile Side Drawer Navigation
  // ==========================================
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // ==========================================
  // 5. IntersectionObserver Entrance Animations
  // ==========================================
  useEffect(() => {
    // Run after loader goes away to ensure layout is settled
    if (loaderVisible) return;

    const reveals = document.querySelectorAll('.reveal');
    const revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('active');
          observer.unobserve(entry.target); // Animates once
        }
      });
    }, {
      threshold: 0.15,
      rootMargin: '0px 0px -50px 0px'
    });

    reveals.forEach(reveal => {
      revealObserver.observe(reveal);
    });

    return () => {
      revealObserver.disconnect();
    };
  }, [loaderVisible, view]);

  // ==========================================
  // 7. FAQ Accordion
  // ==========================================
  const [activeFaq, setActiveFaq] = useState(null);
  const faqRefs = useRef([]);

  const toggleFaq = (index) => {
    if (activeFaq === index) {
      setActiveFaq(null);
    } else {
      setActiveFaq(index);
    }
  };

  const faqData = t.faq.items;


  // ==========================================
  // 9. Receptionist Booking Portal State & Handlers
  // ==========================================
  const [portalTab, setPortalTab] = useState('new-booking'); // 'new-booking' | 'patients' | 'bookings'
  
  const [patientsList, setPatientsList] = useState([]);
  const [bookingsList, setBookingsList] = useState([]);
  const [adminBookingsPage, setAdminBookingsPage] = useState(1);
  const [portalBookingsPage, setPortalBookingsPage] = useState(1);
  const [overviewBookingsPage, setOverviewBookingsPage] = useState(1);

  const sortedBookings = useMemo(() => {
    return [...bookingsList].sort((a, b) => {
      const idA = parseInt(a.id, 10);
      const idB = parseInt(b.id, 10);
      if (!isNaN(idA) && !isNaN(idB)) {
        return idB - idA;
      }
      // Date descending
      const dateDiff = new Date(b.date) - new Date(a.date);
      if (dateDiff !== 0) return dateDiff;
      return String(b.id).localeCompare(String(a.id));
    });
  }, [bookingsList]);

  const ITEMS_PER_PAGE = 10;
  
  const totalPortalPages = Math.ceil(sortedBookings.length / ITEMS_PER_PAGE);
  const startIndexPortal = (portalBookingsPage - 1) * ITEMS_PER_PAGE;
  const paginatedPortalBookings = sortedBookings.slice(startIndexPortal, startIndexPortal + ITEMS_PER_PAGE);

  const totalAdminPages = Math.ceil(sortedBookings.length / ITEMS_PER_PAGE);
  const startIndexAdmin = (adminBookingsPage - 1) * ITEMS_PER_PAGE;
  const paginatedAdminBookings = sortedBookings.slice(startIndexAdmin, startIndexAdmin + ITEMS_PER_PAGE);

  const [catalogServices, setCatalogServices] = useState([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [selectedServices, setSelectedServices] = useState([]);
  
  const [paymentMode, setPaymentMode] = useState('UPI');
  const [referredBy, setReferredBy] = useState('Self');
  
  const [isNewPatientForm, setIsNewPatientForm] = useState(false);
  const [newPatientDetails, setNewPatientDetails] = useState({
    name: '',
    phone: '',
    age: '',
    gender: 'Male',
    address: ''
  });

  const [activeInvoice, setActiveInvoice] = useState(null);
  const [dashboardStats, setDashboardStats] = useState(null);

  // Fetch initial portal data
  useEffect(() => {
    const fetchPortalData = async () => {
      if (!db.isLoggedIn()) return;
      try {
        const patients = await db.getPatients();
        const bookings = await db.getBookings();
        const services = await db.getServices();
        setPatientsList(patients || []);
        setBookingsList(bookings || []);
        setCatalogServices(services || []);

        if (db.getRole() === 'ADMIN') {
          const stats = await db.getDashboardStats();
          setDashboardStats(stats);
        }
      } catch (err) {
        console.error("Error loading portal data", err);
      }
    };
    fetchPortalData();
  }, [view, isAuthenticated, isAdminAuthenticated]);

  // Sync view state with hash route
  useEffect(() => {
    if (hash === '#/receptionist') {
      setView('receptionist');
    } else if (hash === '#/admin') {
      setView('admin');
    } else if (hash === '#/registration') {
      setView('registration');
    } else if (hash === '#/admin-login') {
      setView('admin-login');
    } else {
      setView('landing');
    }
  }, [hash]);

  const handleSearchChange = async (e) => {
    const query = e.target.value;
    setSearchQuery(query);
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    try {
      const results = await db.searchPatients(query);
      setSearchResults(results || []);
    } catch (err) {
      console.error("Search error, falling back to local filtering:", err);
      const filtered = patientsList.filter(
        p => p.name.toLowerCase().includes(query.toLowerCase()) || 
             p.phone.includes(query)
      );
      setSearchResults(filtered);
    }
  };

  const handleSelectPatient = (patient) => {
    setSelectedPatient(patient);
    setIsNewPatientForm(false);
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleToggleService = (service) => {
    const isSelected = selectedServices.some(s => s.id === service.id);
    if (isSelected) {
      setSelectedServices(selectedServices.filter(s => s.id !== service.id));
    } else {
      setSelectedServices([...selectedServices, { ...service, customPrice: service.price }]);
    }
  };

  const handleServicePriceChange = (serviceId, newPrice) => {
    setSelectedServices(prev =>
      prev.map(s => s.id === serviceId ? { ...s, customPrice: newPrice } : s)
    );
  };

  const handleClearBookingForm = () => {
    setSelectedPatient(null);
    setSelectedServices([]);
    setPaymentMode('UPI');
    setReferredBy('Self');
    setIsNewPatientForm(false);
    setNewPatientDetails({ name: '', phone: '', age: '', gender: 'Male', address: '' });
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleNewPatientChange = (e) => {
    const { name, value } = e.target;
    setNewPatientDetails(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const triggerNewPatientRegister = () => {
    setIsNewPatientForm(true);
    setSelectedPatient(null);
    setNewPatientDetails({
      name: searchQuery,
      phone: /^\d+$/.test(searchQuery) ? searchQuery : '',
      age: '',
      gender: 'Male',
      address: ''
    });
    setSearchResults([]);
  };

  const handleSaveBooking = async (e) => {
    e.preventDefault();
    if (!selectedPatient && !isNewPatientForm) {
      alert('Please search and select a patient, or register a new one.');
      return;
    }
    if (selectedServices.length === 0) {
      alert('Please select at least one test/service to book.');
      return;
    }

    try {
      let patientObj = selectedPatient;
      if (isNewPatientForm) {
        if (!newPatientDetails.name || !newPatientDetails.phone || !newPatientDetails.age) {
          alert('Name, Phone, and Age are required fields for patient registration.');
          return;
        }
        patientObj = await db.savePatient({
          name: newPatientDetails.name,
          phone: newPatientDetails.phone,
          age: parseInt(newPatientDetails.age, 10),
          gender: newPatientDetails.gender,
          address: newPatientDetails.address
        });
        
        // Refresh patients cache
        const updatedPatients = await db.getPatients();
        setPatientsList(updatedPatients);
      }

      const subtotal = selectedServices.reduce((acc, s) => acc + (s.customPrice ?? s.price), 0);
      const gst = 0;
      const total = subtotal;

      const newBookingObj = {
        patientId: patientObj.id,
        patientName: patientObj.name,
        patientPhone: patientObj.phone,
        patientAge: patientObj.age,
        patientGender: patientObj.gender,
        patientAddress: patientObj.address,
        services: selectedServices.map(s => ({ name: s.name, price: s.customPrice ?? s.price })),
        subtotal,
        gst,
        total,
        paymentMode,
        referredBy,
        date: new Date().toISOString().split('T')[0],
        status: 'Completed'
      };

      const savedBkg = await db.saveBooking(newBookingObj);
      
      // Refresh bookings cache
      const updatedBookings = await db.getBookings();
      setBookingsList(updatedBookings);
      setAdminBookingsPage(1);
      setPortalBookingsPage(1);

      // Open invoice modal
      setActiveInvoice(savedBkg);

      // Reset Form State
      setSelectedPatient(null);
      setSelectedServices([]);
      setPaymentMode('UPI');
      setReferredBy('Self');
      setIsNewPatientForm(false);
      setNewPatientDetails({ name: '', phone: '', age: '', gender: 'Male', address: '' });
      setSearchQuery('');
      setSearchResults([]);
    } catch (err) {
      console.error("Failed to book appointment", err);
      alert("Error generating booking. Please try again.");
    }
  };

  return (
    <>
      {/* 1. Page Loader */}
      {loaderVisible && (
        <div 
          id="loader" 
          aria-hidden="true"
          style={{
            opacity: loaderOpacity,
            visibility: loaderOpacity === 0 ? 'hidden' : 'visible',
            transition: 'opacity 0.5s ease, visibility 0.5s ease'
          }}
        >
          <div className="loader-spinner"></div>
        </div>
      )}

      {/* 2. Header & Navigation */}
      <header id="header" className={scrolled ? 'scrolled' : ''}>
        <div className="nav-container">
          <div className="container">
            <a href="#home" onClick={() => { setView('landing'); }} className="logo" aria-label="Baak o Shrobon Kendra Home">
              <div className="logo-img-wrapper">
                <img src="logo.png" alt="Baak o Shrobon Kendra Logo" className="logo-img" />
              </div>
              <div className="logo-divider"></div>
              <div className="logo-text">
                <span className="logo-main">{t.nav.clinicName}</span>
                <span className="logo-sub">{t.nav.logoSub}</span>
              </div>
            </a>
            
            {view === 'landing' && (
              <nav className={`nav-menu ${mobileMenuOpen ? 'active' : ''}`} id="nav-menu" role="navigation" aria-label="Main Navigation">
                <a href="#home" className={`nav-link ${activeSection === 'home' ? 'active' : ''}`} onClick={() => setMobileMenuOpen(false)}>{t.nav.home}</a>
                <a href="#about" className={`nav-link ${activeSection === 'about' ? 'active' : ''}`} onClick={() => setMobileMenuOpen(false)}>{t.nav.about}</a>
                <a href="#doctor" className={`nav-link ${activeSection === 'doctor' ? 'active' : ''}`} onClick={() => setMobileMenuOpen(false)}>{t.nav.doctor}</a>
                <a href="#services" className={`nav-link ${activeSection === 'services' ? 'active' : ''}`} onClick={() => setMobileMenuOpen(false)}>{t.nav.services}</a>
                <a href="#why-choose-us" className={`nav-link ${activeSection === 'why-choose-us' ? 'active' : ''}`} onClick={() => setMobileMenuOpen(false)}>{t.nav.whyUs}</a>
                <a href="#faq" className={`nav-link ${activeSection === 'faq' ? 'active' : ''}`} onClick={() => setMobileMenuOpen(false)}>{t.nav.faq}</a>
                <a href="#contact" className={`nav-link ${activeSection === 'contact' ? 'active' : ''}`} onClick={() => setMobileMenuOpen(false)}>{t.nav.contact}</a>
              </nav>
            )}
            
            <div className="nav-actions">
              {view === 'admin' && (
                <button 
                  className="portal-header-logout-btn admin-header-logout"
                  title="Logout"
                  onClick={handleAdminLogout}
                >
                  <i className="fa-solid fa-right-from-bracket"></i>
                  <span className="logout-text">Logout</span>
                </button>
              )}

              {view === 'receptionist' && (
                <button 
                  className="portal-header-logout-btn"
                  title="Logout"
                  onClick={handleLogout}
                >
                  <i className="fa-solid fa-right-from-bracket"></i>
                  <span className="logout-text">Logout</span>
                </button>
              )}

              {view === 'landing' && (
                <button
                  className="lang-switcher"
                  id="lang-switcher"
                  aria-label="Switch language"
                  onClick={toggleLanguage}
                  title={language === 'en' ? 'বাংলায় দেখুন' : 'Switch to English'}
                >
                  <span className={`lang-option ${language === 'en' ? 'active' : ''}`}>EN</span>
                  <span className="lang-divider">|</span>
                  <span className={`lang-option ${language === 'bn' ? 'active' : ''}`}>বাং</span>
                </button>
              )}

              <button 
                className="theme-toggle" 
                id="theme-toggle" 
                aria-label="Toggle dark/light theme"
                onClick={() => setDarkMode(!darkMode)}
              >
                <i className="fa-solid fa-moon" aria-hidden="true"></i>
                <i className="fa-solid fa-sun" aria-hidden="true"></i>
              </button>
              
              {view === 'landing' && (
                <button 
                  className={`hamburger ${mobileMenuOpen ? 'active' : ''}`} 
                  id="hamburger" 
                  aria-label="Toggle navigation menu" 
                  aria-expanded={mobileMenuOpen ? 'true' : 'false'} 
                  aria-controls="nav-menu"
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                >
                  <span></span>
                  <span></span>
                  <span></span>
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {view === 'landing' && (
        <>
          {/* 3. Floating Blobs Background (Shared across sections) */}
      <div className="blob-container" aria-hidden="true">
        <div className="blob blob-1"></div>
        <div className="blob blob-2"></div>
        <div className="blob blob-3"></div>
      </div>

      {/* 4. Hero Section */}
      <section id="home" className="hero">
        <div className="container hero-grid">
          <div className="hero-content reveal reveal-fade-up active">
            <div className="hero-badge-container">
              <div className="hero-badge"><i className="fa-solid fa-circle-check" aria-hidden="true"></i> {t.hero.badge1}</div>
              <div className="hero-badge"><i className="fa-solid fa-circle-check" aria-hidden="true"></i> {t.hero.badge2}</div>
              <div className="hero-badge"><i className="fa-solid fa-circle-check" aria-hidden="true"></i> {t.hero.badge3}</div>
              <div className="hero-badge"><i className="fa-solid fa-circle-check" aria-hidden="true"></i> {t.hero.badge4}</div>
              <div className="hero-badge"><i className="fa-solid fa-circle-check" aria-hidden="true"></i> {t.hero.badge5}</div>
              <div className="hero-badge"><i className="fa-solid fa-circle-check" aria-hidden="true"></i> {t.hero.badge6}</div>
              <div className="hero-badge"><i className="fa-solid fa-circle-check" aria-hidden="true"></i> {t.hero.badge7}</div>
            </div>
            <h1 className="hero-title">
              {t.hero.titleLine1}<br />
              <span>{t.hero.titleLine2}</span>
            </h1>
            <p className="hero-subtitle">
              {t.hero.subtitle}
            </p>
            <div className="hero-actions">
              <a href="tel:+919674163040" className="btn btn-secondary">{t.hero.callNow} <i className="fa-solid fa-phone" aria-hidden="true"></i></a>
            </div>
          </div>
          
          <div className="hero-image-container reveal reveal-scale-in active">
            <div className="hero-image-wrapper">
              <img src="dr_avijit_chowdhury.png" alt="Dr. Avijit Chowdhury - Chief Otolaryngologist at Baak o Shrobon Kendra" loading="eager" />
            </div>
            
            <div className="hero-floating-card hero-floating-card-1">
              <div className="floating-icon">
                <i className="fa-solid fa-user-md" aria-hidden="true"></i>
              </div>
              <div className="floating-card-info">
                <h4>{t.hero.doctorName}</h4>
                <p>{t.hero.doctorTitle}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 6. About Section */}
      <section id="about">
        <div className="container about-grid">
          <div className="about-images reveal reveal-fade-left">
            <div className="about-img-box about-img-box-1">
              <img src="speech_therapy.png" alt="Dr. Avijit Chowdhury and speech therapist consulting a patient at Baak o Shrobon Kendra" />
            </div>
            <div className="about-img-box about-img-box-2">
              <img src="hearing_test.png" alt="Modern audiometry equipment and hearing test session in progress" />
            </div>
            <div className="about-experience-badge">
              <span>{translateDigits('10+')}</span>
              <p>{t.about.experienceBadge}<br />{t.about.experienceBadge2}</p>
            </div>
          </div>
          
          <div className="about-content reveal reveal-fade-right">
            <span className="section-badge">{t.about.badge}</span>
            <h2 className="section-title">{t.about.title}</h2>
            <p className="about-story">
              {t.about.story[0]}<br /><br />
              {t.about.story[1]}<br /><br />
              {t.about.story[2]}<br /><br />
              {t.about.story[3]}
            </p>
            
            <div className="about-mv">
              <div className="mv-card">
                <i className="fa-solid fa-bullseye" aria-hidden="true"></i>
                <h4>{t.about.missionTitle}</h4>
                <p>{t.about.missionText}</p>
              </div>
              <div className="mv-card">
                <i className="fa-solid fa-eye" aria-hidden="true"></i>
                <h4>{t.about.visionTitle}</h4>
                <p>{t.about.visionText}</p>
              </div>
            </div>
            
            <div className="about-highlights">
              <div className="highlight-item">
                <i className="fa-solid fa-check" aria-hidden="true"></i> {t.about.highlight1}
              </div>
              <div className="highlight-item">
                <i className="fa-solid fa-check" aria-hidden="true"></i> {t.about.highlight2}
              </div>
              <div className="highlight-item">
                <i className="fa-solid fa-check" aria-hidden="true"></i> {t.about.highlight3}
              </div>
              <div className="highlight-item">
                <i className="fa-solid fa-check" aria-hidden="true"></i> {t.about.highlight4}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 6b. Doctor Profile Section */}
      <section id="doctor">
        <div className="container">
          <div className="section-header reveal reveal-fade-up">
            <span className="section-badge">{t.doctorProfile.sectionBadge}</span>
            <h2 className="section-title">{t.doctorProfile.sectionTitle}</h2>
            <p className="section-subtitle">{t.doctorProfile.sectionSubtitle}</p>
          </div>

          <div className="doctor-profile-container">
            {/* 1. Main Doctor Hero Card (Full Width) */}
            <div className="doctor-hero-card reveal reveal-fade-up">
              <div className="doctor-hero-left">
                <div className="doctor-photo-wrapper">
                  <img src="dr_avijit_chowdhury.png" alt="Dr. Avijit Choudhury - MS (ENT)" loading="lazy" />
                  <span className="doctor-experience-tag">
                    <i className="fa-solid fa-award" aria-hidden="true"></i> {t.doctorProfile.experienceBadge}
                  </span>
                </div>
                <div className="doctor-quick-meta">
                  <span className="doctor-reg-badge">
                    <i className="fa-solid fa-id-card" aria-hidden="true"></i> {t.doctorProfile.regNo}
                  </span>
                </div>
                <div className="doctor-hero-languages">
                  <h4><i className="fa-solid fa-language" aria-hidden="true"></i> {t.doctorProfile.languagesTitle}</h4>
                  <div className="doctor-lang-pills">
                    {t.doctorProfile.languages.map((lang, idx) => (
                      <span key={idx} className="doctor-lang-pill">
                        {lang.name}
                        <span className="doctor-lang-level">{lang.level}</span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="doctor-hero-right">
                <div className="doctor-hero-header">
                  <div className="doctor-hero-badge-row">
                    <span className="doctor-pill-badge primary">
                      <i className="fa-solid fa-user-doctor" aria-hidden="true"></i> {t.doctorProfile.govtPost}
                    </span>
                    <span className="doctor-pill-badge secondary">
                      <i className="fa-solid fa-hospital" aria-hidden="true"></i> {t.doctorProfile.founderPost}
                    </span>
                  </div>
                  <h3 className="doctor-hero-name">{t.doctorProfile.doctorName}</h3>
                  <p className="doctor-hero-designation">{t.doctorProfile.doctorDesignation}</p>
                </div>

                <div className="doctor-summary-box">
                  <i className="fa-solid fa-quote-left doctor-quote-icon" aria-hidden="true"></i>
                  <p>{t.doctorProfile.profileSummary}</p>
                </div>

                {/* Key Quick Highlights */}
                {t.doctorProfile.highlights && (
                  <div className="doctor-highlights-row">
                    <div className="doctor-highlight-box">
                      <i className="fa-solid fa-building-columns" aria-hidden="true"></i>
                      <div>
                        <strong>{t.doctorProfile.highlights[0]?.title}</strong>
                        <span>{t.doctorProfile.highlights[0]?.desc}</span>
                      </div>
                    </div>
                    <div className="doctor-highlight-box">
                      <i className="fa-solid fa-hand-holding-medical" aria-hidden="true"></i>
                      <div>
                        <strong>{t.doctorProfile.highlights[1]?.title}</strong>
                        <span>{t.doctorProfile.highlights[1]?.desc}</span>
                      </div>
                    </div>
                    <div className="doctor-highlight-box">
                      <i className="fa-solid fa-microscope" aria-hidden="true"></i>
                      <div>
                        <strong>{t.doctorProfile.highlights[2]?.title}</strong>
                        <span>{t.doctorProfile.highlights[2]?.desc}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 2. Clinical & Surgical Interests (Full Width Grid) */}
            <div className="doctor-section-block reveal reveal-fade-up">
              <h3 className="doctor-subsection-title">
                <i className="fa-solid fa-stethoscope" aria-hidden="true"></i> {t.doctorProfile.specialtiesTitle}
              </h3>
              <div className="doctor-specialties-grid">
                {t.doctorProfile.specialties.map((spec, idx) => (
                  <div key={idx} className="doctor-specialty-card">
                    <div className="doctor-specialty-icon">
                      <i className={`fa-solid ${spec.icon}`} aria-hidden="true"></i>
                    </div>
                    <h4>{spec.title}</h4>
                    <p>{spec.items}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* 3. Dual-Column Row: Professional Experience & Education/Competencies */}
            <div className="doctor-dual-grid">
              {/* Left Column: Experience Timeline */}
              <div className="doctor-grid-col-left reveal reveal-fade-right">
                <div className="doctor-section-block">
                  <h3 className="doctor-subsection-title">
                    <i className="fa-solid fa-briefcase-medical" aria-hidden="true"></i> {t.doctorProfile.experienceTitle}
                  </h3>
                  <div className="doctor-timeline">
                    {t.doctorProfile.experience.map((exp, idx) => (
                      <div key={idx} className="doctor-timeline-item">
                        <div className="doctor-timeline-marker">
                          <div className="doctor-timeline-dot"></div>
                          {idx < t.doctorProfile.experience.length - 1 && <div className="doctor-timeline-line"></div>}
                        </div>
                        <div className="doctor-timeline-content">
                          <div className="doctor-timeline-header">
                            <span className="doctor-timeline-period">{exp.period}</span>
                            <h4>{exp.role}</h4>
                            <p className="doctor-timeline-org">{exp.organization}</p>
                            <p className="doctor-timeline-location"><i className="fa-solid fa-location-dot" aria-hidden="true"></i> {exp.location}</p>
                          </div>
                          <ul className="doctor-timeline-highlights">
                            {exp.highlights.map((h, hIdx) => (
                              <li key={hIdx}>{h}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right Column: Education & Core Competencies */}
              <div className="doctor-grid-col-right reveal reveal-fade-left">
                {/* Education */}
                <div className="doctor-section-block">
                  <h3 className="doctor-subsection-title">
                    <i className="fa-solid fa-graduation-cap" aria-hidden="true"></i> {t.doctorProfile.educationTitle}
                  </h3>
                  <div className="doctor-education-cards">
                    {t.doctorProfile.education.map((edu, idx) => (
                      <div key={idx} className="doctor-education-card">
                        <div className="doctor-edu-year">{edu.year}</div>
                        <h4>{edu.degree}</h4>
                        <p className="doctor-edu-institution">{edu.institution}</p>
                        <p className="doctor-edu-university">{edu.university}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Core Competencies */}
                <div className="doctor-section-block doctor-competencies-block">
                  <h3 className="doctor-subsection-title">
                    <i className="fa-solid fa-award" aria-hidden="true"></i> {t.doctorProfile.competenciesTitle}
                  </h3>
                  <div className="doctor-competencies-cloud">
                    {t.doctorProfile.competencies.map((comp, idx) => (
                      <span key={idx} className="doctor-competency-tag">{comp}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 7. Services Section */}
      <section id="services">
        <div className="container">
          <div className="section-header reveal reveal-fade-up">
            <span className="section-badge">{t.services.badge}</span>
            <h2 className="section-title">{t.services.title}</h2>
            <p className="section-subtitle">{t.services.subtitle}</p>
          </div>
          
          <div className="services-grid">
            {t.services.list.map((item) => {
              const serviceData = t.services[item.key];
              return (
                <div key={item.key} className="service-card reveal reveal-fade-up">
                  <div className="service-icon"><i className={`fa-solid ${item.icon}`} aria-hidden="true"></i></div>
                  <h3 className="service-title">{serviceData.title}</h3>
                  <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                    <p className="service-desc" style={{ marginBottom: '12px', flexGrow: 0 }} dangerouslySetInnerHTML={{ __html: serviceData.desc }}></p>
                    {serviceData.subservices && serviceData.subservices.length > 0 && (serviceData.subservices.length > 1 || serviceData.subservices[0] !== serviceData.title) && (
                      <p className="service-subservices-para" style={{ fontSize: '0.85rem', marginTop: '4px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                        <strong style={{ color: 'var(--primary)', fontWeight: '600' }}>{t.services.subservicesLabel || 'Services'}: </strong>
                        {serviceData.subservices.join(', ')}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 8. Why Choose Us Section */}
      <section id="why-choose-us">
        <div className="container">
          <div className="section-header reveal reveal-fade-up">
            <span className="section-badge">{t.whyUs.badge}</span>
            <h2 className="section-title">{t.whyUs.title}</h2>
            <p className="section-subtitle">{t.whyUs.subtitle}</p>
          </div>
          
          <div className="why-grid">
            <div className="why-card reveal reveal-fade-up">
              <div className="why-card-icon"><i className="fa-solid fa-computer" aria-hidden="true"></i></div>
              <h4>{t.whyUs.card1Title}</h4>
              <p>{t.whyUs.card1Text}</p>
            </div>
            <div className="why-card reveal reveal-fade-up">
              <div className="why-card-icon"><i className="fa-solid fa-certificate" aria-hidden="true"></i></div>
              <h4>{t.whyUs.card2Title}</h4>
              <p>{t.whyUs.card2Text}</p>
            </div>
            <div className="why-card reveal reveal-fade-up">
              <div className="why-card-icon"><i className="fa-solid fa-hand-holding-dollar" aria-hidden="true"></i></div>
              <h4>{t.whyUs.card3Title}</h4>
              <p>{t.whyUs.card3Text}</p>
            </div>
            <div className="why-card reveal reveal-fade-up">
              <div className="why-card-icon"><i className="fa-solid fa-sliders" aria-hidden="true"></i></div>
              <h4>{t.whyUs.card4Title}</h4>
              <p>{t.whyUs.card4Text}</p>
            </div>
            <div className="why-card reveal reveal-fade-up">
              <div className="why-card-icon"><i className="fa-solid fa-couch" aria-hidden="true"></i></div>
              <h4>{t.whyUs.card5Title}</h4>
              <p>{t.whyUs.card5Text}</p>
            </div>
            <div className="why-card reveal reveal-fade-up">
              <div className="why-card-icon"><i className="fa-solid fa-calendar-check" aria-hidden="true"></i></div>
              <h4>{t.whyUs.card6Title}</h4>
              <p>{t.whyUs.card6Text}</p>
            </div>
          </div>
        </div>
      </section>

      {/* 9. FAQ Section */}
      <section id="faq">
        <div className="container">
          <div className="section-header reveal reveal-fade-up">
            <span className="section-badge">{t.faq.badge}</span>
            <h2 className="section-title">{t.faq.title}</h2>
            <p className="section-subtitle">{t.faq.subtitle}</p>
          </div>
          
          <div className="faq-container reveal reveal-fade-up">
            {faqData.map((item, index) => {
              const isActive = activeFaq === index;
              return (
                <div key={index} className={`faq-item ${isActive ? 'active' : ''}`}>
                  <button 
                    className="faq-question-btn" 
                    aria-expanded={isActive ? 'true' : 'false'}
                    onClick={() => toggleFaq(index)}
                  >
                    {item.question}
                    <span className="faq-icon-indicator" aria-hidden="true">
                      <i className="fa-solid fa-chevron-down"></i>
                    </span>
                  </button>
                  <div 
                    ref={el => faqRefs.current[index] = el}
                    className="faq-answer-panel" 
                    role="region"
                    style={{ 
                      maxHeight: isActive ? `${faqRefs.current[index]?.scrollHeight}px` : '0px'
                    }}
                  >
                    <div className="faq-answer-content">
                      {item.answer}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 10. Schedule Visit CTA Section */}
      <section className="cta">
        <div className="container">
          <div className="cta-banner reveal reveal-scale-in">
            <h2>{t.cta.title}</h2>
            <p>{t.cta.subtitle}</p>
          </div>
        </div>
      </section>

      {/* 11. Contact Section */}
      <section id="contact">
        <div className="container">
          <div className="section-header reveal reveal-fade-up">
            <span className="section-badge">{t.contact.badge}</span>
            <h2 className="section-title">{t.contact.title}</h2>
            <p className="section-subtitle">{t.contact.subtitle}</p>
          </div>
          
          <div className="contact-grid">
            <div className="contact-info-col reveal reveal-fade-right">
              <a 
                href="https://maps.google.com/?q=Surakshya+Polyclinic,+Beside+Style+Bazar,+Ganga+Ghosh+Building,+Raghunathganj,+Murshidabad,+West+Bengal+-+742225" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="info-box-link"
              >
                <div className="info-box">
                  <div className="info-box-icon"><i className="fa-solid fa-map-location-dot" aria-hidden="true"></i></div>
                  <div className="info-box-details">
                    <h4>{t.contact.addressTitle}</h4>
                    <p>{t.contact.addressLine1}<br />{t.contact.addressLine2}</p>
                    <span className="view-map-link">
                      {t.contact.viewMap} <i className="fa-solid fa-arrow-up-right-from-square"></i>
                    </span>
                  </div>
                </div>
              </a>
              
              <div className="info-box">
                <div className="info-box-icon"><i className="fa-solid fa-clock" aria-hidden="true"></i></div>
                <div className="info-box-details">
                  <h4>{t.contact.timingsTitle}</h4>
                  <p>{t.contact.timingsLine1}<br />{t.contact.timingsLine2}</p>
                </div>
              </div>

              <div className="info-box">
                <div className="info-box-icon"><i className="fa-solid fa-headset" aria-hidden="true"></i></div>
                <div className="info-box-details">
                  <h4>{t.contact.quickContactTitle}</h4>
                  <p><strong>{t.contact.phoneLabel}</strong> <a href="tel:+919674163040">+91 9674163040</a><br /><strong>{t.contact.emailLabel}</strong> <a href="mailto:avijitchoudhuryent79@gmail.com">avijitchoudhuryent79@gmail.com</a></p>
                </div>
              </div>
            </div>
            
            <div className="contact-map-col reveal reveal-fade-left">
              <div className="map-placeholder">
                <iframe 
                  src="https://maps.google.com/maps?q=Surakshya+Polyclinic,+Beside+Style+Bazar,+Ganga+Ghosh+Building,+Raghunathganj,+West+Bengal+742225&t=&z=16&ie=UTF8&iwloc=&output=embed" 
                  allowFullScreen
                  loading="lazy" 
                  referrerPolicy="no-referrer-when-downgrade" 
                  title="Baak o Shrobon Kendra Location Map"
                ></iframe>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 12. Footer */}
      <footer>
        <div className="container footer-grid">
          <div className="footer-col-about">
            <a href="#home" className="logo" style={{ marginBottom: '20px' }}>
              <img src="logo.png" alt="Baak o Shrobon Kendra - Hearing, Nose & Speaking Centre" className="logo-img footer-logo-img" />
            </a>
            <p>{t.footer.aboutText}</p>
          </div>
          
          <div>
            <h4 className="footer-col-title">{t.footer.quickLinksTitle}</h4>
            <div className="footer-links">
              <a href="#home">{t.footer.linkHome}</a>
              <a href="#about">{t.footer.linkAbout}</a>
              <a href="#doctor">{t.footer.linkDoctor}</a>
              <a href="#services">{t.footer.linkServices}</a>
              <a href="#why-choose-us">{t.footer.linkWhyUs}</a>
              <a href="#faq">{t.footer.linkFaq}</a>
              <a href="#contact">{t.footer.linkContact}</a>
            </div>
          </div>
        
          <div>
            <h4 className="footer-col-title">{t.footer.servicesTitle}</h4>
            <div className="footer-links">
              <a href="#services">{t.footer.serviceEnt}</a>
              <a href="#services">{t.footer.serviceHearing}</a>
              <a href="#services">{t.footer.serviceEndoscopy}</a>
              <a href="#services">{t.footer.serviceHearingAid}</a>
              <a href="#services">{t.footer.serviceSpeech}</a>
              <a href="#services">{t.footer.serviceVestibular}</a>
              <a href="#services">{t.footer.serviceOT}</a>
              <a href="#services">{t.footer.servicePsych}</a>
            </div>
          </div>
        </div>
        
        <div className="container footer-bottom">
          <p className="footer-copyright-text">{t.footer.copyright}</p>
          <div className="footer-developer">
            <span className="developer-prefix">{t.footer.developedBy}</span>
            <a 
              href="https://maple-site-sandy.vercel.app/" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="developer-badge"
              title="Maple Korporation"
            >
              <i className="fa-solid fa-code developer-code-icon" aria-hidden="true"></i>
              <span className="developer-name">Maple Korporation</span>
              <i className="fa-solid fa-arrow-up-right-from-square developer-external-icon" aria-hidden="true"></i>
            </a>
          </div>
        </div>
      </footer>
        </>
      )}

      {/* Login / Registration Page */}
      {view === 'registration' && !isAuthenticated && (
        <div className="login-page-container">
          <div className="blob-container" aria-hidden="true">
            <div className="blob blob-1"></div>
            <div className="blob blob-2"></div>
            <div className="blob blob-3"></div>
          </div>
          <div className="login-card">
            <div className="login-header">
              <div className="login-logo-wrapper">
                <img src="logo.png" alt="Baak o Shrobon Kendra" className="login-logo-img" />
              </div>
              <h2>Receptionist Portal</h2>
              <p>Sign in to access the booking system</p>
            </div>
            
            <form className="login-form" onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.target);
              handleLogin(formData.get('username'), formData.get('password'));
            }}>
              <div className="form-group">
                <label className="form-label" htmlFor="login-username">Username</label>
                <div className="login-input-wrapper">
                  <i className="fa-solid fa-user"></i>
                  <input 
                    id="login-username"
                    type="text" 
                    name="username"
                    className="form-control login-input" 
                    placeholder="Enter username"
                    required
                    autoFocus
                  />
                </div>
              </div>
              
              <div className="form-group">
                <label className="form-label" htmlFor="login-password">Password</label>
                <div className="login-input-wrapper" style={{ position: 'relative' }}>
                  <i className="fa-solid fa-lock"></i>
                  <input 
                    id="login-password"
                    type={showPassword ? "text" : "password"} 
                    name="password"
                    className="form-control login-input" 
                    placeholder="Enter password"
                    required
                  />
                  <span 
                    onClick={() => setShowPassword(!showPassword)}
                    style={{ cursor: 'pointer', position: 'absolute', right: '15px', left: 'auto', zIndex: 10, display: 'flex', alignItems: 'center', pointerEvents: 'auto', padding: '5px' }}
                  >
                    <i className={`fa-solid ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`} style={{ color: 'var(--text-secondary)', position: 'static', left: 'auto' }}></i>
                  </span>
                </div>
              </div>
              
              {authError && (
                <div className="login-error">
                  <i className="fa-solid fa-triangle-exclamation"></i>
                  <span>{authError}</span>
                </div>
              )}
              
              <button type="submit" className="btn btn-primary login-submit-btn">
                <i className="fa-solid fa-right-to-bracket"></i> Sign In
              </button>
              
              <div className="login-footer-text">
                <a href="#/" onClick={() => navigate('')}>
                  <i className="fa-solid fa-arrow-left"></i> Back to Home
                </a>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Admin Login Page */}
      {view === 'admin-login' && !isAdminAuthenticated && (
        <div className="login-page-container admin-login-page">
          <div className="blob-container" aria-hidden="true">
            <div className="blob blob-1"></div>
            <div className="blob blob-2"></div>
            <div className="blob blob-3"></div>
          </div>
          <div className="login-card admin-login-card">
            <div className="login-header">
              <div className="admin-login-icon-wrapper">
                <i className="fa-solid fa-shield-halved"></i>
              </div>
              <h2>Admin Dashboard</h2>
              <p>Authorized personnel only</p>
            </div>
            
            <form className="login-form" onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.target);
              handleAdminLogin(formData.get('username'), formData.get('password'));
            }}>
              <div className="form-group">
                <label className="form-label" htmlFor="admin-login-username">Admin Username</label>
                <div className="login-input-wrapper">
                  <i className="fa-solid fa-user-shield"></i>
                  <input 
                    id="admin-login-username"
                    type="text" 
                    name="username"
                    className="form-control login-input" 
                    placeholder="Enter admin username"
                    required
                    autoFocus
                  />
                </div>
              </div>
              
              <div className="form-group">
                <label className="form-label" htmlFor="admin-login-password">Password</label>
                <div className="login-input-wrapper" style={{ position: 'relative' }}>
                  <i className="fa-solid fa-key"></i>
                  <input 
                    id="admin-login-password"
                    type={showAdminPassword ? "text" : "password"} 
                    name="password"
                    className="form-control login-input" 
                    placeholder="Enter admin password"
                    required
                  />
                  <span 
                    onClick={() => setShowAdminPassword(!showAdminPassword)}
                    style={{ cursor: 'pointer', position: 'absolute', right: '15px', left: 'auto', zIndex: 10, display: 'flex', alignItems: 'center', pointerEvents: 'auto', padding: '5px' }}
                  >
                    <i className={`fa-solid ${showAdminPassword ? 'fa-eye-slash' : 'fa-eye'}`} style={{ color: 'var(--text-secondary)', position: 'static', left: 'auto' }}></i>
                  </span>
                </div>
              </div>
              
              {adminAuthError && (
                <div className="login-error">
                  <i className="fa-solid fa-triangle-exclamation"></i>
                  <span>{adminAuthError}</span>
                </div>
              )}
              
              <button type="submit" className="btn btn-primary login-submit-btn admin-login-btn">
                <i className="fa-solid fa-right-to-bracket"></i> Access Dashboard
              </button>
              
              <div className="login-footer-text">
                <a href="#/" onClick={() => navigate('')}>
                  <i className="fa-solid fa-arrow-left"></i> Back to Home
                </a>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Receptionist Portal Area */}
      {view === 'receptionist' && (
        <div className="portal-container animate-fade-in">
          {/* Sidebar */}
          <aside className="portal-sidebar">
            <div className="portal-sidebar-title">
              <i className="fa-solid fa-clinic-medical"></i>
              <span>Reception Desk</span>
            </div>
            
            <div className="portal-sidebar-nav">
              <button 
                className={`portal-tab-btn ${portalTab === 'new-booking' ? 'active' : ''}`}
                onClick={() => setPortalTab('new-booking')}
              >
                <i className="fa-solid fa-calendar-plus"></i>
                <span>New Booking</span>
              </button>
              <button 
                className={`portal-tab-btn ${portalTab === 'patients' ? 'active' : ''}`}
                onClick={() => setPortalTab('patients')}
              >
                <i className="fa-solid fa-users"></i>
                <span>Patients</span>
              </button>
              <button 
                className={`portal-tab-btn ${portalTab === 'bookings' ? 'active' : ''}`}
                onClick={() => setPortalTab('bookings')}
              >
                <i className="fa-solid fa-file-invoice-dollar"></i>
                <span>Invoices</span>
              </button>
            </div>

            <div className="portal-sidebar-footer">
              <div className="portal-user-badge">
                <div className="portal-user-avatar">
                  <i className="fa-solid fa-user-tie"></i>
                </div>
                <div className="portal-user-info">
                  <span className="portal-user-name">Reception Desk</span>
                  <span className="portal-user-status">
                    <span className="status-dot"></span> Online
                  </span>
                </div>
              </div>
              <button 
                className="portal-exit-btn-new"
                title="Exit Portal"
                onClick={handleLogout}
              >
                <i className="fa-solid fa-right-from-bracket"></i>
                <span>Exit Portal</span>
              </button>
            </div>
          </aside>

          {/* Main Content Area */}
          <main className="portal-main">
            {portalTab === 'new-booking' && (
              <div className="portal-tab-content">
                <div className="portal-view-header">
                  <h2 className="portal-view-title">New Patient Booking</h2>
                  {(selectedPatient || selectedServices.length > 0 || isNewPatientForm || searchQuery.trim()) && (
                    <button 
                      type="button"
                      className="booking-clear-btn"
                      onClick={handleClearBookingForm}
                    >
                      <i className="fa-solid fa-rotate-left"></i>
                      <span>Clear All Fields</span>
                    </button>
                  )}
                </div>

                {/* Step 1: Find/Select Patient */}
                <div className="portal-card">
                  <h3 className="portal-card-title">
                    <i className="fa-solid fa-magnifying-glass"></i> Find Patient
                  </h3>
                  <p style={{ marginBottom: '15px', color: 'var(--text-secondary)' }}>
                    Search by patient name or phone number. If not found, you can register them as a new patient.
                  </p>
                  
                  <div className="search-box-wrapper">
                    <input 
                      type="text" 
                      className="form-control" 
                      placeholder="Type name or phone number..." 
                      value={searchQuery}
                      onChange={handleSearchChange}
                      style={{ flex: '1', minWidth: 0 }}
                    />
                    {searchQuery.trim() && (
                      <button 
                        type="button" 
                        className="btn btn-primary"
                        style={{ minWidth: '130px', padding: '8px 14px', fontSize: '0.82rem', gap: '6px', flexShrink: 0 }}
                        onClick={triggerNewPatientRegister}
                      >
                        <i className="fa-solid fa-user-plus"></i> Add New Patient
                      </button>
                    )}
                  </div>

                  {searchResults.length > 0 && (
                    <div className="search-results-list">
                      {searchResults.map(p => (
                        <div 
                          key={p.id} 
                          className="search-result-item"
                          onClick={() => handleSelectPatient(p)}
                        >
                          <div>
                            <strong>{p.name}</strong> - {p.phone}
                          </div>
                          <span style={{ fontSize: '0.85rem', color: 'var(--primary)' }}>
                            {p.age} Yrs / {p.gender} | Select <i className="fa-solid fa-chevron-right"></i>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {searchQuery.trim() && searchResults.length === 0 && !selectedPatient && !isNewPatientForm && (
                    <div className="portal-alert portal-alert-warning">
                      <i className="fa-solid fa-triangle-exclamation"></i>
                      <div>
                        No matching patients found. 
                        <button 
                          className="btn-link" 
                          style={{ marginLeft: '10px', fontWeight: 'bold', color: 'inherit', textDecoration: 'underline', border: 'none', background: 'none', cursor: 'pointer' }}
                          onClick={triggerNewPatientRegister}
                        >
                          Click here to register "{searchQuery}" as a new patient.
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Display Selected Patient */}
                  {selectedPatient && (
                    <div className="selected-patient-card">
                      <div className="selected-patient-info">
                        <h4>Selected Patient: {selectedPatient.name}</h4>
                        <p>
                          <strong>Phone:</strong> {selectedPatient.phone} | <strong>Age/Gender:</strong> {selectedPatient.age} Yrs / {selectedPatient.gender}
                        </p>
                        {selectedPatient.address && <p><strong>Address:</strong> {selectedPatient.address}</p>}
                      </div>
                      <button 
                        className="btn" 
                        style={{ color: 'red', border: '1.5px solid red', padding: '6px 12px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', background: 'transparent' }}
                        onClick={() => setSelectedPatient(null)}
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>

                {/* Step 2: Register New Patient Form */}
                {isNewPatientForm && (
                  <div className="portal-card" style={{ borderLeft: '4px solid var(--primary)' }}>
                    <h3 className="portal-card-title">
                      <i className="fa-solid fa-user-plus"></i> Register New Patient
                    </h3>
                    <div className="form-group-grid">
                      <div className="form-group">
                        <label className="form-label">Full Name *</label>
                        <input 
                          type="text" 
                          className="form-control" 
                          placeholder="Patient's Full Name"
                          value={newPatientDetails.name}
                          onChange={(e) => setNewPatientDetails({...newPatientDetails, name: e.target.value})}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Phone Number *</label>
                        <input 
                          type="tel" 
                          className="form-control" 
                          placeholder="10-digit Mobile Number"
                          value={newPatientDetails.phone}
                          onChange={(e) => setNewPatientDetails({...newPatientDetails, phone: e.target.value})}
                          required
                        />
                      </div>
                    </div>
                    <div className="form-group-grid">
                      <div className="form-group">
                        <label className="form-label">Age (Years) *</label>
                        <input 
                          type="number" 
                          className="form-control" 
                          placeholder="e.g. 28"
                          value={newPatientDetails.age}
                          onChange={(e) => setNewPatientDetails({...newPatientDetails, age: e.target.value})}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Gender *</label>
                        <select 
                          className="form-control"
                          value={newPatientDetails.gender}
                          onChange={(e) => setNewPatientDetails({...newPatientDetails, gender: e.target.value})}
                        >
                          <option value="Male">Male</option>
                          <option value="Female">Female</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Address</label>
                      <input 
                        type="text" 
                        className="form-control" 
                        placeholder="Patient's Residential Address"
                        value={newPatientDetails.address}
                        onChange={(e) => setNewPatientDetails({...newPatientDetails, address: e.target.value})}
                      />
                    </div>
                    <div style={{ marginTop: '15px' }}>
                      <button 
                        type="button" 
                        className="btn" 
                        style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-color)', padding: '8px 16px', borderRadius: 'var(--radius-sm)', marginRight: '10px', cursor: 'pointer', background: 'transparent' }}
                        onClick={() => setIsNewPatientForm(false)}
                      >
                        Cancel
                      </button>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        * Details will be saved on booking.
                      </span>
                    </div>
                  </div>
                )}

                {/* Step 3: Select Services / Tests */}
                <div className="portal-card">
                  <h3 className="portal-card-title">
                    <i className="fa-solid fa-briefcase-medical"></i> Select Services & Diagnostic Tests
                  </h3>
                  <p style={{ marginBottom: '20px', color: 'var(--text-secondary)' }}>
                    Select the required diagnostics or therapy sessions. Multiple services can be selected.
                  </p>
                  
                  <ServiceMultiSelect
                    catalogServices={catalogServices}
                    selectedServices={selectedServices}
                    onToggleService={handleToggleService}
                    onPriceChange={handleServicePriceChange}
                    onClearAll={() => setSelectedServices([])}
                  />
                </div>

                {/* Step 4: Referral & Payment */}
                <div className="portal-card">
                  <h3 className="portal-card-title">
                    <i className="fa-solid fa-file-invoice"></i> Referral & Payment Details
                  </h3>
                  <div className="form-group-grid">
                    <div className="form-group">
                      <label className="form-label">Referred By</label>
                      <input 
                        type="text" 
                        className="form-control" 
                        placeholder="Referred Doctor's Name (e.g. Dr. A. Chowdhury)" 
                        value={referredBy}
                        onChange={(e) => setReferredBy(e.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Payment Mode</label>
                      <select 
                        className="form-control"
                        value={paymentMode}
                        onChange={(e) => setPaymentMode(e.target.value)}
                      >
                        <option value="UPI">UPI / GPay / PhonePe</option>
                        <option value="Cash">Cash</option>
                        <option value="Card">Debit / Credit Card</option>
                        <option value="Net Banking">Net Banking</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Step 5: Billing Summary & Book Button */}
                <div className="portal-card" style={{ background: 'rgba(var(--primary-rgb), 0.01)' }}>
                  <h3 className="portal-card-title">
                    <i className="fa-solid fa-calculator"></i> Billing Summary
                  </h3>
                  
                  {selectedServices.length === 0 ? (
                    <p style={{ fontStyle: 'italic', color: 'var(--text-secondary)' }}>No services selected. Choose services above to compute billing.</p>
                  ) : (
                    <>
                      <div className="billing-table-wrapper">
                        <table className="billing-table">
                          <thead>
                            <tr>
                              <th>Service Name</th>
                              <th style={{ textAlign: 'right' }}>Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedServices.map(s => (
                              <tr key={s.id}>
                                <td>{s.name}</td>
                                <td style={{ textAlign: 'right' }}>₹{(s.customPrice ?? s.price).toLocaleString('en-IN')}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      
                      <div className="billing-calc-box">
                        <div className="billing-calc-row grand-total">
                          <span>Total Amount:</span>
                          <span>₹{selectedServices.reduce((acc, s) => acc + (s.customPrice ?? s.price), 0).toLocaleString('en-IN')}</span>
                        </div>
                      </div>

                      <div className="booking-submit-wrapper">
                        <button 
                          type="button"
                          className="booking-clear-btn"
                          onClick={handleClearBookingForm}
                        >
                          <i className="fa-solid fa-rotate-left"></i>
                          <span>Clear All</span>
                        </button>
                        <button 
                          onClick={handleSaveBooking}
                          className="booking-submit-btn"
                        >
                          <i className="fa-solid fa-receipt"></i>
                          <span>Complete & Generate Invoice</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {portalTab === 'patients' && (() => {
              const filteredPatients = patientsList.filter(p => 
                !searchQuery.trim() || 
                p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                p.phone.includes(searchQuery)
              );
              const maleCount = patientsList.filter(p => p.gender === 'Male').length;
              const femaleCount = patientsList.filter(p => p.gender === 'Female').length;
              const otherCount = patientsList.length - maleCount - femaleCount;
              const getInitials = (name) => {
                const parts = name.split(' ');
                return parts.length >= 2 
                  ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
                  : name.substring(0, 2).toUpperCase();
              };
              const avatarColors = ['#0F7EA8', '#2EC4B6', '#E76F51', '#8B5CF6', '#F59E0B', '#EC4899', '#10B981', '#6366F1'];
              const getAvatarColor = (name) => {
                let hash = 0;
                for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
                return avatarColors[Math.abs(hash) % avatarColors.length];
              };

              return (
              <div className="portal-tab-content animate-fade-in">
                {/* Stats Summary Cards */}
                <div className="patients-stats-row">
                  <div className="patients-stat-card patients-stat-total">
                    <div className="patients-stat-icon">
                      <i className="fa-solid fa-users"></i>
                    </div>
                    <div className="patients-stat-info">
                      <span className="patients-stat-number">{patientsList.length}</span>
                      <span className="patients-stat-label">{patientsList.length === 1 ? 'Total Patient' : 'Total Patients'}</span>
                    </div>
                  </div>
                  <div className="patients-stat-card patients-stat-male">
                    <div className="patients-stat-icon">
                      <i className="fa-solid fa-mars"></i>
                    </div>
                    <div className="patients-stat-info">
                      <span className="patients-stat-number">{maleCount}</span>
                      <span className="patients-stat-label">Male</span>
                    </div>
                  </div>
                  <div className="patients-stat-card patients-stat-female">
                    <div className="patients-stat-icon">
                      <i className="fa-solid fa-venus"></i>
                    </div>
                    <div className="patients-stat-info">
                      <span className="patients-stat-number">{femaleCount}</span>
                      <span className="patients-stat-label">Female</span>
                    </div>
                  </div>
                  <div className="patients-stat-card patients-stat-other">
                    <div className="patients-stat-icon">
                      <i className="fa-solid fa-user-group"></i>
                    </div>
                    <div className="patients-stat-info">
                      <span className="patients-stat-number">{otherCount}</span>
                      <span className="patients-stat-label">Other</span>
                    </div>
                  </div>
                </div>

                {/* Header with Search */}
                <div className="patients-header-bar">
                  <div className="patients-header-left">
                    <h2 className="portal-view-title">
                      <i className="fa-solid fa-address-book" style={{ color: 'var(--primary)', marginRight: '10px', fontSize: '1.4rem' }}></i>
                      Patients Directory
                    </h2>
                    <span className="patients-count-badge">{filteredPatients.length} {filteredPatients.length === 1 ? 'record' : 'records'} found</span>
                  </div>
                  <div className="patients-search-bar">
                    <i className="fa-solid fa-magnifying-glass patients-search-icon"></i>
                    <input 
                      type="text" 
                      className="patients-search-input" 
                      placeholder="Search by name or phone..." 
                      value={searchQuery}
                      onChange={handleSearchChange}
                    />
                    {searchQuery && (
                      <button 
                        className="patients-search-clear"
                        onClick={() => { setSearchQuery(''); setSearchResults([]); }}
                        aria-label="Clear search"
                      >
                        <i className="fa-solid fa-xmark"></i>
                      </button>
                    )}
                  </div>
                </div>

                {/* Patient Table or Empty State */}
                {filteredPatients.length === 0 ? (
                  <div className="patients-empty-state">
                    <div className="patients-empty-icon">
                      <i className="fa-solid fa-user-slash"></i>
                    </div>
                    <h3>No Patients Found</h3>
                    <p>
                      {searchQuery.trim() 
                        ? `No records match "${searchQuery}". Try a different name or phone number.`
                        : 'No patients have been registered yet. Create a new booking to add your first patient.'
                      }
                    </p>
                    {searchQuery.trim() && (
                      <button 
                        className="patients-empty-btn"
                        onClick={() => { setSearchQuery(''); setSearchResults([]); }}
                      >
                        <i className="fa-solid fa-arrow-rotate-left"></i> Clear Search
                      </button>
                    )}
                    {!searchQuery.trim() && (
                      <button 
                        className="patients-empty-btn"
                        onClick={() => setPortalTab('new-booking')}
                      >
                        <i className="fa-solid fa-plus"></i> New Booking
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="patients-table-card">
                    {/* Desktop Table View */}
                    <div className="portal-table-wrapper patients-desktop-view">
                      <table className="portal-table patients-table">
                        <thead>
                          <tr>
                            <th style={{ width: '60px' }}></th>
                            <th>Patient Name</th>
                            <th>Phone</th>
                            <th>Age</th>
                            <th>Gender</th>
                            <th>Address</th>
                            <th style={{ width: '60px', textAlign: 'center' }}>ID</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredPatients.map(p => (
                            <tr key={p.id} className="patients-table-row">
                              <td>
                                <div 
                                  className="patient-avatar"
                                  style={{ background: getAvatarColor(p.name) }}
                                >
                                  {getInitials(p.name)}
                                </div>
                              </td>
                              <td>
                                <div className="patient-name-cell">
                                  <strong>{p.name}</strong>
                                </div>
                              </td>
                              <td>
                                <span className="patient-phone-cell">
                                  <i className="fa-solid fa-phone" style={{ fontSize: '0.7rem', opacity: 0.5, marginRight: '6px' }}></i>
                                  {p.phone}
                                </span>
                              </td>
                              <td>
                                <span className="patient-age-cell">{p.age} yrs</span>
                              </td>
                              <td>
                                <span className={`patient-gender-badge ${p.gender === 'Male' ? 'gender-male' : p.gender === 'Female' ? 'gender-female' : 'gender-other'}`}>
                                  <i className={`fa-solid ${p.gender === 'Male' ? 'fa-mars' : p.gender === 'Female' ? 'fa-venus' : 'fa-genderless'}`}></i>
                                  {p.gender}
                                </span>
                              </td>
                              <td>
                                <span className="patient-address-cell">{p.address || '—'}</span>
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                <code className="patient-id-badge">{p.id}</code>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile Card View */}
                    <div className="patients-mobile-view">
                      <div className="patient-cards-list">
                        {filteredPatients.map(p => (
                          <div className="patient-card" key={p.id}>
                            <div className="patient-card-header">
                              <div className="patient-card-identity">
                                <div 
                                  className="patient-avatar"
                                  style={{ background: getAvatarColor(p.name) }}
                                >
                                  {getInitials(p.name)}
                                </div>
                                <div className="patient-card-name-id">
                                  <span className="patient-card-name">{p.name}</span>
                                  <span className="patient-card-id">ID: {p.id}</span>
                                </div>
                              </div>
                              <span className={`patient-gender-badge ${p.gender === 'Male' ? 'gender-male' : p.gender === 'Female' ? 'gender-female' : 'gender-other'}`}>
                                <i className={`fa-solid ${p.gender === 'Male' ? 'fa-mars' : p.gender === 'Female' ? 'fa-venus' : 'fa-genderless'}`}></i>
                                {p.gender}
                              </span>
                            </div>
                            <div className="patient-card-details-grid">
                              <div className="patient-card-detail-item">
                                <span className="patient-card-detail-label">Phone</span>
                                <span className="patient-card-detail-value">
                                  <a href={`tel:${p.phone}`} className="patient-card-phone-link">
                                    <i className="fa-solid fa-phone"></i> {p.phone}
                                  </a>
                                </span>
                              </div>
                              <div className="patient-card-detail-item">
                                <span className="patient-card-detail-label">Age</span>
                                <span className="patient-card-detail-value">{p.age} Yrs</span>
                              </div>
                              {p.address && (
                                <div className="patient-card-detail-item full-width">
                                  <span className="patient-card-detail-label">Address</span>
                                  <span className="patient-card-detail-value">{p.address}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              );
            })()}

            {portalTab === 'bookings' && (
              <div className="portal-tab-content animate-fade-in">
                <div className="portal-view-header">
                  <h2 className="portal-view-title">Bookings & Billing History</h2>
                </div>

                {/* Desktop View Table */}
                <div className="bookings-desktop-view">
                  {bookingsList.length === 0 ? (
                    <div className="patients-empty-state">
                      <div className="patients-empty-icon">
                        <i className="fa-solid fa-file-invoice-dollar"></i>
                      </div>
                      <h3>No Bookings Found</h3>
                      <p>No bookings or invoices have been recorded yet.</p>
                    </div>
                  ) : (
                    <div className="admin-analytics-card" style={{ padding: 0, overflow: 'hidden' }}>
                      <div className="portal-table-wrapper">
                        <table className="portal-table bookings-table-premium">
                          <thead>
                            <tr>
                              <th><i className="fa-solid fa-calendar-day"></i> Date</th>
                              <th><i className="fa-solid fa-user"></i> Patient Name</th>
                              <th><i className="fa-solid fa-phone"></i> Contact</th>
                              <th><i className="fa-solid fa-briefcase-medical"></i> Services Billed</th>
                              <th><i className="fa-solid fa-circle-check"></i> Total Paid</th>
                              <th><i className="fa-solid fa-credit-card"></i> Payment</th>
                              <th style={{ textAlign: 'center' }}><i className="fa-solid fa-gear"></i> Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {paginatedPortalBookings.map(b => (
                              <tr key={b.id}>
                                <td>
                                  <span className="bookings-table-date">{b.date}</span>
                                </td>
                                <td>
                                  <div className="bookings-table-patient-name">
                                    <strong>{b.patientName}</strong>
                                  </div>
                                </td>
                                <td>
                                  <span className="bookings-table-phone">{b.patientPhone}</span>
                                </td>
                                <td>
                                  <div className="bookings-table-services-list">
                                    {b.services.map((s, idx) => (
                                      <span className="bookings-table-service-tag" key={idx}>
                                        {s.name}
                                      </span>
                                    ))}
                                  </div>
                                </td>
                                <td>
                                  <span className="bookings-table-total">₹{b.total.toLocaleString('en-IN')}</span>
                                </td>
                                <td>
                                  <span className={`payment-badge payment-badge-${b.paymentMode.toLowerCase().replace(/\s+/g, '')}`}>
                                    {b.paymentMode}
                                  </span>
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                  <button 
                                    className="bookings-table-action-btn"
                                    onClick={() => setActiveInvoice(b)}
                                  >
                                    <i className="fa-solid fa-receipt"></i> View Bill
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      
                      {/* Desktop Pagination */}
                      {totalPortalPages > 1 && (
                        <div className="pagination-container">
                          <div className="pagination-info">
                            Showing <strong>{startIndexPortal + 1}</strong> to <strong>{Math.min(startIndexPortal + ITEMS_PER_PAGE, sortedBookings.length)}</strong> of <strong>{sortedBookings.length}</strong> bookings
                          </div>
                          <div className="pagination-btn-group">
                            <button 
                              className="pagination-btn" 
                              onClick={() => setPortalBookingsPage(p => Math.max(p - 1, 1))} 
                              disabled={portalBookingsPage === 1}
                              title="Previous Page"
                            >
                              <i className="fa-solid fa-chevron-left"></i>
                            </button>
                            {getPaginationRange(portalBookingsPage, totalPortalPages).map((p, idx) => (
                              p === '...' ? (
                                <span key={`dots-${idx}`} className="pagination-dots">...</span>
                              ) : (
                                <button 
                                  key={p} 
                                  className={`pagination-btn ${portalBookingsPage === p ? 'active' : ''}`}
                                  onClick={() => setPortalBookingsPage(p)}
                                >
                                  {p}
                                </button>
                              )
                            ))}
                            <button 
                              className="pagination-btn" 
                              onClick={() => setPortalBookingsPage(p => Math.min(p + 1, totalPortalPages))} 
                              disabled={portalBookingsPage === totalPortalPages}
                              title="Next Page"
                            >
                              <i className="fa-solid fa-chevron-right"></i>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
    
                {/* Mobile View Cards */}
                <div className="bookings-mobile-view">
                  {bookingsList.length === 0 ? (
                    <div className="patients-empty-state">
                      <div className="patients-empty-icon">
                        <i className="fa-solid fa-file-invoice-dollar"></i>
                      </div>
                      <h3>No Bookings Found</h3>
                      <p>No bookings or invoices have been recorded yet.</p>
                    </div>
                  ) : (
                    <>
                      <div className="booking-history-cards-list">
                        {paginatedPortalBookings.map(b => (
                          <div className="booking-history-card" key={b.id}>
                            <div className="booking-card-header">
                              <span className="booking-card-id">Invoice {b.id}</span>
                              <span className="booking-card-payment-badge">{b.paymentMode}</span>
                            </div>
                            <div className="booking-card-body">
                              <div className="booking-card-info-row">
                                <span className="info-label">Date:</span>
                                <span className="info-value">{b.date}</span>
                              </div>
                              <div className="booking-card-info-row">
                                <span className="info-label">Patient:</span>
                                <span className="info-value"><strong>{b.patientName}</strong></span>
                              </div>
                              <div className="booking-card-info-row">
                                <span className="info-label">Contact:</span>
                                <span className="info-value">{b.patientPhone}</span>
                              </div>
                              <div className="booking-card-services-list">
                                <span className="services-title">Services Billed:</span>
                                <ul>
                                  {b.services.map((s, idx) => (
                                    <li key={idx}>
                                      <span className="srv-name">{s.name}</span>
                                      <span className="srv-price">₹{s.price.toLocaleString('en-IN')}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                            <div className="booking-card-footer">
                              <div className="booking-card-total">
                                <span className="total-label">Grand Total:</span>
                                <span className="total-amount">₹{b.total.toLocaleString('en-IN')}</span>
                              </div>
                              <button 
                                className="booking-card-action-btn"
                                onClick={() => setActiveInvoice(b)}
                              >
                                <i className="fa-solid fa-file-invoice"></i> View Invoice
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                      
                      {/* Mobile Pagination */}
                      {totalPortalPages > 1 && (
                        <div className="pagination-container pagination-card" style={{ marginTop: '16px' }}>
                          <div className="pagination-info">
                            Showing <strong>{startIndexPortal + 1}</strong> to <strong>{Math.min(startIndexPortal + ITEMS_PER_PAGE, sortedBookings.length)}</strong> of <strong>{sortedBookings.length}</strong> bookings
                          </div>
                          <div className="pagination-btn-group">
                            <button 
                              className="pagination-btn" 
                              onClick={() => setPortalBookingsPage(p => Math.max(p - 1, 1))} 
                              disabled={portalBookingsPage === 1}
                              title="Previous Page"
                            >
                              <i className="fa-solid fa-chevron-left"></i>
                            </button>
                            {getPaginationRange(portalBookingsPage, totalPortalPages).map((p, idx) => (
                              p === '...' ? (
                                <span key={`dots-${idx}`} className="pagination-dots">...</span>
                              ) : (
                                <button 
                                  key={p} 
                                  className={`pagination-btn ${portalBookingsPage === p ? 'active' : ''}`}
                                  onClick={() => setPortalBookingsPage(p)}
                                >
                                  {p}
                                </button>
                              )
                            ))}
                            <button 
                              className="pagination-btn" 
                              onClick={() => setPortalBookingsPage(p => Math.min(p + 1, totalPortalPages))} 
                              disabled={portalBookingsPage === totalPortalPages}
                              title="Next Page"
                            >
                              <i className="fa-solid fa-chevron-right"></i>
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </main>
        </div>
      )}

      {/* Admin Dashboard */}
      {view === 'admin' && (() => {
        const todayStr = new Date().toLocaleDateString('en-CA');
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth(); // 0-indexed

        // Helper to parse dates in local timezone to avoid timezone shifts
        const parseLocalDate = (dateStr) => {
          if (!dateStr) return new Date();
          const [year, month, day] = dateStr.split('-').map(Number);
          return new Date(year, month - 1, day);
        };

        // Determine boundaries for current week (Monday-indexed)
        const todayLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const dayOfWeek = todayLocal.getDay(); // 0 = Sunday, 1 = Monday...
        const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const mondayOfCurrentWeek = new Date(todayLocal);
        mondayOfCurrentWeek.setDate(todayLocal.getDate() + diffToMonday);
        
        // Sunday is the end of the week (Monday + 6 days)
        const sundayOfCurrentWeek = new Date(mondayOfCurrentWeek);
        sundayOfCurrentWeek.setDate(mondayOfCurrentWeek.getDate() + 6);

        const startOfCurrentMonth = new Date(currentYear, currentMonth, 1);
        const startOfCurrentYear = new Date(currentYear, 0, 1);

        // Filter bookings list based on the chosen period
        const filteredBookings = bookingsList.filter(b => {
          if (!b.date) return false;
          if (adminPeriodFilter === 'today') {
            return b.date === todayStr;
          }
          const bDate = parseLocalDate(b.date);
          if (adminPeriodFilter === 'month') {
            return bDate.getFullYear() === currentYear && bDate.getMonth() === currentMonth;
          }
          if (adminPeriodFilter === 'year') {
            return bDate.getFullYear() === currentYear;
          }
          return true; // 'all'
        });

        const totalRevenue = filteredBookings.reduce((acc, b) => acc + b.total, 0);
        const totalSubtotal = filteredBookings.reduce((acc, b) => acc + b.subtotal, 0);
        const totalGST = filteredBookings.reduce((acc, b) => acc + b.gst, 0);
        const avgRevenuePerBooking = filteredBookings.length > 0 ? Math.round(totalRevenue / filteredBookings.length) : 0;
        
        const todayBookings = bookingsList.filter(b => b.date === todayStr);
        const todayBookingsCount = todayBookings.length;
        const todayRevenue = todayBookings.reduce((acc, b) => acc + b.total, 0);
        const todayAvgBill = todayBookingsCount > 0 ? Math.round(todayRevenue / todayBookingsCount) : 0;
        
        const todayServicesMap = {};
        let todayTotalServicesCount = 0;
        todayBookings.forEach(b => {
          (b.services || []).forEach(s => {
            todayServicesMap[s.name] = (todayServicesMap[s.name] || 0) + 1;
            todayTotalServicesCount++;
          });
        });
        const todayTopServices = Object.entries(todayServicesMap).sort((a, b) => b[1] - a[1]);
        const maxTodayServiceCount = todayTopServices.length > 0 ? todayTopServices[0][1] : 1;
        
        const maleCount = patientsList.filter(p => p.gender === 'Male').length;
        const femaleCount = patientsList.filter(p => p.gender === 'Female').length;
        const otherGenderCount = patientsList.length - maleCount - femaleCount;

        const filteredPatientsList = patientsList.filter(p => {
          if (patientGenderFilter === 'All') return true;
          return p.gender === patientGenderFilter;
        });

        // Revenue by payment mode (dynamically calculated for filteredBookings)
        const revenueByPayment = filteredBookings.reduce((acc, b) => {
          const mode = b.paymentMode || 'Other';
          acc[mode] = (acc[mode] || 0) + b.total;
          return acc;
        }, {});

        // Revenue by service (dynamically calculated for filteredBookings)
        const revenueByService = {};
        filteredBookings.forEach(b => {
          b.services.forEach(s => {
            revenueByService[s.name] = (revenueByService[s.name] || 0) + s.price;
          });
        });
        const sortedServiceRevenue = Object.entries(revenueByService).sort((a, b) => b[1] - a[1]);
        const maxServiceRevenue = sortedServiceRevenue.length > 0 ? sortedServiceRevenue[0][1] : 1;

        // Revenue by date (dynamically calculated for filteredBookings)
        const revenueByDate = filteredBookings.reduce((acc, b) => {
          acc[b.date] = (acc[b.date] || 0) + b.total;
          return acc;
        }, {});
        const sortedDateRevenue = Object.entries(revenueByDate).sort((a, b) => b[0].localeCompare(a[0]));

        // Unique patients who booked in this period
        const uniquePatientCount = [...new Set(filteredBookings.map(b => b.patientId))].length;

        // Referral breakdown (dynamically calculated for filteredBookings)
        const referralBreakdown = filteredBookings.reduce((acc, b) => {
          const ref = b.referredBy || 'Self';
          acc[ref] = (acc[ref] || 0) + 1;
          return acc;
        }, {});


        // 3. Patient Age Groups
        const ageGroups = {
          'Pediatric (0-12)': 0,
          'Teens & Young Adults (13-24)': 0,
          'Adults (25-59)': 0,
          'Seniors (60+)': 0
        };
        patientsList.forEach(p => {
          const age = parseInt(p.age);
          if (isNaN(age)) return;
          if (age <= 12) ageGroups['Pediatric (0-12)']++;
          else if (age <= 24) ageGroups['Teens & Young Adults (13-24)']++;
          else if (age <= 59) ageGroups['Adults (25-59)']++;
          else ageGroups['Seniors (60+)']++;
        });

        // 4. Day-of-Week Load & Weekday/Weekend (dynamically calculated for filteredBookings)
        const dayOfWeekNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const weekdayRevenue = dayOfWeekNames.reduce((acc, name) => { acc[name] = 0; return acc; }, {});
        const weekdayBookings = dayOfWeekNames.reduce((acc, name) => { acc[name] = 0; return acc; }, {});
        let weekdayTotalBookings = 0;
        let weekendTotalBookings = 0;
        let weekdayTotalRevenue = 0;
        let weekendTotalRevenue = 0;

        filteredBookings.forEach(b => {
          const dateObj = parseLocalDate(b.date);
          const dayIndex = dateObj.getDay();
          const dayName = dayOfWeekNames[dayIndex];
          weekdayRevenue[dayName] += b.total;
          weekdayBookings[dayName]++;
          
          if (dayIndex === 0 || dayIndex === 6) {
            weekendTotalBookings++;
            weekendTotalRevenue += b.total;
          } else {
            weekdayTotalBookings++;
            weekdayTotalRevenue += b.total;
          }
        });
        const maxDayBookings = Math.max(...Object.values(weekdayBookings), 1);

        // 5. Monthly Revenue Trend for comparative analytics (always shows full calendar year)
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const monthlyRevenueTrend = Array(12).fill(0).map((_, i) => ({
          month: monthNames[i],
          revenue: 0,
          bookings: 0
        }));

        bookingsList.forEach(b => {
          if (!b.date) return;
          const bDate = parseLocalDate(b.date);
          if (bDate.getFullYear() === currentYear) {
            const m = bDate.getMonth();
            monthlyRevenueTrend[m].revenue += b.total;
            monthlyRevenueTrend[m].bookings += 1;
          }
        });
        const maxMonthlyRevenue = Math.max(...monthlyRevenueTrend.map(m => m.revenue), 1);

        // 6. Daily bookings & revenue for current month (day 1..N)
        const daysInCurrentMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
        const dailyMonthBookings = Array.from({ length: daysInCurrentMonth }, (_, i) => ({
          day: i + 1,
          bookings: 0,
          revenue: 0
        }));
        bookingsList.forEach(b => {
          if (!b.date) return;
          const bDate = parseLocalDate(b.date);
          if (bDate.getFullYear() === currentYear && bDate.getMonth() === currentMonth) {
            const dayOfMonth = bDate.getDate();
            if (dayOfMonth >= 1 && dayOfMonth <= daysInCurrentMonth) {
              dailyMonthBookings[dayOfMonth - 1].bookings += 1;
              dailyMonthBookings[dayOfMonth - 1].revenue += (b.total || 0);
            }
          }
        });
        const maxDailyMonthBookings = Math.max(...dailyMonthBookings.map(d => d.bookings), 1);
        const maxDailyMonthRevenue = Math.max(...dailyMonthBookings.map(d => d.revenue), 1);
        const activeRevenueDaysCount = dailyMonthBookings.filter(d => d.revenue > 0).length;
        const bestRevenueDay = dailyMonthBookings.reduce((best, curr) => curr.revenue > best.revenue ? curr : best, { day: 0, revenue: 0, bookings: 0 });

        // Admin search state for patients & bookings
        const getInitials = (name) => {
          const parts = name.split(' ');
          return parts.length >= 2 
            ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
            : name.substring(0, 2).toUpperCase();
        };
        const avatarColors = ['#4F46E5', '#7C3AED', '#2563EB', '#0891B2', '#059669', '#D97706', '#DC2626', '#EC4899'];
        const getAvatarColor = (name) => {
          let hash = 0;
          for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
          return avatarColors[Math.abs(hash) % avatarColors.length];
        };

        return (
        <div className="admin-container animate-fade-in">
          {/* Admin Sidebar */}
          <aside className="admin-sidebar">
            <div className="admin-sidebar-title">
              <i className="fa-solid fa-chart-line"></i>
              <span>Admin Panel</span>
            </div>
            
            <div className="admin-sidebar-nav">
              <button 
                className={`admin-tab-btn ${adminTab === 'overview' ? 'active' : ''}`}
                onClick={() => setAdminTab('overview')}
              >
                <i className="fa-solid fa-gauge-high"></i>
                <span>Overview</span>
              </button>
              <button 
                className={`admin-tab-btn ${adminTab === 'patients' ? 'active' : ''}`}
                onClick={() => setAdminTab('patients')}
              >
                <i className="fa-solid fa-users"></i>
                <span>Patients</span>
              </button>
              <button 
                className={`admin-tab-btn ${adminTab === 'revenue' ? 'active' : ''}`}
                onClick={() => setAdminTab('revenue')}
              >
                <i className="fa-solid fa-indian-rupee-sign"></i>
                <span>Revenue</span>
              </button>
            </div>

            <div className="admin-sidebar-footer">
              <div className="admin-user-badge">
                <div className="admin-user-avatar">
                  <i className="fa-solid fa-user-gear"></i>
                </div>
                <div className="admin-user-info">
                  <span className="admin-user-name">Super Admin</span>
                  <span className="admin-user-status">
                    <span className="status-dot"></span> Online
                  </span>
                </div>
              </div>
            </div>
          </aside>

          {/* Admin Main Content */}
          <main className="admin-main">
            {/* ===== OVERVIEW TAB ===== */}
            {adminTab === 'overview' && (
              <div className="admin-tab-content animate-fade-in">
                <div className="admin-view-header">
                  <h2 className="admin-view-title">
                    <i className="fa-solid fa-gauge-high"></i> Dashboard Overview
                  </h2>
                  <span className="admin-date-badge">
                    <i className="fa-solid fa-calendar-day"></i> {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                  </span>
                </div>

                {/* Period Filter Selector */}
                <div className="admin-period-selector-row">
                  <div className="admin-period-selector">
                    <button className={`period-btn ${adminPeriodFilter === 'today' ? 'active' : ''}`} onClick={() => setAdminPeriodFilter('today')}>Today</button>
                    <button className={`period-btn ${adminPeriodFilter === 'month' ? 'active' : ''}`} onClick={() => setAdminPeriodFilter('month')}>This Month</button>
                    <button className={`period-btn ${adminPeriodFilter === 'year' ? 'active' : ''}`} onClick={() => setAdminPeriodFilter('year')}>This Year</button>
                  </div>
                </div>

                {/* KPI Row 1 - Primary Stats */}
                <div className="admin-kpi-grid">
                  <div className="admin-kpi-card kpi-bookings">
                    <div className="kpi-icon-bg"><i className="fa-solid fa-calendar-check"></i></div>
                    <div className="kpi-content">
                      <span className="kpi-value">{filteredBookings.length}</span>
                      <span className="kpi-label">{filteredBookings.length === 1 ? 'Total Booking' : 'Total Bookings'}</span>
                    </div>
                    <div className="kpi-footer">
                      <span><i className="fa-solid fa-clock"></i> {todayBookingsCount} today</span>
                    </div>
                  </div>

                  <div className="admin-kpi-card kpi-revenue">
                    <div className="kpi-icon-bg"><i className="fa-solid fa-indian-rupee-sign"></i></div>
                    <div className="kpi-content">
                      <span className="kpi-value">₹{totalRevenue.toLocaleString('en-IN')}</span>
                      <span className="kpi-label">Total Revenue</span>
                    </div>
                  </div>

                  <div className="admin-kpi-card kpi-avg">
                    <div className="kpi-icon-bg"><i className="fa-solid fa-chart-simple"></i></div>
                    <div className="kpi-content">
                      <span className="kpi-value">₹{avgRevenuePerBooking.toLocaleString('en-IN')}</span>
                      <span className="kpi-label">Avg. per Booking</span>
                    </div>
                    <div className="kpi-footer">
                      <span>{uniquePatientCount} unique patients</span>
                    </div>
                  </div>
                </div>



                {/* Revenue by Payment Mode */}
                <div className="admin-analytics-grid">
                  <div className="admin-analytics-card">
                    <h3 className="admin-analytics-title">
                      <i className="fa-solid fa-credit-card"></i> Revenue by Payment Mode
                    </h3>
                    <div className="admin-bar-chart">
                      {Object.entries(revenueByPayment).map(([mode, amount]) => (
                        <div className="admin-bar-row" key={mode}>
                          <div className="admin-bar-label">
                            <span className={`payment-mode-dot mode-${mode.toLowerCase().replace(/\s+/g, '')}`}></span>
                            {mode}
                          </div>
                          <div className="admin-bar-track">
                            <div 
                              className={`admin-bar-fill mode-fill-${mode.toLowerCase().replace(/\s+/g, '')}`}
                              style={{ width: `${totalRevenue > 0 ? (amount / totalRevenue * 100) : 0}%` }}
                            ></div>
                          </div>
                          <span className="admin-bar-value">₹{amount.toLocaleString('en-IN')}</span>
                        </div>
                      ))}
                      {Object.keys(revenueByPayment).length === 0 && (
                        <p className="admin-no-data">No payment data available</p>
                      )}
                    </div>
                  </div>

                  <div className="admin-analytics-card">
                    <h3 className="admin-analytics-title">
                      <i className="fa-solid fa-user-doctor"></i> Referral Sources
                    </h3>
                    <div className="admin-referral-list">
                      {Object.entries(referralBreakdown).sort((a, b) => b[1] - a[1]).map(([ref, count]) => (
                        <div className="admin-referral-item" key={ref}>
                          <span className="admin-referral-name">{ref}</span>
                          <span className="admin-referral-count">{count} booking{count > 1 ? 's' : ''}</span>
                        </div>
                      ))}
                      {Object.keys(referralBreakdown).length === 0 && (
                        <p className="admin-no-data">No referral data available</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Patient Flow & Booking Activity */}
                {/* Patient Flow & Clinical Performance */}
                <div className="admin-analytics-card" style={{ marginTop: '20px' }}>
                  <h3 className="admin-analytics-title">
                    <i className={adminPeriodFilter === 'today' ? "fa-solid fa-stethoscope" : "fa-solid fa-business-time"}></i> {
                      adminPeriodFilter === 'year' ? 'Monthly Booking Activity' : 
                      adminPeriodFilter === 'today' ? "Today's Clinical Performance & Services" :
                      'Patient Flow & Load'
                    }
                  </h3>
                  <div className="admin-flow-container">
                    {/* Left Split Cards */}
                    <div className="admin-flow-split">
                      {adminPeriodFilter === 'today' ? (
                        <>
                          <div className="flow-split-card split-weekday">
                            <div className="flow-split-icon"><i className="fa-solid fa-receipt"></i></div>
                            <div className="flow-split-details">
                              <h4>Average Bill Size</h4>
                              <div className="flow-split-stats">
                                <span><strong>₹{todayAvgBill.toLocaleString('en-IN')}</strong> / Visit</span>
                                <span><strong>{todayBookingsCount}</strong> Patient{todayBookingsCount === 1 ? '' : 's'}</span>
                              </div>
                            </div>
                          </div>
                          <div className="flow-split-card split-weekend">
                            <div className="flow-split-icon"><i className="fa-solid fa-notes-medical"></i></div>
                            <div className="flow-split-details">
                              <h4>Procedures & Tests</h4>
                              <div className="flow-split-stats">
                                <span><strong>{todayTotalServicesCount}</strong> Delivered</span>
                                <span>Top: <strong>{todayTopServices[0]?.[0] || '—'}</strong></span>
                              </div>
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flow-split-card split-weekday">
                            <div className="flow-split-icon"><i className="fa-solid fa-briefcase"></i></div>
                            <div className="flow-split-details">
                              <h4>Weekdays (Mon - Fri)</h4>
                              <div className="flow-split-stats">
                                <span><strong>{weekdayTotalBookings}</strong> Bookings</span>
                                <span><strong>₹{weekdayTotalRevenue.toLocaleString('en-IN')}</strong> Revenue</span>
                              </div>
                            </div>
                          </div>
                          <div className="flow-split-card split-weekend">
                            <div className="flow-split-icon"><i className="fa-solid fa-umbrella-beach"></i></div>
                            <div className="flow-split-details">
                              <h4>Weekends (Sat - Sun)</h4>
                              <div className="flow-split-stats">
                                <span><strong>{weekendTotalBookings}</strong> Bookings</span>
                                <span><strong>₹{weekendTotalRevenue.toLocaleString('en-IN')}</strong> Revenue</span>
                              </div>
                            </div>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Right View: Today Services vs Month Calendar vs Year Bar Chart */}
                    {adminPeriodFilter === 'today' ? (
                      <div className="admin-today-services-card" style={{ flex: '1 1 100%' }}>
                        <h4 className="weekly-bars-subtitle">Today's Service Demand & Volume</h4>
                        {todayTopServices.length === 0 ? (
                          <div className="admin-no-data" style={{ padding: '24px 0', textAlign: 'center' }}>
                            No clinical services recorded yet today.
                          </div>
                        ) : (
                          <div className="today-services-list">
                            {todayTopServices.map(([name, count]) => {
                              const pct = maxTodayServiceCount > 0 ? (count / maxTodayServiceCount) * 100 : 0;
                              return (
                                <div className="today-service-row" key={name}>
                                  <div className="today-service-info">
                                    <span className="today-service-name">{name}</span>
                                    <span className="today-service-count">{count} {count === 1 ? 'visit' : 'visits'}</span>
                                  </div>
                                  <div className="today-service-bar-track">
                                    <div 
                                      className="today-service-bar-fill" 
                                      style={{ width: `${pct}%` }}
                                    ></div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ) : adminPeriodFilter === 'month' ? (
                      <div className="admin-month-calendar" style={{ flex: '1 1 100%' }}>
                        <h4 className="weekly-bars-subtitle">
                          {monthNames[currentMonth]} {currentYear} — Booking Calendar
                        </h4>
                        <div className="month-cal-grid">
                          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                            <div className="month-cal-header" key={d}>{d}</div>
                          ))}
                          {/* Empty cells for offset */}
                          {Array.from({ length: new Date(currentYear, currentMonth, 1).getDay() }, (_, i) => (
                            <div className="month-cal-cell month-cal-empty" key={`empty-${i}`}></div>
                          ))}
                          {/* Day cells */}
                          {dailyMonthBookings.map(d => {
                            const isToday = d.day === now.getDate();
                            const intensity = maxDailyMonthBookings > 0 ? d.bookings / maxDailyMonthBookings : 0;
                            return (
                              <div 
                                className={`month-cal-cell ${d.bookings > 0 ? 'has-bookings' : ''} ${isToday ? 'is-today' : ''}`}
                                key={d.day}
                                title={`${d.bookings} bookings, ₹${d.revenue.toLocaleString('en-IN')} revenue`}
                              >
                                <span className="month-cal-day">{d.day}</span>
                                {d.bookings > 0 && (
                                  <span 
                                    className="month-cal-count"
                                    style={{ opacity: 0.5 + intensity * 0.5 }}
                                  >{d.bookings}</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="admin-weekly-bars" style={adminPeriodFilter === 'year' ? { flex: '1 1 100%' } : {}}>
                        <h4 className="weekly-bars-subtitle">
                          {adminPeriodFilter === 'year' ? 'Month-wise Bookings' : 'Daily Booking Activity'}
                        </h4>
                        <div className="weekly-bars-grid">
                          {adminPeriodFilter === 'year' ? (
                            monthlyRevenueTrend.map(m => {
                              const maxMonthBookings = Math.max(...monthlyRevenueTrend.map(mt => mt.bookings), 1);
                              const pct = maxMonthBookings > 0 ? (m.bookings / maxMonthBookings) * 85 : 0;
                              return (
                                <div className="weekly-bar-column" key={m.month}>
                                  <div className="weekly-bar-track">
                                    <div 
                                      className="weekly-bar-fill"
                                      style={{ height: `${pct}%` }}
                                      title={`${m.bookings} bookings, ₹${m.revenue.toLocaleString('en-IN')} revenue`}
                                    >
                                      {m.bookings > 0 && <span className="weekly-bar-count">{m.bookings}</span>}
                                    </div>
                                  </div>
                                  <span className="weekly-bar-label">{m.month}</span>
                                </div>
                              );
                            })
                          ) : (
                            dayOfWeekNames.map(dayName => {
                              const count = weekdayBookings[dayName];
                              const pct = maxDayBookings > 0 ? (count / maxDayBookings) * 85 : 0;
                              const amount = weekdayRevenue[dayName];
                              return (
                                <div className="weekly-bar-column" key={dayName}>
                                  <div className="weekly-bar-track">
                                    <div 
                                      className="weekly-bar-fill"
                                      style={{ height: `${pct}%` }}
                                      title={`${count} bookings, ₹${amount.toLocaleString('en-IN')} revenue`}
                                    >
                                      {count > 0 && <span className="weekly-bar-count">{count}</span>}
                                    </div>
                                  </div>
                                  <span className="weekly-bar-label">{dayName.substring(0, 3)}</span>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Recent Bookings Table */}
                <div className="admin-analytics-card" style={{ marginTop: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
                    <h3 className="admin-analytics-title" style={{ margin: 0 }}>
                      <i className="fa-solid fa-calendar-check"></i> {
                        adminPeriodFilter === 'today' ? "Today's Bookings" :
                        adminPeriodFilter === 'month' ? "This Month's Bookings" :
                        adminPeriodFilter === 'year' ? "This Year's Bookings" :
                        "Bookings"
                      }
                    </h3>
                    <div className="admin-booking-search-wrapper">
                      <i className="fa-solid fa-magnifying-glass admin-booking-search-icon"></i>
                      <input
                        type="text"
                        className="admin-booking-search-input"
                        placeholder="Booking ID..."
                        value={overviewBookingIdSearch}
                        onChange={(e) => setOverviewBookingIdSearch(e.target.value)}
                      />
                      {overviewBookingIdSearch && (
                        <button
                          type="button"
                          className="admin-booking-search-clear"
                          onClick={() => setOverviewBookingIdSearch('')}
                          title="Clear search"
                        >
                          <i className="fa-solid fa-xmark"></i>
                        </button>
                      )}
                    </div>
                  </div>

                  {(() => {
                    const sourceList = overviewBookingIdSearch.trim() ? bookingsList : filteredBookings;
                    const searchFiltered = sourceList.filter(b => {
                      if (!overviewBookingIdSearch.trim()) return true;
                      const rawQ = overviewBookingIdSearch.trim().toLowerCase();
                      
                      // 1. Patient Name
                      if (b.patientName && b.patientName.toLowerCase().includes(rawQ)) return true;
                      
                      // 2. Patient Phone
                      if (b.patientPhone && b.patientPhone.includes(rawQ)) return true;
                      if (b.phone && b.phone.includes(rawQ)) return true;

                      // 3. Service Name
                      if (b.services && b.services.some(s => s.name && s.name.toLowerCase().includes(rawQ))) return true;

                      // 4. Booking / Invoice ID matching
                      const idStr = String(b.id || '');
                      const idNum = parseInt(idStr, 10);

                      // Direct ID string match
                      if (idStr.toLowerCase().includes(rawQ)) return true;

                      // Clean prefix like 'bkg-', 'inv-', '#', 'invoice'
                      const cleanQ = rawQ.replace(/^(invoice|inv|bkg)[-\s]*/i, '').replace('#', '').trim();
                      if (cleanQ && idStr.toLowerCase().includes(cleanQ)) return true;
                      
                      // Padded ID match (e.g. '030')
                      const paddedId = idStr.padStart(3, '0');
                      if (cleanQ && paddedId.includes(cleanQ)) return true;

                      // Extract trailing digits (e.g. from '2026-030' or 'bkg-2026-030')
                      // Manual scan instead of a /\d+$/ regex to avoid O(n^2) backtracking on unanchored-start quantifiers.
                      let trailingDigitsStart = cleanQ.length;
                      while (trailingDigitsStart > 0 && cleanQ[trailingDigitsStart - 1] >= '0' && cleanQ[trailingDigitsStart - 1] <= '9') {
                        trailingDigitsStart--;
                      }
                      if (trailingDigitsStart < cleanQ.length) {
                        const searchNum = parseInt(cleanQ.slice(trailingDigitsStart), 10);
                        if (!isNaN(idNum) && !isNaN(searchNum) && idNum === searchNum) return true;
                      }

                      return false;
                    });

                    if (searchFiltered.length === 0) {
                      return (
                        <p className="admin-no-data">
                          {overviewBookingIdSearch.trim()
                            ? `No booking found matching "${overviewBookingIdSearch}".`
                            : 'No bookings recorded for this period.'}
                        </p>
                      );
                    }

                    const sortedFilteredBookings = [...searchFiltered].sort((a, b) => {
                      const idA = parseInt(a.id, 10);
                      const idB = parseInt(b.id, 10);
                      if (!isNaN(idA) && !isNaN(idB)) return idB - idA;
                      return new Date(b.date) - new Date(a.date);
                    });
                    const totalOverviewPages = Math.ceil(sortedFilteredBookings.length / 10);
                    const startIndexOverview = (overviewBookingsPage - 1) * 10;
                    const paginatedOverviewBookings = sortedFilteredBookings.slice(startIndexOverview, startIndexOverview + 10);

                    return (
                      <>
                        <div className="admin-table-wrapper">
                          <table className="admin-table">
                            <thead>
                              <tr>
                                <th>Date</th>
                                <th>Patient</th>
                                <th>Services</th>
                                <th>Total</th>
                                <th>Payment</th>
                                <th style={{ textAlign: 'center' }}>Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {paginatedOverviewBookings.map(b => (
                                <tr key={b.id}>
                                  <td>{b.date}</td>
                                  <td><strong>{b.patientName}</strong></td>
                                  <td>
                                    <div className="admin-services-tags">
                                      {b.services.map((s, idx) => (
                                        <span className="admin-service-tag" key={idx}>{s.name}</span>
                                      ))}
                                    </div>
                                  </td>
                                  <td><strong>₹{b.total.toLocaleString('en-IN')}</strong></td>
                                  <td>
                                    <span className={`admin-payment-badge mode-badge-${b.paymentMode.toLowerCase().replace(/\s+/g, '')}`}>
                                      {b.paymentMode}
                                    </span>
                                  </td>
                                  <td style={{ textAlign: 'center' }}>
                                    <button 
                                      className="admin-table-action-btn"
                                      onClick={() => setActiveInvoice(b)}
                                      title="View Bill / Invoice"
                                    >
                                      <i className="fa-solid fa-file-invoice"></i> View
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {totalOverviewPages > 1 && (
                          <div className="pagination-container" style={{ marginTop: '16px' }}>
                            <div className="pagination-info">
                              Showing <strong>{startIndexOverview + 1}</strong> to <strong>{Math.min(startIndexOverview + 10, searchFiltered.length)}</strong> of <strong>{searchFiltered.length}</strong> bookings
                            </div>
                            <div className="pagination-btn-group">
                              <button 
                                className="pagination-btn" 
                                onClick={() => setOverviewBookingsPage(p => Math.max(p - 1, 1))} 
                                disabled={overviewBookingsPage === 1}
                                title="Previous Page"
                              >
                                <i className="fa-solid fa-chevron-left"></i>
                              </button>
                              {getPaginationRange(overviewBookingsPage, totalOverviewPages).map((p, idx) => (
                                p === '...' ? (
                                  <span key={`dots-${idx}`} className="pagination-dots">...</span>
                                ) : (
                                  <button 
                                    key={p} 
                                    className={`pagination-btn ${overviewBookingsPage === p ? 'active' : ''}`}
                                    onClick={() => setOverviewBookingsPage(p)}
                                  >
                                    {p}
                                  </button>
                                )
                              ))}
                              <button 
                                className="pagination-btn" 
                                onClick={() => setOverviewBookingsPage(p => Math.min(p + 1, totalOverviewPages))} 
                                disabled={overviewBookingsPage === totalOverviewPages}
                                title="Next Page"
                              >
                                <i className="fa-solid fa-chevron-right"></i>
                              </button>
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* ===== PATIENTS TAB ===== */}
            {adminTab === 'patients' && (
              <div className="admin-tab-content animate-fade-in">
                <div className="admin-view-header">
                  <h2 className="admin-view-title">
                    <i className="fa-solid fa-address-book"></i> Patient Directory
                  </h2>
                  <span className="admin-count-badge">{patientsList.length} {patientsList.length === 1 ? 'patient' : 'patients'} registered</span>
                </div>

                {patientsList.length > 0 && (
                  <div className="admin-analytics-grid" style={{ marginBottom: '20px' }}>
                    {/* Age Demographics Card */}
                    <div className="admin-analytics-card">
                      <h3 className="admin-analytics-title">
                        <i className="fa-solid fa-cake-candles"></i> Patient Age Distribution
                      </h3>
                      <div className="admin-bar-chart">
                        {Object.entries(ageGroups).map(([group, count]) => {
                          const percentage = patientsList.length > 0 ? ((count / patientsList.length) * 100).toFixed(1) : 0;
                          return (
                            <div className="admin-bar-row" key={group}>
                              <div className="admin-bar-label" style={{ width: '220px' }}>{group}</div>
                              <div className="admin-bar-track">
                                <div 
                                  className="admin-bar-fill"
                                  style={{ width: `${percentage}%`, background: 'var(--primary)' }}
                                ></div>
                              </div>
                              <span className="admin-bar-value" style={{ minWidth: '80px', textAlign: 'right' }}>
                                {count} ({percentage}%)
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Gender Demographics Card */}
                    <div className="admin-analytics-card">
                      <h3 className="admin-analytics-title">
                        <i className="fa-solid fa-venus-mars"></i> Gender Breakdown
                      </h3>
                      <div className="admin-bar-chart">
                        <div className="admin-bar-row">
                          <div className="admin-bar-label" style={{ width: '120px' }}>
                            <i className="fa-solid fa-mars" style={{ color: '#2563EB', marginRight: '6px' }}></i> Male
                          </div>
                          <div className="admin-bar-track">
                            <div 
                              className="admin-bar-fill"
                              style={{ width: `${patientsList.length > 0 ? (maleCount / patientsList.length * 100) : 0}%`, background: '#2563EB' }}
                            ></div>
                          </div>
                          <span className="admin-bar-value" style={{ minWidth: '80px', textAlign: 'right' }}>
                            {maleCount} ({(patientsList.length > 0 ? (maleCount / patientsList.length * 100) : 0).toFixed(1)}%)
                          </span>
                        </div>
                        <div className="admin-bar-row">
                          <div className="admin-bar-label" style={{ width: '120px' }}>
                            <i className="fa-solid fa-venus" style={{ color: '#EC4899', marginRight: '6px' }}></i> Female
                          </div>
                          <div className="admin-bar-track">
                            <div 
                              className="admin-bar-fill"
                              style={{ width: `${patientsList.length > 0 ? (femaleCount / patientsList.length * 100) : 0}%`, background: '#EC4899' }}
                            ></div>
                          </div>
                          <span className="admin-bar-value" style={{ minWidth: '80px', textAlign: 'right' }}>
                            {femaleCount} ({(patientsList.length > 0 ? (femaleCount / patientsList.length * 100) : 0).toFixed(1)}%)
                          </span>
                        </div>
                        {otherGenderCount > 0 && (
                          <div className="admin-bar-row">
                            <div className="admin-bar-label" style={{ width: '120px' }}>
                              <i className="fa-solid fa-genderless" style={{ color: '#9CA3AF', marginRight: '6px' }}></i> Other
                            </div>
                            <div className="admin-bar-track">
                              <div 
                                className="admin-bar-fill"
                                style={{ width: `${patientsList.length > 0 ? (otherGenderCount / patientsList.length * 100) : 0}%`, background: '#9CA3AF' }}
                              ></div>
                            </div>
                            <span className="admin-bar-value" style={{ minWidth: '80px', textAlign: 'right' }}>
                              {otherGenderCount} ({(patientsList.length > 0 ? (otherGenderCount / patientsList.length * 100) : 0).toFixed(1)}%)
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}



                {patientsList.length === 0 ? (
                  <div className="admin-empty-state">
                    <i className="fa-solid fa-user-slash"></i>
                    <h3>No Patients Registered</h3>
                    <p>No patient records found in the system.</p>
                  </div>
                ) : filteredPatientsList.length === 0 ? (
                  <div className="admin-empty-state" style={{ padding: '60px 20px' }}>
                    <i className="fa-solid fa-filter-circle-xmark" style={{ fontSize: '3rem', color: 'var(--text-secondary)', marginBottom: '16px', opacity: 0.5 }}></i>
                    <h3>No Patients Found</h3>
                    <p>No registered patient records match the selected filter: <strong>{patientGenderFilter}</strong>.</p>
                  </div>
                ) : (
                  <div className="admin-analytics-card">
                    {/* Desktop Table View */}
                    <div className="admin-table-wrapper patients-desktop-view">
                      <table className="admin-table admin-patients-table">
                        <thead>
                          <tr>
                            <th style={{ width: '50px' }}></th>
                            <th>Name</th>
                            <th>Phone</th>
                            <th>Age</th>
                            <th>Gender</th>
                            <th>Address</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredPatientsList.map(p => (
                            <tr key={p.id}>
                              <td>
                                <div className="admin-avatar" style={{ background: getAvatarColor(p.name) }}>
                                  {getInitials(p.name)}
                                </div>
                              </td>
                              <td><strong>{p.name}</strong></td>
                              <td>
                                <span style={{ opacity: 0.7 }}>
                                  <i className="fa-solid fa-phone" style={{ fontSize: '0.7rem', marginRight: '5px' }}></i>
                                  {p.phone}
                                </span>
                              </td>
                              <td>{p.age} yrs</td>
                              <td>
                                <span className={`admin-gender-badge gender-${p.gender.toLowerCase()}`}>
                                  <i className={`fa-solid ${p.gender === 'Male' ? 'fa-mars' : p.gender === 'Female' ? 'fa-venus' : 'fa-genderless'}`}></i>
                                  {p.gender}
                                </span>
                              </td>
                              <td>{p.address || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile Card View */}
                    <div className="patients-mobile-view">
                      <div className="patient-cards-list">
                        {filteredPatientsList.map(p => (
                          <div className="patient-card" key={p.id}>
                            <div className="patient-card-header">
                              <div className="patient-card-identity">
                                <div className="admin-avatar" style={{ background: getAvatarColor(p.name) }}>
                                  {getInitials(p.name)}
                                </div>
                                <div className="patient-card-name-id">
                                  <span className="patient-card-name">{p.name}</span>
                                </div>
                              </div>
                              <span className={`admin-gender-badge gender-${p.gender.toLowerCase()}`}>
                                <i className={`fa-solid ${p.gender === 'Male' ? 'fa-mars' : p.gender === 'Female' ? 'fa-venus' : 'fa-genderless'}`}></i>
                                {p.gender}
                              </span>
                            </div>
                            <div className="patient-card-details-grid">
                              <div className="patient-card-detail-item">
                                <span className="patient-card-detail-label">Phone</span>
                                <span className="patient-card-detail-value">
                                  <a href={`tel:${p.phone}`} className="patient-card-phone-link">
                                    <i className="fa-solid fa-phone"></i> {p.phone}
                                  </a>
                                </span>
                              </div>
                              <div className="patient-card-detail-item">
                                <span className="patient-card-detail-label">Age</span>
                                <span className="patient-card-detail-value">{p.age} Yrs</span>
                              </div>
                              {p.address && (
                                <div className="patient-card-detail-item full-width">
                                  <span className="patient-card-detail-label">Address</span>
                                  <span className="patient-card-detail-value">{p.address}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ===== REVENUE TAB ===== */}
            {adminTab === 'revenue' && (
              <div className="admin-tab-content animate-fade-in">
                <div className="admin-view-header">
                  <h2 className="admin-view-title">
                    <i className="fa-solid fa-indian-rupee-sign"></i> Revenue Analytics
                  </h2>
                </div>

                {/* Period Filter Selector */}
                <div className="admin-period-selector-row">
                  <div className="admin-period-selector">
                    <button className={`period-btn ${adminPeriodFilter === 'today' ? 'active' : ''}`} onClick={() => setAdminPeriodFilter('today')}>Today</button>
                    <button className={`period-btn ${adminPeriodFilter === 'month' ? 'active' : ''}`} onClick={() => setAdminPeriodFilter('month')}>This Month</button>
                    <button className={`period-btn ${adminPeriodFilter === 'year' ? 'active' : ''}`} onClick={() => setAdminPeriodFilter('year')}>This Year</button>
                  </div>
                </div>

                {/* Revenue Summary Cards */}
                <div className="admin-revenue-summary">
                  <div className="admin-revenue-card rev-total">
                    <div className="rev-card-icon"><i className="fa-solid fa-wallet"></i></div>
                    <div className="rev-card-info">
                      <span className="rev-card-value">₹{totalRevenue.toLocaleString('en-IN')}</span>
                      <span className="rev-card-label">Total Revenue</span>
                    </div>
                  </div>
                  <div className="admin-revenue-card rev-net">
                    <div className="rev-card-icon"><i className="fa-solid fa-calendar-check"></i></div>
                    <div className="rev-card-info">
                      <span className="rev-card-value">{filteredBookings.length}</span>
                      <span className="rev-card-label">Total Bookings</span>
                    </div>
                  </div>
                  <div className="admin-revenue-card rev-gst">
                    <div className="rev-card-icon"><i className="fa-solid fa-chart-line"></i></div>
                    <div className="rev-card-info">
                      <span className="rev-card-value">₹{avgRevenuePerBooking.toLocaleString('en-IN')}</span>
                      <span className="rev-card-label">Average per Booking</span>
                    </div>
                  </div>
                </div>

                {/* Revenue Trend / Calendar View by Period */}
                {adminPeriodFilter === 'month' ? (
                  <div className="admin-analytics-card" style={{ marginTop: '20px' }}>
                    <h3 className="admin-analytics-title" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                      <span>
                        <i className="fa-solid fa-calendar-days"></i> Daily Revenue Calendar — {monthNames[currentMonth]} {currentYear}
                      </span>
                      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--primary)', background: 'rgba(var(--primary-rgb), 0.1)', padding: '3px 10px', borderRadius: '12px' }}>
                        ₹{totalRevenue.toLocaleString('en-IN')} Total
                      </span>
                    </h3>

                    <div className="rev-cal-wrapper">
                      {/* Insights Bar */}
                      <div className="rev-cal-insights-bar">
                        <div className="rev-cal-insight-item">
                          <div className="rev-cal-insight-icon">
                            <i className="fa-solid fa-trophy"></i>
                          </div>
                          <div className="rev-cal-insight-data">
                            <span className="rev-cal-insight-label">Best Revenue Day</span>
                            <span className="rev-cal-insight-value">
                              {bestRevenueDay.revenue > 0 
                                ? `${monthNames[currentMonth]} ${bestRevenueDay.day} (₹${bestRevenueDay.revenue.toLocaleString('en-IN')})` 
                                : '—'}
                            </span>
                          </div>
                        </div>
                        <div className="rev-cal-insight-item">
                          <div className="rev-cal-insight-icon" style={{ background: 'rgba(16, 185, 129, 0.12)', color: '#059669' }}>
                            <i className="fa-solid fa-calendar-check"></i>
                          </div>
                          <div className="rev-cal-insight-data">
                            <span className="rev-cal-insight-label">Active Days</span>
                            <span className="rev-cal-insight-value">{activeRevenueDaysCount} of {daysInCurrentMonth} Days</span>
                          </div>
                        </div>
                        <div className="rev-cal-insight-item">
                          <div className="rev-cal-insight-icon" style={{ background: 'rgba(59, 130, 246, 0.12)', color: '#2563eb' }}>
                            <i className="fa-solid fa-chart-line"></i>
                          </div>
                          <div className="rev-cal-insight-data">
                            <span className="rev-cal-insight-label">Avg / Active Day</span>
                            <span className="rev-cal-insight-value">
                              ₹{activeRevenueDaysCount > 0 ? Math.round(totalRevenue / activeRevenueDaysCount).toLocaleString('en-IN') : '0'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* 7-column Calendar Grid */}
                      <div className="rev-cal-grid">
                        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => (
                          <div className="rev-cal-day-header" key={d}>
                            <span className="cal-header-desktop">{d}</span>
                            <span className="cal-header-mobile">{['S', 'M', 'T', 'W', 'T', 'F', 'S'][i]}</span>
                          </div>
                        ))}
                        {/* Empty cells for starting day offset */}
                        {Array.from({ length: new Date(currentYear, currentMonth, 1).getDay() }, (_, i) => (
                          <div className="rev-cal-cell rev-cal-empty" key={`rev-empty-${i}`}></div>
                        ))}
                        {/* Day cells */}
                        {dailyMonthBookings.map(d => {
                          const isToday = d.day === now.getDate();
                          const hasRevenue = d.revenue > 0;
                          const intensity = maxDailyMonthRevenue > 0 ? d.revenue / maxDailyMonthRevenue : 0;

                          const cellStyle = hasRevenue ? {
                            background: `linear-gradient(135deg, rgba(16, 185, 129, ${0.08 + intensity * 0.18}) 0%, rgba(16, 185, 129, ${0.14 + intensity * 0.26}) 100%)`,
                            borderColor: `rgba(16, 185, 129, ${0.3 + intensity * 0.45})`
                          } : {};

                          return (
                            <div 
                              className={`rev-cal-cell ${hasRevenue ? 'has-revenue' : ''} ${isToday ? 'is-today' : ''}`}
                              key={d.day}
                              style={cellStyle}
                              title={`Day ${d.day} (${monthNames[currentMonth]} ${d.day}, ${currentYear})\nRevenue: ₹${d.revenue.toLocaleString('en-IN')}\nBookings: ${d.bookings}${d.bookings > 0 ? `\nAvg per booking: ₹${Math.round(d.revenue / d.bookings).toLocaleString('en-IN')}` : ''}`}
                            >
                              <div className="rev-cal-cell-top">
                                <span className={`rev-cal-date-number ${isToday ? 'is-today-num' : ''}`}>{d.day}</span>
                                {isToday && <span className="rev-cal-today-pill">Today</span>}
                              </div>
                              <div className="rev-cal-cell-body">
                                {hasRevenue ? (
                                  <>
                                    <div className="rev-cal-amount">
                                      <span className="rev-cal-amt-full">
                                        ₹{d.revenue >= 100000 
                                          ? `${(d.revenue / 1000).toFixed(0)}k` 
                                          : d.revenue.toLocaleString('en-IN')}
                                      </span>
                                      <span className="rev-cal-amt-compact">
                                        ₹{d.revenue >= 1000 
                                          ? `${(d.revenue / 1000).toFixed(d.revenue >= 10000 || d.revenue % 1000 === 0 ? 0 : 1)}k` 
                                          : d.revenue}
                                      </span>
                                    </div>
                                    <div className="rev-cal-meta">
                                      <i className="fa-solid fa-user-check"></i> {d.bookings} {d.bookings === 1 ? 'bk' : 'bks'}
                                    </div>
                                  </>
                                ) : (
                                  <div className="rev-cal-zero">—</div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Footer Legend */}
                      <div className="rev-cal-footer">
                        <div className="rev-cal-legend">
                          <span style={{ fontWeight: 600 }}>Collection Intensity:</span>
                          <span style={{ fontSize: '0.7rem' }}>₹0</span>
                          <div className="rev-cal-legend-gradient"></div>
                          <span style={{ fontSize: '0.7rem', fontWeight: 700 }}>₹{maxDailyMonthRevenue.toLocaleString('en-IN')}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                          <div className="rev-cal-legend-item">
                            <span className="rev-cal-indicator-dot" style={{ background: 'var(--primary)', boxShadow: '0 0 0 2px rgba(var(--primary-rgb), 0.3)' }}></span>
                            <span>Current Day (Today)</span>
                          </div>
                          <div className="rev-cal-legend-item">
                            <span className="rev-cal-indicator-dot" style={{ background: '#059669' }}></span>
                            <span>Active Clinic Revenue</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : adminPeriodFilter === 'year' ? (
                  <div className="admin-analytics-card" style={{ marginTop: '20px' }}>
                    <h3 className="admin-analytics-title">
                      <i className="fa-solid fa-chart-bar"></i> Monthly Revenue Trend ({currentYear})
                    </h3>
                    <div className="admin-monthly-trend-container">
                      <div className="admin-monthly-trend-grid">
                        {monthlyRevenueTrend.map(m => {
                          const pct = maxMonthlyRevenue > 0 ? (m.revenue / maxMonthlyRevenue) * 100 : 0;
                          return (
                            <div className="monthly-trend-column" key={m.month}>
                              <div className="monthly-trend-track">
                                <div 
                                  className="monthly-trend-fill"
                                  style={{ height: `${pct}%` }}
                                  title={`${m.month}: ${m.bookings} booking${m.bookings !== 1 ? 's' : ''}, ₹${m.revenue.toLocaleString('en-IN')} revenue`}
                                >
                                  {m.revenue > 0 && (
                                    <span className="monthly-trend-value">
                                      ₹{m.revenue >= 1000 ? `${(m.revenue / 1000).toFixed(1)}k` : m.revenue}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <span className="monthly-trend-label">{m.month}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="admin-analytics-card" style={{ marginTop: '20px' }}>
                    <h3 className="admin-analytics-title" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                      <span>
                        <i className="fa-solid fa-bolt"></i> Today's Performance & Collections ({now.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })})
                      </span>
                      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--primary)', background: 'rgba(var(--primary-rgb), 0.1)', padding: '3px 10px', borderRadius: '12px' }}>
                        ₹{totalRevenue.toLocaleString('en-IN')} Today
                      </span>
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px', marginTop: '14px' }}>
                      <div style={{ padding: '16px', background: 'rgba(var(--admin-color-rgb, 56, 189, 248), 0.04)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          <i className="fa-solid fa-wallet" style={{ marginRight: '6px', color: 'var(--primary)' }}></i> Payment Modes Today
                        </div>
                        {Object.entries(revenueByPayment).length === 0 ? (
                          <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>No transactions recorded yet today.</p>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {Object.entries(revenueByPayment).map(([mode, amount]) => (
                              <div key={mode} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                                <span style={{ fontWeight: 600 }}>{mode}</span>
                                <span style={{ fontWeight: 700, color: '#059669' }}>₹{amount.toLocaleString('en-IN')}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div style={{ padding: '16px', background: 'rgba(var(--admin-color-rgb, 56, 189, 248), 0.04)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          <i className="fa-solid fa-briefcase-medical" style={{ marginRight: '6px', color: 'var(--secondary)' }}></i> Top Services Delivered Today
                        </div>
                        {sortedServiceRevenue.length === 0 ? (
                          <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>No services delivered yet today.</p>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {sortedServiceRevenue.slice(0, 4).map(([name, amount]) => (
                              <div key={name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                                <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }} title={name}>{name}</span>
                                <span style={{ fontWeight: 700, color: '#059669' }}>₹{amount.toLocaleString('en-IN')}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Revenue by Service */}
                <div className="admin-analytics-card" style={{ marginTop: '20px' }}>
                  <h3 className="admin-analytics-title">
                    <i className="fa-solid fa-briefcase-medical"></i> Revenue by Service
                  </h3>
                  {sortedServiceRevenue.length === 0 ? (
                    <p className="admin-no-data">No service revenue data available.</p>
                  ) : (
                    <div className="admin-bar-chart">
                      {sortedServiceRevenue.map(([name, amount]) => (
                        <div className="admin-bar-row" key={name}>
                          <div className="admin-bar-label admin-bar-label-wide" title={name}>{name}</div>
                          <div className="admin-bar-track">
                            <div 
                              className="admin-bar-fill admin-bar-fill-service"
                              style={{ width: `${(amount / maxServiceRevenue * 100)}%` }}
                            ></div>
                          </div>
                          <span className="admin-bar-value">₹{amount.toLocaleString('en-IN')}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Revenue by Date */}
                <div className="admin-analytics-card" style={{ marginTop: '20px' }}>
                  <h3 className="admin-analytics-title">
                    <i className="fa-solid fa-calendar-days"></i> Revenue by Date
                  </h3>
                  {sortedDateRevenue.length === 0 ? (
                    <p className="admin-no-data">No date-wise revenue data available.</p>
                  ) : (
                    <div className="admin-table-wrapper">
                      <table className="admin-table">
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th style={{ textAlign: 'right' }}>Revenue</th>
                            <th style={{ textAlign: 'center' }}>Bookings</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortedDateRevenue.map(([date, amount]) => {
                            const dateBookingsCount = bookingsList.filter(b => b.date === date).length;
                            return (
                              <tr key={date}>
                                <td>
                                  <strong>{new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}</strong>
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                  <strong>₹{amount.toLocaleString('en-IN')}</strong>
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                  <span className="admin-count-chip">{dateBookingsCount}</span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Revenue by Payment Mode */}
                <div className="admin-analytics-card" style={{ marginTop: '20px' }}>
                  <h3 className="admin-analytics-title">
                    <i className="fa-solid fa-credit-card"></i> Payment Mode Breakdown
                  </h3>
                  {Object.keys(revenueByPayment).length === 0 ? (
                    <p className="admin-no-data">No payment mode data available.</p>
                  ) : (
                    <div className="admin-payment-breakdown-grid">
                      {Object.entries(revenueByPayment).map(([mode, amount]) => {
                        const percentage = totalRevenue > 0 ? ((amount / totalRevenue) * 100).toFixed(1) : 0;
                        const modeBookingsCount = bookingsList.filter(b => b.paymentMode === mode).length;
                        return (
                          <div className={`admin-payment-card pmt-card-${mode.toLowerCase().replace(/\s+/g, '')}`} key={mode}>
                            <div className="pmt-card-header">
                              <span className="pmt-card-mode">{mode}</span>
                              <span className="pmt-card-pct">{percentage}%</span>
                            </div>
                            <div className="pmt-card-amount">₹{amount.toLocaleString('en-IN')}</div>
                            <div className="pmt-card-meta">{modeBookingsCount} transaction{modeBookingsCount > 1 ? 's' : ''}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ===== BOOKINGS TAB ===== */}
            {adminTab === 'bookings' && (
              <div className="admin-tab-content animate-fade-in">
                <div className="admin-view-header">
                  <h2 className="admin-view-title">
                    <i className="fa-solid fa-calendar-check"></i> All Bookings
                  </h2>
                  <span className="admin-count-badge">{bookingsList.length} {bookingsList.length === 1 ? 'total invoice' : 'total invoices'}</span>
                </div>

                {bookingsList.length === 0 ? (
                  <div className="admin-empty-state">
                    <i className="fa-solid fa-file-invoice-dollar"></i>
                    <h3>No Bookings Yet</h3>
                    <p>No booking records found in the system.</p>
                  </div>
                ) : (
                  <>
                    {/* Desktop View Table */}
                    <div className="admin-analytics-card bookings-desktop-view" style={{ padding: 0, overflow: 'hidden' }}>
                      <div className="admin-table-wrapper">
                        <table className="admin-table admin-bookings-table">
                          <thead>
                            <tr>
                              <th>Date</th>
                              <th>Patient Details</th>
                              <th>Services Billed</th>
                              <th>Total Amount</th>
                              <th>Payment</th>
                              <th>Referred By</th>
                              <th style={{ textAlign: 'center' }}>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {paginatedAdminBookings.map(b => (
                              <tr key={b.id}>
                                <td>
                                  <span className="admin-date-cell">
                                    <i className="fa-regular fa-calendar-days"></i>
                                    {b.date}
                                  </span>
                                </td>
                                <td>
                                  <div className="admin-patient-cell">
                                    <span className="admin-patient-name">{b.patientName}</span>
                                    <span className="admin-patient-phone">
                                      <i className="fa-solid fa-phone"></i>
                                      {b.patientPhone}
                                    </span>
                                  </div>
                                </td>
                                <td>
                                  <div className="admin-services-column">
                                    {b.services.map((s, idx) => (
                                      <div className="admin-service-badge" key={idx}>
                                        <span className="admin-service-name" title={s.name}>
                                          {s.name}
                                        </span>
                                        <span className="admin-service-badge-price">₹{s.price.toLocaleString('en-IN')}</span>
                                      </div>
                                    ))}
                                  </div>
                                </td>
                                <td><strong className="admin-total-cell">₹{b.total.toLocaleString('en-IN')}</strong></td>
                                <td>
                                  <span className={`admin-payment-badge mode-badge-${b.paymentMode.toLowerCase().replace(/\s+/g, '')}`}>
                                    {b.paymentMode}
                                  </span>
                                </td>
                                <td>
                                  <span className={`admin-ref-badge ${b.referredBy && b.referredBy !== 'Self' ? 'ref-external' : 'ref-self'}`}>
                                    {b.referredBy || 'Self'}
                                  </span>
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                  <button 
                                    className="admin-table-action-btn"
                                    onClick={() => setActiveInvoice(b)}
                                    title="View Bill / Invoice"
                                  >
                                    <i className="fa-solid fa-file-invoice"></i> View
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      
                      {/* Desktop Pagination */}
                      {totalAdminPages > 1 && (
                        <div className="pagination-container">
                          <div className="pagination-info">
                            Showing <strong>{startIndexAdmin + 1}</strong> to <strong>{Math.min(startIndexAdmin + ITEMS_PER_PAGE, sortedBookings.length)}</strong> of <strong>{sortedBookings.length}</strong> bookings
                          </div>
                          <div className="pagination-btn-group">
                            <button 
                              className="pagination-btn" 
                              onClick={() => setAdminBookingsPage(p => Math.max(p - 1, 1))} 
                              disabled={adminBookingsPage === 1}
                              title="Previous Page"
                            >
                              <i className="fa-solid fa-chevron-left"></i>
                            </button>
                            {getPaginationRange(adminBookingsPage, totalAdminPages).map((p, idx) => (
                              p === '...' ? (
                                <span key={`dots-${idx}`} className="pagination-dots">...</span>
                              ) : (
                                <button 
                                  key={p} 
                                  className={`pagination-btn ${adminBookingsPage === p ? 'active' : ''}`}
                                  onClick={() => setAdminBookingsPage(p)}
                                >
                                  {p}
                                </button>
                              )
                            ))}
                            <button 
                              className="pagination-btn" 
                              onClick={() => setAdminBookingsPage(p => Math.min(p + 1, totalAdminPages))} 
                              disabled={adminBookingsPage === totalAdminPages}
                              title="Next Page"
                            >
                              <i className="fa-solid fa-chevron-right"></i>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Mobile View Cards */}
                    <div className="bookings-mobile-view">
                      <div className="booking-history-cards-list">
                        {paginatedAdminBookings.map(b => (
                          <div className="booking-history-card" key={b.id}>
                            <div className="booking-card-header">
                              <span className="booking-card-id">Invoice <code className="admin-id-badge" style={{ padding: '2px 6px', fontSize: '0.8rem' }}>{b.id}</code></span>
                              <span className={`admin-payment-badge mode-badge-${b.paymentMode.toLowerCase().replace(/\s+/g, '')}`} style={{ margin: 0 }}>
                                {b.paymentMode}
                              </span>
                            </div>
                            <div className="booking-card-body">
                              <div className="booking-card-info-row">
                                <span className="info-label">Date:</span>
                                <span className="info-value">{b.date}</span>
                              </div>
                              <div className="booking-card-info-row">
                                <span className="info-label">Patient:</span>
                                <span className="info-value"><strong>{b.patientName}</strong></span>
                              </div>
                              <div className="booking-card-info-row">
                                <span className="info-label">Contact:</span>
                                <span className="info-value">{b.patientPhone}</span>
                              </div>
                              
                              <div className="booking-card-services-list">
                                <span className="services-title">Services Billed:</span>
                                <ul>
                                  {b.services.map((s, idx) => (
                                    <li key={idx}>
                                      <span className="srv-name" style={{ fontSize: '0.8rem' }}>{s.name}</span>
                                      <span className="srv-price" style={{ fontSize: '0.8rem', fontWeight: 600 }}>₹{s.price.toLocaleString('en-IN')}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>

                              <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px dashed var(--border-color)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <div className="booking-card-info-row" style={{ fontSize: '0.8rem' }}>
                                  <span className="info-label">Referred By:</span>
                                  <span className="info-value">{b.referredBy || 'Self'}</span>
                                </div>
                              </div>
                            </div>
                            <div className="booking-card-footer" style={{ borderTop: '1px solid var(--border-color)', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(var(--primary-rgb), 0.01)' }}>
                              <div className="booking-card-total">
                                <span className="total-label" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block' }}>Total Amount:</span>
                                <span className="total-amount" style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--primary)' }}>₹{b.total.toLocaleString('en-IN')}</span>
                              </div>
                              <button 
                                className="booking-card-action-btn"
                                onClick={() => setActiveInvoice(b)}
                                style={{ background: 'var(--primary)', color: 'white', border: 'none', padding: '8px 14px', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                              >
                                <i className="fa-solid fa-file-invoice"></i> View Invoice
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Mobile Pagination */}
                      {totalAdminPages > 1 && (
                        <div className="pagination-container pagination-card" style={{ marginTop: '16px' }}>
                          <div className="pagination-info">
                            Showing <strong>{startIndexAdmin + 1}</strong> to <strong>{Math.min(startIndexAdmin + ITEMS_PER_PAGE, sortedBookings.length)}</strong> of <strong>{sortedBookings.length}</strong> bookings
                          </div>
                          <div className="pagination-btn-group">
                            <button 
                              className="pagination-btn" 
                              onClick={() => setAdminBookingsPage(p => Math.max(p - 1, 1))} 
                              disabled={adminBookingsPage === 1}
                              title="Previous Page"
                            >
                              <i className="fa-solid fa-chevron-left"></i>
                            </button>
                            {getPaginationRange(adminBookingsPage, totalAdminPages).map((p, idx) => (
                              p === '...' ? (
                                <span key={`dots-${idx}`} className="pagination-dots">...</span>
                              ) : (
                                <button 
                                  key={p} 
                                  className={`pagination-btn ${adminBookingsPage === p ? 'active' : ''}`}
                                  onClick={() => setAdminBookingsPage(p)}
                                >
                                  {p}
                                </button>
                              )
                            ))}
                            <button 
                              className="pagination-btn" 
                              onClick={() => setAdminBookingsPage(p => Math.min(p + 1, totalAdminPages))} 
                              disabled={adminBookingsPage === totalAdminPages}
                              title="Next Page"
                            >
                              <i className="fa-solid fa-chevron-right"></i>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </main>
        </div>
        );
      })()}

      {/* Invoice Modal Overlay */}
      {activeInvoice && (
        <div className="invoice-modal-overlay">
          <div className="invoice-modal-container">
            <div className="invoice-modal-header">
              <h3>Invoice Details - INV/2026/{1000 + parseInt(activeInvoice.id)}</h3>
              <button 
                onClick={() => setActiveInvoice(null)} 
                style={{ color: 'white', fontSize: '1.5rem', cursor: 'pointer', border: 'none', background: 'none' }}
                aria-label="Close modal"
              >
                &times;
              </button>
            </div>
            
            <div className="invoice-modal-body">
              <div className="invoice-preview-card invoice-print-area">
                {/* Clinical Header / Letterhead */}
                <div className="invoice-preview-header">
                  <div className="invoice-logo-title-group">
                    <img src="logo.png" alt="Baak o Shrobon Kendra Logo" className="invoice-logo-img" />
                    <div className="invoice-clinic-info-block">
                      <h2 className="invoice-clinic-title">{t.nav.clinicName}</h2>
                      <p className="invoice-clinic-subtitle">{t.nav.logoSub}</p>
                      <p className="invoice-clinic-address-text">
                        Surakshya Polyclinic, 2nd Floor, Ganga Ghosh Building, Beside Style Bazar, Raghunathganj, Murshidabad - 742225
                      </p>
                      <p className="invoice-clinic-contact-text">
                        Ph: +91 9674163040 | Email: avijitchoudhuryent79@gmail.com
                      </p>
                    </div>
                  </div>
                  <div className="invoice-license-block">
                    <span className="invoice-tag-tax">INVOICE</span>
                    <p className="invoice-license-item"><strong>Reg No:</strong> WB/JGP/CE/2026-9281</p>
                  </div>
                </div>

                <div className="invoice-divider-bar"></div>

                {/* Patient & Invoice Meta Grid */}
                <div className="invoice-metadata-grid">
                  <div className="invoice-meta-col">
                    <h4 className="invoice-section-heading">PATIENT INFORMATION</h4>
                    <table className="invoice-meta-table">
                      <tbody>
                        <tr>
                          <th>UHID / Patient ID:</th>
                          <td>BSK-UHID-{activeInvoice.patientId || '1001'}</td>
                        </tr>
                        <tr>
                          <th>Patient Name:</th>
                          <td>{activeInvoice.patientName}</td>
                        </tr>
                        <tr>
                          <th>Age / Gender:</th>
                          <td>{activeInvoice.patientAge} Yrs / {activeInvoice.patientGender}</td>
                        </tr>
                        <tr>
                          <th>Contact Number:</th>
                          <td>{activeInvoice.patientPhone}</td>
                        </tr>
                        {activeInvoice.patientAddress && (
                          <tr>
                            <th>Address:</th>
                            <td>{activeInvoice.patientAddress}</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="invoice-meta-col">
                    <h4 className="invoice-section-heading">BILLING & VISIT DETAILS</h4>
                    <table className="invoice-meta-table">
                      <tbody>
                        <tr>
                          <th>Invoice Number:</th>
                          <td>INV/2026/{1000 + parseInt(activeInvoice.id)}</td>
                        </tr>
                        <tr>
                          <th>Billing Date:</th>
                          <td>{activeInvoice.date}</td>
                        </tr>
                        <tr>
                          <th>Consulting Doctor:</th>
                          <td>Dr. Avijit Chowdhury, MS (ENT)</td>
                        </tr>
                        <tr>
                          <th>Referred By:</th>
                          <td>{activeInvoice.referredBy || 'Self'}</td>
                        </tr>
                        <tr>
                          <th>Payment Mode:</th>
                          <td>
                            <span className="invoice-badge-payment">{activeInvoice.paymentMode}</span>
                            <span className="invoice-badge-status-paid"><i className="fa-solid fa-circle-check"></i> PAID</span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Services Table */}
                <h4 className="invoice-section-heading" style={{ marginTop: '24px', marginBottom: '8px' }}>SERVICES RENDERED</h4>
                <div className="invoice-table-wrapper">
                  <table className="invoice-services-table">
                    <thead>
                      <tr>
                        <th style={{ width: '50px', textAlign: 'center' }}>#</th>
                        <th>Service / Treatment Description</th>
                        <th style={{ width: '60px', textAlign: 'center' }}>Qty</th>
                        <th style={{ width: '140px', textAlign: 'right' }}>Unit Rate (₹)</th>
                        <th style={{ width: '140px', textAlign: 'right' }}>Amount (₹)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeInvoice.services.map((s, idx) => (
                        <tr key={idx}>
                          <td style={{ textAlign: 'center' }}>{idx + 1}</td>
                          <td>
                            <span className="service-name-text">{s.name}</span>
                          </td>
                          <td style={{ textAlign: 'center' }}>1</td>
                          <td style={{ textAlign: 'right' }}>₹{(s.price).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td style={{ textAlign: 'right', fontWeight: '500' }}>₹{(s.price).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Bottom Section: Words & Totals Summary */}
                <div className="invoice-bottom-grid">
                  <div className="invoice-words-col">
                    <div className="invoice-words-box">
                      <span className="invoice-words-label">Amount in Words:</span>
                      <p className="invoice-words-text">{convertNumberToWords(activeInvoice.total)}</p>
                    </div>
                  </div>

                  <div className="invoice-totals-col">
                    <table className="invoice-totals-table">
                      <tbody>
                        <tr>
                          <th>Subtotal:</th>
                          <td>₹{activeInvoice.subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        </tr>
                        <tr className="grand-total-row">
                          <th>Total Paid:</th>
                          <td>₹{activeInvoice.total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Signatures & Seal Box */}
                <div className="invoice-signatures-box">
                  <div className="signature-block">
                    <div className="signature-line"></div>
                    <p className="signature-label">Patient / Representative Signature</p>
                  </div>
                  
                  <div className="signature-block signature-right">
                    <div className="clinic-seal-placeholder">
                      <span>BSK CLINIC SEAL</span>
                    </div>
                    <div className="signature-line"></div>
                    <p className="signature-label">Authorized Signatory</p>
                    <p className="signature-subtext">For {t.nav.clinicName}</p>
                  </div>
                </div>

                {/* Clinic Footer Message */}
                <div className="invoice-preview-footer">
                  <p className="footer-greeting">Wish You A Speedy Recovery!</p>
                  <p className="footer-meta-text">This is a computer-generated invoice. Signature is optional but recorded for verification.</p>
                </div>
              </div>
            </div>

            <div className="invoice-modal-footer">
              <button 
                className="btn" 
                style={{ padding: '8px 16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', cursor: 'pointer', background: 'transparent', color: 'var(--text-primary)' }}
                onClick={() => setActiveInvoice(null)}
              >
                Close
              </button>
              <button 
                className="btn btn-primary" 
                style={{ padding: '8px 20px', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--primary)', color: 'white', border: 'none', cursor: 'pointer' }}
                onClick={() => window.print()}
              >
                <i className="fa-solid fa-print" style={{ marginRight: '6px' }}></i> Print / Save PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 13. Floating Actions */}
      {view === 'landing' && (
        <div className="floating-actions">
          <button 
            className={`floating-btn floating-btn-top ${backToTopVisible ? 'visible' : ''}`} 
            id="back-to-top" 
            aria-label="Back to top"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          >
            <i className="fa-solid fa-arrow-up"></i>
          </button>
          <a href="tel:+919674163040" className="floating-btn floating-btn-call" aria-label="Call Baak o Shrobon Kendra Support">
            <i className="fa-solid fa-phone"></i>
          </a>
          <a href="https://wa.me/919674163040" className="floating-btn floating-btn-whatsapp" target="_blank" rel="noopener noreferrer" aria-label="Chat with us on WhatsApp">
            <i className="fa-brands fa-whatsapp"></i>
          </a>
        </div>
      )}
    </>
  );
}

export default App;
