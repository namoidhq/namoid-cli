import process from "node:process";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { diagnoseProject, inspectProject } from "./project.js";
import { buildOnboardingPlan } from "./planner.js";
import { HOST_PLUGINS, pluginPlan, resolveHost } from "./plugins.js";
import { detectHost, hostPluginStatus, installHostPlugin, uninstallHostPlugin, updateHostPlugin } from "./plugin-installer.js";

const VERSION = "0.1.0";

function parseArgs(argv) {
  const flags = { json: false, dryRun: false, yes: false, plain: false, cwd: process.cwd() };
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") flags.json = true;
    else if (arg === "--dry-run") flags.dryRun = true;
    else if (arg === "--yes" || arg === "-y") flags.yes = true;
    else if (arg === "--plain") flags.plain = true;
    else if (arg === "--cwd") {
      index += 1;
      if (!argv[index]) throw new Error("--cwd requires a directory");
      flags.cwd = path.resolve(argv[index]);
    } else positional.push(arg);
  }
  return { command: positional[0] ?? "help", args: positional.slice(1), flags };
}

function jsonOutput(command, ok, result) {
  process.stdout.write(`${JSON.stringify({ schemaVersion: 1, command, ok, result }, null, 2)}\n`);
}

function printHelp() {
  process.stdout.write(`NamoID CLI ${VERSION}\n\n`);
  process.stdout.write("Usage: namoid <command> [options]\n\n");
  process.stdout.write("Commands:\n");
  process.stdout.write("  detect            Detect the local application and NamoID SDK\n");
  process.stdout.write("  doctor            Diagnose the local NamoID integration\n");
  process.stdout.write("  init --dry-run     Preview the onboarding plan without making changes\n");
  process.stdout.write("  setup [host]       Detect hosts or install a verified plugin\n");
  process.stdout.write("  plugin <action>    Install, update, uninstall, list, or inspect status\n");
  process.stdout.write("\nOptions:\n");
  process.stdout.write("  --cwd <directory>  Inspect another application directory\n");
  process.stdout.write("  --json             Print versioned machine-readable output\n");
  process.stdout.write("  --dry-run          Preview actions without changing anything\n");
  process.stdout.write("  --yes, -y          Skip mutation confirmation\n");
  process.stdout.write("  --plain            Disable decorative output\n");
}

async function confirmMutation(message, flags) {
  if (flags.yes) return true;
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error(`${message} Re-run with --yes in a non-interactive environment.`);
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await terminal.question(`${message} [y/N] `);
    return /^(y|yes)$/i.test(answer.trim());
  } finally {
    terminal.close();
  }
}

function hostRows() {
  return Object.values(HOST_PLUGINS).map((plugin) => ({ ...hostPluginStatus(plugin), displayName: plugin.displayName, aliases: plugin.aliases }));
}

async function runPluginLifecycle(action, host, flags) {
  if (action === "list" || action === "status") {
    const rows = host ? [hostPluginStatus(resolveHost(host) ?? pluginPlan(host))] : hostRows();
    if (flags.json) jsonOutput(`plugin.${action}`, true, rows);
    else rows.forEach((row) => process.stdout.write(`${row.displayName ?? row.host}: ${row.detected ? (row.installed ? "installed" : "available") : "not detected"}\n`));
    return;
  }
  const plan = pluginPlan(host);
  if (flags.dryRun) {
    if (flags.json) jsonOutput(`plugin.${action}`, true, { ...plan, dryRun: true });
    else process.stdout.write(`Would ${action} ${plan.displayName} plugin ${plan.releaseTag}.\n`);
    return;
  }
  if (!detectHost(plan)) throw new Error(`${plan.displayName} is not installed or not available on PATH.`);
  const current = hostPluginStatus(plan);
  if (action === "install" && current.installed) {
    const result = { ...current, unchanged: true };
    if (flags.json) jsonOutput("plugin.install", true, result);
    else process.stdout.write(`${plan.displayName} plugin is already installed.\n`);
    return;
  }
  if ((action === "update" || action === "uninstall") && !current.installed) {
    throw new Error(`${plan.displayName} plugin is not installed. Run \`namoid plugin install ${plan.host}\` first.`);
  }
  const approved = await confirmMutation(`${action[0].toUpperCase()}${action.slice(1)} the ${plan.displayName} plugin?`, flags);
  if (!approved) return;
  let result;
  if (action === "install") result = installHostPlugin(plan);
  else if (action === "update") result = updateHostPlugin(plan);
  else if (action === "uninstall") result = uninstallHostPlugin(plan);
  else throw new Error("Plugin action must be install, update, uninstall, list, or status.");
  if (flags.json) jsonOutput(`plugin.${action}`, true, result);
  else process.stdout.write(`${plan.displayName} plugin ${action} completed.\n`);
}

