import assert from "node:assert/strict";
import test from "node:test";
import { detectHost, hostInstallCommands, hostPluginStatus, hostUninstallCommands, pluginCachePath } from "../src/plugin-installer.js";
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

test("uses host-native uninstall commands", () => {
  assert.deepEqual(hostUninstallCommands(HOST_PLUGINS.codex), [
    ["codex", ["plugin", "remove", "namoid-setup-assistant@namoid"]],
    ["codex", ["plugin", "marketplace", "remove", "namoid"]],
  ]);
  assert.deepEqual(hostUninstallCommands(HOST_PLUGINS.claude)[0], [
    "claude",
    ["plugin", "uninstall", "namoid-setup-assistant@namoid", "--scope", "user"],
  ]);
});

test("detects hosts without invoking a shell", () => {
  const calls = [];
  const detected = detectHost(HOST_PLUGINS.codex, (command, args) => calls.push([command, args]));
  assert.equal(detected, true);
  assert.equal(calls[0][1][0], "codex");
});

test("reads installed plugin status from host JSON", () => {
  const run = (command, args) => {
    if (command === "which") return Buffer.from("/usr/local/bin/codex\n");
    assert.deepEqual([command, args], ["codex", ["plugin", "list", "--json"]]);
    return JSON.stringify({ plugins: [{ name: "namoid-setup-assistant", marketplace: "namoid" }] });
  };
  const status = hostPluginStatus(HOST_PLUGINS.codex, { home: "/missing", run });
  assert.equal(status.detected, true);
  assert.equal(status.installed, true);
});

test("reports unknown status when a detected host cannot list plugins", () => {
  let calls = 0;
  const run = () => {
    calls += 1;
    if (calls === 1) return Buffer.from("/usr/local/bin/codex\n");
    throw new Error("unsupported command");
  };
  const status = hostPluginStatus(HOST_PLUGINS.codex, { home: "/missing", run });
  assert.equal(status.detected, true);
  assert.equal(status.installed, false);
  assert.equal(status.status, "unknown");
});
