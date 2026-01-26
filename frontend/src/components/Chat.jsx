import React, { useState, useEffect } from 'react';
import '../styles/Chat.css';

const PRODUCT_TYPES = [
  { id: 'electronics', name: 'Electronics'},
  { id: 'books', name: 'Book Store' },
  { id: 'cosmetics', name: 'Cosmetics'},
  { id: 'clothing', name: 'Clothing'},
  { id: 'groceries', name: 'Groceries'},
];

function Chat({ custData, onClose, onVoiceOpen }) {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    shopName: '',
    shopId: '',
    city: '',
    state: '',
    country: '',
    productType: '',
  });
  const [isSubmitted, setIsSubmitted] = useState(false);
  
  // Dropdown options
  const [cities, setCities] = useState([]);
  const [states, setStates] = useState([]);
  const [countries, setCountries] = useState([]);
  const [shops, setShops] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Fetch all dropdown options on mount
  useEffect(() => {
    const fetchDropdownOptions = async () => {
      try {
        const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
        
        const [citiesRes, statesRes, countriesRes] = await Promise.all([
          fetch(`${backendUrl}/api/locations/cities`),
          fetch(`${backendUrl}/api/locations/states`),
          fetch(`${backendUrl}/api/locations/countries`)
        ]);

        const citiesData = await citiesRes.json();
        const statesData = await statesRes.json();
        const countriesData = await countriesRes.json();

        if (citiesData.success) setCities(['Any', ...citiesData.data]);
        if (statesData.success) setStates(['Any', ...statesData.data]);
        if (countriesData.success) setCountries(['Any', ...countriesData.data]);
        
      } catch (error) {
        console.error('Error fetching dropdown options:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDropdownOptions();
  }, []);

  useEffect(() => {
    const fetchShops = async () => {
      try {
        const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
        
        // Build query params based on selected filters
        const params = new URLSearchParams();
        if (formData.city && formData.city !== '') params.append('city', formData.city);
        if (formData.state && formData.state !== '') params.append('state', formData.state);
        if (formData.country && formData.country !== '') params.append('country', formData.country);
        if (formData.productType && formData.productType !== '') params.append('productType', formData.productType);
        const response = await fetch(`${backendUrl}/api/locations/shops?${params.toString()}`);
        const data = await response.json();
        
        if (data.success) {
          setShops([{ id: '', name: 'Any' }, ...data.data]);
        }
      } catch (error) {
        console.error('Error fetching shops:', error);
      }
    };

    if (currentStep >= 2) {
      fetchShops();
    }
  }, [formData.city, formData.state, formData.country, currentStep]);

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleProductSelect = (productId) => {
    setFormData(prev => ({ ...prev, productType: productId }));
  };

  const handleNext = () => {
    if (currentStep < 3) {
      setCurrentStep(prev => prev + 1);
    } else {
      setIsSubmitted(true);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleEditStep = (step) => {
    setCurrentStep(step);
  };

  const handleSubmit = async () => {
    console.log('Form Submitted:', formData);
    setIsSubmitted(true);
    
    try {
      // Get or create session_id
      let session_id = localStorage.getItem('session_id');
      if (!session_id) {
        session_id = crypto.randomUUID();
        localStorage.setItem('session_id', session_id);
      }
      console.log("Using session_id:", session_id);

      const response = await fetch(
        `${import.meta.env.VITE_CHATBOT_URL}/start-chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Session-ID": session_id
          },
          body: JSON.stringify({
            session_id: session_id,
            formData: formData
          }),
        }
      );
      const data = await response.json();
      console.log("Backend response:", data);
      
      if (!data.message) {
        console.error("Failed to start a chat");
      } else {
        // Store session_id from backend response (for verification)
        if (data.session_id) {
          localStorage.setItem('session_id', data.session_id);
          console.log("Session ID stored:", data.session_id);
        }
        console.log("Chat session started successfully!");
        if (onVoiceOpen) {
          console.log("Opening voice interface...");
          onVoiceOpen();
        }
      }
    } catch (err) {
      console.error("Error starting chat:", err);
      setError("Error starting chat session");
    }
  };

  const isStepValid = () => {
    switch (currentStep) {
      case 1:
        return formData.productType !== '';
      case 2:
        return formData.city !== '' && 
               formData.state !== '' && 
               formData.country !== '';
      case 3:
        return true; // Shop name is now optional
      default:
        return false;
    }
  };

  const getSelectedProductName = () => {
    const product = PRODUCT_TYPES.find(p => p.id === formData.productType);
    return product ? product.name : '';
  };

  const resetForm = () => {
    setFormData({
      shopName: '',
      shopId: '',
      city: '',
      state: '',
      country: '',
      productType: '',
    });
    setCurrentStep(1);
    setIsSubmitted(false);
  };

  const renderProgressDots = () => {
    return (
      <div className="chat-progress">
        {[1, 2, 3].map(step => (
          <div 
            key={step}
            className={`chat-progress-dot ${step === currentStep ? 'active' : ''} ${step < currentStep ? 'completed' : ''}`}
          />
        ))}
      </div>
    );
  };

    const renderStep1 = () => (
    <div className="chat-question-content">
      <div className="chat-question-number">Question 1 of 3</div>
      <h2 className="chat-question-title">What type of product are you looking for?</h2>
      <div className="chat-product-options">
        {PRODUCT_TYPES.map(product => (
          <div
            key={product.id}
            className={`chat-option ${formData.productType === product.id ? 'selected' : ''}`}
            onClick={() => handleProductSelect(product.id)}
          >
            <span className="chat-option-icon">{product.icon}</span>
            <span>{product.name}</span>
          </div>
        ))}
      </div>
    </div>
  );


  const renderStep2 = () => (
    <div className="chat-question-content">
      <div className="chat-question-number">Question 2 of 3</div>
      <h2 className="chat-question-title">Where are you looking from?</h2>
      {loading ? (
        <div className="chat-loading">Loading locations...</div>
      ) : (
        <div className="chat-location-inputs">
          <select
            className="chat-input chat-select"
            value={formData.city}
            onChange={(e) => handleInputChange('city', e.target.value)}
            autoFocus
          >
            <option value="">Select City</option>
            {cities.map((city, index) => (
              <option key={index} value={city}>{city}</option>
            ))}
          </select>
          <div className="chat-location-row">
            <select
              className="chat-input chat-select"
              value={formData.state}
              onChange={(e) => handleInputChange('state', e.target.value)}
            >
              <option value="">Select State</option>
              {states.map((state, index) => (
                <option key={index} value={state}>{state}</option>
              ))}
            </select>
            <select
              className="chat-input chat-select"
              value={formData.country}
              onChange={(e) => handleInputChange('country', e.target.value)}
            >
              <option value="">Select Country</option>
              {countries.map((country, index) => (
                <option key={index} value={country}>{country}</option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );

    const renderStep3 = () => (
    <div className="chat-question-content">
      <div className="chat-question-number">Question 3 of 3</div>
      <h2 className="chat-question-title">Any particular shop you're looking for?</h2>
      {loading ? (
        <div className="chat-loading">Loading shops...</div>
      ) : (
        <select
          className="chat-input chat-select"
          value={formData.shopName}
          onChange={(e) => {
            const selectedShopName = e.target.value;
            const selectedShop = shops.find(shop => shop.name === selectedShopName);
            setFormData(prev => ({
              ...prev,
              shopName: selectedShopName,
              shopId: selectedShop ? selectedShop.id : ''
            }));
          }}
          autoFocus
        >
          <option value="">Select Shop (Optional)</option>
          {shops.map((shop) => (
            <option key={shop.id} value={shop.name}>{shop.name}</option>
          ))}
        </select>
      )}
    </div>
  );

  const renderSummary = () => (
    <div className="chat-question-content">
      <div className="chat-question-number">DO CONFORM</div>
      <br />
      {/* <h2 className="chat-question-title"></h2> */}
      <div className="chat-summary">
        <div className="chat-summary-grid">
          <div className="chat-summary-item">
            <div className="chat-summary-label">Product Type</div>
            <div className="chat-summary-value">{getSelectedProductName() || 'Any'}</div>
            <button className="chat-summary-edit" onClick={() => handleEditStep(1)}>Edit</button>
          </div>
          <div className="chat-summary-item">
            <div className="chat-summary-label">City</div>
            <div className="chat-summary-value">{formData.city || 'Any'}</div>
            <button className="chat-summary-edit" onClick={() => handleEditStep(2)}>Edit</button>
          </div>
          <div className="chat-summary-item">
            <div className="chat-summary-label">State</div>
            <div className="chat-summary-value">{formData.state}</div>
            <button className="chat-summary-edit" onClick={() => handleEditStep(2)}>Edit</button>
          </div>
          <div className="chat-summary-item">
            <div className="chat-summary-label">Country</div>
            <div className="chat-summary-value">{formData.country}</div>
            <button className="chat-summary-edit" onClick={() => handleEditStep(2)}>Edit</button>
          </div>
          <div className="chat-summary-item">
            <div className="chat-summary-label">Shop Name</div>
            <div className="chat-summary-value">{formData.shopName || 'Any'}</div>
            <button className="chat-summary-edit" onClick={() => handleEditStep(3)}>Edit</button>
          </div>
        </div>
        <button className="chat-btn chat-btn-search" onClick={handleSubmit}>
          Start chat
        </button>
      </div>
    </div>
  );

  const renderNavigation = () => {
    if (isSubmitted) {
      return (
        <div className="chat-nav-buttons">
          <button className="chat-btn chat-btn-back" onClick={resetForm}>
            🔄 New Search
          </button>
          <button className="chat-btn chat-btn-next" onClick={onClose}>
            ✕ Close
          </button>
        </div>
      );
    }

    return (
      <div className="chat-nav-buttons">
        {currentStep > 1 ? (
          <button className="chat-btn chat-btn-back" onClick={handleBack}>
            ← Back
          </button>
        ) : (
          <div></div>
        )}
        <button 
          className="chat-btn chat-btn-next" 
          onClick={handleNext}
          disabled={!isStepValid()}
        >
          {currentStep === 3 ? 'See Summary' : 'Next →'}
        </button>
      </div>
    );
  };

  return (
    <div className="chat-modal-overlay">
      <div className="chat-modal">
        <button className="chat-modal-close" onClick={onClose}>
          ×
        </button>
        
        {renderProgressDots()}
        
        {currentStep === 1 && renderStep1()}
        {currentStep === 2 && renderStep2()}
        {currentStep === 3 && renderStep3()}
        {isSubmitted && renderSummary()}
        
        {!isSubmitted && renderNavigation()}
      </div>
    </div>
  );
}

export default Chat;

