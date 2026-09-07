import { execFileSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import path from "node:path";
import { AGENTS } from "./agents.js";
import { MCP_SERVER_NAME, MCP_SERVER_URL, setupAndAuthorizeMcp } from "./mcp-setup.js";
import { resolveHost } from "./plugins.js";
import {
  detectHost,
  hostPluginStatus,
  installHostPlugin,
  uninstallHostPlugin,
} from "./plugin-installer.js";
import { assertNoSymlinkComponents, atomicWriteFile } from "./safe-path.js";

const PROJECT_CONFIG = Object.freeze({
  cursor: {
    file: ".cursor/mcp.json",
    rootKey: "mcpServers",
    server: { url: MCP_SERVER_URL },
  },
  gemini: {
    file: ".gemini/settings.json",
    rootKey: "mcpServers",
    server: { httpUrl: MCP_SERVER_URL, authProviderType: "dynamic_discovery" },
  },
  antigravity: {
    file: ".agents/mcp_config.json",
    rootKey: "mcpServers",
    server: { serverUrl: MCP_SERVER_URL, transport: "http" },
  },
  copilot: {
    file: ".vscode/mcp.json",
    rootKey: "servers",
    server: { type: "http", url: MCP_SERVER_URL },
  },
});

function commandExists(command, run = execFileSync) {
  try {
    run(process.platform === "win32" ? "where" : "which", [command], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export function detectAgent(agent, { run = execFileSync } = {}) {
  if (agent.id === "generic") return true;
  return agent.executables.some((command) => commandExists(command, run));
}

export function agentRows({ run = execFileSync } = {}) {
  return Object.values(AGENTS).map((agent) => ({
    id: agent.id,
    displayName: agent.displayName,
    detected: detectAgent(agent, { run }),
    skills: ".agents/skills",
    mcp: agent.mcp,
  }));
}

function readJsonObject(file) {
  if (!existsSync(file)) return {};
  if (lstatSync(file).isSymbolicLink()) {
    throw new Error(`Refusing to update symbolic-link configuration: ${file}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`Cannot safely update malformed JSON configuration: ${file}`, { cause: error });
  }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error(`Expected a JSON object in ${file}`);
  }
  return parsed;
}

function writeJsonObject(cwd, file, value) {
  atomicWriteFile(cwd, file, `${JSON.stringify(value, null, 2)}\n`);
}

export function projectConfigPlan(agent, cwd) {
  const definition = PROJECT_CONFIG[agent.id];
  if (!definition) return null;
  return {
    ...definition,
    path: path.join(cwd, definition.file),
  };
}

export function configureProjectMcp(agent, cwd, { dryRun = false } = {}) {
  const plan = projectConfigPlan(agent, cwd);
  if (!plan) return { agent: agent.id, configured: false, managedFiles: [] };
  if (!dryRun) {
    assertNoSymlinkComponents(cwd, plan.path);
    const document = readJsonObject(plan.path);
    const existingServers = document[plan.rootKey];
    if (existingServers !== undefined && (!existingServers || Array.isArray(existingServers) || typeof existingServers !== "object")) {
      throw new Error(`Expected ${plan.rootKey} to be an object in ${plan.path}`);
    }
    document[plan.rootKey] = {
      ...(existingServers ?? {}),
      [MCP_SERVER_NAME]: plan.server,
    };
    writeJsonObject(cwd, plan.path, document);
  }
  return {
    agent: agent.id,
    configured: true,
    dryRun,
    managedFiles: [plan.file],
  };
}

export function removeProjectMcp(agent, cwd, { dryRun = false } = {}) {
  const plan = projectConfigPlan(agent, cwd);
  if (!plan || !existsSync(plan.path)) {
    return { agent: agent.id, removed: false, managedFiles: [] };
  }
  assertNoSymlinkComponents(cwd, plan.path);
  const document = readJsonObject(plan.path);
  const servers = document[plan.rootKey];
  if (!servers || typeof servers !== "object" || !(MCP_SERVER_NAME in servers)) {
    return { agent: agent.id, removed: false, managedFiles: [plan.file] };
  }
  if (!dryRun) {
    delete servers[MCP_SERVER_NAME];
    if (Object.keys(servers).length === 0) delete document[plan.rootKey];
    if (Object.keys(document).length === 0) rmSync(plan.path);
    else writeJsonObject(cwd, plan.path, document);
  }
  return { agent: agent.id, removed: true, dryRun, managedFiles: [plan.file] };
}

export function installAgentIntegration(
  agent,
  cwd,
  { dryRun = false, run = execFileSync, authorize = true } = {},
) {
  if (agent.plugin) {
    const plugin = resolveHost(agent.id);
    if (!plugin) throw new Error(`No verified plugin is registered for ${agent.displayName}.`);
    if (dryRun) {
      return { agent: agent.id, configured: true, dryRun, managedFiles: [], oauth: "host-owned" };
    }
    if (!detectHost(plugin, run)) {
      throw new Error(`${agent.displayName} is not installed or is not available on PATH.`);
    }
    if (!hostPluginStatus(plugin, { run }).installed) installHostPlugin(plugin, { run });
    const mcp = authorize
      ? setupAndAuthorizeMcp(plugin, { run })
      : { configured: true, authorized: false };
    return { agent: agent.id, ...mcp, managedFiles: [], oauth: "host-owned" };
  }

  const configured = configureProjectMcp(agent, cwd, { dryRun });
  if (agent.id === "copilot" && !dryRun && commandExists("copilot", run)) {
    try {
      run("copilot", ["mcp", "remove", MCP_SERVER_NAME], { stdio: "ignore" });
    } catch {
      // An absent prior entry is the desired starting state.
    }
    run(
      "copilot",
      ["mcp", "add", "--transport", "http", MCP_SERVER_NAME, MCP_SERVER_URL],
      { stdio: "inherit" },
    );
  }
  return { ...configured, oauth: agent.id === "generic" ? "not-configured" : "host-owned" };
}

export function removeAgentIntegration(agent, cwd, { dryRun = false, run = execFileSync } = {}) {
  if (agent.plugin) {
    const plugin = resolveHost(agent.id);
    if (!plugin || dryRun || !detectHost(plugin, run)) {
      return { agent: agent.id, removed: Boolean(plugin), dryRun, managedFiles: [] };
    }
    return { agent: agent.id, ...uninstallHostPlugin(plugin, { run }), managedFiles: [] };
  }
  const removed = removeProjectMcp(agent, cwd, { dryRun });
  if (agent.id === "copilot" && !dryRun && commandExists("copilot", run)) {
    try {
      run("copilot", ["mcp", "remove", MCP_SERVER_NAME], { stdio: "inherit" });
    } catch {
      // Removal is idempotent when the user-level server is absent.
    }
  }
  return removed;
}

export function agentNextSteps(agent) {
  if (agent.id === "copilot") {
    return [
      `In Copilot CLI, run /mcp auth ${MCP_SERVER_NAME} if it reports needs-auth.`,
      "GitHub cloud coding agents and code review receive skills only; MCP is intentionally not enabled there.",
    ];
  }
  if (agent.id === "gemini") return [`In Gemini CLI, run /mcp auth ${MCP_SERVER_NAME}.`];
  if (agent.id === "cursor") return ["Open Cursor MCP settings and connect the NamoID server to complete OAuth."];
  if (agent.id === "antigravity") return ["Open Antigravity's MCP panel and authorize NamoID when prompted."];
  if (agent.id === "generic") return ["Configure https://mcp.namoid.in in your agent if it supports remote MCP OAuth."];
  return [];
}
