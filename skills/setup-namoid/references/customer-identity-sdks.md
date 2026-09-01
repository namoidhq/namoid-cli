# Customer Identity SDK contracts

Use the framework-specific package instead of hand-writing endpoint paths.

## Next.js

Use `@namoidhq/nextjs` 4.0.0 or newer. Create the server-only client with
`clientId`, `clientSecret`, and the public `appBaseUrl`. Route login through
`login()`, the registered callback through `callback()`, rotation through
`refresh()`, and sign-out through `logout()`. Store application sessions and
refresh tokens server-side; never return the client secret or refresh token to
a Client Component.

## React

Use `@namoidhq/react` 4.0.0 or newer with `@namoidhq/js` 3.2.0 or newer. React
may initiate Authorization Code + S256 PKCE as a public client. Prefer a
backend-for-frontend when the application needs durable refresh tokens or a
confidential client. Do not use browser local storage for tokens.

## Python

Use `namoid` 0.2.0 or newer. The standard flow is:

1. `create_oidc_transaction(redirect_uri)`
2. `authorization_url(transaction)`
3. compare callback state
4. `exchange_code(code=..., code_verifier=..., redirect_uri=...)`
5. `validate_id_token(id_token, nonce=...)`
6. `user_info(access_token)` and require the same `sub`
7. create a server-side application session
8. `refresh(...)`, `revoke_token(...)`, and `logout_url(...)`

Sync and async clients expose the same contract. Endpoints come from validated
OIDC discovery; do not use legacy `/v1/auth/hosted/exchange`, `/v1/auth/refresh`,
or `/v1/auth/logout` for new integrations.
