const path = require("path");

const config = {
    appName: "ZeroDown",
    appVersion: process.env.APP_VERSION || "v1",
    port: parseInt(process.env.PORT, 10) || 3000,
    publicDir: path.join(__dirname, "..", "..", "public"),
    database: {
        host: process.env.DB_HOST || "localhost",
        port: parseInt(process.env.DB_PORT, 10) || 5432,
        database: process.env.DB_NAME || "zerodown",
        user: process.env.DB_USER || "postgres",
        password: process.env.DB_PASSWORD,
        ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
        max: parseInt(process.env.DB_POOL_MAX, 10) || 10,
        idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT_MS, 10) || 30000,
        connectionTimeoutMillis: parseInt(process.env.DB_CONN_TIMEOUT_MS, 10) || 2000
    },
    jwt: {
        secret: process.env.JWT_SECRET,
        expiresIn: process.env.JWT_EXPIRES_IN || "24h"
    },
    manager: {
        username: process.env.MANAGER_USERNAME || "",
        password: process.env.MANAGER_PASSWORD || ""
    }
};

module.exports = config;
