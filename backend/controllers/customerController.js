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
    console.log(customer_email, customer_password);
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

const getShopInLoc = async (req, res) => {
  try {
    const { HCountry, HState, HCity, type } = req.body;

    let whereConditions = [];
    let queryParams = [];
    let paramIndex = 1;

    if (HCountry && HCountry.trim() !== "") {
      whereConditions.push(`s.shop_country ILIKE $${paramIndex}`);
      queryParams.push(`%${HCountry}%`);
      paramIndex++;
    }

    if (HState && HState.trim() !== "") {
      whereConditions.push(`s.shop_state ILIKE $${paramIndex}`);
      queryParams.push(`%${HState}%`);
      paramIndex++;
    }

    if (HCity && HCity.trim() !== "") {
      whereConditions.push(`s.shop_city ILIKE $${paramIndex}`);
      queryParams.push(`%${HCity}%`);
      paramIndex++;
    }

    if (type && type.trim() !== "" && type !== "All") {
      whereConditions.push(`s.type = $${paramIndex}`);
      queryParams.push(type);
      paramIndex++;
    }

    console.log(whereConditions, queryParams, paramIndex);

    if (whereConditions.length === 0) {
      return res.status(200).json({
        success: true,
        data: [],
        message: "No filters provided",
      });
    }

    const whereClause = whereConditions.join(" OR ");

    const result = await pool.query(
      `
      SELECT 
        s.shop_id,
        s.shop_name,
        s.type,
        s.shop_city,
        s.shop_state,
        s.shop_country,
        s.shop_pincode,
        encode(si.logo, 'base64') AS logo
      FROM shops s
      LEFT JOIN shop_images si ON s.shop_id = si.shop_id
      WHERE ${whereClause}
      `,
      queryParams
    );

    res.status(200).json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error("Get shops error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

const getShopDetails = async (req, res) => {
  try {
    const { shop_id } = req.body;

    if (!shop_id) {
      return res.status(400).json({
        success: false,
        message: "Shop ID is required",
      });
    }

    const result = await pool.query(
      `
      SELECT 
        s.shop_id,
        s.shop_name,
        s.type,
        s.shop_city,
        s.shop_state,
        s.shop_country,
        s.shop_pincode,
        s.shop_email,
        s.shop_phone,
        s.shop_website,
        encode(si.logo, 'base64') AS logo
      FROM shops s
      LEFT JOIN shop_images si ON s.shop_id = si.shop_id
      WHERE s.shop_id = $1
      `,
      [shop_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Shop not found",
      });
    }

    res.status(200).json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Get shop details error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

const addWishList = async (req, res) => {
  try {
    console.log("inside addWishList");
    const { cust_id, productId, shopId } = req.body;
    console.log(cust_id, productId, shopId);
    if (!cust_id || !productId || !shopId) {
      return res.status(400).json({
        success: false,
        message: "Customer ID and Product ID are required",
      });
    }

    const result = await pool.query(
      `
      INSERT INTO wishlist (cust_id, shop_id, product_id)
      VALUES ($1, $2, $3)
      ON CONFLICT (cust_id, shop_id, product_id) DO NOTHING;
      `,
      [cust_id, shopId, productId]
    );

    if (result.rows.length > 0) {
      res.status(200).json({
        success: true,
        message: "Product added to wishlist successfully",
        data: { wishlist_id: result.rows[0].id },
      });
    } else {
      res.status(200).json({
        success: true,
        message: "Product already in wishlist",
      });
    }
  } catch (error) {
    console.error("Add to wishlist error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

const getWishList = async (req, res) => {
  try {
    console.log("inside getWishList");

    const { cust_id } = req.body;

    if (!cust_id) {
      return res.status(400).json({
        success: false,
        message: "Customer ID is required",
      });
    }

    const wishlistResult = await pool.query(
      `
      SELECT wishlist_id, shop_id, product_id
      FROM wishlist
      WHERE cust_id = $1
      `,
      [cust_id]
    );

    if (wishlistResult.rows.length === 0) {
      return res.status(200).json({
        success: true,
        data: [],
        message: "Wishlist is empty",
      });
    }

    const finalData = [];

    for (const item of wishlistResult.rows) {
      const { shop_id, product_id, wishlist_id } = item;

      const shopResult = await pool.query(
        `SELECT shop_name, type FROM shops WHERE shop_id = $1`,
        [shop_id]
      );
      if (shopResult.rows.length === 0) continue;

      const { shop_name, type } = shopResult.rows[0];

      const tableName = `${type}_${shop_id}_${shop_name}`
        .toLowerCase()
        .replace(/\s+/g, "_");

      const productResult = await pool.query(
        `SELECT id, product_name, image1, image2, image3, image4, image5, quantity
     FROM ${tableName} WHERE id = $1`,
        [product_id]
      );
      if (productResult.rows.length === 0) continue;

      const toBase64Image = (buffer, mime = "image/png") => {
        if (!buffer) return null;
        return `data:${mime};base64,${buffer.toString("base64")}`;
      };

      const row = productResult.rows[0];

      const imageType = "image/jpeg";

      finalData.push({
        wishlist_id,
        shop_id,
        shop_name,
        type,
        product_id,
        product_name: row.product_name,
        images: [
          toBase64Image(row.image1, imageType),
          toBase64Image(row.image2, imageType),
          toBase64Image(row.image3, imageType),
          toBase64Image(row.image4, imageType),
          toBase64Image(row.image5, imageType),
        ].filter(Boolean),
        quantity: row.quantity,
      });
    }

    // ✅ Send response AFTER the loop
    res.status(200).json({
      success: true,
      count: finalData.length,
      data: finalData,
    });
  } catch (error) {
    console.error("Get wishlist error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

const deleteWishlist = async (req, res) => {
  const { product_id, shop_id, custId } = req.body;

  if (!product_id || !shop_id || !custId) {
    return res.status(400).json({
      success: false,
      message: "Missing required fields",
    });
  }

  try {
    const result = await pool.query(
      `DELETE FROM wishlist
       WHERE product_id = $1
       AND shop_id = $2
       AND cust_id = $3
       RETURNING *`,
      [product_id, shop_id, custId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Wishlist item not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Wishlist item deleted successfully",
    });
  } catch (error) {
    console.error("Delete wishlist error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

const order = async (req, res) => {
  const { cust_id, shop_id, pickup_date, pickup_time, products } = req.body;
  if (!products || products.length === 0) {
    return res.status(400).json({ message: "No products in order" });
  }
  try {
    await pool.query("BEGIN");

    const orderResult = await pool.query(
      `INSERT INTO orders (cust_id, shop_id, pickup_date, pickup_time)
       VALUES ($1, $2, $3, $4)
       RETURNING order_id`,
      [cust_id, shop_id, pickup_date, pickup_time]
    );

    const order_id = orderResult.rows[0].order_id;

    const insertItemQuery = `INSERT INTO order_items (order_id, product_id, quantity)
       VALUES ($1, $2, $3)`;

    for (const item of products) {
      await pool.query(insertItemQuery, [
        order_id,
        item.product_id,
        item.quantity,
      ]);
    }

    await pool.query("COMMIT");

    res.status(201).json({
      message: "Order placed successfully",
      order_id,
    });
  } catch (err) {
    await pool.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ message: "Order creation failed" });
  }
};

const getOrders = async (req, res) => {
  const { cust_id } = req.body;

  if (!cust_id) {
    return res.status(400).json({ message: "Customer ID required" });
  }

  try {
    /**
     * STEP 1: Fetch orders + order_items + shop info
     */
    const ordersResult = await pool.query(
      `
      SELECT
        o.order_id,
        o.shop_id,
        o.pickup_date,
        o.pickup_time,
        o.note,
        o.state,
        o.created_at,

        s.shop_name,
        s.type,

        json_agg(
          json_build_object(
            'product_id', oi.product_id,
            'quantity', oi.quantity
          )
        ) AS products

      FROM orders o
      JOIN shops s ON o.shop_id = s.shop_id
      JOIN order_items oi ON o.order_id = oi.order_id

      WHERE o.cust_id = $1

      GROUP BY
        o.order_id,
        o.shop_id,
        o.pickup_date,
        o.pickup_time,
        o.note,
        o.state,
        o.created_at,
        s.shop_name,
        s.type

      ORDER BY o.created_at DESC
      `,
      [cust_id]
    );

    const orders = ordersResult.rows;

    /**
     * STEP 2: Fetch product names from dynamic shop tables
     */
    for (const order of orders) {
      if (!order.products || order.products.length === 0) continue;

      const normalizedShopName = order.shop_name
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_")
        .replace(/[^a-z0-9_]/g, "");

      const tableName = `${order.type}_${order.shop_id}_${normalizedShopName}`
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "");

      const productIds = order.products.map((p) => p.product_id);

      try {
        const productResult = await pool.query(
          `
          SELECT id, product_name
          FROM ${tableName}
          WHERE id = ANY($1)
          `,
          [productIds]
        );

        const productMap = {};
        productResult.rows.forEach((p) => {
          productMap[p.id] = p.product_name;
        });

        /**
         * FIX APPLIED HERE:
         * product_id → match against id
         */
        order.products = order.products.map((p) => ({
          product_id: p.product_id,
          quantity: p.quantity,
          product_name: productMap[p.product_id] || "Unknown Product",
        }));
      } catch (err) {
        console.error(`Product table error (${tableName}):`, err.message);

        order.products = order.products.map((p) => ({
          product_id: p.product_id,
          quantity: p.quantity,
          product_name: "Unknown Product",
        }));
      }
    }

    res.status(200).json(orders);
  } catch (err) {
    console.error("Fetch orders error:", err);
    res.status(500).json({ message: "Failed to fetch orders" });
  }
};

module.exports = {
  registerCustomer,
  loginCustomer,
  getCustomerProfile,
  logoutCustomer,
  getShopInLoc,
  getShopDetails,
  addWishList,
  getWishList,
  deleteWishlist,
  order,
  getOrders,
};
