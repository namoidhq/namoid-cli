import os from "node:os";
import path from "node:path";

export const DEFAULT_ISSUER = "https://auth.namoid.in";
export const DEFAULT_API_BASE = "https://api.namoid.in";
export const DEFAULT_CLIENT_ID = "namoid_client_live_cli_official";

export function cliConfig(overrides = {}) {
  const issuer = (overrides.issuer ?? process.env.NAMOID_ISSUER ?? DEFAULT_ISSUER).replace(/\/$/, "");
  const apiBase = (overrides.apiBase ?? process.env.NAMOID_API_BASE ?? DEFAULT_API_BASE).replace(/\/$/, "");
  const clientId = overrides.clientId ?? process.env.NAMOID_CLI_CLIENT_ID ?? DEFAULT_CLIENT_ID;
  const configDir = overrides.configDir ?? process.env.NAMOID_CONFIG_DIR ?? path.join(os.homedir(), ".config", "namoid");
  return { issuer, apiBase, clientId, configDir };
}
