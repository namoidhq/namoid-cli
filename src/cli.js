import process from "node:process";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import {
  agentNextSteps,
  agentRows,
  installAgentIntegration,
  removeAgentIntegration,
} from "./agent-config.js";
import { AGENTS, parseAgentSelection } from "./agents.js";
import { readIntegrationLock, removeAgentsFromLock, writeIntegrationLock } from "./integration-lock.js";
import { loadIntegrationRelease } from "./integration-manifest.js";
import { diagnoseProject, inspectProject } from "./project.js";
import { installSkills, skillsStatus, uninstallSkills } from "./skills.js";
import { CLI_VERSION } from "./version.js";

export function parseArgs(argv) {
  const flags = {
    json: false,
    dryRun: false,
    yes: false,
    offline: false,
    plain: false,
    cwd: process.cwd(),
    agents: [],
  };
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") flags.json = true;
    else if (arg === "--dry-run") flags.dryRun = true;
    else if (arg === "--yes" || arg === "-y") flags.yes = true;
    else if (arg === "--offline") flags.offline = true;
    else if (arg === "--plain") flags.plain = true;
    else if (arg === "--cwd" || arg === "--path") {
      index += 1;
      if (!argv[index]) throw new Error(`${arg} requires a directory`);
      flags.cwd = path.resolve(argv[index]);
    } else if (arg === "--agent") {
      index += 1;
      if (!argv[index]) throw new Error("--agent requires an agent name");
      flags.agents.push(argv[index]);
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    } else positional.push(arg);
  }
  return { command: positional[0] ?? "help", args: positional.slice(1), flags };
}

function jsonOutput(command, ok, result) {
  process.stdout.write(`${JSON.stringify({ schemaVersion: 1, command, ok, result }, null, 2)}\n`);
}

function printHelp() {
  process.stdout.write(`NamoID CLI ${CLI_VERSION}\n\n`);
  process.stdout.write("Usage: namoid <command> [options]\n\n");
  process.stdout.write("Commands:\n");
  process.stdout.write("  detect            Detect the local application and NamoID SDK\n");
  process.stdout.write("  doctor            Diagnose the local application and agent integration\n");
  process.stdout.write("  init              Install skills and connect detected AI agents\n");
  process.stdout.write("  agents <action>   List, install, update, or remove agent integrations\n");
  process.stdout.write("  setup [agent]     Alias for agents install\n");
  process.stdout.write("  skills <action>    Install, update, uninstall, list, or inspect skills\n");
  process.stdout.write("  extension <action> Compatibility alias for agent integrations\n");
  process.stdout.write("\nOptions:\n");
  process.stdout.write("  --path <directory>  Use another application directory\n");
  process.stdout.write("  --agent <name>      Select an agent; repeat or use comma-separated names\n");
  process.stdout.write("  --offline           Use the bundled verified integration release\n");
  process.stdout.write("  --json             Print versioned machine-readable output\n");
  process.stdout.write("  --dry-run          Preview actions without changing anything\n");
  process.stdout.write("  --yes, -y          Skip mutation confirmation\n");
  process.stdout.write("  --plain            Disable decorative output\n");
}

async function confirmMutation(message, flags) {
  if (flags.yes) return true;
  const output = flags.json ? process.stderr : process.stdout;
  if (!process.stdin.isTTY || !output.isTTY) throw new Error(`${message} Re-run with --yes in a non-interactive environment.`);
  const terminal = createInterface({ input: process.stdin, output });
  try {
    const answer = await terminal.question(`${message} [y/N] `);
    return /^(y|yes)$/i.test(answer.trim());
  } finally {
    terminal.close();
  }
}

function printDetection(project) {
  process.stdout.write(`Application: ${project.packageName ?? "unknown"}\n`);
  process.stdout.write(`Framework: ${project.framework}\n`);
  process.stdout.write(`Package manager: ${project.packageManager ?? "not found"}\n`);
  process.stdout.write(`NamoID SDK: ${project.sdkPackages.map((item) => `${item.name} ${item.version}`).join(", ") || "not found"}\n`);
  process.stdout.write(`Callback route: ${project.callbackCandidates[0] ?? "not found"}\n`);
}

export function hasDetectedApplication(project) {
  return Boolean(project.packageJson || project.pythonManifest);
}

export function projectDirectoryGuidance() {
  return [
    "",
    "Continue from your application directory:",
    "  cd /path/to/your-application",
    "  npx @namoidhq/cli init",
    "",
    "The CLI will detect your framework and provide the correct SDK, callback, and configuration steps.",
    "",
  ].join("\n");
}

function printProjectDirectoryGuidance(output = process.stdout) {
  output.write(projectDirectoryGuidance());
}

