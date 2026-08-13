import assert from "node:assert/strict";
import test from "node:test";
import { hostInstallCommands, pluginCachePath } from "../src/plugin-installer.js";
import { HOST_PLUGINS } from "../src/plugins.js";

test("uses a release-addressed private cache path", () => {
  const location = pluginCachePath(HOST_PLUGINS.codex, "/home/tester");
  assert.equal(location, `/home/tester/.namoid/plugins/codex/${HOST_PLUGINS.codex.releaseCommit}`);
});

test("installs the verified Codex marketplace without a moving Git ref", () => {
  const commands = hostInstallCommands(HOST_PLUGINS.codex, "/verified/codex");
  assert.deepEqual(commands[0], ["codex", ["plugin", "marketplace", "add", "/verified/codex"]]);
  assert.deepEqual(commands[1], ["codex", ["plugin", "add", "namoid-setup-assistant@namoid"]]);
});

test("installs the verified Claude marketplace for the current user", () => {
  const commands = hostInstallCommands(HOST_PLUGINS.claude, "/verified/claude");
  assert.deepEqual(commands[0], ["claude", ["plugin", "marketplace", "add", "/verified/claude", "--scope", "user"]]);
  assert.deepEqual(commands[1], ["claude", ["plugin", "install", "namoid-setup-assistant@namoid", "--scope", "user"]]);
});
