const express = require("express");
const router = express.Router();
const productController = require("../controllers/productController");

// Public product discovery routes
router.get("/", productController.getProducts);
router.get("/:id", productController.getProductById);

module.exports = router;
