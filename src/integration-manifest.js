import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { AGENT_IDS } from "./agents.js";

const BUNDLED_MANIFEST = fileURLToPath(new URL("../integrations-manifest.json", import.meta.url));
const RELEASE_BASE = "https://github.com/namoidhq/namoid-agent-integrations/releases/latest/download";
const REPOSITORY = "https://github.com/namoidhq/namoid-agent-integrations";
const MCP_URL = "https://mcp.namoid.in";
const SCOPES = ["customer-identity:read", "customer-identity:configure"];
const MAX_MANIFEST_BYTES = 256 * 1024;
const MAX_BUNDLE_BYTES = 4 * 1024 * 1024;
const MAX_FILE_BYTES = 256 * 1024;
const MAX_FILES = 128;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function agentIds(value) {
  return Array.isArray(value) ? value : Object.keys(value ?? {});
}

export function compareVersions(left, right) {
  const parse = (value) => {
    const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value ?? "");
    if (!match) throw new Error(`Invalid integration version: ${value}`);
    return match.slice(1).map(Number);
  };
  const a = parse(left);
  const b = parse(right);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  }
  return 0;
}

export function validateIntegrationManifest(value, { remote = false } = {}) {
  if (!value || value.schemaVersion !== 1 || typeof value.version !== "string") {
    throw new Error("Unsupported NamoID integrations manifest.");
  }
  compareVersions(value.version, value.version);
  if (value.repository !== REPOSITORY) throw new Error("Unexpected integrations repository.");
  if (!Array.isArray(value.skills) || !value.skills.every((item) => /^[a-z0-9-]+$/.test(item))) {
    throw new Error("Integrations manifest skills must be an array of safe names.");
  }
  const ids = agentIds(value.agents);
  if (!ids.length || ids.some((item) => !AGENT_IDS.includes(item))) {
    throw new Error("Integrations manifest contains an unsupported agent.");
  }
  if (value.mcpServer?.url !== MCP_URL) {
    throw new Error("Integrations manifest must use the canonical NamoID MCP endpoint.");
  }
  const scopes = value.mcpServer.allowedScopes ?? value.mcpServer.scopes;
  if (JSON.stringify(scopes) !== JSON.stringify(SCOPES)) {
    throw new Error("Integrations manifest contains unexpected OAuth scopes.");
  }
  if (value.mcpServer.targetBinding && value.mcpServer.targetBinding !== "instance") {
    throw new Error("Integrations manifest must bind grants to Instances.");
  }
  if (remote) {
    if (value.release?.tag !== `v${value.version}`) throw new Error("Release tag and version differ.");
    if (!/^[a-zA-Z0-9._-]+\.bundle\.json$/.test(value.release?.bundle ?? "")) {
      throw new Error("Integrations release has an unsafe bundle name.");
    }
    if (!/^[a-f0-9]{64}$/.test(value.release?.bundleSha256 ?? "")) {
      throw new Error("Integrations release is missing a bundle checksum.");
    }
  }
  return Object.freeze(value);
}

export function loadBundledIntegrationManifest() {
  return validateIntegrationManifest(JSON.parse(readFileSync(BUNDLED_MANIFEST, "utf8")));
}

