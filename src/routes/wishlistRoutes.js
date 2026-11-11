const express = require("express");
const router = express.Router();
const wishlistController = require("../controllers/wishlistController");
const authenticate = require("../middleware/authMiddleware");

// All wishlist operations require authentication
router.use(authenticate);

router.get("/", wishlistController.getWishlist);
router.post("/items", wishlistController.addItem);
router.delete("/items/:productId", wishlistController.removeItem);

module.exports = router;
