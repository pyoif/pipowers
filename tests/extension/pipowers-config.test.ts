import { describe, expect, test } from "vitest";
import { deepMerge, resolveMode, ADVISORY_DEFAULTS, STRICT_DEFAULTS, loadConfig, _resetForTest } from "../../extensions/pipowers-config.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

describe("deepMerge", () => {
    test("merges nested objects without mutating inputs", () => {
        const a = { x: 1, nested: { y: 2, z: 3 } };
        const b = { nested: { y: 99 } };
        const result = deepMerge(a, b);
        expect(result).toEqual({ x: 1, nested: { y: 99, z: 3 } });
        // Originals unchanged
        expect(a).toEqual({ x: 1, nested: { y: 2, z: 3 } });
        expect(b).toEqual({ nested: { y: 99 } });
    });

    test("later values win on scalar conflict", () => {
        expect(deepMerge({ a: 1 }, { a: 2 })).toEqual({ a: 2 });
    });

    test("arrays are replaced, not merged", () => {
        expect(deepMerge({ list: [1, 2, 3] }, { list: [4] })).toEqual({ list: [4] });
    });

    test("treats undefined values as missing", () => {
        expect(deepMerge({ a: 1 }, { a: undefined as any })).toEqual({ a: 1 });
    });
});

describe("ADVISORY_DEFAULTS", () => {
    test("plan tracker not required, strikes disabled", () => {
        expect(ADVISORY_DEFAULTS.enforcement).toBe("advisory");
        expect(ADVISORY_DEFAULTS.tunables.planTracker.required).toBe(false);
        expect(ADVISORY_DEFAULTS.tunables.workflow.processStrikeLimit).toBe(999);
        expect(ADVISORY_DEFAULTS.tunables.workflow.practiceStrikeLimit).toBe(2);
        expect(ADVISORY_DEFAULTS.tunables.nonInteractive.mode).toBe("advisory");
    });
});

describe("STRICT_DEFAULTS", () => {
    test("plan tracker required, process = 1, override allowed", () => {
        expect(STRICT_DEFAULTS.enforcement).toBe("strict");
        expect(STRICT_DEFAULTS.tunables.planTracker.required).toBe(true);
        expect(STRICT_DEFAULTS.tunables.workflow.processStrikeLimit).toBe(1);
        expect(STRICT_DEFAULTS.tunables.workflow.practiceStrikeLimit).toBe(2);
        expect(STRICT_DEFAULTS.tunables.workflow.allowOverride).toBe(true);
    });
});

function withTempHome<T>(fn: (home: string, cwd: string) => Promise<T> | T): Promise<T> {
    return new Promise(async (resolve, reject) => {
        const home = fs.mkdtempSync(path.join(os.tmpdir(), "pipowers-home-"));
        const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pipowers-cwd-"));
        _resetForTest({ home, cwd });
        try {
            resolve(await fn(home, cwd));
        } catch (err) {
            reject(err);
        } finally {
            fs.rmSync(home, { recursive: true, force: true });
            fs.rmSync(cwd, { recursive: true, force: true });
        }
    });
}

describe("loadConfig", () => {
    test("returns advisory defaults when neither file exists (no disk write)", async () => {
        await withTempHome(async (home, cwd) => {
            const result = await loadConfig();
            expect(result.config.enforcement).toBe("advisory");
            expect(result.config.tunables.planTracker.required).toBe(false);
            // No file should have been created
            expect(fs.existsSync(path.join(home, ".pi", "agent", "pipowers.toml"))).toBe(false);
            expect(fs.existsSync(path.join(cwd, ".pi", "pipowers.toml"))).toBe(false);
        });
    });

    test("returns global values when only global exists", async () => {
        await withTempHome(async (home) => {
            fs.mkdirSync(path.join(home, ".pi", "agent"), { recursive: true });
            fs.writeFileSync(
                path.join(home, ".pi", "agent", "pipowers.toml"),
                'enforcement = "strict"\n',
            );
            const result = await loadConfig();
            expect(result.config.enforcement).toBe("strict");
            expect(result.config.tunables.planTracker.required).toBe(true);
        });
    });

    test("project overrides global per leaf", async () => {
        await withTempHome(async (home, cwd) => {
            fs.mkdirSync(path.join(home, ".pi", "agent"), { recursive: true });
            fs.writeFileSync(
                path.join(home, ".pi", "agent", "pipowers.toml"),
                'enforcement = "advisory"\n',
            );
            fs.mkdirSync(path.join(cwd, ".pi"), { recursive: true });
            fs.writeFileSync(
                path.join(cwd, ".pi", "pipowers.toml"),
                'enforcement = "strict"\n',
            );
            const result = await loadConfig();
            expect(result.config.enforcement).toBe("strict");
        });
    });

    test("malformed TOML returns defaults and reports error", async () => {
        await withTempHome(async (home) => {
            fs.mkdirSync(path.join(home, ".pi", "agent"), { recursive: true });
            fs.writeFileSync(
                path.join(home, ".pi", "agent", "pipowers.toml"),
                "this is = not valid toml [[[",
            );
            const result = await loadConfig();
            expect(result.config.enforcement).toBe("advisory");
        });
    });
});
