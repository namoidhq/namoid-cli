import { openBrowser } from "./browser.js";
import { startLoopbackCallback } from "./loopback.js";
import {
  buildAuthorizationUrl,
  createOAuthState,
  createPkce,
  discoverAuthorizationServer,
  discoverProtectedResource,
  exchangeAuthorizationCode,
  registerPublicClient,
} from "./oauth.js";

export const DEFAULT_SETUP_METADATA_URL =
  "https://api.namoid.in/.well-known/oauth-protected-resource/v1/setup/mcp";

export async function loginToSetupAssistant({
  metadataUrl = DEFAULT_SETUP_METADATA_URL,
  write = false,
  offline = true,
  fetchImpl = fetch,
  openBrowserImpl = openBrowser,
  startLoopbackImpl = startLoopbackCallback,
}) {
  const resource = await discoverProtectedResource(metadataUrl, fetchImpl);
  const issuer = resource.authorizationServers[0];
  const server = await discoverAuthorizationServer(issuer, fetchImpl);
  if (!server.registrationEndpoint) throw new Error("Authorization server does not support public client registration");

  const requestedScopes = ["openid", "setup.read"];
  if (write) requestedScopes.push("setup.write");
  if (offline) requestedScopes.push("offline_access");
  for (const scope of requestedScopes.filter((item) => item.startsWith("setup."))) {
    if (!resource.scopesSupported.includes(scope)) throw new Error(`Setup Assistant does not support ${scope}`);
  }

  const loopback = await startLoopbackImpl();
  try {
    const client = await registerPublicClient({
      registrationEndpoint: server.registrationEndpoint,
      redirectUris: [loopback.redirectUri],
      scopes: requestedScopes,
      fetchImpl,
    });
    const state = createOAuthState();
    const pkce = createPkce();
    const authorizationUrl = buildAuthorizationUrl({
      authorizationEndpoint: server.authorizationEndpoint,
      clientId: client.clientId,
      redirectUri: loopback.redirectUri,
      scopes: requestedScopes,
      state,
      codeChallenge: pkce.challenge,
    });
    openBrowserImpl(authorizationUrl.toString());
    const callback = await loopback.waitForCallback();
    if (callback.state !== state) throw new Error("OAuth callback state did not match");
    const tokens = await exchangeAuthorizationCode({
      tokenEndpoint: server.tokenEndpoint,
      clientId: client.clientId,
      redirectUri: loopback.redirectUri,
      code: callback.code,
      codeVerifier: pkce.verifier,
      fetchImpl,
    });
    return {
      issuer,
      resource: resource.resource,
      clientId: client.clientId,
      scopes: tokens.scope,
      tokens,
    };
  } finally {
    loopback.close();
  }
}
