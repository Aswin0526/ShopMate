import React, { useState, useEffect } from 'react';
import '../styles/Shopdash.css';
import Overview from '../components/Overview';
import Update from '../components/Update';

const Shopdash = () => {
  const [shopData, setShopData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [feedbacks, setFeedbacks] = useState([]);

  const renderStars = (rating) => {
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;
    const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);

    let stars = '';
    for (let i = 0; i < fullStars; i++) {
      stars += '⭐';
    }

    if (hasHalfStar) {
      stars += '⭳';
    }

    for (let i = 0; i < emptyStars; i++) {
      stars += '☆';
    }
    return stars;
  };

  useEffect(() => {
    const storedShopData = localStorage.getItem('user_data');
    if (storedShopData) {
      try {
        const parsedData = JSON.parse(storedShopData);
        setShopData(parsedData.shop || parsedData);
      } catch (error) {
        console.error('Error parsing shop data:', error);
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    console.log("shopData updated:", shopData);
    if (!shopData) return;
    
    const shopId = shopData.shop_id || shopData.id;
    console.log("Using shopId:", shopId);
    
    if (!shopId) {
      console.log("No shop ID found in shopData");
      return;
    }

    const fetchFeedbacks = async () => {
      try {
        console.log("Fetching feedbacks...")
        const token = localStorage.getItem('access_token');
        const response = await fetch(
          "http://localhost:5000/api/owners/getfeedbacks",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`,
            },
            body: JSON.stringify({
              shop_id: shopId,
            }),
          }
        );

        const data = await response.json();
        console.log("Feedbacks API response:", data);
        if (data.success && data.data) {
          setFeedbacks(data.data);
        }
      } catch (error) {
        console.error("Error fetching feedbacks:", error);
      }
    };

    fetchFeedbacks();
  }, [shopData]);


  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading shop data...</p>
      </div>
    );
  }

  if (!shopData) {
    return (
      <div className="error-container">
        <p>No shop data found. Please login again.</p>
      </div>
    );
  }

  return (
    <div className="container">
      {/* Header Section */}
      <header className="header">
        <div className="header-left">
          <div className="shop-logo">
            {shopData.shop_name ? shopData.shop_name.charAt(0).toUpperCase() : 'S'}
          </div>
          <div className="shop-info">
            <h1 className="shop-name">{shopData.shop_name || 'My Shop'}</h1>
            <p className="shop-email">{shopData.shop_email}</p>
          </div>
        </div>
        <nav className="nav">
          <button
            className={activeTab === 'overview' ? 'nav-link active' : 'nav-link'}
            onClick={() => setActiveTab('overview')}
          >
            Overview
          </button>
          <button
            className={activeTab === 'stock' ? 'nav-link active' : 'nav-link'}
            onClick={() => setActiveTab('stock')}
          >
            Stock
          </button>
          <button
            className={activeTab === 'map' ? 'nav-link active' : 'nav-link'}
            onClick={() => setActiveTab('map')}
          >
            Map
          </button>
          <button
            className={activeTab === 'update' ? 'nav-link active' : 'nav-link'}
            onClick={() => setActiveTab('update')}
          >
            Update
          </button>
          <button
            className={activeTab === 'preorder' ? 'nav-link active' : 'nav-link'}
            onClick={() => setActiveTab('preorder')}
          >
            Preorder Notification
          </button>
        </nav>
      </header>
      {activeTab === 'overview' && <Overview Data = {shopData} />}
      {activeTab === 'update' && <Update Data = {shopData}/>}
        
    </div>
  );
};

export default Shopdash;

