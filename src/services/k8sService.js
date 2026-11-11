
const { execFile } = require("child_process");
const path = require("path");
const db = require("../db");
const sseService = require("./sseService");

// Default executor runs minikube kubectl or kubectl.
let commandExecutor = runKubectlCommand;

/**
 * Execute kubectl commands safely via child_process.execFile.
 * @param {string[]} args
 * @returns {Promise<string>}
 */
function runKubectlCommand(args) {
    return new Promise((resolve, reject) => {
        execFile(
            "minikube",
            ["kubectl", "--", ...args],
            { timeout: 15000 },
            (err, stdout, stderr) => {
                if (!err) {
                    return resolve(stdout);
                }

                // Fallback to direct kubectl binary.
                execFile(
                    "kubectl",
                    args,
                    { timeout: 15000 },
                    (k8sErr, k8sStdout) => {
                        if (!k8sErr) {
                            return resolve(k8sStdout);
                        }

                        reject(new Error(stderr || k8sErr.message || err.message));
                    }
                );
            }
        );
    });
}

/**
 * Query current Blue-Green deployment and cluster status.
 * @returns {Promise<object>}
 */
async function getClusterStatus() {
    try {
        const [svcRaw, blueRaw, greenRaw, podsRaw] = await Promise.all([
            commandExecutor(["get", "service", "zerodown-service", "-o", "json"]),
            commandExecutor(["get", "deployment", "zerodown-blue", "-o", "json"]),
            commandExecutor(["get", "deployment", "zerodown-green", "-o", "json"]),
            commandExecutor(["get", "pods", "-l", "app=zerodown", "-o", "json"])
        ]);

        const svc = JSON.parse(svcRaw);
        const blue = JSON.parse(blueRaw);
        const green = JSON.parse(greenRaw);
        const pods = JSON.parse(podsRaw);

        const activeVersion = svc.spec?.selector?.version || "blue";

        const parsePods = (versionLabel) => {
            return (pods.items || [])
                .filter(p => p.metadata?.labels?.version === versionLabel)
                .map(p => ({
                    name: p.metadata?.name,
                    phase: p.status?.phase,
                    ready: p.status?.containerStatuses?.[0]?.ready || false,
                    restarts: p.status?.containerStatuses?.[0]?.restartCount || 0,
                    podIP: p.status?.podIP,
                    nodeName: p.spec?.nodeName,
                    startTime: p.status?.startTime
                }));
        };

        return {
            activeDeployment: activeVersion,
            activeVersion: activeVersion === "green" ? "v2" : "v1",

            service: {
                name: svc.metadata?.name,
                type: svc.spec?.type,
                clusterIP: svc.spec?.clusterIP,
                port: svc.spec?.ports?.[0]?.port,
                nodePort: svc.spec?.ports?.[0]?.nodePort,
                selector: svc.spec?.selector
            },

            blue: {
                name: "zerodown-blue",
                version: "v1",
                desiredReplicas: blue.spec?.replicas || 2,
                readyReplicas: blue.status?.readyReplicas || 0,
                availableReplicas: blue.status?.availableReplicas || 0,
                image: blue.spec?.template?.spec?.containers?.[0]?.image || "zerodown:v1",
                isActive: activeVersion === "blue",
                pods: parsePods("blue")
            },

            green: {
                name: "zerodown-green",
                version: "v2",
                desiredReplicas: green.spec?.replicas || 2,
                readyReplicas: green.status?.readyReplicas || 0,
                availableReplicas: green.status?.availableReplicas || 0,
                image: green.spec?.template?.spec?.containers?.[0]?.image || "zerodown:v2",
                isActive: activeVersion === "green",
                pods: parsePods("green")
            },

            lastUpdated: new Date().toISOString()
        };

    } catch (err) {
        return getFallbackClusterStatus(err.message);
    }
}

/**
 * Fallback cluster status when Kubernetes API is unavailable.
 */
function getFallbackClusterStatus(errorMessage) {
    const defaultActive = process.env.APP_VERSION === "v2" ? "green" : "blue";

    return {
        activeDeployment: defaultActive,
        activeVersion: defaultActive === "green" ? "v2" : "v1",
        isSimulated: true,
        clusterWarning: errorMessage,

        service: {
            name: "zerodown-service",
            type: "NodePort",
            port: 80,
            nodePort: 30080,
            selector: {
                app: "zerodown",
                version: defaultActive
            }
        },

        blue: {
            name: "zerodown-blue",
            version: "v1",
            desiredReplicas: 2,
            readyReplicas: 2,
            availableReplicas: 2,
            image: "zerodown:v1",
            isActive: defaultActive === "blue",
            pods: [
                {
                    name: "zerodown-blue-sim-1",
                    phase: "Running",
                    ready: true,
                    restarts: 0
                },
                {
                    name: "zerodown-blue-sim-2",
                    phase: "Running",
                    ready: true,
                    restarts: 0
                }
            ]
        },

        green: {
            name: "zerodown-green",
            version: "v2",
            desiredReplicas: 2,
            readyReplicas: 2,
            availableReplicas: 2,
            image: "zerodown:v2",
            isActive: defaultActive === "green",
            pods: [
                {
                    name: "zerodown-green-sim-1",
                    phase: "Running",
                    ready: true,
                    restarts: 0
                },
                {
                    name: "zerodown-green-sim-2",
                    phase: "Running",
                    ready: true,
                    restarts: 0
                }
            ]
        },

        lastUpdated: new Date().toISOString()
    };
}

