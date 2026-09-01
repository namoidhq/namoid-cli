import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveHost } from "./plugins.js";

const SKILLS_ROOT = fileURLToPath(new URL("../skills", import.meta.url));

export const CUSTOMER_IDENTITY_SKILLS = Object.freeze([
  "setup-namoid",
  "diagnose-namoid",
  "verify-namoid",
  "implement-namoid-logout",
  "review-namoid-sessions",
  "prepare-namoid-production",
]);

function skillTargetRoot(host, home = homedir()) {
  if (host.host === "codex") return path.join(home, ".agents", "skills");
  if (host.host === "claude") return path.join(home, ".claude", "skills");
  throw new Error(`Unsupported AI host: ${host.host}`);
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

export function skillsStatus(hostName, { home = homedir() } = {}) {
  const host = resolveHost(hostName);
  if (!host) throw new Error(`Unsupported AI host: ${hostName}`);
  const root = skillTargetRoot(host, home);
  return {
    host: host.host,
    root,
    skills: validateBundledSkills().map(({ name }) => ({
      name,
      installed: existsSync(path.join(root, name, "SKILL.md")),
    })),
  };
}

export function installSkills(hostName, { home = homedir(), dryRun = false } = {}) {
  const host = resolveHost(hostName);
  if (!host) throw new Error(`Unsupported AI host: ${hostName}`);
  const root = skillTargetRoot(host, home);
  const bundled = validateBundledSkills();
  const steps = bundled.map(({ name, source }) => ({
    name,
    source,
    destination: path.join(root, name),
  }));
  if (!dryRun) {
    mkdirSync(root, { recursive: true, mode: 0o700 });
    for (const step of steps) {
      rmSync(step.destination, { recursive: true, force: true });
      cpSync(step.source, step.destination, { recursive: true });
    }
  }
  return { host: host.host, root, dryRun, skills: steps };
}

export function uninstallSkills(hostName, { home = homedir(), dryRun = false } = {}) {
  const status = skillsStatus(hostName, { home });
  const targets = status.skills.map(({ name }) => path.join(status.root, name));
  if (!dryRun) {
    for (const target of targets) rmSync(target, { recursive: true, force: true });
  }
  return { host: status.host, dryRun, removed: targets };
}
