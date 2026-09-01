import assert from "node:assert/strict";
import test from "node:test";
import {
  applicationIdempotencyKey,
  createApplication,
  createWorkspace,
  listEnvironments,
  listProjects,
  listWorkspaces,
} from "../src/api.js";

const target = { tenantId: "tenant-1", projectId: "project-1", environmentId: "env-1" };
const body = {
  name: "Public App",
  application_type: "web",
  redirect_uris: ["https://example.com/callback"],
};

test("derives a stable Application idempotency key from target and public configuration", () => {
  const first = applicationIdempotencyKey(target, body);
  const second = applicationIdempotencyKey(target, body);
  assert.equal(first, second);
  assert.match(first, /^namoid-cli-[a-f0-9]{64}$/);
  assert.notEqual(first, applicationIdempotencyKey(target, { ...body, name: "Another App" }));
});

test("sends CLI identity and idempotency headers when creating an Application", async () => {
  let request;
  const fetchImpl = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({
      id: "app-1",
      client_id: "client-1",
      name: body.name,
      redirect_uris: body.redirect_uris,
    }), {
      status: 201,
      headers: { "Content-Type": "application/json", "Idempotency-Replayed": "true" },
    });
  };

  const result = await createApplication(
    { apiBase: "https://api.namoid.in" },
    target,
    body,
    { fetchImpl, accessToken: "token" },
  );

  assert.equal(request.options.headers["Idempotency-Key"], applicationIdempotencyKey(target, body));
  assert.equal(request.options.headers["User-Agent"], "@namoidhq/cli/0.3.1");
  assert.equal(result.idempotency_replayed, true);
});

test("loads the signed-in workspace hierarchy without requiring IDs from the user", async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const config = { apiBase: "https://api.namoid.in" };
  const options = { fetchImpl, accessToken: "token" };

  await listWorkspaces(config, options);
  await listProjects(config, "tenant one", options);
  await listEnvironments(
    config,
    { tenantId: "tenant one", projectId: "project one" },
    options,
  );

  assert.deepEqual(
    requests.map((request) => request.url),
    [
      "https://api.namoid.in/v1/tenants",
      "https://api.namoid.in/v1/tenants/tenant%20one/projects",
      "https://api.namoid.in/v1/tenants/tenant%20one/projects/project%20one/environments",
    ],
  );
  assert.ok(requests.every((request) => request.options.headers.Authorization === "Bearer token"));
});

test("creates a workspace with an idempotency key", async () => {
  let request;
  const fetchImpl = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ workspace: { id: "tenant-1" } }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  };

  await createWorkspace(
    { apiBase: "https://api.namoid.in" },
    { workspace_name: "Acme", project_name: "Store", region: "in" },
    "workspace-request-1",
    { fetchImpl, accessToken: "token" },
  );

  assert.equal(request.url, "https://api.namoid.in/v1/onboarding/workspaces");
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.headers["Idempotency-Key"], "workspace-request-1");
  assert.deepEqual(JSON.parse(request.options.body), {
    workspace_name: "Acme",
    project_name: "Store",
    region: "in",
  });
});
