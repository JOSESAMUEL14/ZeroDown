const request = require("supertest");
const app = require("../server");
const db = require("../src/db");
const authService = require("../src/services/authService");

describe("ZeroDown Shopping Cart & Wishlist API Tests", () => {
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
        test("Cart and wishlist endpoints must reject unauthenticated requests with 401", async () => {
            const cartGet = await request(app).get("/api/v1/cart");
            expect(cartGet.statusCode).toBe(401);

            const cartPost = await request(app).post("/api/v1/cart/items").send({ product_id: 1 });
            expect(cartPost.statusCode).toBe(401);

            const wishlistGet = await request(app).get("/api/v1/wishlist");
            expect(wishlistGet.statusCode).toBe(401);

            const wishlistPost = await request(app).post("/api/v1/wishlist/items").send({ product_id: 1 });
            expect(wishlistPost.statusCode).toBe(401);
        });
    });

    describe("Shopping Cart APIs", () => {
        test("GET /api/v1/cart should calculate totals based on database prices, not client prices", async () => {
            const mockCartId = "cart-uuid-1";
            const mockItems = [
                {
                    id: "item-1",
                    cart_id: mockCartId,
                    product_id: 1,
                    quantity: 2,
                    name: "Sonic Pro Headphones",
                    slug: "sonic-pro-headphones",
                    price: "1499.00",
                    old_price: "2499.00",
                    stock_quantity: 10,
                    is_active: true,
                    subtotal: "2998.00"
                },
                {
                    id: "item-2",
                    cart_id: mockCartId,
                    product_id: 2,
                    quantity: 1,
                    name: "Smart Watch Series X",
                    slug: "smart-watch-series-x",
                    price: "2299.00",
                    old_price: null,
                    stock_quantity: 5,
                    is_active: true,
                    subtotal: "2299.00"
                }
            ];

            const mockQuery = jest.fn()
                .mockResolvedValueOnce({ rows: [{ id: mockCartId }] }) // cart lookup
                .mockResolvedValueOnce({ rows: mockItems }); // items query

            db.setPool({ query: mockQuery, on: jest.fn() });

            const res = await request(app)
                .get("/api/v1/cart")
                .set("Authorization", `Bearer ${tokenA}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.cart).toBeDefined();
            expect(res.body.cart.items.length).toBe(2);
            expect(res.body.cart.itemCount).toBe(3);
            expect(res.body.cart.subtotal).toBe(5297);
            expect(res.body.cart.total).toBe(5297);
        });

        test("POST /api/v1/cart/items should reject invalid quantities or missing product", async () => {
            const resNoProduct = await request(app)
                .post("/api/v1/cart/items")
                .set("Authorization", `Bearer ${tokenA}`)
                .send({ quantity: 1 });

            expect(resNoProduct.statusCode).toBe(400);

            const resInvalidQty = await request(app)
                .post("/api/v1/cart/items")
                .set("Authorization", `Bearer ${tokenA}`)
                .send({ product_id: 1, quantity: 0 });

            expect(resInvalidQty.statusCode).toBe(400);
        });

        test("POST /api/v1/cart/items should return 404 if product does not exist or is inactive", async () => {
            db.setPool({
                query: jest.fn().mockResolvedValue({ rows: [] }),
                on: jest.fn()
            });

            const res = await request(app)
                .post("/api/v1/cart/items")
                .set("Authorization", `Bearer ${tokenA}`)
                .send({ product_id: 999, quantity: 1 });

            expect(res.statusCode).toBe(404);
            expect(res.body.error).toContain("Product not found");
        });

        test("POST /api/v1/cart/items should reject when quantity exceeds available stock", async () => {
            const mockProduct = { id: 1, name: "Headphones", price: 1499, stock_quantity: 3, is_active: true };

            const mockQuery = jest.fn()
                .mockResolvedValueOnce({ rows: [mockProduct] }) // product check
                .mockResolvedValueOnce({ rows: [{ id: "cart-1" }] }) // cart check
                .mockResolvedValueOnce({ rows: [] }); // existing item check

            db.setPool({ query: mockQuery, on: jest.fn() });

            const res = await request(app)
                .post("/api/v1/cart/items")
                .set("Authorization", `Bearer ${tokenA}`)
                .send({ product_id: 1, quantity: 5 });

            expect(res.statusCode).toBe(400);
            expect(res.body.error).toContain("Insufficient stock");
        });

        test("POST /api/v1/cart/items should add item successfully within stock limits", async () => {
            const mockProduct = { id: 1, name: "Headphones", price: 1499, stock_quantity: 10, is_active: true };
            const mockInsertedItem = { id: "item-123", cart_id: "cart-1", product_id: 1, quantity: 2 };

            const mockQuery = jest.fn()
                .mockResolvedValueOnce({ rows: [mockProduct] }) // product check
                .mockResolvedValueOnce({ rows: [{ id: "cart-1" }] }) // cart check
                .mockResolvedValueOnce({ rows: [] }) // existing check (not in cart)
                .mockResolvedValueOnce({ rows: [mockInsertedItem] }); // insert

            db.setPool({ query: mockQuery, on: jest.fn() });

            const res = await request(app)
                .post("/api/v1/cart/items")
                .set("Authorization", `Bearer ${tokenA}`)
                .send({ product_id: 1, quantity: 2 });

            expect(res.statusCode).toBe(201);
            expect(res.body.message).toContain("Item added to cart");
            expect(res.body.item.quantity).toBe(2);
        });

        test("PUT /api/v1/cart/items/:id should update quantity with stock check", async () => {
            const mockItemCheck = {
                id: "item-123",
                cart_id: "cart-1",
                product_id: 1,
                stock_quantity: 10,
                is_active: true
            };
            const mockUpdated = { id: "item-123", quantity: 4 };

            const mockQuery = jest.fn()
                .mockResolvedValueOnce({ rows: [mockItemCheck] }) // check ownership and stock
                .mockResolvedValueOnce({ rows: [mockUpdated] }); // update

            db.setPool({ query: mockQuery, on: jest.fn() });

            const res = await request(app)
                .put("/api/v1/cart/items/item-123")
                .set("Authorization", `Bearer ${tokenA}`)
                .send({ quantity: 4 });

            expect(res.statusCode).toBe(200);
            expect(res.body.item.quantity).toBe(4);
        });

        test("DELETE /api/v1/cart/items/:id and DELETE /api/v1/cart should remove items", async () => {
            // Delete specific item
            db.setPool({
                query: jest.fn().mockResolvedValue({ rows: [{ id: "item-123" }] }),
                on: jest.fn()
            });

            const delItem = await request(app)
                .delete("/api/v1/cart/items/item-123")
                .set("Authorization", `Bearer ${tokenA}`);

            expect(delItem.statusCode).toBe(200);
            expect(delItem.body.message).toContain("removed from cart");

            // Clear entire cart
            db.setPool({
                query: jest.fn().mockResolvedValue({ rowCount: 2 }),
                on: jest.fn()
            });

            const clearRes = await request(app)
                .delete("/api/v1/cart")
                .set("Authorization", `Bearer ${tokenA}`);

            expect(clearRes.statusCode).toBe(200);
            expect(clearRes.body.message).toContain("cleared successfully");
        });
    });

    describe("Wishlist APIs", () => {
        test("GET /api/v1/wishlist should return customer wishlist items", async () => {
            const mockWishlist = [
                {
                    id: "wish-1",
                    product_id: 1,
                    name: "Sonic Pro Headphones",
                    price: "1499.00",
                    category_name: "Audio"
                }
            ];

            db.setPool({
                query: jest.fn().mockResolvedValue({ rows: mockWishlist }),
                on: jest.fn()
            });

            const res = await request(app)
                .get("/api/v1/wishlist")
                .set("Authorization", `Bearer ${tokenA}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.wishlist.count).toBe(1);
            expect(res.body.wishlist.items[0].name).toBe("Sonic Pro Headphones");
        });

        test("POST /api/v1/wishlist/items should prevent duplicate wishlist entries with 409", async () => {
            const mockProduct = { id: 1, name: "Sonic Pro Headphones", is_active: true };

            const mockQuery = jest.fn()
                .mockResolvedValueOnce({ rows: [mockProduct] }) // product exists
                .mockResolvedValueOnce({ rows: [{ id: "wish-1" }] }); // already in wishlist

            db.setPool({ query: mockQuery, on: jest.fn() });

            const res = await request(app)
                .post("/api/v1/wishlist/items")
                .set("Authorization", `Bearer ${tokenA}`)
                .send({ product_id: 1 });

            expect(res.statusCode).toBe(409);
            expect(res.body.error).toContain("already in your wishlist");
        });

        test("POST /api/v1/wishlist/items should add product successfully", async () => {
            const mockProduct = { id: 2, name: "Smart Watch", is_active: true };
            const mockInserted = { id: "wish-2", customer_id: customerA, product_id: 2 };

            const mockQuery = jest.fn()
                .mockResolvedValueOnce({ rows: [mockProduct] }) // product exists
                .mockResolvedValueOnce({ rows: [] }) // not duplicate
                .mockResolvedValueOnce({ rows: [mockInserted] }); // insert

            db.setPool({ query: mockQuery, on: jest.fn() });

            const res = await request(app)
                .post("/api/v1/wishlist/items")
                .set("Authorization", `Bearer ${tokenA}`)
                .send({ product_id: 2 });

            expect(res.statusCode).toBe(201);
            expect(res.body.item.product_id).toBe(2);
        });

        test("DELETE /api/v1/wishlist/items/:productId should remove item", async () => {
            db.setPool({
                query: jest.fn().mockResolvedValue({ rows: [{ id: "wish-1" }] }),
                on: jest.fn()
            });

            const res = await request(app)
                .delete("/api/v1/wishlist/items/1")
                .set("Authorization", `Bearer ${tokenA}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.message).toContain("removed from wishlist");
        });
    });

    describe("Cross-Customer Isolation", () => {
        test("Customer B cannot modify or delete Customer A's cart items", async () => {
            // Customer B attempts to update item-123 which belongs to Customer A
            db.setPool({
                query: jest.fn().mockResolvedValue({ rows: [] }), // itemCheck returns empty because c.customer_id != Customer B
                on: jest.fn()
            });

            const updateRes = await request(app)
                .put("/api/v1/cart/items/item-123")
                .set("Authorization", `Bearer ${tokenB}`)
                .send({ quantity: 3 });

            expect(updateRes.statusCode).toBe(404);
            expect(updateRes.body.error).toContain("Cart item not found");

            // Customer B attempts to delete item-123 which belongs to Customer A
            const deleteRes = await request(app)
                .delete("/api/v1/cart/items/item-123")
                .set("Authorization", `Bearer ${tokenB}`);

            expect(deleteRes.statusCode).toBe(404);
            expect(deleteRes.body.error).toContain("Cart item not found");
        });

        test("Customer B cannot delete Customer A's wishlist items", async () => {
            db.setPool({
                query: jest.fn().mockResolvedValue({ rows: [] }),
                on: jest.fn()
            });

            const deleteRes = await request(app)
                .delete("/api/v1/wishlist/items/1")
                .set("Authorization", `Bearer ${tokenB}`);

            expect(deleteRes.statusCode).toBe(404);
            expect(deleteRes.body.error).toContain("Wishlist item not found");
        });
    });
});
