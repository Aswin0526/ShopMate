const express = require("express");
const router = express.Router();
const {
  registerOwner,
  registerOwnerBasic,
  uploadShopImage,
  completeRegistration,
  getLogo,
  getShopImages,
  loginOwner,
  getOwnerProfile,
  getFeedBack,
  logoutOwner,
  getAvgRatings,
  getProducts,
  addProduct,
  updateProduct,
  deleteProduct,
} = require("../controllers/ownerController");
const { verifyToken, isOwner, isCustomer } = require("../middleware/auth");

// Public routes
router.post("/register", registerOwner);
router.post("/register-basic", registerOwnerBasic);
router.post("/upload-image", uploadShopImage);
router.post("/complete-registration", completeRegistration);
router.post("/get-logo", getLogo);
router.post("/get-shop-images", getShopImages);
router.post("/login", loginOwner);
router.post("/getfeedbacks", verifyToken, getFeedBack);
router.post("/getAvgRatings", verifyToken, getAvgRatings);

// Protected routes
router.get("/profile", verifyToken, isOwner, getOwnerProfile);
router.post("/logout", logoutOwner);

// Product management routes
router.post("/get-products", verifyToken, getProducts);
router.post("/add-product", verifyToken, isOwner, addProduct);
router.post("/update-product", verifyToken, isOwner, updateProduct);
router.post("/delete-product", verifyToken, isOwner, deleteProduct);


module.exports = router;
