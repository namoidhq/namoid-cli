import assert from "node:assert/strict";
import test from "node:test";
import { HOST_PLUGINS, pluginPlan, resolveHost } from "../src/plugins.js";

test("keeps Codex and Claude packaging separate while sharing one plugin identity", () => {
  assert.notEqual(HOST_PLUGINS.codex.repository, HOST_PLUGINS.claude.repository);
  assert.equal(HOST_PLUGINS.codex.pluginName, "namoid-setup-assistant");
  assert.equal(HOST_PLUGINS.claude.pluginName, "namoid-setup-assistant");
});

test("plans only pinned plugin releases", () => {
  const plan = pluginPlan("codex");
  assert.equal(plan.releaseTag, "v0.1.0");
  assert.equal(plan.mutableSourceAllowed, false);
  assert.match(plan.releaseCommit, /^[0-9a-f]{40}$/);
  assert.match(plan.archiveSha256, /^[0-9a-f]{64}$/);
  assert.equal(plan.actions[0].id, "plugin.release.verify");
  assert.ok(plan.actions.some((action) => action.id === "plugin.oauth.authorize"));
});

test("rejects unknown AI hosts", () => {
  assert.throws(() => pluginPlan("unknown"), /Unsupported AI host/);
});

test("resolves stable host aliases", () => {
  assert.equal(resolveHost("cc"), HOST_PLUGINS.claude);
  assert.equal(resolveHost("claude-code"), HOST_PLUGINS.claude);
  assert.equal(resolveHost("openai"), HOST_PLUGINS.codex);
  assert.equal(resolveHost("unknown"), undefined);
});
