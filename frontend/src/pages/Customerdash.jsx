import React, { useState } from 'react';
import '../styles/Customerdash.css';
import CHome from '../components/CHome';
import Corder from '../components/COrder';
import Custorders from '../components/Custorders';
import Chat from '../components/Chat';
import CUpdate from '../components/CUpdate';

function Customerdash() {
  const custData = JSON.parse(localStorage.getItem('user_data'));
  const [activeTab, setActiveTab] = useState('Home');
  const [showChat, setShowChat] = useState(false);

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
          {['Home', 'WishList', 'Orders', 'Update'].map(tab => (
            <button
              key={tab}
              className={activeTab === tab ? 'nav-link active' : 'nav-link'}
              onClick={() => {
                setActiveTab(tab);
                setShowChat(false);
              }}
            >
              {tab}
            </button>
          ))}
          <button
            className={showChat ? 'nav-link active' : 'nav-link'}
            onClick={() => {
              setShowChat(true);
              setActiveTab('Chat');
            }}
          >
            Chat
          </button>
        </nav>
      </header> 

      <main>
        {activeTab === 'Home' && !showChat && <CHome custData={custData} />}
        {activeTab === 'WishList' && !showChat && <Corder custData={custData} />}
        {activeTab === 'Orders' && !showChat && <Custorders custData={custData} />}
        {activeTab === 'Chat' && showChat && (
          <Chat custData={custData} onClose={() => setShowChat(false)} />
        )}
        {activeTab === 'Update' && !showChat && <CUpdate custData={custData} />}
      </main>
    </div>
  );
}

export default Customerdash;

