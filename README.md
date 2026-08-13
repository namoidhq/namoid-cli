# NamoID CLI

Deterministic local setup and diagnostics for NamoID Customer Identity.

Project inspection and planning commands are read-only. AI setup installs a
verified host plugin but does not modify the inspected application:

```bash
node ./bin/namoid.js detect
node ./bin/namoid.js doctor
node ./bin/namoid.js init --dry-run
node ./bin/namoid.js doctor --json
node ./bin/namoid.js ai setup codex --dry-run
node ./bin/namoid.js ai setup claude --dry-run
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
