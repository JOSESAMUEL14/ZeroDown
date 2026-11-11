const express = require("express");
const router = express.Router();
const customerController = require("../controllers/customerController");
const authenticate = require("../middleware/authMiddleware");

// All customer routes require authentication
router.use(authenticate);

// Profile management
router.put("/profile", customerController.updateProfile);

// Address CRUD operations
router.get("/addresses", customerController.getAddresses);
router.post("/addresses", customerController.addAddress);
router.put("/addresses/:id", customerController.updateAddress);
router.delete("/addresses/:id", customerController.deleteAddress);

module.exports = router;
