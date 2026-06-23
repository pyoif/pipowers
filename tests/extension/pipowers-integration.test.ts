import { describe, expect, test } from "vitest";
import { classifyViolation } from "../../extensions/enforcement-classifier.js";
import { saveConfig, loadConfig, _resetForTest } from "../../extensions/pipowers-config.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

function withTempSetup<T>(fn: (home: string, cwd: string) => Promise<T>): Promise<T> {
    return new Promise(async (resolve, reject) => {
        const home = fs.mkdtempSync(path.join(os.tmpdir(), "pipwr-int-home-"));
        const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pipwr-int-cwd-"));
        _resetForTest({ home, cwd });
        try { resolve(await fn(home, cwd)); } catch (e) { reject(e); }
        finally {
            fs.rmSync(home, { recursive: true, force: true });
            fs.rmSync(cwd, { recursive: true, force: true });
        }
    });
}

describe("end-to-end strict mode", () => {
    test("strict + plan_tracker not init + write to src => plan_tracker violation", async () => {
        await withTempSetup(async () => {
            await saveConfig("global", { enforcement: "strict" });
            const { config } = await loadConfig();
            const v = classifyViolation({
                toolName: "write",
                input: { path: "src/foo.ts" },
                config,
                workflowPhase: "execute",
                isPlanTrackerInitialized: false,
            });
            expect(v?.bucket).toBe("plan_tracker");
        });
    });

    test("strict + plan_tracker init + brainstorm + write to src => phase-boundary process violation", async () => {
        await withTempSetup(async () => {
            await saveConfig("global", { enforcement: "strict" });
            const { config } = await loadConfig();
            const v = classifyViolation({
                toolName: "write",
                input: { path: "src/foo.ts" },
                config,
                workflowPhase: "brainstorm",
                isPlanTrackerInitialized: true,
            });
            expect(v?.bucket).toBe("process");
            expect(v?.subCategory).toBe("phase-boundary");
        });
    });

    test("advisory + write to src + no plan => null (no violation)", async () => {
        await withTempSetup(async () => {
            await saveConfig("global", { enforcement: "advisory" });
            const { config } = await loadConfig();
            const v = classifyViolation({
                toolName: "write",
                input: { path: "src/foo.ts" },
                config,
                workflowPhase: "execute",
                isPlanTrackerInitialized: false,
            });
            expect(v).toBeNull();
        });
    });

    test("config round-trips: save then load then classify", async () => {
        await withTempSetup(async () => {
            await saveConfig("project", { enforcement: "strict" });
            const { config, effectiveSource } = await loadConfig();
            expect(config.enforcement).toBe("strict");
            expect(effectiveSource).toBe("project");
        });
    });
});
