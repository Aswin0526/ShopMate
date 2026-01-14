import React, { useState } from 'react';
import '../styles/Customerdash.css';
import CHome from '../components/CHome';
import Corder from '../components/COrder';

function Customerdash() {
  const custData = JSON.parse(localStorage.getItem('user_data'));
  const [activeTab, setActiveTab] = useState('Home');

  return (
    <div className="container">
      <header className="header">
        <div className="header-left">
          <div className="user-logo">C</div>
          <div className="user-info">
            {custData?.customer_name || 'Undefined'}
          </div>
        </div>

        <nav className="nav">
          {['Home', 'Orders', 'Update', 'Chat'].map(tab => (
            <button
              key={tab}
              className={activeTab === tab ? 'nav-link active' : 'nav-link'}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </nav>
      </header>

      <main>
        {activeTab === 'Home' && <CHome custData={custData} />}
        {activeTab === 'Orders' && <Corder custData={custData} />}
      </main>
    </div>
  );
}

export default Customerdash;
