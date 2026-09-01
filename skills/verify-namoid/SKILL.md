---
name: verify-namoid
description: Verify that a NamoID Customer Identity integration is safe and ready through discovery, login callback, session, refresh, and logout checks.
---

# Verify NamoID Customer Identity

1. Start with `namoid doctor --json`; do not hide or downgrade failed checks.
2. Verify discovery issuer equality and same-issuer authorization, token, UserInfo, JWKS, revocation, and end-session endpoints.
3. Verify exact redirect URI handling, S256 PKCE, state, authorization-response issuer, nonce, signature, audience, expiry, and UserInfo subject.
4. Verify refresh-token rotation, application-session expiry, local logout, token revocation, and RP-initiated logout.
5. Confirm no Client Secret, refresh token, authorization code, OTP, or bearer token is logged, committed, placed in browser storage, or exposed to client bundles.
6. Run framework tests and return a concise pass/fail readiness report with reproducible evidence.

This skill verifies Customer Identity only.
