const db = require("../db");
const authService = require("../services/authService");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Handle new customer registration.
 */
async function register(req, res) {
    try {
        const { email, password, full_name, phone } = req.body;

        if (!email || !EMAIL_REGEX.test(email)) {
            return res.status(400).json({
                error: "Valid email address is required"
            });
        }

        if (!password || typeof password !== "string" || password.length < 6) {
            return res.status(400).json({
                error: "Password must be at least 6 characters long"
            });
        }

        if (!full_name || typeof full_name !== "string" || !full_name.trim()) {
            return res.status(400).json({
                error: "Full name is required"
            });
        }

        const normalizedEmail = email.trim().toLowerCase();

        // Check if customer already exists
        const existing = await db.query(
            "SELECT id FROM customers WHERE email = $1",
            [normalizedEmail]
        );

        if (existing.rows.length > 0) {
            return res.status(409).json({
                error: "An account with this email already exists"
            });
        }

        // Hash password safely
        const passwordHash = await authService.hashPassword(password);

        // Insert new customer using parameterized query
        const result = await db.query(
            `INSERT INTO customers (email, password_hash, full_name, phone)
             VALUES ($1, $2, $3, $4)
             RETURNING id, email, full_name, phone, role, created_at`,
            [normalizedEmail, passwordHash, full_name.trim(), phone ? phone.trim() : null]
        );

        const customer = result.rows[0];

        // Generate JWT token
        const token = authService.generateToken({
            id: customer.id,
            email: customer.email,
            role: customer.role
        });

        res.status(201).json({
            message: "Registration successful",
            token,
            customer
        });
    } catch (error) {
        console.error("Registration error:", error.message);
        res.status(500).json({
            error: "An error occurred during registration"
        });
    }
}

/**
 * Handle customer login.
 */
async function login(req, res) {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                error: "Email and password are required"
            });
        }

        const normalizedEmail = email.trim().toLowerCase();

        // Retrieve customer by email
        const result = await db.query(
            `SELECT id, email, password_hash, full_name, phone, role
             FROM customers
             WHERE email = $1`,
            [normalizedEmail]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                error: "Invalid email or password"
            });
        }

        const customer = result.rows[0];

        // Verify password
        const isMatch = await authService.comparePassword(password, customer.password_hash);
        if (!isMatch) {
            return res.status(401).json({
                error: "Invalid email or password"
            });
        }

        // Generate JWT token
        const token = authService.generateToken({
            id: customer.id,
            email: customer.email,
            role: customer.role
        });

        // Exclude password hash from response
        const safeCustomer = {
            id: customer.id,
            email: customer.email,
            full_name: customer.full_name,
            phone: customer.phone,
            role: customer.role
        };

        res.status(200).json({
            message: "Login successful",
            token,
            customer: safeCustomer
        });
    } catch (error) {
        console.error("Login error:", error.message);
        res.status(500).json({
            error: "An error occurred during login"
        });
    }
}

/**
 * Retrieve authenticated customer profile.
 */
async function getProfile(req, res) {
    try {
        const result = await db.query(
            `SELECT id, email, full_name, phone, role, created_at, updated_at
             FROM customers
             WHERE id = $1`,
            [req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: "Customer profile not found"
            });
        }

        res.status(200).json({
            customer: result.rows[0]
        });
    } catch (error) {
        console.error("Profile retrieval error:", error.message);
        res.status(500).json({
            error: "An error occurred while retrieving profile"
        });
    }
}

module.exports = {
    register,
    login,
    getProfile
};
