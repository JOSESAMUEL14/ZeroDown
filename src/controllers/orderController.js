const db = require("../db");
const config = require("../config");

/**
 * Helper to build an order tracking timeline.
 * @param {string} status
 * @param {string} createdAt
 * @param {string} updatedAt
 * @returns {Array<{ stage: string, completed: boolean, timestamp: string|null }>}
 */
function buildTrackingTimeline(status, createdAt, updatedAt) {
    if (status === "cancelled") {
        return [
            { stage: "Order Placed", completed: true, timestamp: createdAt },
            { stage: "Cancelled", completed: true, timestamp: updatedAt }
        ];
    }

    const stages = ["pending", "processing", "shipped", "delivered"];
    const currentIdx = stages.indexOf(status);

    return [
        {
            stage: "Order Placed",
            statusKey: "pending",
            completed: currentIdx >= 0,
            timestamp: createdAt
        },
        {
            stage: "Processing",
            statusKey: "processing",
            completed: currentIdx >= 1,
            timestamp: currentIdx >= 1 ? updatedAt : null
        },
        {
            stage: "Shipped",
            statusKey: "shipped",
            completed: currentIdx >= 2,
            timestamp: currentIdx >= 2 ? updatedAt : null
        },
        {
            stage: "Delivered",
            statusKey: "delivered",
            completed: currentIdx >= 3,
            timestamp: currentIdx >= 3 ? updatedAt : null
        }
    ];
}

/**
 * Handle checkout: converts customer's active cart into an order using an atomic transaction,
 * acquires row-level locks on products, deducts inventory, and clears the cart.
 */
