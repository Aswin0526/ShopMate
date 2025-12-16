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

const registerCustomer = async (req, res) => {
  try {
    const {
      customer_name,
      customer_phone,
      customer_email,
      customer_state,
      customer_country,
      customer_city,
      customer_pincode,
      customer_password,
    } = req.body;

    if (
      !customer_name ||
      !customer_phone ||
      !customer_email ||
      !customer_state ||
      !customer_country ||
      !customer_city ||
      !customer_pincode ||
      !customer_password
    ) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    if (!isValidEmail(customer_email)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email format",
      });
    }

    if (!isValidPhone(customer_phone)) {
      return res.status(400).json({
        success: false,
        message: "Invalid phone number",
      });
    }

    if (!isValidPassword(customer_password)) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });
    }

    if (!isValidPincode(customer_pincode)) {
      return res.status(400).json({
        success: false,
        message: "Invalid pincode",
      });
    }

    // Check if email or phone already exists
    const existingUser = await pool.query(
      "SELECT * FROM customers WHERE customer_email = $1 OR customer_phone = $2",
      [customer_email, customer_phone]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Email or phone already registered",
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(customer_password, 10);

    // Insert customer
    const result = await pool.query(
      `INSERT INTO customers (customer_name, customer_phone, customer_email, customer_state, 
       customer_country, customer_city, customer_pincode, customer_password) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING customer_id, customer_name, customer_email, customer_phone`,
      [
        customer_name,
        customer_phone,
        customer_email,
        customer_state,
        customer_country,
        customer_city,
        customer_pincode,
        hashedPassword,
      ]
    );

    const customer = result.rows[0];

    const accessToken = generateAccessToken({
      id: customer.customer_id,
      email: customer.customer_email,
      type: "customer",
    });

    const refreshToken = generateRefreshToken();

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await pool.query(
      `INSERT INTO refresh_tokens (user_id, user_type, refresh_token, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [customer.customer_id, "customer", refreshToken, expiresAt]
    );

    res.status(201).json({
      success: true,
      message: "Customer registered successfully",
      data: {
        customer,
        access_token: accessToken,
        refresh_token: refreshToken,
        token_type: "Bearer",
        expires_in: "15m",
      },
    });
  } catch (error) {
    console.error("Register customer error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

const loginCustomer = async (req, res) => {
  try {
    const { customer_email, customer_password } = req.body;

    // Validation
    if (!customer_email || !customer_password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    // Find customer
    const result = await pool.query(
      "SELECT * FROM customers WHERE customer_email = $1",
      [customer_email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const customer = result.rows[0];

    // Verify password
    const isValidPassword = await bcrypt.compare(
      customer_password,
      customer.customer_password
    );

    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Generate access and refresh tokens
    const accessToken = generateAccessToken({
      id: customer.customer_id,
      email: customer.customer_email,
      type: "customer",
    });

    const refreshToken = generateRefreshToken();

    // Store refresh token in database
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    await pool.query(
      `INSERT INTO refresh_tokens (user_id, user_type, refresh_token, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [customer.customer_id, "customer", refreshToken, expiresAt]
    );

    delete customer.customer_password;

    res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        customer,
        access_token: accessToken,
        refresh_token: refreshToken,
        token_type: "Bearer",
        expires_in: "15m",
      },
    });
  } catch (error) {
    console.error("Login customer error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

const getCustomerProfile = async (req, res) => {
  try {
    const customerId = req.user.id;

    const result = await pool.query(
      "SELECT customer_id, customer_name, customer_phone, customer_email, customer_state, customer_country, customer_city, customer_pincode, created_at FROM customers WHERE customer_id = $1",
      [customerId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    res.status(200).json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Get customer profile error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

const logoutCustomer = async (req, res) => {
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
    console.error("Logout customer error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

module.exports = {
  registerCustomer,
  loginCustomer,
  getCustomerProfile,
  logoutCustomer,
};
