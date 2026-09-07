import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, symlinkSync } from "node:fs";
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

test("installs, reports, and removes project-local skills", () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "namoid-skills-"));
  const installed = installSkills({ cwd });
  assert.equal(installed.root, path.join(cwd, ".agents", "skills"));
  assert.ok(existsSync(path.join(installed.root, "setup-namoid", "SKILL.md")));
  assert.ok(skillsStatus({ cwd }).skills.every((skill) => skill.installed));
  uninstallSkills({ cwd });
  assert.ok(skillsStatus({ cwd }).skills.every((skill) => !skill.installed));
});

test("dry-run does not write project skills", () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "namoid-skills-"));
  const result = installSkills({ cwd, dryRun: true });
  assert.equal(result.root, path.join(cwd, ".agents", "skills"));
  assert.equal(existsSync(result.root), false);
});

test("installs skills from a verified integration release", () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "namoid-skills-release-"));
  const source = Buffer.from("---\nname: setup-namoid\ndescription: Test release skill.\n---\n\n# Setup\n");
  const release = {
    source: "github-release",
    manifest: { version: "9.8.7", skills: ["setup-namoid"] },
    files: new Map([["skills/setup-namoid/SKILL.md", { bytes: source, sha256: "verified" }]]),
  };
  const result = installSkills({ cwd, release });
  assert.equal(result.source, "github-release");
  assert.equal(result.version, "9.8.7");
  assert.equal(
    readFileSync(path.join(cwd, ".agents/skills/setup-namoid/SKILL.md"), "utf8"),
    source.toString("utf8"),
  );
});

test("refuses to install skills through a symlinked .agents directory", () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "namoid-skills-"));
  const outside = mkdtempSync(path.join(tmpdir(), "namoid-skills-outside-"));
  symlinkSync(outside, path.join(cwd, ".agents"));
  assert.throws(() => installSkills({ cwd }), /symbolic link/);
  assert.equal(existsSync(path.join(outside, "skills")), false);
});
