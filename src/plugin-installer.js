import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, renameSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

export function pluginCachePath(plugin, home = homedir()) {
  return path.join(home, ".namoid", "plugins", plugin.host, plugin.releaseCommit);
}

export function hostInstallCommands(plugin, checkoutPath) {
  if (plugin.host === "codex") {
    return [
      ["codex", ["plugin", "marketplace", "add", checkoutPath]],
      ["codex", ["plugin", "add", `${plugin.pluginName}@namoid`]],
    ];
  }
  if (plugin.host === "claude") {
    return [
      ["claude", ["plugin", "marketplace", "add", checkoutPath, "--scope", "user"]],
      ["claude", ["plugin", "install", `${plugin.pluginName}@namoid`, "--scope", "user"]],
    ];
  }
  throw new Error(`Unsupported AI host: ${plugin.host}`);
}

export function installHostPlugin(plugin, {
  home = homedir(),
  run = execFileSync,
} = {}) {
  const checkoutPath = pluginCachePath(plugin, home);
  const temporaryPath = `${checkoutPath}.tmp-${process.pid}`;
  mkdirSync(path.dirname(checkoutPath), { recursive: true, mode: 0o700 });
  rmSync(temporaryPath, { recursive: true, force: true });

  try {
    run("git", ["clone", "--quiet", "--no-checkout", plugin.repository, temporaryPath]);
    run("git", ["-C", temporaryPath, "checkout", "--quiet", "--detach", plugin.releaseCommit]);
    const commit = run("git", ["-C", temporaryPath, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    if (commit !== plugin.releaseCommit) throw new Error("Plugin checkout did not match the pinned release commit");
    const archive = run("git", ["-C", temporaryPath, "archive", "--format=tar", "HEAD"], {
      encoding: null,
      maxBuffer: 32 * 1024 * 1024,
    });
    const digest = createHash("sha256").update(archive).digest("hex");
    if (digest !== plugin.archiveSha256) throw new Error("Plugin release failed SHA-256 verification");
    rmSync(checkoutPath, { recursive: true, force: true });
    mkdirSync(path.dirname(checkoutPath), { recursive: true, mode: 0o700 });
    renameSync(temporaryPath, checkoutPath);
    for (const [command, args] of hostInstallCommands(plugin, checkoutPath)) {
      run(command, args, { stdio: "inherit" });
    }
    return { checkoutPath, commit, digest };
  } catch (error) {
    rmSync(temporaryPath, { recursive: true, force: true });
    throw error;
  }
}