function printDetection(project) {
  process.stdout.write(`Application: ${project.packageName ?? "unknown"}\n`);
  process.stdout.write(`Framework: ${project.framework}\n`);
  process.stdout.write(`Package manager: ${project.packageManager ?? "not found"}\n`);
  process.stdout.write(`NamoID SDK: ${project.sdkPackages.map((item) => `${item.name} ${item.version}`).join(", ") || "not found"}\n`);
  process.stdout.write(`Callback route: ${project.callbackCandidates[0] ?? "not found"}\n`);
}

function printDoctor(result) {
  for (const item of result.checks) {
    const marker = item.status === "pass" ? "✓" : item.status === "warn" ? "!" : "✗";
    process.stdout.write(`${marker} ${item.message}\n`);
    if (item.remediation && item.status !== "pass") process.stdout.write(`  ${item.remediation}\n`);
  }
  process.stdout.write(`\n${result.summary.passed} passed, ${result.summary.warnings} warnings, ${result.summary.failed} failed\n`);
}

export async function run(argv) {
  const { command, args, flags } = parseArgs(argv);
  if (command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }
  if (command === "--version" || command === "-v" || command === "version") {
    process.stdout.write(`${VERSION}\n`);
    return;
  }

  if (command === "ai") {
    const action = args[0];
    const host = args[1];
    if (action !== "setup" || !host) {
      throw new Error("Usage: namoid ai setup <codex|claude> --dry-run");
    }
    await runPluginLifecycle("install", host, flags);
    return;
  }

  if (command === "plugin") {
    await runPluginLifecycle(args[0], args[1], flags);
    return;
  }

  if (command === "setup") {
    const host = args[0];
    if (host) {
      await runPluginLifecycle("install", host, flags);
      return;
    }
    const rows = hostRows();
    if (flags.json) jsonOutput("setup", true, rows);
    else {
      process.stdout.write("Detected AI hosts:\n");
      rows.forEach((row) => process.stdout.write(`- ${row.displayName}: ${row.detected ? "detected" : "not detected"}\n`));
      process.stdout.write("Run `namoid setup <codex|claude>` to install one verified plugin.\n");
    }
    return;
  }

  const project = await inspectProject(flags.cwd);
  if (command === "detect") {
    if (flags.json) jsonOutput(command, true, project);
    else printDetection(project);
    return;
  }
  if (command === "doctor") {
    const result = diagnoseProject(project);
    const ok = result.summary.failed === 0;
    if (flags.json) jsonOutput(command, ok, result);
    else printDoctor(result);
    if (!ok) process.exitCode = 1;
    return;
  }
  if (command === "init") {
    if (!flags.dryRun) {
      const result = { code: "authentication_required", message: "Authenticated onboarding is not enabled in this foundation release. Run with --dry-run to preview it." };
      if (flags.json) jsonOutput(command, false, result);
      else process.stderr.write(`${result.message}\n`);
      process.exitCode = 2;
      return;
    }
    const diagnosis = diagnoseProject(project);
    const result = buildOnboardingPlan(project, diagnosis);
    if (flags.json) jsonOutput(command, true, result);
    else {
      printDetection(project);
      process.stdout.write("\nDry run — no files or NamoID configuration will change.\n");
      result.actions.forEach((item, index) => process.stdout.write(`${index + 1}. ${item.description}\n`));
    }
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}
