---
name: implement-namoid-logout
description: Implement or repair secure NamoID Customer Identity logout, including local session cleanup and OIDC provider logout.
---

# Implement NamoID logout

Inspect the login callback, session storage, middleware, and logout route first.

1. Invalidate the application's server-side session and expire every authentication cookie using the same path, domain, and security attributes with which it was created.
2. When OIDC discovery advertises end-session support, redirect through the discovered `end_session_endpoint`, provide the appropriate ID-token hint, and use only an exactly registered post-logout redirect URI.

Do not invent endpoint paths. Treat local logout as state-changing: use POST and CSRF protection unless the framework already provides an equally safe pattern. Verify that protected routes reject the old session and that provider failure cannot prevent local cleanup.

Never log tokens or place a client secret in browser code. Keep this work within Customer Identity.
