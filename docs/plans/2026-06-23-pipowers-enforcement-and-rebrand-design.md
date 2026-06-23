# Pipowers: Enforcement Tiers & Standalone Rebrand

**Date:** 2026-06-23
**Status:** Design
**Supersedes:** (none — additive on top of the current `pi-superpowers-plus` behavior)

## Problem

`pi-superpowers-plus` enforces its workflow via two extensions:

- **Workflow Monitor** — observes tool calls, injects warnings on TDD/debug/verification/branch-safety violations, escalates to a user-confirmed hard block on the 2nd strike.
- **Plan Tracker** — registers a `plan_tracker` tool the agent can opt into; shows a TUI widget when active.

Two limitations motivate this design:

1. **The Plan Tracker is optional.** The agent can write source code, tests, and config without ever calling `plan_tracker.init`. The widget never appears; no plan is enforced. This is a precondition the agent is allowed to skip entirely.

2. **The Workflow Monitor is advisory.** Every category of violation — including structural process errors like writing source code during a `brainstorm` phase — is treated as a 2-strike nudge with a user override. Process violations are not actually treated as process violations; they get the same treatment as practice nudges like TDD order.

Additionally, the project is being repositioned as a **standalone package** named `pipowers` (matching the local folder). The previous name and config keys referenced the upstream project it forked from; this design cleans that up.

## Goal

Add an **opt-in strict enforcement mode** that:

- Makes `plan_tracker` init a precondition for protected-path writes (when the user opts in).
- Distinguishes **process violations** (structural, hard-block on 1st strike) from **practice violations** (advisory, 2-strike with override).
- Ships with a **TOML config file** owned by pipowers, supporting per-project overrides of a global default.
- Exposes mode + tunables through a **TUI widget** and a **`/pipwr_config` slash command** with a picker UI.
- Renames the package from `pi-superpowers-plus` to `pipowers` (standalone), with original repository credited in the README.

Default behavior is unchanged: users who do not touch the config get the current advisory experience.

---

## 1. Project Rebrand

### Package metadata

| Field | Old | New |
| --- | --- | --- |
| `package.json` `name` | `pi-superpowers-plus` | `pipowers` |
| `package.json` `description` | `Superpowers workflow skills adapted for pi` | `Workflow skills and runtime enforcement for pi` |
| `package.json` `keywords` | `["pi-package"]` | `["pi-package", "workflow", "enforcement"]` |
| Banner asset | `banner-plus.jpg` + `banner.jpg` | `banner.jpg` (single) |
| CHANGELOG entry | — | `v0.5.0: Renamed to pipowers. Standalone rebrand. Strict enforcement mode added.` |

### Settings key

In both `~/.pi/agent/config.json` (pi's shared global config) and `.pi/settings.json` (pi's shared project config), pipowers no longer occupies a top-level key. Instead it owns its own TOML files (see Section 2).

### README

Full rewrite:

