import { createHash } from "node:crypto";
import { accessToken } from "./oauth.js";

const CLI_VERSION = "0.1.0";

async function managementRequest(config, path, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const token = options.accessToken ?? await accessToken(config, { fetchImpl });
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "User-Agent": `@namoidhq/cli/${CLI_VERSION}`,
    ...options.headers,
  };
  if (options.json !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetchImpl(`${config.apiBase}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.json === undefined ? undefined : JSON.stringify(options.json),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      `NamoID setup failed: ${payload.message ?? payload.detail ?? `HTTP ${response.status}`}.`,
    );
  }
  return { payload, response };
}

export async function listWorkspaces(config, options = {}) {
  return (await managementRequest(config, "/v1/tenants", options)).payload;
}

export async function listProjects(config, tenantId, options = {}) {
  return (
    await managementRequest(
      config,
      `/v1/tenants/${encodeURIComponent(tenantId)}/projects`,
      options,
    )
  ).payload;
}

export async function listEnvironments(config, target, options = {}) {
  const path =
    `/v1/tenants/${encodeURIComponent(target.tenantId)}` +
    `/projects/${encodeURIComponent(target.projectId)}/environments`;
  return (await managementRequest(config, path, options)).payload;
}

export async function createWorkspace(config, body, idempotencyKey, options = {}) {
  return (
    await managementRequest(config, "/v1/onboarding/workspaces", {
      ...options,
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey, ...options.headers },
      json: body,
    })
  ).payload;
}

export async function createProject(config, tenantId, body, options = {}) {
  return (
    await managementRequest(config, `/v1/tenants/${encodeURIComponent(tenantId)}/projects`, {
      ...options,
      method: "POST",
      json: body,
    })
  ).payload;
}

export function applicationIdempotencyKey(target, body) {
  const fingerprint = JSON.stringify({
    environmentId: target.environmentId,
    projectId: target.projectId,
    tenantId: target.tenantId,
    application: body,
  });
  return `namoid-cli-${createHash("sha256").update(fingerprint).digest("hex")}`;
}

export async function createApplication(config, target, body, options = {}) {
  const idempotencyKey = applicationIdempotencyKey(target, body);
  const path = `/v1/tenants/${encodeURIComponent(target.tenantId)}/projects/${encodeURIComponent(target.projectId)}/environments/${encodeURIComponent(target.environmentId)}/applications`;
  const { payload, response } = await managementRequest(config, path, {
    ...options,
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey, ...options.headers },
    json: body,
  });
  return {
    ...payload,
    idempotency_replayed: response.headers.get("Idempotency-Replayed") === "true",
  };
}
