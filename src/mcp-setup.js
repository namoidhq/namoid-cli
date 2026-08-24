import { execFileSync } from "node:child_process";
import { detectHost } from "./plugin-installer.js";
import { HOST_PLUGINS, resolveHost } from "./plugins.js";

export const MCP_SERVER_NAME = "namoid-setup-assistant";
export const MCP_SERVER_URL = "https://mcp.namoid.in";
const MCP_SCOPES = "setup.identity.read,setup.identity.write,setup.agent_auth.read";

function runText(run, command, args) {
  return String(run(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
}

export function detectPreferredMcpHost({ requested = "auto", env = process.env, run = execFileSync } = {}) {
  if (requested === "none") return null;
  if (requested !== "auto") {
    const selected = resolveHost(requested);
    if (!selected) throw new Error("--mcp-host must be auto, codex, claude, or none.");
    if (!detectHost(selected, run)) throw new Error(`${selected.displayName} was selected but is not available on PATH.`);
    return selected;
  }
  const available = Object.values(HOST_PLUGINS).filter((host) => detectHost(host, run));
  if (!available.length) return null;
  if (env.CLAUDECODE || env.CLAUDE_CODE_ENTRYPOINT) {
    return available.find((host) => host.host === "claude") ?? available[0];
  }
  if (env.CODEX_HOME || env.CODEX_CLI_PATH) {
    return available.find((host) => host.host === "codex") ?? available[0];
  }
  return available.find((host) => host.host === "codex") ?? available[0];
}

export function mcpServerStatus(host, { run = execFileSync } = {}) {
  try {
    if (host.host === "codex") {
      const value = JSON.parse(runText(run, "codex", ["mcp", "get", MCP_SERVER_NAME, "--json"]));
      return { exists: true, url: value?.transport?.url ?? null };
    }
    const output = runText(run, "claude", ["mcp", "get", MCP_SERVER_NAME]);
    const match = output.match(/https?:\/\/[^\s]+/);
    return { exists: true, url: match?.[0]?.replace(/[),.;]+$/, "") ?? null };
  } catch {
    return { exists: false, url: null };
  }
}

function ignoreFailure(run, command, args) {
  try {
    run(command, args, { stdio: "ignore" });
  } catch {
    // Missing credentials or configuration are already the desired state.
  }
}

export function setupAndAuthorizeMcp(host, { run = execFileSync, stdio = "inherit" } = {}) {
  const current = mcpServerStatus(host, { run });
  const needsConfiguration = !current.exists || current.url !== MCP_SERVER_URL;
  if (needsConfiguration && current.exists) {
    ignoreFailure(run, host.executable, ["mcp", "logout", MCP_SERVER_NAME]);
    run(host.executable, ["mcp", "remove", MCP_SERVER_NAME], { stdio });
  }
  if (needsConfiguration) {
    const args = host.host === "codex"
      ? ["mcp", "add", MCP_SERVER_NAME, "--url", MCP_SERVER_URL]
      : ["mcp", "add", "--transport", "http", "--scope", "user", MCP_SERVER_NAME, MCP_SERVER_URL];
    run(host.executable, args, { stdio });
  }
  const loginArgs = host.host === "codex"
    ? ["mcp", "login", MCP_SERVER_NAME, "--scopes", MCP_SCOPES]
    : ["mcp", "login", MCP_SERVER_NAME];
  run(host.executable, loginArgs, { stdio });
  return { host: host.host, server: MCP_SERVER_NAME, url: MCP_SERVER_URL, configured: true, authorized: true };
}
