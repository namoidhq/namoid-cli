---
name: review-namoid-sessions
description: Audit NamoID Customer Identity session and token handling in an existing application and recommend concrete, file-specific security fixes.
---

# Review NamoID sessions

Perform a read-only audit unless the user also asks for fixes.

1. Detect the framework, application type, NamoID SDK, callback route, session implementation, authentication middleware, refresh handling, and logout route.
2. Read the relevant files. Do not infer security controls from dependency names alone.
3. Report findings with file and line references, ordered by severity.

Check these invariants:

- Authorization Code flow uses S256 PKCE, unpredictable state, and nonce where an ID token is requested.
- The callback validates state, issuer, audience, signature, expiry, and nonce before creating a session.
- Confidential-client secrets and refresh tokens never enter browser bundles, local storage, URLs, logs, or error messages.
- Browser sessions use `HttpOnly`, `Secure` in production, an appropriate `SameSite` value, narrow path/domain scope, rotation after login, and CSRF protection for state changes.
- Protected routes validate server-side session state; APIs do not trust decoded-but-unverified JWT claims.
- Refresh is bounded, failure clears the session, concurrent refresh is handled, and rotated tokens replace old values atomically when rotation is supported.
- Logout invalidates local state even if provider logout fails.
- Redirect and post-logout URIs are exact allowlisted values; production does not accept wildcards or arbitrary return URLs.

Mark each item as implemented, partial, missing, or not determinable. Separate confirmed vulnerabilities from hardening recommendations. Do not print secret values or send source code to an external service.
