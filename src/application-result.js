export function applicationSetupResult(application, mcp) {
  const clientSecret = application.client_secret ?? null;
  return {
    applicationId: application.id,
    clientId: application.client_id,
    clientSecret,
    secretShownOnce: clientSecret !== null,
    name: application.name,
    applicationType: application.application_type,
    redirectUris: application.redirect_uris,
    postLogoutRedirectUris: application.post_logout_redirect_uris ?? [],
    replayed: application.idempotency_replayed,
    mcp,
  };
}
