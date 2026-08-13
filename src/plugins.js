const VERSION = "0.1.0";

export const HOST_PLUGINS = Object.freeze({
  codex: Object.freeze({
    host: "codex",
    displayName: "Codex",
    repository: "https://github.com/namoidhq/namoid-codex-plugin",
    version: VERSION,
    marketplacePath: ".agents/plugins/marketplace.json",
    pluginName: "namoid-setup-assistant",
  }),
  claude: Object.freeze({
    host: "claude",
    displayName: "Claude Code",
    repository: "https://github.com/namoidhq/namoid-claude-plugin",
    version: VERSION,
    marketplacePath: ".claude-plugin/marketplace.json",
    pluginName: "namoid-setup-assistant",
  }),
});

export function pluginPlan(host) {
  const plugin = HOST_PLUGINS[host];
  if (!plugin) {
    throw new Error(`Unsupported AI host: ${host}. Supported hosts: ${Object.keys(HOST_PLUGINS).join(", ")}`);
  }
  return {
    ...plugin,
    releaseTag: `v${plugin.version}`,
    mutableSourceAllowed: false,
    actions: [
      {
        id: "plugin.release.verify",
        description: `Verify ${plugin.displayName} plugin release v${plugin.version} and its SHA-256 digest.`,
      },
      {
        id: "plugin.marketplace.install",
        description: `Install ${plugin.pluginName} from the pinned ${plugin.displayName} marketplace release.`,
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
