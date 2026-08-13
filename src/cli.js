import process from "node:process";
import path from "node:path";
import { diagnoseProject, inspectProject } from "./project.js";
import { buildOnboardingPlan } from "./planner.js";
import { pluginPlan } from "./plugins.js";

const VERSION = "0.1.0";

function parseArgs(argv) {
  const flags = { json: false, dryRun: false, cwd: process.cwd() };
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") flags.json = true;
    else if (arg === "--dry-run") flags.dryRun = true;
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
  process.stdout.write("  ai setup <host> --dry-run  Preview Codex or Claude plugin setup\n");
  process.stdout.write("\nOptions:\n");
  process.stdout.write("  --cwd <directory>  Inspect another application directory\n");
  process.stdout.write("  --json             Print versioned machine-readable output\n");
  process.stdout.write("  --dry-run          Preview actions without changing anything\n");
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
    const result = pluginPlan(host);
    if (!flags.dryRun) {
      const unavailable = {
        code: "pinned_release_required",
        message: "Plugin installation stays disabled until the repository has a signed, immutable release and published SHA-256 digest. Run with --dry-run to inspect the plan.",
      };
      if (flags.json) jsonOutput("ai.setup", false, unavailable);
      else process.stderr.write(`${unavailable.message}\n`);
      process.exitCode = 2;
      return;
    }
    if (flags.json) jsonOutput("ai.setup", true, result);
    else {
      process.stdout.write(`${result.displayName} plugin ${result.releaseTag}\n`);
      process.stdout.write("Dry run — no marketplace or host configuration will change.\n");
      result.actions.forEach((item, index) => process.stdout.write(`${index + 1}. ${item.description}\n`));
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
