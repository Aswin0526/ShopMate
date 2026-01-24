import React, { useEffect, useState, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import '../styles//ShopDetail.css';

function ShopDetail() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const { shopId, shopType, shopName, custId } = state || {};
  const token = localStorage.getItem('access_token');

  const [shop, setShop] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [avgRating, setAvgRating] = useState(0);
  const [feedbacks, setFeedbacks] = useState([]);
  const [shopImages, setShopImages] = useState({});
  const [products, setProducts] = useState([]);
  const [columns, setColumns] = useState([]);
  const [previewImage, setPreviewImage] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);

  const [wishlist, setWishlist] = useState(new Set());

  const [userRating, setUserRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [userFeedback, setUserFeedback] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Handle star click with console log
  const handleStarClick = (rating) => {
    setUserRating(rating);
    console.log('Star clicked - Rating:', rating);
  };

  const handleFeedbackSubmit = async () => {
    console.log('Feedback submitted:', {
      rating: userRating,
      feedback: userFeedback || 'No comment provided'
    });
    try {
      console.log("inside feedback");
            const response = await fetch(
                `${import.meta.env.VITE_BACKEND_URL}/api/customers/addfeedback`,
                {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            customer_id: custId,
            shopId: shopId,
            rating: userRating,
            feedback: userFeedback
          }),
        }
      );
      const data = await response.json();
      if (!data.success) {
        setError(data.message || "Failed to provide feedback");
      }
    } catch (err) {
      console.error("error:", err);
      setError("Error");
    }
    setUserRating(0);
    setUserFeedback('');
  };

  const handleAddToWishlist = async (product) => {
    const productId = product.id;

    setWishlist(new Set([productId]));

    try {
      console.log("inside handlewishlist");
            const response = await fetch(
                `${import.meta.env.VITE_BACKEND_URL}/api/customers/addWishList`,
                {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            cust_id: custId,
            productId: productId,
            shopId: shopId
          }),
        }
      );
      const data = await response.json();
      if (!data.success) {
        setError(data.message || "Failed to add product to wishlist");
      }
    } catch (err) {
      console.error("Wishlist error:", err);
      setError("Error adding product to wishlist");
    }
  };


  if(wishlist){
    console.log("wishlist",wishlist);
  } 



  const normalizedShopName = shopName
    ? shopName
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, '')
    : '';

  const tableName = shopId && shopType && shopName ? `${shopType}_${shopId}_${normalizedShopName}` : '';
  console.log(tableName);

  const fetchProducts = async () => {
    if (!tableName) return;
    
    try {
      setLoading(true);
      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/owners/get-products`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ table_name: tableName, shop_type: shopType }),
      });

      const data = await response.json();
      console.log(data);
      if (data.success) {
        setProducts(data.data?.products || []);
        setColumns(data.data?.columns || []);
      } else {
        setError(data.message || 'Failed to fetch products');
      }
    } catch (err) {
      console.error('Error fetching products:', err);
      setError('Error fetching products');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tableName) {
      fetchProducts();
    }
  }, [tableName]);

  const filteredProducts = useMemo(() => {
    if (!searchTerm) return products;
    return products.filter(product =>
      Object.values(product).some(value =>
        String(value || '').toLowerCase().includes(searchTerm.toLowerCase())
      )
    );
  }, [products, searchTerm]);

  const paginatedProducts = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredProducts.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredProducts, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);

  const displayColumns = useMemo(() => {
    return columns.filter(col => {
      const excluded = ['id', 'created_at', 'updated_at', 'image1', 'image2', 'image3', 'image4', 'image5'];
      return !excluded.includes(col.column_name?.toLowerCase());
    });
  }, [columns]);


  const renderStars = (rating) => {
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;
    const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);
    const stars = [];

    for (let i = 0; i < fullStars; i++) {
      stars.push(<i key={`full-${i}`} className="fa-solid fa-star" style={{ color: '#FFC107' }}></i>);
    }

    if (hasHalfStar) {
      stars.push(<i key="half" className="fa-solid fa-star-half-stroke" style={{ color: '#FFC107' }}></i>);
    }

    for (let i = 0; i < emptyStars; i++) {
      stars.push(<i key={`empty-${i}`} className="fa-regular fa-star" style={{ color: '#FFC107' }}></i>);
    }

    return <div className="rating-stars">{stars}</div>;
  };

  useEffect(() => {
    if (!shopId) return;
    
    const fetchAvgRating = async () => {
      try {
        const token = localStorage.getItem('access_token');
            const response = await fetch(
                `${import.meta.env.VITE_BACKEND_URL}/api/owners/getAvgRatings`,
                {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`,
            },
            body: JSON.stringify({ shop_id: shopId }),
          }
        );

        const data = await response.json();
        if (data.success && data.data !== null) {
          setAvgRating(parseFloat(data.data) || 0);
        }
      } catch (error) {
        console.error("Error fetching average rating:", error);
      }
    };

    fetchAvgRating();
  }, [shopId]);

  // Fetch feedbacks
  useEffect(() => {
    if (!shopId) return;

    const fetchFeedbacks = async () => {
      try {
        const token = localStorage.getItem('access_token');
            const response = await fetch(
                `${import.meta.env.VITE_BACKEND_URL}/api/owners/getfeedbacks`,
                {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`,
            },
            body: JSON.stringify({ shop_id: shopId }),
          }
        );

        const data = await response.json();
        console.log("get feedback data", data);
        if (data.success && data.data) {
          setFeedbacks(data.data);
        }
      } catch (error) {
        console.error("Error fetching feedbacks:", error);
      }
    };

    fetchFeedbacks();
  }, [shopId]);

  // Fetch shop images
  useEffect(() => {
    if (!shopId) return;

    const fetchShopImages = async () => {
      try {
        const token = localStorage.getItem('access_token');
      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/owners/get-shop-images`, {
        method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ shop_id: shopId }),
        });
        const result = await response.json();
        if (result.success) {
          setShopImages(result.data);
        }
      } catch (err) {
        console.error('Error fetching shop images:', err);
      }
    };
    fetchShopImages();
  }, [shopId]);

  // Fetch shop details
  useEffect(() => {
    if (!shopId) {
      setError('No shop ID provided');
      setLoading(false);
      return;
    }

    const fetchShopDetails = async () => {
      try {
        const token = localStorage.getItem('access_token');
        const response = await fetch(
          `${import.meta.env.VITE_BACKEND_URL}/api/customers/getShopDetails`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`,
            },
            body: JSON.stringify({ shop_id: shopId }),
          }
        );

        const data = await response.json();
        if (data.success) {
          setShop(data.data);
        } else {
          setError(data.message || 'Failed to fetch shop details');
        }
      } catch (err) {
        setError('Error fetching shop details');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchShopDetails();
  }, [shopId]);

  const handleBack = () => {
    navigate(-1);
  };

  if (loading) {
    return (
      <div className="shop-detail-container">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p className="loading-text">Loading shop details...</p>
        </div>
      </div>
    );
  }


  if (!shop) {
    return (
      <div className="shop-detail-container">
        <div className="error-container">
          <div className="error-icon">🔍</div>
          <h3 className="error-title">Shop Not Found</h3>
          <p className="error-text">The shop you're looking for doesn't exist.</p>
          <button onClick={handleBack} className="back-button">
            ← Go Back
          </button>
        </div>
      </div>
    );
  }

  const processImageSrc = (data) => {
    if (!data) return null;
    
    try {
      let base64String = '';

      if (data && data.type === 'Buffer' && Array.isArray(data.data)) {
        const uint8 = new Uint8Array(data.data);
        base64String = btoa(String.fromCharCode.apply(null, uint8));
      } 

      else if (typeof data === 'string') {
        let clean = data.trim().replace(/['"]+/g, '');
        
        if (clean.includes('base64,ZGF0Y')) {
          const encodedPart = clean.split('base64,')[1];
          return processImageSrc(atob(encodedPart));
        }
        
        if (clean.startsWith('data:image')) return clean;
        base64String = clean;
      } else {
        return null;
      }

      return base64String.startsWith('data:image') 
        ? base64String 
        : `data:image/jpeg;base64,${base64String}`;
    } catch (e) {
      console.error("Error processing image:", e);
      return null;
    }
  };

  return (
    <div className="shop-detail-container">
      <button onClick={handleBack} className="back-button">
        ← Back
      </button>

      {/* Store Name Section */}
      <div className="store-name-section">
        <h1 className="store-name">{shop.shop_name}</h1>
        <span className="shop-type">{shop.type}</span>
      </div>

      {/* Details and Photos Row */}
      <div className="details-photos-row">
        <div className="details-section">
          <div className="info-grid">
            <div className="info-item">
              <span className="info-label">📍 Location:</span>
              {shop.shop_city}, {shop.shop_state}, {shop.shop_country}
            </div>
            <div className="info-item">
              <span className="info-label">📮 Pincode:</span>
              {shop.shop_pincode}
            </div>
            <div className="info-item">
              <span className="info-label">📧 Email:</span>
              {shop.shop_email}
            </div>
            <div className="info-item">
              <span className="info-label">📞 Phone:</span>
              {shop.shop_phone}
            </div>
          </div>

          <div className="description-section">
            <h3>About This Shop</h3>
            <p className="about-shop">
              {shop.shop_name} is a {shop.type} shop located in {shop.shop_city}, {shop.shop_state}.
              {shop.shop_website && (
                <span> Visit their website at <a href={shop.shop_website} target="_blank" rel="noopener noreferrer">{shop.shop_website}</a>.</span>
              )}
            </p>
          </div>
        </div>

        <div className="photos-section">
          <h3>Shop Images</h3>
          <div className="images-grid">
            {shopImages && shopImages.pic1 && <img src={shopImages.pic1} alt="Shop 1" />}
            {shopImages && shopImages.pic2 && <img src={shopImages.pic2} alt="Shop 2" />}
            {shopImages && shopImages.pic3 && <img src={shopImages.pic3} alt="Shop 3" />}
            {shopImages && shopImages.pic4 && <img src={shopImages.pic4} alt="Shop 4" />}
            {shopImages && shopImages.pic5 && <img src={shopImages.pic5} alt="Shop 5" />}
          </div>
        </div>
      </div>

      {/* Ratings and Feedback Row */}
      <div className="ratings-feedback-row">
        {/* Ratings Section - 50% */}
        <section className="section ratings-section">
          <h2 className="section-title">Ratings & Reviews</h2>
          <div className="ratings-container">
            <div className="rating-overview">
              <div className="rating-big">{avgRating || 0}</div>
              {renderStars(avgRating || 0)}
              <p className="rating-total">{feedbacks.length} reviews</p>
            </div>
            <div className="rating-breakdown">
              {[5, 4, 3, 2, 1].map((stars) => {
                const count = feedbacks.filter(f => Math.floor(f.ratings || 0) === stars).length;
                const percentage = feedbacks.length > 0 ? Math.round((count / feedbacks.length) * 100) : 0;
                return (
                  <div key={stars} className="rating-row">
                    <span className="rating-stars-text">{stars} ⭐</span>
                    <div className="rating-bar">
                      <div className="rating-fill" style={{ width: `${percentage}%` }}></div>
                    </div>
                    <span className="rating-count">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Feedback Section - 50% */}
        <section className="section feedback-section">
          <h2 className="section-title">Recent Feedback</h2>
          <div className="feedback-container">
            <div className="feedback-wrapper">
              {feedbacks.length === 0 ? (
                <p className="no-feedback">No feedbacks yet</p>
              ) : (
                <>
                  {[...feedbacks, ...feedbacks, ...feedbacks].map((feedback, index) => (
                    <div key={index} className="feedback-card">
                      <div className="feedback-header">
                        <span className="feedback-date">
                          {feedback.created_at ? new Date(feedback.created_at).toLocaleDateString() : 'N/A'}
                        </span>
                      </div>
                      <div className="feedback-stars">
                        {'⭐'.repeat(parseInt(feedback.ratings) || 0)}
                      </div>
                      <p className="feedback-comment">{feedback.feedback || 'No comment'}</p>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* Add Rating and Feedback Section */}
      <section className="section add-feedback-section">
        <h2 className="section-title">Add Your Rating & Feedback</h2>
        <div className="add-feedback-form">
          <div className="rating-input-container">
            <label className="rating-label">Your Rating:</label>
            <div className="interactive-stars">
              {[1, 2, 3, 4, 5].map((star) => (
                <span
                  key={star}
                  className={`star ${star <= (hoverRating || userRating) ? 'filled' : ''}`}
                  onClick={() => handleStarClick(star)}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                  style={{
                    cursor: 'pointer',
                    fontSize: '32px',
                    color: star <= (hoverRating || userRating) ? '#FFC107' : '#E0E0E0',
                    transition: 'color 0.2s ease',
                    marginRight: '4px'
                  }}
                >
                  ★
                </span>
              ))}
            </div>
            <span className="rating-text">
              {userRating > 0 ? `${userRating} star${userRating > 1 ? 's' : ''}` : 'Select a rating'}
            </span>
          </div>
          
          <div className="feedback-input-container">
            <label className="feedback-label" htmlFor="user-feedback">Your Feedback:</label>
            <textarea
              id="user-feedback"
              className="feedback-textarea"
              value={userFeedback}
              onChange={(e) => setUserFeedback(e.target.value)}
              placeholder="Share your experience with this shop..."
              rows={4}
            />
          </div>
          
          <button 
            className="submit-feedback-btn"
            onClick={handleFeedbackSubmit}
            disabled={userRating === 0}
          >
            Submit Feedback
          </button>
        </div>
      </section>

      Search
      <div className="stock-controls">
        <div className="search-box">
          <input
            type="text"
            placeholder="Search products..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
          />
          <span className="search-icon">🔍</span>
        </div>
        <div className="product-count">
          Total Products: {filteredProducts.length}
        </div>
      </div>

      <div className="table-wrapper">
        <table className="products-table">
          <thead>
            <tr>
              {displayColumns.map(col => (
                <th key={col.column_name}>
                  {col.column_name?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </th>
              ))}
              <th>Images</th>
              <th>Wishlist</th>
            </tr>
          </thead>
          <tbody>
            {paginatedProducts.length > 0 ? (
              paginatedProducts.map((product, index) => (
                <tr key={product.id || product.cosmetics_id || index}>
                  {displayColumns.map(col => {
                    const value = product[col.column_name];
                    const columnType = col.data_type;
                    let displayValue = value;
                    
                    if (value === null || value === undefined) {
                      displayValue = '-';
                    } else if (columnType === 'numeric' || columnType === 'decimal') {
                      displayValue = `₹${value}`;
                    } else if (columnType === 'boolean' || columnType === 'bool') {
                      displayValue = value ? '✅' : '❌';
                    } else if (columnType === 'date') {
                      displayValue = new Date(value).toLocaleDateString();
                    }
                    
                    return (
                      <td key={col.column_name}>
                        {displayValue}
                      </td>
                    );
                  })}

                  {/* Images Cell */}
                  <td className="images-cell">
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {['image1', 'image2', 'image3', 'image4', 'image5'].map((key) => {
                        const rawData = product[key];
                        if (!rawData) return null;

                        const finalSrc = processImageSrc(rawData);

                        return finalSrc ? (
                          <img
                            key={`${product.id || index}-${key}`}
                            src={finalSrc}
                            alt="Product"
                            onClick={() => setPreviewImage(finalSrc)}
                            style={{
                              width: '50px',
                              height: '50px',
                              objectFit: 'cover',
                              borderRadius: '4px',
                              border: '1px solid #ccc',
                              backgroundColor: '#eee',
                              cursor: 'pointer'
                            }}
                          />
                        ) : null;
                      })}
                    </div>

                  </td>
                  {/* Wishlist Button Cell */}
                 <td>
                  {(() => {
                    const productId = product.id || product.cosmetics_id;
                    const isInWishlist = wishlist.has(productId);
                    return (
                      <button
                        onClick={() => handleAddToWishlist(product)}
                        disabled={isInWishlist}
                        style={{
                          padding: "6px 10px",
                          backgroundColor: isInWishlist ? "#4CAF50" : "#007bff",
                          color: "#fff",
                          border: "none",
                          borderRadius: "4px",
                          cursor: isInWishlist ? "default" : "pointer",
                        }}
                      >
                        {isInWishlist ? "Added" : "Add"}
                      </button>
                    );
                  })()}
                </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={displayColumns.length + 1} className="no-data">
                  {searchTerm ? 'No products match your search' : 'No products found'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {filteredProducts.length > itemsPerPage && (
        <div className="pagination">
          <button
            onClick={() => setCurrentPage(1)}
            disabled={currentPage === 1}
            className="page-btn"
          >
            ««
          </button>
          <button
            onClick={() => setCurrentPage(prev => prev - 1)}
            disabled={currentPage === 1}
            className="page-btn"
          >
            «
          </button>
          
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            let pageNum;
            if (totalPages <= 5) {
              pageNum = i + 1;
            } else if (currentPage <= 3) {
              pageNum = i + 1;
            } else if (currentPage >= totalPages - 2) {
              pageNum = totalPages - 4 + i;
            } else {
              pageNum = currentPage - 2 + i;
            }
            
            return (
              <button
                key={pageNum}
                onClick={() => setCurrentPage(pageNum)}
                className={`page-btn ${currentPage === pageNum ? 'active' : ''}`}
              >
                {pageNum}
              </button>
            );
          })}
          
          <button
            onClick={() => setCurrentPage(prev => prev + 1)}
            disabled={currentPage === totalPages}
            className="page-btn"
          >
            »
          </button>
          <button
            onClick={() => setCurrentPage(totalPages)}
            disabled={currentPage === totalPages}
            className="page-btn"
          >
            »»
          </button>
        </div>
      )}

      {/* Image Preview Modal */}
      {previewImage && (
        <div 
          className="image-preview-overlay" 
          onClick={() => setPreviewImage(null)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
            cursor: 'zoom-out'
          }}
        >
          <div style={{ position: 'relative', maxWidth: '90%', maxHeight: '90%' }}>
            <button 
              onClick={() => setPreviewImage(null)}
              style={{
                position: 'absolute',
                top: '-40px',
                right: '-40px',
                background: 'transparent',
                border: 'none',
                color: 'white',
                fontSize: '30px',
                cursor: 'pointer'
              }}
            >
              ×
            </button>
            <img 
              src={previewImage} 
              alt="Preview" 
              style={{ 
                maxWidth: '100%', 
                maxHeight: '80vh', 
                borderRadius: '8px',
                boxShadow: '0 5px 15px rgba(0,0,0,0.5)' 
              }} 
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default ShopDetail;

