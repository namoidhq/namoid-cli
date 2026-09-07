import assert from "node:assert/strict";
import test from "node:test";
import { AGENT_IDS, AGENTS, parseAgentSelection, resolveAgent } from "../src/agents.js";

test("ships every first-class agent and the portable fallback", () => {
  assert.deepEqual(AGENT_IDS, [
    "codex",
    "claude",
    "cursor",
    "gemini",
    "antigravity",
    "copilot",
    "generic",
  ]);
  assert.equal(AGENTS.copilot.mcp, "copilot-local");
  assert.equal(AGENTS.generic.mcp, "skills-only");
});

test("resolves aliases and de-duplicates multi-agent selections", () => {
  assert.equal(resolveAgent("github-copilot"), AGENTS.copilot);
  assert.equal(resolveAgent("anti-gravity"), AGENTS.antigravity);
  assert.deepEqual(
    parseAgentSelection(["codex,cursor", "openai"]).map((agent) => agent.id),
    ["codex", "cursor"],
  );
});

test("rejects unknown agents", () => {
  assert.throws(() => parseAgentSelection(["unknown"]), /Unsupported AI agent/);
});
