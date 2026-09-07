import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  compareVersions,
  loadBundledIntegrationManifest,
  loadIntegrationRelease,
  validateIntegrationManifest,
} from "../src/integration-manifest.js";

const SKILLS_ROOT = fileURLToPath(new URL("../skills", import.meta.url));

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function remoteRelease({ version = "0.1.0", mutateBundle = (bundle) => bundle } = {}) {
  const bundled = loadBundledIntegrationManifest();
  const files = bundled.skills.map((name) => {
    const bytes = readFileSync(`${SKILLS_ROOT}/${name}/SKILL.md`);
    return {
      path: `skills/${name}/SKILL.md`,
      sha256: digest(bytes),
      contentBase64: bytes.toString("base64"),
    };
  });
  const bundle = Buffer.from(`${JSON.stringify(mutateBundle({
    schemaVersion: 1,
    version,
    repository: bundled.repository,
    files,
  }), null, 2)}\n`);
  const manifest = {
    ...bundled,
    version,
    release: {
      ...bundled.release,
      tag: `v${version}`,
      bundle: `namoid-agent-integrations-${version}.bundle.json`,
      bundleSha256: digest(bundle),
    },
  };
  const responses = [
    new Response(`${JSON.stringify(manifest)}\n`, { status: 200 }),
    new Response(bundle, { status: 200 }),
  ];
  return { fetchImpl: async () => responses.shift(), manifest, bundle };
}

test("loads the canonical bundled integrations manifest", () => {
  const manifest = loadBundledIntegrationManifest();
  assert.equal(manifest.repository, "https://github.com/namoidhq/namoid-agent-integrations");
  assert.equal(manifest.mcpServer.url, "https://mcp.namoid.in");
  assert.equal(manifest.agents.copilot.cloudMcp, false);
});

test("rejects manifests that redirect MCP or request legacy scopes", () => {
  const bundled = loadBundledIntegrationManifest();
  assert.throws(
    () => validateIntegrationManifest({ ...bundled, mcpServer: { ...bundled.mcpServer, url: "https://evil.example" } }),
    /canonical NamoID MCP endpoint/,
  );
  assert.throws(
    () => validateIntegrationManifest({ ...bundled, mcpServer: { ...bundled.mcpServer, allowedScopes: ["setup.identity.read"] } }),
    /unexpected OAuth scopes/,
  );
});

test("loads a checksummed release bundle", async () => {
  const remote = remoteRelease();
  const release = await loadIntegrationRelease({ fetchImpl: remote.fetchImpl });
  assert.equal(release.source, "github-release");
  assert.equal(release.files.size, 6);
  assert.ok(release.files.has("skills/setup-namoid/SKILL.md"));
});

test("falls back only when the release endpoint is unavailable", async () => {
  const unavailable = await loadIntegrationRelease({
    fetchImpl: async () => new Response("missing", { status: 404 }),
  });
  assert.equal(unavailable.source, "bundled");
  assert.match(unavailable.warning, /HTTP 404/);

  const offline = await loadIntegrationRelease({ offline: true, fetchImpl: async () => {
    throw new Error("offline mode must not fetch");
  } });
  assert.equal(offline.source, "bundled");
});

test("fails closed on checksum mismatch, path traversal, and downgrade", async () => {
  const corrupt = remoteRelease();
  corrupt.manifest.release.bundleSha256 = "0".repeat(64);
  const corruptResponses = [
    new Response(JSON.stringify(corrupt.manifest), { status: 200 }),
    new Response(corrupt.bundle, { status: 200 }),
  ];
  await assert.rejects(
    loadIntegrationRelease({ fetchImpl: async () => corruptResponses.shift() }),
    /invalid checksum/,
  );

  const traversal = remoteRelease({
    mutateBundle: (bundle) => ({
      ...bundle,
      files: [...bundle.files, { path: "skills/../escape", sha256: digest("x"), contentBase64: "eA==" }],
    }),
  });
  await assert.rejects(
    loadIntegrationRelease({ fetchImpl: traversal.fetchImpl }),
    /unsafe file entry/,
  );

  const downgrade = remoteRelease({ version: "0.0.9" });
  await assert.rejects(
    loadIntegrationRelease({ installedVersion: "0.1.0", fetchImpl: downgrade.fetchImpl }),
    /Refusing integrations downgrade/,
  );
});

test("compares semantic release versions", () => {
  assert.equal(compareVersions("1.2.3", "1.2.3"), 0);
  assert.equal(compareVersions("1.10.0", "1.2.9"), 1);
  assert.equal(compareVersions("0.9.9", "1.0.0"), -1);
});
