import { describe, expect, test } from "vitest";
import { formatStatusWidget } from "../../extensions/pipowers-config-ui.js";
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
