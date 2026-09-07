import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  configureProjectMcp,
  projectConfigPlan,
  removeProjectMcp,
} from "../src/agent-config.js";
import { AGENTS } from "../src/agents.js";
import { MCP_SERVER_NAME, MCP_SERVER_URL } from "../src/mcp-setup.js";

test("merges Cursor MCP without replacing existing servers", () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "namoid-agent-"));
  const plan = projectConfigPlan(AGENTS.cursor, cwd);
  mkdirSync(path.dirname(plan.path), { recursive: true });
  writeFileSync(plan.path, JSON.stringify({ mcpServers: { existing: { url: "https://example.test" } }, theme: "dark" }));
  configureProjectMcp(AGENTS.cursor, cwd);
  const value = JSON.parse(readFileSync(plan.path, "utf8"));
  assert.equal(value.theme, "dark");
  assert.equal(value.mcpServers.existing.url, "https://example.test");
  assert.equal(value.mcpServers[MCP_SERVER_NAME].url, MCP_SERVER_URL);
});

test("writes agent-specific project configuration shapes", () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "namoid-agent-"));
  configureProjectMcp(AGENTS.gemini, cwd);
  configureProjectMcp(AGENTS.antigravity, cwd);
  configureProjectMcp(AGENTS.copilot, cwd);
  const gemini = JSON.parse(readFileSync(path.join(cwd, ".gemini/settings.json"), "utf8"));
  const antigravity = JSON.parse(readFileSync(path.join(cwd, ".agents/mcp_config.json"), "utf8"));
  const copilot = JSON.parse(readFileSync(path.join(cwd, ".vscode/mcp.json"), "utf8"));
  assert.equal(gemini.mcpServers[MCP_SERVER_NAME].httpUrl, MCP_SERVER_URL);
  assert.equal(gemini.mcpServers[MCP_SERVER_NAME].authProviderType, "dynamic_discovery");
  assert.equal(antigravity.mcpServers[MCP_SERVER_NAME].serverUrl, MCP_SERVER_URL);
  assert.equal(copilot.servers[MCP_SERVER_NAME].type, "http");
});

test("removal deletes only the NamoID server", () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "namoid-agent-"));
  configureProjectMcp(AGENTS.cursor, cwd);
  const plan = projectConfigPlan(AGENTS.cursor, cwd);
  const value = JSON.parse(readFileSync(plan.path, "utf8"));
  value.mcpServers.other = { url: "https://example.test" };
  writeFileSync(plan.path, JSON.stringify(value));
  removeProjectMcp(AGENTS.cursor, cwd);
  const after = JSON.parse(readFileSync(plan.path, "utf8"));
  assert.equal(MCP_SERVER_NAME in after.mcpServers, false);
  assert.equal(after.mcpServers.other.url, "https://example.test");
  assert.equal(existsSync(plan.path), true);
});

test("refuses malformed JSON instead of overwriting it", () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "namoid-agent-"));
  const plan = projectConfigPlan(AGENTS.cursor, cwd);
  mkdirSync(path.dirname(plan.path), { recursive: true });
  writeFileSync(plan.path, "{broken");
  assert.throws(() => configureProjectMcp(AGENTS.cursor, cwd), /malformed JSON/);
});

test("refuses configuration through a symlinked parent directory", () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "namoid-agent-"));
  const outside = mkdtempSync(path.join(tmpdir(), "namoid-agent-outside-"));
  symlinkSync(outside, path.join(cwd, ".cursor"));
  assert.throws(() => configureProjectMcp(AGENTS.cursor, cwd), /symbolic link/);
  assert.equal(existsSync(path.join(outside, "mcp.json")), false);
});
