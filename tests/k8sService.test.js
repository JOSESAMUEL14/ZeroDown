
jest.mock("../src/db", () => ({
  query: jest.fn().mockResolvedValue({ rows: [] })
}));

jest.mock("../src/services/sseService", () => ({
  broadcast: jest.fn()
}));

const k8sService = require("../src/services/k8sService");
const db = require("../src/db");
const sseService = require("../src/services/sseService");

function createExecutor(options = {}) {
  let active = options.active || "blue";
  const applyCalls = [];

  const executor = jest.fn(async (args) => {
    if (args[0] === "apply") {
      applyCalls.push(args[2]);

      if (options.failApply) {
        throw new Error("Simulated apply failure");
      }

      active = args[2].includes("service-green.yaml")
        ? "green"
        : "blue";

      return "service updated";
    }

    if (args[0] === "get" && args[1] === "service") {
      return JSON.stringify({
        metadata: { name: "zerodown-service" },
        spec: {
          type: "NodePort",
          clusterIP: "10.0.0.1",
          ports: [{ port: 80, nodePort: 30080 }],
          selector: { app: "zerodown", version: active }
        }
      });
    }

    if (args[0] === "get" && args[1] === "deployment") {
      const isGreen = args[2] === "zerodown-green";
      const ready = isGreen
        ? (options.greenReady ?? 2)
        : (options.blueReady ?? 2);

      return JSON.stringify({
        metadata: { name: args[2] },
        spec: {
          replicas: 2,
          template: {
            spec: {
              containers: [{ image: isGreen ? "zerodown:v2" : "zerodown:v1" }]
            }
          }
        },
        status: {
          readyReplicas: ready,
          availableReplicas: ready
        }
      });
    }

    if (args[0] === "get" && args[1] === "pods") {
      return JSON.stringify({ items: [] });
    }

    throw new Error(`Unexpected command: ${args.join(" ")}`);
  });

  executor.applyCalls = applyCalls;
  return executor;
}

describe("Kubernetes deployment service", () => {
  beforeEach(() => {
    db.query.mockClear();
    sseService.broadcast.mockClear();
  });

  afterEach(() => {
    k8sService.restoreExecutor();
    jest.restoreAllMocks();
    delete process.env.APP_VERSION;
  });

  test("returns the current Blue deployment status", async () => {
    const executor = createExecutor({ active: "blue" });
    k8sService.setExecutor(executor);

    const status = await k8sService.getClusterStatus();

    expect(status.activeDeployment).toBe("blue");
    expect(status.activeVersion).toBe("v1");
    expect(status.isSimulated).not.toBe(true);
  });

  test("successfully switches traffic from Blue to Green", async () => {
    const executor = createExecutor({ active: "blue" });
    k8sService.setExecutor(executor);

    const result = await k8sService.switchDeployment("green", "test");

    expect(result.success).toBe(true);
    expect(result.previousVersion).toBe("blue");
    expect(result.activeDeployment).toBe("green");
    expect(executor.applyCalls).toHaveLength(1);
    expect(db.query).toHaveBeenCalled();
    expect(sseService.broadcast).toHaveBeenCalled();
  });

  test("rejects an invalid deployment target", async () => {
    const executor = createExecutor();
    k8sService.setExecutor(executor);

    await expect(
      k8sService.switchDeployment("yellow")
    ).rejects.toThrow("Invalid target deployment");

    expect(executor.applyCalls).toHaveLength(0);
  });

  test("does not switch to an unhealthy Green deployment", async () => {
    const executor = createExecutor({
      active: "blue",
      greenReady: 1
    });
    k8sService.setExecutor(executor);

    await expect(
      k8sService.switchDeployment("green")
    ).rejects.toThrow("not fully ready");

    expect(executor.applyCalls).toHaveLength(0);
  });

  test("returns success when the requested deployment is already active", async () => {
    const executor = createExecutor({ active: "blue" });
    k8sService.setExecutor(executor);

    const result = await k8sService.switchDeployment("blue");

    expect(result.success).toBe(true);
    expect(result.alreadyActive).toBe(true);
    expect(executor.applyCalls).toHaveLength(0);
  });

  test("rolls back to Blue from Green", async () => {
    const executor = createExecutor({ active: "green" });
    k8sService.setExecutor(executor);

    const result = await k8sService.rollbackDeployment("test");

    expect(result.success).toBe(true);
    expect(result.activeDeployment).toBe("blue");
  });

  test("restores the previous selector when applying a switch fails", async () => {
    let active = "blue";
    let applyCount = 0;

    const executor = createExecutor({ active: "blue" });

    executor.mockImplementation(async (args) => {
      if (args[0] === "apply") {
        applyCount++;

        if (applyCount === 1) {
          throw new Error("Simulated apply failure");
        }

        return "rollback applied";
      }

      return createExecutorResponse(args, active);
    });

    k8sService.setExecutor(executor);

    await expect(
      k8sService.switchDeployment("green")
    ).rejects.toThrow("Simulated apply failure");

    expect(applyCount).toBe(2);
  });

  test("does not attempt a switch using simulated Kubernetes status", async () => {
    process.env.APP_VERSION = "v1";

    const executor = jest.fn().mockRejectedValue(
      new Error("Kubernetes unavailable")
    );

    k8sService.setExecutor(executor);

    const status = await k8sService.getClusterStatus();
    expect(status.isSimulated).toBe(true);

    await expect(
      k8sService.switchDeployment("green")
    ).rejects.toThrow();

    const applyCalls = executor.mock.calls.filter(
      ([args]) => args[0] === "apply"
    );

    expect(applyCalls).toHaveLength(0);
  });
});

function createExecutorResponse(args, active) {
  if (args[0] === "get" && args[1] === "service") {
    return JSON.stringify({
      metadata: { name: "zerodown-service" },
      spec: {
        selector: { app: "zerodown", version: active },
        ports: [{ port: 80 }]
      }
    });
  }

  if (args[0] === "get" && args[1] === "deployment") {
    return JSON.stringify({
      spec: { replicas: 2, template: { spec: { containers: [{ image: "zerodown:test" }] } } },
      status: { readyReplicas: 2, availableReplicas: 2 }
    });
  }

  if (args[0] === "get" && args[1] === "pods") {
    return JSON.stringify({ items: [] });
  }

  throw new Error("Unexpected command");
}
