const config = require("../config");
const db = require("../db");
const authService = require("../services/authService");
const k8sService = require("../services/k8sService");

/**
 * Authenticate manager / DevOps operator.
 */
async function login(req, res) {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                error: "Username and password are required"
            });
        }

        let isManagerAuthenticated = false;
        let managerUser = null;

        // 1. Direct environment-configured manager credential check
        if (username === config.manager.username && password === config.manager.password) {
            isManagerAuthenticated = true;
            managerUser = {
                id: "devops-admin-root",
                username: config.manager.username,
                role: "manager"
            };
        } else {
            // 2. Database customer table check for manager/admin role
            try {
                const result = await db.query(
                    `SELECT id, email, password_hash, full_name, role
                     FROM customers
                     WHERE email = $1 AND role IN ('manager', 'admin')`,
                    [username.toLowerCase().trim()]
                );

                if (result.rows.length > 0) {
                    const match = await authService.comparePassword(password, result.rows[0].password_hash);
                    if (match) {
                        isManagerAuthenticated = true;
                        managerUser = {
                            id: result.rows[0].id,
                            username: result.rows[0].email,
                            role: result.rows[0].role
                        };
                    }
                }
            } catch (dbErr) {
                // Ignore DB error and rely on env credentials
            }
        }

        if (!isManagerAuthenticated) {
            return res.status(401).json({
                error: "Invalid manager credentials"
            });
        }

        const token = authService.generateToken(managerUser);

        res.status(200).json({
            message: "Manager authenticated successfully",
            token,
            user: {
                username: managerUser.username,
                role: managerUser.role
            }
        });
    } catch (error) {
        console.error("Manager login error:", error.message);
        res.status(500).json({
            error: "An error occurred during manager authentication"
        });
    }
}

/**
 * Retrieve live Kubernetes cluster and Blue-Green status.
 */
async function getStatus(req, res) {
    try {
        const status = await k8sService.getClusterStatus();
        res.status(200).json({
            status
        });
    } catch (error) {
        console.error("Fetch manager status error:", error.message);
        res.status(500).json({
            error: "Failed to retrieve cluster status: " + error.message
        });
    }
}

/**
 * Trigger an atomic traffic cutover to Blue or Green.
 */
async function switchTraffic(req, res) {
    try {
        const { target } = req.body;

        if (!target || (target !== "blue" && target !== "green")) {
            return res.status(400).json({
                error: "Target deployment must be 'blue' or 'green'"
            });
        }

        const result = await k8sService.switchDeployment(
            target,
            req.user.username || "devops-manager"
        );

        res.status(200).json({
            message: `Traffic switch to ${target} completed successfully`,
            ...result
        });
    } catch (error) {
        console.error("Switch traffic error:", error.message);
        res.status(500).json({
            error: "Traffic switch failed: " + error.message
        });
    }
}

/**
 * Immediately rollback to the previous deployment.
 */
async function rollbackTraffic(req, res) {
    try {
        const result = await k8sService.rollbackDeployment(
            req.user.username || "devops-manager"
        );

        res.status(200).json({
            message: "Rollback completed successfully",
            ...result
        });
    } catch (error) {
        console.error("Rollback error:", error.message);
        res.status(500).json({
            error: "Rollback failed: " + error.message
        });
    }
}

/**
 * Retrieve deployment history and audit logs.
 */
async function getHistory(req, res) {
    try {
        const result = await db.query(
            `SELECT id, action, from_version, to_version, status, initiated_by, details, duration_ms, created_at
             FROM deployment_logs
             ORDER BY created_at DESC
             LIMIT 50`
        );

        res.status(200).json({
            history: result.rows
        });
    } catch (error) {
        console.error("Get deployment history error:", error.message);
        res.status(500).json({
            error: "Failed to retrieve deployment history"
        });
    }
}


module.exports = {
    login,
    getStatus,
    switchTraffic,
    rollbackTraffic,
    getHistory
};
