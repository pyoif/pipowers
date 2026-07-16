/**
 * Pipowers UI: TUI status widget and /pipwr_config slash command.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionContext, Theme } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { ADVISORY_DEFAULTS, type ConfigLayer, loadConfig, type PipowersConfig, saveConfig } from "./pipowers-config.js";

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
  const planStr =
    tasks.length > 0
      ? ` [Plan: ${tasks.map((t) => (t.status === "complete" ? "✓" : t.status === "in_progress" ? "→" : "○")).join("")}]`
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
    const color = config.enforcement === "advisory" ? "dim" : config.enforcement === "strict" ? "warning" : "success";
    return new Text(theme.fg(color as any, text), 0, 0);
  };
}

export async function pickMode(
  ctx: ExtensionContext,
  current: "advisory" | "strict" | "custom",
): Promise<"advisory" | "strict" | "custom"> {
  const labels = ["Advisory", "Strict", "Custom", "Cancel"];
  const picked = await ctx.ui.select(`Choose enforcement mode (current: ${current})`, labels);
  switch (picked) {
    case "Advisory":
      return "advisory";
    case "Strict":
      return "strict";
    case "Custom":
      return "custom";
    default:
      return current;
  }
}

async function pickLayer(ctx: ExtensionContext, defaultLayer: ConfigLayer): Promise<ConfigLayer> {
  const picked = await ctx.ui.select("Save to which layer?", [
    "Project (.pi/pipowers.toml)",
    "Global (~/.pi/agent/pipowers.toml)",
  ]);
  return picked.startsWith("Project") ? "project" : "global";
}

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
      const next = await ctx.ui.input(
        "Protected paths (comma-separated globs):",
        t.planTracker.protectedPaths.join(", "),
      );
      if (next)
        t.planTracker.protectedPaths = next
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
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

export function registerConfigCommand(
  pi: ExtensionAPI,
  getConfig: () => PipowersConfig | null,
  refreshConfig: () => Promise<void>,
): void {
  pi.registerCommand("pipwr_config", {
    description: "Configure pipowers enforcement mode and tunables",
    async handler(_args, ctx) {
      const current = getConfig()?.enforcement ?? "advisory";
      const layer: ConfigLayer = await pickLayer(ctx, "project");
      const newMode = await pickMode(ctx, current);
      if (newMode === current && layer === "project") {
        ctx.ui.notify?.("No change.");
        return;
      }
      if (newMode === "custom") {
        const tunables = await pickTunables(ctx, getConfig() ?? ADVISORY_DEFAULTS);
        await saveConfig(layer, { enforcement: "custom", tunables });
      } else {
        await saveConfig(layer, { enforcement: newMode });
      }
      await refreshConfig();
      ctx.ui.notify?.(`Config saved (${layer}).`);
    },
  });
}

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
