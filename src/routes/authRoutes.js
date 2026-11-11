const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const authenticate = require("../middleware/authMiddleware");

// Public authentication routes
router.post("/register", authController.register);
router.post("/login", authController.login);

// Protected customer profile route
router.get("/me", authenticate, authController.getProfile);

module.exports = router;
