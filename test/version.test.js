import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { CLI_VERSION } from "../src/version.js";

test("runtime version matches the npm package version", async () => {
  const packageJson = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );

  assert.equal(CLI_VERSION, packageJson.version);
});
