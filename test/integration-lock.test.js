import assert from "node:assert/strict";
import { existsSync, mkdtempSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { readIntegrationLock, removeAgentsFromLock, writeIntegrationLock } from "../src/integration-lock.js";

test("records and removes managed agent state", () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "namoid-lock-"));
  writeIntegrationLock(cwd, {
    integrationVersion: "0.1.0",
    skills: ["setup-namoid"],
    agentResults: [
      { agent: "cursor", oauth: "host-owned", managedFiles: [".cursor/mcp.json"] },
      { agent: "copilot", oauth: "host-owned", managedFiles: [".vscode/mcp.json"] },
    ],
    now: () => "2026-09-02T00:00:00.000Z",
  });
  assert.deepEqual(Object.keys(readIntegrationLock(cwd).agents), ["cursor", "copilot"]);
  removeAgentsFromLock(cwd, ["cursor"], { now: () => "2026-09-03T00:00:00.000Z" });
  assert.deepEqual(Object.keys(readIntegrationLock(cwd).agents), ["copilot"]);
});

test("refuses to write the lockfile through a symlinked directory", () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "namoid-lock-"));
  const outside = mkdtempSync(path.join(tmpdir(), "namoid-lock-outside-"));
  symlinkSync(outside, path.join(cwd, ".namoid"));
  assert.throws(
    () => writeIntegrationLock(cwd, {
      integrationVersion: "0.1.0",
      skills: [],
      agentResults: [],
    }),
    /symbolic link/,
  );
  assert.equal(existsSync(path.join(outside, "agents.lock.json")), false);
});
