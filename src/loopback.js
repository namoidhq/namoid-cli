import http from "node:http";

const SUCCESS_HTML = "<!doctype html><title>NamoID CLI</title><p>Authentication complete. You may close this window.</p>";
const FAILURE_HTML = "<!doctype html><title>NamoID CLI</title><p>Authentication failed. Return to the terminal and try again.</p>";

export async function startLoopbackCallback({ timeoutMs = 180_000 } = {}) {
  let settle;
  const result = new Promise((resolve, reject) => {
    settle = { resolve, reject };
  });
  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname !== "/callback") {
      response.writeHead(404).end();
      return;
    }
    const error = url.searchParams.get("error");
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (error || !code || !state) {
      response.writeHead(400, { "content-type": "text/html; charset=utf-8" }).end(FAILURE_HTML);
      settle.reject(new Error(`OAuth authorization failed: ${error ?? "missing callback parameters"}`));
    } else {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(SUCCESS_HTML);
      settle.resolve({ code, state });
    }
    server.close();
  });
  server.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not start OAuth loopback callback");
  const timer = setTimeout(() => {
    server.close();
    settle.reject(new Error("OAuth authorization timed out"));
  }, timeoutMs);
  timer.unref();
  return {
    redirectUri: `http://127.0.0.1:${address.port}/callback`,
    waitForCallback: () => result.finally(() => clearTimeout(timer)),
    close: () => server.close(),
  };
}
