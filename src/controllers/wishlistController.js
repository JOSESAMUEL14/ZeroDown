const db = require("../db");

/**
 * List all items in the authenticated customer's wishlist.
 */
async function getWishlist(req, res) {
    try {
        const customerId = req.user.id;

        const result = await db.query(
            `SELECT w.id, w.product_id, w.created_at,
                    p.name, p.slug, p.price, p.old_price, p.image_url,
                    p.rating, p.review_count, p.stock_quantity, p.is_active,
                    c.name AS category_name, c.slug AS category_slug
             FROM wishlist_items w
             JOIN products p ON w.product_id = p.id
             LEFT JOIN categories c ON p.category_id = c.id
             WHERE w.customer_id = $1
             ORDER BY w.created_at DESC`,
            [customerId]
        );

        const items = result.rows.map(item => ({
            ...item,
            price: Number(item.price),
            old_price: item.old_price ? Number(item.old_price) : null
        }));

        res.status(200).json({
            wishlist: {
                items,
                count: items.length
            }
        });
    } catch (error) {
        console.error("Get wishlist error:", error.message);
        res.status(500).json({
            error: "An error occurred while retrieving wishlist"
        });
    }
}

/**
 * Add a product to the authenticated customer's wishlist.
 */
async function addItem(req, res) {
    try {
        const customerId = req.user.id;
        const { product_id } = req.body;

        const productId = parseInt(product_id, 10);
        if (isNaN(productId)) {
            return res.status(400).json({
                error: "Valid product_id is required"
            });
        }

        // Validate product existence
        const productCheck = await db.query(
            "SELECT id, name, is_active FROM products WHERE id = $1",
            [productId]
        );

        if (productCheck.rows.length === 0 || !productCheck.rows[0].is_active) {
            return res.status(404).json({
                error: "Product not found or currently unavailable"
            });
        }

        // Check for duplicate entry
        const existing = await db.query(
            "SELECT id FROM wishlist_items WHERE customer_id = $1 AND product_id = $2",
            [customerId, productId]
        );

        if (existing.rows.length > 0) {
            return res.status(409).json({
                error: "Product is already in your wishlist"
            });
        }

        const result = await db.query(
            `INSERT INTO wishlist_items (customer_id, product_id)
             VALUES ($1, $2)
             RETURNING *`,
            [customerId, productId]
        );

        res.status(201).json({
            message: "Product added to wishlist",
            item: result.rows[0]
        });
    } catch (error) {
        console.error("Add wishlist item error:", error.message);
        res.status(500).json({
            error: "An error occurred while adding to wishlist"
        });
    }
}

/**
 * Remove a product from the authenticated customer's wishlist.
 */
async function removeItem(req, res) {
    try {
        const customerId = req.user.id;
        const { productId } = req.params;

        const parsedProductId = parseInt(productId, 10);
        if (isNaN(parsedProductId)) {
            return res.status(400).json({
                error: "Valid productId parameter is required"
            });
        }

        const result = await db.query(
            `DELETE FROM wishlist_items
             WHERE customer_id = $1 AND product_id = $2
             RETURNING id`,
            [customerId, parsedProductId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: "Wishlist item not found"
            });
        }

        res.status(200).json({
            message: "Product removed from wishlist"
        });
    } catch (error) {
        console.error("Remove wishlist item error:", error.message);
        res.status(500).json({
            error: "An error occurred while removing from wishlist"
        });
    }
}

module.exports = {
    getWishlist,
    addItem,
    removeItem
};
