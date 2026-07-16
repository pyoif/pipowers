# Pipowers Enforcement Tiers & Standalone Rebrand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename `pi-superpowers-plus` to standalone `pipowers`, add opt-in strict enforcement mode (process violations and TDD new-feature writes hard-block on 1st strike; plan_tracker init becomes a precondition for protected-path writes), and ship a TOML config system with a TUI widget and `/pipwr_config` slash command picker.

**Architecture:**
- New `extensions/pipowers-config.ts` module owns TOML load/save/resolve. Two files: `~/.pi/agent/pipowers.toml` (global) and `.pi/pipowers.toml` (project). Project wins on conflict.
- New `extensions/enforcement-classifier.ts` bucketizes violations into `process | plan_tracker | practice | null` and consults the current effective config to decide warning vs. hard-block.
- `extensions/workflow-monitor.ts` extends its existing `handleToolCall` path to call the classifier, then either inject a warning, return `blocked: true`, or fire a `ui.select` prompt for process/plan_tracker violations.
- `extensions/plan-tracker.ts` tracks a new `initialized` boolean in the persisted state. The first `plan_tracker.init` call flips it to `true`.
- `extensions/pipowers-config-ui.ts` adds a TUI widget slot and a `/pipwr_config` slash command with a two-screen picker (mode + tunables).

**Tech Stack:** TypeScript, Vitest, `smol-toml` (TOML parse/serialize), existing pi extension API (`ExtensionAPI`, `ExtensionContext`, `ctx.ui.select`, `ctx.ui.setWidget`).

**Spec:** `docs/plans/2026-06-23-pipowers-enforcement-and-rebrand-design.md` (this branch: `pipowers-enforcement-rebrand`).

## Global Constraints

These constraints apply to every task:

- **Node module style:** ESM with `.ts` extensions on relative imports. The existing codebase uses `.js` extensions on import specifiers (TypeScript ESM convention) — match the existing style in `extensions/workflow-monitor.ts`.
- **No new dev-time lint rules.** `biome.json` is the source of truth; new code must pass `npm run lint`.
- **Tests:** Vitest with `vi.fn()` mocks. New test files live in `tests/extension/<mirror-path>.test.ts`.
- **Atomic file writes:** every config file write uses `writeFile(target + ".tmp", content)` then `rename(target + ".tmp", target)`. Never write directly to the target.
- **Logging:** use `log.info`, `log.warn`, `log.error` from `extensions/logging.ts`. Never `console.log`.
- **Package rename:** the npm package name is `pipowers` (was `pi-superpowers-plus`). All references to the old name in user-facing copy, settings keys, and state file paths are updated; the old `pi-superpowers-plus` config key is detected and logged (no silent migration).
- **No state loss for upgrade.** Old `.pi/superpowers-state.json` is read as fallback when `.pi/pipowers-state.json` is missing. The state file schema version is bumped from 1 to 2; old version 1 files are read with `planTracker.initialized` defaulting to `false`.
- **Backward-compatible defaults.** A user upgrading from `pi-superpowers-plus` who never touches the new config must see the current advisory behavior — no enforcement, no plan_tracker required.
- **Skill names referenced:** `brainstorming`, `writing-plans`, `executing-plans`, `subagent-driven-development`, `verification-before-completion`, `requesting-code-review`, `finishing-a-development-branch`. These map 1:1 to workflow phases (see `extensions/workflow-monitor/workflow-tracker.ts` `SKILL_TO_PHASE`).

---

## Phase 1 — Rebrand

### Task 1: Rebrand package + assets + docs

**Files:**
- Modify: `package.json` (top-level metadata + `pi.extensions` paths unchanged)
- Create: `banner.jpg` (placeholder single banner)
- Delete: `banner-plus.jpg`
- Rewrite: `README.md`
- Modify: `CHANGELOG.md` (prepend new entry)

**Step 1: Update `package.json`**

Replace the top-level fields:

```json
{
  "name": "pipowers",
  "version": "0.5.0",
  "description": "Workflow skills and runtime enforcement for pi",
  "keywords": [
    "pi-package",
    "workflow",
    "enforcement"
  ]
}
```

Leave `peerDependencies`, `devDependencies`, `scripts`, `license`, `author`, `repository`, `files`, and the `pi` block untouched.

**Step 2: Replace banner assets**

Keep `banner.jpg` as the canonical banner (used in README). Delete `banner-plus.jpg`:

```bash
rm banner-plus.jpg
```

If `banner.jpg` still shows the old "pi-superpowers-plus" branding, the README can drop the `<img>` reference; the rest of the README stands without it. (Asset replacement is a follow-up task — the copy lives.)

**Step 3: Rewrite `README.md`**

Replace the file with:

```markdown
# pipowers

![pipowers banner](banner.jpg)

Workflow skills and runtime enforcement for [pi](https://github.com/badlogic/pi-mono).

Your coding agent doesn't just know the rules - it follows them. Skills teach the agent *what* to do (brainstorm before building, write tests before code, verify before claiming done). Extensions enforce it in real time.

## What You Get

**12 workflow skills** that guide the agent through structured development.

**3 extensions** that run silently in the background:
- **Workflow Monitor** — phase-aware write enforcement, TDD warnings, debug cycle tracking, verification gating, branch safety, and on-demand reference content.
- **Subagent** — registers a `subagent` tool for dispatching implementation and review work to isolated subprocess agents.
- **Plan Tracker** — tracks task progress with a TUI widget.

## Enforcement Modes

pipowers ships with three modes. The default is **advisory** (warnings only, no blocking) so existing users see no behavior change.

| Mode | Process violations | TDD new-feature writes | Plan tracker required | Override |
| --- | --- | --- | --- | --- |
| `advisory` (default) | warn | warn | no | n/a |
| `strict` | hard block 1st strike | hard block 1st strike | yes | allowed |
| `custom` | configurable | configurable | configurable | configurable |

Run `/pipwr_config` to change mode or tunables. Config is TOML, lives in `~/.pi/agent/pipowers.toml` (global) and `.pi/pipowers.toml` (project). Project wins on conflict.

## Install

```bash
pi install npm:pipowers
```

Or from git:

```bash
pi install git:github.com/coctostan/pipowers
```

Or add to `.pi/settings.json` (project) or `~/.pi/agent/config.json` (global):

```json
{
  "packages": ["npm:pipowers"]
}
```

## Credits

pipowers evolved from [pi-superpowers-plus](https://github.com/coctostan/pi-superpowers-plus), which itself was an active-enforcement extension of [pi-superpowers](https://github.com/coctostan/pi-superpowers). It is now a standalone package. Thanks to the original authors for the workflow design.
```

**Step 4: Add CHANGELOG entry**

Prepend to `CHANGELOG.md`:

```markdown
## 0.5.0 — 2026-06-23

Renamed from `pi-superpowers-plus` to `pipowers`. Standalone rebrand.

Added: opt-in strict enforcement mode. Process violations (wrong-phase writes, plan_tracker precondition failures, TDD write-order on new features) hard-block on the 1st strike with a UI confirm-prompt. Plan tracker init becomes a precondition for protected-path writes when enabled. Configuration via TOML (`~/.pi/agent/pipowers.toml` and `.pi/pipowers.toml`) with a `/pipwr_config` slash command picker and a TUI status widget.

Default behavior is unchanged (advisory mode). Upgrade by updating the package and removing the old `pi-superpowers-plus` config key if present.

```

