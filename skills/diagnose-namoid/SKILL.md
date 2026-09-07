---
name: diagnose-namoid
description: Diagnose an existing NamoID Customer Identity integration, including SDK, callback, environment, session, and logout problems.
---

# Diagnose NamoID Customer Identity

1. Run `namoid detect --json` and `namoid doctor --json` from the application root.
2. Inspect the SDK, callback route, application origin, environment-variable names, and server/browser boundary without revealing values.
3. Verify that callback and post-logout URLs are exact public URLs and secrets are server-only.
4. Check S256 PKCE, state, issuer, nonce, ID-token validation, UserInfo subject, refresh rotation, and revocation.
5. Prefer evidence from code and focused tests. Do not mutate NamoID or local files during diagnosis unless asked for a fix.
6. Report findings by severity with a concrete remediation and verification command.

Stay within Customer Identity unless the user explicitly requests another product.
