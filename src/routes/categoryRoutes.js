const express = require("express");
const router = express.Router();
const productController = require("../controllers/productController");

// Public category listing route
router.get("/", productController.getCategories);

module.exports = router;