(Leave the rest of the CHANGELOG intact.)

**Step 5: Verify the changes**

Run: `npm run lint`
Expected: PASS

Run: `cat package.json | head -20`
Expected: `name: "pipowers"`, `version: "0.5.0"`, updated description/keywords.

**Step 6: Commit**

```bash
git add package.json README.md CHANGELOG.md
git add -A banner-plus.jpg banner.jpg
git commit -m "feat(rebrand): rename to pipowers v0.5.0 standalone

- package.json: name, version, description, keywords
- README: full rewrite with pipowers identity, credits, modes table
- CHANGELOG: 0.5.0 entry covering rebrand and strict enforcement
- banner: drop banner-plus.jpg, keep single banner.jpg"
```

---

## Phase 2 — TOML Config Module

### Task 2: Config types + deep merge

**Files:**
- Create: `extensions/pipowers-config.ts`
- Create: `tests/extension/pipowers-config.test.ts`

**Step 1: Write the failing test**

```ts
// tests/extension/pipowers-config.test.ts
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
```

**Step 2: Run the test, verify it fails**

Run: `npx vitest run tests/extension/pipowers-config.test.ts`
Expected: FAIL — module not found.

**Step 3: Implement the types, defaults, and deep merge**

Create `extensions/pipowers-config.ts`:

```ts
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
```

**Step 4: Run the test, verify it passes**

Run: `npx vitest run tests/extension/pipowers-config.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add extensions/pipowers-config.ts tests/extension/pipowers-config.test.ts
git commit -m "feat(config): add types, defaults, deep merge, mode resolver"
```

---

### Task 3: TOML load (read both files, validate, return effective config)

**Files:**
- Modify: `extensions/pipowers-config.ts`
- Modify: `tests/extension/pipowers-config.test.ts`

**Step 1: Add the failing tests**

Append to `tests/extension/pipowers-config.test.ts`:

```ts
import { loadConfig, saveConfig, _resetForTest } from "../../extensions/pipowers-config.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

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
            const config = await loadConfig();
            expect(config.enforcement).toBe("advisory");
            expect(config.tunables.planTracker.required).toBe(false);
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
            const config = await loadConfig();
            expect(config.enforcement).toBe("strict");
            expect(config.tunables.planTracker.required).toBe(true);
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
            const config = await loadConfig();
            expect(config.enforcement).toBe("strict");
        });
    });

    test("malformed TOML returns defaults and reports error", async () => {
        await withTempHome(async (home) => {
            fs.mkdirSync(path.join(home, ".pi", "agent"), { recursive: true });
            fs.writeFileSync(
                path.join(home, ".pi", "agent", "pipowers.toml"),
                "this is = not valid toml [[[",
            );
            const config = await loadConfig();
            expect(config.enforcement).toBe("advisory");
        });
    });
});
```

**Step 2: Run the test, verify it fails**

Run: `npx vitest run tests/extension/pipowers-config.test.ts -t "loadConfig"`
Expected: FAIL — `loadConfig` and `_resetForTest` not exported.

**Step 3: Implement loadConfig and _resetForTest**

Add to `extensions/pipowers-config.ts`:

```ts
import * as fs from "node:fs";
import * as path from "node:path";
import { parse as parseToml } from "smol-toml";
import { log } from "./logging.js";

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
```

**Step 4: Add `smol-toml` to dependencies**

Run: `npm install --save smol-toml`
Verify: `cat package.json | grep smol-toml`
Expected: `"smol-toml": "..."` appears under `dependencies`.

**Step 5: Run the test, verify it passes**

Run: `npx vitest run tests/extension/pipowers-config.test.ts -t "loadConfig"`
Expected: PASS

**Step 6: Commit**

```bash
git add extensions/pipowers-config.ts tests/extension/pipowers-config.test.ts package.json package-lock.json
git commit -m "feat(config): TOML load with project-overrides-global and provenance"
```

---

### Task 4: TOML save (delta write, atomic, create-if-missing)

**Files:**
- Modify: `extensions/pipowers-config.ts`
- Modify: `tests/extension/pipowers-config.test.ts`

**Step 1: Add the failing tests**

Append to the test file:

```ts
describe("saveConfig", () => {
    test("creates file at global path with just the change when file does not exist", async () => {
        await withTempHome(async (home) => {
            await saveConfig("global", { enforcement: "strict" });
            const written = fs.readFileSync(
                path.join(home, ".pi", "agent", "pipowers.toml"),
                "utf-8",
            );
            expect(written).toContain('enforcement = "strict"');
        });
    });

    test("creates file at project path with just the change when project file does not exist", async () => {
        await withTempHome(async (_home, cwd) => {
            await saveConfig("project", { enforcement: "custom" });
            const written = fs.readFileSync(path.join(cwd, ".pi", "pipowers.toml"), "utf-8");
            expect(written).toContain('enforcement = "custom"');
        });
    });

    test("deep-merges into existing file (preserves unrelated keys)", async () => {
        await withTempHome(async (home) => {
            const target = path.join(home, ".pi", "agent", "pipowers.toml");
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.writeFileSync(target, 'enforcement = "advisory"\nunrelated = "keep me"\n');
            await saveConfig("global", { enforcement: "strict" });
            const written = fs.readFileSync(target, "utf-8");
            expect(written).toContain('enforcement = "strict"');
            expect(written).toContain('unrelated = "keep me"');
        });
    });

    test("does not leave .tmp file behind on success", async () => {
        await withTempHome(async (home) => {
            await saveConfig("global", { enforcement: "advisory" });
            const target = path.join(home, ".pi", "agent", "pipowers.toml");
            expect(fs.existsSync(target + ".tmp")).toBe(false);
        });
    });

    test("saveConfig then loadConfig round-trips enforcement and tunables", async () => {
        await withTempHome(async () => {
            await saveConfig("global", {
                enforcement: "strict",
                tunables: ADVISORY_DEFAULTS.tunables,
            });
            const { config } = await loadConfig();
            expect(config.enforcement).toBe("strict");
            expect(config.tunables.planTracker.required).toBe(true);
        });
    });
});
```

**Step 2: Run, verify it fails**

Run: `npx vitest run tests/extension/pipowers-config.test.ts -t "saveConfig"`
Expected: FAIL — `saveConfig` not exported.

**Step 3: Implement saveConfig**

Add to `extensions/pipowers-config.ts`:

```ts
import { stringify as stringifyToml } from "smol-toml";

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
```

**Step 4: Run, verify it passes**

Run: `npx vitest run tests/extension/pipowers-config.test.ts -t "saveConfig"`
Expected: PASS

**Step 5: Commit**

```bash
git add extensions/pipowers-config.ts tests/extension/pipowers-config.test.ts
git commit -m "feat(config): atomic delta save with deep merge and create-if-missing"
```

---

## Phase 3 — State Schema Extension

### Task 5: Add `planTracker.initialized` and bump state file version

