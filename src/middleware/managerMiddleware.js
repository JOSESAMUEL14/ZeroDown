const authService = require("../services/authService");

/**
 * Middleware ensuring the authenticated user has manager or admin privileges.
 */
function requireManager(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({
            error: "Manager authentication token is required"
        });
    }

    const token = authHeader.split(" ")[1];

    try {
        const decoded = authService.verifyToken(token);
        if (decoded.role !== "manager" && decoded.role !== "admin") {
            return res.status(403).json({
                error: "Forbidden: Manager privileges are required to perform this action"
            });
        }
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({
            error: "Invalid or expired manager authentication token"
        });
    }
}

module.exports = requireManager;
