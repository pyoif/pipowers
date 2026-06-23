/**
 * Pipowers config: types, defaults, deep merge, mode resolution.
 * Owns the TOML config files at ~/.pi/agent/pipowers.toml and .pi/pipowers.toml.
 */

export type Enforcement = "advisory" | "strict" | "custom";

export type NonInteractiveMode = "advisory" | "block";

export interface PipowersConfig {
    enforcement: Enforcement;
    tunables: {
        planTracker: {
            required: boolean;
            protectedPaths: string[];
        };
        workflow: {
            processStrikeLimit: number;
            practiceStrikeLimit: number;
            allowOverride: boolean;
        };
        nonInteractive: {
            mode: NonInteractiveMode;
        };
    };
}

export const DEFAULT_PROTECTED_PATHS = [
    "src/**",
    "tests/**",
    "test/**",
    "**/*.test.ts",
    "**/*.spec.ts",
];

export const ADVISORY_DEFAULTS: PipowersConfig = {
    enforcement: "advisory",
    tunables: {
        planTracker: { required: false, protectedPaths: [...DEFAULT_PROTECTED_PATHS] },
        workflow: { processStrikeLimit: 999, practiceStrikeLimit: 2, allowOverride: true },
        nonInteractive: { mode: "advisory" },
    },
};

export const STRICT_DEFAULTS: PipowersConfig = {
    enforcement: "strict",
    tunables: {
        planTracker: { required: true, protectedPaths: [...DEFAULT_PROTECTED_PATHS] },
        workflow: { processStrikeLimit: 1, practiceStrikeLimit: 2, allowOverride: true },
        nonInteractive: { mode: "advisory" },
    },
};

export function deepMerge<T extends Record<string, any>>(base: T, overlay: T): T {
    if (overlay === undefined || overlay === null) return base;
    if (base === undefined || base === null) return overlay;
    if (Array.isArray(base) || Array.isArray(overlay)) return overlay;
    if (typeof base !== "object" || typeof overlay !== "object") return overlay;
    const out: Record<string, any> = { ...base };
    for (const key of Object.keys(overlay)) {
        const baseVal = (base as any)[key];
        const overlayVal = (overlay as any)[key];
        if (overlayVal === undefined) continue;
        if (
            baseVal !== null &&
            overlayVal !== null &&
            typeof baseVal === "object" &&
            typeof overlayVal === "object" &&
            !Array.isArray(baseVal) &&
            !Array.isArray(overlayVal)
        ) {
            out[key] = deepMerge(baseVal, overlayVal);
        } else {
            out[key] = overlayVal;
        }
    }
    return out as T;
}

export function resolveMode(input: Partial<PipowersConfig>): PipowersConfig {
    const mode = input.enforcement ?? "advisory";
    if (mode === "strict") {
        // Strict: start from strict defaults, overlay any user tunables the user
        // explicitly set (so users can still customize protectedPaths etc.)
        return deepMerge(STRICT_DEFAULTS, input as PipowersConfig);
    }
    if (mode === "custom") {
        // Custom: deep-merge advisory defaults with whatever the user provided
        return deepMerge(ADVISORY_DEFAULTS, input as PipowersConfig);
    }
    // Advisory: start from advisory defaults, overlay user tunables
    return deepMerge(ADVISORY_DEFAULTS, input as PipowersConfig);
}
