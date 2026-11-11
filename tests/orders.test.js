const request = require("supertest");
const app = require("../server");
const db = require("../src/db");
const authService = require("../src/services/authService");

describe("ZeroDown Checkout & Order Processing API Tests", () => {
    let originalPool;
    const customerA = "11111111-1111-1111-1111-111111111111";
    const customerB = "22222222-2222-2222-2222-222222222222";
    let tokenA;
    let tokenB;

    beforeAll(() => {
        originalPool = db.getPool();
        tokenA = authService.generateToken({ id: customerA, email: "customerA@example.com", role: "customer" });
        tokenB = authService.generateToken({ id: customerB, email: "customerB@example.com", role: "customer" });
    });

    afterAll(() => {
        db.setPool(originalPool);
    });

    describe("Authentication Enforcement", () => {
        test("All order endpoints must reject unauthenticated requests with 401", async () => {
            const checkoutRes = await request(app).post("/api/v1/orders/checkout").send({});
            expect(checkoutRes.statusCode).toBe(401);

            const listRes = await request(app).get("/api/v1/orders");
            expect(listRes.statusCode).toBe(401);

            const detailRes = await request(app).get("/api/v1/orders/order-123");
            expect(detailRes.statusCode).toBe(401);

            const cancelRes = await request(app).post("/api/v1/orders/order-123/cancel");
            expect(cancelRes.statusCode).toBe(401);
        });
    });

    describe("POST /api/v1/orders/checkout", () => {
        test("should reject checkout if no address is provided or found", async () => {
            const mockClient = {
                query: jest.fn().mockImplementation((sql) => {
                    if (sql === "BEGIN") return Promise.resolve();
                    if (sql === "ROLLBACK") return Promise.resolve();
                    if (sql.includes("FROM customer_addresses")) return Promise.resolve({ rows: [] });
                    return Promise.resolve({ rows: [] });
                }),
                release: jest.fn()
            };

            db.setPool({
                connect: jest.fn().mockResolvedValue(mockClient),
                on: jest.fn()
            });

            const res = await request(app)
                .post("/api/v1/orders/checkout")
                .set("Authorization", `Bearer ${tokenA}`)
                .send({});

            expect(res.statusCode).toBe(400);
            expect(res.body.error).toContain("Delivery address is required");
            expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
            expect(mockClient.release).toHaveBeenCalled();
        });

        test("should reject checkout if cart is empty", async () => {
            const mockClient = {
                query: jest.fn().mockImplementation((sql) => {
                    if (sql === "BEGIN") return Promise.resolve();
                    if (sql === "ROLLBACK") return Promise.resolve();
                    if (sql.includes("FROM carts")) return Promise.resolve({ rows: [{ id: "cart-1" }] });
                    if (sql.includes("FROM cart_items")) return Promise.resolve({ rows: [] }); // empty cart
                    return Promise.resolve({ rows: [] });
                }),
                release: jest.fn()
            };

            db.setPool({
                connect: jest.fn().mockResolvedValue(mockClient),
                on: jest.fn()
            });

            const res = await request(app)
                .post("/api/v1/orders/checkout")
                .set("Authorization", `Bearer ${tokenA}`)
                .send({
                    shipping_address: {
                        address_line1: "123 Main St",
                        city: "Bengaluru",
                        state: "Karnataka",
                        postal_code: "560001"
                    }
                });

            expect(res.statusCode).toBe(400);
            expect(res.body.error).toContain("Shopping cart is empty");
            expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
            expect(mockClient.release).toHaveBeenCalled();
        });

        test("should reject checkout and rollback if stock is insufficient", async () => {
            const mockCartItem = { id: "item-1", product_id: 1, quantity: 5 };
            const mockLockedProduct = { id: 1, name: "Headphones", price: 1499, stock_quantity: 2, is_active: true };

            const mockClient = {
                query: jest.fn().mockImplementation((sql) => {
                    if (sql === "BEGIN") return Promise.resolve();
                    if (sql === "ROLLBACK") return Promise.resolve();
                    if (sql.includes("FROM carts")) return Promise.resolve({ rows: [{ id: "cart-1" }] });
                    if (sql.includes("FROM cart_items")) return Promise.resolve({ rows: [mockCartItem] });
                    if (sql.includes("FOR UPDATE")) return Promise.resolve({ rows: [mockLockedProduct] });
                    return Promise.resolve({ rows: [] });
                }),
                release: jest.fn()
            };

            db.setPool({
                connect: jest.fn().mockResolvedValue(mockClient),
                on: jest.fn()
            });

            const res = await request(app)
                .post("/api/v1/orders/checkout")
                .set("Authorization", `Bearer ${tokenA}`)
                .send({
                    shipping_address: {
                        address_line1: "123 Main St",
                        city: "Bengaluru",
                        state: "Karnataka",
                        postal_code: "560001"
                    }
                });

            expect(res.statusCode).toBe(400);
            expect(res.body.error).toContain("Insufficient stock");
            expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
            expect(mockClient.release).toHaveBeenCalled();
        });

        test("should complete checkout successfully within an atomic transaction", async () => {
            const mockCartItem = { id: "item-1", product_id: 1, quantity: 2 };
            const mockLockedProduct = { id: 1, name: "Sonic Pro Headphones", price: "1499.00", stock_quantity: 10, is_active: true };
            const mockCreatedOrder = {
                id: "order-uuid-1",
                customer_id: customerA,
                total_amount: "2998.00",
                status: "pending",
                shipping_address: JSON.stringify({ address_line1: "123 Main St", city: "Bengaluru" }),
                payment_method: "demo",
                deployed_version: "v1",
                created_at: new Date().toISOString()
            };
            const mockOrderItem = {
                id: "oi-1",
                order_id: "order-uuid-1",
                product_id: 1,
                product_name: "Sonic Pro Headphones",
                unit_price: "1499.00",
                quantity: 2,
                subtotal: "2998.00"
            };

            const mockClient = {
                query: jest.fn().mockImplementation((sql, params) => {
                    if (sql === "BEGIN") return Promise.resolve();
                    if (sql === "COMMIT") return Promise.resolve();
                    if (sql === "ROLLBACK") return Promise.resolve();
                    if (sql.includes("FROM carts")) return Promise.resolve({ rows: [{ id: "cart-1" }] });
                    if (sql.includes("FROM cart_items")) return Promise.resolve({ rows: [mockCartItem] });
                    if (sql.includes("FOR UPDATE")) return Promise.resolve({ rows: [mockLockedProduct] });
                    if (sql.includes("INSERT INTO orders")) return Promise.resolve({ rows: [mockCreatedOrder] });
                    if (sql.includes("INSERT INTO order_items")) return Promise.resolve({ rows: [mockOrderItem] });
                    if (sql.includes("UPDATE products")) return Promise.resolve({ rowCount: 1 });
                    if (sql.includes("DELETE FROM cart_items")) return Promise.resolve({ rowCount: 1 });
                    return Promise.resolve({ rows: [] });
                }),
                release: jest.fn()
            };

            db.setPool({
                connect: jest.fn().mockResolvedValue(mockClient),
                on: jest.fn()
            });

            const res = await request(app)
                .post("/api/v1/orders/checkout")
                .set("Authorization", `Bearer ${tokenA}`)
                .send({
                    shipping_address: {
                        address_line1: "123 Main St",
                        city: "Bengaluru",
                        state: "Karnataka",
                        postal_code: "560001"
                    },
                    payment_method: "demo_card"
                });

            expect(res.statusCode).toBe(201);
            expect(res.body.message).toContain("Order placed successfully");
            expect(res.body.order.id).toBe("order-uuid-1");
            expect(res.body.order.total_amount).toBe(2998);
            expect(res.body.order.items.length).toBe(1);

            // Verify atomic transaction boundaries
            expect(mockClient.query).toHaveBeenCalledWith("BEGIN");
            expect(mockClient.query).toHaveBeenCalledWith("COMMIT");
            expect(mockClient.release).toHaveBeenCalled();
        });
    });

    describe("GET /api/v1/orders & GET /api/v1/orders/:id", () => {
        test("GET /api/v1/orders should return customer order history", async () => {
            const mockOrders = [
                {
                    id: "order-1",
                    customer_id: customerA,
                    total_amount: "2998.00",
                    status: "pending",
                    shipping_address: { city: "Bengaluru" },
                    total_items: 2
                }
            ];

            db.setPool({
                query: jest.fn().mockResolvedValue({ rows: mockOrders }),
                on: jest.fn()
            });

            const res = await request(app)
                .get("/api/v1/orders")
                .set("Authorization", `Bearer ${tokenA}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.orders.length).toBe(1);
            expect(res.body.orders[0].total_amount).toBe(2998);
        });

        test("GET /api/v1/orders/:id should return 404 for nonexistent order", async () => {
            db.setPool({
                query: jest.fn().mockResolvedValue({ rows: [] }),
                on: jest.fn()
            });

            const res = await request(app)
                .get("/api/v1/orders/nonexistent-id")
                .set("Authorization", `Bearer ${tokenA}`);

            expect(res.statusCode).toBe(404);
            expect(res.body.error).toContain("Order not found");
        });

        test("GET /api/v1/orders/:id should return order details with line items and tracking timeline", async () => {
            const mockOrder = {
                id: "order-1",
                customer_id: customerA,
                total_amount: "1499.00",
                status: "processing",
                shipping_address: { city: "Bengaluru" },
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };
            const mockItems = [
                {
                    id: "oi-1",
                    order_id: "order-1",
                    product_id: 1,
                    product_name: "Headphones",
                    unit_price: "1499.00",
                    quantity: 1,
                    subtotal: "1499.00"
                }
            ];

            const mockQuery = jest.fn()
                .mockResolvedValueOnce({ rows: [mockOrder] })
                .mockResolvedValueOnce({ rows: mockItems });

            db.setPool({ query: mockQuery, on: jest.fn() });

            const res = await request(app)
                .get("/api/v1/orders/order-1")
                .set("Authorization", `Bearer ${tokenA}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.order.id).toBe("order-1");
            expect(res.body.order.items.length).toBe(1);
            expect(res.body.order.tracking).toBeDefined();
            expect(res.body.order.tracking.currentStatus).toBe("processing");
            expect(res.body.order.tracking.timeline.length).toBe(4);
        });
    });

    describe("POST /api/v1/orders/:id/cancel", () => {
        test("should reject cancellation if order is already cancelled", async () => {
            const mockClient = {
                query: jest.fn().mockImplementation((sql) => {
                    if (sql === "BEGIN") return Promise.resolve();
                    if (sql === "ROLLBACK") return Promise.resolve();
                    if (sql.includes("FOR UPDATE")) return Promise.resolve({ rows: [{ id: "order-1", status: "cancelled" }] });
                    return Promise.resolve({ rows: [] });
                }),
                release: jest.fn()
            };

            db.setPool({
                connect: jest.fn().mockResolvedValue(mockClient),
                on: jest.fn()
            });

            const res = await request(app)
                .post("/api/v1/orders/order-1/cancel")
                .set("Authorization", `Bearer ${tokenA}`);

            expect(res.statusCode).toBe(400);
            expect(res.body.error).toContain("already been cancelled");
            expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
        });

        test("should cancel order successfully and restore inventory in transaction", async () => {
            const mockPendingOrder = { id: "order-1", customer_id: customerA, status: "pending", total_amount: "1499.00" };
            const mockUpdatedOrder = { id: "order-1", customer_id: customerA, status: "cancelled", total_amount: "1499.00" };
            const mockItems = [{ product_id: 1, quantity: 2 }];

            const mockClient = {
                query: jest.fn().mockImplementation((sql) => {
                    if (sql === "BEGIN") return Promise.resolve();
                    if (sql === "COMMIT") return Promise.resolve();
                    if (sql === "ROLLBACK") return Promise.resolve();
                    if (sql.includes("FOR UPDATE")) return Promise.resolve({ rows: [mockPendingOrder] });
                    if (sql.includes("UPDATE orders")) return Promise.resolve({ rows: [mockUpdatedOrder] });
                    if (sql.includes("FROM order_items")) return Promise.resolve({ rows: mockItems });
                    if (sql.includes("UPDATE products")) return Promise.resolve({ rowCount: 1 });
                    return Promise.resolve({ rows: [] });
                }),
                release: jest.fn()
            };

            db.setPool({
                connect: jest.fn().mockResolvedValue(mockClient),
                on: jest.fn()
            });

            const res = await request(app)
                .post("/api/v1/orders/order-1/cancel")
                .set("Authorization", `Bearer ${tokenA}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.message).toContain("cancelled successfully and inventory restored");
            expect(res.body.order.status).toBe("cancelled");
            expect(mockClient.query).toHaveBeenCalledWith("COMMIT");
        });
    });

    describe("Cross-Customer Isolation", () => {
        test("Customer B cannot view or cancel Customer A's orders", async () => {
            // Customer B queries Customer A's order
            db.setPool({
                query: jest.fn().mockResolvedValue({ rows: [] }), // customer_id = Customer B returns empty
                on: jest.fn()
            });

            const viewRes = await request(app)
                .get("/api/v1/orders/order-of-customer-a")
                .set("Authorization", `Bearer ${tokenB}`);

            expect(viewRes.statusCode).toBe(404);
            expect(viewRes.body.error).toContain("Order not found");

            // Customer B tries to cancel Customer A's order
            const mockClient = {
                query: jest.fn().mockImplementation((sql) => {
                    if (sql === "BEGIN") return Promise.resolve();
                    if (sql === "ROLLBACK") return Promise.resolve();
                    if (sql.includes("FOR UPDATE")) return Promise.resolve({ rows: [] });
                    return Promise.resolve({ rows: [] });
                }),
                release: jest.fn()
            };

            db.setPool({
                connect: jest.fn().mockResolvedValue(mockClient),
                on: jest.fn()
            });

            const cancelRes = await request(app)
                .post("/api/v1/orders/order-of-customer-a/cancel")
                .set("Authorization", `Bearer ${tokenB}`);

            expect(cancelRes.statusCode).toBe(404);
            expect(cancelRes.body.error).toContain("Order not found");
        });
    });
});
