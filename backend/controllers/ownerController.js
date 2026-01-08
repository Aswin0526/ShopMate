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

// Helper function to convert base64 to Buffer
const base64ToBuffer = (base64String) => {
  if (!base64String) return null;
  // Remove the data URL prefix if present
  const base64Data = base64String.replace(/^data:image\/\w+;base64,/, "");
  return Buffer.from(base64Data, "base64");
};

// Helper function to insert shop images - matches schema with logo, pic1-pic5 columns
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

// Helper function to update a single image
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
    console.log("body", req.body);

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

    // Insert shop images
    await insertShopImages(client, shop.shop_id, logo, images);

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

// Upload a single image (logo or shop image)
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

// Complete shop registration by uploading logo and all images
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

    // Use UPDATE instead of INSERT since row already exists from registerOwnerBasic
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

module.exports = {
  registerOwner,
  registerOwnerBasic,
  uploadShopImage,
  completeRegistration,
  loginOwner,
  getOwnerProfile,
  getFeedBack,
  getAvgRatings,
  logoutOwner,
};
