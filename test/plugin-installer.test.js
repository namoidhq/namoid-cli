import assert from "node:assert/strict";
import test from "node:test";
import { detectHost, hostInstallCommands, hostPluginStatus, hostUninstallCommands, installHostPlugin, updateHostPlugin } from "../src/plugin-installer.js";
import { HOST_PLUGINS } from "../src/plugins.js";

test("installs Codex from the official repository marketplace", () => {
  const commands = hostInstallCommands(HOST_PLUGINS.codex);
  assert.deepEqual(commands[0], ["codex", ["plugin", "marketplace", "add", "https://github.com/namoidhq/namoid-codex-plugin"]]);
  assert.deepEqual(commands[1], ["codex", ["plugin", "add", "namoid-setup-assistant@namoid"]]);
});

test("installs the verified Claude marketplace for the current user", () => {
  const commands = hostInstallCommands(HOST_PLUGINS.claude);
  assert.deepEqual(commands[0], ["claude", ["plugin", "marketplace", "add", "namoidhq/namoid-claude-plugin", "--scope", "user"]]);
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

test("installs without cloning or resolving a CLI-pinned release", () => {
  const calls = [];
  const result = installHostPlugin(HOST_PLUGINS.codex, { run: (command, args) => calls.push([command, args]) });
  assert.equal(result.updateStrategy, "host-marketplace");
  assert.equal(calls.length, 2);
  assert.ok(calls.every(([command]) => command === "codex"));
});

test("updates through the host marketplace lifecycle", () => {
  const calls = [];
  updateHostPlugin(HOST_PLUGINS.claude, { run: (command, args) => calls.push([command, args]) });
  assert.deepEqual(calls.map(([command]) => command), ["claude", "claude", "claude", "claude"]);
  assert.equal(calls.some(([command]) => command === "git"), false);
});
