---
name: implement-namoid-logout
description: Implement or repair secure NamoID Customer Identity logout, including local session cleanup and OIDC provider logout when supported.
---

# Implement NamoID logout

Inspect the existing login callback, session storage, middleware, and logout route before editing.

Implement logout as two distinct operations:

1. Invalidate the application's server-side session and expire every authentication cookie using the same path, domain, and security attributes with which it was created.
2. When the configured NamoID Instance advertises OIDC end-session support, redirect through its discovered `end_session_endpoint`, provide the appropriate ID-token hint if required, and use only an exactly registered post-logout redirect URI.

Do not invent endpoint paths. Read the Instance's OIDC discovery document and use the official SDK when it exposes logout helpers. Treat logout requests as state-changing operations: use POST plus CSRF protection for local logout unless the framework already provides an equally safe pattern.

Test local logout independently of provider logout. Verify that protected routes reject the old session, cookies are cleared, and an unavailable provider logout endpoint cannot prevent local cleanup.

Never log tokens or place a client secret in browser code. Do not add Management API, Agent Auth, MCP authorization, SSO, organizations, or billing.
