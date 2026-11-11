const express = require("express");
const router = express.Router();
const managerController = require("../controllers/managerController");
const requireManager = require("../middleware/managerMiddleware");

// Public Manager Authentication endpoint
router.post("/login", managerController.login);

// Protected Manager Control endpoints
router.get("/status", requireManager, managerController.getStatus);
router.post("/switch", requireManager, managerController.switchTraffic);
router.post("/rollback", requireManager, managerController.rollbackTraffic);
router.get("/history", requireManager, managerController.getHistory);

module.exports = router;
