import React, { useState } from 'react';
import '../styles/Chat.css';

const PRODUCT_TYPES = [
  { id: 'electronics', name: 'Electronics'},
  { id: 'books', name: 'Book Store' },
  { id: 'cosmetics', name: 'Cosmetics'},
  { id: 'clothing', name: 'Clothing'},
  { id: 'groceries', name: 'Groceries'},
];

function Chat({ custData, onClose }) {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    shopName: '',
    city: '',
    state: '',
    country: '',
    productType: '',
  });
  const [isSubmitted, setIsSubmitted] = useState(false);

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
      handleSubmit();
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
      const response = await fetch(
        "http://localhost:3000/start-chat",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            formData: formData
          }),
        }
      );
      const data = await response.json();
      if (!data.success) {
        console.error("Failed to start a chat");
      }
    } catch (err) {
      console.error("error:", err);
      setError("Error");
    }
    
  };

  const isStepValid = () => {
    switch (currentStep) {
      case 1:
        return formData.productType !== '';
      case 2:
        return formData.city.trim() !== '' && 
               formData.state.trim() !== '' && 
               formData.country.trim() !== '';
      case 3:
        return formData.shopName.trim() !== '';
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
      <div className="chat-location-inputs">
        <input
          type="text"
          className="chat-input"
          placeholder="City"
          value={formData.city}
          onChange={(e) => handleInputChange('city', e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleNext()}
          autoFocus
        />
        <div className="chat-location-row">
          <input
            type="text"
            className="chat-input"
            placeholder="State"
            value={formData.state}
            onChange={(e) => handleInputChange('state', e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleNext()}
          />
          <input
            type="text"
            className="chat-input"
            placeholder="Country"
            value={formData.country}
            onChange={(e) => handleInputChange('country', e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleNext()}
          />
        </div>
      </div>
    </div>
  );

    const renderStep3 = () => (
    <div className="chat-question-content">
      <div className="chat-question-number">Question 3 of 3</div>
      <h2 className="chat-question-title">Any particular shop you're looking for?</h2>
      <input
        type="text"
        className="chat-input"
        placeholder="Enter shop name..."
        value={formData.shopName}
        onChange={(e) => handleInputChange('shopName', e.target.value)}
        onKeyPress={(e) => e.key === 'Enter' && handleNext()}
        autoFocus
      />
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

