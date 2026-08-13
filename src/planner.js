function action(id, description, details = {}) {
  return { id, description, ...details };
}

export function buildOnboardingPlan(project, diagnosis) {
  const actions = [
    action("auth.login", "Authenticate with NamoID using Authorization Code + PKCE", {
      target: "namoid",
      available: false,
    }),
    action("remote.workspace", "Select or create a Customer Identity workspace", {
      target: "namoid",
      available: false,
    }),
    action("remote.project", "Select or create a project", {
      target: "namoid",
      available: false,
    }),
    action("remote.environment", "Select the Test environment", {
      target: "namoid",
      available: false,
    }),
    action("remote.application", "Select or create an application", {
      target: "namoid",
      available: false,
    }),
  ];

  if (!project.sdkPackages.length) {
    actions.push(
      action(
        "local.sdk.install",
        project.framework === "nextjs" ? "Install @namoidhq/nextjs" : "Install @namoidhq/js",
        { target: "repository", available: false },
      ),
    );
  }
  if (project.framework === "nextjs" && !project.callbackCandidates.length) {
    actions.push(action("local.callback.create", "Create the Next.js Hosted Auth callback route", {
      target: "repository",
      available: false,
      path: "app/api/auth/callback/route.ts",
    }));
  }

  actions.push(
    action("remote.redirects", "Register exact callback and post-logout URLs", {
      target: "namoid",
      available: false,
    }),
    action("local.environment", "Preview local environment configuration", {
      target: "repository",
      available: false,
    }),
    action("validation.doctor", "Run local integration diagnostics", {
      target: "local",
      available: true,
      blockingFailures: diagnosis.summary.failed,
    }),
    action("validation.hosted_auth", "Run Hosted Auth readiness checks", {
      target: "namoid",
      available: false,
    }),
  );

  return {
    schemaVersion: 1,
    mode: "dry-run",
    defaults: { environment: "test" },
    detection: { framework: project.framework, packageName: project.packageName },
    actions,
    diagnosis,
  };
}
