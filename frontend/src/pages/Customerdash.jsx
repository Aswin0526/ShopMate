import React from 'react';
import '../styles/Customerdash.css';

function Customerdash() {
  return (
    <div className="container">
      <header className="header">
        <div className="header-left">
          <div className="user-logo">C</div>
          <div className="user-info">
            <h1 className="user-name">Customer Dashboard</h1>
            <p className="user-email">Welcome back!</p>
          </div>
        </div>
        <nav className="nav">
          <button className="nav-link active">Overview</button>
          <button className="nav-link">Orders</button>
          <button className="nav-link">Wishlist</button>
          <button className="nav-link">Settings</button>
        </nav>
      </header>

      <main className="main">
        <section className="section">
          <h2 className="section-title">Quick Stats</h2>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon">📦</div>
              <div className="stat-value">12</div>
              <div className="stat-label">Total Orders</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">❤️</div>
              <div className="stat-value">8</div>
              <div className="stat-label">Wishlist Items</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">⭐</div>
              <div className="stat-value">5</div>
              <div className="stat-label">Reviews</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">🛒</div>
              <div className="stat-value">2</div>
              <div className="stat-label">In Cart</div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default Customerdash;

