---
name: setup-namoid
description: Set up or repair NamoID Customer Identity in a JavaScript, React, Next.js, or Python application using the official CLI and SDKs.
---

# Set up NamoID Customer Identity

1. Inspect the application without reading or printing secret values.
2. Run `namoid detect --json` and `namoid doctor --json` before changing files.
3. Use `namoid init --dry-run --json` to preview the remote Application configuration.
4. Use only the official Customer Identity SDK for the detected framework.
5. Implement Authorization Code with S256 PKCE, exact callback validation, state and nonce checks, server-side sessions for confidential applications, refresh, and logout.
6. Keep `NAMOID_CLIENT_SECRET` in server-only configuration. Never place it in a public-prefixed variable, browser bundle, log, prompt, or generated example value.
7. Default to a Test Instance. Require explicit user approval before changing a Live Instance.
8. Run focused tests and `namoid verify --json` when available. Report any remaining Console-only action.

For concrete Next.js, React, or Python SDK method names, read
[references/customer-identity-sdks.md](references/customer-identity-sdks.md). Load it only
after detecting the application's language and framework.

Do not add Management API, Agent Auth, MCP authorization, Workforce Identity, SSO, organizations, or billing unless the user separately requests that product.
