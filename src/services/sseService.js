/**
 * Server-Sent Events (SSE) Manager for live cross-device deployment updates.
 */
class SSEService {
    constructor() {
        this.clients = new Set();
        this.pingInterval = null;

        // Keep-alive heartbeat every 25 seconds
        if (process.env.NODE_ENV !== "test") {
            this.pingInterval = setInterval(() => {
                this.ping();
            }, 25000);
        }
    }

    /**
     * Register a new HTTP connection as an SSE event stream.
     * @param {import('express').Request} req
     * @param {import('express').Response} res
     * @param {object} [initialPayload]
     */
    addClient(req, res, initialPayload = null) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache, no-transform");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("X-Accel-Buffering", "no");
        res.flushHeaders();

        const client = {
            id: Date.now() + "_" + Math.random().toString(36).substring(2, 9),
            res
        };

        this.clients.add(client);

        // Send connection establishment event
        res.write(`event: CONNECTED\ndata: ${JSON.stringify({ clientId: client.id, timestamp: new Date().toISOString() })}\n\n`);

        if (initialPayload) {
            res.write(`event: INITIAL_STATE\ndata: ${JSON.stringify(initialPayload)}\n\n`);
        }

        req.on("close", () => {
            this.clients.delete(client);
        });
    }

    /**
     * Broadcast an event and payload to all connected SSE clients.
     * @param {string} eventType
     * @param {object} data
     */
    broadcast(eventType, data) {
        const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
        for (const client of this.clients) {
            try {
                client.res.write(payload);
            } catch (err) {
                this.clients.delete(client);
            }
        }
    }

    /**
     * Send heartbeat comment to keep active connections alive.
     */
    ping() {
        for (const client of this.clients) {
            try {
                client.res.write(": ping\n\n");
            } catch (err) {
                this.clients.delete(client);
            }
        }
    }

    /**
     * Get count of active SSE client connections.
     * @returns {number}
     */
    getClientCount() {
        return this.clients.size;
    }

    /**
     * Clean up all connections (for graceful test shutdown).
     */
    closeAll() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
        }
        for (const client of this.clients) {
            try {
                client.res.end();
            } catch (err) {
                // Ignore
            }
        }
        this.clients.clear();
    }
}

const sseService = new SSEService();
module.exports = sseService;
