const request = require("supertest");
const app = require("../server");
const db = require("../src/db");
const authService = require("../src/services/authService");
const k8sService = require("../src/services/k8sService");

describe("ZeroDown Manager API Tests", () => {
    let originalPool;
    let managerToken;
    let customerToken;

    beforeAll(() => {
        originalPool = db.getPool();

        managerToken = authService.generateToken({
            id: "manager-test-123",
            username: "manager-test@example.com",
            role: "manager"
        });

        customerToken = authService.generateToken({
            id: "customer-test-123",
            username: "customer-test@example.com",
            role: "customer"
        });
    });

    beforeEach(() => {
        db.setPool({
            query: jest.fn().mockResolvedValue({ rows: [] }),
            on: jest.fn()
        });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    afterAll(() => {
        db.setPool(originalPool);
    });

    describe("POST /api/v1/manager/login", () => {
        test("should reject missing credentials", async () => {
            const res = await request(app)
                .post("/api/v1/manager/login")
                .send({});

            expect(res.statusCode).toBe(400);
        });

        test("should reject invalid manager credentials", async () => {
            const res = await request(app)
                .post("/api/v1/manager/login")
                .send({
                    username: "unknown-manager@example.com",
                    password: "wrong-password"
                });

            expect(res.statusCode).toBe(401);
        });

        test("should authenticate a database manager and return a manager token", async () => {
            const password = "TestManagerPassword123!";
            const passwordHash = await authService.hashPassword(password);

            db.setPool({
                query: jest.fn().mockResolvedValue({
                    rows: [{
                        id: "manager-123",
                        email: "manager-test@example.com",
                        password_hash: passwordHash,
                        full_name: "Test Manager",
                        role: "manager"
                    }]
                }),
                on: jest.fn()
            });

            const res = await request(app)
                .post("/api/v1/manager/login")
                .send({
                    username: "manager-test@example.com",
                    password
                });

            expect(res.statusCode).toBe(200);
            expect(res.body.token).toBeDefined();

            const decoded = authService.verifyToken(res.body.token);
            expect(decoded.role).toBe("manager");
            expect(res.body.user.role).toBe("manager");
        });
    });

    describe("Manager authorization", () => {
        test("should reject requests without a token", async () => {
            const res = await request(app)
                .get("/api/v1/manager/status");

            expect(res.statusCode).toBe(401);
        });

        test("should reject customer tokens with 403", async () => {
            const res = await request(app)
                .get("/api/v1/manager/status")
                .set("Authorization", `Bearer ${customerToken}`);

            expect(res.statusCode).toBe(403);
        });

        test("should reject invalid tokens", async () => {
            const res = await request(app)
                .get("/api/v1/manager/status")
                .set("Authorization", "Bearer invalid-token");

            expect(res.statusCode).toBe(401);
        });
    });

    describe("GET /api/v1/manager/status", () => {
        test("should return Kubernetes status for an authorized manager", async () => {
            jest.spyOn(k8sService, "getClusterStatus")
                .mockResolvedValue({
                    activeVersion: "blue",
                    blue: { ready: 2 },
                    green: { ready: 2 }
                });

            const res = await request(app)
                .get("/api/v1/manager/status")
                .set("Authorization", `Bearer ${managerToken}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.status.activeVersion).toBe("blue");
        });
    });

    describe("POST /api/v1/manager/switch", () => {
        test("should reject an invalid deployment target", async () => {
            const res = await request(app)
                .post("/api/v1/manager/switch")
                .set("Authorization", `Bearer ${managerToken}`)
                .send({ target: "red" });

            expect(res.statusCode).toBe(400);
        });

        test("should switch traffic to Green", async () => {
            jest.spyOn(k8sService, "switchDeployment")
                .mockResolvedValue({
                    from: "blue",
                    to: "green"
                });

            const res = await request(app)
                .post("/api/v1/manager/switch")
                .set("Authorization", `Bearer ${managerToken}`)
                .send({ target: "green" });

            expect(res.statusCode).toBe(200);
            expect(res.body.to).toBe("green");
        });
    });

    describe("POST /api/v1/manager/rollback", () => {
        test("should rollback deployment for an authorized manager", async () => {
            jest.spyOn(k8sService, "rollbackDeployment")
                .mockResolvedValue({
                    from: "green",
                    to: "blue"
                });

            const res = await request(app)
                .post("/api/v1/manager/rollback")
                .set("Authorization", `Bearer ${managerToken}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.to).toBe("blue");
        });
    });

    describe("GET /api/v1/manager/history", () => {
        test("should return deployment history", async () => {
            const history = [{
                id: 1,
                action: "switch",
                from_version: "blue",
                to_version: "green",
                status: "success"
            }];

            db.setPool({
                query: jest.fn().mockResolvedValue({ rows: history }),
                on: jest.fn()
            });

            const res = await request(app)
                .get("/api/v1/manager/history")
                .set("Authorization", `Bearer ${managerToken}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.history).toHaveLength(1);
            expect(res.body.history[0].to_version).toBe("green");
        });
    });
});