function printDoctor(result) {
  for (const item of result.checks) {
    const marker = item.status === "pass" ? "✓" : item.status === "warn" ? "!" : "✗";
    process.stdout.write(`${marker} ${item.message}\n`);
    if (item.remediation && item.status !== "pass") process.stdout.write(`  ${item.remediation}\n`);
  }
  process.stdout.write(`\n${result.summary.passed} passed, ${result.summary.warnings} warnings, ${result.summary.failed} failed\n`);
  if (result.guidance) {
    process.stdout.write(`\nRecommended integration: ${result.guidance.package}\n`);
    process.stdout.write(`Callback: ${result.guidance.callback}\n`);
    process.stdout.write(`Session: ${result.guidance.session}\n`);
    result.guidance.flow.forEach((step, index) => process.stdout.write(`  ${index + 1}. ${step}\n`));
  }
}

async function selectAgents(flags, rows) {
  if (flags.agents.length) return parseAgentSelection(flags.agents);
  const detected = rows.filter((row) => row.detected && row.id !== "generic");
  if (!detected.length) return [AGENTS.generic];
  const output = flags.json ? process.stderr : process.stdout;
  if (flags.yes || !process.stdin.isTTY || !output.isTTY) {
    return detected.map((row) => AGENTS[row.id]);
  }
  output.write("\nDetected AI agents:\n");
  detected.forEach((row, index) => output.write(`  ${index + 1}. ${row.displayName}\n`));
  const terminal = createInterface({ input: process.stdin, output });
  try {
    const answer = await terminal.question("Select agents (comma-separated numbers) [all]: ");
    if (!answer.trim()) return detected.map((row) => AGENTS[row.id]);
    const indexes = answer.split(",").map((item) => Number(item.trim()) - 1);
    if (indexes.some((index) => !Number.isInteger(index) || !detected[index])) {
      throw new Error(`Choose numbers from 1 to ${detected.length}.`);
    }
    return [...new Map(indexes.map((index) => [detected[index].id, AGENTS[detected[index].id]])).values()];
  } finally {
    terminal.close();
  }
}

async function installAgents(agents, flags, { action = "install" } = {}) {
  const previous = readIntegrationLock(flags.cwd);
  const release = await loadIntegrationRelease({
    offline: flags.offline,
    installedVersion: previous?.integrationVersion ?? null,
  });
  const manifest = release.manifest;
  const skills = installSkills({ cwd: flags.cwd, dryRun: flags.dryRun, release });
  const results = agents.map((agent) =>
    installAgentIntegration(agent, flags.cwd, { dryRun: flags.dryRun }),
  );
  const lock = writeIntegrationLock(flags.cwd, {
    integrationVersion: manifest.version,
    integrationSource: release.source,
    bundleSha256: release.bundleSha256 ?? null,
    skills: manifest.skills,
    agentResults: results,
    dryRun: flags.dryRun,
  });
  return {
    action,
    manifestVersion: manifest.version,
    manifestSource: release.source,
    warning: release.warning,
    agents: results,
    skills,
    lock,
  };
}

async function runAgentLifecycle(action, names, flags) {
  const rows = agentRows();
  if (!action || action === "list" || action === "status") {
    const lock = readIntegrationLock(flags.cwd);
    const result = rows.map((row) => ({ ...row, installed: Boolean(lock?.agents?.[row.id]) }));
    if (flags.json) jsonOutput("agents.list", true, result);
    else result.forEach((row) => process.stdout.write(`${row.displayName}: ${row.detected ? "detected" : "not detected"}${row.installed ? ", configured" : ""}\n`));
    return;
  }
  if (!["install", "update", "remove", "uninstall"].includes(action)) {
    throw new Error("Agents action must be install, update, remove, list, or status.");
  }
  const agents = names.length ? parseAgentSelection(names) : await selectAgents(flags, rows);
  const project = await inspectProject(flags.cwd);
  if (!hasDetectedApplication(project)) {
    throw new Error(`No supported application was detected.${projectDirectoryGuidance()}`);
  }
  const removing = action === "remove" || action === "uninstall";
  if (!flags.dryRun) {
    const approved = await confirmMutation(
      `${removing ? "Remove" : "Configure"} NamoID for ${agents.map((agent) => agent.displayName).join(", ")}?`,
      flags,
    );
    if (!approved) return;
  }
  let result;
  if (removing) {
    const integrations = agents.map((agent) =>
      removeAgentIntegration(agent, flags.cwd, { dryRun: flags.dryRun }),
    );
    const lock = removeAgentsFromLock(flags.cwd, agents.map((agent) => agent.id), { dryRun: flags.dryRun });
    if (!lock.lock || Object.keys(lock.lock.agents).length === 0) {
      uninstallSkills({ cwd: flags.cwd, dryRun: flags.dryRun });
    }
    result = { action: "remove", agents: integrations, lock };
  } else {
    result = await installAgents(agents, flags, { action });
  }
  if (flags.json) jsonOutput(`agents.${action}`, true, result);
  else process.stdout.write(`NamoID agent ${action} completed.\n`);
}

