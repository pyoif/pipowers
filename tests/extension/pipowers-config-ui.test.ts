import { describe, expect, test } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { createConfigWatcher, formatStatusWidget, pickMode, pickTunables } from "../../extensions/pipowers-config-ui.js";
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

test("createConfigWatcher invokes onChange after a debounced file change", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "pipwr-watch-"));
    const project = fs.mkdtempSync(path.join(os.tmpdir(), "pipwr-watch-"));
    fs.mkdirSync(path.join(project, ".pi"), { recursive: true });
    const configFile = path.join(project, ".pi", "pipowers.toml");
    fs.writeFileSync(configFile, 'enforcement = "advisory"\n');

    let calls = 0;
    const watcher = createConfigWatcher({
        projectPath: configFile,
        onChange: () => { calls += 1; },
        debounceMs: 30,
    });
    watcher.start();

    await new Promise((r) => setTimeout(r, 100));
    fs.writeFileSync(configFile, 'enforcement = "strict"\n');
    await new Promise((r) => setTimeout(r, 200));

    expect(calls).toBeGreaterThanOrEqual(1);
    watcher.stop();
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(project, { recursive: true, force: true });
});
