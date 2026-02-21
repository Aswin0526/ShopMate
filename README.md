# ShopMate

A voice-enabled assistant to guide customers through store navigation and provide product information when store staff are unavailable, enhancing self-service and customer experience.

---

## Architecture Diagram

```mermaid
flowchart TB
    subgraph CLIENT["CLIENT LAYER"]
        subgraph FRONTEND["Frontend (React + Vite)"]
            F1[Login Page]
            F2[Register Page]
            F3[Customer Dashboard]
            F4[Shop Owner Dashboard]
            F5[Chat Component]
            F6[Voice Component]
            F7[Map Component]
            F8[Overview Component]
            F9[Stock Component]
            F10[Preorder Component]
            F11[Update Component]
            F12[ShopDetail Component]
        end
    end

    CLIENT -->|REST API| BACKEND

    subgraph BACKEND["BACKEND LAYER"]
        subgraph EXPRESS["Express.js Server"]
            B1[Routes<br/>- /customers<br/>- /owners<br/>- /locations<br/>- /auth/refresh]
            B2[Controllers<br/>- authController<br/>- customerController<br/>- ownerController]
            B3[Middleware<br/>- Auth (JWT)]
            B4[Database Config]
            B5[Utils<br/>- tokenUtils<br/>- validation]
        end
    end

    BACKEND -->|HTTP/REST| CHATBOT

    subgraph CHATBOT["AI CHATBOT LAYER"]
        subgraph FLASK["Flask Server"]
            C1[Intent Classification<br/>- Small Talk<br/>- Data Query<br/>- Out of Domain]
            C2[Sentence Transformers]
            C3[LangChain Pipeline<br/>- Gemini LLM<br/>- SQL Query Generator<br/>- Query Executor<br/>- Response Formatter]
            C4[Session Management<br/>- Chat Sessions<br/>- History Tracking<br/>- Rate Limiting]
            C5[API Endpoints<br/>- /start-chat<br/>- /transcribe<br/>- /chat-history<br/>- /clear-chat]
        end
    end

    CHATBOT -->|SQL Queries| DATABASE

    subgraph DATABASE["DATABASE LAYER"]
        D1[(PostgreSQL)]
        D2[Tables<br/>- customers<br/>- owners<br/>- products<br/>- orders<br/>- locations<br/>- stocks<br/>- categories<br/>- wishlist<br/>- order_items<br/>- refresh_tokens<br/>- shop-specific tables]
    end

    style CLIENT fill:#e1f5fe,stroke:#01579b
    style FRONTEND fill:#b3e5fc,stroke:#0277bd
    style BACKEND fill:#e8f5e9,stroke:#2e7d32
    style EXPRESS fill:#c8e6c9,stroke:#388e3c
    style CHATBOT fill:#fff3e0,stroke:#e65100
    style FLASK fill:#ffe0b2,stroke:#f57c00
    style DATABASE fill:#f3e5f5,stroke:#7b1fa2
```

---

## Tech Stack

### Frontend
- **Framework**: React 18 + Vite
- **Routing**: React Router v6
- **Styling**: CSS Modules
- **HTTP Client**: Fetch API
- **Build Tool**: Vite

### Backend
- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: PostgreSQL
- **Authentication**: JWT (JSON Web Tokens)
- **Middleware**: Helmet, CORS, Morgan, Multer
- **Package Manager**: npm

### Chatbot
- **Framework**: Flask (Python)
- **AI/ML**:
  - Google Gemini 2.5 Flash (LLM)
  - LangChain (SQL query generation)
  - Sentence Transformers (Intent classification)
- **Database**: PostgreSQL (SQLAlchemy)
- **Package Manager**: pip

### Database
- **Type**: PostgreSQL
- **Hosting**: Cloud (Neon/Supabase/AWS RDS)

---

## Project Structure

