import { describe, expect, test } from "vitest";
import { classifyViolation } from "../../extensions/enforcement-classifier.js";
import { STRICT_DEFAULTS, ADVISORY_DEFAULTS, type PipowersConfig } from "../../extensions/pipowers-config.js";

function makeConfig(overrides: Partial<PipowersConfig> = {}): PipowersConfig {
  return { ...STRICT_DEFAULTS, ...overrides } as PipowersConfig;
}

describe("classifyViolation", () => {
  test("returns null for read-only tool calls", () => {
    const result = classifyViolation({
      toolName: "read",
      input: { path: "src/foo.ts" },
      config: makeConfig(),
      workflowPhase: "execute",
      isPlanTrackerInitialized: true,
    });
    expect(result).toBeNull();
  });

  test("returns process violation for write during brainstorm to src/", () => {
    const result = classifyViolation({
      toolName: "write",
      input: { path: "src/foo.ts" },
      config: makeConfig(),
      workflowPhase: "brainstorm",
      isPlanTrackerInitialized: true,
    });
    expect(result?.bucket).toBe("process");
    expect(result?.subCategory).toBe("phase-boundary");
  });

  test("returns plan_tracker violation for protected-path write when not initialized", () => {
    const result = classifyViolation({
      toolName: "edit",
      input: { path: "src/foo.ts" },
      config: makeConfig(),
      workflowPhase: "execute",
      isPlanTrackerInitialized: false,
    });
    expect(result?.bucket).toBe("plan_tracker");
  });

  test("returns null for plan_tracker precondition in advisory mode", () => {
    const result = classifyViolation({
      toolName: "write",
      input: { path: "src/foo.ts" },
      config: { ...ADVISORY_DEFAULTS },
      workflowPhase: "execute",
      isPlanTrackerInitialized: false,
    });
    expect(result).toBeNull();
  });

  test("returns process violation for TDD new-feature write when TDD phase is idle", () => {
    const result = classifyViolation({
      toolName: "write",
      input: { path: "src/newFeature.ts" },
      config: makeConfig(),
      workflowPhase: "execute",
      isPlanTrackerInitialized: true,
      tddPhase: "idle",
    });
    expect(result?.bucket).toBe("process");
    expect(result?.subCategory).toBe("tdd-new-feature");
  });

  test("does not escalate TDD when phase is red-pending (modifying tested code)", () => {
    const result = classifyViolation({
      toolName: "edit",
      input: { path: "src/existing.ts" },
      config: makeConfig(),
      workflowPhase: "execute",
      isPlanTrackerInitialized: true,
      tddPhase: "red-pending",
    });
    // red-pending falls through to a practice violation (or null if no other bucket)
    expect(result?.bucket !== "process" || result?.subCategory !== "tdd-new-feature").toBe(true);
  });

  test("returns null for non-protected path in execute phase with plan initialized", () => {
    const result = classifyViolation({
      toolName: "write",
      input: { path: "README.md" },
      config: makeConfig(),
      workflowPhase: "execute",
      isPlanTrackerInitialized: true,
      tddPhase: "idle",
    });
    expect(result).toBeNull();
  });
});
