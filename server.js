
const express = require("express");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;
const APP_VERSION = process.env.APP_VERSION || "v1";

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
