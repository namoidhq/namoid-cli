function callbackPath(project) {
  const candidate = project.callbackCandidates[0]?.replaceAll("\\", "/");
  if (candidate) {
    const withoutSource = candidate.replace(/^src\//, "");
    const appRoute = withoutSource.match(/^app(\/api\/auth\/callback(?:\/[^/]+)?)\/route\.(?:js|mjs|ts|tsx)$/);
    if (appRoute) return appRoute[1];
    const pagesRoute = withoutSource.match(/^pages(\/api\/auth\/callback)(?:\.(?:js|mjs|ts|tsx)|\/callback\.(?:js|mjs|ts|tsx))$/);
    if (pagesRoute) return pagesRoute[1];
  }
  return project.framework === "nextjs" ? "/api/auth/callback" : "/auth/callback";
}

function defaultOrigin(project) {
  if (project.publicEnvValues.NEXT_PUBLIC_APP_URL) {
    return project.publicEnvValues.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  }
  return `http://localhost:${project.devPort ?? (project.usesVite ? 5173 : 3000)}`;
}

export function detectApplicationSetup(project, flags = {}) {
  const origin = defaultOrigin(project);
  const redirectUri = flags.redirectUri ?? `${origin}${callbackPath(project)}`;
  const applicationType = flags.applicationType ?? (project.framework === "react" ? "spa" : "web");
  if (!["web", "spa", "native"].includes(applicationType)) throw new Error("--type must be web, spa, or native.");
  const packageName = project.packageName?.split("/").at(-1)?.trim();
  return {
    name: flags.name ?? packageName ?? "My application",
    applicationType,
    origin,
    redirectUri,
    postLogoutRedirectUri: flags.postLogoutRedirectUri ?? origin,
  };
}
