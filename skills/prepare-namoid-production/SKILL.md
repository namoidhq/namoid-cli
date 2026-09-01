---
name: prepare-namoid-production
description: Assess whether a NamoID Customer Identity integration is ready for production and produce or execute a focused release checklist.
---

# Prepare NamoID for production

Start with `namoid detect --json`, `namoid doctor --json`, and a read-only inspection of the integration. Use `namoid verify --json` when available. Do not change a Live Instance without explicit approval.

Verify:

- production callback and post-logout URLs are HTTPS, exact, owned by the application, and free of wildcards;
- public and confidential application types match where code and secrets execute;
- secrets are stored only in the deployment platform's server-side secret store and can be rotated;
- state, nonce, S256 PKCE, token validation, server-side session storage, refresh failure, and logout are tested;
- cookies have production security attributes and authentication routes have CSRF, rate-limit, and safe error handling appropriate to the framework;
- logs and analytics redact authorization codes, tokens, cookies, and secrets;
- the Test and Live Instances use separate credentials and configuration;
- health checks, rollback steps, ownership, and an authentication failure runbook exist.

Run focused automated checks where possible. Clearly distinguish verified facts, Console-only checks, and blockers. Never declare production readiness from configuration files alone.

This skill covers Customer Identity only. Do not introduce Management API, Agent Auth, MCP authorization, Workforce Identity, SSO, organizations, or billing.
