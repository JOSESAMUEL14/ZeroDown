const request = require("supertest");
const app = require("../server");

describe("ZeroDown Application Tests", () => {
    test("Homepage should return 200", async () => {
        const response = await request(app).get("/");
        expect(response.statusCode).toBe(200);
    });

    test("Health endpoint should return healthy", async () => {
        const response = await request(app).get("/health");
        expect(response.statusCode).toBe(200);
        expect(response.body.status).toBe("healthy");
    });

    test("Version endpoint should return v1", async () => {
        const response = await request(app).get("/version");
        expect(response.statusCode).toBe(200);
        expect(response.body.version).toBe("v1");
    });
});