async function checkout(req, res) {
    const customerId = req.user.id;
    const { address_id, shipping_address, payment_method = "demo" } = req.body;

    const client = await db.getClient();

    try {
        await client.query("BEGIN");

        // 1. Resolve Delivery Address
        let deliveryAddress = null;

        if (address_id) {
            const addrResult = await client.query(
                `SELECT address_line1, address_line2, city, state, postal_code, country
                 FROM customer_addresses
                 WHERE id = $1 AND customer_id = $2`,
                [address_id, customerId]
            );

            if (addrResult.rows.length === 0) {
                await client.query("ROLLBACK");
                return res.status(400).json({
                    error: "Selected delivery address not found"
                });
            }
            deliveryAddress = addrResult.rows[0];
        } else if (shipping_address && shipping_address.address_line1 && shipping_address.city) {
            deliveryAddress = {
                address_line1: shipping_address.address_line1.trim(),
                address_line2: shipping_address.address_line2 ? shipping_address.address_line2.trim() : null,
                city: shipping_address.city.trim(),
                state: shipping_address.state ? shipping_address.state.trim() : "",
                postal_code: shipping_address.postal_code ? shipping_address.postal_code.trim() : "",
                country: shipping_address.country ? shipping_address.country.trim() : "India"
            };
        } else {
            // Check for customer's default address
            const defaultAddr = await client.query(
                `SELECT address_line1, address_line2, city, state, postal_code, country
                 FROM customer_addresses
                 WHERE customer_id = $1 AND is_default = TRUE`,
                [customerId]
            );

            if (defaultAddr.rows.length > 0) {
                deliveryAddress = defaultAddr.rows[0];
            } else {
                await client.query("ROLLBACK");
                return res.status(400).json({
                    error: "Delivery address is required for checkout"
                });
            }
        }

        // 2. Retrieve customer's active cart
        const cartResult = await client.query(
            "SELECT id FROM carts WHERE customer_id = $1",
            [customerId]
        );

        if (cartResult.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(400).json({
                error: "Shopping cart is empty"
            });
        }

        const cartId = cartResult.rows[0].id;

        // 3. Fetch cart items
        const cartItemsResult = await client.query(
            `SELECT id, product_id, quantity
             FROM cart_items
             WHERE cart_id = $1
             ORDER BY product_id ASC`,
            [cartId]
        );

        if (cartItemsResult.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(400).json({
                error: "Shopping cart is empty"
            });
        }

        const cartItems = cartItemsResult.rows;

        // 4. Row-level locking on products to prevent concurrent overselling (FOR UPDATE)
        const productIds = cartItems.map(item => item.product_id);
        const lockedProductsResult = await client.query(
            `SELECT id, name, price, stock_quantity, is_active
             FROM products
             WHERE id = ANY($1::int[])
             FOR UPDATE`,
            [productIds]
        );

        const lockedProducts = lockedProductsResult.rows;

        // 5. Verify availability and stock for each item, calculate server totals
        let totalAmount = 0;
        const validatedItems = [];

        for (const item of cartItems) {
            const product = lockedProducts.find(p => p.id === item.product_id);

            if (!product || !product.is_active) {
                await client.query("ROLLBACK");
                return res.status(400).json({
                    error: `Product #${item.product_id} is no longer available`
                });
            }

            if (item.quantity > product.stock_quantity) {
                await client.query("ROLLBACK");
                return res.status(400).json({
                    error: `Insufficient stock for "${product.name}". Only ${product.stock_quantity} units available.`
                });
            }

            const unitPrice = Number(product.price);
            const subtotal = Math.round(unitPrice * item.quantity * 100) / 100;
            totalAmount += subtotal;

            validatedItems.push({
                product_id: product.id,
                product_name: product.name,
                unit_price: unitPrice,
                quantity: item.quantity,
                subtotal
            });
        }

        totalAmount = Math.round(totalAmount * 100) / 100;

        // 6. Create Order record with Blue/Green audit version
        const orderResult = await client.query(
            `INSERT INTO orders
             (customer_id, total_amount, status, shipping_address, payment_method, deployed_version)
             VALUES ($1, $2, 'pending', $3, $4, $5)
             RETURNING *`,
            [
                customerId,
                totalAmount,
                JSON.stringify(deliveryAddress),
                payment_method,
                config.appVersion
            ]
        );

        const order = orderResult.rows[0];

        // 7. Insert Order Line Items and deduct stock atomically
        const insertedItems = [];
        for (const item of validatedItems) {
            const itemResult = await client.query(
                `INSERT INTO order_items
                 (order_id, product_id, product_name, unit_price, quantity, subtotal)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 RETURNING *`,
                [
                    order.id,
                    item.product_id,
                    item.product_name,
                    item.unit_price,
                    item.quantity,
                    item.subtotal
                ]
            );
            insertedItems.push(itemResult.rows[0]);

            // Deduct stock from inventory
            await client.query(
                `UPDATE products
                 SET stock_quantity = stock_quantity - $1,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $2`,
                [item.quantity, item.product_id]
            );
        }

        // 8. Clear the cart only after successful order and line items creation
        await client.query(
            "DELETE FROM cart_items WHERE cart_id = $1",
            [cartId]
        );

        await client.query("COMMIT");

        res.status(201).json({
            message: "Order placed successfully",
            order: {
                ...order,
                total_amount: Number(order.total_amount),
                shipping_address: typeof order.shipping_address === "string"
                    ? JSON.parse(order.shipping_address)
                    : order.shipping_address,
                items: insertedItems
            }
        });
    } catch (error) {
        await client.query("ROLLBACK");
        console.error("Checkout transaction error:", error.message);
        res.status(500).json({
            error: "An error occurred while processing checkout"
        });
    } finally {
        client.release();
    }
}

/**
 * List all orders for the authenticated customer.
 */
async function getOrders(req, res) {
    try {
        const customerId = req.user.id;

        const result = await db.query(
            `SELECT o.id, o.customer_id, o.total_amount, o.status,
                    o.shipping_address, o.payment_method, o.deployed_version,
                    o.created_at, o.updated_at,
                    COUNT(oi.id)::int AS total_items
             FROM orders o
             LEFT JOIN order_items oi ON o.id = oi.order_id
             WHERE o.customer_id = $1
             GROUP BY o.id
             ORDER BY o.created_at DESC`,
            [customerId]
        );

        const orders = result.rows.map(o => ({
            ...o,
            total_amount: Number(o.total_amount),
            shipping_address: typeof o.shipping_address === "string"
                ? JSON.parse(o.shipping_address)
                : o.shipping_address
        }));

        res.status(200).json({
            orders
        });
    } catch (error) {
        console.error("Get orders error:", error.message);
        res.status(500).json({
            error: "An error occurred while retrieving order history"
        });
    }
}

