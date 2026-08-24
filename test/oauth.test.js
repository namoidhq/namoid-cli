import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createPkce, discover, startLoopbackCallback } from "../src/oauth.js";
import { clearTokens, loadTokens, saveTokens } from "../src/token-store.js";

test("creates an RFC 7636 S256 verifier and challenge", () => {
  const { verifier, challenge } = createPkce();
  assert.match(verifier, /^[A-Za-z0-9_-]{43}$/);
  assert.match(challenge, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(verifier, challenge);
});

test("rejects OAuth discovery from a different issuer", async () => {
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({
      issuer: "https://attacker.example",
      authorization_endpoint: "https://attacker.example/authorize",
      token_endpoint: "https://attacker.example/token",
      userinfo_endpoint: "https://attacker.example/userinfo",
      revocation_endpoint: "https://attacker.example/revoke",
      code_challenge_methods_supported: ["S256"],
    }),
  });
  await assert.rejects(
    discover({ issuer: "https://auth.namoid.in" }, fetchImpl),
    /unexpected issuer/,
  );
});

test("accepts a matching loopback callback and rejects a different state", async () => {
  const accepted = await startLoopbackCallback({ state: "expected-state", timeoutMs: 2_000 });
  const acceptedResponse = await fetch(`${accepted.redirectUri}?code=one-time-code&state=expected-state`);
  assert.equal(acceptedResponse.status, 200);
  assert.deepEqual(await accepted.callback, { code: "one-time-code" });

  const rejected = await startLoopbackCallback({ state: "expected-state", timeoutMs: 2_000 });
  const rejection = rejected.callback.catch((error) => error);
  const rejectedResponse = await fetch(`${rejected.redirectUri}?code=stolen-code&state=wrong-state`);
  assert.equal(rejectedResponse.status, 400);
  assert.match((await rejection).message, /state did not match/);
});

test("stores credentials with owner-only file permissions", async () => {
  const configDir = await mkdtemp(path.join(tmpdir(), "namoid-token-store-"));
  const config = { configDir, issuer: "https://auth.namoid.in", clientId: "namoid_cli_test" };
  await saveTokens(config, {
    access_token: "access-token",
    refresh_token: "refresh-token",
    expires_in: 300,
    scope: "openid offline_access",
  });
  const stored = await loadTokens(config);
  assert.equal(stored.refreshToken, "refresh-token");
  assert.equal((await stat(path.join(configDir, "tokens.json"))).mode & 0o777, 0o600);
  assert.equal((await readFile(path.join(configDir, "tokens.json"), "utf8")).includes("refresh-token"), true);
  await clearTokens(config);
  assert.equal(await loadTokens(config), null);
});
