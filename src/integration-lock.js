import { existsSync, lstatSync, readFileSync } from "node:fs";
import path from "node:path";
import { MCP_SERVER_NAME, MCP_SERVER_URL } from "./mcp-setup.js";
import { assertNoSymlinkComponents, atomicWriteFile } from "./safe-path.js";

export const LOCKFILE_PATH = ".namoid/agents.lock.json";

export function readIntegrationLock(cwd) {
  const file = path.join(cwd, LOCKFILE_PATH);
  if (!existsSync(file)) return null;
  assertNoSymlinkComponents(cwd, file);
  if (lstatSync(file).isSymbolicLink()) throw new Error(`Refusing to read symbolic-link lockfile: ${file}`);
  const lock = JSON.parse(readFileSync(file, "utf8"));
  if (lock?.schemaVersion !== 1 || !lock.agents || typeof lock.agents !== "object") {
    throw new Error(`Unsupported NamoID agent lockfile: ${file}`);
  }
  return lock;
}

export function writeIntegrationLock(
  cwd,
  {
    integrationVersion,
    integrationSource = "bundled",
    bundleSha256 = null,
    skills,
    agentResults,
    now = () => new Date().toISOString(),
    dryRun = false,
  },
) {
  const file = path.join(cwd, LOCKFILE_PATH);
  const previous = readIntegrationLock(cwd) ?? { schemaVersion: 1, agents: {} };
  const installedAt = now();
  const agents = { ...previous.agents };
  for (const result of agentResults) {
    agents[result.agent] = {
      integrationVersion,
      oauth: result.oauth,
      managedFiles: result.managedFiles ?? [],
      installedAt,
    };
  }
  const lock = {
    schemaVersion: 1,
    integrationVersion,
    integrationSource,
    bundleSha256,
    mcpServer: { name: MCP_SERVER_NAME, url: MCP_SERVER_URL },
    skills: [...skills],
    agents,
    updatedAt: installedAt,
  };
  if (!dryRun) {
    atomicWriteFile(cwd, file, `${JSON.stringify(lock, null, 2)}\n`);
  }
  return { file: LOCKFILE_PATH, lock, dryRun };
}

export function removeAgentsFromLock(cwd, agentIds, { dryRun = false, now = () => new Date().toISOString() } = {}) {
  const previous = readIntegrationLock(cwd);
  if (!previous) return { file: LOCKFILE_PATH, lock: null, dryRun };
  const agents = { ...previous.agents };
  for (const agentId of agentIds) delete agents[agentId];
  const lock = { ...previous, agents, updatedAt: now() };
  const file = path.join(cwd, LOCKFILE_PATH);
  if (!dryRun) {
    atomicWriteFile(cwd, file, `${JSON.stringify(lock, null, 2)}\n`);
  }
  return { file: LOCKFILE_PATH, lock, dryRun };
}