/**
 * Retrieve details, line items, and tracking timeline for a specific order.
 */
async function getOrderById(req, res) {
    try {
        const customerId = req.user.id;
        const { id } = req.params;

        const orderResult = await db.query(
            `SELECT id, customer_id, total_amount, status,
                    shipping_address, payment_method, deployed_version,
                    created_at, updated_at
             FROM orders
             WHERE id = $1 AND customer_id = $2`,
            [id, customerId]
        );

        if (orderResult.rows.length === 0) {
            return res.status(404).json({
                error: "Order not found"
            });
        }

        const order = orderResult.rows[0];

        const itemsResult = await db.query(
            `SELECT id, order_id, product_id, product_name,
                    unit_price, quantity, subtotal
             FROM order_items
             WHERE order_id = $1
             ORDER BY product_name ASC`,
            [id]
        );

        const items = itemsResult.rows.map(item => ({
            ...item,
            unit_price: Number(item.unit_price),
            subtotal: Number(item.subtotal)
        }));

        const timeline = buildTrackingTimeline(order.status, order.created_at, order.updated_at);

        res.status(200).json({
            order: {
                ...order,
                total_amount: Number(order.total_amount),
                shipping_address: typeof order.shipping_address === "string"
                    ? JSON.parse(order.shipping_address)
                    : order.shipping_address,
                items,
                tracking: {
                    currentStatus: order.status,
                    timeline
                }
            }
        });
    } catch (error) {
        console.error("Get order detail error:", error.message);
        res.status(500).json({
            error: "An error occurred while retrieving order details"
        });
    }
}

/**
 * Cancel an order and restore product inventory within an atomic transaction.
 * Prevents duplicate cancellation or cancellation of delivered orders.
 */
async function cancelOrder(req, res) {
    const customerId = req.user.id;
    const { id } = req.params;

    const client = await db.getClient();

    try {
        await client.query("BEGIN");

        // 1. Lock the order row to prevent concurrent race conditions
        const orderResult = await client.query(
            `SELECT id, customer_id, status, total_amount
             FROM orders
             WHERE id = $1 AND customer_id = $2
             FOR UPDATE`,
            [id, customerId]
        );

        if (orderResult.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({
                error: "Order not found"
            });
        }

        const order = orderResult.rows[0];

        // 2. Prevent duplicate cancellation
        if (order.status === "cancelled") {
            await client.query("ROLLBACK");
            return res.status(400).json({
                error: "Order has already been cancelled"
            });
        }

        // 3. Only pending or processing orders can be cancelled
        if (order.status === "shipped" || order.status === "delivered") {
            await client.query("ROLLBACK");
            return res.status(400).json({
                error: `Order cannot be cancelled as it is already ${order.status}`
            });
        }

        // 4. Update status to cancelled
        const updatedOrderResult = await client.query(
            `UPDATE orders
             SET status = 'cancelled',
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $1
             RETURNING *`,
            [id]
        );

        // 5. Restore product inventory
        const itemsResult = await client.query(
            "SELECT product_id, quantity FROM order_items WHERE order_id = $1",
            [id]
        );

        for (const item of itemsResult.rows) {
            if (item.product_id) {
                await client.query(
                    `UPDATE products
                     SET stock_quantity = stock_quantity + $1,
                         updated_at = CURRENT_TIMESTAMP
                     WHERE id = $2`,
                    [item.quantity, item.product_id]
                );
            }
        }

        await client.query("COMMIT");

        res.status(200).json({
            message: "Order cancelled successfully and inventory restored",
            order: {
                ...updatedOrderResult.rows[0],
                total_amount: Number(updatedOrderResult.rows[0].total_amount)
            }
        });
    } catch (error) {
        await client.query("ROLLBACK");
        console.error("Order cancellation error:", error.message);
        res.status(500).json({
            error: "An error occurred while cancelling the order"
        });
    } finally {
        client.release();
    }
}

module.exports = {
    checkout,
    getOrders,
    getOrderById,
    cancelOrder
};
