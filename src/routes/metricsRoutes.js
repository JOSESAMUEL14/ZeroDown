const express = require("express");
const router = express.Router();
const metricsService = require("../services/metricsService");

// GET /metrics - Prometheus exposition format endpoint
router.get("/", async (req, res) => {
    res.set("Content-Type", metricsService.getContentType());
    res.end(await metricsService.getMetrics());
});

module.exports = router;
