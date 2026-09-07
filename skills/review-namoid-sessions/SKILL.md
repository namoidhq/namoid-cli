---
name: review-namoid-sessions
description: Audit NamoID Customer Identity session and token handling and recommend concrete, file-specific security fixes.
---

# Review NamoID sessions

Perform a read-only audit unless the user also asks for fixes. Identify the framework, SDK version, callback, middleware, session store, refresh logic, and logout implementation. Report findings with file and line references, ordered by severity.

Check these invariants:

- S256 PKCE, unpredictable state, and nonce are used and validated.
- Issuer, audience, signature, expiry, and UserInfo subject are validated.
- Secrets and refresh tokens never enter browser bundles, local storage, URLs, logs, or error messages.
- Cookies are `HttpOnly`, `Secure` in production, have appropriate `SameSite`, and use narrow path/domain scope.
- State changes have CSRF protection and protected routes validate server-side session state.
- Refresh is bounded and atomic; logout invalidates local state even if provider logout fails.
- Redirect and post-logout URIs are exact allowlisted values.

Separate confirmed vulnerabilities from hardening recommendations. Do not transmit source code or secrets externally.
