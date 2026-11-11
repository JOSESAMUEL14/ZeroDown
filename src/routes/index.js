
const express = require("express");
const path = require("path");
const config = require("../config");

const healthRoutes = require("./healthRoutes");
const versionRoutes = require("./versionRoutes");
const metricsRoutes = require("./metricsRoutes");
const authRoutes = require("./authRoutes");
const customerRoutes = require("./customerRoutes");
const productRoutes = require("./productRoutes");
const categoryRoutes = require("./categoryRoutes");
const cartRoutes = require("./cartRoutes");
const wishlistRoutes = require("./wishlistRoutes");
const orderRoutes = require("./orderRoutes");
const managerRoutes = require("./managerRoutes");

const router = express.Router();

// Core infrastructure routes
router.use("/health", healthRoutes);
router.use("/version", versionRoutes);
router.use("/metrics", metricsRoutes);

// Prometheus proxy for the monitoring dashboard
router.get("/api/monitoring/prometheus", async (req, res) => {
    try {
        const query = req.query.query;

        if (typeof query !== "string" || !query.trim() || query.length > 2000) {
            return res.status(400).json({
                error: "A valid Prometheus query is required"
            });
        }

        const prometheusUrl = new URL(
            "/api/v1/query",
            process.env.PROMETHEUS_URL || "http://127.0.0.1:9090"
        );

        prometheusUrl.searchParams.set("query", query);

        const response = await fetch(prometheusUrl, {
            signal: AbortSignal.timeout(8000),
            headers: {
                Accept: "application/json"
            }
        });

        const data = await response.json();

        res.set("Cache-Control", "no-store");
        res.status(response.status).json(data);

    } catch (error) {
        console.error("Prometheus proxy error:", error.message);

        res.status(502).json({
            error: "Unable to connect to Prometheus",
            details: error.name === "TimeoutError"
                ? "Prometheus request timed out"
                : "Monitoring service unavailable"
        });
    }
});

// E-commerce customer and catalog APIs
router.use("/api/v1/auth", authRoutes);
router.use("/api/v1/customers", customerRoutes);
router.use("/api/v1/products", productRoutes);
router.use("/api/v1/categories", categoryRoutes);
router.use("/api/v1/cart", cartRoutes);
router.use("/api/v1/wishlist", wishlistRoutes);
router.use("/api/v1/orders", orderRoutes);

// Manager / DevOps API
router.use("/api/v1/manager", managerRoutes);

// Customer storefront
router.get("/", (req, res) => {
    res.sendFile(path.join(config.publicDir, "index.html"));
});

// Manager dashboard
router.get("/manager", (req, res) => {
    res.sendFile(path.join(config.publicDir, "manager.html"));
});

// Monitoring dashboard
router.get("/monitoring", (req, res) => {
    res.sendFile(path.join(config.publicDir, "monitoring.html"));
});

module.exports = router;
