# NamoID CLI

Deterministic local setup and diagnostics for NamoID Customer Identity.

The current foundation release is read-only:

```bash
node ./bin/namoid.js detect
node ./bin/namoid.js doctor
node ./bin/namoid.js init --dry-run
node ./bin/namoid.js doctor --json
```

It detects supported frameworks, installed NamoID SDKs, callback routes, and
required environment-variable names. It never prints environment-variable
values.

Authenticated setup and repository mutation remain intentionally unavailable
until the CLI OAuth client, shared management endpoints, atomic edit plan, and
Live-environment authorization boundary are complete.

The internal OAuth foundation validates issuer discovery, requires PKCE S256,
supports loopback redirects, and exchanges authorization codes without a
client secret. The CLI uses the same Setup Assistant MCP resource and
`setup.read` / `setup.write` authorization model as AI MCP clients. It is not
exposed as `namoid login` until loopback interoperability and operating-system
credential storage are complete.
