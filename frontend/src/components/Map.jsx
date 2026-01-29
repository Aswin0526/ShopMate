import React, { useEffect, useState, useRef } from 'react';

function Map({ Data }) {
  console.log('Map Data:', Data);
  
  const [products, setProducts] = useState([]);
  const [columns, setColumns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterProductId, setFilterProductId] = useState('');
  const [editingProduct, setEditingProduct] = useState(null);
  const [directionForm, setDirectionForm] = useState({
    image1: null,
    direction1: '',
    image2: null,
    direction2: '',
    image3: null,
    direction3: '',
    image4: null,
    direction4: '',
    image5: null,
    direction5: ''
  });
  const [savingDirections, setSavingDirections] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [expandedProducts, setExpandedProducts] = useState({});
  
  // Refs for file inputs
  const fileInputRefs = useRef({});

  // Extract shop info from Data prop
  const shopId = Data?.shop_id;
  const shopType = Data?.type;
  const shopName = Data?.shop_name;

  // Construct table name: type_shopId_shopName
  const normalizedShopName = shopName
    ? shopName.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
    : '';
  const tableName = shopId && shopType && shopName 
    ? `${shopType}_${shopId}_${normalizedShopName}` 
    : '';

  const token = localStorage.getItem('access_token');

  // Fetch products with directions
  useEffect(() => {
    if (!tableName || !shopId) {
      setLoading(false);
      return;
    }

    const fetchProductsWithDirections = async () => {
      try {
        setLoading(true);
        const response = await fetch(
          `${import.meta.env.VITE_BACKEND_URL}/api/owners/getProductsWithDirections`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              shop_id: shopId,
              table_name: tableName,
            }),
          }
        );

        const data = await response.json();
        console.log('Products with directions:', data);
        
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

    fetchProductsWithDirections();
  }, [tableName, shopId, token]);

  // Helper function to process image data
  const processImageSrc = (data) => {
    if (!data) return null;
    try {
      if (typeof data === 'string') {
        if (data.startsWith('data:image')) return data;
        return `data:image/jpeg;base64,${data}`;
      }
      return null;
    } catch (e) {
      console.error('Error processing image:', e);
      return null;
    }
  };

  // Helper to get display columns (excluding system columns and images)
  const getDisplayColumns = (columns) => {
    if (!columns) return [];
    return columns.filter(col => {
      const excluded = ['id', 'cosmetics_id', 'created_at', 'updated_at', 
                        'image1', 'image2', 'image3', 'image4', 'image5'];
      return !excluded.includes(col.column_name?.toLowerCase());
    });
  };

  // Filter products based on search term and product ID
  const filteredProducts = products.filter(product => {
    const productId = product.id || product.cosmetics_id;
    const productName = product.product_name || product.title || '';
    
    const matchesSearch = productName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesId = filterProductId === '' || productId?.toString() === filterProductId;
    
    return matchesSearch && matchesId;
  });

  // Handle image upload for directions
  const handleDirectionImageChange = (e, imageKey) => {
    const file = e.target.files[0];
    if (file) {
      console.log(`File selected for ${imageKey}:`, file.name, file.type, file.size);
      
      const reader = new FileReader();
      reader.onloadend = () => {
        console.log(`Image loaded for ${imageKey}, length:`, reader.result?.length);
        setDirectionForm(prev => ({
          ...prev,
          [imageKey]: reader.result
        }));
      };
      reader.onerror = () => {
        console.error('Error reading file for', imageKey);
      };
      reader.readAsDataURL(file);
    }
  };

  // Trigger file input click
  const triggerFileInput = (imageKey) => {
    if (fileInputRefs.current[imageKey]) {
      fileInputRefs.current[imageKey].click();
    }
  };

  // Open direction editor for a product
  const openDirectionEditor = (product) => {
    const productId = product.id || product.cosmetics_id;
    const existingDirections = product.directions || {};
    
    setEditingProduct(productId);
    setDirectionForm({
      image1: existingDirections.image1 || null,
      direction1: existingDirections.direction1 || '',
      image2: existingDirections.image2 || null,
      direction2: existingDirections.direction2 || '',
      image3: existingDirections.image3 || null,
      direction3: existingDirections.direction3 || '',
      image4: existingDirections.image4 || null,
      direction4: existingDirections.direction4 || '',
      image5: existingDirections.image5 || null,
      direction5: existingDirections.direction5 || ''
    });
    setSuccessMessage('');
  };

  // Save directions for a product
  const saveDirections = async () => {
    if (!editingProduct) return;
    
    setSavingDirections(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_BACKEND_URL}/api/owners/add-product-direction`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            shop_id: shopId,
            product_id: editingProduct,
            directions: directionForm
          }),
        }
      );

      const data = await response.json();
      if (data.success) {
        setSuccessMessage('Directions saved successfully!');
        
        // Refresh products to get updated directions
        const refreshResponse = await fetch(
          `${import.meta.env.VITE_BACKEND_URL}/api/owners/getProductsWithDirections`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              shop_id: shopId,
              table_name: tableName,
            }),
          }
        );

        const refreshData = await refreshResponse.json();
        if (refreshData.success) {
          setProducts(refreshData.data?.products || []);
        }
        
        // Close editor after 1.5 seconds
        setTimeout(() => {
          setEditingProduct(null);
          setSuccessMessage('');
        }, 1500);
      } else {
        setError(data.message || 'Failed to save directions');
      }
    } catch (err) {
      console.error('Error saving directions:', err);
      setError('Error saving directions');
    } finally {
      setSavingDirections(false);
    }
  };

  // Toggle product card expansion
  const toggleExpand = (productId) => {
    setExpandedProducts(prev => ({
      ...prev,
      [productId]: !prev[productId]
    }));
  };

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner}></div>
        <p>Loading products...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.errorContainer}>
        <p>Error: {error}</p>
      </div>
    );
  }

  if (!tableName) {
    return (
      <div style={styles.container}>
        <p>No shop data available</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Header Section */}
      <div style={styles.header}>
        <h2 style={styles.title}>Products for {shopName}</h2>
        <p style={styles.subtitle}>Table: {tableName}</p>
      </div>

      {/* Search and Filter Section */}
      <div style={styles.filterSection}>
        <div style={styles.searchBox}>
          <label style={styles.label}>Search by Product Name:</label>
          <input
            type="text"
            placeholder="Search products..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={styles.searchInput}
          />
        </div>
        <div style={styles.filterBox}>
          <label style={styles.label}>Filter by Product ID:</label>
          <input
            type="text"
            placeholder="Enter Product ID"
            value={filterProductId}
            onChange={(e) => setFilterProductId(e.target.value)}
            style={styles.filterInput}
          />
        </div>
      </div>

      {/* Results Count */}
      <div style={styles.resultsCount}>
        Showing {filteredProducts.length} of {products.length} products
      </div>

      {filteredProducts.length === 0 ? (
        <div style={styles.noProducts}>
          <p>No products found</p>
        </div>
      ) : (
        <div style={styles.productsGrid}>
          {filteredProducts.map((product) => {
            const productId = product.id || product.cosmetics_id;
            const isExpanded = expandedProducts[productId];
            const isEditing = editingProduct === productId;
            
            return (
              <div 
                key={productId} 
                style={styles.productCard}
              >
                {/* Product Header */}
                <div style={styles.productHeader}>
                  <div style={styles.productTitleRow}>
                    <h3 style={styles.productTitle}>
                      {product.product_name || product.title || 'Unnamed Product'}
                    </h3>
                    <span style={styles.productId}>ID: {productId}</span>
                  </div>
                  <button 
                    onClick={() => toggleExpand(productId)}
                    style={styles.expandButton}
                  >
                    {isExpanded ? '▼ Hide Details' : '▶ Show Details'}
                  </button>
                </div>

                {/* Product Images */}
                <div style={styles.imageGallery}>
                  {[1, 2, 3, 4, 5].map((i) => {
                    const imgKey = `image${i}`;
                    const imgSrc = processImageSrc(product[imgKey]);
                    if (!imgSrc) return null;
                    return (
                      <img
                        key={imgKey}
                        src={imgSrc}
                        alt={`${product.product_name || 'Product'} ${i}`}
                        style={styles.productImage}
                        onError={(e) => {
                          console.error(`Error loading image ${imgKey} for product`, productId);
                          e.target.style.display = 'none';
                        }}
                      />
                    );
                  })}
                </div>

                {/* Expandable Content */}
                {isExpanded && (
                  <div style={styles.expandedContent}>
                    {/* Product Details */}
                    <div style={styles.detailsSection}>
                      <h4 style={styles.sectionTitle}>Product Details</h4>
                      <div style={styles.detailsGrid}>
                        {getDisplayColumns(columns).map((col) => {
                          const value = product[col.column_name];
                          if (value === null || value === undefined) return null;
                          return (
                            <div key={col.column_name} style={styles.detailItem}>
                              <strong style={styles.detailLabel}>
                                {col.column_name?.replace(/_/g, ' ')}:
                              </strong>
                              <span style={styles.detailValue}>
                                {String(value)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Directions Section */}
                    <div style={styles.directionsSection}>
                      <div style={styles.directionsHeader}>
                        <h4 style={styles.sectionTitle}>Directions</h4>
                        {!isEditing && (
                          <button 
                            onClick={() => openDirectionEditor(product)}
                            style={styles.editButton}
                          >
                            {product.directions ? 'Edit Directions' : 'Add Directions'}
                          </button>
                        )}
                      </div>

                      {isEditing ? (
                        <div style={styles.editorContainer}>
                          {successMessage && (
                            <div style={styles.successMessage}>
                              {successMessage}
                            </div>
                          )}
                          
                          {[1, 2, 3, 4, 5].map((i) => (
                            <div key={i} style={styles.directionStep}>
                              <div style={styles.stepHeader}>
                                <span style={styles.stepNumber}>Step {i}</span>
                              </div>
                              
                              <div style={styles.stepContent}>
                                {/* Image Upload Section - Fixed */}
                                <div style={styles.imageUploadSection}>
                                  <input
                                    ref={el => fileInputRefs.current[`image${i}`] = el}
                                    type="file"
                                    accept="image/*"
                                    onChange={(e) => handleDirectionImageChange(e, `image${i}`)}
                                    style={styles.hiddenFileInput}
                                  />
                                  <div 
                                    onClick={() => triggerFileInput(`image${i}`)}
                                    style={{
                                      ...styles.uploadPlaceholder,
                                      cursor: 'pointer'
                                    }}
                                  >
                                    {directionForm[`image${i}`] ? (
                                      <img
                                        src={directionForm[`image${i}`]}
                                        alt={`Step ${i}`}
                                        style={styles.uploadedPreview}
                                      />
                                    ) : (
                                      <div style={styles.uploadIcon}>📷</div>
                                    )}
                                    <div style={styles.uploadText}>
                                      {directionForm[`image${i}`] ? 'Change' : `Image ${i}`}
                                    </div>
                                  </div>
                                </div>
                                
                                {/* Direction Select Dropdown */}
                                <select
                                  value={directionForm[`direction${i}`] || ''}
                                  onChange={(e) => setDirectionForm(prev => ({
                                    ...prev,
                                    [`direction${i}`]: e.target.value
                                  }))}
                                  style={styles.directionSelect}
                                >
                                  <option value="">Select direction...</option>
                                  <option value="right">Right</option>
                                  <option value="left">Left</option>
                                  <option value="straight">Straight</option>
                                </select>
                              </div>
                            </div>
                          ))}
                          
                          <div style={styles.editorActions}>
                            <button 
                              onClick={saveDirections}
                              disabled={savingDirections}
                              style={styles.saveButton}
                            >
                              {savingDirections ? 'Saving...' : 'Save Directions'}
                            </button>
                            <button 
                              onClick={() => setEditingProduct(null)}
                              style={styles.cancelButton}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : product.directions ? (
                        <div style={styles.directionsList}>
                          {[1, 2, 3, 4, 5].map((i) => {
                            const dirImage = product.directions[`image${i}`];
                            const dirText = product.directions[`direction${i}`];
                            
                            if (!dirImage && !dirText) return null;
                            
                            return (
                              <div 
                                key={i} 
                                style={styles.directionStep}
                              >
                                <div style={styles.stepHeader}>
                                  <span style={styles.stepNumber}>Step {i}</span>
                                </div>
                                
                                <div style={styles.stepContent}>
                                  {dirImage && (
                                    <img
                                      src={dirImage}
                                      alt={`Direction ${i}`}
                                      style={styles.directionImage}
                                      onError={(e) => {
                                        console.error(`Error loading direction image ${i}`);
                                        e.target.style.display = 'none';
                                      }}
                                    />
                                  )}
                                  {dirText && (
                                    <p style={styles.directionText}>
                                      {dirText}
                                    </p>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p style={styles.noDirections}>No directions added yet.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

const styles = {
  container: {
    padding: '20px',
    maxWidth: '1200px',
    margin: '0 auto',
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
  },
  loadingContainer: {
    padding: '40px',
    textAlign: 'center',
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: '4px solid #f3f3f3',
    borderTop: '4px solid #3498db',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    margin: '0 auto 20px',
  },
  errorContainer: {
    padding: '20px',
    color: '#e74c3c',
    textAlign: 'center',
  },
  header: {
    marginBottom: '20px',
    borderBottom: '2px solid #3498db',
    paddingBottom: '10px',
  },
  title: {
    margin: 0,
    color: '#2c3e50',
    fontSize: '28px',
  },
  subtitle: {
    margin: '5px 0 0',
    color: '#7f8c8d',
    fontSize: '14px',
  },
  filterSection: {
    display: 'flex',
    gap: '20px',
    marginBottom: '20px',
    flexWrap: 'wrap',
  },
  searchBox: {
    flex: 1,
    minWidth: '250px',
  },
  filterBox: {
    flex: 1,
    minWidth: '200px',
  },
  label: {
    display: 'block',
    marginBottom: '5px',
    fontWeight: '600',
    color: '#34495e',
  },
  searchInput: {
    width: '100%',
    padding: '10px 15px',
    border: '1px solid #bdc3c7',
    borderRadius: '8px',
    fontSize: '14px',
    transition: 'border-color 0.3s',
  },
  filterInput: {
    width: '100%',
    padding: '10px 15px',
    border: '1px solid #bdc3c7',
    borderRadius: '8px',
    fontSize: '14px',
  },
  resultsCount: {
    marginBottom: '15px',
    color: '#7f8c8d',
    fontSize: '14px',
  },
  noProducts: {
    textAlign: 'center',
    padding: '40px',
    backgroundColor: '#f8f9fa',
    borderRadius: '8px',
    color: '#7f8c8d',
  },
  productsGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  productCard: {
    backgroundColor: '#ffffff',
    border: '1px solid #e0e0e0',
    borderRadius: '12px',
    overflow: 'hidden',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  },
  productHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '15px 20px',
    backgroundColor: '#f8f9fa',
    borderBottom: '1px solid #e0e0e0',
  },
  productTitleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '15px',
  },
  productTitle: {
    margin: 0,
    color: '#2c3e50',
    fontSize: '20px',
  },
  productId: {
    backgroundColor: '#3498db',
    color: 'white',
    padding: '4px 10px',
    borderRadius: '20px',
    fontSize: '12px',
    fontWeight: '600',
  },
  expandButton: {
    padding: '8px 16px',
    backgroundColor: '#3498db',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '13px',
    transition: 'background-color 0.3s',
  },
  imageGallery: {
    display: 'flex',
    gap: '10px',
    padding: '15px 20px',
    overflowX: 'auto',
    backgroundColor: '#fafafa',
  },
  productImage: {
    width: '100px',
    height: '100px',
    objectFit: 'cover',
    borderRadius: '8px',
    border: '2px solid #e0e0e0',
  },
  expandedContent: {
    padding: '20px',
    borderTop: '1px solid #e0e0e0',
  },
  detailsSection: {
    marginBottom: '20px',
  },
  sectionTitle: {
    margin: '0 0 15px',
    color: '#2c3e50',
    fontSize: '18px',
    borderBottom: '2px solid #3498db',
    paddingBottom: '8px',
    display: 'inline-block',
  },
  detailsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: '10px',
  },
  detailItem: {
    padding: '8px 12px',
    backgroundColor: '#f8f9fa',
    borderRadius: '6px',
  },
  detailLabel: {
    display: 'block',
    fontSize: '12px',
    color: '#7f8c8d',
    marginBottom: '3px',
  },
  detailValue: {
    color: '#2c3e50',
    fontWeight: '500',
  },
  directionsSection: {
    marginTop: '20px',
  },
  directionsHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '15px',
  },
  editButton: {
    padding: '8px 16px',
    backgroundColor: '#27ae60',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '13px',
    transition: 'background-color 0.3s',
  },
  directionsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '15px',
  },
  directionStep: {
    backgroundColor: '#f8f9fa',
    borderRadius: '8px',
    overflow: 'hidden',
    border: '1px solid #e0e0e0',
  },
  stepHeader: {
    padding: '10px 15px',
    backgroundColor: '#3498db',
    color: 'white',
  },
  stepNumber: {
    fontWeight: '600',
    fontSize: '14px',
  },
  stepContent: {
    display: 'flex',
    gap: '15px',
    padding: '15px',
    alignItems: 'flex-start',
  },
  directionImage: {
    width: '120px',
    height: '120px',
    objectFit: 'cover',
    borderRadius: '8px',
    border: '2px solid #27ae60',
  },
  directionText: {
    margin: 0,
    flex: 1,
    color: '#2c3e50',
    lineHeight: '1.6',
  },
  noDirections: {
    color: '#7f8c8d',
    fontStyle: 'italic',
    textAlign: 'center',
    padding: '20px',
  },
  editorContainer: {
    backgroundColor: '#f8f9fa',
    borderRadius: '8px',
    padding: '20px',
  },
  successMessage: {
    backgroundColor: '#27ae60',
    color: 'white',
    padding: '10px 15px',
    borderRadius: '6px',
    marginBottom: '15px',
    textAlign: 'center',
  },
  imageUploadSection: {
    flex: '0 0 150px',
  },
  uploadPlaceholder: {
    width: '140px',
    height: '140px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ecf0f1',
    border: '2px dashed #bdc3c7',
    borderRadius: '8px',
    color: '#7f8c8d',
    fontSize: '13px',
    textAlign: 'center',
  },
  uploadIcon: {
    fontSize: '32px',
    marginBottom: '5px',
  },
  uploadText: {
    fontSize: '12px',
  },
  uploadedPreview: {
    width: '130px',
    height: '130px',
    objectFit: 'cover',
    borderRadius: '6px',
  },
  hiddenFileInput: {
    display: 'none',
  },
  directionTextarea: {
    flex: 1,
    padding: '10px',
    border: '1px solid #bdc3c7',
    borderRadius: '6px',
    fontSize: '14px',
    resize: 'vertical',
    minHeight: '80px',
  },
  directionSelect: {
    flex: 1,
    padding: '10px',
    border: '1px solid #bdc3c7',
    borderRadius: '6px',
    fontSize: '14px',
    backgroundColor: 'white',
    cursor: 'pointer',
    minHeight: '80px',
  },
  editorActions: {
    display: 'flex',
    gap: '10px',
    marginTop: '20px',
    justifyContent: 'flex-end',
  },
  saveButton: {
    padding: '10px 20px',
    backgroundColor: '#27ae60',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600',
  },
  cancelButton: {
    padding: '10px 20px',
    backgroundColor: '#e74c3c',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600',
  },
};

export default Map;
