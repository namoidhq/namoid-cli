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

Start from the application repository with one command. `init` signs in when
needed, detects the local setup, and creates the NamoID Application after one
confirmation:

```bash
npx @namoidhq/cli init
```

After browser sign-in, the CLI loads the workspaces and projects available to
the signed-in account and asks which human-readable destination to use. When no
suitable workspace or project exists, `init` offers to create it and uses its
Test environment automatically. UUID flags remain optional overrides for CI or
other non-interactive automation; people do not need to copy identifiers from
the Console.

Detection, diagnostics, previews, and optional session controls remain
available independently:

```bash
namoid detect
namoid doctor
namoid init --dry-run
namoid login
namoid whoami
namoid logout
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

`namoid doctor` recognizes Next.js, React, Express + React, FastAPI, Flask, and
Django. It checks supported SDK versions and looks for static evidence of
state, nonce, S256 PKCE, ID-token validation, refresh rotation, revocation, and
logout. Missing source evidence is reported as a warning because an application
may encapsulate the control in shared middleware; it is never presented as
proof of runtime security.

`namoid init` is the recommended first command. It detects the framework,
package name, dev port, callback route, and SDK. When no CLI session exists it opens browser login automatically. After
login, it asks for the Application name and clearly identifies that name as
public on hosted sign-in and consent screens. The detected package name is only
a suggested default. After one confirmation it creates the Application.
For a confidential web Application, the Client Secret is returned once and must
be stored immediately as `NAMOID_CLIENT_SECRET` in server-only secret storage.
Non-interactive runs must provide `--name`. AI extension setup is separate and
opt-in through `namoid setup codex` or `namoid setup claude`.

The CLI is an OAuth public native client. `namoid login` opens the system
browser, uses Authorization Code with S256 PKCE, and receives the callback on a
random loopback port. It has no client secret. Rotating tokens are stored in the
current user's private NamoID configuration directory with owner-only file
permissions and are revoked by `namoid logout`.

AI host plugins remain separate OAuth clients owned by Codex or Claude; the CLI
does not copy or share their credentials.

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

## Customer Identity skills

The published CLI contains six versioned, portable Customer Identity skills:
setup, diagnosis, verification, secure logout, session review, and production
readiness. `setup` installs both the verified host extension and these skills;
they can also be managed independently:

```bash
namoid skills install codex
namoid skills install claude
namoid skills status
namoid skills update codex --dry-run
namoid skills uninstall claude
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
