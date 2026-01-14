const pool = require("../config/database");
const bcrypt = require("bcryptjs");
const {
  generateAccessToken,
  generateRefreshToken,
} = require("../utils/tokenUtils");
const {
  isValidEmail,
  isValidPhone,
  isValidPassword,
  isValidPincode,
} = require("../utils/validation");

const base64ToBuffer = (base64String) => {
  if (!base64String) return null;
  const base64Data = base64String.replace(/^data:image\/\w+;base64,/, "");
  return Buffer.from(base64Data, "base64");
};

const createProductTable = async (shopType, shopId, shopName) => {
  const tableName = `${shopType}_${shopId}_${shopName
    .replace(/\s+/g, "_")
    .toLowerCase()}`;

  console.log(tableName);
  let createTableSQL = "";

  switch (shopType.toLowerCase()) {
    case "electronics":
      createTableSQL = `
        CREATE TABLE IF NOT EXISTS ${tableName} (
          id SERIAL PRIMARY KEY,
          product_name TEXT NOT NULL,
          brand TEXT,
          model_number TEXT,
          description TEXT,
          price NUMERIC(10,2) NOT NULL,
          quantity INT NOT NULL CHECK (quantity >= 0),
          warranty_years INT,
          image1 BYTEA,
          image2 BYTEA,
          image3 BYTEA,
          image4 BYTEA,
          image5 BYTEA,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `;
      break;

    case "grocery":
      createTableSQL = `
        CREATE TABLE IF NOT EXISTS ${tableName} (
          id SERIAL PRIMARY KEY,
          product_name TEXT NOT NULL,
          brand TEXT,
          description TEXT,
          price NUMERIC(10,2) NOT NULL,
          quantity INT NOT NULL CHECK (quantity >= 0),
          expiry_date DATE,
          weight VARCHAR(20),
          is_organic BOOLEAN DEFAULT FALSE,
          image1 BYTEA,
          image2 BYTEA,
          image3 BYTEA,
          image4 BYTEA,
          image5 BYTEA,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `;
      break;

    case "cosmetics":
      createTableSQL = `
        CREATE TABLE IF NOT EXISTS ${tableName} (
          cosmetics_id SERIAL PRIMARY KEY,
          product_name TEXT NOT NULL,
          brand TEXT,
          description TEXT,
          price NUMERIC(10,2) NOT NULL,
          quantity INT NOT NULL CHECK (quantity >= 0),
          skin_type VARCHAR(30),
          expiry_date DATE,
          ingredients TEXT,
          image1 BYTEA,
          image2 BYTEA,
          image3 BYTEA,
          image4 BYTEA,
          image5 BYTEA,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `;
      break;

    case "clothing":
      createTableSQL = `
        CREATE TABLE IF NOT EXISTS ${tableName} (
          id SERIAL PRIMARY KEY,
          product_name TEXT NOT NULL,
          brand TEXT,
          description TEXT,
          price NUMERIC(10,2) NOT NULL,
          quantity INT NOT NULL CHECK (quantity >= 0),
          size VARCHAR(10),
          color VARCHAR(30),
          material VARCHAR(50),
          gender VARCHAR(10),
          image1 BYTEA,
          image2 BYTEA,
          image3 BYTEA,
          image4 BYTEA,
          image5 BYTEA,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `;
      break;

    case "bookstore":
      createTableSQL = `
        CREATE TABLE IF NOT EXISTS ${tableName} (
          id SERIAL PRIMARY KEY,
          title TEXT NOT NULL,
          author TEXT,
          publisher TEXT,
          isbn VARCHAR(20) UNIQUE,
          description TEXT,
          price NUMERIC(10,2) NOT NULL,
          quantity INT NOT NULL CHECK (quantity >= 0),
          genre VARCHAR(50),
          language VARCHAR(30),
          image1 BYTEA,
          image2 BYTEA,
          image3 BYTEA,
          image4 BYTEA,
          image5 BYTEA,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `;
      break;

    default:
      throw new Error(`Unsupported shop type: ${shopType}`);
  }

  await pool.query(createTableSQL);
  return tableName;
};

