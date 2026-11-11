const { httpDuration, httpRequests } = require("../services/metricsService");

/**
 * Middleware that tracks HTTP request duration and count for Prometheus.
 */
function metricsMiddleware(req, res, next) {
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
}

module.exports = metricsMiddleware;
