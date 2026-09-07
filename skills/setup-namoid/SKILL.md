---
name: setup-namoid
description: Set up or repair NamoID Customer Identity in a JavaScript, React, Next.js, or Python application using official SDKs and the scoped NamoID MCP server.
---

# Set up NamoID Customer Identity

1. Inspect the application without reading or printing secret values.
2. Run `namoid detect --json` and `namoid doctor --json` before changing application files.
3. If the NamoID MCP connection is not authorized, ask the host to connect it. Let the host own OAuth credentials; never ask the CLI for a token.
4. Use MCP discovery tools to list only the workspaces, projects, and Instances granted by the user. Default to a Test Instance and require explicit approval before changing Live.
5. Create or update the Customer Identity Application through approved MCP tools, then use only the official SDK for the detected framework.
6. Implement Authorization Code with S256 PKCE, exact callback validation, state and nonce checks, server-side sessions for confidential applications, refresh, and logout.
7. Keep `NAMOID_CLIENT_SECRET` in server-only configuration. Never place it in a public-prefixed variable, browser bundle, log, prompt, or generated example value.
8. Run focused tests and `namoid doctor --json`. Report any remaining Console-only action.

For concrete SDK contracts, read [references/customer-identity-sdks.md](references/customer-identity-sdks.md) only after detecting the application's language and framework.

Do not add Management API, Agent Auth, Workforce Identity, SSO, organizations, or billing unless the user separately requests that product.
