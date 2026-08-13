const MCP_PROTOCOL_VERSION = "2025-06-18";

function jsonRpcError(payload) {
  const message = typeof payload?.error?.message === "string"
    ? payload.error.message
    : "MCP request failed";
  const error = new Error(message);
  error.code = payload?.error?.code ?? null;
  return error;
}

export class SetupAssistantClient {
  constructor({ endpoint, accessToken, fetchImpl = fetch }) {
    this.endpoint = new URL(endpoint).toString();
    this.accessToken = accessToken;
    this.fetchImpl = fetchImpl;
    this.nextId = 1;
  }

  async request(method, params = {}) {
    const id = this.nextId;
    this.nextId += 1;
    const response = await this.fetchImpl(this.endpoint, {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${this.accessToken}`,
        "content-type": "application/json",
        "mcp-protocol-version": MCP_PROTOCOL_VERSION,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = typeof payload?.detail === "string" ? payload.detail : `HTTP ${response.status}`;
      throw new Error(`Setup Assistant request failed: ${detail}`);
    }
    if (!payload || payload.jsonrpc !== "2.0" || payload.id !== id) {
      throw new Error("Setup Assistant returned an invalid JSON-RPC response");
    }
    if (payload.error) throw jsonRpcError(payload);
    return payload.result;
  }

  initialize() {
    return this.request("initialize", {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "namoid-cli", version: "0.1.0" },
    });
  }

  listTools() {
    return this.request("tools/list", {});
  }

  callTool(name, args = {}) {
    return this.request("tools/call", { name, arguments: args });
  }
}

export { MCP_PROTOCOL_VERSION };