**Files:**
- Create: `extensions/workflow-monitor/plan-tracker-monitor.ts`
- Modify: `extensions/workflow-monitor/workflow-handler.ts`
- Modify: `tests/extension/workflow-monitor/workflow-handler.test.ts` (or equivalent; locate via grep)
- Modify: `extensions/workflow-monitor.ts` (state file read/write paths)

**Step 1: Write the failing test**

Find the existing workflow handler test file:

Run: `ls tests/extension/workflow-monitor/`

Add a new test (or extend an existing `getFullState`/`setFullState` test):

```ts
test("planTracker.initialized round-trips through setFullState / getFullState", () => {
    const handler = createWorkflowHandler();
    expect(handler.isPlanTrackerInitialized()).toBe(false);
    handler.setPlanTrackerInitialized(true);
    const snapshot = handler.getFullState();
    expect(snapshot.planTracker.initialized).toBe(true);
    expect(handler.isPlanTrackerInitialized()).toBe(true);
});
```

(The test file may need a small import adjustment to import `isPlanTrackerInitialized` and `setPlanTrackerInitialized` from the handler module — these don't exist yet.)

**Step 2: Run, verify it fails**

Run: `npx vitest run tests/extension/workflow-monitor/workflow-handler.test.ts -t "planTracker.initialized"`
Expected: FAIL — methods missing.

**Step 3: Create the PlanTrackerMonitor class**

Create `extensions/workflow-monitor/plan-tracker-monitor.ts`:

```ts
import type { Task } from "../../plan-tracker.js";

export interface PlanTrackerState {
    initialized: boolean;
    tasks: Task[];
}

export const PLAN_TRACKER_DEFAULT_STATE: PlanTrackerState = {
    initialized: false,
    tasks: [],
};

export class PlanTrackerMonitor {
    private state: PlanTrackerState = { ...PLAN_TRACKER_DEFAULT_STATE };

    getState(): PlanTrackerState {
        return JSON.parse(JSON.stringify(this.state));
    }

    setState(state: PlanTrackerState): void {
        this.state = { ...PLAN_TRACKER_DEFAULT_STATE, ...state };
    }

    isInitialized(): boolean {
        return this.state.initialized;
    }

    setInitialized(value: boolean): void {
        this.state.initialized = value;
    }
}
```

(Note: `Task` is the existing interface from `extensions/plan-tracker.ts` — the one that already backs the `plan_tracker` tool's task list. Locate the import path by reading the file; it may be exported or may need to be hoisted.)

**Step 4: Extend the handler interface and implementation**

Modify `extensions/workflow-monitor/workflow-handler.ts`:

0. Add an import at the top of the file:

```ts
import { PlanTrackerMonitor, type PlanTrackerState } from "./plan-tracker-monitor.js";
```

1. Add to the `SuperpowersStateSnapshot` interface (around line 17):

```ts
planTracker: {
    initialized: boolean;
    tasks: Task[];
};
```

2. Add the default constant (near other defaults):

```ts
export const PLAN_TRACKER_DEFAULTS = {
    initialized: false,
    tasks: [] as Task[],
};
```

3. Update `setFullState` to merge the new field (around line 245-260):

```ts
if (snapshot.planTracker) {
    planTracker.setState({ ...PLAN_TRACKER_DEFAULTS, ...snapshot.planTracker });
}
```

4. Update `getFullState` to include the field:

```ts
return {
    workflow: tracker.getState(),
    tdd: tdd.getState(),
    debug: debug.getState(),
    verification: verification.getState(),
    planTracker: planTracker.getState(),
};
```

5. Add the methods to the `WorkflowHandler` interface and implementation:

```ts
isPlanTrackerInitialized(): boolean;
setPlanTrackerInitialized(value: boolean): void;
isPathProtected(path: string, protectedPaths: string[]): boolean;
```

Implement them at the bottom of the returned object:

```ts
isPlanTrackerInitialized() { return planTracker.isInitialized(); },
setPlanTrackerInitialized(value) { planTracker.setInitialized(value); },
isPathProtected(path, protectedPaths) { return matchesAnyGlob(path, protectedPaths) || isSourceFile(path); },
```

6. Instantiate the new monitor alongside the existing ones (near line 78, in the factory body):

```ts
const planTracker = new PlanTrackerMonitor();
```

7. Add helper imports at the top:

```ts
import { minimatch } from "minimatch";
// or use any glob matcher; smol-toml doesn't ship one. The codebase may already have one.
```

If the codebase already has a glob matcher (look in `extensions/workflow-monitor/heuristics.ts` or similar), reuse it. Otherwise, install `minimatch` (a tiny well-known glob matcher):

Run: `npm install --save minimatch`

Then implement `matchesAnyGlob`:

```ts
function matchesAnyGlob(pathStr: string, globs: string[]): boolean {
    return globs.some((g) => minimatch(pathStr, g, { dot: true }));
}
```

**Step 5: Run, verify it passes**

Run: `npx vitest run tests/extension/workflow-monitor/workflow-handler.test.ts -t "planTracker.initialized"`
Expected: PASS

**Step 6: Extend the state file schema version**

In `extensions/workflow-monitor.ts`, locate the `getStateFilePath` function and the JSON read/write helpers. Bump the `version` field from `1` to `2` when writing. When reading a `version: 1` file, default the new `planTracker.initialized` field to `false`. The current call to `handler.setFullState(data)` already handles missing fields because `setFullState` merges with defaults — verify the snapshot reader tolerates a missing `planTracker` key (it should, given the merge in `setFullState`).

**Step 7: Rename the state file path with read-fallback**

In `extensions/workflow-monitor.ts`, replace `getStateFilePath` and the read helper:

```ts
const OLD_STATE_FILE = path.join(process.cwd(), ".pi", "superpowers-state.json");
const NEW_STATE_FILE = path.join(process.cwd(), ".pi", "pipowers-state.json");

export function getStateFilePath(): string {
    return NEW_STATE_FILE;
}

export function reconstructState(ctx: ExtensionContext, handler: WorkflowHandler, stateFilePath?: string | false) {
    handler.resetState();
    if (stateFilePath !== false) {
        const candidates = stateFilePath ? [stateFilePath] : [NEW_STATE_FILE, OLD_STATE_FILE];
        for (const candidate of candidates) {
            if (fs.existsSync(candidate)) {
                try {
                    const raw = fs.readFileSync(candidate, "utf-8");
                    const data = JSON.parse(raw);
                    handler.setFullState(data);
                    if (candidate === OLD_STATE_FILE) {
                        log.info(
                            `Loaded state from legacy ${OLD_STATE_FILE}. New writes will go to ${NEW_STATE_FILE}.`,
                        );
                    }
                    return;
                } catch (err) {
                    log.warn(`Failed to read ${candidate}: ${err instanceof Error ? err.message : err}`);
                }
            }
        }
    }
    // Fall back to session branch entries (existing code path)...
}
```

**Step 8: Run all workflow tests, verify they pass**

Run: `npx vitest run tests/extension/workflow-monitor/`
Expected: All pass.

**Step 9: Commit**

```bash
git add extensions/workflow-monitor/workflow-handler.ts extensions/workflow-monitor.ts tests/extension/workflow-monitor/ package.json package-lock.json
git commit -m "feat(state): planTracker.initialized field, state v2, pipowers-state.json with read-fallback"
```

---

## Phase 4 — Enforcement Classifier

### Task 6: Enforcement classifier module

**Files:**
- Create: `extensions/enforcement-classifier.ts`
- Create: `tests/extension/enforcement-classifier.test.ts`

**Step 1: Write the failing test**

```ts
// tests/extension/enforcement-classifier.test.ts
import { describe, expect, test } from "vitest";
import { classifyViolation } from "../../extensions/enforcement-classifier.js";
import { STRICT_DEFAULTS, ADVISORY_DEFAULTS, type PipowersConfig } from "../../extensions/pipowers-config.js";

function makeConfig(overrides: Partial<PipowersConfig> = {}): PipowersConfig {
    return { ...STRICT_DEFAULTS, ...overrides } as PipowersConfig;
}

describe("classifyViolation", () => {
    test("returns null for read-only tool calls", () => {
        const result = classifyViolation({
            toolName: "read",
            input: { path: "src/foo.ts" },
            config: makeConfig(),
            workflowPhase: "execute",
            isPlanTrackerInitialized: true,
        });
        expect(result).toBeNull();
    });

    test("returns process violation for write during brainstorm to src/", () => {
        const result = classifyViolation({
            toolName: "write",
            input: { path: "src/foo.ts" },
            config: makeConfig(),
            workflowPhase: "brainstorm",
            isPlanTrackerInitialized: true,
        });
        expect(result?.bucket).toBe("process");
        expect(result?.subCategory).toBe("phase-boundary");
    });

    test("returns plan_tracker violation for protected-path write when not initialized", () => {
        const result = classifyViolation({
            toolName: "edit",
            input: { path: "src/foo.ts" },
            config: makeConfig(),
            workflowPhase: "execute",
            isPlanTrackerInitialized: false,
        });
        expect(result?.bucket).toBe("plan_tracker");
    });

    test("returns null for plan_tracker precondition in advisory mode", () => {
        const result = classifyViolation({
            toolName: "write",
            input: { path: "src/foo.ts" },
            config: { ...ADVISORY_DEFAULTS },
            workflowPhase: "execute",
            isPlanTrackerInitialized: false,
        });
        expect(result).toBeNull();
    });

    test("returns process violation for TDD new-feature write when TDD phase is idle", () => {
        const result = classifyViolation({
            toolName: "write",
            input: { path: "src/newFeature.ts" },
            config: makeConfig(),
            workflowPhase: "execute",
            isPlanTrackerInitialized: true,
            tddPhase: "idle",
        });
        expect(result?.bucket).toBe("process");
        expect(result?.subCategory).toBe("tdd-new-feature");
    });

    test("does not escalate TDD when phase is red-pending (modifying tested code)", () => {
        const result = classifyViolation({
            toolName: "edit",
            input: { path: "src/existing.ts" },
            config: makeConfig(),
            workflowPhase: "execute",
            isPlanTrackerInitialized: true,
            tddPhase: "red-pending",
        });
        // red-pending falls through to a practice violation (or null if no other bucket)
        expect(result?.bucket !== "process" || result?.subCategory !== "tdd-new-feature").toBe(true);
    });

    test("returns null for non-protected path in execute phase with plan initialized", () => {
        const result = classifyViolation({
            toolName: "write",
            input: { path: "README.md" },
            config: makeConfig(),
            workflowPhase: "execute",
            isPlanTrackerInitialized: true,
            tddPhase: "idle",
        });
        expect(result).toBeNull();
    });
});
```

**Step 2: Run, verify it fails**

Run: `npx vitest run tests/extension/enforcement-classifier.test.ts`
Expected: FAIL — module not found.

**Step 3: Implement the classifier**

Create `extensions/enforcement-classifier.ts`:

```ts
/**
 * Enforcement classifier: bucketizes a tool call attempt into a violation
 * bucket (process | plan_tracker | practice | null) and decides whether
 * the bucket's strike limit and override config warrant a hard block.
 */

import type { PipowersConfig } from "./pipowers-config.js";
import { isSourceFile } from "./workflow-monitor/heuristics.js";
import { minimatch } from "minimatch";

export type Bucket = "process" | "plan_tracker" | "practice";
export type ProcessSubCategory = "phase-boundary" | "tdd-new-feature";

export interface ClassifierInput {
    toolName: string;
    input: Record<string, unknown>;
    config: PipowersConfig;
    workflowPhase: string | null;
    isPlanTrackerInitialized: boolean;
    tddPhase?: string;
}

export interface ClassifierResult {
    bucket: Bucket;
    subCategory?: ProcessSubCategory;
    shouldBlock: boolean;
    reason: string;
    attemptedPath: string;
    detail: Record<string, unknown>;
}

const WRITE_LIKE = new Set(["write", "edit"]);

function matchesProtectedPath(path: string, globs: string[]): boolean {
    if (isSourceFile(path)) return true;
    return globs.some((g) => minimatch(path, g, { dot: true }));
}

export function classifyViolation(input: ClassifierInput): ClassifierResult | null {
    const { toolName, config, workflowPhase, isPlanTrackerInitialized, tddPhase } = input;
    if (!WRITE_LIKE.has(toolName)) return null;
    const path = (input.input.path as string) ?? "";
    if (!path) return null;

    // Process: phase-boundary (brainstorm/plan phase, write outside docs/plans/)
    if ((workflowPhase === "brainstorm" || workflowPhase === "plan") && !path.startsWith("docs/plans/")) {
        return {
            bucket: "process",
            subCategory: "phase-boundary",
            shouldBlock: config.tunables.workflow.processStrikeLimit <= 1,
            reason: "process_violation",
            attemptedPath: path,
            detail: { currentPhase: workflowPhase, allowedPaths: ["docs/plans/"] },
        };
    }

    // Process: TDD new-feature (write to source while TDD is idle/green and no test seen)
    if (
        (tddPhase === "idle" || tddPhase === "green") &&
        config.tunables.workflow.processStrikeLimit <= 1 &&
        isSourceFile(path)
    ) {
        return {
            bucket: "process",
            subCategory: "tdd-new-feature",
            shouldBlock: true,
            reason: "tdd_violation",
            attemptedPath: path,
            detail: { tddPhase },
        };
    }

    // Plan tracker precondition
    if (
        config.tunables.planTracker.required &&
        !isPlanTrackerInitialized &&
        matchesProtectedPath(path, config.tunables.planTracker.protectedPaths)
    ) {
        return {
            bucket: "plan_tracker",
            shouldBlock: config.tunables.workflow.processStrikeLimit <= 1,
            reason: "plan_tracker_required",
            attemptedPath: path,
            detail: {},
        };
    }

    return null;
}
```

**Step 4: Run, verify it passes**

Run: `npx vitest run tests/extension/enforcement-classifier.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add extensions/enforcement-classifier.ts tests/extension/enforcement-classifier.test.ts
git commit -m "feat(enforcement): classifier bucketizes tool calls into process/plan_tracker/practice"
```

---

## Phase 5 — Wire Enforcement into Workflow Monitor

### Task 7: Wire classifier + UI prompts into the workflow monitor

**Files:**
- Modify: `extensions/workflow-monitor.ts`
- Modify: `tests/extension/workflow-monitor.test.ts` (or equivalent)

**Step 1: Write the failing test for the wired-up behavior**

In the existing workflow-monitor test file, add (or extend) a test that simulates a strict-mode `tool_call` event and asserts a `blocked` result:

```ts
import { classifyViolation } from "../enforcement-classifier.js";

test("strict-mode write to src during brainstorm returns blocked", async () => {
    const handler = createWorkflowHandler();
    handler.setFullState({
        workflow: makeWorkflow({ currentPhase: "brainstorm" }),
    });
    // ... assert that calling the extension's tool_call handler with
    //      { toolName: "write", input: { path: "src/foo.ts" } }
    //      returns { blocked: true, reason: "process_violation" }
    //      and fires a ui.select prompt with the expected options.
});
```

(Adjust the test to match the actual `ExtensionAPI` mock pattern already used in the existing tests. The point is to verify end-to-end: tool_call in strict mode + brainstorm phase + src/ path → blocked + ui.select.)

**Step 2: Run, verify it fails**

Run: `npx vitest run tests/extension/workflow-monitor.test.ts -t "strict-mode write to src during brainstorm"`
Expected: FAIL — current behavior is to inject a warning, not block.

**Step 3: Wire the classifier and add process/plan_tracker prompts**

In `extensions/workflow-monitor.ts`:

1. At the top, add imports:

```ts
import { classifyViolation, type ClassifierResult } from "./enforcement-classifier.js";
import { loadConfig, type PipowersConfig } from "./pipowers-config.js";
```

2. In the extension factory, after `let currentConfig: PipowersConfig | null = null;`, add a config load:

```ts
(async () => {
    const { config } = await loadConfig();
    currentConfig = config;
})();
```

3. Locate the `tool_call` event handler (search for `pi.on("tool_call"` or `pi.onToolCall`). Replace the existing handler body to consult the classifier:

```ts
pi.on("tool_call", async (event, ctx) => {
    if (!currentConfig) return; // config still loading, fall through
    const handler = createWorkflowHandler();
    // ... restore handler state from session if needed (existing logic)
    const workflowState = handler.getWorkflowState();
    const phase = workflowState?.currentPhase ?? null;
    const tddPhase = handler.getTddPhase();
    const violation = classifyViolation({
        toolName: event.toolName,
        input: event.input as Record<string, unknown>,
        config: currentConfig,
        workflowPhase: phase,
        isPlanTrackerInitialized: handler.isPlanTrackerInitialized(),
        tddPhase,
    });
    if (!violation) return; // no violation, fall through to existing TDD/debug logic

    // Increment strike counter for the bucket
    strikes[violation.bucket] = (strikes[violation.bucket] ?? 0) + 1;
    if (!violation.shouldBlock) {
        // Inject warning (current behavior)
        return { warning: getWarningFor(violation) };
    }

    // Hard block
    if (!ctx.hasUI || currentConfig.tunables.nonInteractive.mode === "advisory") {
        // Non-interactive: fall back to advisory
        return { warning: getWarningFor(violation) };
    }

    const promptOptions = getPromptOptions(violation, currentConfig);
    const picked = await selectValue(ctx, promptOptions.title, promptOptions.choices);
    if (picked === "stop") {
        return { blocked: true, reason: violation.reason, attemptedPath: violation.attemptedPath };
    }
    if (picked === "override") {
        strikes[violation.bucket] = 0;
        return; // allow the action
    }
    // "advance" or "init-plan" or "run-test": perform the recovery and allow
    await performRecovery(picked, violation, ctx, handler);
    return; // allow (the recovery action has run; the original tool call proceeds)
});
```

4. Add the helper functions in the same file (above the `default function`):

```ts
function getWarningFor(v: ClassifierResult): string {
    if (v.subCategory === "phase-boundary") {
        return `⚠️  Phase violation: writing to \`${v.attemptedPath}\` during \`${v.detail.currentPhase}\` phase. Allowed: docs/plans/.`;
    }
    if (v.subCategory === "tdd-new-feature") {
        return `⚠️  TDD: writing to \`${v.attemptedPath}\` without a failing test (TDD phase: ${v.detail.tddPhase}).`;
    }
    if (v.bucket === "plan_tracker") {
        return `⚠️  No plan active. Initialize plan_tracker before writing to \`${v.attemptedPath}\`.`;
    }
    return `⚠️  Workflow violation on \`${v.attemptedPath}\`.`;
}

