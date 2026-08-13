import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAuthorizationUrl,
  createOAuthState,
  createPkce,
  discoverAuthorizationServer,
  discoverProtectedResource,
  exchangeAuthorizationCode,
  registerPublicClient,
} from "../src/oauth.js";

test("discovers the Setup Assistant resource and its least-privilege scopes", async () => {
  const metadata = await discoverProtectedResource(
    "https://api.namoid.in/.well-known/oauth-protected-resource/v1/setup/mcp",
    async () => new Response(JSON.stringify({
      resource: "https://api.namoid.in/v1/setup/mcp",
      authorization_servers: ["https://auth.namoid.in"],
      scopes_supported: ["setup.read", "setup.write"],
    }), { status: 200, headers: { "content-type": "application/json" } }),
  );

  assert.equal(metadata.resource, "https://api.namoid.in/v1/setup/mcp");
  assert.deepEqual(metadata.authorizationServers, ["https://auth.namoid.in"]);
  assert.deepEqual(metadata.scopesSupported, ["setup.read", "setup.write"]);
});

test("rejects protected-resource metadata without an authorization server", async () => {
  await assert.rejects(
    discoverProtectedResource(
      "https://api.namoid.in/.well-known/oauth-protected-resource/v1/setup/mcp",
      async () => new Response(JSON.stringify({
        resource: "https://api.namoid.in/v1/setup/mcp",
        authorization_servers: [],
      }), { status: 200, headers: { "content-type": "application/json" } }),
    ),
    /missing authorization_servers/,
  );
});

test("creates PKCE S256 values with sufficient entropy", () => {
  const first = createPkce();
  const second = createPkce();
  assert.equal(first.method, "S256");
  assert.ok(first.verifier.length >= 43);
  assert.match(first.verifier, /^[A-Za-z0-9_-]+$/);
  assert.match(first.challenge, /^[A-Za-z0-9_-]+$/);
  assert.notEqual(first.verifier, second.verifier);
  assert.notEqual(createOAuthState(), createOAuthState());
});

test("validates discovery issuer and PKCE support", async () => {
  const metadata = await discoverAuthorizationServer("https://auth.namoid.in", async () =>
    new Response(JSON.stringify({
      issuer: "https://auth.namoid.in",
      authorization_endpoint: "https://auth.namoid.in/oauth/authorize",
      token_endpoint: "https://auth.namoid.in/v1/oauth/token",
      registration_endpoint: "https://auth.namoid.in/v1/oauth/register",
      scopes_supported: ["openid", "setup.read"],
      code_challenge_methods_supported: ["S256"],
    }), { status: 200, headers: { "content-type": "application/json" } }),
  );
  assert.equal(metadata.issuer, "https://auth.namoid.in");
  assert.equal(metadata.tokenEndpoint, "https://auth.namoid.in/v1/oauth/token");
});

test("builds an authorization-code request without a client secret", () => {
  const url = buildAuthorizationUrl({
    authorizationEndpoint: "https://auth.namoid.in/oauth/authorize",
    clientId: "namoid_cli_public",
    redirectUri: "http://127.0.0.1:42813/callback",
    scopes: ["setup.read", "offline_access", "setup.read"],
    state: "state-value",
    codeChallenge: "challenge-value",
  });
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("scope"), "setup.read offline_access");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.has("client_secret"), false);
});

test("exchanges a code and returns normalized token metadata", async () => {
  let requestBody = "";
  const result = await exchangeAuthorizationCode({
    tokenEndpoint: "https://auth.namoid.in/v1/oauth/token",
    clientId: "namoid_cli_public",
    redirectUri: "http://127.0.0.1:42813/callback",
    code: "one-time-code",
    codeVerifier: "verifier",
    fetchImpl: async (_url, init) => {
      requestBody = init.body.toString();
      return new Response(JSON.stringify({
        token_type: "Bearer",
        access_token: "access-token",
        refresh_token: "refresh-token",
        expires_in: 300,
        scope: "setup.read offline_access",
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  assert.equal(result.accessToken, "access-token");
  assert.equal(result.refreshToken, "refresh-token");
  assert.match(requestBody, /code_verifier=verifier/);
  assert.doesNotMatch(requestBody, /client_secret/);
});

test("rejects discovery metadata for a different issuer", async () => {
  await assert.rejects(
    discoverAuthorizationServer("https://auth.namoid.in", async () =>
      new Response(JSON.stringify({
        issuer: "https://attacker.example",
        authorization_endpoint: "https://attacker.example/authorize",
        token_endpoint: "https://attacker.example/token",
        code_challenge_methods_supported: ["S256"],
      }), { status: 200, headers: { "content-type": "application/json" } }),
    ),
    /issuer does not match/,
  );
});

test("registers a public MCP client without accepting a client secret", async () => {
  let requestBody;
  const client = await registerPublicClient({
    registrationEndpoint: "https://auth.namoid.in/v1/oauth/register",
    redirectUris: ["http://127.0.0.1:42813/callback"],
    scopes: ["setup.read", "setup.write", "offline_access"],
    fetchImpl: async (_url, init) => {
      requestBody = JSON.parse(init.body);
      return new Response(JSON.stringify({
        client_id: "dynamic-public-client",
        redirect_uris: requestBody.redirect_uris,
        token_endpoint_auth_method: "none",
      }), { status: 201, headers: { "content-type": "application/json" } });
    },
  });

  assert.equal(client.clientId, "dynamic-public-client");
  assert.equal(requestBody.token_endpoint_auth_method, "none");
  assert.equal(Object.hasOwn(requestBody, "client_secret"), false);
  assert.equal(requestBody.scope, "setup.read setup.write offline_access");
});
