import assert from "node:assert/strict";
import test from "node:test";
import { MCP_PROTOCOL_VERSION, SetupAssistantClient } from "../src/mcp.js";

test("calls Setup Assistant tools with bearer authorization and MCP version", async () => {
  const requests = [];
  const client = new SetupAssistantClient({
    endpoint: "https://api.namoid.in/v1/setup/mcp",
    accessToken: "access-token",
    fetchImpl: async (_url, init) => {
      requests.push(init);
      const request = JSON.parse(init.body);
      return new Response(JSON.stringify({
        jsonrpc: "2.0",
        id: request.id,
        result: { content: [{ type: "text", text: "ok" }] },
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });

  const result = await client.callTool("whoami");

  assert.equal(result.content[0].text, "ok");
  assert.equal(requests[0].headers.authorization, "Bearer access-token");
  assert.equal(requests[0].headers["mcp-protocol-version"], MCP_PROTOCOL_VERSION);
  assert.equal(JSON.parse(requests[0].body).params.name, "whoami");
});

test("rejects mismatched JSON-RPC responses", async () => {
  const client = new SetupAssistantClient({
    endpoint: "https://api.namoid.in/v1/setup/mcp",
    accessToken: "access-token",
    fetchImpl: async () => new Response(JSON.stringify({
      jsonrpc: "2.0",
      id: 999,
      result: {},
    }), { status: 200, headers: { "content-type": "application/json" } }),
  });

  await assert.rejects(client.listTools(), /invalid JSON-RPC response/);
});
