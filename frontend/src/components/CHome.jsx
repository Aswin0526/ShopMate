import React, { useEffect, useState } from 'react';

function CHome({ custData }) {
  const token = localStorage.getItem('access_token');

  const defaultCity = custData?.customer_city || '';
  const defaultState = custData?.customer_state || '';
  const defaultCountry = custData?.customer_country || '';

  const [filterCountry, setFilterCountry] = useState(defaultCountry);
  const [filterState, setFilterState] = useState(defaultState);
  const [filterCity, setFilterCity] = useState(defaultCity);
  const [filterType, setFilterType] = useState('All');

  const [shops, setShops] = useState([]);
  const [loading, setLoading] = useState(true);

  const shopTypes = [
    { value: 'All', label: 'All Types' },
    { value: 'grocery', label: 'Grocery' },
    { value: 'bookstore', label: 'Bookstore' },
    { value: 'clothing', label: 'Clothing' },
    { value: 'electronics', label: 'Electronics' },
    { value: 'cosmetics', label: 'Cosmetics' },
  ];

  const resetToDefault = () => {
    setFilterCountry(defaultCountry);
    setFilterState(defaultState);
    setFilterCity(defaultCity);
    setFilterType('All');
  };

  useEffect(() => {
    if (!token) return;

    const fetchShopData = async () => {
      setLoading(true);
      try {
        const response = await fetch(
          "http://localhost:5000/api/customers/getShopInLoc",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`,
            },
            body: JSON.stringify({ 
              HCountry: filterCountry, 
              HState: filterState, 
              HCity: filterCity,
              type: filterType
            }),
          }
        );

        const data = await response.json();
        if (data.success) {
          setShops(data.data);
        }
      } catch (error) {
        console.error("Error fetching shops:", error);
      } finally {
        setLoading(false);
      }
    };

    const timeoutId = setTimeout(() => {
      fetchShopData();
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [token, filterCountry, filterState, filterCity, filterType]);

  // Styles
  const styles = {
    container: {
      padding: '20px',
      maxWidth: '1400px',
      margin: '0 auto',
    },
    filterSection: {
      backgroundColor: '#fff',
      borderRadius: '12px',
      padding: '24px',
      marginBottom: '24px',
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
    },
    filterTitle: {
      fontSize: '18px',
      fontWeight: '600',
      color: '#1a1a2e',
      marginBottom: '20px',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
    },
    filterGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
      gap: '16px',
      marginBottom: '16px',
    },
    filterGroup: {
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
    },
    label: {
      fontSize: '13px',
      fontWeight: '500',
      color: '#6b7280',
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
    },
    input: {
      padding: '12px 16px',
      borderRadius: '8px',
      border: '2px solid #e5e7eb',
      fontSize: '14px',
      color: '#374151',
      transition: 'all 0.2s ease',
      backgroundColor: '#f9fafb',
    },
    select: {
      padding: '12px 16px',
      borderRadius: '8px',
      border: '2px solid #e5e7eb',
      fontSize: '14px',
      color: '#374151',
      transition: 'all 0.2s ease',
      backgroundColor: '#f9fafb',
      cursor: 'pointer',
      appearance: 'none',
      backgroundImage: 'url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%236b7280\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3e%3cpolyline points=\'6 9 12 15 18 9\'%3e%3c/polyline%3e%3c/svg%3e")',
      backgroundRepeat: 'no-repeat',
      backgroundPosition: 'right 12px center',
      backgroundSize: '16px',
      paddingRight: '40px',
    },
    resetButton: {
      padding: '12px 24px',
      borderRadius: '8px',
      border: 'none',
      fontSize: '14px',
      fontWeight: '600',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      backgroundColor: '#6366f1',
      color: '#fff',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
    },
    buttonContainer: {
      display: 'flex',
      justifyContent: 'flex-end',
      marginTop: '16px',
    },
    shopGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
      gap: '24px',
    },
    shopCard: {
      backgroundColor: '#fff',
      borderRadius: '16px',
      overflow: 'hidden',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
      transition: 'all 0.3s ease',
      cursor: 'pointer',
    },
    shopLogo: {
      height: '160px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#f3f4f6',
      position: 'relative',
      overflow: 'hidden',
    },
    shopLogoImg: {
      width: '100%',
      height: '100%',
      objectFit: 'cover',
    },
    logoFallback: {
      width: '80px',
      height: '80px',
      borderRadius: '50%',
      backgroundColor: '#6366f1',
      color: '#fff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '32px',
      fontWeight: '700',
    },
    shopDetails: {
      padding: '20px',
    },
    shopName: {
      fontSize: '18px',
      fontWeight: '700',
      color: '#1a1a2e',
      marginBottom: '8px',
    },
    shopType: {
      display: 'inline-block',
      padding: '4px 12px',
      borderRadius: '20px',
      fontSize: '12px',
      fontWeight: '600',
      backgroundColor: '#ede9fe',
      color: '#6366f1',
      marginBottom: '12px',
    },
    shopLocation: {
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      color: '#6b7280',
      fontSize: '14px',
      marginBottom: '8px',
    },
    shopPincode: {
      color: '#6b7280',
      fontSize: '14px',
    },
    loadingContainer: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '60px 20px',
    },
    loadingSpinner: {
      width: '48px',
      height: '48px',
      border: '4px solid #e5e7eb',
      borderTopColor: '#6366f1',
      borderRadius: '50%',
      animation: 'spin 1s linear infinite',
    },
    loadingText: {
      marginTop: '16px',
      color: '#6b7280',
      fontSize: '16px',
    },
    emptyState: {
      textAlign: 'center',
      padding: '60px 20px',
      backgroundColor: '#fff',
      borderRadius: '12px',
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
    },
    emptyIcon: {
      fontSize: '48px',
      marginBottom: '16px',
    },
    emptyTitle: {
      fontSize: '20px',
      fontWeight: '600',
      color: '#1a1a2e',
      marginBottom: '8px',
    },
    emptyText: {
      color: '#6b7280',
      fontSize: '14px',
    },
    infoBadge: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      padding: '8px 16px',
      backgroundColor: '#eff6ff',
      borderRadius: '8px',
      fontSize: '13px',
      color: '#3b82f6',
      marginBottom: '16px',
    },
  };

  // Add hover effect styles
  const cardHoverStyle = `
    .shop-card:hover {
      transform: translateY(-4px);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
    }
    
    .reset-button:hover {
      background-color: #4f46e5 !important;
      transform: translateY(-1px);
    }
    
    .filter-input:focus, .filter-select:focus {
      outline: none !important;
      border-color: #6366f1 !important;
      background-color: #fff !important;
      box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1) !important;
    }
    
    .filter-input:hover, .filter-select:hover {
      border-color: #d1d5db !important;
    }
    
    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }
  `;

  if (loading) {
    return (
      <>
        <style>{cardHoverStyle}</style>
        <div style={styles.container}>
          <div style={styles.loadingContainer}>
            <div style={styles.loadingSpinner}></div>
            <p style={styles.loadingText}>Loading shops...</p>
          </div>
        </div>
      </>
    );
  }

  if (!shops.length) {
    return (
      <>
        <style>{cardHoverStyle}</style>
        <div style={styles.container}>
          <div style={styles.filterSection}>
            <h2 style={styles.filterTitle}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
              </svg>
              Filter Shops
            </h2>
            <div style={styles.filterGrid}>
              <div style={styles.filterGroup}>
                <label style={styles.label}>Country</label>
                <input
                  type="text"
                  value={filterCountry}
                  onChange={(e) => setFilterCountry(e.target.value)}
                  placeholder="Enter country"
                  className="filter-input"
                  style={styles.input}
                />
              </div>
              <div style={styles.filterGroup}>
                <label style={styles.label}>State</label>
                <input
                  type="text"
                  value={filterState}
                  onChange={(e) => setFilterState(e.target.value)}
                  placeholder="Enter state"
                  className="filter-input"
                  style={styles.input}
                />
              </div>
              <div style={styles.filterGroup}>
                <label style={styles.label}>City</label>
                <input
                  type="text"
                  value={filterCity}
                  onChange={(e) => setFilterCity(e.target.value)}
                  placeholder="Enter city"
                  className="filter-input"
                  style={styles.input}
                />
              </div>
              <div style={styles.filterGroup}>
                <label style={styles.label}>Shop Type</label>
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="filter-select"
                  style={styles.select}
                >
                  {shopTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div style={styles.buttonContainer}>
              <button
                onClick={resetToDefault}
                className="reset-button"
                style={styles.resetButton}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
                  <path d="M3 3v5h5"></path>
                </svg>
                Reset to My Location
              </button>
            </div>
          </div>
          <div style={styles.emptyState}>
            <div style={styles.emptyIcon}>🔍</div>
            <h3 style={styles.emptyTitle}>No shops found</h3>
            <p style={styles.emptyText}>
              Try adjusting your filters or search in a different location
            </p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{cardHoverStyle}</style>
      <div style={styles.container}>
        <div style={styles.filterSection}>
          <h2 style={styles.filterTitle}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
            </svg>
            Filter Shops
          </h2>
          <div style={styles.filterGrid}>
            <div style={styles.filterGroup}>
              <label style={styles.label}>Country</label>
              <input
                type="text"
                value={filterCountry}
                onChange={(e) => setFilterCountry(e.target.value)}
                placeholder="Enter country"
                className="filter-input"
                style={styles.input}
              />
            </div>
            <div style={styles.filterGroup}>
              <label style={styles.label}>State</label>
              <input
                type="text"
                value={filterState}
                onChange={(e) => setFilterState(e.target.value)}
                placeholder="Enter state"
                className="filter-input"
                style={styles.input}
              />
            </div>
            <div style={styles.filterGroup}>
              <label style={styles.label}>City</label>
              <input
                type="text"
                value={filterCity}
                onChange={(e) => setFilterCity(e.target.value)}
                placeholder="Enter city"
                className="filter-input"
                style={styles.input}
              />
            </div>
            <div style={styles.filterGroup}>
              <label style={styles.label}>Shop Type</label>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="filter-select"
                style={styles.select}
              >
                {shopTypes.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div style={styles.buttonContainer}>
            <button
              onClick={resetToDefault}
              className="reset-button"
              style={styles.resetButton}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
                <path d="M3 3v5h5"></path>
              </svg>
              Reset to My Location
            </button>
          </div>
        </div>

        <div style={styles.infoBadge}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="16" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12.01" y2="8"></line>
          </svg>
          Showing {shops.length} shop{shops.length !== 1 ? 's' : ''} in your area
        </div>

        <div className="shop-grid" style={styles.shopGrid}>
          {shops.map((shop) => (
            <div
              className="shop-card"
              key={shop.shop_id}
              style={styles.shopCard}
            >
              <div style={styles.shopLogo}>
                {shop.logo ? (
                  <img
                    src={`data:image/png;base64,${shop.logo}`}
                    alt={`${shop.shop_name} Logo`}
                    style={styles.shopLogoImg}
                  />
                ) : (
                  <div style={styles.logoFallback}>
                    {shop.shop_name?.charAt(0) || 'S'}
                  </div>
                )}
              </div>

              <div style={styles.shopDetails}>
                <h3 style={styles.shopName}>{shop.shop_name}</h3>
                <span style={styles.shopType}>{shop.type}</span>
                <div style={styles.shopLocation}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                    <circle cx="12" cy="10" r="3"></circle>
                  </svg>
                  {shop.shop_city}, {shop.shop_state}
                </div>
                <p style={styles.shopPincode}>📍 Pincode: {shop.shop_pincode}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export default CHome;

