const authService = require("../services/authService");

/**
 * Middleware to protect customer routes using JWT authentication.
 */
function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({
            error: "Authentication token is required"
        });
    }

    const token = authHeader.split(" ")[1];

    try {
        const decoded = authService.verifyToken(token);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({
            error: "Invalid or expired authentication token"
        });
    }
}

module.exports = authenticate;
