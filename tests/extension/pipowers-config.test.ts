import { describe, expect, test } from "vitest";
import { deepMerge, resolveMode, ADVISORY_DEFAULTS, STRICT_DEFAULTS } from "../../extensions/pipowers-config.js";

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
