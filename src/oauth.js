import { createHash, randomBytes } from "node:crypto";

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

export function createPkce() {
  const verifier = base64url(randomBytes(48));
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge, method: "S256" };
}

export function createOAuthState() {
  return base64url(randomBytes(32));
}

function normalizeIssuer(value) {
  const issuer = new URL(value);
  if (issuer.protocol !== "https:" && issuer.hostname !== "localhost" && issuer.hostname !== "127.0.0.1") {
    throw new Error("OAuth issuer must use HTTPS outside local development");
  }
  issuer.pathname = issuer.pathname.replace(/\/$/, "");
  issuer.search = "";
  issuer.hash = "";
  return issuer.toString().replace(/\/$/, "");
}

function requireUrl(metadata, name) {
  const value = metadata[name];
  if (typeof value !== "string") throw new Error(`OIDC discovery is missing ${name}`);
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
    throw new Error(`${name} must use HTTPS outside local development`);
  }
  return parsed.toString();
}

export async function discoverAuthorizationServer(issuer, fetchImpl = fetch) {
  const expectedIssuer = normalizeIssuer(issuer);
  const response = await fetchImpl(`${expectedIssuer}/.well-known/openid-configuration`, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`OIDC discovery failed with HTTP ${response.status}`);
  const metadata = await response.json();
  if (normalizeIssuer(metadata.issuer) !== expectedIssuer) {
    throw new Error("OIDC discovery issuer does not match the requested issuer");
  }
  if (!Array.isArray(metadata.code_challenge_methods_supported) || !metadata.code_challenge_methods_supported.includes("S256")) {
    throw new Error("Authorization server does not advertise PKCE S256");
  }
  return {
    issuer: expectedIssuer,
    authorizationEndpoint: requireUrl(metadata, "authorization_endpoint"),
    tokenEndpoint: requireUrl(metadata, "token_endpoint"),
    registrationEndpoint:
      typeof metadata.registration_endpoint === "string"
        ? requireUrl(metadata, "registration_endpoint")
        : null,
    scopesSupported: Array.isArray(metadata.scopes_supported)
      ? metadata.scopes_supported.filter((scope) => typeof scope === "string")
      : [],
  };
}

export async function registerPublicClient({
  registrationEndpoint,
  redirectUris,
  scopes,
  clientName = "NamoID CLI",
  fetchImpl = fetch,
}) {
  if (!Array.isArray(redirectUris) || redirectUris.length === 0) {
    throw new Error("At least one OAuth redirect URI is required");
  }
  const response = await fetchImpl(registrationEndpoint, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({
      client_name: clientName,
      redirect_uris: redirectUris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: [...new Set(scopes)].join(" "),
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = typeof payload.error === "string" ? payload.error : "registration_failed";
    throw new Error(`OAuth client registration failed: ${code}`);
  }
  if (typeof payload.client_id !== "string" || payload.client_id.length === 0) {
    throw new Error("OAuth client registration did not return a client ID");
  }
  if (payload.client_secret != null) {
    throw new Error("OAuth server unexpectedly returned a client secret for a public CLI client");
  }
  return {
    clientId: payload.client_id,
    redirectUris: Array.isArray(payload.redirect_uris) ? payload.redirect_uris : redirectUris,
    tokenEndpointAuthMethod: payload.token_endpoint_auth_method ?? "none",
  };
}

export function buildAuthorizationUrl({
  authorizationEndpoint,
  clientId,
  redirectUri,
  scopes,
  state,
  codeChallenge,
}) {
  if (!clientId) throw new Error("OAuth client ID is required");
  if (!Array.isArray(scopes) || scopes.length === 0) throw new Error("At least one OAuth scope is required");
  const redirect = new URL(redirectUri);
  if (redirect.protocol !== "https:" && redirect.hostname !== "127.0.0.1" && redirect.hostname !== "localhost") {
    throw new Error("OAuth redirect URI must use HTTPS or a loopback host");
  }
  const url = new URL(authorizationEndpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirect.toString());
  url.searchParams.set("scope", [...new Set(scopes)].join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url;
}

export async function exchangeAuthorizationCode({
  tokenEndpoint,
  clientId,
  redirectUri,
  code,
  codeVerifier,
  fetchImpl = fetch,
}) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    redirect_uri: redirectUri,
    code,
    code_verifier: codeVerifier,
  });
  const response = await fetchImpl(tokenEndpoint, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const codeValue = typeof payload.error === "string" ? payload.error : "token_exchange_failed";
    throw new Error(`OAuth token exchange failed: ${codeValue}`);
  }
  if (payload.token_type !== "Bearer" || typeof payload.access_token !== "string") {
    throw new Error("OAuth token response is missing a Bearer access token");
  }
  return {
    accessToken: payload.access_token,
    refreshToken: typeof payload.refresh_token === "string" ? payload.refresh_token : null,
    expiresIn: typeof payload.expires_in === "number" ? payload.expires_in : null,
    scope: typeof payload.scope === "string" ? payload.scope.split(" ").filter(Boolean) : [],
    tokenType: "Bearer",
  };
}
