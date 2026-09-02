import { execFileSync } from "node:child_process";

export function hostInstallCommands(plugin) {
  if (plugin.host === "codex") {
    return [
      ["codex", ["plugin", "marketplace", "add", plugin.marketplaceSource]],
      ["codex", ["plugin", "add", `${plugin.pluginName}@namoid`]],
    ];
  }
  if (plugin.host === "claude") {
    return [
      ["claude", ["plugin", "marketplace", "add", plugin.marketplaceSource, "--scope", "user"]],
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

export function hostPluginStatus(plugin, { run = execFileSync } = {}) {
  const detected = detectHost(plugin, run);
  if (!detected) return { host: plugin.host, detected: false, installed: false };
  try {
    const output = run(plugin.executable, ["plugin", "list", "--json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const status = JSON.stringify(JSON.parse(output));
    const installed = status.includes(plugin.pluginName);
    return { host: plugin.host, detected: true, installed };
  } catch {
    return { host: plugin.host, detected: true, installed: false, status: "unknown" };
  }
}

export function installHostPlugin(plugin, { run = execFileSync } = {}) {
  for (const [command, args] of hostInstallCommands(plugin)) run(command, args, { stdio: "inherit" });
  return { host: plugin.host, installed: true, updateStrategy: "host-marketplace" };
}

export function uninstallHostPlugin(plugin, { run = execFileSync } = {}) {
  for (const [command, args] of hostUninstallCommands(plugin)) {
    try {
      run(command, args, { stdio: "inherit" });
    } catch {
      // Uninstall remains idempotent when the plugin or marketplace is absent.
    }
  }
  return { host: plugin.host, removed: true };
}

export function updateHostPlugin(plugin, options = {}) {
  uninstallHostPlugin(plugin, options);
  return installHostPlugin(plugin, options);
}
