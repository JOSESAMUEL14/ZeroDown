const db = require("../db");

/**
 * Update authenticated customer profile details.
 */
async function updateProfile(req, res) {
    try {
        const { full_name, phone } = req.body;

        if (full_name !== undefined && (!full_name || typeof full_name !== "string" || !full_name.trim())) {
            return res.status(400).json({
                error: "Full name cannot be empty"
            });
        }

        const result = await db.query(
            `UPDATE customers
             SET full_name = COALESCE($1, full_name),
                 phone = COALESCE($2, phone),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $3
             RETURNING id, email, full_name, phone, role, updated_at`,
            [full_name ? full_name.trim() : null, phone ? phone.trim() : null, req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: "Customer profile not found"
            });
        }

        res.status(200).json({
            message: "Profile updated successfully",
            customer: result.rows[0]
        });
    } catch (error) {
        console.error("Profile update error:", error.message);
        res.status(500).json({
            error: "An error occurred while updating profile"
        });
    }
}

/**
 * List all saved addresses for the authenticated customer.
 */
async function getAddresses(req, res) {
    try {
        const result = await db.query(
            `SELECT id, customer_id, address_line1, address_line2, city, state, postal_code, country, is_default, created_at
             FROM customer_addresses
             WHERE customer_id = $1
             ORDER BY is_default DESC, created_at DESC`,
            [req.user.id]
        );

        res.status(200).json({
            addresses: result.rows
        });
    } catch (error) {
        console.error("Fetch addresses error:", error.message);
        res.status(500).json({
            error: "An error occurred while retrieving addresses"
        });
    }
}

/**
 * Add a new delivery address for the authenticated customer.
 */
async function addAddress(req, res) {
    try {
        const { address_line1, address_line2, city, state, postal_code, country, is_default } = req.body;

        if (!address_line1 || !city || !state || !postal_code) {
            return res.status(400).json({
                error: "Address line 1, city, state, and postal code are required"
            });
        }

        const shouldBeDefault = Boolean(is_default);

        // If this address is set as default, clear any previous default address
        if (shouldBeDefault) {
            await db.query(
                `UPDATE customer_addresses
                 SET is_default = FALSE
                 WHERE customer_id = $1`,
                [req.user.id]
            );
        }

        const result = await db.query(
            `INSERT INTO customer_addresses
             (customer_id, address_line1, address_line2, city, state, postal_code, country, is_default)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING *`,
            [
                req.user.id,
                address_line1.trim(),
                address_line2 ? address_line2.trim() : null,
                city.trim(),
                state.trim(),
                postal_code.trim(),
                country ? country.trim() : "India",
                shouldBeDefault
            ]
        );

        res.status(201).json({
            message: "Address added successfully",
            address: result.rows[0]
        });
    } catch (error) {
        console.error("Add address error:", error.message);
        res.status(500).json({
            error: "An error occurred while adding address"
        });
    }
}

/**
 * Update an existing delivery address.
 */
async function updateAddress(req, res) {
    try {
        const { id } = req.params;
        const { address_line1, address_line2, city, state, postal_code, country, is_default } = req.body;

        // Verify address belongs to customer
        const check = await db.query(
            "SELECT id FROM customer_addresses WHERE id = $1 AND customer_id = $2",
            [id, req.user.id]
        );

        if (check.rows.length === 0) {
            return res.status(404).json({
                error: "Address not found"
            });
        }

        if (is_default === true) {
            await db.query(
                "UPDATE customer_addresses SET is_default = FALSE WHERE customer_id = $1",
                [req.user.id]
            );
        }

        const result = await db.query(
            `UPDATE customer_addresses
             SET address_line1 = COALESCE($1, address_line1),
                 address_line2 = COALESCE($2, address_line2),
                 city = COALESCE($3, city),
                 state = COALESCE($4, state),
                 postal_code = COALESCE($5, postal_code),
                 country = COALESCE($6, country),
                 is_default = COALESCE($7, is_default)
             WHERE id = $8 AND customer_id = $9
             RETURNING *`,
            [
                address_line1 ? address_line1.trim() : null,
                address_line2 ? address_line2.trim() : null,
                city ? city.trim() : null,
                state ? state.trim() : null,
                postal_code ? postal_code.trim() : null,
                country ? country.trim() : null,
                is_default !== undefined ? Boolean(is_default) : null,
                id,
                req.user.id
            ]
        );

        res.status(200).json({
            message: "Address updated successfully",
            address: result.rows[0]
        });
    } catch (error) {
        console.error("Update address error:", error.message);
        res.status(500).json({
            error: "An error occurred while updating address"
        });
    }
}

/**
 * Delete a delivery address.
 */
async function deleteAddress(req, res) {
    try {
        const { id } = req.params;

        const result = await db.query(
            "DELETE FROM customer_addresses WHERE id = $1 AND customer_id = $2 RETURNING id",
            [id, req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: "Address not found"
            });
        }

        res.status(200).json({
            message: "Address deleted successfully"
        });
    } catch (error) {
        console.error("Delete address error:", error.message);
        res.status(500).json({
            error: "An error occurred while deleting address"
        });
    }
}

module.exports = {
    updateProfile,
    getAddresses,
    addAddress,
    updateAddress,
    deleteAddress
};
