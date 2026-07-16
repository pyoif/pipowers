import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import workflowMonitorExtension from "../../../extensions/workflow-monitor";
import { createFakePi, getSingleHandler } from "./test-helpers";

const ORIGINAL_HOME = process.env.HOME;
let TEST_HOME: string | null = null;

beforeEach(() => {
  // Isolate HOME so loadConfig doesn't pick up the developer's real config
  TEST_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "wfm-home-"));
  process.env.HOME = TEST_HOME;
  process.env.USERPROFILE = TEST_HOME;
});

afterEach(() => {
  if (TEST_HOME) {
    try {
      fs.rmSync(TEST_HOME, { recursive: true, force: true });
    } catch {}
    TEST_HOME = null;
  }
  if (ORIGINAL_HOME === undefined) {
    delete process.env.HOME;
  } else {
    process.env.HOME = ORIGINAL_HOME;
  }
  delete process.env.USERPROFILE;
});

function makeBrainstormState() {
  return [
    {
      type: "custom",
      customType: "workflow_tracker_state",
      data: {
        phases: {
          brainstorm: "active",
          plan: "pending",
          execute: "pending",
          verify: "pending",
          review: "pending",
          finish: "pending",
        },
        currentPhase: "brainstorm",
        artifacts: { brainstorm: null, plan: null, execute: null, verify: null, review: null, finish: null },
        prompted: { brainstorm: false, plan: false, execute: false, verify: false, review: false, finish: false },
      },
    },
  ];
}

describe("enforcement integration: classifier wired into tool_call", () => {
  test("strict-mode write to src during brainstorm returns blocked via ui.select prompt", async () => {
    const fake = createFakePi();
    const tempCwd = process.cwd();

    // Write strict-mode project config so loadConfig picks up strict defaults
    // AND nonInteractive.mode = "block" so the classifier actually fires the prompt
    fs.mkdirSync(path.join(tempCwd, ".pi"), { recursive: true });
    fs.writeFileSync(
      path.join(tempCwd, ".pi", "pipowers.toml"),
      `enforcement = "strict"\n[tunables.nonInteractive]\nmode = "block"\n`,
    );

    workflowMonitorExtension(fake.api as any);

    // Wait for the async loadConfig() IIFE to complete
    await new Promise((resolve) => setTimeout(resolve, 50));

    const onSessionSwitch = getSingleHandler(fake.handlers, "session_switch");
    const onToolCall = getSingleHandler(fake.handlers, "tool_call");

    let promptTitle: string | undefined;
    let promptOptions: string[] | undefined;
    const ctx = {
      hasUI: true,
      sessionManager: { getBranch: () => makeBrainstormState() },
      ui: {
        setWidget: () => {},
        select: async (title: string, options: string[]) => {
          promptTitle = title;
          promptOptions = options;
          return "Stop";
        },
        setEditorText: () => {},
        notify: () => {},
      },
    };

    await onSessionSwitch({}, ctx);

    const res = await onToolCall(
      { toolCallId: "w1", toolName: "write", input: { path: "src/foo.ts", content: "x" } },
      ctx,
    );

    // The classifier-based prompt fired with the expected options
    expect(promptTitle).toBeDefined();
    expect(promptTitle).toContain("brainstorm");
    expect(promptTitle).toContain("src/foo.ts");
    expect(promptOptions).toBeDefined();
    expect(promptOptions).toContain("Advance to next phase (recommended)");
    expect(promptOptions).toContain("Override (let it through this once)");
    expect(promptOptions).toContain("Stop");

    // User picked "Stop" → handler blocked the tool call
    expect(res).toEqual({
      blocked: true,
      reason: "process_violation",
      attemptedPath: "src/foo.ts",
    });
  });
});
