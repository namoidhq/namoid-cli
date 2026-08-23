import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

function tokenPath(config) {
  return path.join(config.configDir, "tokens.json");
}

export async function loadTokens(config) {
  try {
    const parsed = JSON.parse(await readFile(tokenPath(config), "utf8"));
    if (parsed.issuer !== config.issuer || parsed.clientId !== config.clientId) return null;
    return parsed;
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw new Error("Could not read the NamoID credential store.", { cause: error });
  }
}

export async function saveTokens(config, tokens) {
  await mkdir(config.configDir, { recursive: true, mode: 0o700 });
  const target = tokenPath(config);
  const temporary = `${target}.${process.pid}.tmp`;
  const stored = {
    issuer: config.issuer,
    clientId: config.clientId,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? null,
    scope: tokens.scope ?? "",
    expiresAt: Date.now() + (Number(tokens.expires_in) * 1000),
  };
  await writeFile(temporary, `${JSON.stringify(stored, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, target);
  return stored;
}

export async function clearTokens(config) {
  await rm(tokenPath(config), { force: true });
}
