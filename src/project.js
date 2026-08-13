import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";

const EXISTS = 0;

async function exists(filePath) {
  try {
    await access(filePath, EXISTS);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

async function findFiles(root, relativeDirectories, names) {
  const found = [];
  for (const directory of relativeDirectories) {
    const absolute = path.join(root, directory);
    let entries;
    try {
      entries = await readdir(absolute, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isFile() && names.has(entry.name)) {
        found.push(path.relative(root, path.join(absolute, entry.name)));
      }
    }
  }
  return found.sort();
}

async function findSourceFiles(root) {
  const files = [];
  const ignored = new Set([".git", ".next", "build", "dist", "node_modules"]);
  async function walk(directory, depth) {
    if (depth > 8) return;
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!ignored.has(entry.name)) await walk(path.join(directory, entry.name), depth + 1);
        continue;
      }
      if (/\.(?:js|jsx|mjs|ts|tsx)$/.test(entry.name)) files.push(path.join(directory, entry.name));
    }
  }
  await walk(root, 0);
  return files.sort();
}

async function scanSource(root) {
  const findings = {
    nextAuthLinks: [],
    internalOriginRedirects: [],
  };
  for (const absolute of await findSourceFiles(root)) {
    let content;
    try {
      content = await readFile(absolute, "utf8");
    } catch {
      continue;
    }
    const relative = path.relative(root, absolute);
    if (/<Link\b[^>]*href=(?:["']\/api\/auth\/(?:login|logout)["']|\{[^}]*\/api\/auth\/(?:login|logout)[^}]*\})/s.test(content)) {
      findings.nextAuthLinks.push(relative);
    }
    if (/new URL\(\s*["']\/(?:dashboard|account|app)[^"']*["']\s*,\s*request\.url\s*\)/.test(content)) {
      findings.internalOriginRedirects.push(relative);
    }
  }
  return findings;
}

function dependenciesOf(pkg) {
  return { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };
}

function detectFramework(dependencies) {
  if (dependencies.next) return "nextjs";
  if (dependencies.react && dependencies.express) return "express-react";
  if (dependencies.react) return "react";
  return "unknown";
}

export async function inspectProject(root) {
  const packagePath = path.join(root, "package.json");
  const pkg = await readJson(packagePath);
  const dependencies = dependenciesOf(pkg);
  const framework = detectFramework(dependencies);
  const sdkPackages = ["@namoidhq/nextjs", "@namoidhq/js"]
    .filter((name) => dependencies[name])
    .map((name) => ({ name, version: dependencies[name] }));

  const callbackCandidates = await findFiles(
    root,
    [
      "app/api/auth/callback",
      "src/app/api/auth/callback",
      "pages/api/auth",
      "src/pages/api/auth",
      "server",
      "src/server",
    ],
    new Set(["route.js", "route.mjs", "route.ts", "route.tsx", "callback.js", "callback.ts"]),
  );

  const envFiles = (await Promise.all(
    [".env", ".env.local", ".env.development", ".env.example"].map(async (name) =>
      (await exists(path.join(root, name))) ? name : null,
    ),
  )).filter(Boolean);

  const envNames = new Set();
  for (const envFile of envFiles) {
    const content = await readFile(path.join(root, envFile), "utf8");
    for (const line of content.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=/);
      if (match) envNames.add(match[1]);
    }
  }

  const sourceFindings = await scanSource(root);

  return {
    root,
    packageJson: pkg ? "package.json" : null,
    packageName: typeof pkg?.name === "string" ? pkg.name : null,
    framework,
    sdkPackages,
    callbackCandidates,
    envFiles,
    envNames: [...envNames].sort(),
    sourceFindings,
  };
}

function check(id, status, message, remediation = null) {
  return { id, status, message, remediation };
}

export function diagnoseProject(project) {
  const checks = [];
  checks.push(
    project.packageJson
      ? check("project.package_json", "pass", "Found package.json.")
      : check("project.package_json", "fail", "No package.json was found.", "Run this command from the application root."),
  );

  checks.push(
    project.framework === "unknown"
      ? check("project.framework", "warn", "No supported web framework was detected.", "Use Hosted Auth with the generic OIDC integration guidance.")
      : check("project.framework", "pass", `Detected ${project.framework}.`),
  );

  checks.push(
    project.sdkPackages.length > 0
      ? check("namoid.sdk", "pass", `Found ${project.sdkPackages.map((item) => item.name).join(", ")}.`)
      : check("namoid.sdk", "fail", "No NamoID SDK package was found.", project.framework === "nextjs" ? "Install @namoidhq/nextjs." : "Install @namoidhq/js."),
  );

  if (project.framework === "nextjs") {
    checks.push(
      project.callbackCandidates.length > 0
        ? check("namoid.callback_route", "pass", `Found callback route: ${project.callbackCandidates[0]}.`)
        : check("namoid.callback_route", "fail", "No NamoID callback route was detected.", "Create app/api/auth/callback/route.ts or src/app/api/auth/callback/route.ts."),
    );
    checks.push(
      project.sourceFindings.nextAuthLinks.length === 0
        ? check("nextjs.auth_full_navigation", "pass", "Authentication routes use full browser navigation.")
        : check(
            "nextjs.auth_full_navigation",
            "fail",
            `Next.js Link targets an authentication route in ${project.sourceFindings.nextAuthLinks.join(", ")}.`,
            "Use a normal <a href> for /api/auth/login and /api/auth/logout so Next.js cannot prefetch an OAuth transaction.",
          ),
    );
    checks.push(
      project.sourceFindings.internalOriginRedirects.length === 0
        ? check("nextjs.public_callback_redirect", "pass", "No callback redirect derived from an internal request origin was detected.")
        : check(
            "nextjs.public_callback_redirect",
            "fail",
            `Callback redirect derives its origin from request.url in ${project.sourceFindings.internalOriginRedirects.join(", ")}.`,
            "Build the post-login URL from the configured public application URL, not request.url behind a reverse proxy.",
          ),
    );
  }

  const requiredNames = ["NAMOID_CLIENT_ID", "NEXT_PUBLIC_APP_URL"];
  for (const name of requiredNames) {
    checks.push(
      project.envNames.includes(name)
        ? check(`env.${name.toLowerCase()}`, "pass", `${name} is declared.`)
        : check(`env.${name.toLowerCase()}`, "fail", `${name} is not declared.`, `Add ${name} to the appropriate local environment file.`),
    );
  }

  if (project.framework === "nextjs") {
    checks.push(
      project.envNames.includes("NAMOID_CLIENT_SECRET")
        ? check("env.namoid_client_secret", "pass", "NAMOID_CLIENT_SECRET is declared for the server integration.")
        : check("env.namoid_client_secret", "fail", "NAMOID_CLIENT_SECRET is not declared.", "Create the confidential application secret in Console and add it only to server-side configuration."),
    );
  }

  return {
    framework: project.framework,
    packageName: project.packageName,
    sdkPackages: project.sdkPackages,
    callbackCandidates: project.callbackCandidates,
    envFiles: project.envFiles,
    checks,
    summary: {
      passed: checks.filter((item) => item.status === "pass").length,
      warnings: checks.filter((item) => item.status === "warn").length,
      failed: checks.filter((item) => item.status === "fail").length,
    },
  };
}
