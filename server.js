
const express = require("express");
const path = require("path");
const client = require("prom-client");

const app = express();

const PORT = process.env.PORT || 3000;
const APP_VERSION = process.env.APP_VERSION || "v1";

// Prometheus metrics
const register = new client.Registry();

register.setDefaultLabels({
    application: "zerodown",
    version: APP_VERSION
});

client.collectDefaultMetrics({ register });

// HTTP request counter
const httpRequests = new client.Counter({
    name: "zerodown_http_requests_total",
    help: "Total HTTP requests",
    labelNames: ["method", "route", "status_code"],
    registers: [register]
});

// HTTP request duration
const httpDuration = new client.Histogram({
    name: "zerodown_http_request_duration_seconds",
    help: "HTTP request duration in seconds",
    labelNames: ["method", "route", "status_code"],
    registers: [register]
});

// Collect request metrics
app.use((req, res, next) => {
    const end = httpDuration.startTimer();

    res.on("finish", () => {
        const route = req.route?.path || req.path;

        httpRequests.inc({
            method: req.method,
            route,
            status_code: res.statusCode
        });

        end({
            method: req.method,
            route,
            status_code: res.statusCode
        });
    });

    next();
});

// Serve static frontend files
app.use(express.static(path.join(__dirname, "public")));

// Health check endpoint
app.get("/health", (req, res) => {
    res.status(200).json({
        status: "healthy"
    });
});

// Application version endpoint
app.get("/version", (req, res) => {
    res.json({
        application: "ZeroDown",
        version: APP_VERSION
    });
});

// Prometheus metrics endpoint
app.get("/metrics", async (req, res) => {
    res.set("Content-Type", register.contentType);
    res.end(await register.metrics());
});

// Homepage
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Start server only when running this file directly
if (require.main === module) {
    app.listen(PORT, "0.0.0.0", () => {
        console.log(`ZeroDown ${APP_VERSION} running on port ${PORT}`);
    });
}

// Export app for automated testing
module.exports = app;
