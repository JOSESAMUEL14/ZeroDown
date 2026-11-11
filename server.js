const app = require("./src/app");
const config = require("./src/config");

// Start server when run directly (e.g. node server.js)
if (require.main === module) {
    app.listen(config.port, "0.0.0.0", () => {
        console.log(`ZeroDown ${config.appVersion} running on port ${config.port}`);
    });
}

// Export app for automated testing (Jest / Supertest)
module.exports = app;
