const db = require("../db");

/**
 * Helper to retrieve or create the active cart ID for a customer.
 * @param {string} customerId
 * @returns {Promise<string>}
 */
async function getOrCreateCartId(customerId) {
    const existing = await db.query(
        "SELECT id FROM carts WHERE customer_id = $1",
        [customerId]
    );

    if (existing.rows.length > 0) {
        return existing.rows[0].id;
    }

    const created = await db.query(
        "INSERT INTO carts (customer_id) VALUES ($1) RETURNING id",
        [customerId]
    );

    return created.rows[0].id;
}

/**
 * Retrieve active shopping cart with server-calculated totals.
 */
async function getCart(req, res) {
    try {
        const customerId = req.user.id;
        const cartId = await getOrCreateCartId(customerId);

        const result = await db.query(
            `SELECT ci.id, ci.cart_id, ci.product_id, ci.quantity,
                    p.name, p.slug, p.price, p.old_price, p.image_url,
                    p.stock_quantity, p.is_active,
                    (ci.quantity * p.price)::numeric(10, 2) AS subtotal
             FROM cart_items ci
             JOIN carts c ON ci.cart_id = c.id
             JOIN products p ON ci.product_id = p.id
             WHERE c.customer_id = $1
             ORDER BY ci.created_at ASC`,
            [customerId]
        );

        const items = result.rows.map(item => ({
            ...item,
            price: Number(item.price),
            old_price: item.old_price ? Number(item.old_price) : null,
            subtotal: Number(item.subtotal)
        }));

        const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
        const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

        res.status(200).json({
            cart: {
                id: cartId,
                items,
                itemCount,
                subtotal: Math.round(subtotal * 100) / 100,
                total: Math.round(subtotal * 100) / 100
            }
        });
    } catch (error) {
        console.error("Get cart error:", error.message);
        res.status(500).json({
            error: "An error occurred while retrieving the shopping cart"
        });
    }
}

/**
 * Add an item to the shopping cart or increment existing quantity.
 */
async function addItem(req, res) {
    try {
        const customerId = req.user.id;
        const { product_id, quantity = 1 } = req.body;

        const productId = parseInt(product_id, 10);
        const qty = parseInt(quantity, 10);

        if (isNaN(productId) || isNaN(qty) || qty < 1) {
            return res.status(400).json({
                error: "Valid product_id and a positive quantity (minimum 1) are required"
            });
        }

        // Validate product existence and stock
        const productCheck = await db.query(
            "SELECT id, name, price, stock_quantity, is_active FROM products WHERE id = $1",
            [productId]
        );

        if (productCheck.rows.length === 0 || !productCheck.rows[0].is_active) {
            return res.status(404).json({
                error: "Product not found or currently unavailable"
            });
        }

        const product = productCheck.rows[0];
        const cartId = await getOrCreateCartId(customerId);

        // Check if product is already in this customer's cart
        const existingItem = await db.query(
            "SELECT id, quantity FROM cart_items WHERE cart_id = $1 AND product_id = $2",
            [cartId, productId]
        );

        let finalQuantity = qty;
        if (existingItem.rows.length > 0) {
            finalQuantity += existingItem.rows[0].quantity;
        }

        // Enforce inventory stock check
        if (finalQuantity > product.stock_quantity) {
            return res.status(400).json({
                error: `Insufficient stock. Only ${product.stock_quantity} units available.`
            });
        }

        let itemResult;
        if (existingItem.rows.length > 0) {
            itemResult = await db.query(
                `UPDATE cart_items
                 SET quantity = $1
                 WHERE id = $2
                 RETURNING *`,
                [finalQuantity, existingItem.rows[0].id]
            );
        } else {
            itemResult = await db.query(
                `INSERT INTO cart_items (cart_id, product_id, quantity)
                 VALUES ($1, $2, $3)
                 RETURNING *`,
                [cartId, productId, qty]
            );
        }

        res.status(201).json({
            message: "Item added to cart",
            item: itemResult.rows[0]
        });
    } catch (error) {
        console.error("Add to cart error:", error.message);
        res.status(500).json({
            error: "An error occurred while adding item to cart"
        });
    }
}

/**
 * Update quantity of a specific cart item.
 */
async function updateItem(req, res) {
    try {
        const customerId = req.user.id;
        const { id } = req.params;
        const { quantity } = req.body;

        const qty = parseInt(quantity, 10);
        if (isNaN(qty) || qty < 1) {
            return res.status(400).json({
                error: "Quantity must be an integer of at least 1"
            });
        }

        // Verify cart item belongs to customer and check stock
        const itemCheck = await db.query(
            `SELECT ci.id, ci.cart_id, ci.product_id, p.stock_quantity, p.is_active
             FROM cart_items ci
             JOIN carts c ON ci.cart_id = c.id
             JOIN products p ON ci.product_id = p.id
             WHERE ci.id = $1 AND c.customer_id = $2`,
            [id, customerId]
        );

        if (itemCheck.rows.length === 0) {
            return res.status(404).json({
                error: "Cart item not found"
            });
        }

        const item = itemCheck.rows[0];

        if (!item.is_active) {
            return res.status(400).json({
                error: "This product is no longer available"
            });
        }

        if (qty > item.stock_quantity) {
            return res.status(400).json({
                error: `Requested quantity exceeds available stock (${item.stock_quantity} available)`
            });
        }

        const result = await db.query(
            `UPDATE cart_items
             SET quantity = $1
             WHERE id = $2
             RETURNING *`,
            [qty, id]
        );

        res.status(200).json({
            message: "Cart item updated",
            item: result.rows[0]
        });
    } catch (error) {
        console.error("Update cart item error:", error.message);
        res.status(500).json({
            error: "An error occurred while updating cart item"
        });
    }
}

/**
 * Remove a specific item from customer's cart.
 */
async function removeItem(req, res) {
    try {
        const customerId = req.user.id;
        const { id } = req.params;

        const result = await db.query(
            `DELETE FROM cart_items
             WHERE id = $1 AND cart_id IN (
                 SELECT id FROM carts WHERE customer_id = $2
             )
             RETURNING id`,
            [id, customerId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: "Cart item not found"
            });
        }

        res.status(200).json({
            message: "Item removed from cart"
        });
    } catch (error) {
        console.error("Remove cart item error:", error.message);
        res.status(500).json({
            error: "An error occurred while removing cart item"
        });
    }
}

/**
 * Clear all items from customer's cart.
 */
async function clearCart(req, res) {
    try {
        const customerId = req.user.id;

        await db.query(
            `DELETE FROM cart_items
             WHERE cart_id IN (
                 SELECT id FROM carts WHERE customer_id = $1
             )`,
            [customerId]
        );

        res.status(200).json({
            message: "Cart cleared successfully"
        });
    } catch (error) {
        console.error("Clear cart error:", error.message);
        res.status(500).json({
            error: "An error occurred while clearing cart"
        });
    }
}

module.exports = {
    getCart,
    addItem,
    updateItem,
    removeItem,
    clearCart
};
