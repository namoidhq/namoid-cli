import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
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

export function hostUninstallCommands(plugin) {
  const selector = `${plugin.pluginName}@namoid`;
  if (plugin.host === "codex") return [
    ["codex", ["plugin", "remove", selector]],
    ["codex", ["plugin", "marketplace", "remove", "namoid"]],
  ];
  if (plugin.host === "claude") return [
    ["claude", ["plugin", "uninstall", selector, "--scope", "user"]],
    ["claude", ["plugin", "marketplace", "remove", "namoid", "--scope", "user"]],
  ];
  throw new Error(`Unsupported AI host: ${plugin.host}`);
}

export function detectHost(plugin, run = execFileSync) {
  try {
    run(process.platform === "win32" ? "where" : "which", [plugin.executable], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export function hostPluginStatus(plugin, { home = homedir(), run = execFileSync } = {}) {
  const detected = detectHost(plugin, run);
  if (!detected) return { host: plugin.host, detected: false, installed: false, version: plugin.version };
  try {
    const output = run(plugin.executable, ["plugin", "list", "--json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const installed = JSON.stringify(JSON.parse(output)).includes(plugin.pluginName);
    return { host: plugin.host, detected: true, installed, version: plugin.version, cached: existsSync(pluginCachePath(plugin, home)) };
  } catch {
    return { host: plugin.host, detected: true, installed: false, version: plugin.version, cached: existsSync(pluginCachePath(plugin, home)), status: "unknown" };
  }
}

export function preparePluginCheckout(plugin, {
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
    return { checkoutPath, commit, digest };
  } catch (error) {
    rmSync(temporaryPath, { recursive: true, force: true });
    throw error;
  }
}

export function installPreparedPlugin(plugin, prepared, { run = execFileSync } = {}) {
  for (const [command, args] of hostInstallCommands(plugin, prepared.checkoutPath)) {
    run(command, args, { stdio: "inherit" });
  }
  return prepared;
}

export function installHostPlugin(plugin, options = {}) {
  const prepared = preparePluginCheckout(plugin, options);
  return installPreparedPlugin(plugin, prepared, options);
}

export function uninstallHostPlugin(plugin, { home = homedir(), run = execFileSync } = {}) {
  for (const [command, args] of hostUninstallCommands(plugin)) run(command, args, { stdio: "inherit" });
  rmSync(path.join(home, ".namoid", "plugins", plugin.host), { recursive: true, force: true });
  return { host: plugin.host, removed: true };
}

export function updateHostPlugin(plugin, options = {}) {
  const prepared = preparePluginCheckout(plugin, options);
  uninstallHostPlugin(plugin, options);
  return installPreparedPlugin(plugin, prepared, options);
}
