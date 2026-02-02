import React, { useState, useEffect } from 'react';
import '../styles/Map.css';

function Map({ Data }) {
  const [products, setProducts] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [productDirections, setProductDirections] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingDirections, setEditingDirections] = useState({
    direction1: '',
    direction2: '',
    direction3: '',
    direction4: '',
    direction5: '',
    image1: null,
    image2: null,
    image3: null,
    image4: null,
    image5: null,
  });

  // Get table name from shop data
  const getTableName = () => {
    if (!Data) return null;
    const normalizedShopName = Data.shop_name
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '');
    return `${Data.type}_${Data.shop_id}_${normalizedShopName}`;
  };

  // Fetch products when component mounts
  useEffect(() => {
    if (Data) {
      fetchProducts();
    }
  }, [Data]);

  const fetchProducts = async () => {
    try {
      setIsLoading(true);
      const tableName = getTableName();
      
      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/owners/get-products`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
        },
        body: JSON.stringify({
          table_name: tableName,
          shop_type: Data.type,
        }),
      });

      const result = await response.json();
      if (result.success) {
        setProducts(result.data.products);
      } else {
        console.error('Failed to fetch products:', result.message);
      }
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchProductDirections = async (productId) => {
    try {
      setIsLoading(true);
      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/owners/get-product-directions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
        },
        body: JSON.stringify({
          shop_id: Data.shop_id,
          product_id: productId,
        }),
      });

      const result = await response.json();
      if (result.success) {
        setProductDirections(result.data);
        if (result.data) {
          setEditingDirections({
            direction1: result.data.direction1 || '',
            direction2: result.data.direction2 || '',
            direction3: result.data.direction3 || '',
            direction4: result.data.direction4 || '',
            direction5: result.data.direction5 || '',
            image1: result.data.image1,
            image2: result.data.image2,
            image3: result.data.image3,
            image4: result.data.image4,
            image5: result.data.image5,
          });
        } else {
          // Reset editing directions if no data found
          setEditingDirections({
            direction1: '',
            direction2: '',
            direction3: '',
            direction4: '',
            direction5: '',
            image1: null,
            image2: null,
            image3: null,
            image4: null,
            image5: null,
          });
        }
      }
    } catch (error) {
      console.error('Error fetching product directions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleProductSelect = (product) => {
    setSelectedProduct(product);
    setIsEditing(false);
    fetchProductDirections(product.id);
  };

  const handleImageUpload = (imageKey, file) => {
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setEditingDirections(prev => ({
          ...prev,
          [imageKey]: e.target.result,
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDirectionChange = (directionKey, value) => {
    setEditingDirections(prev => ({
      ...prev,
      [directionKey]: value,
    }));
  };

  const saveDirections = async () => {
    try {
      setIsLoading(true);
      const endpoint = productDirections ? 
        `${import.meta.env.VITE_BACKEND_URL}/api/owners/update-product-directions` : 
        `${import.meta.env.VITE_BACKEND_URL}/api/owners/add-product-directions`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
        },
        body: JSON.stringify({
          shop_id: Data.shop_id,
          product_id: selectedProduct.id,
          directions: editingDirections,
        }),
      });

      const result = await response.json();
      if (result.success) {
        alert('Directions saved successfully!');
        setIsEditing(false);
        fetchProductDirections(selectedProduct.id);
      } else {
        alert('Failed to save directions: ' + result.message);
      }
    } catch (error) {
      console.error('Error saving directions:', error);
      alert('Error saving directions');
    } finally {
      setIsLoading(false);
    }
  };

  const cancelEdit = () => {
    setIsEditing(false);
    if (productDirections) {
      setEditingDirections({
        direction1: productDirections.direction1 || '',
        direction2: productDirections.direction2 || '',
        direction3: productDirections.direction3 || '',
        direction4: productDirections.direction4 || '',
        direction5: productDirections.direction5 || '',
        image1: productDirections.image1,
        image2: productDirections.image2,
        image3: productDirections.image3,
        image4: productDirections.image4,
        image5: productDirections.image5,
      });
    }
  };

  if (!Data) {
    return <div className="map-container">No shop data available</div>;
  }

  return (
    <div className="map-container">
      <div className="map-header">
        <h2>Product Directions Manager</h2>
        <p>Shop: {Data.shop_name} | Type: {Data.type}</p>
      </div>

      <div className="map-content">
        {/* Products List */}
        <div className="products-section">
          <h3>Products</h3>
          {isLoading && <div className="loading">Loading...</div>}
          <div className="products-list">
            {products.map((product) => (
              <div
                key={product.id}
                className={`product-item ${selectedProduct?.id === product.id ? 'selected' : ''}`}
                onClick={() => handleProductSelect(product)}
              >
                <div className="product-info">
                  <h4>{product.product_name}</h4>
                  <p>Price: ${product.price}</p>
                  <p>Quantity: {product.quantity}</p>
                </div>
                {product.image1 && (
                  <img 
                    src={product.image1} 
                    alt={product.product_name}
                    className="product-thumbnail"
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Product Directions */}
        {selectedProduct && (
          <div className="directions-section">
            <div className="directions-header">
              <h3>Directions for: {selectedProduct.product_name}</h3>
              <div className="directions-actions">
                {!isEditing ? (
                  <button 
                    className="edit-btn"
                    onClick={() => setIsEditing(true)}
                  >
                    {productDirections ? 'Edit Directions' : 'Add Directions'}
                  </button>
                ) : (
                  <div className="edit-actions">
                    <button 
                      className="save-btn"
                      onClick={saveDirections}
                      disabled={isLoading}
                    >
                      Save
                    </button>
                    <button 
                      className="cancel-btn"
                      onClick={cancelEdit}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="directions-content">
              {[1, 2, 3, 4, 5].map((num) => {
                const directionKey = `direction${num}`;
                const imageKey = `image${num}`;
                
                return (
                  <div key={num} className="direction-item">
                    <h4>Step {num}</h4>
                    
                    {/* Direction Text */}
                    <div className="direction-text">
                      <label>Direction:</label>
                      {isEditing ? (
                        <textarea
                          value={editingDirections[directionKey]}
                          onChange={(e) => handleDirectionChange(directionKey, e.target.value)}
                          placeholder={`Enter direction for step ${num}`}
                          rows="3"
                        />
                      ) : (
                        <p>{productDirections?.[directionKey] || 'No direction available'}</p>
                      )}
                    </div>

                    {/* Direction Image */}
                    <div className="direction-image">
                      <label>Image:</label>
                      {isEditing ? (
                        <div className="image-upload">
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => handleImageUpload(imageKey, e.target.files[0])}
                          />
                          {editingDirections[imageKey] && (
                            <img 
                              src={editingDirections[imageKey]} 
                              alt={`Step ${num}`}
                              className="direction-preview"
                            />
                          )}
                        </div>
                      ) : (
                        <div className="image-display">
                          {productDirections?.[imageKey] ? (
                            <img 
                              src={productDirections[imageKey]} 
                              alt={`Step ${num}`}
                              className="direction-image-display"
                            />
                          ) : (
                            <p>No image available</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Map;