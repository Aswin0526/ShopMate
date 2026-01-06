const express = require("express");
const router = express.Router();
const {
  registerOwner,
  loginOwner,
  getOwnerProfile,
  getFeedBack,
  logoutOwner,
  getAvgRatings
} = require("../controllers/ownerController");
const { verifyToken, isOwner } = require("../middleware/auth");

// Public routes
router.post("/register", registerOwner);
router.post("/login", loginOwner);
router.post("/getfeedbacks", verifyToken, isOwner, getFeedBack);
router.post("/getAvgRatings", verifyToken, isOwner, getAvgRatings);

// Protected routes
router.get("/profile", verifyToken, isOwner, getOwnerProfile);
router.post("/logout", logoutOwner);

module.exports = router;
