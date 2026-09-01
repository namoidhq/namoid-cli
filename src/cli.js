import process from "node:process";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { applicationSetupResult } from "./application-result.js";
import { createApplication } from "./api.js";
import { cliConfig } from "./config.js";
import { accessToken, login, logout, userInfo } from "./oauth.js";
import { detectPreferredMcpHost, setupAndAuthorizeMcp } from "./mcp-setup.js";
import { diagnoseProject, inspectProject } from "./project.js";
import { buildOnboardingPlan } from "./planner.js";
import { detectApplicationSetup } from "./setup-detection.js";
import { resolveInitTarget } from "./target.js";
import { HOST_PLUGINS, pluginPlan, resolveHost } from "./plugins.js";
import { detectHost, hostPluginStatus, installHostPlugin, uninstallHostPlugin, updateHostPlugin } from "./plugin-installer.js";
import { installSkills, skillsStatus, uninstallSkills } from "./skills.js";
import { CLI_VERSION } from "./version.js";

function parseArgs(argv) {
  const flags = {
    json: false,
    dryRun: false,
    yes: false,
    plain: false,
    cwd: process.cwd(),
    tenant: null,
    project: null,
    environment: null,
    issuer: null,
    apiBase: null,
    clientId: null,
    name: null,
    applicationType: null,
    redirectUri: null,
    postLogoutRedirectUri: null,
    mcpHost: "none",
  };
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
    } else if (["--tenant", "--project", "--environment", "--issuer", "--api-base", "--client-id", "--name", "--type", "--redirect-uri", "--post-logout-redirect-uri", "--mcp-host"].includes(arg)) {
      index += 1;
      if (!argv[index]) throw new Error(`${arg} requires a value`);
      const key = arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      if (key === "type") flags.applicationType = argv[index];
      else flags[key] = argv[index];
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
  process.stdout.write("  login             Sign in securely in the system browser\n");
  process.stdout.write("  logout            Revoke the CLI session and remove local tokens\n");
  process.stdout.write("  whoami            Show the signed-in NamoID account\n");
  process.stdout.write("  detect            Detect the local application and NamoID SDK\n");
  process.stdout.write("  doctor            Diagnose the local NamoID integration\n");
  process.stdout.write("  init              Select or create a workspace and configure your application\n");
  process.stdout.write("  setup [host]       Install Customer Identity skills and a verified extension\n");
  process.stdout.write("  skills <action>    Install, update, uninstall, list, or inspect skills\n");
  process.stdout.write("  extension <action> Manage verified Codex and Claude extensions\n");
  process.stdout.write("\nOptions:\n");
  process.stdout.write("  --cwd <directory>  Inspect another application directory\n");
  process.stdout.write("  --tenant <id>      Optional workspace override for automation\n");
  process.stdout.write("  --project <id>     Optional project override for automation\n");
  process.stdout.write("  --environment <id> Optional environment override for automation\n");
  process.stdout.write("  --name <name>       Application name (defaults to package name)\n");
  process.stdout.write("  --type <type>       Application type: web, spa, or native\n");
  process.stdout.write("  --redirect-uri <url> Exact application OAuth callback URL\n");
  process.stdout.write("  --issuer <url>      Override the NamoID OAuth issuer\n");
  process.stdout.write("  --api-base <url>    Override the NamoID management API\n");
  process.stdout.write("  --mcp-host <host>   Optional Setup Assistant host: codex, claude, or none\n");
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

function createInteractivePrompt(flags) {
  const output = flags.json ? process.stderr : process.stdout;

  function requireTerminal() {
    if (!process.stdin.isTTY || !output.isTTY) {
      throw new Error(
        "Workspace selection requires an interactive terminal. For automation, provide --tenant, --project, and --environment.",
      );
    }
  }

  return {
    async select(message, choices) {
      requireTerminal();
      output.write(`\n${message}:\n`);
      choices.forEach((choice, index) => output.write(`  ${index + 1}. ${choice.label}\n`));
      const terminal = createInterface({ input: process.stdin, output });
      try {
        while (true) {
          const answer = await terminal.question("Choose an option [1]: ");
          const selectedIndex = answer.trim() === "" ? 0 : Number(answer.trim()) - 1;
          if (Number.isInteger(selectedIndex) && choices[selectedIndex]) {
            return choices[selectedIndex].value;
          }
          output.write(`Enter a number from 1 to ${choices.length}.\n`);
        }
      } finally {
        terminal.close();
      }
    },
    async text(message, defaultValue) {
      requireTerminal();
      const terminal = createInterface({ input: process.stdin, output });
      try {
        const answer = await terminal.question(`${message}${defaultValue ? ` [${defaultValue}]` : ""}: `);
        const value = answer.trim() || defaultValue;
        if (!value?.trim()) throw new Error(`${message} is required.`);
        if (value.length > 256) throw new Error(`${message} must be 256 characters or fewer.`);
        return value.trim();
      } finally {
        terminal.close();
      }
    },
    note(message) {
      if (!flags.json) output.write(`${message}\n`);
    },
  };
}

async function resolvePublicApplicationName(detected, flags) {
  if (flags.name) return detected;
  if (!process.stdin.isTTY || (!process.stdout.isTTY && !flags.json)) {
    throw new Error(
      "--name is required in a non-interactive run because the Application name is shown publicly.",
    );
  }
  const output = flags.json ? process.stderr : process.stdout;
  const terminal = createInterface({ input: process.stdin, output });
  try {
    const answer = await terminal.question(
      `Application name (shown publicly on sign-in and consent screens) [${detected.name}]: `,
    );
    const name = answer.trim() || detected.name;
    if (name.length > 256) throw new Error("Application name must be 256 characters or fewer.");
    return { ...detected, name };
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

function skillRows(host) {
  const hosts = host ? [resolveHost(host)] : Object.values(HOST_PLUGINS);
  if (hosts.some((item) => !item)) throw new Error(`Unsupported AI host: ${host}`);
  return hosts.map((item) => skillsStatus(item.host));
}

async function runSkillsLifecycle(action, host, flags) {
  if (action === "list" || action === "status") {
    const rows = skillRows(host);
    if (flags.json) jsonOutput(`skills.${action}`, true, rows);
    else {
      for (const row of rows) {
        process.stdout.write(`${HOST_PLUGINS[row.host].displayName}:\n`);
        for (const skill of row.skills) {
          process.stdout.write(`- ${skill.name}: ${skill.installed ? "installed" : "available"}\n`);
        }
      }
    }
    return;
  }
  const plugin = resolveHost(host);
  if (!plugin) {
    throw new Error("Usage: namoid skills <install|update|uninstall> <codex|claude>");
  }
  if (flags.dryRun) {
    const result = action === "uninstall"
      ? uninstallSkills(plugin.host, { dryRun: true })
      : installSkills(plugin.host, { dryRun: true });
    if (flags.json) jsonOutput(`skills.${action}`, true, result);
    else result[action === "uninstall" ? "removed" : "skills"].forEach((item) => {
      const target = typeof item === "string" ? item : item.destination;
      process.stdout.write(`Would ${action} ${target}.\n`);
    });
    return;
  }
  const approved = await confirmMutation(
    `${action[0].toUpperCase()}${action.slice(1)} NamoID Customer Identity skills for ${plugin.displayName}?`,
    flags,
  );
  if (!approved) return;
  const result = action === "uninstall"
    ? uninstallSkills(plugin.host)
    : action === "install" || action === "update"
      ? installSkills(plugin.host)
      : null;
  if (!result) throw new Error("Skills action must be install, update, uninstall, list, or status.");
  if (flags.json) jsonOutput(`skills.${action}`, true, result);
  else process.stdout.write(`Customer Identity skills ${action} completed for ${plugin.displayName}.\n`);
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
  if (result.guidance) {
    process.stdout.write(`\nRecommended integration: ${result.guidance.package}\n`);
    process.stdout.write(`Callback: ${result.guidance.callback}\n`);
    process.stdout.write(`Session: ${result.guidance.session}\n`);
    result.guidance.flow.forEach((step, index) => process.stdout.write(`  ${index + 1}. ${step}\n`));
  }
}

export async function run(argv) {
  const { command, args, flags } = parseArgs(argv);
  const config = cliConfig({ issuer: flags.issuer, apiBase: flags.apiBase, clientId: flags.clientId });
  if (command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }
  if (command === "--version" || command === "-v" || command === "version") {
    process.stdout.write(`${CLI_VERSION}\n`);
    return;
  }

  if (command === "login") {
    if (flags.json) process.stderr.write("Opening your browser to sign in to NamoID…\n");
    else process.stdout.write("Opening your browser to sign in to NamoID…\n");
    await login(config);
    const profile = await userInfo(config);
    const result = { signedIn: true, user: { id: profile.sub, email: profile.email ?? null, name: profile.name ?? null } };
    if (flags.json) jsonOutput(command, true, result);
    else process.stdout.write(`Signed in${profile.email ? ` as ${profile.email}` : ""}.\n`);
    return;
  }

  if (command === "logout") {
    await logout(config);
    if (flags.json) jsonOutput(command, true, { signedIn: false });
    else process.stdout.write("Signed out of NamoID.\n");
    return;
  }

  if (command === "whoami") {
    const profile = await userInfo(config);
    const result = { id: profile.sub, email: profile.email ?? null, name: profile.name ?? null };
    if (flags.json) jsonOutput(command, true, result);
    else process.stdout.write(`${profile.email ?? profile.name ?? profile.sub}\n`);
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

  if (command === "plugin" || command === "extension" || command === "ext") {
    await runPluginLifecycle(args[0], args[1], flags);
    return;
  }

  if (command === "skills" || command === "skill") {
    await runSkillsLifecycle(args[0], args[1], flags);
    return;
  }

  if (command === "setup") {
    const host = args[0];
    if (host) {
      await runPluginLifecycle("install", host, flags);
      await runSkillsLifecycle("install", host, { ...flags, yes: true });
      return;
    }
    const rows = hostRows();
    if (flags.json) jsonOutput("setup", true, rows);
    else {
      process.stdout.write("Detected AI hosts:\n");
      rows.forEach((row) => process.stdout.write(`- ${row.displayName}: ${row.detected ? "detected" : "not detected"}\n`));
      process.stdout.write("Run `namoid setup <codex|claude>` to install its verified extension and Customer Identity skills.\n");
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
    const diagnosis = diagnoseProject(project);
    const result = buildOnboardingPlan(project, diagnosis, {
      tenantId: flags.tenant,
      projectId: flags.project,
      environmentId: flags.environment,
    });
    let detected = detectApplicationSetup(project, flags);
    const mcpHost = detectPreferredMcpHost({ requested: flags.mcpHost });
    result.proposal = {
      application: detected,
      mcpHost: mcpHost?.host ?? null,
    };
    if (flags.dryRun) {
      if (flags.json) jsonOutput(command, true, result);
      else {
        printDetection(project);
        process.stdout.write("\nDry run — no files or NamoID configuration will change.\n");
        process.stdout.write(`Application: ${detected.name} (${detected.applicationType})\n`);
        process.stdout.write(`Callback: ${detected.redirectUri}\n`);
        process.stdout.write(`AI host: ${mcpHost?.displayName ?? "not detected"}\n\n`);
        result.actions.forEach((item, index) => process.stdout.write(`${index + 1}. ${item.description}\n`));
      }
      return;
    }
    let token;
    try {
      token = await accessToken(config);
    } catch (error) {
      if (!(error instanceof Error) || !/Run `namoid login`/.test(error.message)) throw error;
      const output = flags.json ? process.stderr : process.stdout;
      output.write("Opening your browser to sign in to NamoID…\n");
      await login(config);
      token = await accessToken(config);
    }
    const target = await resolveInitTarget(
      config,
      {
        tenantId: flags.tenant,
        projectId: flags.project,
        environmentId: flags.environment,
      },
      {
        accessToken: token,
        prompt: createInteractivePrompt(flags),
        suggestedProjectName: detected.name,
      },
    );
    result.target = {
      tenantId: target.tenantId,
      projectId: target.projectId,
      environmentId: target.environmentId,
    };
    detected = await resolvePublicApplicationName(detected, flags);
    result.proposal.application = detected;
    if (!flags.json) {
      printDetection(project);
      process.stdout.write("\nSelected NamoID destination:\n");
      process.stdout.write(`- Workspace: ${target.labels.workspace}\n`);
      process.stdout.write(`- Project: ${target.labels.project}\n`);
      process.stdout.write(`- Environment: ${target.labels.environment}\n`);
      process.stdout.write("\nDetected setup:\n");
      process.stdout.write(`- Application: ${detected.name} (${detected.applicationType})\n`);
      process.stdout.write(`- Callback: ${detected.redirectUri}\n`);
      process.stdout.write(`- AI host: ${mcpHost?.displayName ?? "not detected; MCP setup will be skipped"}\n`);
    }
    const mutation = mcpHost
      ? `Create ${detected.name} and configure NamoID MCP for ${mcpHost.displayName}?`
      : `Create ${detected.name} in the selected NamoID environment?`;
    const approved = await confirmMutation(mutation, flags);
    if (!approved) return;
    const application = await createApplication(
      config,
      target,
      {
        name: detected.name,
        application_type: detected.applicationType,
        redirect_uris: [detected.redirectUri],
        post_logout_redirect_uris: [detected.postLogoutRedirectUri],
        allowed_web_origins: [detected.origin],
        default_return_to: detected.redirectUri,
        allowed_scopes: ["openid", "profile", "email", "offline_access"],
        trusted: true,
      },
      { accessToken: token },
    );
    let mcp = { configured: false, reason: "host_not_detected" };
    if (mcpHost) {
      try {
        const stdio = flags.json ? ["inherit", process.stderr, process.stderr] : "inherit";
        mcp = setupAndAuthorizeMcp(mcpHost, { stdio });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        process.stderr.write(`Application created, but ${mcpHost.displayName} MCP setup did not finish: ${message}\n`);
        mcp = { configured: false, reason: "host_setup_failed", host: mcpHost.host };
      }
    }
    const created = applicationSetupResult(application, mcp);
    if (flags.json) jsonOutput(command, true, created);
    else {
      const outcome = created.replayed ? "Application already ready" : "Created";
      process.stdout.write(`\n${outcome}: ${created.name}.\nClient ID: ${created.clientId}\n`);
      if (created.clientSecret) {
        process.stdout.write(
          `Client Secret (shown once): ${created.clientSecret}\nStore it as NAMOID_CLIENT_SECRET in server-only secret storage now.\n`,
        );
      } else if (created.applicationType === "web" && created.replayed) {
        process.stdout.write(
          "The existing confidential Application secret is not retrievable. Rotate it in the Console if it was not saved.\n",
        );
      }
      if (created.mcp.configured) process.stdout.write(`NamoID MCP is connected for ${mcpHost.displayName}.\n`);
    }
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}
