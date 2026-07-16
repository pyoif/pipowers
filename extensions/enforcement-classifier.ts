/**
 * Enforcement classifier: bucketizes a tool call attempt into a violation
 * bucket (process | plan_tracker | practice | null) and decides whether
 * the bucket's strike limit and override config warrant a hard block.
 */

import { minimatch } from "minimatch";
import type { PipowersConfig } from "./pipowers-config.js";
import { isSourceFile } from "./workflow-monitor/heuristics.js";

export type Bucket = "process" | "plan_tracker" | "practice";
export type ProcessSubCategory = "phase-boundary" | "tdd-new-feature";

export interface ClassifierInput {
  toolName: string;
  input: Record<string, unknown>;
  config: PipowersConfig;
  workflowPhase: string | null;
  isPlanTrackerInitialized: boolean;
  tddPhase?: string;
}

export interface ClassifierResult {
  bucket: Bucket;
  subCategory?: ProcessSubCategory;
  shouldBlock: boolean;
  reason: string;
  attemptedPath: string;
  detail: Record<string, unknown>;
}

const WRITE_LIKE = new Set(["write", "edit"]);

function matchesProtectedPath(path: string, globs: string[]): boolean {
  if (isSourceFile(path)) return true;
  return globs.some((g) => minimatch(path, g, { dot: true }));
}

export function classifyViolation(input: ClassifierInput): ClassifierResult | null {
  const { toolName, config, workflowPhase, isPlanTrackerInitialized, tddPhase } = input;
  if (!WRITE_LIKE.has(toolName)) return null;
  const path = (input.input.path as string) ?? "";
  if (!path) return null;

  // Process: phase-boundary (brainstorm/plan phase, write outside docs/plans/)
  if ((workflowPhase === "brainstorm" || workflowPhase === "plan") && !path.startsWith("docs/plans/")) {
    return {
      bucket: "process",
      subCategory: "phase-boundary",
      shouldBlock: config.tunables.workflow.processStrikeLimit <= 1,
      reason: "process_violation",
      attemptedPath: path,
      detail: { currentPhase: workflowPhase, allowedPaths: ["docs/plans/"] },
    };
  }

  // Process: TDD new-feature (write to source while TDD is idle/green and no test seen)
  if (
    (tddPhase === "idle" || tddPhase === "green") &&
    config.tunables.workflow.processStrikeLimit <= 1 &&
    isSourceFile(path)
  ) {
    return {
      bucket: "process",
      subCategory: "tdd-new-feature",
      shouldBlock: true,
      reason: "tdd_violation",
      attemptedPath: path,
      detail: { tddPhase },
    };
  }

  // Plan tracker precondition
  if (
    config.tunables.planTracker.required &&
    !isPlanTrackerInitialized &&
    matchesProtectedPath(path, config.tunables.planTracker.protectedPaths)
  ) {
    return {
      bucket: "plan_tracker",
      shouldBlock: config.tunables.workflow.processStrikeLimit <= 1,
      reason: "plan_tracker_required",
      attemptedPath: path,
      detail: {},
    };
  }

  return null;
}
