# NamoID CLI

[![npm](https://img.shields.io/npm/v/@namoidhq/cli.svg?label=%40namoidhq%2Fcli)](https://www.npmjs.com/package/@namoidhq/cli)
[![CI](https://github.com/namoidhq/namoid-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/namoidhq/namoid-cli/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

Deterministic local setup and diagnostics for NamoID Customer Identity.

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

Project inspection and planning commands are read-only. AI setup installs a
verified host plugin but does not modify the inspected application:

```bash
node ./bin/namoid.js detect
node ./bin/namoid.js doctor
node ./bin/namoid.js init --dry-run
node ./bin/namoid.js doctor --json
node ./bin/namoid.js ai setup codex --dry-run
node ./bin/namoid.js ai setup claude --dry-run
node ./bin/namoid.js setup
node ./bin/namoid.js setup codex --dry-run
node ./bin/namoid.js plugin status
node ./bin/namoid.js plugin update claude --dry-run
```

It detects supported frameworks, installed NamoID SDKs, callback routes, and
required environment-variable names. It never prints environment-variable
values.

The CLI does not implement a second MCP or OAuth client. After verified plugin
installation, Codex or Claude owns browser authorization, token handling, and
the Setup Assistant MCP connection. This keeps one authorization path per host
and prevents duplicated credential storage in the CLI.

Host plugins live in separate repositories. The CLI installs only immutable
releases pinned to an exact Git commit and deterministic archive SHA-256; it
never downloads plugin code from a moving branch.

Run `namoid ai setup codex` or `namoid ai setup claude` to verify and install
the corresponding marketplace for the current user. Add `--dry-run` to preview
the release identity and installation steps without changing host settings.

## Plugin lifecycle

```bash
namoid setup                         # detect supported AI hosts
namoid setup codex                   # verified install with confirmation
namoid plugin install cc             # aliases: cc, claude-code, openai
namoid plugin status                 # inspect all supported hosts
namoid plugin update claude --dry-run
namoid plugin uninstall codex
```

Mutating commands prompt by default. Use `--yes` only for an intentional
non-interactive run. `--json` returns the stable schema used by automation, and
`--plain` keeps output decoration-free.

## Security

The CLI does not print environment-variable values and verifies AI plugins
against an immutable Git commit and deterministic archive SHA-256 before
installation. Report vulnerabilities privately according to
[SECURITY.md](./SECURITY.md).

## Links

- [NamoID](https://namoid.in)
- [Documentation](https://docs.namoid.in)
- [Issues](https://github.com/namoidhq/namoid-cli/issues)
- [npm package](https://www.npmjs.com/package/@namoidhq/cli)

## License

[MIT](./LICENSE) © PolyMindsLabs Pvt. Ltd.
