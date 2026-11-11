
const express = require("express");
const router = express.Router();
const config = require("../config");

// GET /version - Returns the version of the current Blue/Green application pod
router.get("/", (req, res) => {
    res.set("Cache-Control", "no-store");

    res.json({
        application: config.appName,
        version: config.appVersion
    });
});

module.exports = router;