function getPromptOptions(v: ClassifierResult, config: PipowersConfig): { title: string; choices: { label: string; value: string }[] } {
    if (v.subCategory === "phase-boundary") {
        return {
            title: `Agent attempted write to \`${v.attemptedPath}\` during \`${v.detail.currentPhase}\` phase.`,
            choices: [
                { label: "Advance to next phase (recommended)", value: "advance" },
                ...(config.tunables.workflow.allowOverride
                    ? [{ label: "Override (let it through this once)", value: "override" }]
                    : []),
                { label: "Stop", value: "stop" },
            ],
        };
    }
    if (v.subCategory === "tdd-new-feature") {
        return {
            title: `Agent attempted write to \`${v.attemptedPath}\` without a failing test.`,
            choices: [
                { label: "Run the test first (recommended)", value: "run-test" },
                ...(config.tunables.workflow.allowOverride
                    ? [{ label: "Override (let it through this once)", value: "override" }]
                    : []),
                { label: "Stop", value: "stop" },
            ],
        };
    }
    if (v.bucket === "plan_tracker") {
        return {
            title: `Agent attempted write to \`${v.attemptedPath}\` but no plan is active.`,
            choices: [
                { label: "Initialize plan (recommended)", value: "init-plan" },
                ...(config.tunables.workflow.allowOverride
                    ? [{ label: "Override (let it through this once)", value: "override" }]
                    : []),
                { label: "Stop", value: "stop" },
            ],
        };
    }
    return { title: "Workflow violation", choices: [{ label: "Stop", value: "stop" }] };
}