const insertShopImages = async (client, shopId, logo, images) => {
  try {
    const logoBuffer = base64ToBuffer(logo);
    const pic1Buffer =
      images && images.pic1 ? base64ToBuffer(images.pic1) : null;
    const pic2Buffer =
      images && images.pic2 ? base64ToBuffer(images.pic2) : null;
    const pic3Buffer =
      images && images.pic3 ? base64ToBuffer(images.pic3) : null;
    const pic4Buffer =
      images && images.pic4 ? base64ToBuffer(images.pic4) : null;
    const pic5Buffer =
      images && images.pic5 ? base64ToBuffer(images.pic5) : null;

    await client.query(
      `INSERT INTO shop_images (shop_id, logo, pic1, pic2, pic3, pic4, pic5) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        shopId,
        logoBuffer,
        pic1Buffer,
        pic2Buffer,
        pic3Buffer,
        pic4Buffer,
        pic5Buffer,
      ]
    );
  } catch (error) {
    console.error("Error inserting shop images:", error);
    throw error;
  }
};

const updateShopImage = async (client, shopId, imageKey, imageData) => {
  try {
    const imageBuffer = base64ToBuffer(imageData);
    await client.query(
      `UPDATE shop_images SET ${imageKey} = $1 WHERE shop_id = $2`,
      [imageBuffer, shopId]
    );
  } catch (error) {
    console.error(`Error updating ${imageKey}:`, error);
    throw error;
  }
};

const registerOwner = async (req, res) => {
  const client = await pool.connect();

  try {
    const {
      owner_name,
      owner_email,
      owner_phone,
      owner_location,
      shop_name,
      shop_phone,
      shop_email,
      shop_website,
      shop_country,
      shop_state,
      shop_city,
      shop_pincode,
      shop_type,
      shop_gmap_link,
      shop_password,
      logo,
      images,
    } = req.body;

    if (!owner_name || !owner_email || !owner_phone || !owner_location) {
      return res.status(400).json({
        success: false,
        message:
          "Owner fields required: owner_name, owner_email, owner_phone, owner_location",
      });
    }

    const requiredShopFields = [
      { name: "shop_name", value: shop_name },
      { name: "shop_phone", value: shop_phone },
      { name: "shop_email", value: shop_email },
      { name: "shop_country", value: shop_country },
      { name: "shop_state", value: shop_state },
      { name: "shop_city", value: shop_city },
      { name: "shop_pincode", value: shop_pincode },
      { name: "shop_password", value: shop_password },
      { name: "shop_type", value: shop_type },
    ];

    const missingFields = requiredShopFields
      .filter((field) => !field.value || field.value.trim() === "")
      .map((field) => field.name);

    if (missingFields.length > 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(", ")}`,
        missing_fields: missingFields,
      });
    }

    // Validate logo is present
    if (!logo) {
      return res.status(400).json({
        success: false,
        message: "Shop logo is mandatory",
      });
    }

    // Validate at least one shop image is present
    const hasAtLeastOneImage =
      images &&
      (images.pic1 || images.pic2 || images.pic3 || images.pic4 || images.pic5);

    if (!hasAtLeastOneImage) {
      return res.status(400).json({
        success: false,
        message: "At least one shop image is required",
      });
    }

    if (!isValidEmail(owner_email)) {
      return res.status(400).json({
        success: false,
        message: "Invalid owner email format",
      });
    }

    if (!isValidEmail(shop_email)) {
      return res.status(400).json({
        success: false,
        message: "Invalid shop email format",
      });
    }

    if (!isValidPhone(owner_phone)) {
      return res.status(400).json({
        success: false,
        message: "Invalid owner phone number",
      });
    }

    if (!isValidPhone(shop_phone)) {
      return res.status(400).json({
        success: false,
        message: "Invalid shop phone number",
      });
    }

    if (!isValidPassword(shop_password)) {
      return res.status(400).json({
        success: false,
        message: "Shop password must be at least 6 characters",
      });
    }

    if (!isValidPincode(shop_pincode)) {
      return res.status(400).json({
        success: false,
        message: "Invalid shop pincode",
      });
    }

    await client.query("BEGIN");

    const existingOwner = await client.query(
      "SELECT * FROM owners WHERE owner_email = $1 OR owner_phone = $2",
      [owner_email, owner_phone]
    );

    if (existingOwner.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        success: false,
        message: "Owner email or phone already registered",
      });
    }

    const existingShop = await client.query(
      "SELECT * FROM shops WHERE shop_email = $1",
      [shop_email]
    );

    if (existingShop.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        success: false,
        message: "Shop email already registered",
      });
    }

    const ownerResult = await client.query(
      `INSERT INTO owners (owner_name, owner_email, owner_phone, owner_location) 
       VALUES ($1, $2, $3, $4) RETURNING owner_id, owner_name, owner_email, owner_phone, owner_location`,
      [owner_name, owner_email, owner_phone, owner_location]
    );

    const owner = ownerResult.rows[0];

    const hashedPassword = await bcrypt.hash(shop_password, 10);

    const shopResult = await client.query(
      `INSERT INTO shops (owner_id, shop_name, shop_phone, shop_email, shop_website, 
       shop_country, shop_state, shop_city, shop_pincode, shop_gmap_link, shop_password, type) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) 
       RETURNING shop_id, owner_id, shop_name, shop_phone, shop_email, shop_website, 
       shop_country, shop_state, shop_city, shop_pincode, shop_gmap_link, created_at`,
      [
        owner.owner_id,
        shop_name,
        shop_phone,
        shop_email,
        shop_website,
        shop_country,
        shop_state,
        shop_city,
        shop_pincode,
        shop_gmap_link,
        hashedPassword,
        shop_type,
      ]
    );

    const shop = shopResult.rows[0];

    await insertShopImages(client, shop.shop_id, logo, images);

    await client.query("COMMIT");

    const accessToken = generateAccessToken({
      id: owner.owner_id,
      email: owner.owner_email,
      shopId: shop.shop_id,
      type: "owner",
    });

    const refreshToken = generateRefreshToken();

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await pool.query(
      `INSERT INTO refresh_tokens (user_id, user_type, refresh_token, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [owner.owner_id, "owner", refreshToken, expiresAt]
    );

    res.status(201).json({
      success: true,
      message: "Owner and shop registered successfully",
      data: {
        owner,
        shop,
        access_token: accessToken,
        refresh_token: refreshToken,
        token_type: "Bearer",
        expires_in: "15m",
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Register owner error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  } finally {
    client.release();
  }
};

const loginOwner = async (req, res) => {
  try {
    const { shop_email, shop_password } = req.body;

    if (!shop_email || !shop_password) {
      return res.status(400).json({
        success: false,
        message: "Shop email and password are required",
      });
    }

    const shopResult = await pool.query(
      "SELECT * FROM shops WHERE shop_email = $1",
      [shop_email]
    );

    if (shopResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const shop = shopResult.rows[0];

    const isValidPassword = await bcrypt.compare(
      shop_password,
      shop.shop_password
    );

    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const ownerResult = await pool.query(
      "SELECT * FROM owners WHERE owner_id = $1",
      [shop.owner_id]
    );

    const owner = ownerResult.rows[0];

    const accessToken = generateAccessToken({
      id: owner.owner_id,
      email: owner.owner_email,
      shopId: shop.shop_id,
      type: "owner",
    });

    const refreshToken = generateRefreshToken();

    // Store refresh token in database
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    await pool.query(
      `INSERT INTO refresh_tokens (user_id, user_type, refresh_token, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [owner.owner_id, "owner", refreshToken, expiresAt]
    );

    delete shop.shop_password;

    res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        owner,
        shop,
        access_token: accessToken,
        refresh_token: refreshToken,
        token_type: "Bearer",
        expires_in: "15m",
      },
    });
  } catch (error) {
    console.error("Login owner error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

const getOwnerProfile = async (req, res) => {
  try {
    const ownerId = req.user.id;

    const result = await pool.query(
      "SELECT owner_id, owner_name, owner_email, owner_phone, owner_location, created_at FROM owners WHERE owner_id = $1",
      [ownerId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Owner not found",
      });
    }

    res.status(200).json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Get owner profile error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

const getFeedBack = async (req, res) => {
  try {
    const { shop_id } = req.body;
    console.log("inside");
    if (!shop_id) {
      return res.status(400).json({
        success: false,
        message: "Shop ID is required",
      });
    }

    const result = await pool.query(
      `SELECT feedback, ratings, created_at 
      FROM shop_feedback
      WHERE shop_id = $1
      ORDER BY created_at DESC
      LIMIT 50`,
      [shop_id]
    );

    res.status(200).json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error("Get feedback error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

const getAvgRatings = async (req, res) => {
  try {
    const { shop_id } = req.body;
    console.log("inside Avg ratings");
    if (!shop_id) {
      return res.status(400).json({
        success: false,
        message: "Shop ID is required",
      });
    }

    const result = await pool.query(
      `
    SELECT ROUND(AVG(ratings), 2) AS average_rating
    FROM shop_feedback
    WHERE shop_id = $1;
    `,
      [shop_id]
    );

    const avgRating = result.rows[0].average_rating;
    console.log(avgRating);
    res.status(200).json({
      success: true,
      data: avgRating,
    });
  } catch (error) {
    console.error("Get feedback error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

const logoutOwner = async (req, res) => {
  try {
    const { refresh_token } = req.body;

    if (!refresh_token) {
      return res.status(400).json({
        success: false,
        message: "Refresh token is required",
      });
    }

    await pool.query(
      "UPDATE refresh_tokens SET is_revoked = TRUE WHERE refresh_token = $1",
      [refresh_token]
    );

    res.status(200).json({
      success: true,
      message: "Logout successful",
    });
  } catch (error) {
    console.error("Logout owner error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Register shop with basic data (no images) - for handling large payloads
const registerOwnerBasic = async (req, res) => {
  const client = await pool.connect();

  try {
    const {
      owner_name,
      owner_email,
      owner_phone,
      owner_location,
      shop_name,
      shop_phone,
      shop_email,
      shop_website,
      shop_country,
      shop_state,
      shop_city,
      shop_pincode,
      shop_type,
      shop_gmap_link,
      shop_password,
    } = req.body;
    console.log("request body", req.body);

    // Remove logo and images from the main request validation
    if (!owner_name || !owner_email || !owner_phone || !owner_location) {
      const missingOwnerFields = [];
      if (!owner_name) missingOwnerFields.push("owner_name");
      if (!owner_email) missingOwnerFields.push("owner_email");
      if (!owner_phone) missingOwnerFields.push("owner_phone");
      if (!owner_location) missingOwnerFields.push("owner_location");

      return res.status(400).json({
        success: false,
        message: `Missing required owner fields: ${missingOwnerFields.join(
          ", "
        )}`,
        missing_fields: missingOwnerFields,
      });
    }

    const requiredShopFields = [
      { name: "shop_name", value: shop_name },
      { name: "shop_phone", value: shop_phone },
      { name: "shop_email", value: shop_email },
      { name: "shop_country", value: shop_country },
      { name: "shop_state", value: shop_state },
      { name: "shop_city", value: shop_city },
      { name: "shop_pincode", value: shop_pincode },
      { name: "shop_password", value: shop_password },
      { name: "shop_type", value: shop_type },
    ];

    const missingShopFields = requiredShopFields
      .filter((field) => !field.value || field.value.trim() === "")
      .map((field) => field.name);

    if (missingShopFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required shop fields: ${missingShopFields.join(
          ", "
        )}`,
        missing_fields: missingShopFields,
      });
    }

    if (!isValidEmail(owner_email)) {
      return res.status(400).json({
        success: false,
        message: "Invalid owner email format",
      });
    }

    if (!isValidEmail(shop_email)) {
      return res.status(400).json({
        success: false,
        message: "Invalid shop email format",
      });
    }

    if (!isValidPhone(owner_phone)) {
      return res.status(400).json({
        success: false,
        message: "Invalid owner phone number",
      });
    }

    if (!isValidPhone(shop_phone)) {
      return res.status(400).json({
        success: false,
        message: "Invalid shop phone number",
      });
    }

    if (!isValidPassword(shop_password)) {
      return res.status(400).json({
        success: false,
        message: "Shop password must be at least 6 characters",
      });
    }

    if (!isValidPincode(shop_pincode)) {
      return res.status(400).json({
        success: false,
        message: "Invalid shop pincode",
      });
    }

    await client.query("BEGIN");

    const existingOwner = await client.query(
      "SELECT * FROM owners WHERE owner_email = $1 OR owner_phone = $2",
      [owner_email, owner_phone]
    );

    if (existingOwner.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        success: false,
        message: "Owner email or phone already registered",
      });
    }

    const existingShop = await client.query(
      "SELECT * FROM shops WHERE shop_email = $1",
      [shop_email]
    );

    if (existingShop.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        success: false,
        message: "Shop email already registered",
      });
    }

    const ownerResult = await client.query(
      `INSERT INTO owners (owner_name, owner_email, owner_phone, owner_location) 
       VALUES ($1, $2, $3, $4) RETURNING owner_id, owner_name, owner_email, owner_phone, owner_location`,
      [owner_name, owner_email, owner_phone, owner_location]
    );

    const owner = ownerResult.rows[0];

    const hashedPassword = await bcrypt.hash(shop_password, 10);

    const shopResult = await client.query(
      `INSERT INTO shops (owner_id, shop_name, shop_phone, shop_email, shop_website, 
       shop_country, shop_state, shop_city, shop_pincode, shop_gmap_link, shop_password, type) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) 
       RETURNING shop_id, owner_id, shop_name, shop_phone, shop_email, shop_website, 
       shop_country, shop_state, shop_city, shop_pincode, shop_gmap_link, created_at`,
      [
        owner.owner_id,
        shop_name,
        shop_phone,
        shop_email,
        shop_website,
        shop_country,
        shop_state,
        shop_city,
        shop_pincode,
        shop_gmap_link,
        hashedPassword,
        shop_type,
      ]
    );
    console.log("till shop data upload no issues");
    const shop = shopResult.rows[0];

    // Create empty shop_images row (will be updated later with images)
    await client.query(
      `INSERT INTO shop_images (shop_id, logo, pic1, pic2, pic3, pic4, pic5) 
       VALUES ($1, NULL, NULL, NULL, NULL, NULL, NULL)`,
      [shop.shop_id]
    );

    // Create product table based on shop type
    console.log(
      `Creating product table for shop type: ${shop_type}, shop_id: ${shop.shop_id}, shop_name: ${shop_name}`
    );
    const productTableName = await createProductTable(
      shop_type,
      shop.shop_id,
      shop_name
    );
    console.log(`Product table created: ${productTableName}`);

    await client.query("COMMIT");

    const accessToken = generateAccessToken({
      id: owner.owner_id,
      email: owner.owner_email,
      shopId: shop.shop_id,
      type: "owner",
    });

    const refreshToken = generateRefreshToken();

    // Store refresh token in database
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    await pool.query(
      `INSERT INTO refresh_tokens (user_id, user_type, refresh_token, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [owner.owner_id, "owner", refreshToken, expiresAt]
    );

    res.status(201).json({
      success: true,
      message: "Shop registered successfully. Please upload logo and images.",
      data: {
        owner,
        shop,
        product_table: productTableName,
        access_token: accessToken,
        refresh_token: refreshToken,
        token_type: "Bearer",
        expires_in: "15m",
        needs_images: true,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Register owner basic error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  } finally {
    client.release();
  }
};

const uploadShopImage = async (req, res) => {
  const client = await pool.connect();

  try {
    const { shop_id, image_type, image_key, image_data } = req.body;
    const authHeader = req.headers.authorization;

    if (!shop_id || !image_type || !image_data) {
      return res.status(400).json({
        success: false,
        message: "shop_id, image_type, and image_data are required",
      });
    }

    // Validate image_type
    if (!["logo", "shop"].includes(image_type)) {
      return res.status(400).json({
        success: false,
        message: "image_type must be 'logo' or 'shop'",
      });
    }

    // For shop images, validate image_key
    if (image_type === "shop" && !image_key) {
      return res.status(400).json({
        success: false,
        message: "image_key is required for shop images (pic1-pic5)",
      });
    }

    await client.query("BEGIN");

    // Determine the column name
    const columnName = image_type === "logo" ? "logo" : image_key;

    const imageBuffer = base64ToBuffer(image_data);

    await client.query(
      `UPDATE shop_images SET ${columnName} = $1 WHERE shop_id = $2`,
      [imageBuffer, shop_id]
    );

    await client.query("COMMIT");

    res.status(200).json({
      success: true,
      message: `${image_type} uploaded successfully`,
      data: {
        shop_id,
        image_type,
        image_key: image_type === "logo" ? null : image_key,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Upload image error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  } finally {
    client.release();
  }
};

const completeRegistration = async (req, res) => {
  const client = await pool.connect();

  try {
    const { shop_id, logo, images } = req.body;

    if (!shop_id) {
      return res.status(400).json({
        success: false,
        message: "Shop ID is required",
      });
    }

    if (!logo) {
      return res.status(400).json({
        success: false,
        message: "Shop logo is mandatory",
      });
    }

    const hasAtLeastOneImage =
      images &&
      (images.pic1 || images.pic2 || images.pic3 || images.pic4 || images.pic5);
    if (!hasAtLeastOneImage) {
      return res.status(400).json({
        success: false,
        message: "At least one shop image is required",
      });
    }

    await client.query("BEGIN");

    const logoBuffer = base64ToBuffer(logo);
    const pic1Buffer =
      images && images.pic1 ? base64ToBuffer(images.pic1) : null;
    const pic2Buffer =
      images && images.pic2 ? base64ToBuffer(images.pic2) : null;
    const pic3Buffer =
      images && images.pic3 ? base64ToBuffer(images.pic3) : null;
    const pic4Buffer =
      images && images.pic4 ? base64ToBuffer(images.pic4) : null;
    const pic5Buffer =
      images && images.pic5 ? base64ToBuffer(images.pic5) : null;

    await client.query(
      `UPDATE shop_images SET logo = $1, pic1 = $2, pic2 = $3, pic3 = $4, pic4 = $5, pic5 = $6 WHERE shop_id = $7`,
      [
        logoBuffer,
        pic1Buffer,
        pic2Buffer,
        pic3Buffer,
        pic4Buffer,
        pic5Buffer,
        shop_id,
      ]
    );

    await client.query("COMMIT");

    res.status(200).json({
      success: true,
      message: "Shop images uploaded successfully",
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Complete registration error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  } finally {
    client.release();
  }
};

const getLogo = async (req, res) => {
  try {
    const { shop_id } = req.body;

    if (!shop_id) {
      return res.status(400).json({
        success: false,
        message: "Shop ID is required",
      });
    }

    const result = await pool.query(
      "SELECT logo FROM shop_images WHERE shop_id = $1",
      [shop_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Shop not found",
      });
    }

    const logoData = result.rows[0].logo;

    if (!logoData) {
      return res.status(404).json({
        success: false,
        message: "Logo not found",
      });
    }

    const base64Image = logoData.toString("base64");
    const imageType = logoData.type || "image/jpeg";

    res.status(200).json({
      success: true,
      data: {
        logo: `data:${imageType};base64,${base64Image}`,
      },
    });
  } catch (error) {
    console.error("Get logo error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

const getShopImages = async (req, res) => {
  try {
    const { shop_id } = req.body;

    if (!shop_id) {
      return res.status(400).json({
        success: false,
        message: "Shop ID is required",
      });
    }

    const result = await pool.query(
      "SELECT logo, pic1, pic2, pic3, pic4, pic5 FROM shop_images WHERE shop_id = $1",
      [shop_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Shop not found",
      });
    }

    const imagesData = result.rows[0];

    // Helper function to convert buffer to base64
    const bufferToBase64 = (buffer) => {
      if (!buffer) return null;
      return `data:${buffer.type || "image/jpeg"};base64,${buffer.toString(
        "base64"
      )}`;
    };

    res.status(200).json({
      success: true,
      data: {
        logo: bufferToBase64(imagesData.logo),
        pic1: bufferToBase64(imagesData.pic1),
        pic2: bufferToBase64(imagesData.pic2),
        pic3: bufferToBase64(imagesData.pic3),
        pic4: bufferToBase64(imagesData.pic4),
        pic5: bufferToBase64(imagesData.pic5),
      },
    });
  } catch (error) {
    console.error("Get shop images error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Get products from shop's product table
const getProducts = async (req, res) => {
  try {
    const { table_name, shop_type } = req.body;

    if (!table_name) {
      return res.status(400).json({
        success: false,
        message: "Table name is required",
      });
    }

    // Get column information from information_schema
    const columnsResult = await pool.query(
      `SELECT column_name, data_type 
       FROM information_schema.columns 
       WHERE table_name = $1 
       ORDER BY ordinal_position`,
      [table_name]
    );

    if (columnsResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Table not found",
      });
    }

    // Get products from the table
    const productsResult = await pool.query(
      `SELECT * FROM ${table_name} ORDER BY created_at DESC`
    );

    const products = productsResult.rows.map((product) => {
      const productCopy = { ...product };

      for (let i = 1; i <= 5; i++) {
        const imgKey = `image${i}`;
        if (productCopy[imgKey]) {
          try {
            const buffer = Buffer.isBuffer(productCopy[imgKey])
              ? productCopy[imgKey]
              : Buffer.from(productCopy[imgKey], "binary");
            productCopy[imgKey] = `data:image/jpeg;base64,${buffer.toString(
              "base64"
            )}`;
          } catch (e) {
            productCopy[imgKey] = null;
          }
        }
      }

      return productCopy;
    });

    res.status(200).json({
      success: true,
      data: {
        products,
        columns: columnsResult.rows,
      },
    });
  } catch (error) {
    console.error("Get products error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

const addProduct = async (req, res) => {
  try {
    const { table_name, shop_type, product_data } = req.body;
    console.log(req.body);
    console.log();
    if (!table_name || !product_data) {
      return res.status(400).json({
        success: false,
        message: "Table name and product data are required",
      });
    }

    const columnsResult = await pool.query(
      `SELECT column_name, data_type 
       FROM information_schema.columns 
       WHERE table_name = $1 
         AND column_name NOT IN ('id', 'cosmetics_id', 'created_at', 'updated_at')
       ORDER BY ordinal_position`,
      [table_name]
    );

    console.log("column names", columnsResult);

    if (columnsResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Table not found",
      });
    }

    const allowedColumns = columnsResult.rows.map((col) => col.column_name);
    const insertData = {};

    allowedColumns.forEach((col) => {
      if (product_data[col] !== undefined) {
        insertData[col] = product_data[col];
      }
    });

    console.log("insert data", insertData);

    const columnNames = Object.keys(insertData);
    const placeholders = columnNames.map((_, i) => `$${i + 1}`).join(", ");
    const values = Object.values(insertData);

    const insertQuery = `
      INSERT INTO ${table_name} (${columnNames.join(", ")})
      VALUES (${placeholders})
      RETURNING *
    `;
    console.log(insertQuery);
    const result = await pool.query(insertQuery, values);

    res.status(201).json({
      success: true,
      message: "Product added successfully",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Add product error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

const updateProduct = async (req, res) => {
  try {
    const { table_name, shop_type, product_id, product_data } = req.body;

    if (!table_name || !product_id || !product_data) {
      return res.status(400).json({
        success: false,
        message: "Table name, product ID, and product data are required",
      });
    }

    const idColumn =
      shop_type?.toLowerCase() === "cosmetics" ? "cosmetics_id" : "id";

    const columnsResult = await pool.query(
      `SELECT column_name, data_type 
       FROM information_schema.columns 
       WHERE table_name = $1 
         AND column_name NOT IN ('id', 'cosmetics_id', 'created_at', 'updated_at')
       ORDER BY ordinal_position`,
      [table_name]
    );

    if (columnsResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Table not found",
      });
    }

    // Build dynamic UPDATE query
    const allowedColumns = columnsResult.rows.map((col) => col.column_name);
    const updateData = {};

    allowedColumns.forEach((col) => {
      if (product_data[col] !== undefined) {
        updateData[col] = product_data[col];
      }
    });

    const setClause = Object.keys(updateData)
      .map((col, i) => `${col} = $${i + 1}`)
      .join(", ");
    const values = [...Object.values(updateData), product_id];

    const updateQuery = `
      UPDATE ${table_name}
      SET ${setClause}
      WHERE ${idColumn} = $${values.length}
      RETURNING *
    `;

    const result = await pool.query(updateQuery, values);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Product updated successfully",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Update product error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Delete a product
const deleteProduct = async (req, res) => {
  try {
    const { table_name, shop_type, product_id } = req.body;

    if (!table_name || !product_id) {
      return res.status(400).json({
        success: false,
        message: "Table name and product ID are required",
      });
    }

    // Determine ID column based on shop type
    const idColumn =
      shop_type?.toLowerCase() === "cosmetics" ? "cosmetics_id" : "id";

    const deleteQuery = `DELETE FROM ${table_name} WHERE ${idColumn} = $1 RETURNING *`;
    const result = await pool.query(deleteQuery, [product_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Product deleted successfully",
    });
  } catch (error) {
    console.error("Delete product error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

module.exports = {
  registerOwner,
  registerOwnerBasic,
  uploadShopImage,
  completeRegistration,
  getLogo,
  getShopImages,
  loginOwner,
  getOwnerProfile,
  getFeedBack,
  getAvgRatings,
  logoutOwner,
  getProducts,
  addProduct,
  updateProduct,
  deleteProduct,
};
