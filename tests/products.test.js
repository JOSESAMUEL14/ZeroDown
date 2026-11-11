const request = require("supertest");
const app = require("../server");
const db = require("../src/db");

describe("ZeroDown Product & Category API Tests", () => {
    let originalPool;

    beforeAll(() => {
        originalPool = db.getPool();
    });

    afterAll(() => {
        db.setPool(originalPool);
    });

    describe("GET /api/v1/categories", () => {
        test("should return list of product categories", async () => {
            const mockCategories = [
                { id: 1, name: "Audio", slug: "audio", description: "Audio gear" },
                { id: 2, name: "Wearables", slug: "wearables", description: "Smart wearables" }
            ];

            db.setPool({
                query: jest.fn().mockResolvedValue({ rows: mockCategories }),
                on: jest.fn()
            });

            const res = await request(app).get("/api/v1/categories");
            expect(res.statusCode).toBe(200);
            expect(res.body.categories).toBeDefined();
            expect(res.body.categories.length).toBe(2);
            expect(res.body.categories[0].name).toBe("Audio");
        });
    });

    describe("GET /api/v1/products", () => {
        test("should return paginated product list with default pagination", async () => {
            const mockProducts = [
                {
                    id: 1,
                    name: "Sonic Pro Headphones",
                    slug: "sonic-pro-headphones",
                    price: 1499,
                    category_slug: "audio"
                },
                {
                    id: 2,
                    name: "Smart Watch Series X",
                    slug: "smart-watch-series-x",
                    price: 2299,
                    category_slug: "wearables"
                }
            ];

            const mockQuery = jest.fn()
                .mockResolvedValueOnce({ rows: [{ total: 2 }] }) // count query
                .mockResolvedValueOnce({ rows: mockProducts }); // select query

            db.setPool({ query: mockQuery, on: jest.fn() });

            const res = await request(app).get("/api/v1/products");

            expect(res.statusCode).toBe(200);
            expect(res.body.products).toBeDefined();
            expect(res.body.products.length).toBe(2);
            expect(res.body.pagination.total).toBe(2);
            expect(res.body.pagination.page).toBe(1);
            expect(res.body.pagination.totalPages).toBe(1);
        });

        test("should pass filter query parameters safely to SQL query", async () => {
            const mockQuery = jest.fn()
                .mockResolvedValueOnce({ rows: [{ total: 1 }] })
                .mockResolvedValueOnce({ rows: [{ id: 1, name: "Sonic Pro Headphones", price: 1499 }] });

            db.setPool({ query: mockQuery, on: jest.fn() });

            const res = await request(app)
                .get("/api/v1/products?category=audio&search=sonic&minPrice=1000&maxPrice=2000&sort=price_asc");

            expect(res.statusCode).toBe(200);
            expect(mockQuery).toHaveBeenCalled();
            // Verify count query used category and search
            const countCallArgs = mockQuery.mock.calls[0];
            expect(countCallArgs[0]).toContain("ILIKE");
            expect(countCallArgs[1]).toContain("audio");
        });
    });

    describe("GET /api/v1/products/:id", () => {
        test("should return 404 if product does not exist", async () => {
            db.setPool({
                query: jest.fn().mockResolvedValue({ rows: [] }),
                on: jest.fn()
            });

            const res = await request(app).get("/api/v1/products/999");
            expect(res.statusCode).toBe(404);
            expect(res.body.error).toContain("Product not found");
        });

        test("should return product details for valid numeric ID", async () => {
            const mockProduct = {
                id: 1,
                name: "Sonic Pro Headphones",
                slug: "sonic-pro-headphones",
                price: 1499,
                old_price: 2499,
                category_name: "Audio",
                category_slug: "audio",
                rating: 4.8
            };

            db.setPool({
                query: jest.fn().mockResolvedValue({ rows: [mockProduct] }),
                on: jest.fn()
            });

            const res = await request(app).get("/api/v1/products/1");
            expect(res.statusCode).toBe(200);
            expect(res.body.product.name).toBe("Sonic Pro Headphones");
            expect(res.body.product.price).toBe(1499);
        });

        test("should return product details for valid string slug", async () => {
            const mockProduct = {
                id: 2,
                name: "Smart Watch Series X",
                slug: "smart-watch-series-x",
                price: 2299
            };

            db.setPool({
                query: jest.fn().mockResolvedValue({ rows: [mockProduct] }),
                on: jest.fn()
            });

            const res = await request(app).get("/api/v1/products/smart-watch-series-x");
            expect(res.statusCode).toBe(200);
            expect(res.body.product.id).toBe(2);
        });
    });
});
