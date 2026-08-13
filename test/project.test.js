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
    dependencies: { next: "15.5.0", react: "19.0.0", "@namoidhq/nextjs": "4.0.0" },
  }));
  await writeFile(path.join(root, ".env.local"), [
    "NAMOID_CLIENT_ID=public-value",
    "NAMOID_CLIENT_SECRET=must-not-leak",
    "NEXT_PUBLIC_APP_URL=http://localhost:3000",
  ].join("\n"));
  const callback = path.join(root, "app/api/auth/callback");
  await mkdir(callback, { recursive: true });
  await writeFile(path.join(callback, "route.ts"), "export const GET = () => null;\n");

  const project = await inspectProject(root);
  const result = diagnoseProject(project);

  assert.equal(project.framework, "nextjs");
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
