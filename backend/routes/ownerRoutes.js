const express = require("express");
const router = express.Router();
const {
  registerOwner,
  registerOwnerBasic,
  uploadShopImage,
  completeRegistration,
  loginOwner,
  getOwnerProfile,
  getFeedBack,
  logoutOwner,
  getAvgRatings,
} = require("../controllers/ownerController");
const { verifyToken, isOwner } = require("../middleware/auth");

// Public routes
router.post("/register", registerOwner);
router.post("/register-basic", registerOwnerBasic); // Register without images (for large payloads)
router.post("/upload-image", uploadShopImage); // Upload single image (logo or shop pic)
router.post("/complete-registration", completeRegistration); // Upload all images after basic registration
router.post("/login", loginOwner);
router.post("/getfeedbacks", verifyToken, isOwner, getFeedBack);
router.post("/getAvgRatings", verifyToken, isOwner, getAvgRatings);

// Protected routes
router.get("/profile", verifyToken, isOwner, getOwnerProfile);
router.post("/logout", logoutOwner);

module.exports = router;