function validateBundle(bundle, manifest) {
  if (
    !bundle ||
    bundle.schemaVersion !== 1 ||
    bundle.version !== manifest.version ||
    bundle.repository !== REPOSITORY ||
    !Array.isArray(bundle.files) ||
    bundle.files.length > MAX_FILES
  ) {
    throw new Error("Unsupported NamoID integrations bundle.");
  }
  const files = new Map();
  let totalBytes = 0;
  for (const entry of bundle.files) {
    if (
      !entry ||
      typeof entry.path !== "string" ||
      !/^(skills|adapters)\/[a-zA-Z0-9._/-]+$/.test(entry.path) ||
      entry.path.split("/").some((part) => part === "" || part === "." || part === "..") ||
      !/^[a-f0-9]{64}$/.test(entry.sha256 ?? "") ||
      typeof entry.contentBase64 !== "string"
    ) {
      throw new Error("Integrations bundle contains an unsafe file entry.");
    }
    if (files.has(entry.path)) throw new Error(`Duplicate integrations file: ${entry.path}`);
    const bytes = Buffer.from(entry.contentBase64, "base64");
    if (bytes.length > MAX_FILE_BYTES || sha256(bytes) !== entry.sha256) {
      throw new Error(`Integrations file checksum failed: ${entry.path}`);
    }
    totalBytes += bytes.length;
    if (totalBytes > MAX_BUNDLE_BYTES) throw new Error("Integrations bundle is too large.");
    files.set(entry.path, Object.freeze({ bytes, sha256: entry.sha256 }));
  }
  for (const skill of manifest.skills) {
    const entry = files.get(`skills/${skill}/SKILL.md`);
    if (!entry) throw new Error(`Integrations bundle is missing skill: ${skill}`);
    const source = entry.bytes.toString("utf8");
    if (!source.startsWith("---\n") || !source.includes(`\nname: ${skill}\n`)) {
      throw new Error(`Integrations bundle has invalid skill metadata: ${skill}`);
    }
  }
  return files;
}

async function boundedResponse(response, maximum, label) {
  const declared = Number(response.headers?.get?.("content-length") ?? 0);
  if (declared > maximum) throw new Error(`${label} is too large.`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > maximum) throw new Error(`${label} is too large.`);
  return bytes;
}

function bundledRelease(warning = null) {
  const manifest = loadBundledIntegrationManifest();
  return Object.freeze({ manifest, files: null, source: "bundled", warning });
}

export async function loadIntegrationRelease({
  offline = false,
  installedVersion = null,
  fetchImpl = globalThis.fetch,
} = {}) {
  const bundled = bundledRelease();
  if (offline || typeof fetchImpl !== "function") return bundled;

  let manifestResponse;
  try {
    manifestResponse = await fetchImpl(`${RELEASE_BASE}/integrations-manifest.json`, {
      headers: { accept: "application/json" },
      redirect: "follow",
      signal: AbortSignal.timeout(8_000),
    });
  } catch (error) {
    return bundledRelease(`Could not check the integrations release: ${error.message}`);
  }
  if (!manifestResponse.ok) {
    return bundledRelease(`Integrations release unavailable (HTTP ${manifestResponse.status}).`);
  }

  const manifestBytes = await boundedResponse(manifestResponse, MAX_MANIFEST_BYTES, "Manifest");
  let manifest;
  try {
    manifest = validateIntegrationManifest(JSON.parse(manifestBytes.toString("utf8")), { remote: true });
  } catch (error) {
    throw new Error(`Refusing an invalid integrations release: ${error.message}`, { cause: error });
  }
  const minimumVersion = installedVersion ?? bundled.manifest.version;
  if (compareVersions(manifest.version, minimumVersion) < 0) {
    throw new Error(`Refusing integrations downgrade from ${minimumVersion} to ${manifest.version}.`);
  }

  const bundleResponse = await fetchImpl(`${RELEASE_BASE}/${manifest.release.bundle}`, {
    headers: { accept: "application/json" },
    redirect: "follow",
    signal: AbortSignal.timeout(15_000),
  });
  if (!bundleResponse.ok) throw new Error(`Integrations bundle unavailable (HTTP ${bundleResponse.status}).`);
  const bundleBytes = await boundedResponse(bundleResponse, MAX_BUNDLE_BYTES, "Bundle");
  if (sha256(bundleBytes) !== manifest.release.bundleSha256) {
    throw new Error("Refusing integrations bundle with an invalid checksum.");
  }
  const files = validateBundle(JSON.parse(bundleBytes.toString("utf8")), manifest);
  return Object.freeze({
    manifest,
    files,
    source: "github-release",
    bundleSha256: manifest.release.bundleSha256,
    warning: null,
  });
}
