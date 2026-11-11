const request = require("supertest");
const app = require("../server");
const db = require("../src/db");
const authService = require("../src/services/authService");

describe("ZeroDown Customer Authentication & Profile API Tests", () => {
    let originalPool;
    const testCustomerId = "123e4567-e89b-12d3-a456-426614174000";
    let validToken;

    beforeAll(() => {
        originalPool = db.getPool();
        validToken = authService.generateToken({
            id: testCustomerId,
            email: "swetha@example.com",
            role: "customer"
        });
    });

    afterAll(() => {
        db.setPool(originalPool);
    });

    describe("Password & JWT Services", () => {
        test("hashPassword should produce valid bcrypt hash and comparePassword should verify it", async () => {
            const password = "SuperSecret123!";
            const hash = await authService.hashPassword(password);

            expect(hash).toBeDefined();
            expect(hash).not.toBe(password);

            const isMatch = await authService.comparePassword(password, hash);
            expect(isMatch).toBe(true);

            const isMismatch = await authService.comparePassword("WrongPassword", hash);
            expect(isMismatch).toBe(false);
        });

        test("generateToken should create valid JWT and verifyToken should decode it", () => {
            const payload = { id: testCustomerId, email: "test@example.com", role: "customer" };
            const token = authService.generateToken(payload);

            expect(typeof token).toBe("string");
            const decoded = authService.verifyToken(token);
            expect(decoded.id).toBe(testCustomerId);
            expect(decoded.email).toBe("test@example.com");
        });
    });

    describe("POST /api/v1/auth/register", () => {
        test("should reject missing or invalid email", async () => {
            const res = await request(app)
                .post("/api/v1/auth/register")
                .send({ email: "invalid-email", password: "password123", full_name: "Test User" });

            expect(res.statusCode).toBe(400);
            expect(res.body.error).toContain("Valid email address is required");
        });

        test("should reject short password (< 6 chars)", async () => {
            const res = await request(app)
                .post("/api/v1/auth/register")
                .send({ email: "valid@example.com", password: "123", full_name: "Test User" });

            expect(res.statusCode).toBe(400);
            expect(res.body.error).toContain("at least 6 characters");
        });

        test("should reject duplicate email with 409", async () => {
            db.setPool({
                query: jest.fn().mockResolvedValue({ rows: [{ id: testCustomerId }] }),
                on: jest.fn()
            });

            const res = await request(app)
                .post("/api/v1/auth/register")
                .send({ email: "existing@example.com", password: "password123", full_name: "Existing User" });

            expect(res.statusCode).toBe(409);
            expect(res.body.error).toContain("already exists");
        });

        test("should register new customer and return token without password hash", async () => {
            const mockCustomer = {
                id: testCustomerId,
                email: "newuser@example.com",
                full_name: "New User",
                phone: "9876543210",
                role: "customer",
                created_at: new Date().toISOString()
            };

            const mockQuery = jest.fn()
                .mockResolvedValueOnce({ rows: [] }) // existing check
                .mockResolvedValueOnce({ rows: [mockCustomer] }); // insert

            db.setPool({ query: mockQuery, on: jest.fn() });

            const res = await request(app)
                .post("/api/v1/auth/register")
                .send({
                    email: "newuser@example.com",
                    password: "password123",
                    full_name: "New User",
                    phone: "9876543210"
                });

            expect(res.statusCode).toBe(201);
            expect(res.body.token).toBeDefined();
            expect(res.body.customer.email).toBe("newuser@example.com");
            expect(res.body.customer.password_hash).toBeUndefined();
        });
    });

    describe("POST /api/v1/auth/login", () => {
        test("should reject missing credentials with 400", async () => {
            const res = await request(app)
                .post("/api/v1/auth/login")
                .send({ email: "" });

            expect(res.statusCode).toBe(400);
        });

        test("should reject unregistered email with 401", async () => {
            db.setPool({
                query: jest.fn().mockResolvedValue({ rows: [] }),
                on: jest.fn()
            });

            const res = await request(app)
                .post("/api/v1/auth/login")
                .send({ email: "notfound@example.com", password: "password123" });

            expect(res.statusCode).toBe(401);
            expect(res.body.error).toContain("Invalid email or password");
        });

        test("should login successfully with correct password and return token", async () => {
            const plainPassword = "correctPassword123";
            const passwordHash = await authService.hashPassword(plainPassword);

            const mockCustomer = {
                id: testCustomerId,
                email: "user@example.com",
                password_hash: passwordHash,
                full_name: "User Name",
                phone: "1234567890",
                role: "customer"
            };

            db.setPool({
                query: jest.fn().mockResolvedValue({ rows: [mockCustomer] }),
                on: jest.fn()
            });

            const res = await request(app)
                .post("/api/v1/auth/login")
                .send({ email: "user@example.com", password: plainPassword });

            expect(res.statusCode).toBe(200);
            expect(res.body.token).toBeDefined();
            expect(res.body.customer.password_hash).toBeUndefined();
            expect(res.body.customer.email).toBe("user@example.com");
        });
    });

    describe("Protected Routes & Addresses API", () => {
        test("GET /api/v1/auth/me should reject requests without token", async () => {
            const res = await request(app).get("/api/v1/auth/me");
            expect(res.statusCode).toBe(401);
            expect(res.body.error).toContain("token is required");
        });

        test("GET /api/v1/auth/me should return profile with valid Bearer token", async () => {
            const profile = {
                id: testCustomerId,
                email: "swetha@example.com",
                full_name: "Swetha",
                role: "customer"
            };

            db.setPool({
                query: jest.fn().mockResolvedValue({ rows: [profile] }),
                on: jest.fn()
            });

            const res = await request(app)
                .get("/api/v1/auth/me")
                .set("Authorization", `Bearer ${validToken}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.customer.full_name).toBe("Swetha");
        });

        test("PUT /api/v1/customers/profile should update profile details", async () => {
            const updated = {
                id: testCustomerId,
                email: "swetha@example.com",
                full_name: "Swetha D",
                phone: "9999999999",
                role: "customer"
            };

            db.setPool({
                query: jest.fn().mockResolvedValue({ rows: [updated] }),
                on: jest.fn()
            });

            const res = await request(app)
                .put("/api/v1/customers/profile")
                .set("Authorization", `Bearer ${validToken}`)
                .send({ full_name: "Swetha D", phone: "9999999999" });

            expect(res.statusCode).toBe(200);
            expect(res.body.customer.full_name).toBe("Swetha D");
        });

        test("Customer Address CRUD operations", async () => {
            const mockAddress = {
                id: "addr-123",
                customer_id: testCustomerId,
                address_line1: "123 Tech Street",
                city: "Bengaluru",
                state: "Karnataka",
                postal_code: "560001",
                country: "India",
                is_default: true
            };

            // 1. GET addresses
            db.setPool({
                query: jest.fn().mockResolvedValue({ rows: [mockAddress] }),
                on: jest.fn()
            });

            const listRes = await request(app)
                .get("/api/v1/customers/addresses")
                .set("Authorization", `Bearer ${validToken}`);

            expect(listRes.statusCode).toBe(200);
            expect(listRes.body.addresses.length).toBe(1);

            // 2. POST address
            const postQuery = jest.fn()
                .mockResolvedValueOnce({ rows: [] }) // default clear
                .mockResolvedValueOnce({ rows: [mockAddress] }); // insert

            db.setPool({ query: postQuery, on: jest.fn() });

            const createRes = await request(app)
                .post("/api/v1/customers/addresses")
                .set("Authorization", `Bearer ${validToken}`)
                .send({
                    address_line1: "123 Tech Street",
                    city: "Bengaluru",
                    state: "Karnataka",
                    postal_code: "560001",
                    is_default: true
                });

            expect(createRes.statusCode).toBe(201);
            expect(createRes.body.address.city).toBe("Bengaluru");

            // 3. DELETE address
            db.setPool({
                query: jest.fn().mockResolvedValue({ rows: [{ id: "addr-123" }] }),
                on: jest.fn()
            });

            const delRes = await request(app)
                .delete("/api/v1/customers/addresses/addr-123")
                .set("Authorization", `Bearer ${validToken}`);

            expect(delRes.statusCode).toBe(200);
            expect(delRes.body.message).toContain("deleted successfully");
        });
    });
});
