/**
 * Pipowers config: types, defaults, deep merge, mode resolution.
 * Owns the TOML config files at ~/.pi/agent/pipowers.toml and .pi/pipowers.toml.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { parse as parseToml } from "smol-toml";
import { stringify as stringifyToml } from "smol-toml";
import { log } from "./logging.js";

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

let _testPaths: { home: string; cwd: string } | null = null;

export function _resetForTest(paths: { home: string; cwd: string } | null): void {
    _testPaths = paths;
}

function getHomeDir(): string {
    if (_testPaths) return _testPaths.home;
    return process.env.HOME || process.env.USERPROFILE || os.homedir();
}

function getCwd(): string {
    if (_testPaths) return _testPaths.cwd;
    return process.cwd();
}

export function globalConfigPath(): string {
    return path.join(getHomeDir(), ".pi", "agent", "pipowers.toml");
}

export function projectConfigPath(): string {
    return path.join(getCwd(), ".pi", "pipowers.toml");
}

export type ConfigLayer = "global" | "project";

export async function saveConfig(layer: ConfigLayer, change: Partial<PipowersConfig>): Promise<void> {
    const target = layer === "global" ? globalConfigPath() : projectConfigPath();
    const tmp = target + ".tmp";

    let existing: Record<string, any> = {};
    if (fs.existsSync(target)) {
        try {
            existing = parseToml(fs.readFileSync(target, "utf-8")) as Record<string, any>;
        } catch (err) {
            log.error(
                `Refusing to overwrite malformed ${target}. Fix the file first.`,
            );
            throw err;
        }
    }

    const merged = deepMerge(existing, change as any);
    const toml = stringifyToml(merged);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(tmp, toml);
    fs.renameSync(tmp, target);
}

export interface LoadResult {
    config: PipowersConfig;
    /** Which file currently drives the effective config, or null if neither exists. */
    effectiveSource: "global" | "project" | null;
    /** Per-leaf provenance. */
    provenance: {
        enforcement: "global" | "project" | "default";
        tunables: {
            planTracker: { required: "global" | "project" | "default"; protectedPaths: "global" | "project" | "default" };
            workflow: {
                processStrikeLimit: "global" | "project" | "default";
                practiceStrikeLimit: "global" | "project" | "default";
                allowOverride: "global" | "project" | "default";
            };
            nonInteractive: { mode: "global" | "project" | "default" };
        };
    };
}

export async function loadConfig(): Promise<LoadResult> {
    const globalPath = globalConfigPath();
    const projectPath = projectConfigPath();
    const globalExists = fs.existsSync(globalPath);
    const projectExists = fs.existsSync(projectPath);

    if (!globalExists && !projectExists) {
        return {
            config: ADVISORY_DEFAULTS,
            effectiveSource: null,
            provenance: emptyProvenance("default"),
        };
    }

    let globalParsed: Partial<PipowersConfig> = {};
    let projectParsed: Partial<PipowersConfig> = {};

    if (globalExists) {
        try {
            globalParsed = parseToml(fs.readFileSync(globalPath, "utf-8")) as Partial<PipowersConfig>;
        } catch (err) {
            log.error(
                `Failed to parse ${globalPath}: ${err instanceof Error ? err.message : err}. Using defaults.`,
            );
        }
    }

    if (projectExists) {
        try {
            projectParsed = parseToml(fs.readFileSync(projectPath, "utf-8")) as Partial<PipowersConfig>;
        } catch (err) {
            log.error(
                `Failed to parse ${projectPath}: ${err instanceof Error ? err.message : err}. Using defaults.`,
            );
        }
    }

    const merged = deepMerge(globalParsed, projectParsed) as Partial<PipowersConfig>;
    const resolved = resolveMode(merged);

    return {
        config: resolved,
        effectiveSource: projectExists ? "project" : globalExists ? "global" : null,
        provenance: computeProvenance(globalParsed, projectParsed),
    };
}

function emptyProvenance(source: "global" | "project" | "default"): LoadResult["provenance"] {
    const tag = (): "global" | "project" | "default" => source;
    return {
        enforcement: tag(),
        tunables: {
            planTracker: { required: tag(), protectedPaths: tag() },
            workflow: { processStrikeLimit: tag(), practiceStrikeLimit: tag(), allowOverride: tag() },
            nonInteractive: { mode: tag() },
        },
    };
}

function computeProvenance(
    global: Partial<PipowersConfig>,
    project: Partial<PipowersConfig>,
): LoadResult["provenance"] {
    const sourceFor = (leafCheck: () => boolean): "global" | "project" | "default" => {
        if (project && leafCheck.call(project)) return "project";
        if (global && leafCheck.call(global)) return "global";
        return "default";
    };
    return {
        enforcement: sourceFor(function (this: any) {
            return this.enforcement !== undefined;
        }),
        tunables: {
            planTracker: {
                required: sourceFor(function (this: any) {
                    return this.tunables?.planTracker?.required !== undefined;
                }),
                protectedPaths: sourceFor(function (this: any) {
                    return this.tunables?.planTracker?.protectedPaths !== undefined;
                }),
            },
            workflow: {
                processStrikeLimit: sourceFor(function (this: any) {
                    return this.tunables?.workflow?.processStrikeLimit !== undefined;
                }),
                practiceStrikeLimit: sourceFor(function (this: any) {
                    return this.tunables?.workflow?.practiceStrikeLimit !== undefined;
                }),
                allowOverride: sourceFor(function (this: any) {
                    return this.tunables?.workflow?.allowOverride !== undefined;
                }),
            },
            nonInteractive: {
                mode: sourceFor(function (this: any) {
                    return this.tunables?.nonInteractive?.mode !== undefined;
                }),
            },
        },
    };
}

export async function detectLegacyConfig(): Promise<boolean> {
    const candidates = [
        path.join(getHomeDir(), ".pi", "agent", "config.json"),
        path.join(getCwd(), ".pi", "settings.json"),
    ];
    let found = false;
    for (const file of candidates) {
        if (!fs.existsSync(file)) continue;
        try {
            const data = JSON.parse(fs.readFileSync(file, "utf-8"));
            if (data && typeof data === "object" && "pi-superpowers-plus" in data) {
                log.warn(
                    `Detected legacy \`pi-superpowers-plus\` config key in ${file}. ` +
                    `pipowers uses its own TOML config files. Run /pipwr_config to set up the new config.`,
                );
                found = true;
            }
        } catch {
            // ignore parse errors here; loadConfig handles them
        }
    }
    return found;
}
