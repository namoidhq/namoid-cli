import assert from "node:assert/strict";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  CUSTOMER_IDENTITY_SKILLS,
  installSkills,
  skillsStatus,
  uninstallSkills,
  validateBundledSkills,
} from "../src/skills.js";

test("ships valid Customer Identity skills", () => {
  assert.deepEqual(
    validateBundledSkills().map((skill) => skill.name),
    CUSTOMER_IDENTITY_SKILLS,
  );
});

test("installs, reports, and removes Codex skills", () => {
  const home = mkdtempSync(path.join(tmpdir(), "namoid-skills-"));
  const installed = installSkills("codex", { home });
  assert.equal(installed.root, path.join(home, ".agents", "skills"));
  assert.ok(existsSync(path.join(installed.root, "setup-namoid", "SKILL.md")));
  assert.ok(skillsStatus("codex", { home }).skills.every((skill) => skill.installed));
  uninstallSkills("codex", { home });
  assert.ok(skillsStatus("codex", { home }).skills.every((skill) => !skill.installed));
});

test("dry-run does not write Claude skills", () => {
  const home = mkdtempSync(path.join(tmpdir(), "namoid-skills-"));
  const result = installSkills("cc", { home, dryRun: true });
  assert.equal(result.root, path.join(home, ".claude", "skills"));
  assert.equal(existsSync(result.root), false);
});
