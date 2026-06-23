import { describe, expect, test } from "vitest";
import { formatStatusWidget, pickMode } from "../../extensions/pipowers-config-ui.js";
import { STRICT_DEFAULTS, ADVISORY_DEFAULTS } from "../../extensions/pipowers-config.js";

describe("formatStatusWidget", () => {
  test("returns empty string in advisory mode with no plan", () => {
    expect(formatStatusWidget(ADVISORY_DEFAULTS, [], "default")).toBe("");
  });

  test("returns mode line in strict mode", () => {
    const out = formatStatusWidget(STRICT_DEFAULTS, [], "default");
    expect(out).toContain("STRICT");
    expect(out).toContain("/pipwr_config");
  });

  test("includes plan tracker icons when plan has tasks", () => {
    const out = formatStatusWidget(
      STRICT_DEFAULTS,
      [
        { name: "task1", status: "complete" },
        { name: "task2", status: "pending" },
      ],
      "default",
    );
    expect(out).toContain("✓");
    expect(out).toContain("○");
  });
});

describe("pickMode", () => {
    test("returns the chosen mode", async () => {
        const chosen = await pickMode({
            hasUI: true,
            ui: { select: async () => "Strict" },
        } as any, "advisory");
        expect(chosen).toBe("strict");
    });

    test("returns current mode on cancel", async () => {
        const chosen = await pickMode({
            hasUI: true,
            ui: { select: async () => "Cancel" },
        } as any, "strict");
        expect(chosen).toBe("strict");
    });
});