async function performRecovery(action: string, v: ClassifierResult, ctx: any, handler: any): Promise<void> {
    if (action === "advance") {
        const phase = handler.getWorkflowState()?.currentPhase;
        if (phase) {
            const next = { brainstorm: "plan", plan: "execute", execute: "verify", verify: "review", review: "finish" }[phase];
            if (next) handler.advanceWorkflowTo(next);
        }
    }
    // "init-plan" and "run-test" don't need server-side recovery: the agent
    // re-emits the appropriate tool call as part of its next turn. We just
    // log that the user picked this option.
    ctx.ui.notify?.(`Recovery: ${action}. Agent will proceed.`);
}
```

5. Wire `plan_tracker.init` to flip the `initialized` flag. Find the `tool_call` handler for `plan_tracker` (or the tool result handler for it) and add:

```ts
if (event.toolName === "plan_tracker" && (event.input as any).action === "init") {
    handler.setPlanTrackerInitialized(true);
}
```

**Step 4: Run, verify it passes**

Run: `npx vitest run tests/extension/workflow-monitor.test.ts`
Expected: PASS

**Step 5: Run the full test suite**

Run: `npm test`
Expected: All pass.

**Step 6: Commit**

```bash
git add extensions/workflow-monitor.ts tests/extension/workflow-monitor.test.ts
git commit -m "feat(workflow-monitor): wire classifier, hard-block process + TDD + plan_tracker in strict mode"
```

---

## Phase 6 — Config UI

### Task 8: TUI status widget

**Files:**
- Create: `extensions/pipowers-config-ui.ts`
- Modify: `extensions/workflow-monitor.ts` (register the widget)
- Create: `tests/extension/pipowers-config-ui.test.ts`

**Step 1: Write the failing test**

```ts
// tests/extension/pipowers-config-ui.test.ts
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
        const out = formatStatusWidget(STRICT_DEFAULTS, [
            { name: "task1", status: "complete" },
            { name: "task2", status: "pending" },
        ], "default");
        expect(out).toContain("✓");
        expect(out).toContain("○");
    });
});
```

**Step 2: Run, verify it fails**

Run: `npx vitest run tests/extension/pipowers-config-ui.test.ts`
Expected: FAIL — module not found.

**Step 3: Implement the formatter**

Create `extensions/pipowers-config-ui.ts`:

```ts
/**
 * Pipowers UI: TUI status widget and /pipwr_config slash command.
 */

