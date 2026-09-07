/** Capability registry for supported AI coding agents. */
export const AGENTS = Object.freeze({
  codex: Object.freeze({
    id: "codex",
    aliases: ["openai"],
    displayName: "OpenAI Codex",
    executables: ["codex"],
    plugin: true,
    mcp: "native",
  }),
  claude: Object.freeze({
    id: "claude",
    aliases: ["claude-code", "cc"],
    displayName: "Claude Code",
    executables: ["claude"],
    plugin: true,
    mcp: "native",
  }),
  cursor: Object.freeze({
    id: "cursor",
    aliases: [],
    displayName: "Cursor",
    executables: ["cursor"],
    plugin: false,
    mcp: "cursor-project",
  }),
  gemini: Object.freeze({
    id: "gemini",
    aliases: ["gemini-cli", "google-gemini"],
    displayName: "Gemini CLI",
    executables: ["gemini"],
    plugin: false,
    mcp: "gemini-project",
  }),
  antigravity: Object.freeze({
    id: "antigravity",
    aliases: ["anti-gravity", "agy"],
    displayName: "Google Antigravity",
    executables: ["antigravity", "agy"],
    plugin: false,
    mcp: "antigravity-project",
  }),
  copilot: Object.freeze({
    id: "copilot",
    aliases: ["github-copilot", "gh-copilot"],
    displayName: "GitHub Copilot",
    executables: ["copilot", "code"],
    plugin: false,
    mcp: "copilot-local",
  }),
  generic: Object.freeze({
    id: "generic",
    aliases: ["skills", "other"],
    displayName: "Other skill-compatible agent",
    executables: [],
    plugin: false,
    mcp: "skills-only",
  }),
});

export const AGENT_IDS = Object.freeze(Object.keys(AGENTS));

export function resolveAgent(value) {
  const needle = String(value ?? "").trim().toLowerCase();
  return Object.values(AGENTS).find(
    (agent) => agent.id === needle || agent.aliases.includes(needle),
  );
}

export function parseAgentSelection(values) {
  const requested = values
    .flatMap((value) => String(value ?? "").split(","))
    .map((value) => value.trim())
    .filter(Boolean);
  const resolved = requested.map((value) => {
    const agent = resolveAgent(value);
    if (!agent) {
      throw new Error(`Unsupported AI agent: ${value}. Supported agents: ${AGENT_IDS.join(", ")}`);
    }
    return agent;
  });
  return [...new Map(resolved.map((agent) => [agent.id, agent])).values()];
}
