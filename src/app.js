const express = require("express");
const config = require("./config");
const metricsMiddleware = require("./middleware/metricsMiddleware");
const routes = require("./routes");

const app = express();

// Parse JSON request bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Track Prometheus metrics on all incoming requests
app.use(metricsMiddleware);

// Serve static frontend assets from public directory
app.use(express.static(config.publicDir));

// Mount application routes
app.use(routes);

module.exports = app;
