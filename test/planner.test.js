import assert from "node:assert/strict";
import test from "node:test";
import { buildOnboardingPlan } from "../src/planner.js";

test("uses Test by default and exposes stable action identifiers", () => {
  const project = {
    framework: "nextjs",
    packageName: "acme",
    sdkPackages: [],
    callbackCandidates: [],
  };
  const diagnosis = { summary: { passed: 1, warnings: 0, failed: 3 }, checks: [] };

  const plan = buildOnboardingPlan(project, diagnosis);

  assert.equal(plan.defaults.environment, "test");
  assert.equal(plan.actions[0].id, "auth.login");
  assert.ok(plan.actions.some((item) => item.id === "local.sdk.install"));
  assert.ok(plan.actions.some((item) => item.id === "local.callback.create"));
  assert.equal(plan.actions.find((item) => item.id === "validation.doctor").available, true);
});

test("keeps Console resource scope in the deterministic plan", () => {
  const project = {
    framework: "nextjs",
    packageName: "acme",
    sdkPackages: [],
    callbackCandidates: [],
  };
  const diagnosis = { summary: { passed: 1, warnings: 0, failed: 0 }, checks: [] };
  const target = { tenantId: "tenant-1", projectId: "project-1", environmentId: "env-1" };

  const plan = buildOnboardingPlan(project, diagnosis, target);

  assert.deepEqual(plan.target, target);
  assert.equal(plan.actions.find((item) => item.id === "remote.workspace").selectedId, "tenant-1");
  assert.equal(plan.actions.find((item) => item.id === "remote.project").selectedId, "project-1");
  assert.equal(plan.actions.find((item) => item.id === "remote.environment").selectedId, "env-1");
});
