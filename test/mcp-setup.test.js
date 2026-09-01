import assert from "node:assert/strict";
import test from "node:test";
import { detectPreferredMcpHost, MCP_SERVER_URL, setupAndAuthorizeMcp } from "../src/mcp-setup.js";
import { HOST_PLUGINS } from "../src/plugins.js";

test("prefers the active Codex host when both executables exist", () => {
  const host = detectPreferredMcpHost({
    env: { CODEX_HOME: "/home/test/.codex" },
    run: () => Buffer.from("/usr/local/bin/tool\n"),
  });
  assert.equal(host, HOST_PLUGINS.codex);
});

test("replaces a stale Codex MCP URL and starts host-owned OAuth", () => {
  const calls = [];
  const run = (command, args) => {
    calls.push([command, args]);
    if (args[0] === "mcp" && args[1] === "get") {
      return JSON.stringify({ transport: { url: "https://api.namoid.in/v1/setup/mcp" } });
    }
    return "";
  };
  const result = setupAndAuthorizeMcp(HOST_PLUGINS.codex, { run });
  assert.ok(calls.some(([command, args]) => command === "codex" && args.join(" ") === "mcp remove namoid-customer-identity"));
  assert.ok(calls.some(([command, args]) => command === "codex" && args.join(" ") === `mcp add namoid-customer-identity --url ${MCP_SERVER_URL}`));
  assert.ok(calls.some(([command, args]) => command === "codex" && args[0] === "mcp" && args[1] === "login"));
  assert.equal(result.authorized, true);
});
