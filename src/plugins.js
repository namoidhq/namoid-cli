const VERSION = "0.1.0";

export const HOST_PLUGINS = Object.freeze({
  codex: Object.freeze({
    host: "codex",
    aliases: ["openai"],
    executable: "codex",
    displayName: "Codex",
    repository: "https://github.com/namoidhq/namoid-codex-plugin",
    version: VERSION,
    releaseCommit: "deca04e3896ed545863db18cae7197d374cda2e3",
    archiveSha256: "8d1d2e4debd558ffa97687928779052407b82bee8142eddee2b0e42700756d3d",
    marketplacePath: ".agents/plugins/marketplace.json",
    pluginName: "namoid-setup-assistant",
  }),
  claude: Object.freeze({
    host: "claude",
    aliases: ["claude-code", "cc"],
    executable: "claude",
    displayName: "Claude Code",
    repository: "https://github.com/namoidhq/namoid-claude-plugin",
    version: VERSION,
    releaseCommit: "26a9d819c330bbc6bda7c8ab572dda9f97bc2a3f",
    archiveSha256: "e4a8d8a2f420f288e85ae1c6ad314e77e61c6e67ae855fa370898c5f04f509ba",
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
