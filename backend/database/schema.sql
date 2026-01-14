-- ShopMate Database Schema

-- Create database (run this separately if needed)
-- CREATE DATABASE shopmate;

-- Users/Customers Table
CREATE TABLE IF NOT EXISTS customers (
    customer_id SERIAL PRIMARY KEY,
    customer_name VARCHAR(100) NOT NULL,
    customer_phone VARCHAR(20) NOT NULL UNIQUE,
    customer_email VARCHAR(100) NOT NULL UNIQUE,
    customer_state VARCHAR(50) NOT NULL,
    customer_country VARCHAR(50) NOT NULL,
    customer_city VARCHAR(50) NOT NULL,
    customer_pincode VARCHAR(10) NOT NULL,
    customer_password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Shop Owners Table
CREATE TABLE IF NOT EXISTS owners (
    owner_id SERIAL PRIMARY KEY,
    owner_name VARCHAR(100) NOT NULL,
    owner_email VARCHAR(100) NOT NULL UNIQUE,
    owner_phone VARCHAR(20) NOT NULL UNIQUE,
    owner_location VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Shops Table (linked to owners)
CREATE TABLE IF NOT EXISTS shops (
    shop_id SERIAL PRIMARY KEY,
    owner_id INTEGER NOT NULL,
    shop_name VARCHAR(150) NOT NULL,
    shop_phone VARCHAR(20) NOT NULL,
    shop_email VARCHAR(100) NOT NULL UNIQUE,
    shop_website VARCHAR(255),
    shop_country VARCHAR(50) NOT NULL,
    shop_state VARCHAR(50) NOT NULL,
    shop_city VARCHAR(50) NOT NULL,
    shop_pincode VARCHAR(10) NOT NULL,
    shop_gmap_link TEXT,
    shop_image TEXT,
    shop_password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES owners(owner_id) ON DELETE CASCADE
);

-- Refresh Tokens Table (for access token refresh)
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    user_type VARCHAR(20) NOT NULL CHECK (user_type IN ('customer', 'owner')),
    refresh_token VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    is_revoked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(customer_email);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(customer_phone);
CREATE INDEX IF NOT EXISTS idx_owners_email ON owners(owner_email);
CREATE INDEX IF NOT EXISTS idx_owners_phone ON owners(owner_phone);
CREATE INDEX IF NOT EXISTS idx_shops_owner ON shops(owner_id);
CREATE INDEX IF NOT EXISTS idx_shops_email ON shops(shop_email);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(refresh_token);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id, user_type);

-- Shop Images Table (stores logo and shop images as BYTEA)
CREATE TABLE IF NOT EXISTS shop_images (
    shop_id INTEGER PRIMARY KEY,
    logo BYTEA NOT NULL,
    pic1 BYTEA,
    pic2 BYTEA,
    pic3 BYTEA,
    pic4 BYTEA,
    pic5 BYTEA,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (shop_id) REFERENCES shops(shop_id) ON DELETE CASCADE
);

-- Wishlists Table (stores customer wishlist items)
CREATE TABLE IF NOT EXISTS wishlists (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL,
    product_id VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(customer_id) ON DELETE CASCADE,
    UNIQUE (customer_id, product_id)
);