/**
 * Perform a Blue-Green deployment traffic switch.
 * @param {"blue"|"green"} target
 * @param {string} [initiatedBy="manager"]
 * @returns {Promise<object>}
 */
async function switchDeployment(target, initiatedBy = "manager") {
    const normalizedTarget = String(target || "").toLowerCase();

    if (normalizedTarget !== "blue" && normalizedTarget !== "green") {
        throw new Error("Invalid target deployment. Must be 'blue' or 'green'.");
    }

    const startTime = Date.now();
    const currentStatus = await getClusterStatus();

    // SAFETY FIX 1:
    // Never perform deployment operations using simulated cluster status.
    if (currentStatus.isSimulated) {
        throw new Error(
            `Cannot switch deployments: Kubernetes is unavailable. ${currentStatus.clusterWarning || ""}`
        );
    }

    const previousVersion = currentStatus.activeDeployment;

    if (previousVersion === normalizedTarget) {
        return {
            success: true,
            alreadyActive: true,
            message: `Target deployment '${normalizedTarget}' is already active.`,
            status: currentStatus
        };
    }

    // SAFETY FIX 2:
    // Validate target deployment readiness before entering the
    // switch-and-rollback block.
    const targetDep = currentStatus[normalizedTarget];

    if (!targetDep) {
        throw new Error(
            `Target deployment '${normalizedTarget}' status is unavailable. Aborting switch.`
        );
    }

    const desired = Number(targetDep.desiredReplicas || 0);
    const ready = Number(targetDep.readyReplicas || 0);
    const available = Number(targetDep.availableReplicas || 0);

    if (desired < 1 || ready < desired || available < desired) {
        throw new Error(
            `Target deployment '${normalizedTarget}' is not fully ready (ready ${ready}/${desired}, available ${available}/${desired}). Aborting switch.`
        );
    }

    const serviceManifest = normalizedTarget === "green"
        ? path.join(__dirname, "../../k8s/service-green.yaml")
        : path.join(__dirname, "../../k8s/service.yaml");

    try {
        // Apply service selector switch.
        await commandExecutor(["apply", "-f", serviceManifest]);

        // Verify that the service selector actually changed.
        const verifyStatus = await getClusterStatus();

        if (
            verifyStatus.isSimulated ||
            verifyStatus.activeDeployment !== normalizedTarget
        ) {
            throw new Error(
                `Traffic switch verification failed: active selector is still '${verifyStatus.activeDeployment}'`
            );
        }

        const durationMs = Date.now() - startTime;

        // Log successful deployment in PostgreSQL.
        try {
            await db.query(
                `INSERT INTO deployment_logs (action, from_version, to_version, status, initiated_by, details, duration_ms)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [
                    "switch",
                    previousVersion,
                    normalizedTarget,
                    "success",
                    initiatedBy,
                    `Successfully switched traffic from ${previousVersion} to ${normalizedTarget}`,
                    durationMs
                ]
            );
        } catch (dbErr) {
            console.warn(
                "Could not write deployment audit log:",
                dbErr.message
            );
        }

        // Broadcast live SSE event.
        sseService.broadcast("DEPLOYMENT_CHANGED", {
            event: "DEPLOYMENT_CHANGED",
            activeDeployment: normalizedTarget,
            activeVersion: normalizedTarget === "green" ? "v2" : "v1",
            previousDeployment: previousVersion,
            timestamp: new Date().toISOString()
        });

        return {
            success: true,
            previousVersion,
            activeDeployment: normalizedTarget,
            activeVersion: normalizedTarget === "green" ? "v2" : "v1",
            durationMs,
            status: verifyStatus
        };

    } catch (error) {
        // Restore the previous service selector if the switch failed.
        const rollbackManifest = previousVersion === "green"
            ? path.join(__dirname, "../../k8s/service-green.yaml")
            : path.join(__dirname, "../../k8s/service.yaml");

        try {
            await commandExecutor(["apply", "-f", rollbackManifest]);
        } catch (rbErr) {
            console.error("Rollback execution error:", rbErr.message);
        }

        // Record failed switch.
        try {
            await db.query(
                `INSERT INTO deployment_logs (action, from_version, to_version, status, initiated_by, details, duration_ms)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [
                    "switch",
                    previousVersion,
                    normalizedTarget,
                    "rolled_back",
                    initiatedBy,
                    `Switch failed (${error.message}). Restored to ${previousVersion}.`,
                    Date.now() - startTime
                ]
            );
        } catch (dbErr) {
            // Audit logging must not hide the original deployment error.
        }

        throw error;
    }
}

/**
 * Rollback to the previous deployment environment.
 * @param {string} [initiatedBy="manager"]
 * @returns {Promise<object>}
 */
async function rollbackDeployment(initiatedBy = "manager") {
    const current = await getClusterStatus();

    // Do not attempt rollback based on simulated cluster status.
    if (current.isSimulated) {
        throw new Error(
            `Cannot rollback deployment: Kubernetes is unavailable. ${current.clusterWarning || ""}`
        );
    }

    const opposite = current.activeDeployment === "green" ? "blue" : "green";

    return switchDeployment(opposite, initiatedBy);
}

/**
 * Allow injecting a custom executor for automated testing.
 * @param {Function} executor
 */
function setExecutor(executor) {
    commandExecutor = executor;
}

/**
 * Restore default kubectl executor.
 */
function restoreExecutor() {
    commandExecutor = runKubectlCommand;
}

module.exports = {
    getClusterStatus,
    switchDeployment,
    rollbackDeployment,
    setExecutor,
    restoreExecutor
};