- Title: `pipowers`
- Tagline: `Workflow skills and runtime enforcement for pi`
- Body reorganized around three install modes: **Advisory** (default), **Strict** (opt-in), **Custom** (opt-in advanced)
- "Credits" section:
  > This project evolved from [coctostan/pi-superpowers-plus](https://github.com/coctostan/pi-superpowers-plus), which itself was an active-enforcement extension of [coctostan/pi-superpowers](https://github.com/coctostan/pi-superpowers). pipowers is now a standalone package. Thanks to the original authors for the workflow design.

### Legacy `pi-superpowers-plus` config detection

If a user has a `pi-superpowers-plus` key in their old JSON config file (e.g. `~/.pi/agent/config.json`), pipowers does **not** auto-migrate. On first read, it logs a one-time notice at `info` level:

```
Detected legacy `pi-superpowers-plus` config key in <path>.
pipowers uses its own TOML config files. Run `/pipwr_config` to set up the new config.
```

No silent migration — the rename is a deliberate user-visible event.

---

## 2. Settings Model

### Files

| Layer | Path | Owner |
| --- | --- | --- |
| Global | `~/.pi/agent/pipowers.toml` | pipowers (standalone) |
| Project | `.pi/pipowers.toml` | pipowers (standalone) |

Both files are entirely pipowers-owned. They never share namespace with pi's other settings.

### Schema

```toml
# pipowers config — https://github.com/coctostan/pipowers
# Project file overrides global file on conflict.

# advisory = warnings only (no blocking, plan tracker not required)
# strict   = process hard-block 1st strike + plan_tracker required
# custom   = use tunables block as-is; missing keys fall back to advisory defaults
enforcement = "advisory"

[tunables.planTracker]
# When true, any write to a protectedPath requires plan_tracker to be initialized
# in the current session.
required = false

# Glob patterns (forward-slash, project-relative) that trigger the precondition.
# A write matches if path matches ANY glob OR is detected as a source/test file
# by the existing isSourceFile heuristic.
protectedPaths = ["src/**", "tests/**", "test/**", "**/*.test.ts", "**/*.spec.ts"]

[tunables.workflow]
# Process violations (wrong-phase writes, plan_tracker precondition failures, TDD write-order on new features) hard-block at this strike.
processStrikeLimit = 1

# Practice violations (TDD modify-tested-code / trivial change, debug fix-attempts, verification gating) warn then block at this strike.
practiceStrikeLimit = 2

# When true, the UI confirm-prompt for process violations offers an "Override" button.
allowOverride = true

[tunables.nonInteractive]
# advisory = fall back to warnings when ctx.hasUI is false
# block    = hard-block even without UI (CI/scripts must set PI_POWERS_NONINTERACTIVE=advisory to opt out)
mode = "advisory"
```

### Mode resolution

The effective `enforcement` mode is selected by the user (via the picker or by hand-editing). When `enforcement = "strict"`, the `tunables` block is filled with the strict defaults shown above. When `enforcement = "advisory"`, the tunables are filled with their advisory defaults (`planTracker.required = false`, `workflow.processStrikeLimit = 999`, `workflow.practiceStrikeLimit = 2`, etc.). When `enforcement = "custom"`, the tunables block is used as-is; any missing key falls back to advisory defaults and emits a one-time warning.

### Layer precedence (per leaf)

```
defaults  ←  global TOML  ←  project TOML
  (advisory floor)        (project wins on conflict)
```

Project layer wins on a per-leaf basis. The `enforcement` value at the project layer decides the base mode; tunables from both layers are deep-merged with the same precedence.

### Load procedure

```text
loadConfig():
    globalExists = fs.existsSync(GLOBAL_PATH)
    projectExists = fs.existsSync(PROJECT_PATH)

    if !globalExists and !projectExists:
        return defaults        # advisory; do NOT touch disk on read

    globalToml   = globalExists   ? parseToml(read(GLOBAL_PATH))   : {}
    projectToml  = projectExists  ? parseToml(read(PROJECT_PATH))  : {}

    if globalToml.parseError or projectToml.parseError:
        log error + show one-time UI notice: "Could not parse <path>. Using defaults."
        return defaults

    merged = deepMerge(defaults, globalToml, projectToml)
    return resolveMode(merged)   # expand `enforcement = "strict"` into the matching tunables
```

### Save procedure (delta write)

```text
saveConfig(layer, change):
    targetPath = layer == "global" ? GLOBAL_PATH : PROJECT_PATH

    if !fs.existsSync(targetPath):
        # First write to this layer. Initialize with the change.
        initial = { "enforcement": change.enforcement, "tunables": change.tunables }
        atomicWrite(targetPath, tomlStringify(initial))
        return

    existing = parseToml(read(targetPath))  # may be empty object
    merged   = deepMerge(existing, change)  # overwrite only the changed keys
    atomicWrite(targetPath, tomlStringify(merged))
```

**Atomic write:** write to `<targetPath>.tmp`, then `rename` to `targetPath`. Prevents corruption on crash mid-write.

**Comment loss on re-serialize:** when the picker re-serializes an existing TOML file, comments from hand-edits are not preserved. Documented in README under "Editing the config by hand". This is an accepted tradeoff for simpler, more reliable writes. (If a future user complains, swap in an AST-based TOML library like `@taplo/toml` for comment-preserving edits.)

### Auto-create on first write

If neither file exists and the user runs `/pipwr_config` and picks a mode:

- The picker writes the new mode to `~/.pi/agent/pipowers.toml` (global) by default
- File is created with just the `pipowers` block: `enforcement = "<picked>"` and the corresponding tunables
- No copying of unrelated settings from any other file (the file is pipowers-owned)

### File watching

The extension watches `.pi/pipowers.toml` for changes via `fs.watch` (or the platform equivalent). When it changes, the extension re-runs `loadConfig()` and updates the widget within ~1s. Changes to `~/.pi/agent/pipowers.toml` require a session restart (acceptable; rarely edited).

---

## 3. Enforcement Categories

All three categories hook into the existing `WorkflowHandler.handleToolCall` path. The difference is the **bucket** the violation is filed under, which determines strike-counter location, prompt copy, and behavior.

### 3.1 Process violations (hard block, 1st strike in strict mode)

Process violations cover two sub-categories in strict mode. Both hard-block on the 1st strike (configurable via `tunables.workflow.processStrikeLimit`) and both allow override. The shared response behavior is described at the end of this section; the triggers differ per sub-category.

#### 3.1.1 Phase-boundary violations

**Trigger:** `write` or `edit` to a path that the current workflow phase forbids.

- During `brainstorm` or `plan` phases, the only allowed paths are `docs/plans/`. A write outside that directory is a process violation.
- Detection logic is unchanged from the current `WorkflowTracker.onFileWritten` / phase-comparison path. The change is the response.

#### 3.1.2 TDD write-order on new features

**Trigger:** `write` or `edit` to a source file when the TDD monitor is in the `idle` or `green` phase and no test for the new behavior exists yet (i.e. writing production code before a failing test).

- This applies to the **"new feature"** TDD scenario. The detection uses the existing `TddMonitor` `phase` + `redVerificationPending` state.
- The **"modifying tested code"** scenario (writing to a source file while the TDD monitor is in `red-pending` because a test was just seen failing) does **not** fire as a process violation. It falls through to §3.3 as a practice violation (or no violation at all, if the new behavior is already covered by an existing test).
- The **"trivial change"** scenario (whitespace, comment-only, rename) is detected by the existing `isSourceFile` heuristic and falls through to §3.3.
- In `enforcement = "advisory"`, all three TDD scenarios stay advisory (current behavior). Only strict/custom with `processStrikeLimit = 1` elevates the new-feature case to a hard block.

#### 3.1.3 Shared response (applies to both 3.1.1 and 3.1.2)

**Behavior in `enforcement = "strict"`:**

1. `handleToolCall` returns `{ blocked: true, reason: "process_violation" | "tdd_violation", attemptedPath, ... }`. The `reason` field distinguishes the two sub-categories for logging and session entries.
2. If `ctx.hasUI`, the extension fires a `ui.select` prompt. The copy and options differ per sub-category:

   **Phase-boundary prompt:**
   ```
   Agent attempted write to `src/foo.ts` during `brainstorm` phase.
   Allowed paths in this phase: docs/plans/.

     ▸ Advance to next phase (recommended)
       Override (let it through this once)
       Stop
   ```

   **TDD new-feature prompt:**
   ```
   Agent attempted write to `src/foo.ts` without a failing test.
   Write a failing test first, or use one of the options below.

     ▸ Run the test first (recommended)
       Override (let it through this once)
       Stop
   ```

3. The default option is **"Advance to next phase"** (phase-boundary) or **"Run the test first"** (TDD new-feature). On selection, the extension performs the recovery action and re-emits the original tool call as a new attempt.
4. **"Override"** allows the action, decrements the strike counter for this category, and records a `process_override` or `tdd_override` entry in the session log.
5. **"Stop"** returns `blocked: true`; the agent sees the error in the tool result.

**Behavior in `enforcement = "advisory"`:**

- Injects a warning into the tool result (current behavior). No block.

**Behavior in `enforcement = "custom"`:**

- Uses `tunables.workflow.processStrikeLimit` and `tunables.workflow.allowOverride` to determine behavior. `processStrikeLimit = 1` matches strict defaults; `processStrikeLimit = 999` matches advisory; values in between delay the hard block.

**Non-interactive fallback (`ctx.hasUI === false`):**

- If `tunables.nonInteractive.mode = "advisory"` (default): fall back to the advisory behavior — warn only, no block.
- If `tunables.nonInteractive.mode = "block"`: hard-block with no prompt. The tool result includes a recovery hint pointing the agent at the correct skill/tool.

### 3.2 Plan tracker precondition (hard block, 1st strike when required)

**Trigger:** `write` or `edit` to a path matching any `protectedPaths` glob OR detected as a source/test file by the `isSourceFile` heuristic, **and** `plan_tracker` has not been `init`'d in the current session.

**State tracking:** add a new field to `SuperpowersStateSnapshot`:

```ts
planTracker: {
    initialized: boolean;   // set true on first plan_tracker.init call
    tasks: Task[];          // existing
}
```

Persisted via the extension state file. The path is renamed from `.pi/superpowers-state.json` (old) to `.pi/pipowers-state.json` (new) as part of the rebrand. On read, the extension tries the new path first and falls back to the old path; on write, the new path is used. See Section 9 for the full migration behavior.

**Behavior in `enforcement = "strict"` (with `tunables.planTracker.required = true`):**

1. `handleToolCall` returns `{ blocked: true, reason: "plan_tracker_required", attemptedPath }`.
2. UI confirm-prompt:

   ```
   Agent attempted write to `src/foo.ts` but no plan is active.

     ▸ Initialize plan (recommended)
       Override (let it through this once)
       Stop
   ```

3. **"Initialize plan"** emits a `plan_tracker.init` call with a suggested task list parsed from recent activity (e.g. last user message and any plan docs in `docs/plans/`), then re-emits the original write. If the suggested list is empty, the extension prompts the user to confirm a default single-task plan ("Implement requested change").
4. **"Override"** allows the action, decrements the strike counter, records a `plan_tracker_override` session entry.
5. **"Stop"** returns `blocked: true`.

**Behavior in `enforcement = "advisory"`** or when `tunables.planTracker.required = false`:

- The plan_tracker is purely opt-in. The agent can use it via the `plan_tracker` tool, but no write requires it. The TUI widget still appears when the plan is active.

**Non-interactive fallback:** same as process violations.

### 3.3 Practice violations (2-strike with override, unchanged shape with one refinement)

TDD write-order, debug fix-attempt limits, verification gating for `git commit` / `git push` / `gh pr create`. The strike counter, prompt, and override options are unchanged from the current implementation.

**Refinement in strict mode:** the existing escalation prompt offers "Yes, allow all for this session". In strict mode, that option is removed. The user must pick **"Yes, continue"** (resets the strike counter for this category) or **"Stop"** for each occurrence.

**Behavior in `enforcement = "advisory"`:** identical to the current 2.0 behavior, including the "allow all for this session" option.

**Behavior in `enforcement = "custom"`:** driven by `tunables.workflow.practiceStrikeLimit` and `tunables.workflow.allowOverride`.

### 3.4 Detection point

All three categories hook into the existing `WorkflowHandler.handleToolCall`. New fields on the handler:

```ts
interface WorkflowHandler {
    // ...existing...
    isPlanTrackerInitialized(): boolean;
    setPlanTrackerInitialized(value: boolean): void;
    isPathProtected(path: string, protectedPaths: string[]): boolean;
}
```

The main extension's `tool_call` event handler:

```ts
const bucket = classifyViolation(toolName, input, currentConfig, workflowState);
const violation = bucket ? checkViolation(bucket, ...) : null;

if (violation) {
    if (violation.shouldBlock) {
        return { blocked: true, reason: violation.reason, ... };
    } else {
        return injectWarning(violation.warning);
    }
}
```

The `classifyViolation` function returns one of: `process | plan_tracker | practice | null`. The block-vs-warn decision comes from the config-driven strike-limit logic.

### 3.5 State persistence

`planTracker.initialized` and the per-bucket strike counters persist via the extension state file. The path is renamed to `.pi/pipowers-state.json` as part of the rebrand. On read, the extension tries the new path first and falls back to the old `.pi/superpowers-state.json`; on write, the new path is used. The schema version field is bumped to `2`; old version 1 files are read with `planTracker.initialized` defaulting to `false`.

---

## 4. UI Surfaces

### 4.1 TUI widget

A new widget slot, `pipowers_status`, renders above the editor when there's something to show. Layout:

```
[Mode: STRICT] [Plan: ✓→○]  [/pipwr_config]
```

- **`Mode`**: `ADVISORY` / `STRICT` / `CUSTOM`. Color: dim for advisory, warning for strict, success for custom.
- **`Plan`**: existing `plan_tracker` widget (reused; no change to its rendering).
- **`/pipwr_config`**: hint that the command exists. Visible in strict and custom modes; hidden in advisory mode. (A `tunables.alwaysShowWidget` toggle to force-show in advisory is deferred to a later release — see Open Question C.)

The widget is hidden entirely in advisory mode and when no plan is active. In strict/custom, the widget always renders the mode + command hint.

### 4.2 Slash command `/pipwr_config`

Two-screen TUI picker.

**Screen 1 — Mode picker:**

```
Choose enforcement mode:
  ▸ Advisory
    Strict
    Custom

Layer:  [● Project]  ○ Global       ← toggle: where the change writes

Effective config source: ~/.pi/agent/pipowers.toml  (global)
[Show current tunables]  [Reset to defaults]  [Cancel]  [Save]
```

- The `Layer` toggle controls which file the change writes to.
- The "Effective config source" line shows which file currently drives the effective config.
- "Show current tunables" jumps to Screen 2.
- "Reset to defaults" sets `enforcement = "advisory"` and clears the tunables (project file only, with confirmation prompt).

**Screen 2 — Tunables editor** (reached from Screen 1's "Show current tunables" or by selecting `Custom` mode):

```
Tunables (project):
  Plan tracker
    Required         [✓]
    Protected paths  [edit list ▾]

  Workflow
    Process strike limit   [1]
    Practice strike limit  [2]
    Allow override         [✓]

  Non-interactive
    Mode  [advisory ▾]   (advisory | block)

[Save]  [Cancel]
```

- The `[edit list]` action opens a sub-picker for adding/removing globs.
- Numeric fields are entered via small inline number picker.
- "Save" writes the change via `saveConfig(layer, change)`.

**Provenance badges:** each tunable shows `[from project]` or `[from global]` to indicate which layer currently controls the value. (Computed by `loadConfig` and exposed to the UI.)

### 4.3 First-run behavior

On a fresh install with no TOML files:

- Widget does not appear (advisory mode + no plan).
- User runs `/pipwr_config`.
- Picker shows `enforcement = "advisory"` (the effective default).
- User picks `Strict` and `Global` → extension creates `~/.pi/agent/pipowers.toml` with `enforcement = "strict"` and the strict default tunables.
- Widget appears immediately with `[Mode: STRICT]`.

### 4.4 File-system safety

All config writes:

- Use atomic write (`.tmp` + rename).
- Validate the merged result against the schema before writing. If invalid, abort the write and show a UI error with the validation message.
- On any write error (permission denied, disk full, etc.), the in-memory config is rolled back to the previous state and a UI error is shown.

### 4.5 File watching

`fs.watch` (or `chokidar` if cross-platform reliability issues arise) on `.pi/pipowers.toml`. On change, re-run `loadConfig()` and refresh the widget. Debounced 250ms to coalesce editor saves.

---

## 5. Error Handling

| Scenario | Behavior |
| --- | --- |
| TOML file exists but is malformed | Log error, show one-time UI notice, fall back to defaults. Do not auto-fix. |
| TOML file exists with unknown keys | Log warning, ignore unknown keys, continue. |
| Atomic write fails (permission, disk full) | Roll back in-memory state, show UI error, leave file untouched. |
| `fs.watch` reports a change mid-save | Debounce 250ms. If two saves race, last writer wins. |
| `plan_tracker.init` is called when not in strict mode | No-op for enforcement; the plan_tracker tool still works as before. |
| `plan_tracker` is required but `ctx.hasUI === false` | Fall back to advisory per Section 3 non-interactive default. |
| User runs `/pipwr_config` in non-interactive session | Show a one-time `ui.notify` (if available) with "Config picker requires UI. Edit `~/.pi/agent/pipowers.toml` directly." |
| Process violation UI prompt times out | Default option ("Advance to next phase") is auto-selected. |

---

## 6. Testing

### Unit tests (Vitest)

- **TOML config module:**
  - `loadConfig` with neither file → returns advisory defaults, no disk writes
  - `loadConfig` with global only → returns global values
  - `loadConfig` with project only → returns project values
  - `loadConfig` with both → project wins per leaf
  - `loadConfig` with malformed TOML → returns defaults + emits error log
  - `saveConfig` to non-existent file → creates with just the change
  - `saveConfig` to existing file → deep-merges, preserves unrelated keys
  - `saveConfig` followed by `loadConfig` round-trips
  - `resolveMode("strict")` fills in strict tunables
  - `resolveMode("custom")` uses tunables as-is, fills gaps with advisory defaults

- **Workflow handler:**
  - `isPathProtected` matches globs and isSourceFile heuristic
  - `isPlanTrackerInitialized` starts false, becomes true after first `plan_tracker.init`
  - State survives `setFullState` / `reconstructState` round-trip
  - `handleToolCall` returns `blocked: true` for process violation when processStrikeLimit=1 and strike=0
  - `handleToolCall` does NOT block when processStrikeLimit=999

- **Enforcement classifier:**
  - Process violation during brainstorm write to `src/` → bucket=process (phase-boundary)
  - TDD new-feature write to `src/` while TDD phase=idle and no failing test → bucket=process (TDD)
  - Plan tracker precondition when not init'd → bucket=plan_tracker
  - TDD modifying-tested-code violation (TDD phase=red-pending) → bucket=practice
  - TDD trivial change violation → bucket=practice
  - Debug fix-attempt limit → bucket=practice
  - Verification gate on commit → bucket=practice
  - Read-only tool calls (read, bash with `ls`) → bucket=null

- **Slash command:**
  - Mode picker renders three options
  - Layer toggle starts at "Project", switches to "Global" on toggle
  - Save writes to the correct file path
  - Cancel returns without writing

### Integration tests

- End-to-end: start a session in strict mode, attempt a source write before `plan_tracker.init` → assert hard block + UI prompt + init plan recovery flow.
- End-to-end: start a session in strict mode, attempt a source write during brainstorm phase → assert hard block + advance-to-plan recovery flow.
- Round-trip: write config via `/pipwr_config`, restart session, confirm strict mode is still active.
- File watcher: edit `.pi/pipowers.toml` externally, confirm widget updates within 1s.

### Manual smoke tests

- Fresh install: no config files. Run `/pipwr_config`, pick Strict, confirm global file created and widget shows `[Mode: STRICT]`.
- Hand-edit config: edit `.pi/pipowers.toml` directly, confirm widget reflects the change after debounce.
- Subagent dispatch: dispatch a subagent from a strict session, confirm the subagent session also starts in strict mode (or matches parent's effective config — see Open Question A).

---

## 7. Open Questions

**A. Subagent config inheritance.** When a subagent is dispatched, does it inherit the parent session's effective config, or read its own? Recommendation: inherit (parent wins), so a strict parent session dispatches strict subagents. Implementation: when constructing a subagent, pass the parent's `pipowersConfig` in the dispatch envelope. (Detail deferred to the implementation plan.)

**B. Comment-preserving TOML writes.** Accepted tradeoff in v1: re-serializing a hand-edited file loses comments. If users complain, swap in an AST-based TOML library. (Documented in README; not blocking v1.)

**C. Widget visibility in advisory mode.** v1 hides the widget in advisory mode. If users want a "always show mode badge" option, add `tunables.alwaysShowWidget: boolean` in a later minor. Not in v1.

**D. Picker UX for long `protectedPaths` lists.** The Screen 2 sub-picker for editing globs is a list editor. Reuse the existing `ui.select`/`ui.input` primitives. Detail deferred to the implementation plan.

---

## 8. Out of Scope (Explicit Non-Goals)

- No new workflow phases or changes to the existing `Brainstorm → Plan → Execute → Verify → Review → Finish` order.
- No new skills. The 12 existing skills are unchanged.
- No change to the existing TDD/debug/verification detection logic. The classification changes: TDD new-feature case is reclassified as a process violation; the response (warning vs hard block) changes based on enforcement mode and violation tier.
- No change to the subagent extension other than the config-inheritance question (A) above.
- No new CLI commands beyond `/pipwr_config`.
- No localization of UI strings. English only in v1.

---

## 9. Migration / Upgrade Path

For users of the current `pi-superpowers-plus`:

1. Update pipowers to the new version. The package's `name` field changes; npm/pnpm will install it as a new package.
2. Remove the old `pi-superpowers-plus` entry from `.pi/settings.json` and `~/.pi/agent/config.json` if present. (The legacy detection log line will point this out.)
3. Optional: run `/pipwr_config` to set the new enforcement mode. The default is advisory, matching the previous behavior.
4. State file path changes from `.pi/superpowers-state.json` to `.pi/pipowers-state.json`. The extension reads the new path first and falls back to the old path; new writes go to the new path. Old schema (version 1) is read with `planTracker.initialized` defaulting to `false`. Users can manually delete the old file after confirming the new one is in use.

No data loss. No forced migration. The default behavior is identical to the previous advisory mode.

---

## 10. Summary of Changes

| Area | Change |
| --- | --- |
| `package.json` | Rename to `pipowers`. Update description and keywords. |
| README | Full rewrite under `pipowers` identity, with credits. |
| Banner | Replace `banner-plus.jpg` + `banner.jpg` with single `banner.jpg`. |
| CHANGELOG | Add `v0.5.0` entry covering the rebrand and strict mode. |
| New module | `extensions/pipowers-config.ts` (TOML load/save/resolve). |
| New module | `extensions/pipowers-config-ui.ts` (widget + slash command). |
| New module | `extensions/enforcement-classifier.ts` (bucket decision + strike logic). |
| Extension | `extensions/workflow-monitor.ts` extended with the new enforcement categories and the `/pipwr_config` registration. |
| Extension | `extensions/plan-tracker.ts` extended to track `initialized` state. |
| Extension | `extensions/workflow-monitor/workflow-handler.ts` extended with `isPlanTrackerInitialized` / `setPlanTrackerInitialized` / `isPathProtected`. |
| New dep | `smol-toml` (or equivalent) for TOML parsing/serialization. |
| Test fixtures | New test files for TOML config, classifier, picker. |
| State file path | Rename `.pi/superpowers-state.json` → `.pi/pipowers-state.json`. Read-fallback to old path on upgrade; new writes use new path. Schema version bumped to `2`; add `planTracker.initialized` (old version 1 files read with field defaulting to `false`). |
