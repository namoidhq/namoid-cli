---
name: prepare-namoid-production
description: Assess whether a NamoID Customer Identity integration is ready for production and produce or execute a focused release checklist.
---

# Prepare NamoID for production

Start with `namoid detect --json`, `namoid doctor --json`, and a read-only inspection. Do not change a Live Instance without explicit approval.

Verify exact HTTPS production callbacks, correct public/confidential client type, server-only secrets and rotation, S256 PKCE, state, nonce, token validation, server-side sessions, refresh failure, logout, secure cookies, CSRF and rate limiting, secret redaction, separate Test and Live credentials, health checks, rollback, and an authentication failure runbook.

Run focused checks. Clearly distinguish verified facts, Console-only checks, and blockers. Never declare production readiness from configuration alone.

This skill covers Customer Identity only.
