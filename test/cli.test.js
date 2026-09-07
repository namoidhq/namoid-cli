import assert from "node:assert/strict";
import test from "node:test";
import { hasDetectedApplication, parseArgs, projectDirectoryGuidance } from "../src/cli.js";

test("recognizes JavaScript and Python application roots", () => {
  assert.equal(hasDetectedApplication({ packageJson: "package.json", pythonManifest: null }), true);
  assert.equal(hasDetectedApplication({ packageJson: null, pythonManifest: "python" }), true);
  assert.equal(hasDetectedApplication({ packageJson: null, pythonManifest: null }), false);
});

test("undetected-project guidance tells the user how to resume setup", () => {
  const guidance = projectDirectoryGuidance();

  assert.match(guidance, /cd \/path\/to\/your-application/);
  assert.match(guidance, /npx @namoidhq\/cli init/);
  assert.match(guidance, /detect your framework/);
});

test("rejects obsolete direct-account setup flags", () => {
  for (const option of ["--tenant", "--project", "--environment", "--client-id"]) {
    assert.throws(() => parseArgs(["init", option, "value"]), /Unknown option/);
  }
});
