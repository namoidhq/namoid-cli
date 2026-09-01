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

async function readText(filePath) {
  try {
    return await readFile(filePath, "utf8");
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
      if (/\.(?:js|jsx|mjs|py|ts|tsx)$/.test(entry.name)) files.push(path.join(directory, entry.name));
    }
  }
  await walk(root, 0);
  return files.sort();
}

async function scanSource(root) {
  const findings = {
    nextAuthLinks: [],
    internalOriginRedirects: [],
    authSignals: {
      state: false,
      nonce: false,
      pkce: false,
      idTokenValidation: false,
      refresh: false,
      logout: false,
    },
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
    findings.authSignals.state ||= /\bstate\b/.test(content);
    findings.authSignals.nonce ||= /\bnonce\b/.test(content);
    findings.authSignals.pkce ||= /code[_A-Z]?verifier|codeVerifier|code[_A-Z]?challenge|codeChallenge|create_oidc_transaction|createOIDCTransaction/.test(content);
    findings.authSignals.idTokenValidation ||= /validate_id_token|validateOIDCIdToken|idTokenClaims/.test(content);
    findings.authSignals.refresh ||= /refresh[_A-Z]?token|refreshToken|\.refresh\(/.test(content);
    findings.authSignals.logout ||= /logout_url|getLogoutUrl|revoke_token|revokeToken|\.logout\(|\.revoke\(/.test(content);
  }
  return findings;
}

function dependenciesOf(pkg) {
  return { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };
}

function detectFramework(dependencies, pythonText = "") {
  if (dependencies.next) return "nextjs";
  if (dependencies.react && dependencies.express) return "express-react";
  if (dependencies.react) return "react";
  if (/\b(?:fastapi|FastAPI)\b/.test(pythonText)) return "fastapi";
  if (/\b(?:django|Django)\b/.test(pythonText)) return "django";
  if (/\b(?:flask|Flask)\b/.test(pythonText)) return "flask";
  return "unknown";
}

function pythonSdkVersion(text) {
  const match = text.match(/(?:^|[\s"'])namoid(?:\[[^\]]+\])?\s*(?:==|~=|>=|\^)?\s*([0-9]+(?:\.[0-9]+){1,2})?/im);
  return match ? (match[1] ?? "unspecified") : null;
}

function numericVersion(value) {
  const match = String(value).match(/(\d+)\.(\d+)\.(\d+)/);
  return match ? match.slice(1).map(Number) : null;
}

function versionAtLeast(value, minimum) {
  const current = numericVersion(value);
  const target = numericVersion(minimum);
  if (!current || !target) return null;
  for (let index = 0; index < 3; index += 1) {
    if (current[index] !== target[index]) return current[index] > target[index];
  }
  return true;
}

const SDK_MINIMUMS = {
  "@namoidhq/js": "3.2.0",
  "@namoidhq/react": "4.0.0",
  "@namoidhq/nextjs": "4.0.0",
  namoid: "0.2.0",
};

const FRAMEWORK_GUIDANCE = {
  nextjs: { package: "@namoidhq/nextjs", callback: "App Router route handler", session: "server-side HttpOnly cookie session" },
  react: { package: "@namoidhq/react", callback: "same-origin SPA callback", session: "backend-for-frontend session when refresh tokens are needed" },
  "express-react": { package: "@namoidhq/js", callback: "server callback route", session: "server-side HttpOnly cookie session" },
  fastapi: { package: "namoid>=0.2.0", callback: "FastAPI callback endpoint", session: "server-side session middleware" },
  flask: { package: "namoid>=0.2.0", callback: "Flask callback route", session: "server-side session storage" },
  django: { package: "namoid>=0.2.0", callback: "Django callback view", session: "Django server-side session" },
  unknown: { package: "standards-based OIDC SDK", callback: "registered callback endpoint", session: "server-side session for confidential clients" },
};

function detectDevPort(pkg) {
  const scripts = Object.values(pkg?.scripts ?? {}).filter((value) => typeof value === "string");
  for (const script of scripts) {
    const match = script.match(/(?:--port|-p)\s*(?:=\s*)?(\d{2,5})\b/);
    if (match) return Number(match[1]);
  }
  return null;
}

async function detectPackageManager(root, pkg) {
  if (typeof pkg?.packageManager === "string") return pkg.packageManager.split("@")[0];
  const candidates = [
    ["pnpm-lock.yaml", "pnpm"],
    ["yarn.lock", "yarn"],
    ["bun.lock", "bun"],
    ["bun.lockb", "bun"],
    ["package-lock.json", "npm"],
  ];
  const detected = [];
  for (const [file, manager] of candidates) {
    if (await exists(path.join(root, file))) detected.push({ file, manager });
  }
  return detected.length === 1 ? detected[0].manager : detected.length > 1 ? "ambiguous" : null;
}

export async function inspectProject(root) {
  const packagePath = path.join(root, "package.json");
  const pkg = await readJson(packagePath);
  const pythonManifestText = [
    await readText(path.join(root, "pyproject.toml")),
    await readText(path.join(root, "requirements.txt")),
    await readText(path.join(root, "requirements-dev.txt")),
  ].filter(Boolean).join("\n");
  const dependencies = dependenciesOf(pkg);
  const framework = detectFramework(dependencies, pythonManifestText);
  const packageManager = await detectPackageManager(root, pkg);
  const sdkPackages = ["@namoidhq/nextjs", "@namoidhq/react", "@namoidhq/js"]
    .filter((name) => dependencies[name])
    .map((name) => ({ name, version: dependencies[name] }));
  const pythonVersion = pythonSdkVersion(pythonManifestText);
  if (pythonVersion) sdkPackages.push({ name: "namoid", version: pythonVersion });

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
  const publicEnvValues = {};
  for (const envFile of envFiles) {
    const content = await readFile(path.join(root, envFile), "utf8");
    for (const line of content.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      envNames.add(match[1]);
      if (match[1] === "NEXT_PUBLIC_APP_URL") {
        publicEnvValues[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
      }
    }
  }

  const sourceFindings = await scanSource(root);
  const gitignore = await readText(path.join(root, ".gitignore"));

  return {
    root,
    packageJson: pkg ? "package.json" : null,
    pythonManifest: pythonManifestText ? "python" : null,
    packageName: typeof pkg?.name === "string" ? pkg.name : null,
    framework,
    usesVite: Boolean(dependencies.vite),
    devPort: detectDevPort(pkg),
    packageManager,
    sdkPackages,
    callbackCandidates,
    envFiles,
    envNames: [...envNames].sort(),
    publicEnvValues,
    gitignore: gitignore === null ? null : gitignore.split(/\r?\n/),
    sourceFindings,
  };
}

function check(id, status, message, remediation = null) {
  return { id, status, message, remediation };
}

export function diagnoseProject(project) {
  const checks = [];
  checks.push(
    project.packageJson || project.pythonManifest
      ? check("project.manifest", "pass", `Found ${project.packageJson ?? "Python dependency manifest"}.`)
      : check("project.manifest", "fail", "No supported dependency manifest was found.", "Run this command from the application root."),
  );

  checks.push(
    project.packageManager === "ambiguous"
      ? check("project.package_manager", "fail", "Multiple package-manager lockfiles were detected.", "Keep one package-manager lockfile before allowing generated changes.")
      : project.packageManager
        ? check("project.package_manager", "pass", `Detected ${project.packageManager}.`)
        : check("project.package_manager", "warn", "No package manager was detected.", "Declare packageManager in package.json or create one lockfile."),
  );

  for (const sdk of project.sdkPackages) {
    const minimum = SDK_MINIMUMS[sdk.name];
    if (!minimum) continue;
    const supported = versionAtLeast(sdk.version, minimum);
    checks.push(
      supported === false
        ? check(`namoid.sdk_version.${sdk.name}`, "fail", `${sdk.name} ${sdk.version} is below the supported ${minimum}.`, `Upgrade to ${sdk.name}@${minimum} or newer.`)
        : supported === null
          ? check(`namoid.sdk_version.${sdk.name}`, "warn", `Could not determine the installed ${sdk.name} version from ${sdk.version}.`, `Pin ${sdk.name} to ${minimum} or newer and regenerate the lockfile.`)
          : check(`namoid.sdk_version.${sdk.name}`, "pass", `${sdk.name} ${sdk.version} meets the supported ${minimum}.`),
    );
  }

  if (project.sdkPackages.length > 0) {
    const signalChecks = [
      ["state", "OAuth state handling", "Use the SDK transaction and compare callback state before exchanging the code."],
      ["nonce", "OIDC nonce handling", "Persist the SDK transaction nonce and require it during ID-token validation."],
      ["pkce", "S256 PKCE handling", "Use the SDK transaction code verifier; never generate or downgrade to plain PKCE."],
      ["idTokenValidation", "local ID-token validation", "Validate signature, issuer, audience, expiry, and nonce before creating a session."],
      ["refresh", "refresh-token handling", "Handle refresh rotation server-side and clear the session when refresh fails."],
      ["logout", "token revocation or provider logout", "Revoke refresh tokens, clear the local session, and use the discovered logout endpoint."],
    ];
    for (const [key, label, remediation] of signalChecks) {
      const detected = project.sourceFindings.authSignals[key];
      checks.push(
        detected
          ? check(`namoid.flow.${key}`, "pass", `Found source evidence of ${label}.`)
          : check(`namoid.flow.${key}`, "warn", `No source evidence of ${label} was detected.`, remediation),
      );
    }
  }

  checks.push(
    project.framework === "unknown"
      ? check("project.framework", "warn", "No supported web framework was detected.", "Use Hosted Auth with the generic OIDC integration guidance.")
      : check("project.framework", "pass", `Detected ${project.framework}.`),
  );

  checks.push(
    project.sdkPackages.length > 0
      ? check("namoid.sdk", "pass", `Found ${project.sdkPackages.map((item) => item.name).join(", ")}.`)
      : check(
          "namoid.sdk",
          "fail",
          "No NamoID SDK package was found.",
          ["fastapi", "flask", "django"].includes(project.framework)
            ? "Install namoid>=0.2.0."
            : project.framework === "nextjs"
              ? "Install @namoidhq/nextjs."
              : project.framework === "react"
                ? "Install @namoidhq/react."
                : "Install @namoidhq/js.",
        ),
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

  const isPython = ["fastapi", "flask", "django"].includes(project.framework);
  const requiredNames = isPython ? ["NAMOID_CLIENT_ID"] : ["NAMOID_CLIENT_ID", "NEXT_PUBLIC_APP_URL"];
  for (const name of requiredNames) {
    checks.push(
      project.envNames.includes(name)
        ? check(`env.${name.toLowerCase()}`, "pass", `${name} is declared.`)
        : check(`env.${name.toLowerCase()}`, "fail", `${name} is not declared.`, `Add ${name} to the appropriate local environment file.`),
    );
  }

  const publicAppUrl = project.publicEnvValues.NEXT_PUBLIC_APP_URL;
  if (publicAppUrl) {
    let publicUrlStatus = "pass";
    let publicUrlMessage = "NEXT_PUBLIC_APP_URL is an absolute application URL.";
    let publicUrlRemediation = null;
    try {
      const parsed = new URL(publicAppUrl);
      if (["0.0.0.0", "api", "web"].includes(parsed.hostname)) {
        publicUrlStatus = "fail";
        publicUrlMessage = `NEXT_PUBLIC_APP_URL uses internal host ${parsed.hostname}.`;
        publicUrlRemediation = "Set it to the browser-visible application origin used in registered callbacks.";
      }
    } catch {
      publicUrlStatus = "fail";
      publicUrlMessage = "NEXT_PUBLIC_APP_URL is not an absolute URL.";
      publicUrlRemediation = "Use an absolute URL such as http://localhost:3000 or https://app.example.com.";
    }
    checks.push(check("env.public_app_url", publicUrlStatus, publicUrlMessage, publicUrlRemediation));
  }

  const publicSecretNames = project.envNames.filter((name) =>
    /^(?:NEXT_PUBLIC_|PUBLIC_|VITE_).*(?:SECRET|TOKEN|PRIVATE|PASSWORD|API_KEY)/.test(name),
  );
  checks.push(
    publicSecretNames.length === 0
      ? check("env.public_secrets", "pass", "No secret-like public environment-variable names were detected.")
      : check("env.public_secrets", "fail", `Secret-like variables use a public prefix: ${publicSecretNames.join(", ")}.`, "Move secrets to server-only environment variables and rotate any value already exposed to a browser build."),
  );

  if (project.envFiles.some((name) => name === ".env" || name === ".env.local")) {
    const ignored = project.gitignore?.some((line) => {
      const rule = line.trim();
      return rule === ".env*" || rule === ".env" || rule === ".env.local";
    });
    checks.push(
      ignored
        ? check("env.gitignore", "pass", "Local environment files are ignored by Git.")
        : check("env.gitignore", "fail", "A local environment file exists but is not clearly ignored by Git.", "Add .env* to .gitignore and explicitly allow only a redacted .env.example if needed."),
    );
  }

  if (project.framework === "nextjs" || isPython) {
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
    guidance: {
      ...FRAMEWORK_GUIDANCE[project.framework],
      flow: ["discover issuer metadata", "create state, nonce, and S256 PKCE", "exchange code at the discovered token endpoint", "validate the ID token and UserInfo subject", "create the application session", "rotate refresh tokens", "revoke tokens and perform provider logout"],
    },
    checks,
    summary: {
      passed: checks.filter((item) => item.status === "pass").length,
      warnings: checks.filter((item) => item.status === "warn").length,
      failed: checks.filter((item) => item.status === "fail").length,
    },
  };
}