import { Text } from "@mariozechner/pi-tui";
import type { Theme, ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { PipowersConfig, ConfigLayer } from "./pipowers-config.js";
import { loadConfig, saveConfig } from "./pipowers-config.js";

interface TaskLike {
    name: string;
    status: "pending" | "in_progress" | "complete";
}

export function formatStatusWidget(
    config: PipowersConfig,
    tasks: TaskLike[],
    effectiveSource: "global" | "project" | "default",
): string {
    if (config.enforcement === "advisory" && tasks.length === 0) return "";
    const modeStr = config.enforcement.toUpperCase();
    const planStr = tasks.length > 0
        ? ` [Plan: ${tasks.map((t) => t.status === "complete" ? "✓" : t.status === "in_progress" ? "→" : "○").join("")}]`
        : "";
    const sourceHint = effectiveSource === "project" ? " (project)" : effectiveSource === "global" ? " (global)" : "";
    return `[Mode: ${modeStr}]${planStr}  /pipwr_config${sourceHint}`;
}

export function buildStatusWidget(
    getConfig: () => PipowersConfig | null,
    getTasks: () => TaskLike[],
    getEffectiveSource: () => "global" | "project" | "default",
) {
    return (_tui: unknown, theme: Theme) => {
        const config = getConfig();
        if (!config) return new Text("", 0, 0);
        const text = formatStatusWidget(config, getTasks(), getEffectiveSource());
        if (!text) return new Text("", 0, 0);
        const color = config.enforcement === "advisory" ? "dim"
            : config.enforcement === "strict" ? "warning"
            : "success";
        return new Text(theme.fg(color as any, text), 0, 0);
    };
}
```

**Step 4: Register the widget in workflow-monitor**

In `extensions/workflow-monitor.ts`, after the existing `ctx.ui.setWidget("plan_tracker", ...)` call, add:

```ts
ctx.ui.setWidget("pipowers_status", buildStatusWidget(
    () => currentConfig,
    () => planTrackerTasks,
    () => currentEffectiveSource,
));
```

(Define `planTrackerTasks` and `currentEffectiveSource` at the top of the factory; populate them from the handler and loadConfig result.)

**Step 5: Run, verify it passes**

Run: `npx vitest run tests/extension/pipowers-config-ui.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add extensions/pipowers-config-ui.ts tests/extension/pipowers-config-ui.test.ts extensions/workflow-monitor.ts
git commit -m "feat(ui): pipowers status widget (mode + plan + command hint)"
```

---

### Task 9: `/pipwr_config` slash command — mode picker

**Files:**
- Modify: `extensions/pipowers-config-ui.ts`

**Step 1: Write the failing test**

Append to `tests/extension/pipowers-config-ui.test.ts`:

```ts
import { pickMode } from "../../extensions/pipowers-config-ui.js";

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
```

**Step 2: Run, verify it fails**

Run: `npx vitest run tests/extension/pipowers-config-ui.test.ts -t "pickMode"`
Expected: FAIL.

**Step 3: Implement pickMode**

Add to `extensions/pipowers-config-ui.ts`:

```ts
export async function pickMode(
    ctx: ExtensionContext,
    current: "advisory" | "strict" | "custom",
): Promise<"advisory" | "strict" | "custom"> {
    const labels = ["Advisory", "Strict", "Custom", "Cancel"];
    const picked = await ctx.ui.select(`Choose enforcement mode (current: ${current})`, labels);
    switch (picked) {
        case "Advisory": return "advisory";
        case "Strict": return "strict";
        case "Custom": return "custom";
        default: return current;
    }
}
```

**Step 4: Register the slash command**

In `extensions/pipowers-config-ui.ts`, add:

```ts
export function registerConfigCommand(
    pi: ExtensionAPI,
    getConfig: () => PipowersConfig | null,
    refreshConfig: () => Promise<void>,
): void {
    pi.registerCommand("pipwr_config", async (args, ctx) => {
        const current = getConfig()?.enforcement ?? "advisory";
        const layer: ConfigLayer = await pickLayer(ctx, "project");
        const newMode = await pickMode(ctx, current);
        if (newMode === current && layer === "project") {
            ctx.ui.notify?.("No change.");
            return;
        }
        if (newMode === "custom") {
            const tunables = await pickTunables(ctx, getConfig());
            await saveConfig(layer, { enforcement: "custom", tunables });
        } else {
            await saveConfig(layer, { enforcement: newMode });
        }
        await refreshConfig();
        ctx.ui.notify?.(`Config saved (${layer}).`);
    });
}

async function pickLayer(ctx: ExtensionContext, defaultLayer: ConfigLayer): Promise<ConfigLayer> {
    const picked = await ctx.ui.select(
        "Save to which layer?",
        ["Project (.pi/pipowers.toml)", "Global (~/.pi/agent/pipowers.toml)"],
    );
    return picked.startsWith("Project") ? "project" : "global";
}
```

(`pickTunables` is implemented in Task 10.)

**Step 5: Wire the command in workflow-monitor**

In `extensions/workflow-monitor.ts`, inside the factory, add:

```ts
registerConfigCommand(pi, () => currentConfig, async () => {
    const result = await loadConfig();
    currentConfig = result.config;
    currentEffectiveSource = result.effectiveSource;
});
```

**Step 6: Run, verify it passes**

Run: `npx vitest run tests/extension/pipowers-config-ui.test.ts`
Expected: PASS

**Step 7: Commit**

```bash
git add extensions/pipowers-config-ui.ts tests/extension/pipowers-config-ui.test.ts extensions/workflow-monitor.ts
git commit -m "feat(ui): /pipwr_config slash command with mode picker and project/global toggle"
```

---

### Task 10: Tunables editor

**Files:**
- Modify: `extensions/pipowers-config-ui.ts`

**Step 1: Write the failing test**

```ts
import { pickTunables } from "../../extensions/pipowers-config-ui.js";

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
        const result = await pickTunables({
            hasUI: true,
            ui: {
                select: async (title: string, options: string[]) => {
                    if (title.includes("Plan tracker")) return "Required: [✓]";
                    if (title.includes("Save or cancel")) return "Save";
                    return options[0];
                },
                input: async () => "",
            },
        } as any, STRICT_DEFAULTS);
        expect(result.planTracker.required).toBe(false);
    });
});
```

**Step 2: Run, verify it fails**

Run: `npx vitest run tests/extension/pipowers-config-ui.test.ts -t "pickTunables"`
Expected: FAIL.

**Step 3: Implement pickTunables**

Add to `extensions/pipowers-config-ui.ts`:

```ts
import type { PipowersConfig } from "./pipowers-config.js";
import { ADVISORY_DEFAULTS } from "./pipowers-config.js";

