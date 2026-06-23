import { describe, expect, test } from "vitest";
import { formatStatusWidget, pickMode, pickTunables } from "../../extensions/pipowers-config-ui.js";
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

describe("pickTunables", () => {
    test("returns the same tunables when user cancels", async () => {
        const start = STRICT_DEFAULTS.tunables;
        const result = await pickTunables({
            hasUI: true,
            ui: {
                select: async () => "Cancel",
                input: async () => "",
            },
        } as any, STRICT_DEFAULTS);
        expect(result).toEqual(start);
    });

    test("toggles planTracker.required off", async () => {
        let calls = 0;
        const result = await pickTunables({
            hasUI: true,
            ui: {
                select: async (title: string, options: string[]) => {
                    calls++;
                    if (calls === 1) return "Required: [✓]";
                    if (calls === 2) return "Save";
                    return options[0];
                },
                input: async () => "",
            },
        } as any, STRICT_DEFAULTS);
        expect(result.planTracker.required).toBe(false);
    });
});
