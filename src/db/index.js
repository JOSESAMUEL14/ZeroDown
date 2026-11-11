const { Pool } = require("pg");
const config = require("../config");

let pool = new Pool(config.database);

// Handle idle client errors gracefully without crashing the Node.js process
pool.on("error", (err) => {
    console.error("Unexpected error on idle PostgreSQL client:", err.message);
});

/**
 * Execute a parameterized SQL query safely against the connection pool.
 * @param {string} text - The parameterized SQL query string
 * @param {Array} [params] - Query parameters
 * @returns {Promise<import('pg').QueryResult>}
 */
async function query(text, params = []) {
    const start = Date.now();
    try {
        const result = await pool.query(text, params);
        return result;
    } catch (error) {
        console.error("Database query execution error:", {
            query: text,
            message: error.message,
            duration: Date.now() - start
        });
        throw error;
    }
}

/**
 * Acquire a dedicated client from the pool (e.g. for multi-step transactions).
 * @returns {Promise<import('pg').PoolClient>}
 */
async function getClient() {
    return pool.connect();
}

/**
 * Check connectivity and responsiveness of the PostgreSQL database.
 * @returns {Promise<{ healthy: boolean, latencyMs: number, error?: string }>}
 */
async function checkHealth() {
    const start = Date.now();
    try {
        await pool.query("SELECT 1 AS health_check");
        return {
            healthy: true,
            latencyMs: Date.now() - start
        };
    } catch (error) {
        return {
            healthy: false,
            latencyMs: Date.now() - start,
            error: error.message
        };
    }
}

/**
 * Close all active pool connections (used for graceful shutdown and tests).
 */
async function close() {
    if (pool) {
        await pool.end();
    }
}

/**
 * Swap or inject the connection pool (primarily for automated unit/integration testing).
 * @param {Pool} newPool
 */
function setPool(newPool) {
    pool = newPool;
}

/**
 * Retrieve the active pool instance.
 */
function getPool() {
    return pool;
}

module.exports = {
    query,
    getClient,
    checkHealth,
    close,
    setPool,
    getPool
};
