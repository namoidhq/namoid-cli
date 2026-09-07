---
name: verify-namoid
description: Verify a NamoID Customer Identity integration through discovery, login callback, session, refresh, and logout checks.
---

# Verify NamoID Customer Identity

1. Start with `namoid doctor --json`; do not hide or downgrade failed checks.
2. Verify exact discovery issuer and same-issuer authorization, token, UserInfo, JWKS, revocation, and end-session endpoints.
3. Verify exact redirect handling, S256 PKCE, state, authorization-response issuer, nonce, signature, audience, expiry, and UserInfo subject.
4. Verify refresh rotation, application-session expiry, local logout, token revocation, and RP-initiated logout.
5. Confirm no secret, token, authorization code, OTP, or bearer credential is logged, committed, stored in the browser, or exposed to client bundles.
6. Run framework tests and return a concise pass/fail report with reproducible evidence.

This skill verifies Customer Identity only.
