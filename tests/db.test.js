const request = require("supertest");
const app = require("../server");
const db = require("../src/db");
const config = require("../src/config");
const fs = require("fs");
const path = require("path");

describe("ZeroDown Database Service & Configuration Tests", () => {
    let originalPool;

    beforeAll(() => {
        originalPool = db.getPool();
    });

    afterAll(async () => {
        db.setPool(originalPool);
    });

    test("Database configuration should have sensible defaults", () => {
        expect(config.database).toBeDefined();
        expect(config.database.host).toBeDefined();
        expect(config.database.port).toBe(5432);
        expect(config.database.database).toBe("zerodown");
        expect(config.database.max).toBeGreaterThan(0);
    });

    test("db.query should execute parameterized queries via pool", async () => {
        const mockResult = { rows: [{ id: 1, name: "Audio" }], rowCount: 1 };
        const mockQuery = jest.fn().mockResolvedValue(mockResult);

        db.setPool({
            query: mockQuery,
            on: jest.fn()
        });

        const sql = "SELECT * FROM categories WHERE id = $1";
        const params = [1];
        const result = await db.query(sql, params);

        expect(mockQuery).toHaveBeenCalledWith(sql, params);
        expect(result.rows[0].name).toBe("Audio");
    });

    test("db.query should throw and log on execution failure", async () => {
        const mockQuery = jest.fn().mockRejectedValue(new Error("Connection terminated"));

        db.setPool({
            query: mockQuery,
            on: jest.fn()
        });

        await expect(db.query("SELECT 1", [])).rejects.toThrow("Connection terminated");
    });

    test("db.checkHealth should report healthy when probe query succeeds", async () => {
        db.setPool({
            query: jest.fn().mockResolvedValue({ rows: [{ health_check: 1 }] }),
            on: jest.fn()
        });

        const health = await db.checkHealth();
        expect(health.healthy).toBe(true);
        expect(typeof health.latencyMs).toBe("number");
        expect(health.error).toBeUndefined();
    });

    test("db.checkHealth should report unhealthy without crashing when database is unreachable", async () => {
        db.setPool({
            query: jest.fn().mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:5432")),
            on: jest.fn()
        });

        const health = await db.checkHealth();
        expect(health.healthy).toBe(false);
        expect(health.error).toContain("ECONNREFUSED");
        expect(typeof health.latencyMs).toBe("number");
    });

    test("GET /health/db should return 200 when database is healthy", async () => {
        db.setPool({
            query: jest.fn().mockResolvedValue({ rows: [{ health_check: 1 }] }),
            on: jest.fn()
        });

        const res = await request(app).get("/health/db");
        expect(res.statusCode).toBe(200);
        expect(res.body.service).toBe("database");
        expect(res.body.healthy).toBe(true);
    });

    test("GET /health/db should return 503 when database is unreachable", async () => {
        db.setPool({
            query: jest.fn().mockRejectedValue(new Error("Database offline")),
            on: jest.fn()
        });

        const res = await request(app).get("/health/db");
        expect(res.statusCode).toBe(503);
        expect(res.body.healthy).toBe(false);
        expect(res.body.error).toBe("Database offline");
    });

    test("GET /health should continue to return healthy 200 regardless of database status", async () => {
        // Even if DB is offline, the primary /health probe remains 200 for K8s pod stability
        db.setPool({
            query: jest.fn().mockRejectedValue(new Error("DB unreachable")),
            on: jest.fn()
        });

        const res = await request(app).get("/health");
        expect(res.statusCode).toBe(200);
        expect(res.body.status).toBe("healthy");
    });

    test("Schema SQL file should define all required tables and relationships", () => {
        const schemaPath = path.join(__dirname, "../src/db/schema.sql");
        expect(fs.existsSync(schemaPath)).toBe(true);

        const schemaSql = fs.readFileSync(schemaPath, "utf-8");

        // Verify required tables are defined
        expect(schemaSql).toContain("CREATE TABLE IF NOT EXISTS categories");
        expect(schemaSql).toContain("CREATE TABLE IF NOT EXISTS customers");
        expect(schemaSql).toContain("CREATE TABLE IF NOT EXISTS customer_addresses");
        expect(schemaSql).toContain("CREATE TABLE IF NOT EXISTS products");
        expect(schemaSql).toContain("CREATE TABLE IF NOT EXISTS carts");
        expect(schemaSql).toContain("CREATE TABLE IF NOT EXISTS cart_items");
        expect(schemaSql).toContain("CREATE TABLE IF NOT EXISTS orders");
        expect(schemaSql).toContain("CREATE TABLE IF NOT EXISTS order_items");
        expect(schemaSql).toContain("CREATE TABLE IF NOT EXISTS wishlist_items");
        expect(schemaSql).toContain("CREATE TABLE IF NOT EXISTS deployment_logs");

        // Verify foreign key integrity & performance indexes
        expect(schemaSql).toContain("REFERENCES categories(id)");
        expect(schemaSql).toContain("REFERENCES customers(id)");
        expect(schemaSql).toContain("REFERENCES products(id)");
        expect(schemaSql).toContain("idx_products_category");
        expect(schemaSql).toContain("idx_cart_items_cart");
        expect(schemaSql).toContain("idx_orders_customer");
        expect(schemaSql).toContain("idx_wishlist_items_customer");
        expect(schemaSql).toContain("idx_deployment_logs_created");
    });
});
