import assert from "node:assert/strict";
import test from "node:test";
import { loginToSetupAssistant } from "../src/login.js";

test("runs the Setup Assistant public-client PKCE flow with read-only scope by default", async () => {
  let callback;
  let openedUrl;
  const fetchImpl = async (url, init = {}) => {
    if (url.includes("oauth-protected-resource")) return Response.json({
      resource: "https://api.namoid.in/v1/setup/mcp",
      authorization_servers: ["https://auth.namoid.in"],
      scopes_supported: ["setup.read", "setup.write"],
    });
    if (url.endsWith("openid-configuration")) return Response.json({
      issuer: "https://auth.namoid.in",
      authorization_endpoint: "https://auth.namoid.in/oauth/authorize",
      token_endpoint: "https://auth.namoid.in/v1/oauth/token",
      registration_endpoint: "https://auth.namoid.in/v1/oauth/register",
      code_challenge_methods_supported: ["S256"],
    });
    if (url.endsWith("oauth/register")) {
      const body = JSON.parse(init.body);
      assert.equal(body.scope, "openid setup.read offline_access");
      return Response.json({ client_id: "mcp_cli", token_endpoint_auth_method: "none" }, { status: 201 });
    }
    if (url.endsWith("oauth/token")) return Response.json({
      token_type: "Bearer",
      access_token: "access-token",
      refresh_token: "refresh-token",
      scope: "openid setup.read offline_access",
    });
    throw new Error(`Unexpected URL ${url}`);
  };

  const result = await loginToSetupAssistant({
    fetchImpl,
    openBrowserImpl(url) {
      openedUrl = new URL(url);
      callback = { code: "authorization-code", state: openedUrl.searchParams.get("state") };
    },
    startLoopbackImpl: async () => ({
      redirectUri: "http://127.0.0.1:49123/callback",
      waitForCallback: async () => callback,
      close() {},
    }),
  });

  assert.equal(openedUrl.searchParams.get("scope"), "openid setup.read offline_access");
  assert.equal(openedUrl.searchParams.get("code_challenge_method"), "S256");
  assert.equal(result.resource, "https://api.namoid.in/v1/setup/mcp");
  assert.equal(result.tokens.refreshToken, "refresh-token");
});
