# Plan: Add Product Directions Functionality to Map.jsx

## Completed Changes:

### 1. Database Schema (schema.sql) ✅
- Added `product_directions` table with:
  - `id` BIGSERIAL PRIMARY KEY
  - `shop_id` BIGINT NOT NULL (FK to shops)
  - `product_id` BIGINT NOT NULL (links to products)
  - `image1-5` BYTEA for storing direction images
  - `direction1-5` VARCHAR(500) for storing direction text
  - `created_at` and `updated_at` timestamps
  - Unique constraint on (shop_id, product_id)
  - Indexes for shop_id and product_id

### 2. Backend Controller (ownerController.js) ✅
- Added `addProductDirection` function:
  - Handles INSERT for new directions
  - Handles UPDATE for existing directions
  - Accepts 5 images (image1-5) and 5 direction texts (direction1-5)
  - Converts base64 images to buffers before storing
  - Returns success/error response

- Added `getProductDirection` function:
  - Fetches directions for a specific product
  - Returns all 5 images and direction texts as base64

- Updated `getProductsWithDirections` to properly link directions by product_id

### 3. Backend Routes (ownerRoutes.js) ✅
- Added route: `POST /api/owners/add-product-direction`
- Added route: `POST /api/owners/get-product-direction`

### 4. Frontend (Map.jsx) ✅
- Added CSS styling with modern card-based design
- Added search functionality by product_name
- Added filter functionality by product_id
- Added direction management UI:
  - Each product can have up to 5 direction steps
  - Each step has an image upload and text input
  - Steps are linked: image1 ↔ direction1, image2 ↔ direction2, etc.
  - Edit/Add directions button for each product
  - Form to upload images and enter direction text
  - Save button to persist changes
- Added expandable product cards with:
  - Product details grid
  - Product images gallery
  - Directions display with images alongside text
- Added loading spinner and error handling
- Added success messages for save operations

## Key Features:
1. **Image-Direction Linking**: Each image (image1-5) is linked to its corresponding direction (direction1-5)
2. **Search & Filter**: Users can search by product name and filter by product ID
3. **Expandable Cards**: Products show details when expanded
4. **Inline Editing**: Add/Edit directions directly in the product card
5. **Responsive Design**: Works on different screen sizes
6. **Image Preview**: Shows preview of uploaded images before saving
7. **Real-time Updates**: Product list refreshes after saving directions

## Next Steps (If needed):
- Run database migration to create product_directions table
- Test the backend API endpoints
- Test the frontend functionality

