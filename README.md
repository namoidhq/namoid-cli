# NamoID CLI

[![npm](https://img.shields.io/npm/v/@namoidhq/cli.svg?label=%40namoidhq%2Fcli)](https://www.npmjs.com/package/@namoidhq/cli)
[![CI](https://github.com/namoidhq/namoid-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/namoidhq/namoid-cli/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

Credential-free setup and diagnostics for NamoID Customer Identity across AI coding agents.

## Install

Run without installing globally:

```bash
npx @namoidhq/cli --help
```

Or install the `namoid` command:

```bash
npm install --global @namoidhq/cli
namoid --help
```

Requires Node.js 20 or newer.

## Commands

Start from the application repository with one command:

```bash
npx @namoidhq/cli init
```

The CLI detects the project and installed AI agents, installs portable skills
under `.agents/skills`, and configures the canonical
`https://mcp.namoid.in` server. The selected agent owns browser OAuth and its
credentials. The CLI never receives a NamoID access token and does not create
remote resources itself.

Detection, diagnostics, previews, and agent management remain available:

```bash
namoid detect
namoid doctor
namoid init --dry-run
namoid agents list
namoid agents install codex cursor
namoid agents install --agent gemini --agent antigravity
namoid agents install github-copilot
namoid agents update --agent cursor --dry-run
namoid agents remove copilot
namoid skills status
```

It detects supported frameworks, installed NamoID SDKs, callback routes, and
required environment-variable names. It never prints environment-variable
values.

`namoid doctor` recognizes Next.js, React, Express + React, FastAPI, Flask, and
Django. It checks supported SDK versions and looks for static evidence of
state, nonce, S256 PKCE, ID-token validation, refresh rotation, revocation, and
logout. Missing source evidence is reported as a warning because an application
may encapsulate the control in shared middleware; it is never presented as
proof of runtime security.

`namoid init` is the recommended first command. It refuses to run outside a
detected JavaScript or Python application, preventing accidental remote or local
setup from an unrelated directory. After installation, ask the selected agent:

> Set up NamoID customer identity for this project.

The agent then starts Authorization Code with S256 PKCE through NamoID MCP. The
hosted NamoID flow lets the user select the exact workspace, project, and Test
or Live instances the agent may access. Live access is never selected by the
CLI.

Codex and Claude use their official NamoID marketplace plugins. Cursor, Gemini
CLI, Antigravity, GitHub Copilot, and compatible agents share the same
project-local skills. Agent artifacts are versioned independently in
[`namoidhq/namoid-agent-integrations`](https://github.com/namoidhq/namoid-agent-integrations).

## Agent lifecycle

```bash
namoid agents list
namoid agents install codex
namoid agents install claude cursor gemini antigravity copilot
namoid agents update --agent cursor --agent gemini
namoid agents remove copilot
```

## Customer Identity skills

The CLI installs six versioned Customer Identity skills into the application
repository so local and cloud-capable agents can discover the same guidance:

```bash
namoid skills install
namoid skills status
namoid skills update --dry-run
namoid skills remove
```

Managed integration state is recorded in `.namoid/agents.lock.json`. Existing
JSON configuration is merged rather than replaced. Malformed files and symbolic
links are rejected instead of overwritten.

Mutating commands prompt by default. Use `--yes` only for an intentional
non-interactive run. Use `--path` to target another application, `--offline` to
use bundled verified artifacts, and `--json` for machine-readable output.

GitHub Copilot CLI and VS Code can use NamoID MCP interactively. Copilot cloud
coding agents and code review receive the project skills only; the CLI does not
enable MCP tools for those autonomous surfaces.

## Security

The CLI stores no NamoID access tokens, refresh tokens, client secrets, or
workspace authority. OAuth credentials remain in the selected agent's native
credential store. Generated MCP configuration contains only the canonical HTTPS
URL—never authorization headers, automatic tool approvals, or secrets.

AI plugins are installed only from official NamoID repositories through the
host's native plugin manager. Report vulnerabilities privately according to
[SECURITY.md](./SECURITY.md).

## Links

- [NamoID](https://namoid.in)
- [Documentation](https://docs.namoid.in)
- [Issues](https://github.com/namoidhq/namoid-cli/issues)
- [npm package](https://www.npmjs.com/package/@namoidhq/cli)

## License

[MIT](./LICENSE) © PolyMindsLabs Pvt. Ltd.
