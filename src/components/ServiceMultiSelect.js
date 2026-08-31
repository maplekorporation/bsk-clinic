import React, { useState, useRef, useEffect } from 'react';

const ServiceMultiSelect = ({
  catalogServices = [],
  selectedServices = [],
  onToggleService,
  onPriceChange,
  onClearAll,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const dropdownRef = useRef(null);
  const searchInputRef = useRef(null);

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
      }, 100);
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
    (acc, s) => acc + (s.price ?? 0),
    0
  );

  return (
    <div className="service-multiselect-wrapper" ref={dropdownRef}>
      {/* ── 1. DROPDOWN TRIGGER / SEARCH INPUT ── */}
      <div className="service-multiselect-control-group">
        <label className="service-multiselect-label">
          <i className="fa-solid fa-briefcase-medical"></i> Select Diagnostics & Services
        </label>

        <div
          className={`service-multiselect-trigger ${isOpen ? 'active' : ''} ${selectedServices.length > 0 ? 'has-selection' : ''}`}
          onClick={() => setIsOpen(!isOpen)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setIsOpen(!isOpen);
            }
          }}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
        >
          <div className="service-trigger-left">
            <span className="service-trigger-icon">
              <i className="fa-solid fa-layer-group"></i>
            </span>
            <div className="service-trigger-text">
              {selectedServices.length === 0 ? (
                <span className="service-trigger-placeholder">
                  Click to select diagnostic tests & services...
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
                  placeholder="Search by service name or category..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
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
                  >
                    <i className="fa-solid fa-xmark"></i>
                  </button>
                )}
              </div>
            </div>

            {/* Category Filter Chips */}
            <div className="service-category-chips-bar" onClick={(e) => e.stopPropagation()}>
              {categories.map(cat => (
                <button
                  key={cat}
                  type="button"
                  className={`service-cat-chip ${selectedCategory === cat ? 'active' : ''}`}
                  onClick={() => setSelectedCategory(cat)}
                >
                  <span>{cat === 'ALL' ? 'All Services' : cat}</span>
                  <span className="cat-chip-count">{getCategoryCount(cat)}</span>
                </button>
              ))}
            </div>

            {/* Selection Quick Actions */}
            <div className="service-dropdown-actions-bar" onClick={(e) => e.stopPropagation()}>
              <span className="service-count-status">
                {filteredServices.length} {filteredServices.length === 1 ? 'service' : 'services'}
              </span>
              <div className="service-quick-btn-group">
                {filteredServices.length > 0 && (
                  <button
                    type="button"
                    className="service-quick-btn"
                    onClick={handleToggleAllFiltered}
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
            <div className="service-options-list" role="listbox">
              {filteredServices.length === 0 ? (
                <div className="service-no-results">
                  <i className="fa-solid fa-search"></i>
                  <p>No services matching "<strong>{searchQuery}</strong>"</p>
                  <button
                    type="button"
                    className="btn-link-reset"
                    onClick={() => {
                      setSearchQuery('');
                      setSelectedCategory('ALL');
                    }}
                  >
                    Reset filters
                  </button>
                </div>
              ) : (
                filteredServices.map(srv => {
                  const isSelected = selectedServices.some(s => s.id === srv.id);
                  return (
                    <div
                      key={srv.id}
                      className={`service-option-item ${isSelected ? 'selected' : ''}`}
                      onClick={() => onToggleService(srv)}
                      role="option"
                      aria-selected={isSelected}
                    >
                      <div className="service-option-checkbox-wrapper">
                        <div className={`custom-checkbox ${isSelected ? 'checked' : ''}`}>
                          {isSelected && <i className="fa-solid fa-check"></i>}
                        </div>
                      </div>

                      <div className="service-option-details">
                        <span className="service-option-name">{srv.name}</span>
                        {srv.category && (
                          <span className="service-option-cat-tag">{srv.category}</span>
                        )}
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
                type="button"
                className="btn btn-primary service-dropdown-done-btn"
                onClick={() => setIsOpen(false)}
              >
                <i className="fa-solid fa-check"></i> Done
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── 3. BOTTOM SELECTED SERVICES WITH NAME & NON-EDITABLE PRICES ── */}
      <div className="selected-services-bottom-panel">
        <div className="selected-services-header">
          <div className="selected-services-title-wrap">
            <h4 className="selected-services-title">
              <i className="fa-solid fa-clipboard-check"></i> Selected Services
            </h4>
            <span className="selected-badge-counter">
              {selectedServices.length} {selectedServices.length === 1 ? 'item' : 'items'}
            </span>
          </div>

          {selectedServices.length > 0 && (
            <button
              type="button"
              className="selected-services-clear-action"
              onClick={() => onClearAll ? onClearAll() : selectedServices.forEach(s => onToggleService(s))}
            >
              <i className="fa-regular fa-trash-can"></i> Clear All
            </button>
          )}
        </div>

        {selectedServices.length === 0 ? (
          <div
            className="selected-services-empty-state"
            onClick={() => setIsOpen(true)}
            role="button"
            tabIndex={0}
          >
            <div className="empty-state-icon">
              <i className="fa-solid fa-notes-medical"></i>
            </div>
            <div className="empty-state-text">
              <h5>No Services Selected</h5>
              <p>Click the dropdown above to search and select required diagnostic tests or therapy sessions.</p>
            </div>
            <button type="button" className="empty-state-cta-btn">
              <i className="fa-solid fa-plus"></i> Select Services
            </button>
          </div>
        ) : (
          <div className="selected-services-list">
            <div className="selected-services-grid">
              {selectedServices.map(srv => {
                return (
                  <div key={srv.id} className="selected-service-item-card">
                    <div className="selected-item-info">
                      <span className="selected-item-category">{srv.category || 'General'}</span>
                      <h5 className="selected-item-name">{srv.name}</h5>
                    </div>

                    <div className="selected-item-pricing-action">
                      <div className="selected-price-display">
                        <span className="selected-price-tag">
                          ₹{Number(srv.price).toLocaleString('en-IN')}
                        </span>
                      </div>

                      <button
                        type="button"
                        className="selected-service-remove-btn"
                        onClick={() => onToggleService(srv)}
                        title={`Remove ${srv.name}`}
                        aria-label={`Remove ${srv.name}`}
                      >
                        <i className="fa-solid fa-trash-can"></i>
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
        )}
      </div>
    </div>
  );
};

export default ServiceMultiSelect;