```
ShopMate/
├── frontend/                 # React Frontend
│   ├── src/
│   │   ├── components/       # Reusable UI components
│   │   │   ├── Chat.jsx     # AI Chat interface
│   │   │   ├── Voice.jsx    # Voice input component
│   │   │   ├── Map.jsx      # Store map display
│   │   │   ├── Overview.jsx # Dashboard overview
│   │   │   ├── Stock.jsx    # Inventory management
│   │   │   └── ...
│   │   ├── pages/           # Page components
│   │   │   ├── Login.jsx
│   │   │   ├── Register.jsx
│   │   │   ├── Customerdash.jsx
│   │   │   └── Shopdash.jsx
│   │   ├── styles/          # CSS files
│   │   └── App.jsx          # Main app component
│   └── package.json
│
├── backend/                  # Express.js Backend
│   ├── controllers/         # Route handlers
│   │   ├── authController.js
│   │   ├── customerController.js
│   │   └── ownerController.js
│   ├── routes/              # API routes
│   │   ├── customerRoutes.js
│   │   ├── ownerRoutes.js
│   │   └── locationRoutes.js
│   ├── middleware/         # Custom middleware
│   │   └── auth.js          # JWT authentication
│   ├── config/
│   │   └── database.js      # DB connection
│   ├── utils/
│   │   ├── tokenUtils.js
│   │   └── validation.js
│   └── server.js            # Express server entry
│
├── chatbot/                 # Flask AI Chatbot
│   ├── server.py            # Main Flask app
│   ├── chatwithsql.py       # LangChain SQL chain
│   ├── lserver.py           # Additional server
│   ├── syncdb.py            # Database sync
│   └── requirements.txt
│
└── README.md
```

---

## Features

### Customer Features
- 🔊 **Voice-enabled shopping assistant** - Ask about products using voice
- 🛒 **Product search** - Find products by name, category, brand
- 📍 **Store navigation** - Locate products within the store
- 💰 **Price information** - Get real-time pricing
- 📦 **Stock availability** - Check product availability
- 🗺️ **Interactive maps** - Visual store layout

### Shop Owner Features
- 📊 **Dashboard** - Overview of shop performance
- 📦 **Inventory management** - Add/update/remove products
- 🛒 **Order management** - View and process orders
- 📈 **Analytics** - Sales and stock reports

### AI Chatbot Capabilities
- 🎯 **Intent classification** - Understand user queries
- 💬 **Natural language processing** - Human-like responses
- 🔍 **SQL generation** - Dynamic database queries
- ⏱️ **Rate limiting** - Prevent spam/abuse
- 👤 **Session management** - Personalized interactions

---

## API Endpoints

### Authentication
- `POST /api/auth/refresh` - Refresh access token

### Customers
- `POST /api/customers/register` - Customer registration
- `POST /api/customers/login` - Customer login
- `GET /api/customers/profile` - Get customer profile
- `PUT /api/customers/profile` - Update customer profile

### Owners
- `POST /api/owners/register` - Shop owner registration
- `POST /api/owners/login` - Shop owner login
- `GET /api/owners/shops` - Get owner's shops
- `POST /api/owners/products` - Add product
- `PUT /api/owners/products/:id` - Update product
- `DELETE /api/owners/products/:id` - Delete product

### Locations
- `GET /api/locations` - Get all locations
- `GET /api/locations/:id` - Get location details

### Chatbot
- `POST /chatbot/start-chat` - Initialize chat session
- `POST /chatbot/transcribe` - Process voice/text input
- `GET /chatbot/chat-history` - Get chat history
- `POST /chatbot/clear-chat` - Clear chat history

---

## Getting Started

### Prerequisites
- Node.js 18+
- Python 3.8+
- PostgreSQL database

### Installation

1. **Clone the repository**
   
```
bash
   git clone <repository-url>
   cd ShopMate
   
```

2. **Setup Backend**
   
```
bash
   cd backend
   npm install
   # Configure .env file
   npm start
   
```

3. **Setup Frontend**
   
```
bash
   cd frontend
   npm install
   npm run dev
   
```

4. **Setup Chatbot**
   
```
bash
   cd chatbot
   pip install -r requirements.txt
   python server.py
   
```

---

## Environment Variables

### Backend (.env)
```
PORT=5000
FRONTEND_URL=http://localhost:5173
DATABASE_URL=postgresql://...
JWT_SECRET=your-secret-key
```

### Chatbot (.env)
```
user=postgres
password=your-password
host=localhost
port=5432
dbname=shopmate
GEMENI_API_KEY=your-gemini-key
```

---

## License

MIT License
