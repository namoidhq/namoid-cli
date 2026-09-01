export const HOST_PLUGINS = Object.freeze({
  codex: Object.freeze({
    host: "codex",
    aliases: ["openai"],
    executable: "codex",
    displayName: "Codex",
    repository: "https://github.com/namoidhq/namoid-codex-plugin",
    marketplaceSource: "https://github.com/namoidhq/namoid-codex-plugin",
    marketplacePath: ".agents/plugins/marketplace.json",
    pluginName: "namoid-setup-assistant",
  }),
  claude: Object.freeze({
    host: "claude",
    aliases: ["claude-code", "cc"],
    executable: "claude",
    displayName: "Claude Code",
    repository: "https://github.com/namoidhq/namoid-claude-plugin",
    marketplaceSource: "namoidhq/namoid-claude-plugin",
    marketplacePath: ".claude-plugin/marketplace.json",
    pluginName: "namoid-setup-assistant",
  }),
});

export function resolveHost(value) {
  const needle = String(value ?? "").toLowerCase();
  return Object.values(HOST_PLUGINS).find((plugin) => plugin.host === needle || plugin.aliases.includes(needle));
}

export function pluginPlan(host) {
  const plugin = resolveHost(host);
  if (!plugin) {
    throw new Error(`Unsupported AI host: ${host}. Supported hosts: ${Object.keys(HOST_PLUGINS).join(", ")}`);
  }
  return {
    ...plugin,
    updateStrategy: "host-marketplace",
    actions: [
      {
        id: "plugin.marketplace.register",
        description: `Register the official NamoID ${plugin.displayName} marketplace.`,
      },
      {
        id: "plugin.marketplace.install",
        description: `Install ${plugin.pluginName} through the ${plugin.displayName} plugin manager.`,
      },
      {
        id: "plugin.oauth.authorize",
        description: "Authorize the shared NamoID Setup Assistant MCP in the browser.",
      },
      {
        id: "plugin.connection.verify",
        description: "Verify MCP initialization and tool discovery without changing NamoID configuration.",
      },
    ],
  };
}
