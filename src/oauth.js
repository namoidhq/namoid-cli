import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import http from "node:http";
import { spawn } from "node:child_process";
import { clearTokens, loadTokens, saveTokens } from "./token-store.js";

const CALLBACK_TIMEOUT_MS = 5 * 60 * 1000;

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

export function createPkce() {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

export async function discover(config, fetchImpl = fetch) {
  const response = await fetchImpl(`${config.issuer}/.well-known/openid-configuration`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`OAuth discovery failed (HTTP ${response.status}).`);
  const metadata = await response.json();
  if (metadata.issuer !== config.issuer) throw new Error("OAuth discovery returned an unexpected issuer.");
  if (!metadata.code_challenge_methods_supported?.includes("S256")) throw new Error("OAuth server does not advertise S256 PKCE.");
  for (const field of ["authorization_endpoint", "token_endpoint", "userinfo_endpoint", "revocation_endpoint"]) {
    if (typeof metadata[field] !== "string") throw new Error(`OAuth discovery is missing ${field}.`);
    const endpoint = new URL(metadata[field]);
    const loopback = endpoint.protocol === "http:" && ["127.0.0.1", "::1", "localhost"].includes(endpoint.hostname);
    if (endpoint.protocol !== "https:" && !loopback) throw new Error(`OAuth discovery returned an insecure ${field}.`);
  }
  return metadata;
}

function openBrowser(url) {
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "rundll32" : "xdg-open";
  const args = process.platform === "win32" ? ["url.dll,FileProtocolHandler", url] : [url];
  const child = spawn(command, args, { detached: true, stdio: "ignore", shell: false });
  child.on("error", () => {});
  child.unref();
}

function safeStateMatches(actual, expected) {
  const left = Buffer.from(actual ?? "");
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function startLoopbackCallback({ state, timeoutMs = CALLBACK_TIMEOUT_MS }) {
  let resolveCallback;
  let rejectCallback;
  const callback = new Promise((resolve, reject) => {
    resolveCallback = resolve;
    rejectCallback = reject;
  });
  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname !== "/callback") {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }
    const returnedState = url.searchParams.get("state");
    const code = url.searchParams.get("code");
    const oauthError = url.searchParams.get("error");
    if (!safeStateMatches(returnedState, state)) {
      response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Invalid OAuth state. Return to the terminal and try again.");
      rejectCallback(new Error("OAuth callback state did not match."));
      return;
    }
    if (oauthError || !code) {
      response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("NamoID authorization was not completed. You may close this tab.");
      rejectCallback(new Error(`OAuth authorization failed: ${oauthError ?? "missing_code"}.`));
      return;
    }
    response.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
      "X-Content-Type-Options": "nosniff",
    });
    response.end("<!doctype html><title>NamoID CLI</title><body style=\"font-family:system-ui;padding:3rem\"><h1>Signed in to NamoID</h1><p>You may close this tab and return to the terminal.</p></body>");
    resolveCallback({ code });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const redirectUri = `http://127.0.0.1:${address.port}/callback`;
  const timer = setTimeout(() => rejectCallback(new Error("OAuth login timed out.")), timeoutMs);
  return {
    redirectUri,
    callback: callback.finally(() => {
      clearTimeout(timer);
      server.close();
    }),
    close: () => server.close(),
  };
}

async function tokenRequest(metadata, body, fetchImpl = fetch) {
  const response = await fetchImpl(metadata.token_endpoint, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`OAuth token request failed: ${payload.error_description ?? payload.error ?? `HTTP ${response.status}`}.`);
  return payload;
}

export async function login(config, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const metadata = await discover(config, fetchImpl);
  const { verifier, challenge } = createPkce();
  const state = base64url(randomBytes(32));
  const nonce = base64url(randomBytes(32));
  const loopback = await startLoopbackCallback({ state, timeoutMs: options.timeoutMs });
  const authorize = new URL(metadata.authorization_endpoint);
  authorize.search = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: loopback.redirectUri,
    scope: "openid profile email offline_access",
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  try {
    (options.openBrowser ?? openBrowser)(authorize.toString());
    const { code } = await loopback.callback;
    const tokens = await tokenRequest(metadata, {
      grant_type: "authorization_code",
      client_id: config.clientId,
      code,
      redirect_uri: loopback.redirectUri,
      code_verifier: verifier,
    }, fetchImpl);
    return saveTokens(config, tokens);
  } catch (error) {
    loopback.close();
    throw error;
  }
}

export async function accessToken(config, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const stored = await loadTokens(config);
  if (!stored) throw new Error("Not signed in. Run `namoid login` first.");
  if (stored.expiresAt > Date.now() + 30_000) return stored.accessToken;
  if (!stored.refreshToken) throw new Error("The NamoID session expired. Run `namoid login` again.");
  const metadata = await discover(config, fetchImpl);
  try {
    const tokens = await tokenRequest(metadata, {
      grant_type: "refresh_token",
      client_id: config.clientId,
      refresh_token: stored.refreshToken,
    }, fetchImpl);
    const refreshed = await saveTokens(config, tokens);
    return refreshed.accessToken;
  } catch (error) {
    await clearTokens(config);
    throw new Error("The NamoID session could not be refreshed. Run `namoid login` again.", { cause: error });
  }
}

export async function userInfo(config, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const metadata = await discover(config, fetchImpl);
  const token = await accessToken(config, { fetchImpl });
  const response = await fetchImpl(metadata.userinfo_endpoint, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
  if (!response.ok) throw new Error(`Could not load the signed-in NamoID user (HTTP ${response.status}).`);
  return response.json();
}

export async function logout(config, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const stored = await loadTokens(config);
  if (stored?.refreshToken) {
    try {
      const metadata = await discover(config, fetchImpl);
      await fetchImpl(metadata.revocation_endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: stored.refreshToken, token_type_hint: "refresh_token", client_id: config.clientId }),
      });
    } catch {
      // Local logout must still complete when the issuer is unavailable.
    }
  }
  await clearTokens(config);
}
