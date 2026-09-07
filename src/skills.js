import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertNoSymlinkComponents } from "./safe-path.js";

const SKILLS_ROOT = fileURLToPath(new URL("../skills", import.meta.url));

export const CUSTOMER_IDENTITY_SKILLS = Object.freeze([
  "setup-namoid",
  "diagnose-namoid",
  "verify-namoid",
  "implement-namoid-logout",
  "review-namoid-sessions",
  "prepare-namoid-production",
]);

function skillTargetRoot(cwd) {
  return path.join(cwd, ".agents", "skills");
}

export function validateBundledSkills() {
  return CUSTOMER_IDENTITY_SKILLS.map((name) => {
    const skillPath = path.join(SKILLS_ROOT, name, "SKILL.md");
    if (!existsSync(skillPath)) throw new Error(`Bundled skill is missing: ${name}`);
    const source = readFileSync(skillPath, "utf8");
    if (!source.startsWith("---\n") || !source.includes(`\nname: ${name}\n`)) {
      throw new Error(`Bundled skill has invalid frontmatter: ${name}`);
    }
    if (!source.includes("description:")) {
      throw new Error(`Bundled skill has no description: ${name}`);
    }
    return { name, source: path.dirname(skillPath) };
  });
}

export function skillsStatus({ cwd = process.cwd() } = {}) {
  const root = skillTargetRoot(cwd);
  return {
    root,
    skills: validateBundledSkills().map(({ name }) => ({
      name,
      installed: existsSync(path.join(root, name, "SKILL.md")),
    })),
  };
}

function releaseSkillSteps(release) {
  if (!release?.files) return validateBundledSkills().map(({ name, source }) => ({ name, source }));
  return release.manifest.skills.map((name) => {
    const prefix = `skills/${name}/`;
    const files = [...release.files.entries()]
      .filter(([file]) => file.startsWith(prefix))
      .map(([file, entry]) => ({ relative: file.slice(prefix.length), ...entry }));
    if (!files.some((file) => file.relative === "SKILL.md")) {
      throw new Error(`Verified integration release is missing skill: ${name}`);
    }
    return { name, files };
  });
}

export function installSkills({ cwd = process.cwd(), dryRun = false, release = null } = {}) {
  const root = skillTargetRoot(cwd);
  const steps = releaseSkillSteps(release).map((step) => ({
    ...step,
    destination: path.join(root, step.name),
  }));
  if (!dryRun) {
    assertNoSymlinkComponents(cwd, root);
    for (const step of steps) assertNoSymlinkComponents(cwd, step.destination);
    mkdirSync(root, { recursive: true, mode: 0o700 });
    const stagingRoot = path.join(root, `.namoid-staging-${process.pid}-${Date.now()}`);
    mkdirSync(stagingRoot, { recursive: true, mode: 0o700 });
    for (const step of steps) {
      const staged = path.join(stagingRoot, step.name);
      if (step.files) {
        for (const file of step.files) {
          const target = path.join(staged, ...file.relative.split("/"));
          mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
          writeFileSync(target, file.bytes, { mode: 0o600 });
        }
      } else {
        cpSync(step.source, staged, { recursive: true });
      }
    }
    for (const step of steps) {
      const staged = path.join(stagingRoot, step.name);
      rmSync(step.destination, { recursive: true, force: true });
      renameSync(staged, step.destination);
    }
    rmSync(stagingRoot, { recursive: true, force: true });
  }
  return {
    root,
    dryRun,
    source: release?.source ?? "bundled",
    version: release?.manifest?.version ?? null,
    skills: steps.map(({ name, destination, files }) => ({
      name,
      destination,
      files: files?.map(({ relative, sha256 }) => ({ path: relative, sha256 })) ?? null,
    })),
  };
}

export function uninstallSkills({ cwd = process.cwd(), dryRun = false } = {}) {
  const status = skillsStatus({ cwd });
  const targets = status.skills.map(({ name }) => path.join(status.root, name));
  if (!dryRun) {
    assertNoSymlinkComponents(cwd, status.root);
    for (const target of targets) {
      assertNoSymlinkComponents(cwd, target);
      rmSync(target, { recursive: true, force: true });
    }
  }
  return { dryRun, removed: targets };
}
