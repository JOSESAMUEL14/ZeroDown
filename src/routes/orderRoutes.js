const express = require("express");
const router = express.Router();
const orderController = require("../controllers/orderController");
const authenticate = require("../middleware/authMiddleware");

// All order operations require customer authentication
router.use(authenticate);

// Checkout and Order Management
router.post("/checkout", orderController.checkout);
router.get("/", orderController.getOrders);
router.get("/:id", orderController.getOrderById);
router.post("/:id/cancel", orderController.cancelOrder);

module.exports = router;