export async function pickTunables(
    ctx: ExtensionContext,
    current: PipowersConfig,
): Promise<PipowersConfig["tunables"]> {
    const t = JSON.parse(JSON.stringify(current.tunables));

    while (true) {
        const choice = await ctx.ui.select(
            `Tunables:\n  Plan tracker\n    Required: [${t.planTracker.required ? "✓" : " "}]\n    Protected paths: ${t.planTracker.protectedPaths.length} entries\n  Workflow\n    Process strike limit: ${t.workflow.processStrikeLimit}\n    Practice strike limit: ${t.workflow.practiceStrikeLimit}\n    Allow override: [${t.workflow.allowOverride ? "✓" : " "}]\n  Non-interactive\n    Mode: ${t.nonInteractive.mode}`,
            [
                "Required: " + (t.planTracker.required ? "[✓]" : "[ ]"),
                "Protected paths (edit list)",
                `Process strike limit (current: ${t.workflow.processStrikeLimit})`,
                `Practice strike limit (current: ${t.workflow.practiceStrikeLimit})`,
                "Allow override: " + (t.workflow.allowOverride ? "[✓]" : "[ ]"),
                `Non-interactive mode (current: ${t.nonInteractive.mode})`,
                "Save",
                "Cancel",
            ],
        );
        if (choice === "Cancel") return current.tunables;
        if (choice === "Save") return t;
        if (choice.startsWith("Required:")) {
            t.planTracker.required = !t.planTracker.required;
        } else if (choice.startsWith("Protected paths")) {
            const next = await ctx.ui.input("Protected paths (comma-separated globs):", t.planTracker.protectedPaths.join(", "));
            if (next) t.planTracker.protectedPaths = next.split(",").map((s) => s.trim()).filter(Boolean);
        } else if (choice.startsWith("Process strike limit")) {
            const next = await ctx.ui.input("Process strike limit (1-999):", String(t.workflow.processStrikeLimit));
            const n = parseInt(next ?? "", 10);
            if (n >= 1 && n <= 999) t.workflow.processStrikeLimit = n;
        } else if (choice.startsWith("Practice strike limit")) {
            const next = await ctx.ui.input("Practice strike limit (1-999):", String(t.workflow.practiceStrikeLimit));
            const n = parseInt(next ?? "", 10);
            if (n >= 1 && n <= 999) t.workflow.practiceStrikeLimit = n;
        } else if (choice.startsWith("Allow override:")) {
            t.workflow.allowOverride = !t.workflow.allowOverride;
        } else if (choice.startsWith("Non-interactive mode")) {
            const picked = await ctx.ui.select("Non-interactive mode:", ["advisory", "block"]);
            if (picked === "advisory" || picked === "block") t.nonInteractive.mode = picked;
        }
    }
}
```

**Step 4: Run, verify it passes**

Run: `npx vitest run tests/extension/pipowers-config-ui.test.ts -t "pickTunables"`
Expected: PASS

**Step 5: Commit**

```bash
git add extensions/pipowers-config-ui.ts tests/extension/pipowers-config-ui.test.ts
git commit -m "feat(ui): tunables editor screen for custom mode"
```

---

### Task 11: File watching + widget refresh

**Files:**
- Modify: `extensions/pipowers-config-ui.ts`
- Modify: `extensions/workflow-monitor.ts`

**Step 1: Write the failing test**

```ts
// tests/extension/pipowers-config-ui.test.ts
import { createConfigWatcher } from "../../extensions/pipowers-config-ui.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

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
```

**Step 2: Run, verify it fails**

Run: `npx vitest run tests/extension/pipowers-config-ui.test.ts -t "createConfigWatcher"`
Expected: FAIL.

**Step 3: Implement createConfigWatcher**

Add to `extensions/pipowers-config-ui.ts`:

```ts
export interface ConfigWatcher {
    start(): void;
    stop(): void;
}

export function createConfigWatcher(opts: {
    projectPath: string;
    onChange: () => void | Promise<void>;
    debounceMs?: number;
}): ConfigWatcher {
    const debounce = opts.debounceMs ?? 250;
    let timer: NodeJS.Timeout | null = null;
    let fsWatcher: fs.FSWatcher | null = null;

    return {
        start() {
            if (!fs.existsSync(path.dirname(opts.projectPath))) return;
            fsWatcher = fs.watch(path.dirname(opts.projectPath), (_event, filename) => {
                if (filename !== path.basename(opts.projectPath)) return;
                if (timer) clearTimeout(timer);
                timer = setTimeout(() => {
                    opts.onChange();
                }, debounce);
            });
        },
        stop() {
            if (timer) clearTimeout(timer);
            if (fsWatcher) fsWatcher.close();
        },
    };
}
```

(Add `import * as fs from "node:fs";` and `import * as path from "node:path";` at the top.)

**Step 4: Wire the watcher in workflow-monitor**

In the factory:

```ts
import { createConfigWatcher } from "./pipowers-config-ui.js";

const projectConfig = projectConfigPath();
if (fs.existsSync(path.dirname(projectConfig))) {
    const watcher = createConfigWatcher({
        projectPath: projectConfig,
        onChange: async () => {
            const { config, effectiveSource } = await loadConfig();
            currentConfig = config;
            currentEffectiveSource = effectiveSource;
        },
        debounceMs: 250,
    });
    watcher.start();
    // Stash the watcher so it isn't GC'd. On session teardown, call watcher.stop().
}
```

**Step 5: Run, verify it passes**

Run: `npx vitest run tests/extension/pipowers-config-ui.test.ts -t "createConfigWatcher"`
Expected: PASS

**Step 6: Commit**

```bash
git add extensions/pipowers-config-ui.ts tests/extension/pipowers-config-ui.test.ts extensions/workflow-monitor.ts
git commit -m "feat(ui): debounced file watcher on .pi/pipowers.toml refreshes widget"
```

---

## Phase 7 — Polish

### Task 12: Legacy `pi-superpowers-plus` config detection

**Files:**
- Modify: `extensions/pipowers-config.ts`
- Modify: `tests/extension/pipowers-config.test.ts`

**Step 1: Write the failing test**

```ts
test("detects legacy pi-superpowers-plus key in shared config files (logs once)", async () => {
    await withTempHome(async (home) => {
        // Simulate the user's old config: pi's shared global config with the legacy key
        const sharedConfig = path.join(home, ".pi", "agent", "config.json");
        fs.mkdirSync(path.dirname(sharedConfig), { recursive: true });
        fs.writeFileSync(sharedConfig, JSON.stringify({ "pi-superpowers-plus": { enforcement: "advisory" } }));
        const detected = await detectLegacyConfig();
        expect(detected).toBe(true);
    });
});

