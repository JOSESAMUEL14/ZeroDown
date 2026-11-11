const fs = require("fs");
const path = require("path");
const db = require("./index");

/**
 * Execute schema DDL migrations and optional seeds against PostgreSQL.
 * @param {object} [options]
 * @param {boolean} [options.withSeed=false]
 * @returns {Promise<{ success: boolean, tables: string[], seeded?: boolean }>}
 */
async function runMigrations(options = { withSeed: false }) {
    const schemaPath = path.join(__dirname, "schema.sql");
    const sql = fs.readFileSync(schemaPath, "utf-8");

    const client = await db.getClient();
    try {
        await client.query("BEGIN");
        await client.query(sql);

        let seeded = false;
        if (options.withSeed) {
            const seedPath = path.join(__dirname, "seed.sql");
            if (fs.existsSync(seedPath)) {
                const seedSql = fs.readFileSync(seedPath, "utf-8");
                await client.query(seedSql);
                seeded = true;
            }
        }

        await client.query("COMMIT");

        // Query list of created tables in the public schema
        const result = await client.query(`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
            ORDER BY table_name;
        `);

        return {
            success: true,
            tables: result.rows.map(r => r.table_name),
            seeded
        };
    } catch (error) {
        await client.query("ROLLBACK");
        console.error("Migration failed:", error.message);
        throw error;
    } finally {
        client.release();
    }
}

// Allow direct execution via CLI: node src/db/migrate.js [--seed]
if (require.main === module) {
    const withSeed = process.argv.includes("--seed");
    runMigrations({ withSeed })
        .then((res) => {
            console.log("Database migrations applied successfully. Tables:", res.tables);
            if (res.seeded) {
                console.log("Database seeded with initial catalog data.");
            }
            process.exit(0);
        })
        .catch((err) => {
            console.error("Migration runner exited with error:", err.message);
            process.exit(1);
        });
}

module.exports = {
    runMigrations
};
