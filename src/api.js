import { createHash } from "node:crypto";
import { accessToken } from "./oauth.js";

const CLI_VERSION = "0.1.0";

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
  const fetchImpl = options.fetchImpl ?? fetch;
  const token = options.accessToken ?? await accessToken(config, { fetchImpl });
  const idempotencyKey = applicationIdempotencyKey(target, body);
  const path = `/v1/tenants/${encodeURIComponent(target.tenantId)}/projects/${encodeURIComponent(target.projectId)}/environments/${encodeURIComponent(target.environmentId)}/applications`;
  const response = await fetchImpl(`${config.apiBase}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
      "User-Agent": `@namoidhq/cli/${CLI_VERSION}`,
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Application setup failed: ${payload.message ?? payload.detail ?? `HTTP ${response.status}`}.`);
  return {
    ...payload,
    idempotency_replayed: response.headers.get("Idempotency-Replayed") === "true",
  };
}