test("returns false when no legacy key is present", async () => {
    await withTempHome(async (home) => {
        const sharedConfig = path.join(home, ".pi", "agent", "config.json");
        fs.mkdirSync(path.dirname(sharedConfig), { recursive: true });
        fs.writeFileSync(sharedConfig, JSON.stringify({ unrelated: "value" }));
        const detected = await detectLegacyConfig();
        expect(detected).toBe(false);
    });
});
```

**Step 2: Run, verify it fails**

Run: `npx vitest run tests/extension/pipowers-config.test.ts -t "legacy pi-superpowers-plus"`
Expected: FAIL.

**Step 3: Implement detectLegacyConfig**

Add to `extensions/pipowers-config.ts`:

```ts
const legacyDetectionKey = "_pipowersLegacyDetected";

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
```

**Step 4: Call detectLegacyConfig from workflow-monitor**

In the extension factory, after the initial config load:

```ts
await detectLegacyConfig();
```

(Call once at startup; the `log.warn` is debounced by virtue of being a one-shot startup check.)

**Step 5: Run, verify it passes**

Run: `npx vitest run tests/extension/pipowers-config.test.ts -t "legacy pi-superpowers-plus"`
Expected: PASS

**Step 6: Commit**

```bash
git add extensions/pipowers-config.ts tests/extension/pipowers-config.test.ts extensions/workflow-monitor.ts
git commit -m "feat(config): detect legacy pi-superpowers-plus JSON config and log one-time warning"
```

---

### Task 13: Integration tests

**Files:**
- Create: `tests/extension/pipowers-integration.test.ts`

**Step 1: Write the end-to-end test**

```ts
import { describe, expect, test } from "vitest";
import { createWorkflowHandler } from "../../extensions/workflow-monitor/workflow-handler.js";
import { classifyViolation } from "../../extensions/enforcement-classifier.js";
import { STRICT_DEFAULTS, saveConfig, loadConfig, _resetForTest } from "../../extensions/pipowers-config.js";
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
```

**Step 2: Run, verify it passes**

Run: `npx vitest run tests/extension/pipowers-integration.test.ts`
Expected: PASS

**Step 3: Run the full suite**

Run: `npm test`
Expected: All pass.

**Step 4: Lint check**

Run: `npm run lint`
Expected: PASS

**Step 5: Commit**

```bash
git add tests/extension/pipowers-integration.test.ts
git commit -m "test: end-to-end integration tests for strict mode + config round-trip"
```

---

### Task 14: Manual smoke test checklist + verify PR readiness

**Files:**
- Create: `docs/superpowers/learnings/2026-06-23-pipowers-smoke.md` (a short runbook)
- No code changes; this task is verification.

**Step 1: Create the smoke test runbook**

```markdown
# Pipowers v0.5.0 — Manual Smoke Test

Run these checks locally before opening a PR. Each is a one-shot command or a
5-minute manual exercise.

## Setup

```bash
cd ~/some/test/repo
mkdir -p .pi
```

## 1. Fresh install (no config files)

```bash
rm -f .pi/pipowers.toml ~/.pi/agent/pipowers.toml
rm -f .pi/superpowers-state.json ~/.pi/agent/superpowers-state.json
```

Start a pi session. Expected:
- No widget visible.
- Agent can write source code, tests, config without prompts.

## 2. Enable strict mode

In the session, run `/pipwr_config`. Pick "Strict" and "Project".
Expected:
- File `.pi/pipowers.toml` is created with `enforcement = "strict"`.
- Widget appears: `[Mode: STRICT]  /pipwr_config (project)`.
- The next source write (e.g. attempt to write `src/foo.ts` before `plan_tracker.init`) triggers a UI confirm-prompt.

## 3. Hand-edit the config

Edit `.pi/pipowers.toml` and change `enforcement = "advisory"`. Save.
Expected:
- Within ~1 second, the widget updates to show `[Mode: ADVISORY]` (or hides).
- Agent can write source code without prompts.

## 4. TDD new-feature hard block

In a new session with strict mode:
- Have the agent write a new test file (e.g. `tests/foo.test.ts`) and run it (fails).
- Have the agent write `src/foo.ts` (the matching source).
- Switch to a clean file: ask the agent to write `src/bar.ts` *without* a failing test for it.
- Expected: UI confirm-prompt fires for `src/bar.ts` write, with "Run the test first" as the default option.

## 5. Plan tracker precondition

In a new session with strict mode, do NOT call `plan_tracker.init`.
- Ask the agent to write `src/baz.ts`.
- Expected: UI confirm-prompt fires with "Initialize plan (recommended)" as the default.
- Pick "Initialize plan" → agent proceeds with the plan_tracker.init call, then the original write.

## 6. Legacy state file fallback

```bash
echo '{"version": 1, "workflow": {"phases": {"brainstorm": "complete", "plan": "complete", "execute": "active", "verify": "pending", "review": "pending", "finish": "pending"}, "currentPhase": "execute", "artifacts": {}, "prompted": {}}}' > .pi/superpowers-state.json
```

Start a session. Expected:
- State loads from `.pi/superpowers-state.json`.
- A log line: `Loaded state from legacy .pi/superpowers-state.json. New writes will go to .pi/pipowers-state.json.`
- After any state change, `.pi/pipowers-state.json` is created.

## 7. Non-interactive fallback

Run pi in non-interactive mode (`pi --no-ui` or `pi --headless` or pipe input).
- In strict mode, attempt a source write during brainstorm.
- Expected: warning injected into tool output, no hard block (advisory fallback).

## 8. Upgrade from `pi-superpowers-plus`

If a user has `pi-superpowers-plus` in their `~/.pi/agent/config.json`:
```json
{ "pi-superpowers-plus": { "enforcement": "advisory" } }
```

Start a session. Expected:
- One-time warning in logs: `Detected legacy pi-superpowers-plus config key in <path>.`
```

**Step 2: Walk through the checklist**

Run each scenario in a test repo. Note any failures.

**Step 3: Commit the runbook**

```bash
git add docs/superpowers/learnings/2026-06-23-pipowers-smoke.md
git commit -m "docs: manual smoke test checklist for v0.5.0"
```

**Step 4: Final verification**

Run: `npm test && npm run lint`
Expected: All pass.

**Step 5: Open a PR**

```bash
git push -u origin pipowers-enforcement-rebrand
gh pr create --title "feat: pipowers v0.5.0 — strict enforcement and standalone rebrand" --body "..."
```

---

## Done

All 14 tasks complete. Pipowers v0.5.0 ships with:

- Standalone rebrand (package name, README, banner, CHANGELOG).
- TOML config system (`~/.pi/agent/pipowers.toml` and `.pi/pipowers.toml`) with project-overrides-global, atomic delta writes, file watching, and validation.
- Three enforcement categories: process (phase-boundary + TDD new-feature, hard-block 1st strike), plan_tracker precondition (hard-block 1st strike), practice (2-strike, override, "allow all for session" removed in strict).
- TUI status widget showing mode + plan + command hint.
- `/pipwr_config` slash command with mode picker and tunables editor.
- Legacy state file read-fallback and legacy `pi-superpowers-plus` config detection.
- Full unit and integration test coverage.
- Manual smoke test runbook.
