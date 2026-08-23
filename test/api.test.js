import assert from "node:assert/strict";
import test from "node:test";
import { applicationIdempotencyKey, createApplication } from "../src/api.js";

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
  assert.equal(request.options.headers["User-Agent"], "@namoidhq/cli/0.1.0");
  assert.equal(result.idempotency_replayed, true);
});
