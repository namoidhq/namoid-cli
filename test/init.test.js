import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const CLI = new URL("../bin/namoid.js", import.meta.url).pathname;

test("credential-free init configures Cursor entirely inside an application", () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "namoid-init-"));
  const fakeHome = mkdtempSync(path.join(tmpdir(), "namoid-home-"));
  writeFileSync(path.join(cwd, "package.json"), JSON.stringify({ name: "demo-app" }));
  const result = spawnSync(
    process.execPath,
    [CLI, "init", "--path", cwd, "--agent", "cursor", "--offline", "--yes", "--json"],
    { encoding: "utf8", env: { ...process.env, HOME: fakeHome } },
  );
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.ok, true);
  assert.equal(output.result.manifestSource, "bundled");
  assert.equal(
    JSON.parse(readFileSync(path.join(cwd, ".cursor/mcp.json"), "utf8"))
      .mcpServers["namoid-customer-identity"].url,
    "https://mcp.namoid.in",
  );
  assert.ok(existsSync(path.join(cwd, ".agents/skills/setup-namoid/SKILL.md")));
  const lock = JSON.parse(readFileSync(path.join(cwd, ".namoid/agents.lock.json"), "utf8"));
  assert.equal(lock.integrationSource, "bundled");
  assert.equal(lock.agents.cursor.oauth, "host-owned");
  assert.equal(existsSync(path.join(fakeHome, ".config/namoid/tokens.json")), false);
});

test("init outside an application creates no integration files", () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "namoid-not-app-"));
  const result = spawnSync(
    process.execPath,
    [CLI, "init", "--path", cwd, "--agent", "cursor", "--offline", "--yes", "--json"],
    { encoding: "utf8" },
  );
  assert.notEqual(result.status, 0);
  assert.equal(existsSync(path.join(cwd, ".agents")), false);
  assert.equal(existsSync(path.join(cwd, ".cursor")), false);
  assert.equal(existsSync(path.join(cwd, ".namoid")), false);
});
