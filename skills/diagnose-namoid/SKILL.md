---
name: diagnose-namoid
description: Diagnose an existing NamoID Customer Identity integration, including SDK, callback, environment, session, and logout problems.
---

# Diagnose NamoID Customer Identity

1. Run `namoid detect --json` and `namoid doctor --json` from the application root.
2. Inspect the detected SDK, callback route, application origin, environment-variable names, and server/browser boundary without revealing values.
3. Verify that callback and post-logout URLs are exact public URLs and that secrets are server-only.
4. Check Authorization Code + S256 PKCE, state, issuer, nonce, signed ID-token, UserInfo subject, refresh rotation, and revocation behavior.
5. Prefer evidence from code and focused tests. Do not mutate NamoID or local files during diagnosis unless the user asks for a fix.
6. Report findings by severity with a concrete remediation and verification command.

Stay within Customer Identity. Do not diagnose unrelated NamoID products unless explicitly requested.
