const client = require("prom-client");
const config = require("../config");

// Create isolated Prometheus registry
const register = new client.Registry();

// Configure default labels for blue/green deployment tracking
register.setDefaultLabels({
    application: "zerodown",
    version: config.appVersion
});

// Collect default runtime and Node.js metrics
client.collectDefaultMetrics({ register });

// HTTP request counter metric
const httpRequests = new client.Counter({
    name: "zerodown_http_requests_total",
    help: "Total HTTP requests",
    labelNames: ["method", "route", "status_code"],
    registers: [register]
});

// HTTP request duration histogram metric
const httpDuration = new client.Histogram({
    name: "zerodown_http_request_duration_seconds",
    help: "HTTP request duration in seconds",
    labelNames: ["method", "route", "status_code"],
    registers: [register]
});

module.exports = {
    register,
    httpRequests,
    httpDuration,
    getMetrics: async () => register.metrics(),
    getContentType: () => register.contentType
};
