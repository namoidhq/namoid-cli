import assert from "node:assert/strict";
import test from "node:test";
import { HOST_PLUGINS, pluginPlan } from "../src/plugins.js";

test("keeps Codex and Claude packaging separate while sharing one plugin identity", () => {
  assert.notEqual(HOST_PLUGINS.codex.repository, HOST_PLUGINS.claude.repository);
  assert.equal(HOST_PLUGINS.codex.pluginName, "namoid-setup-assistant");
  assert.equal(HOST_PLUGINS.claude.pluginName, "namoid-setup-assistant");
});

test("plans only pinned plugin releases", () => {
  const plan = pluginPlan("codex");
  assert.equal(plan.releaseTag, "v0.1.0");
  assert.equal(plan.mutableSourceAllowed, false);
  assert.equal(plan.actions[0].id, "plugin.release.verify");
  assert.ok(plan.actions.some((action) => action.id === "plugin.oauth.authorize"));
});

test("rejects unknown AI hosts", () => {
  assert.throws(() => pluginPlan("unknown"), /Unsupported AI host/);
});