async function runProjectSkills(action, flags) {
  if (!action || action === "list" || action === "status") {
    const result = skillsStatus({ cwd: flags.cwd });
    if (flags.json) jsonOutput("skills.list", true, result);
    else result.skills.forEach((skill) => process.stdout.write(`${skill.name}: ${skill.installed ? "installed" : "available"}\n`));
    return;
  }
  if (!["install", "update", "remove", "uninstall"].includes(action)) {
    throw new Error("Skills action must be install, update, remove, list, or status.");
  }
  const removing = action === "remove" || action === "uninstall";
  if (!flags.dryRun) {
    const approved = await confirmMutation(`${removing ? "Remove" : "Install"} project-local NamoID skills?`, flags);
    if (!approved) return;
  }
  const result = removing
    ? uninstallSkills({ cwd: flags.cwd, dryRun: flags.dryRun })
    : installSkills({
        cwd: flags.cwd,
        dryRun: flags.dryRun,
        release: await loadIntegrationRelease({
          offline: flags.offline,
          installedVersion: readIntegrationLock(flags.cwd)?.integrationVersion ?? null,
        }),
      });
  if (flags.json) jsonOutput(`skills.${action}`, true, result);
  else process.stdout.write(`Project-local NamoID skills ${action} completed.\n`);
}

export async function run(argv) {
  const { command, args, flags } = parseArgs(argv);
  if (command === "help" || command === "--help" || command === "-h") return printHelp();
  if (command === "--version" || command === "-v" || command === "version") {
    process.stdout.write(`${CLI_VERSION}\n`);
    return;
  }
  if (["login", "logout", "whoami"].includes(command)) {
    throw new Error("The NamoID CLI is credential-free. Authenticate through your AI agent's NamoID MCP connection instead.");
  }
  if (command === "agents" || command === "agent") {
    await runAgentLifecycle(args[0], [...args.slice(1), ...flags.agents], flags);
    return;
  }
  if (["plugin", "extension", "ext", "setup"].includes(command)) {
    const action = command === "setup" ? "install" : args[0];
    const names = command === "setup" ? [...args, ...flags.agents] : [...args.slice(1), ...flags.agents];
    await runAgentLifecycle(action, names, flags);
    return;
  }
  if (command === "skills" || command === "skill") {
    await runProjectSkills(args[0], flags);
    return;
  }

  const project = await inspectProject(flags.cwd);
  if (command === "detect") {
    if (flags.json) jsonOutput(command, true, project);
    else printDetection(project);
    return;
  }
  if (command === "doctor") {
    const diagnosis = diagnoseProject(project);
    const agentState = { lock: readIntegrationLock(flags.cwd), skills: skillsStatus({ cwd: flags.cwd }) };
    const ok = diagnosis.summary.failed === 0 && Boolean(agentState.lock);
    if (flags.json) jsonOutput(command, ok, { application: diagnosis, agents: agentState });
    else {
      printDoctor(diagnosis);
      process.stdout.write(`${agentState.lock ? "✓" : "!"} Agent integration lockfile ${agentState.lock ? "found" : "not found"}\n`);
      process.stdout.write(`${agentState.skills.skills.every((skill) => skill.installed) ? "✓" : "!"} Project-local NamoID skills\n`);
    }
    if (!ok) process.exitCode = 1;
    return;
  }
  if (command === "init") {
    if (!hasDetectedApplication(project)) {
      if (!flags.json) printDetection(project);
      throw new Error(`No supported application was detected.${projectDirectoryGuidance()}`);
    }
    const agents = await selectAgents(flags, agentRows());
    if (!flags.json) {
      printDetection(project);
      process.stdout.write(`\nSelected agents: ${agents.map((agent) => agent.displayName).join(", ")}\n`);
    }
    if (!flags.dryRun) {
      const approved = await confirmMutation(
        `Install NamoID Customer Identity for ${agents.map((agent) => agent.displayName).join(", ")}?`,
        flags,
      );
      if (!approved) return;
    }
    const result = await installAgents(agents, flags);
    if (flags.json) jsonOutput(command, true, result);
    else if (flags.dryRun) {
      process.stdout.write("\nDry run — no files, plugins, MCP configuration, or credentials changed.\n");
    } else {
      if (result.warning) process.stderr.write(`Note: ${result.warning} Using bundled verified integrations.\n`);
      process.stdout.write("\nNamoID Customer Identity agent setup is ready.\n");
      for (const agent of agents) {
        for (const step of agentNextSteps(agent)) process.stdout.write(`- ${agent.displayName}: ${step}\n`);
      }
      process.stdout.write("\nNext, ask your agent: Set up NamoID customer identity for this project.\n");
      process.stdout.write("Your agent will open NamoID OAuth; the CLI never receives or stores the resulting credentials.\n");
    }
    return;
  }
  throw new Error(`Unknown command: ${command}`);
}
