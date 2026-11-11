const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const config = require("../config");

const SALT_ROUNDS = 10;

/**
 * Hash a plain text password using bcrypt.
 * @param {string} password
 * @returns {Promise<string>}
 */
async function hashPassword(password) {
    const salt = await bcrypt.genSalt(SALT_ROUNDS);
    return bcrypt.hash(password, salt);
}

/**
 * Compare plain text password against stored bcrypt hash.
 * @param {string} password
 * @param {string} hash
 * @returns {Promise<boolean>}
 */
async function comparePassword(password, hash) {
    return bcrypt.compare(password, hash);
}

/**
 * Generate a signed JWT token for a customer.
 * @param {object} payload
 * @returns {string}
 */
function generateToken(payload) {
    return jwt.sign(payload, config.jwt.secret, {
        expiresIn: config.jwt.expiresIn
    });
}

/**
 * Verify and decode a JWT token.
 * @param {string} token
 * @returns {object}
 */
function verifyToken(token) {
    return jwt.verify(token, config.jwt.secret);
}

module.exports = {
    hashPassword,
    comparePassword,
    generateToken,
    verifyToken
};
