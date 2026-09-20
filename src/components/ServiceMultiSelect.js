import React, { useState, useRef, useEffect, useImperativeHandle, forwardRef } from 'react';

const isVariablePriceService = (srv) => {
  if (!srv) return false;
  return Boolean(
    srv.isVariablePrice ||
    srv.category === 'Hearing Aid Services' ||
    srv.category === 'Consultation' ||
    (srv.name && (srv.name.toLowerCase().includes('hearing aid') || srv.name.toLowerCase().includes('consultan')))
  );
};

const ServiceMultiSelect = forwardRef(({
  catalogServices = [],
  selectedServices = [],
  onToggleService,
  onPriceChange,
  onClearAll,
}, ref) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const dropdownRef = useRef(null);
  const searchInputRef = useRef(null);
  const triggerRef = useRef(null);
  const categoryChipRefs = useRef([]);
  const serviceOptionRefs = useRef([]);
  const doneBtnRef = useRef(null);

  // Expose focusTrigger method via ref
  useImperativeHandle(ref, () => ({
    focusTrigger: () => {
      triggerRef.current?.focus();
    }
  }));

  // Extract unique categories from catalog
  const categories = ['ALL', ...Array.from(new Set(catalogServices.map(s => s.category).filter(Boolean)))];

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Filter catalog based on category and search query
  const filteredServices = catalogServices.filter(srv => {
    const matchesCategory = selectedCategory === 'ALL' || srv.category === selectedCategory;
    const query = searchQuery.trim().toLowerCase();
    const matchesQuery = !query ||
      srv.name.toLowerCase().includes(query) ||
      (srv.category && srv.category.toLowerCase().includes(query));
    return matchesCategory && matchesQuery;
  });

  // Calculate filtered counts for category chips
  const getCategoryCount = (cat) => {
    if (cat === 'ALL') return catalogServices.length;
    return catalogServices.filter(s => s.category === cat).length;
  };

  const isAllFilteredSelected =
    filteredServices.length > 0 &&
    filteredServices.every(srv => selectedServices.some(s => s.id === srv.id));

  const handleToggleAllFiltered = () => {
    if (isAllFilteredSelected) {
      // Deselect all filtered services
      filteredServices.forEach(srv => {
        if (selectedServices.some(s => s.id === srv.id)) {
          onToggleService(srv);
        }
      });
    } else {
      // Select all filtered services
      filteredServices.forEach(srv => {
        if (!selectedServices.some(s => s.id === srv.id)) {
          onToggleService(srv);
        }
      });
    }
  };

  const totalAmount = selectedServices.reduce(
    (acc, s) => acc + (Number(s.customPrice !== undefined && typeof s.customPrice === 'number' ? s.customPrice : s.price) || 0),
    0
  );

  return (
    <div className="service-multiselect-wrapper" ref={dropdownRef}>
      {/* ── 1. MAIN SELECT / SEARCH TRIGGER ── */}
      <div className="service-multiselect-control-group">
        <div
          ref={triggerRef}
          className={`service-multiselect-trigger ${isOpen ? 'active' : ''} ${selectedServices.length > 0 ? 'has-selection' : ''}`}
          onClick={() => setIsOpen(!isOpen)}
          role="combobox"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
              e.preventDefault();
              setIsOpen(true);
            } else if (e.key === 'Escape' && isOpen) {
              e.preventDefault();
              setIsOpen(false);
            }
          }}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-label="Select diagnostic tests and services"
        >
          <div className="service-trigger-left">
            <span className="service-trigger-icon">
              <i className="fa-solid fa-magnifying-glass"></i>
            </span>
            <div className="service-trigger-text">
              {selectedServices.length === 0 ? (
                <span className="service-trigger-placeholder">
                  Search or click to select diagnostic tests & services...
                </span>
              ) : (
                <div className="service-trigger-selected-wrap">
                  <span className="service-trigger-count-badge">
                    <i className="fa-solid fa-check"></i> {selectedServices.length} Selected
                  </span>
                  <span className="service-trigger-preview">
                    {selectedServices.map(s => s.name).join(', ')}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="service-trigger-actions">
            {selectedServices.length > 0 && (
              <button
                type="button"
                className="service-trigger-clear-btn"
                title="Clear all selections"
                onClick={(e) => {
                  e.stopPropagation();
                  onClearAll ? onClearAll() : selectedServices.forEach(s => onToggleService(s));
                }}
              >
                Clear
              </button>
            )}
            <span className={`service-trigger-arrow ${isOpen ? 'open' : ''}`}>
              <i className="fa-solid fa-chevron-down"></i>
            </span>
          </div>
        </div>

        {/* ── 2. DROPDOWN POPUP MENU ── */}
        {isOpen && (
          <div className="service-multiselect-dropdown-menu">
            {/* Search Input Bar */}
            <div className="service-dropdown-search-wrap">
              <div className="service-dropdown-search-box">
                <i className="fa-solid fa-magnifying-glass service-search-icon"></i>
                <input
                  ref={searchInputRef}
                  type="text"
                  className="service-dropdown-search-input"
                  placeholder="Type to search test or service name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  aria-label="Search tests and services"
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      if (categories.length > 1 && categoryChipRefs.current[0]) {
                        categoryChipRefs.current[0].focus();
                      } else if (serviceOptionRefs.current[0]) {
                        serviceOptionRefs.current[0].focus();
                      }
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      setIsOpen(false);
                      triggerRef.current?.focus();
                    }
                  }}
                />
                {searchQuery && (
                  <button
                    type="button"
                    className="service-search-clear"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSearchQuery('');
                      searchInputRef.current?.focus();
                    }}
                    title="Clear search"
                    aria-label="Clear service search query"
                  >
                    <i className="fa-solid fa-xmark"></i>
                  </button>
                )}
              </div>
            </div>

            {/* Category Filter Chips */}
            {categories.length > 1 && (
              <div className="service-category-chips-bar" onClick={(e) => e.stopPropagation()} role="toolbar" aria-label="Service Category Filters">
                {categories.map((cat, catIdx) => (
                  <button
                    key={cat}
                    ref={el => categoryChipRefs.current[catIdx] = el}
                    type="button"
                    className={`service-cat-chip ${selectedCategory === cat ? 'active' : ''}`}
                    onClick={() => setSelectedCategory(cat)}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowRight' && categoryChipRefs.current[catIdx + 1]) {
                        e.preventDefault();
                        categoryChipRefs.current[catIdx + 1].focus();
                      } else if (e.key === 'ArrowLeft' && categoryChipRefs.current[catIdx - 1]) {
                        e.preventDefault();
                        categoryChipRefs.current[catIdx - 1].focus();
                      } else if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        serviceOptionRefs.current[0]?.focus();
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        setIsOpen(false);
                        triggerRef.current?.focus();
                      }
                    }}
                    aria-pressed={selectedCategory === cat}
                  >
                    <span>{cat === 'ALL' ? 'All Services' : cat}</span>
                    <span className="cat-chip-count">{getCategoryCount(cat)}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Selection Quick Actions */}
            <div className="service-dropdown-actions-bar" onClick={(e) => e.stopPropagation()}>
              <span className="service-count-status">
                {filteredServices.length} {filteredServices.length === 1 ? 'service available' : 'services available'}
              </span>
              <div className="service-quick-btn-group">
                {filteredServices.length > 0 && (
                  <button
                    type="button"
                    className="service-quick-btn"
                    onClick={handleToggleAllFiltered}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        serviceOptionRefs.current[0]?.focus();
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        setIsOpen(false);
                        triggerRef.current?.focus();
                      }
                    }}
                  >
                    {isAllFilteredSelected ? (
                      <>
                        <i className="fa-regular fa-square-minus"></i> Deselect Shown
                      </>
                    ) : (
                      <>
                        <i className="fa-regular fa-square-check"></i> Select All Shown
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Options List */}
            <div className="service-options-list" role="listbox" id="service-options-list" aria-label="Available services">
              {filteredServices.length === 0 ? (
                <div className="service-no-results">
                  <i className="fa-solid fa-search"></i>
                  <p>No services found matching "<strong>{searchQuery}</strong>"</p>
                  <button
                    type="button"
                    className="btn-link-reset"
                    onClick={() => {
                      setSearchQuery('');
                      setSelectedCategory('ALL');
                      searchInputRef.current?.focus();
                    }}
                  >
                    Reset filters
                  </button>
                </div>
              ) : (
                filteredServices.map((srv, idx) => {
                  const isSelected = selectedServices.some(s => s.id === srv.id);
                  const isVariable = isVariablePriceService(srv);

                  return (
                    <div
                      key={srv.id}
                      ref={el => serviceOptionRefs.current[idx] = el}
                      className={`service-option-item ${isSelected ? 'selected' : ''}`}
                      onClick={() => onToggleService(srv)}
                      role="option"
                      aria-selected={isSelected}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onToggleService(srv);
                        } else if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          if (serviceOptionRefs.current[idx + 1]) {
                            serviceOptionRefs.current[idx + 1].focus();
                          } else if (doneBtnRef.current) {
                            doneBtnRef.current.focus();
                          }
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          if (idx === 0) {
                            if (categories.length > 1 && categoryChipRefs.current[0]) {
                              categoryChipRefs.current[0].focus();
                            } else {
                              searchInputRef.current?.focus();
                            }
                          } else if (serviceOptionRefs.current[idx - 1]) {
                            serviceOptionRefs.current[idx - 1].focus();
                          }
                        } else if (e.key === 'Escape') {
                          e.preventDefault();
                          setIsOpen(false);
                          triggerRef.current?.focus();
                        }
                      }}
                    >
                      <div className="service-option-checkbox-wrapper">
                        <div className={`custom-checkbox ${isSelected ? 'checked' : ''}`}>
                          {isSelected && <i className="fa-solid fa-check"></i>}
                        </div>
                      </div>

                      <div className="service-option-details">
                        <div className="service-option-main-info">
                          <span className="service-option-name">{srv.name}</span>
                          {srv.category && (
                            <span className="service-option-cat-tag">{srv.category}</span>
                          )}
                        </div>

                        <div className="service-option-pricing">
                          {isVariable ? (
                            <span className="service-option-variable-badge">Custom Price</span>
                          ) : (
                            <span className="service-option-price-tag">
                              ₹{Number(srv.price || 0).toLocaleString('en-IN')}{srv.perSession ? '/session' : ''}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Dropdown Footer */}
            <div className="service-dropdown-footer" onClick={(e) => e.stopPropagation()}>
              <div className="service-footer-stats">
                <strong>{selectedServices.length}</strong> selected
              </div>
              <button
                ref={doneBtnRef}
                type="button"
                className="btn btn-primary service-dropdown-done-btn"
                onClick={() => {
                  setIsOpen(false);
                  triggerRef.current?.focus();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    const lastIdx = filteredServices.length - 1;
                    if (lastIdx >= 0 && serviceOptionRefs.current[lastIdx]) {
                      serviceOptionRefs.current[lastIdx].focus();
                    }
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    setIsOpen(false);
                    triggerRef.current?.focus();
                  }
                }}
                aria-label="Confirm selected services and close dropdown"
              >
                <i className="fa-solid fa-check"></i> Done
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── 3. SELECTED SERVICES LIST (ONLY SHOWN WHEN ITEMS ARE SELECTED) ── */}
      {selectedServices.length > 0 && (
        <div className="selected-services-bottom-panel">
          <div className="selected-services-header">
            <div className="selected-services-title-wrap">
              <h4 className="selected-services-title">
                <i className="fa-solid fa-clipboard-check"></i> Selected Services
              </h4>
              <span className="selected-badge-counter">
                {selectedServices.length} {selectedServices.length === 1 ? 'service' : 'services'}
              </span>
            </div>

            <button
              type="button"
              className="selected-services-clear-action"
              onClick={() => onClearAll ? onClearAll() : selectedServices.forEach(s => onToggleService(s))}
            >
              <i className="fa-regular fa-trash-can"></i> Clear All
            </button>
          </div>

          <div className="selected-services-list">
            <div className="selected-services-order-list">
              {selectedServices.map((srv, idx) => {
                const isVariable = isVariablePriceService(srv);
                const isPriceEmpty = isVariable && (!srv.customPrice || Number(srv.customPrice) <= 0);

                return (
                  <div
                    key={srv.id}
                    className={`selected-service-row ${isVariable ? 'is-variable-row' : ''} ${isPriceEmpty ? 'row-has-error' : ''}`}
                  >
                    {/* Index & Service Info */}
                    <div className="service-row-left">
                      <span className="service-row-index">{idx + 1}</span>
                      <div className="service-row-info">
                        <div className="service-row-title-line">
                          <h5 className="service-row-name">{srv.name}</h5>
                          <span className="service-row-category">{srv.category || 'General'}</span>
                          {isVariable && (
                            <span className="service-row-variable-badge">
                              <i className="fa-solid fa-sliders"></i> Custom Price
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Pricing & Actions */}
                    <div className="service-row-right">
                      {isVariable ? (
                        <div className="service-row-price-input-group">
                          <div
                            className={`service-row-input-wrap ${isPriceEmpty ? 'has-error' : ''}`}
                            onClick={(e) => {
                              const input = e.currentTarget.querySelector('input');
                              if (input) input.focus();
                            }}
                          >
                            <span className="service-row-currency">₹</span>
                            <input
                              type="number"
                              className="service-row-price-input custom-price-input"
                              value={srv.customPrice !== undefined && srv.customPrice !== '' ? srv.customPrice : ''}
                              min="1"
                              placeholder="Enter Price"
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => {
                                const raw = e.target.value;
                                const val = raw === '' ? '' : Math.max(0, parseInt(raw, 10) || 0);
                                if (onPriceChange) onPriceChange(srv.id, val);
                              }}
                              aria-label={`Enter price for ${srv.name}`}
                            />
                          </div>
                          {isPriceEmpty && (
                            <span className="service-row-price-required-hint">
                              <i className="fa-solid fa-circle-exclamation"></i> Required
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="service-row-price-tag">
                          ₹{Number(srv.price || 0).toLocaleString('en-IN')}{srv.perSession ? '/session' : ''}
                        </div>
                      )}

                      <button
                        type="button"
                        className="service-row-remove-btn"
                        onClick={() => onToggleService(srv)}
                        title={`Remove ${srv.name}`}
                        aria-label={`Remove ${srv.name}`}
                      >
                        <i className="fa-solid fa-xmark"></i>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Total summary bar */}
            <div className="selected-services-summary-bar">
              <div className="summary-bar-count">
                <i className="fa-solid fa-check-double"></i>
                <span>Total ({selectedServices.length} {selectedServices.length === 1 ? 'service' : 'services'}):</span>
              </div>
              <div className="summary-bar-amount">
                <span className="summary-bar-value">₹{totalAmount.toLocaleString('en-IN')}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default ServiceMultiSelect;
