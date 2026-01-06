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
      shop_gmap_link,
      shop_image,
      shop_password,
    } = req.body;

    if (!owner_name || !owner_email || !owner_phone || !owner_location) {
      return res.status(400).json({
        success: false,
        message:
          "Owner fields required: owner_name, owner_email, owner_phone, owner_location",
      });
    }

    if (
      !shop_name ||
      !shop_phone ||
      !shop_email ||
      !shop_country ||
      !shop_state ||
      !shop_city ||
      !shop_pincode ||
      !shop_password
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Shop fields required: shop_name, shop_phone, shop_email, shop_country, shop_state, shop_city, shop_pincode, shop_password",
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
       shop_country, shop_state, shop_city, shop_pincode, shop_gmap_link, shop_image, shop_password) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) 
       RETURNING shop_id, owner_id, shop_name, shop_phone, shop_email, shop_website, 
       shop_country, shop_state, shop_city, shop_pincode, shop_gmap_link, shop_image, created_at`,
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
        shop_image,
        hashedPassword,
      ]
    );

    const shop = shopResult.rows[0];

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

module.exports = {
  registerOwner,
  loginOwner,
  getOwnerProfile,
  getFeedBack,
  getAvgRatings,
  logoutOwner,
};
