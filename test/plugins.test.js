import assert from "node:assert/strict";
import test from "node:test";
import { HOST_PLUGINS, pluginPlan, resolveHost } from "../src/plugins.js";

test("keeps Codex and Claude packaging separate while sharing one plugin identity", () => {
  assert.notEqual(HOST_PLUGINS.codex.repository, HOST_PLUGINS.claude.repository);
  assert.equal(HOST_PLUGINS.codex.pluginName, "customer-identity");
  assert.equal(HOST_PLUGINS.claude.pluginName, "customer-identity");
});

test("plans installation through the host marketplace", () => {
  const plan = pluginPlan("codex");
  assert.equal(plan.updateStrategy, "host-marketplace");
  assert.equal(plan.actions[0].id, "plugin.marketplace.register");
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
