import assert from "node:assert/strict";
import test from "node:test";
import { detectApplicationSetup } from "../src/setup-detection.js";

test("infers a Next.js callback, package name, and configured dev port", () => {
  const setup = detectApplicationSetup({
    packageName: "@acme/storefront",
    framework: "nextjs",
    usesVite: false,
    devPort: 4100,
    callbackCandidates: ["src/app/api/auth/callback/route.ts"],
    publicEnvValues: {},
  });
  assert.deepEqual(setup, {
    name: "storefront",
    applicationType: "web",
    origin: "http://localhost:4100",
    redirectUri: "http://localhost:4100/api/auth/callback",
    postLogoutRedirectUri: "http://localhost:4100",
  });
});

test("uses a public app URL and SPA defaults when detected", () => {
  const setup = detectApplicationSetup({
    packageName: "portal",
    framework: "react",
    usesVite: true,
    devPort: null,
    callbackCandidates: [],
    publicEnvValues: { NEXT_PUBLIC_APP_URL: "https://portal.example/" },
  });
  assert.equal(setup.applicationType, "spa");
  assert.equal(setup.redirectUri, "https://portal.example/auth/callback");
});
