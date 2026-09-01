import assert from "node:assert/strict";
import test from "node:test";
import { applicationSetupResult } from "../src/application-result.js";

test("preserves a confidential Application secret exactly once", () => {
  const result = applicationSetupResult(
    {
      id: "app-1",
      client_id: "namoid_client_live_example",
      client_secret: "one-time-secret",
      name: "Store",
      application_type: "web",
      redirect_uris: ["https://store.example/auth/callback"],
      post_logout_redirect_uris: ["https://store.example"],
      idempotency_replayed: false,
    },
    { configured: false },
  );
  assert.equal(result.clientSecret, "one-time-secret");
  assert.equal(result.secretShownOnce, true);
});

test("does not invent a secret for public or replayed Applications", () => {
  const result = applicationSetupResult(
    {
      id: "app-2",
      client_id: "namoid_client_test_example",
      name: "SPA",
      application_type: "spa",
      redirect_uris: ["https://spa.example/auth/callback"],
      idempotency_replayed: true,
    },
    { configured: false },
  );
  assert.equal(result.clientSecret, null);
  assert.equal(result.secretShownOnce, false);
});
