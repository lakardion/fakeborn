import { describe, expect, test } from "bun:test";

// Smoke test: proves the Bun test runner and the co-located `*.test.ts`
// convention are wired up. The real round-trip tests for `fake()` (a generated
// fake parses through its source schema) land with the tracer in #10 and follow
// this same pattern.
describe("smoke", () => {
  test("the test runner runs and assertions work", () => {
    expect(1 + 1).toBe(2);
  });
});
