const express = require("express");
const router = express.Router();
const db = require("../db");

// GET /health - Standard liveness & readiness probe (Strictly preserves existing contract)
router.get("/", async (req, res) => {
    if (req.query.detail === "true") {
        const dbHealth = await db.checkHealth();
        return res.status(200).json({
            status: "healthy",
            database: dbHealth
        });
    }

    res.status(200).json({
        status: "healthy"
    });
});

// GET /health/db - Dedicated database connectivity & latency check
router.get("/db", async (req, res) => {
    const dbHealth = await db.checkHealth();
    const statusCode = dbHealth.healthy ? 200 : 503;
    res.status(statusCode).json({
        service: "database",
        ...dbHealth
    });
});

module.exports = router;
