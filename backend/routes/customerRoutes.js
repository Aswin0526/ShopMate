const express = require("express");
const router = express.Router();
const {
  registerCustomer,
  loginCustomer,
  getCustomerProfile,
  logoutCustomer,
  getShopInLoc,
} = require("../controllers/customerController");
const { verifyToken, isCustomer } = require("../middleware/auth");

// Public routes
router.post("/register", registerCustomer);
router.post("/login", loginCustomer);

router.post("/getShopInLoc", verifyToken, isCustomer, getShopInLoc);

// Protected routes
router.get("/profile", verifyToken, isCustomer, getCustomerProfile);
router.post("/logout", logoutCustomer);

module.exports = router;
