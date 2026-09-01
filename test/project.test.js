import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { diagnoseProject, inspectProject } from "../src/project.js";

async function fixture(name) {
  return mkdtemp(path.join(tmpdir(), `namoid-cli-${name}-`));
}

test("detects a configured Next.js application without reading values", async () => {
  const root = await fixture("nextjs");
  await writeFile(path.join(root, "package.json"), JSON.stringify({
    name: "acme-web",
    packageManager: "pnpm@10.20.0",
    scripts: { dev: "next dev -p 4100" },
    dependencies: { next: "15.5.0", react: "19.0.0", "@namoidhq/nextjs": "4.0.0" },
  }));
  await writeFile(path.join(root, ".env.local"), [
    "NAMOID_CLIENT_ID=public-value",
    "NAMOID_CLIENT_SECRET=must-not-leak",
    "NEXT_PUBLIC_APP_URL=http://localhost:3000",
  ].join("\n"));
  await writeFile(path.join(root, ".gitignore"), ".env*\n!.env.example\n");
  const callback = path.join(root, "app/api/auth/callback");
  await mkdir(callback, { recursive: true });
  await writeFile(path.join(callback, "route.ts"), "export const GET = () => null;\n");

  const project = await inspectProject(root);
  const result = diagnoseProject(project);

  assert.equal(project.framework, "nextjs");
  assert.equal(project.packageManager, "pnpm");
  assert.equal(project.devPort, 4100);
  assert.deepEqual(project.callbackCandidates, ["app/api/auth/callback/route.ts"]);
  assert.ok(project.envNames.includes("NAMOID_CLIENT_SECRET"));
  assert.equal(JSON.stringify(project).includes("must-not-leak"), false);
  assert.equal(result.summary.failed, 0);
});

test("reports actionable failures for an incomplete React application", async () => {
  const root = await fixture("react");
  await writeFile(path.join(root, "package.json"), JSON.stringify({
    name: "acme-spa",
    dependencies: { react: "19.0.0" },
  }));

  const result = diagnoseProject(await inspectProject(root));

  assert.equal(result.framework, "react");
  assert.ok(result.checks.some((item) => item.id === "namoid.sdk" && item.status === "fail"));
  assert.ok(result.checks.some((item) => item.id === "env.namoid_client_id" && item.status === "fail"));
});

test("detects Next.js prefetch and internal proxy redirect hazards", async () => {
  const root = await fixture("hazards");
  await writeFile(path.join(root, "package.json"), JSON.stringify({
    name: "unsafe-next-app",
    dependencies: { next: "15.5.0", react: "19.0.0", "@namoidhq/nextjs": "4.0.0" },
  }));
  const callback = path.join(root, "app/api/auth/callback");
  await mkdir(callback, { recursive: true });
  await writeFile(path.join(callback, "route.ts"), 'return Response.redirect(new URL("/dashboard", request.url));\n');
  await writeFile(path.join(root, "app.tsx"), 'return <Link href="/api/auth/login">Sign in</Link>;\n');
  await writeFile(path.join(root, ".env.example"), [
    "NAMOID_CLIENT_ID=",
    "NAMOID_CLIENT_SECRET=",
    "NEXT_PUBLIC_APP_URL=",
  ].join("\n"));

  const result = diagnoseProject(await inspectProject(root));

  assert.ok(result.checks.some((item) => item.id === "nextjs.auth_full_navigation" && item.status === "fail"));
  assert.ok(result.checks.some((item) => item.id === "nextjs.public_callback_redirect" && item.status === "fail"));
});

test("rejects internal app origins and public secret names without exposing values", async () => {
  const root = await fixture("unsafe-env");
  await writeFile(path.join(root, "package.json"), JSON.stringify({
    name: "unsafe-env-app",
    packageManager: "npm@11.0.0",
    dependencies: { react: "19.0.0", "@namoidhq/js": "3.2.0" },
  }));
  await writeFile(path.join(root, ".env"), [
    "NAMOID_CLIENT_ID=public-client",
    "NEXT_PUBLIC_APP_URL=http://0.0.0.0:80",
    "NEXT_PUBLIC_NAMOID_CLIENT_SECRET=do-not-print-this",
  ].join("\n"));

  const project = await inspectProject(root);
  const result = diagnoseProject(project);
  const serialized = JSON.stringify({ project, result });

  assert.ok(result.checks.some((item) => item.id === "env.public_app_url" && item.status === "fail"));
  assert.ok(result.checks.some((item) => item.id === "env.public_secrets" && item.status === "fail"));
  assert.ok(result.checks.some((item) => item.id === "env.gitignore" && item.status === "fail"));
  assert.equal(serialized.includes("do-not-print-this"), false);
});

test("detects FastAPI, Python SDK versions, and Python-specific guidance", async () => {
  const root = await fixture("fastapi");
  await writeFile(path.join(root, "pyproject.toml"), [
    "[project]",
    'name = "acme-api"',
    'dependencies = ["fastapi>=0.115", "namoid>=0.2.0"]',
  ].join("\n"));
  await writeFile(path.join(root, ".env.example"), [
    "NAMOID_CLIENT_ID=",
    "NAMOID_CLIENT_SECRET=",
  ].join("\n"));

  const project = await inspectProject(root);
  const result = diagnoseProject(project);

  assert.equal(project.framework, "fastapi");
  assert.deepEqual(project.sdkPackages, [{ name: "namoid", version: "0.2.0" }]);
  assert.equal(result.guidance.package, "namoid>=0.2.0");
  assert.equal(result.guidance.callback, "FastAPI callback endpoint");
  assert.ok(result.checks.some((item) => item.id === "namoid.sdk_version.namoid" && item.status === "pass"));
  assert.equal(result.checks.some((item) => item.id === "env.next_public_app_url"), false);
});

test("fails obsolete SDK versions and reports a concrete upgrade", async () => {
  const root = await fixture("obsolete-sdk");
  await writeFile(path.join(root, "package.json"), JSON.stringify({
    name: "old-spa",
    dependencies: { react: "19.0.0", "@namoidhq/js": "2.9.0" },
  }));

  const result = diagnoseProject(await inspectProject(root));
  const version = result.checks.find((item) => item.id === "namoid.sdk_version.@namoidhq/js");
  assert.equal(version.status, "fail");
  assert.match(version.remediation, /3\.2\.0/);
});

test("reports static evidence for the complete Customer Identity lifecycle", async () => {
  const root = await fixture("auth-signals");
  await writeFile(path.join(root, "package.json"), JSON.stringify({
    name: "secure-next",
    dependencies: { next: "15.5.0", react: "19.0.0", "@namoidhq/nextjs": "4.0.0" },
  }));
  await writeFile(path.join(root, "auth.ts"), [
    "const { state, nonce, codeVerifier } = transaction;",
    "validateOIDCIdToken({ nonce });",
    "client.refresh(refreshToken);",
    "client.revoke(refreshToken);",
    "client.logout();",
  ].join("\n"));

  const result = diagnoseProject(await inspectProject(root));
  for (const id of ["state", "nonce", "pkce", "idTokenValidation", "refresh", "logout"]) {
    assert.equal(result.checks.find((item) => item.id === `namoid.flow.${id}`).status, "pass");
  }
});
