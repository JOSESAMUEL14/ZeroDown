const db = require("../db");

/**
 * List all available product categories.
 */
async function getCategories(req, res) {
    try {
        const result = await db.query(
            "SELECT id, name, slug, description FROM categories ORDER BY name ASC"
        );

        res.status(200).json({
            categories: result.rows
        });
    } catch (error) {
        console.error("Get categories error:", error.message);
        res.status(500).json({
            error: "An error occurred while retrieving categories"
        });
    }
}

/**
 * List products with filtering, search, sorting, and pagination.
 */
async function getProducts(req, res) {
    try {
        const {
            category,
            search,
            minPrice,
            maxPrice,
            sort,
            page = 1,
            limit = 20
        } = req.query;

        const conditions = ["p.is_active = TRUE"];
        const params = [];

        // Category filter (supports either slug or category ID)
        if (category) {
            params.push(category);
            conditions.push(`(c.slug = $${params.length} OR p.category_id::text = $${params.length})`);
        }

        // Search filter (name and description)
        if (search && search.trim()) {
            params.push(`%${search.trim()}%`);
            conditions.push(`(p.name ILIKE $${params.length} OR p.description ILIKE $${params.length})`);
        }

        // Price range filters
        if (minPrice && !isNaN(Number(minPrice))) {
            params.push(Number(minPrice));
            conditions.push(`p.price >= $${params.length}`);
        }

        if (maxPrice && !isNaN(Number(maxPrice))) {
            params.push(Number(maxPrice));
            conditions.push(`p.price <= $${params.length}`);
        }

        const whereSql = conditions.join(" AND ");

        // Sorting options
        let orderBy = "p.id ASC";
        if (sort === "price_asc") {
            orderBy = "p.price ASC";
        } else if (sort === "price_desc") {
            orderBy = "p.price DESC";
        } else if (sort === "rating_desc") {
            orderBy = "p.rating DESC";
        } else if (sort === "newest") {
            orderBy = "p.created_at DESC";
        }

        // Pagination
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
        const offset = (pageNum - 1) * limitNum;

        // Count total matching items
        const countResult = await db.query(
            `SELECT COUNT(*)::int AS total
             FROM products p
             LEFT JOIN categories c ON p.category_id = c.id
             WHERE ${whereSql}`,
            params
        );

        const total = countResult.rows[0]?.total || 0;

        // Fetch paginated results
        const queryParams = [...params, limitNum, offset];
        const dataResult = await db.query(
            `SELECT p.id, p.category_id, c.name AS category_name, c.slug AS category_slug,
                    p.name, p.slug, p.description, p.price, p.old_price,
                    p.stock_quantity, p.image_url, p.rating, p.review_count, p.created_at
             FROM products p
             LEFT JOIN categories c ON p.category_id = c.id
             WHERE ${whereSql}
             ORDER BY ${orderBy}
             LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length}`,
            queryParams
        );

        res.status(200).json({
            products: dataResult.rows,
            pagination: {
                total,
                page: pageNum,
                limit: limitNum,
                totalPages: Math.ceil(total / limitNum) || 1
            }
        });
    } catch (error) {
        console.error("Get products error:", error.message);
        res.status(500).json({
            error: "An error occurred while retrieving products"
        });
    }
}

/**
 * Retrieve details for a single product by ID or slug.
 */
async function getProductById(req, res) {
    try {
        const { id } = req.params;

        // Check if param is numeric ID or string slug
        const isNumeric = /^\d+$/.test(id);
        const querySql = isNumeric
            ? `SELECT p.*, c.name AS category_name, c.slug AS category_slug
               FROM products p
               LEFT JOIN categories c ON p.category_id = c.id
               WHERE p.id = $1 AND p.is_active = TRUE`
            : `SELECT p.*, c.name AS category_name, c.slug AS category_slug
               FROM products p
               LEFT JOIN categories c ON p.category_id = c.id
               WHERE p.slug = $1 AND p.is_active = TRUE`;

        const result = await db.query(querySql, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: "Product not found"
            });
        }

        res.status(200).json({
            product: result.rows[0]
        });
    } catch (error) {
        console.error("Get product detail error:", error.message);
        res.status(500).json({
            error: "An error occurred while retrieving the product"
        });
    }
}

module.exports = {
    getCategories,
    getProducts,
    getProductById
};
