import assert from "node:assert/strict";
import test from "node:test";
import { resolveInitTarget, slugify } from "../src/target.js";

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function promptFor(selections, texts = []) {
  const seen = { choices: [], notes: [] };
  return {
    seen,
    async select(message, choices) {
      seen.choices.push({ message, choices });
      const next = selections.shift();
      return next === "last" ? choices.at(-1).value : next;
    },
    async text(message, defaultValue) {
      seen.choices.push({ message, defaultValue });
      return texts.shift() ?? defaultValue;
    },
    note(message) {
      seen.notes.push(message);
    },
  };
}

test("selects existing resources by human-readable choices", async () => {
  const prompt = promptFor(["tenant-2", "project-2"]);
  const fetchImpl = async (url) => {
    if (url.endsWith("/v1/tenants")) {
      return json([
        { id: "tenant-1", name: "First", slug: "first", status: "active", identity_type: "customer_identity" },
        { id: "tenant-2", name: "Acme", slug: "acme", status: "active", identity_type: "customer_identity" },
        { id: "workforce", name: "Internal", slug: "internal", status: "active", identity_type: "workforce_identity" },
      ]);
    }
    if (url.endsWith("/tenants/tenant-2/projects")) {
      return json([{ id: "project-2", name: "Store", slug: "store", status: "active" }]);
    }
    if (url.endsWith("/projects/project-2/environments")) {
      return json([
        { id: "env-test", slug: "test", display_name: "Test", environment_type: "test", status: "active" },
      ]);
    }
    throw new Error(`Unexpected request: ${url}`);
  };

  const target = await resolveInitTarget(
    { apiBase: "https://api.namoid.in" },
    {},
    { accessToken: "token", fetchImpl, prompt, suggestedProjectName: "Local app" },
  );

  assert.deepEqual(target, {
    tenantId: "tenant-2",
    projectId: "project-2",
    environmentId: "env-test",
    labels: { workspace: "Acme", project: "Store", environment: "Test" },
    created: { workspace: false, project: false },
  });
  assert.match(prompt.seen.choices[0].choices[1].label, /Acme/);
  assert.equal(prompt.seen.choices[0].choices.some((choice) => /Internal/.test(choice.label)), false);
  assert.deepEqual(prompt.seen.notes, ["Using Test environment."]);
});

test("offers atomic workspace and project creation when the account is empty", async () => {
  const prompt = promptFor(["last"], ["Acme Labs", "Identity Platform"]);
  let onboardingRequest;
  const fetchImpl = async (url, options) => {
    if (url.endsWith("/v1/tenants")) return json([]);
    if (url.endsWith("/v1/onboarding/workspaces")) {
      onboardingRequest = options;
      return json(
        {
          workspace: { id: "tenant-new", name: "Acme Labs", slug: "acme-labs" },
          project: { id: "project-new", name: "Identity Platform", slug: "identity-platform" },
          test_environment: { id: "env-new", display_name: "Test", slug: "test" },
        },
        201,
      );
    }
    throw new Error(`Unexpected request: ${url}`);
  };

  const target = await resolveInitTarget(
    { apiBase: "https://api.namoid.in" },
    {},
    { accessToken: "token", fetchImpl, prompt, suggestedProjectName: "Local app" },
  );

  assert.deepEqual(target, {
    tenantId: "tenant-new",
    projectId: "project-new",
    environmentId: "env-new",
    labels: { workspace: "Acme Labs", project: "Identity Platform", environment: "Test" },
    created: { workspace: true, project: true },
  });
  assert.match(onboardingRequest.headers["Idempotency-Key"], /^namoid-cli-workspace-/);
  assert.deepEqual(JSON.parse(onboardingRequest.body), {
    workspace_name: "Acme Labs",
    project_name: "Identity Platform",
    region: "in",
  });
});

test("offers project creation inside an existing workspace", async () => {
  const prompt = promptFor(["tenant-1", "last"], ["New Project"]);
  const fetchImpl = async (url, options) => {
    if (url.endsWith("/v1/tenants")) {
      return json([
        { id: "tenant-1", name: "Acme", slug: "acme", status: "active", identity_type: "customer_identity" },
      ]);
    }
    if (url.endsWith("/tenants/tenant-1/projects") && (!options.method || options.method === "GET")) {
      return json([]);
    }
    if (url.endsWith("/tenants/tenant-1/projects") && options.method === "POST") {
      assert.deepEqual(JSON.parse(options.body), {
        name: "New Project",
        slug: "new-project",
        description: null,
      });
      return json({ id: "project-new", name: "New Project", slug: "new-project", status: "active" }, 201);
    }
    if (url.endsWith("/projects/project-new/environments")) {
      return json([
        { id: "env-test", slug: "test", display_name: "Test", environment_type: "test", status: "active" },
      ]);
    }
    throw new Error(`Unexpected request: ${url}`);
  };

  const target = await resolveInitTarget(
    { apiBase: "https://api.namoid.in" },
    {},
    { accessToken: "token", fetchImpl, prompt, suggestedProjectName: "Local app" },
  );

  assert.equal(target.projectId, "project-new");
  assert.deepEqual(target.created, { workspace: false, project: true });
});

test("validates explicit automation overrides without prompting", async () => {
  const prompt = {
    select() {
      throw new Error("should not prompt");
    },
    text() {
      throw new Error("should not prompt");
    },
    note() {},
  };
  const fetchImpl = async (url) => {
    if (url.endsWith("/v1/tenants")) {
      return json([
        { id: "tenant-1", name: "Acme", slug: "acme", status: "active", identity_type: "customer_identity" },
      ]);
    }
    if (url.endsWith("/tenants/tenant-1/projects")) {
      return json([{ id: "project-1", name: "Store", slug: "store", status: "active" }]);
    }
    return json([
      { id: "env-1", slug: "test", display_name: "Test", environment_type: "test", status: "active" },
    ]);
  };

  const target = await resolveInitTarget(
    { apiBase: "https://api.namoid.in" },
    { tenantId: "tenant-1", projectId: "project-1", environmentId: "env-1" },
    { accessToken: "token", fetchImpl, prompt, suggestedProjectName: "Local app" },
  );
  assert.equal(target.environmentId, "env-1");
});

test("creates valid project slugs from short or decorated names", () => {
  assert.equal(slugify("My New App"), "my-new-app");
  assert.equal(slugify("A"), "a-app");
  assert.equal(slugify("✨"), "application");
});
